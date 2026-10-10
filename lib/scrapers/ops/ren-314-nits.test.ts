/**
 * Ren's #314 non-blocking nits, one planted case each:
 * (a) scrub-then-cut / no partial tail, (b) wider phone shapes with VIN/ZIP/price/year/mileage
 * negatives kept, (c) payload allow-list, (f) source-path schemes survive the URL scrubber.
 * (d) security_invoker tr/tru/ye: skipped (would need a migration only for that; Ren: optional).
 */
import { describe, expect, it } from "vitest";
import {
  MAX_SNIPPET_BYTES,
  PAYLOAD_FIELDS,
  compactPayload,
  cutAtToken,
  deadLetter,
  dropPartialTail,
  newRunTelemetry,
  withRunTelemetry,
} from "./run-telemetry";
import { scrubContact, scrubPhones, scrubUrls } from "../../security/scrub-urls";

const FRAGMENTS = /555|123-4|bob\.smith|@g\b/;

describe("(a) scrub before cutting; never store a partial token at a cut", () => {
  it.each([
    ["(555) 123-4", 600],
    ["(555) 123-4", 300],
    ["bob.smith@g", 600],
    ["bob.smith@g", 300],
  ])("compactPayload: %s cut at %i is not stored", (frag, at) => {
    const full = frag.startsWith("(") ? "(555) 123-4567" : "bob.smith@gmail.com";
    // place the value so the cut at `at` lands right after `frag`
    const pad = "y ".repeat(Math.ceil(at / 2)).slice(0, at - frag.length - 1);
    const title = `${pad} ${full} and more text after`;
    expect(title.slice(0, at).endsWith(frag)).toBe(true);
    const out = compactPayload({ title, make: "Ford" })!;
    expect(String(out.title)).not.toMatch(FRAGMENTS);
    expect(out.make).toBe("Ford");
  });

  it.each([
    ["(555) 123-4", 16_384],
    ["bob.smith@g", 16_384],
    ["(555) 123-4", MAX_SNIPPET_BYTES],
    ["bob.smith@g", MAX_SNIPPET_BYTES],
  ])("rawSnippet: %s cut at %i is not stored", async (frag, at) => {
    const full = frag.startsWith("(") ? "(555) 123-4567" : "bob.smith@gmail.com";
    // for the 2KB cap, the cut is after scrubbing, so put the fragment where the *scrubbed* text ends
    const pad = "<p>ok</p> ".repeat(Math.ceil(at / 10)).slice(0, at - frag.length - 1);
    const raw = `${pad} ${full} </p>${"<i>tail</i>".repeat(50)}`;
    const t = newRunTelemetry("s");
    await withRunTelemetry(t, async () => deadLetter("parse: x", { raw }));
    const snip = t.deadLetters[0].rawSnippet!;
    expect(snip).not.toMatch(FRAGMENTS);
    expect(Buffer.byteLength(snip)).toBeLessThanOrEqual(MAX_SNIPPET_BYTES);
  });

  it("dropPartialTail keeps clean text and single plain words", () => {
    expect(dropPartialTail("Call me at (555) 123-4")).toBe("Call me at");
    expect(dropPartialTail("write bob.smith@g")).toBe("write");
    expect(dropPartialTail("bob.smith@g")).toBe("");
    expect(dropPartialTail("Ford F-150 XL")).toBe("Ford F-150");
    expect(dropPartialTail("price $12,500 and")).toBe("price $12,500");
    expect(dropPartialTail("yyyyyy")).toBe("yyyyyy");
    expect(cutAtToken("short", 300)).toBe("short");
  });
});

describe("(b) phone shapes", () => {
  const phones = [
    "555-123-4567x22",
    "555-123-4567 ext. 22",
    "555\u2013123\u20134567",
    "555\u2014123\u20144567",
    "555/123-4567",
    "+44 (0)20 7946 0958",
    "+44 20 7946 0958",
    "020 7946 0958",
    "0161 496 0000",
    "0049 30 123456",
    "00 49 30 1234567",
    "555-1234",
    "555.1234",
    "(214) 555-0100",
    "214.555.0100",
    "1-800-555-0100",
    "2145550100",
    "+1 214 555 0100",
    "+12145550100",
  ];
  it.each(phones)("scrubs %s", (p) => {
    const out = scrubPhones(`call ${p} today`);
    expect(out).toBe("call [phone] today");
  });

  const negatives = [
    "VIN 1HGCM82633A004352",
    "1FTFW1EF5FFA12345",
    "ZIP 75201",
    "75201-1234",
    "$12,500",
    "$12500",
    "12,500",
    "2015",
    "2015-2018",
    "2015\u20132018",
    "123,456 miles",
    "123456 miles",
    "miles 123456 2015",
    "Ford F-150 2015",
    "2019 Ram 1500 2500 3500",
    "price 12,500 year 2015 miles 123456 zip 75201",
    "05/12/2015",
    "10-12-2015",
    "lot 12345678",
    "3.5L V6, 1/2 ton, 4x4",
    "2014 Honda Accord 98,000 mi $8,995",
  ];
  it.each(negatives)("leaves %s alone", (n) => expect(scrubContact(n)).toBe(n));
});

describe("(c) payload allow-list", () => {
  const dropped = [
    "name", "username", "user_name", "seller_handle", "seller_username", "poster", "posted_by",
    "display_name", "nickname", "author", "listed_by", "seller_profile", "dealer_profile",
    "profile_url", "seller_url", "address1", "addr", "messenger", "telegram", "wechat", "line_id",
    "whats_app",
  ];
  it.each(dropped)("%s is dropped", (k) => {
    expect(PAYLOAD_FIELDS.has(k)).toBe(false);
    const out = compactPayload({ [k]: "bob", make: "Ford" })!;
    expect(out).toEqual({ make: "Ford" });
  });

  it.each(["one_owner", "owner_count", "model_name", "dealer_name"])("%s is kept", (k) => {
    expect(PAYLOAD_FIELDS.has(k)).toBe(true);
    const v = k === "one_owner" ? true : k === "owner_count" ? 2 : "Big Al's";
    expect(compactPayload({ [k]: v })).toEqual({ [k]: v });
  });

  it("unknown fields never pass, even innocuous-looking ones", () => {
    expect(compactPayload({ some_new_field: "x", title: "2015 Ford F-150" })).toEqual({
      title: "2015 Ford F-150",
    });
  });
});

describe("(f) source-path schemes survive the URL scrubber", () => {
  it.each([
    "at handler (file:///app/.next/server/chunks/123.js:4:17)",
    "at webpack-internal:///(rsc)/./lib/scrapers/engine.ts:367:5",
    "at webpack:///./lib/x.ts:10:2",
    "at app:///_next/static/chunks/main.js:1:200",
    "at node:///internal/process/task_queues:95:5",
  ])("%s", (line) => expect(scrubUrls(line)).toBe(line));

  it("still scrubs real URLs on the same line", () => {
    expect(
      scrubUrls("fetch https://x.example/a?t=1 at file:///app/chunks/1.js:2:3 via app://host.example/x"),
    ).toBe("fetch [url] at file:///app/chunks/1.js:2:3 via [url]");
  });
});
