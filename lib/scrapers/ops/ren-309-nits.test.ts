/**
 * Ren's #309 review follow-ups, one planted case per nit:
 * P2-1 raw_snippet scrub, P2-2 isContactKey, P3-4 NUL/surrogates + short-insert log,
 * P3-5 scrubber coverage, P3-6 hashed bearer + scrape-gate. (P2-3 / P7 are SQL: see
 * scripts/db/selfcheck-206000-plants.sh.)
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const tse = vi.hoisted(() => ({ calls: [] as Array<[number, number]> }));
vi.mock("crypto", async (orig) => {
  const real = (await orig()) as typeof import("crypto");
  return {
    ...real,
    default: real,
    timingSafeEqual: (a: Buffer, b: Buffer) => {
      tse.calls.push([a.length, b.length]);
      return real.timingSafeEqual(a, b);
    },
  };
});

import { NextRequest } from "next/server";
import { compactPayload, isContactKey, newRunTelemetry, withRunTelemetry } from "./run-telemetry";
import { insertWithFallback, sanitizeForPostgres, writeRunTelemetry } from "./run-log";
import { parseWithTelemetry } from "../engine";
import { bearerMatches } from "../../auth/bearer";
import { hasScrapeSecret } from "../../auth/scrape-gate";
import { scrubContact, scrubUrls } from "../../security/scrub-urls";

describe("P2-1: raw_snippet is scrubbed of phones, emails and URLs (engine parse dead letter)", () => {
  it("parseWithTelemetry stores a scrubbed snippet", async () => {
    const html =
      '<div class="seller">Call Bob at (214) 555-0100 or +44 20 7946 0958, bob.smith@gmail.com, ' +
      '<a href="https://dealer.example/inv?id=7&phone=2145550100">see</a> www.bobs-cars.com/x</div>' +
      "<p>2015 Ford F-150, 123456 miles, $12,500, ZIP 75201, VIN 1FTFW1EF5FFA12345</p>";
    const t = newRunTelemetry("s");
    await withRunTelemetry(t, async () => {
      await expect(
        parseWithTelemetry(
          async () => {
            throw new Error("selector .price not found");
          },
          html,
          "https://dealer.example/inv?id=7",
        ),
      ).rejects.toThrow();
    });
    const snip = t.deadLetters[0].rawSnippet!;
    expect(snip).not.toMatch(/555-0100|7946|gmail|dealer\.example|bobs-cars|2145550100/);
    expect(snip).toContain("[phone]");
    expect(snip).toContain("[email]");
    expect(snip).toContain("[url]");
    // vehicle facts survive
    for (const keep of ["2015 Ford F-150", "123456 miles", "$12,500", "75201", "1FTFW1EF5FFA12345"])
      expect(snip).toContain(keep);
  });
});

describe("P2-2: isContactKey drops contact keys from the payload", () => {
  const contact = [
    "contact", "seller_contact", "contact_info", "mobile", "whatsapp", "seller_tel", "cell",
    "e_mail", "eMail", "owner", "owner_name", "ownerName", "seller", "seller_name", "sellerPhone",
    "phone_number", "tel", "fax", "seller_email", "contactEmail", "street_address", "first_name",
    "SELLER_MOBILE", "whatsapp_link",
  ];
  const keep = [
    "make", "model", "model_name", "title", "year", "price", "mileage", "vin", "dealer_name",
    "source_url", "one_owner", "owner_count", "city", "state", "zip", "cellular_modem",
  ];
  it.each(contact)("%s is a contact key", (k) => expect(isContactKey(k)).toBe(true));
  it.each(keep)("%s is kept", (k) => expect(isContactKey(k)).toBe(false));

  it("compactPayload drops them and scrubs contact data hidden in other string values", () => {
    const out = compactPayload({
      make: "Ford",
      title: "F-150 call 214-555-0100 or bob@x.com",
      contact: "Bob",
      seller_contact: "214-555-0100",
      contact_info: { phone: "1" },
      mobile: "2145550100",
      whatsapp: "+12145550100",
      seller_tel: "214",
      cell: "214",
      e_mail: "bob@x.com",
      owner: "Bob",
      one_owner: true,
    })!;
    expect(out).toEqual({ make: "Ford", title: "F-150 call [phone] or [email]", one_owner: true });
  });
});

describe("P3-4: NUL and lone surrogates are stripped; short inserts are logged", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sanitizeForPostgres strips \\u0000 and lone surrogates, keeps real pairs, recurses", () => {
    const dirty = {
      message: "a\u0000b\uD83Dc",
      payload: { t: "x\uDE00y", ok: "car \uD83D\uDE97", n: 3, list: ["\u0000z"] },
      ["k\u0000"]: "v",
    };
    expect(sanitizeForPostgres(dirty)).toEqual({
      message: "abc",
      payload: { t: "xy", ok: "car \uD83D\uDE97", n: 3, list: ["z"] },
      k: "v",
    });
  });

  it("insertWithFallback sends sanitized rows", async () => {
    const sent: any[] = [];
    const sb: any = { from: () => ({ insert: async (rows: any) => (sent.push(rows), { error: null }) }) };
    await insertWithFallback(sb, "scraper_errors", [{ message: "x\u0000\uD800" }]);
    expect(sent[0]).toEqual([{ message: "x" }]);
    expect(JSON.stringify(sent[0])).not.toMatch(/\\u0000|\\ud800/i);
  });

  it("writeRunTelemetry warns when it wrote fewer rows than it sent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sb: any = {
      from: (table: string) => ({
        insert: async (rows: any) =>
          Array.isArray(rows)
            ? { error: { code: "23514", message: "check" } }
            : rows.reason === "bad"
              ? { error: { code: "23514", message: "check" } }
              : { error: null },
      }),
    };
    const t = newRunTelemetry("craigslist");
    t.deadLetters.push(
      { reason: "ok", url: null, rawSnippet: null, payload: null, at: new Date().toISOString() },
      { reason: "bad", url: null, rawSnippet: null, payload: null, at: new Date().toISOString() },
    );
    const out = await writeRunTelemetry(sb, "run-1", t);
    expect(out.deadLetters).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("1/2 dead letters");

    warn.mockClear();
    const okSb: any = { from: () => ({ insert: async () => ({ error: null }) }) };
    await writeRunTelemetry(okSb, "run-1", t);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("P3-5: scrubber coverage", () => {
  const cases: Array<[string, string]> = [
    ["get ftp://files.example.com/a.csv?key=1 now", "get [url] now"],
    ["db postgres://user:pw@db.example.com:5432/app refused", "db [url] refused"],
    ["redis rediss://:hunter2@cache.example:6380/0", "redis [url]"],
    ["go www.dealer.com/inv?id=3.", "go [url]."],
    ["img //cdn.example.com/a.jpg?sig=z here", "img [url] here"],
    ["(https://a.example/c?t=1)", "([url])"],
    ["'https://a.example/c?t=1'", "'[url]'"],
    ["x https://a.example/it's?tok=9 y", "x [url] y"],
    ["x https://a.example/p_(foo)?tok=9 y", "x [url] y"],
    ["https://a.example/x), then", "[url]), then"],
  ];
  it.each(cases)("%s", (input, want) => expect(scrubUrls(input)).toBe(want));

  it("leaves non-URLs alone", () => {
    for (const s of ["a // b comment", "ratio 3/4 and 1//2", "price 12,500 2015 75201", "e.g. file.ts:30"])
      expect(scrubUrls(s)).toBe(s);
  });

  it("nothing secret survives in any case", () => {
    for (const [input] of cases) expect(scrubContact(input)).not.toMatch(/key=|pw@|hunter2|sig=|tok=|t=1/);
  });
});

describe("P3-6: hashed constant-time bearer, scrape-gate uses it", () => {
  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
    tse.calls.length = 0;
  });

  it("compares two 32-byte digests even when lengths differ (no length short-circuit)", () => {
    expect(bearerMatches("Bearer s3cret", "s3cret")).toBe(true);
    expect(bearerMatches("Bearer x", "a-much-longer-secret-value")).toBe(false);
    expect(bearerMatches("Bearer s3cret ", "s3cret")).toBe(false);
    expect(tse.calls).toEqual([
      [32, 32],
      [32, 32],
      [32, 32],
    ]);
    expect(bearerMatches(null, "s")).toBe(false);
    expect(bearerMatches("Bearer ", "")).toBe(false);
  });

  const req = (auth?: string) =>
    new NextRequest("http://localhost/api/scrape", { headers: auth ? { authorization: auth } : {} });

  it("hasScrapeSecret goes through bearerMatches for SCRAPE_SECRET and CRON_SECRET", () => {
    process.env.SCRAPE_SECRET = "scrape-s";
    delete process.env.CRON_SECRET;
    expect(hasScrapeSecret(req("Bearer scrape-s"))).toBe(true);
    expect(hasScrapeSecret(req("Bearer scrape-x"))).toBe(false);
    expect(hasScrapeSecret(req())).toBe(false);
    expect(tse.calls.length).toBe(2);

    delete process.env.SCRAPE_SECRET;
    process.env.CRON_SECRET = "cron-s";
    expect(hasScrapeSecret(req("Bearer cron-s"))).toBe(true);
    expect(hasScrapeSecret(req("Bearer cron-s2"))).toBe(false);

    delete process.env.CRON_SECRET;
    expect(hasScrapeSecret(req("Bearer "))).toBe(false); // fails closed with no secret
  });
});
