// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ID = "3f2c8a1e-4b5d-4c6e-9f70-123456789abc";
const DEAL = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

const db = vi.hoisted(() => ({
  row: null as any,
  deal: null as any,
  rpc: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    rpc: db.rpc,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "deals" ? db.deal : db.row,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

import { GET as click } from "./c/[id]/route";
import { GET as pixel } from "./o/[id]/route";
import { POST as receipt } from "./d/[id]/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  db.row = null;
  db.deal = null;
  db.rpc.mockClear();
});

describe("click redirect", () => {
  it("goes to our deal page and records the click", async () => {
    db.row = { id: ID, deal_id: DEAL, click_target: "deal" };
    const res = await click(
      new NextRequest(
        `https://mikehunt.app/api/t/c/${ID}?url=https://evil.example`,
      ),
      params(ID),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `https://mikehunt.app/deal/${DEAL}`,
    );
    expect(db.rpc).toHaveBeenCalledWith("alert_delivery_event", {
      p_id: ID,
      p_event: "clicked",
    });
  });

  it("goes to the stored listing URL for listing targets", async () => {
    db.row = { id: ID, deal_id: DEAL, click_target: "listing" };
    db.deal = { source_url: "https://dealer.example/car/9" };
    const res = await click(
      new NextRequest(`https://mikehunt.app/api/t/c/${ID}`),
      params(ID),
    );
    expect(res.headers.get("location")).toBe("https://dealer.example/car/9");
  });

  it("unknown or malformed ids land on /alerts without touching the DB", async () => {
    const res = await click(
      new NextRequest("https://mikehunt.app/api/t/c/https:%2F%2Fevil.example"),
      params("https://evil.example"),
    );
    expect(res.headers.get("location")).toBe("https://mikehunt.app/alerts");
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("open pixel and push receipt", () => {
  it("pixel always returns an uncached GIF", async () => {
    const res = await pixel(
      new NextRequest(`https://x/api/t/o/${ID}`),
      params(ID),
    );
    expect(res.headers.get("content-type")).toBe("image/gif");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(db.rpc).toHaveBeenCalledWith("alert_delivery_event", {
      p_id: ID,
      p_event: "opened",
    });
    const bad = await pixel(
      new NextRequest("https://x/api/t/o/nope"),
      params("nope"),
    );
    expect(bad.status).toBe(200);
  });

  it("receipt marks delivered and returns 204", async () => {
    const res = await receipt(
      new NextRequest(`https://x/api/t/d/${ID}`, { method: "POST" }),
      params(ID),
    );
    expect(res.status).toBe(204);
    expect(db.rpc).toHaveBeenCalledWith("alert_delivery_event", {
      p_id: ID,
      p_event: "delivered",
    });
  });
});
