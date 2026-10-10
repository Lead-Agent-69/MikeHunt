import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  PIXEL_GIF,
  isDeliveryId,
  openPixelHtml,
  resolveClickDestination,
  trackingUrls,
} from "@/lib/alerts/delivery-tracking";
import { verifySvixSignature } from "@/lib/alerts/svix-verify";

const ID = "3f2c8a1e-4b5d-4c6e-9f70-123456789abc";
const DEAL = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

describe("tracking URLs", () => {
  it("carry only the opaque delivery id", () => {
    const u = trackingUrls(ID, "https://mikehunt.app");
    expect(u.pixelUrl).toBe(`https://mikehunt.app/api/t/o/${ID}`);
    expect(u.clickUrl).toBe(`https://mikehunt.app/api/t/c/${ID}`);
    expect(u.receiptUrl).toBe(`https://mikehunt.app/api/t/d/${ID}`);
    for (const url of Object.values(u)) {
      expect(url).not.toMatch(/@|%40|email|user/i);
      expect(url).not.toContain("?");
    }
  });

  it("pixel is an invisible, alt-less 1x1 image", () => {
    const html = openPixelHtml("https://x/api/t/o/" + ID);
    expect(html).toContain('width="1"');
    expect(html).toContain('alt=""');
  });

  it("PIXEL_GIF is a GIF", () => {
    expect(Buffer.from(PIXEL_GIF.slice(0, 6)).toString("latin1")).toBe(
      "GIF89a",
    );
  });

  it("validates delivery ids", () => {
    expect(isDeliveryId(ID)).toBe(true);
    expect(isDeliveryId("someone@example.com")).toBe(false);
    expect(isDeliveryId("../../etc")).toBe(false);
    expect(isDeliveryId(undefined)).toBe(false);
  });
});

describe("click destination (no open redirect)", () => {
  it("defaults to our own deal page", () => {
    expect(
      resolveClickDestination({ click_target: "deal", deal_id: DEAL }),
    ).toBe(`/deal/${DEAL}`);
  });

  it("uses the stored listing URL only for listing targets and only http(s)", () => {
    expect(
      resolveClickDestination(
        { click_target: "listing", deal_id: DEAL },
        "https://dealer.example/car/1",
      ),
    ).toBe("https://dealer.example/car/1");
    expect(
      resolveClickDestination(
        { click_target: "listing", deal_id: DEAL },
        "javascript:alert(1)",
      ),
    ).toBe(`/deal/${DEAL}`);
    expect(
      resolveClickDestination(
        { click_target: "deal", deal_id: DEAL },
        "https://evil.example",
      ),
    ).toBe(`/deal/${DEAL}`);
  });

  it("never builds a path from a non-UUID deal id", () => {
    expect(
      resolveClickDestination({
        click_target: "deal",
        deal_id: "//evil.example",
      }),
    ).toBe("/alerts");
    expect(resolveClickDestination(null)).toBe("/alerts");
  });

  it("the click route never reads a destination from the request", () => {
    const src = readFileSync("app/api/t/c/[id]/route.ts", "utf8");
    expect(src).not.toMatch(/searchParams|nextUrl\.search|\.json\(\)/);
    expect(src).toContain("resolveClickDestination(row, listingUrl)");
  });
});

describe("svix signature (Resend webhook)", () => {
  const key = Buffer.from("supersecretkey-0123456789");
  const secret = "whsec_" + key.toString("base64");
  const body = JSON.stringify({
    type: "email.delivered",
    data: { email_id: "e1" },
  });
  const now = 1_760_000_000;
  const sign = (id: string, ts: number, b: string) =>
    "v1," +
    createHmac("sha256", key).update(`${id}.${ts}.${b}`).digest("base64");

  it("accepts a valid signature", () => {
    expect(
      verifySvixSignature({
        secret,
        id: "msg_1",
        timestamp: String(now),
        signature: `v1,bogus ${sign("msg_1", now, body)}`,
        body,
        nowSec: now,
      }),
    ).toBe(true);
  });

  it("rejects tampering, replays, and a missing secret", () => {
    const sig = sign("msg_1", now, body);
    const base = {
      id: "msg_1",
      timestamp: String(now),
      signature: sig,
      nowSec: now,
    };
    expect(verifySvixSignature({ ...base, secret, body: body + " " })).toBe(
      false,
    );
    expect(
      verifySvixSignature({ ...base, secret, body, nowSec: now + 3600 }),
    ).toBe(false);
    expect(verifySvixSignature({ ...base, secret: "", body })).toBe(false);
    expect(
      verifySvixSignature({ ...base, secret, body, signature: null }),
    ).toBe(false);
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("migration is service-role only", () => {
    const sql = read("supabase/migrations/20261010147000_alert_deliveries.sql");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain(
      "REVOKE ALL ON public.alert_deliveries FROM anon, authenticated",
    );
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/\bemail\b\s+TEXT/i);
  });

  it("saved-search email and SMS sends are tracked", () => {
    const src = read("lib/scrapers/pipeline.ts");
    expect(src).toContain('kind: "saved_search_match"');
    expect(src).toContain('channel: "email"');
    expect(src).toContain('channel: "sms"');
    expect(src).toContain("pixelUrl: tracked?.pixelUrl");
  });

  it("push is tracked per device and the SW posts a receipt", () => {
    expect(read("lib/notifications/push.ts")).toContain('channel: "push"');
    expect(read("lib/alerts/alert-engine.ts")).toContain('kind: "alert_match"');
    expect(read("lib/scrapers/tools/alerts.ts")).toContain(
      'kind: "price_drop"',
    );
    const sw = read("public/sw.js");
    expect(sw).toContain("'/api/t/d/' + payload.deliveryId");
  });

  it("price-drop links use the real /deal route", () => {
    expect(read("lib/scrapers/tools/alerts.ts")).not.toContain(
      "/deals/${alert.dealId}",
    );
  });

  it("tracking endpoints stay out of the signed-in-only route list", () => {
    const proxy = read("proxy.ts");
    expect(proxy).not.toContain('"/api/t"');
  });
});
