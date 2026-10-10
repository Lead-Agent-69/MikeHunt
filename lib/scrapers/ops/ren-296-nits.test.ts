/** Ren's #296 review follow-ups: P2-1 payload size + row fallback, P2-2 PII/URL scrubbing, P3-5 bearer. */
import { describe, expect, it } from "vitest";
import {
  MAX_PAYLOAD_BYTES,
  compactPayload,
  deadLetter,
  jsonbTextBytes,
  newRunTelemetry,
  recordError,
  withRunTelemetry,
} from "./run-telemetry";
import { insertWithFallback, writeRunTelemetry } from "./run-log";
import { bearerMatches } from "../../auth/bearer";
import { scrubUrls } from "../../security/scrub-urls";

describe("P2-1: payload fits the jsonb CHECK; one bad row never loses the batch", () => {
  it("measures the jsonb text form (space after ':' and ','), capped at 1800", () => {
    expect(jsonbTextBytes({ a: 1, b: "x" })).toBe(
      Buffer.byteLength('{"a": 1, "b": "x"}'),
    );
    // allow-listed fields only (#314 c), long enough together to exceed the cap
    const wide = Object.fromEntries(
      ["title", "make", "model", "trim", "condition", "damage_type", "engine", "drivetrain",
       "transmission", "fuel_type"].map((k) => [k, "v".repeat(250)]),
    );
    const out = compactPayload(wide)!;
    expect(jsonbTextBytes(out)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    // JSON.stringify alone would have under-counted: the jsonb form is strictly larger.
    expect(jsonbTextBytes(out)).toBeGreaterThan(
      Buffer.byteLength(JSON.stringify(out)),
    );
  });

  it("falls back to row-by-row when the batch is refused", async () => {
    const written: any[] = [];
    const sb: any = {
      from: () => ({
        insert: async (rows: any) => {
          if (Array.isArray(rows))
            return {
              error: { code: "23514", message: "violates check constraint" },
            };
          if (rows.bad)
            return {
              error: { code: "23514", message: "violates check constraint" },
            };
          written.push(rows);
          return { error: null };
        },
      }),
    };
    expect(
      await insertWithFallback(sb, "scraper_dead_letters", [
        { a: 1 },
        { bad: true },
        { c: 3 },
      ]),
    ).toBe(2);
    expect(written).toEqual([{ a: 1 }, { c: 3 }]);
  });

  it("a missing table stops at the batch (pre-migration)", async () => {
    let calls = 0;
    const sb: any = {
      from: () => ({
        insert: async () => {
          calls++;
          return {
            error: {
              code: "42P01",
              message: 'relation "scraper_errors" does not exist',
            },
          };
        },
      }),
    };
    const t = newRunTelemetry("s");
    await withRunTelemetry(t, async () => {
      recordError("parse");
      recordError("timeout");
    });
    expect(await writeRunTelemetry(sb, "run-1", t)).toEqual({
      errors: 0,
      deadLetters: 0,
    });
    expect(calls).toBe(1);
  });
});

describe("P2-2: no seller PII, no query strings, no URLs in messages", () => {
  it("drops seller phone/email/name and strips source_url's query", () => {
    const out = compactPayload({
      make: "Ford",
      seller_phone: "214-555-0100",
      seller_email: "a@b.example",
      seller_name: "Jane Doe",
      contact_phone: "x",
      source_url:
        "https://dallas.craigslist.org/cto/123.html?phone=2145550100&utm=x",
    });
    expect(out).toEqual({
      make: "Ford",
      source_url: "https://dallas.craigslist.org/cto/123.html",
    });
  });

  it("scrubs URLs out of error messages and dead-letter reasons", async () => {
    const t = newRunTelemetry("s");
    await withRunTelemetry(t, async () => {
      recordError("network", {
        message: "fetch failed for https://x.example/a?token=abc",
      });
      deadLetter("db_reject: duplicate key for https://x.example/item?id=9", {
        url: "https://x.example/item?id=9",
      });
    });
    expect(t.samples[0].message).toBe("fetch failed for [url]");
    expect(t.deadLetters[0].reason).toBe("db_reject: duplicate key for [url]");
    expect(t.deadLetters[0].url).toBe("https://x.example/item");
    expect(scrubUrls("see wss://h.example/s and http://a.b/c)")).toBe(
      "see [url] and [url])",
    );
  });
});

describe("P3-5: constant-time bearer compare", () => {
  it("matches only the exact bearer", () => {
    expect(bearerMatches("Bearer s3cret", "s3cret")).toBe(true);
    expect(bearerMatches("Bearer s3creT", "s3cret")).toBe(false);
    expect(bearerMatches("Bearer s3cret ", "s3cret")).toBe(false);
    expect(bearerMatches(null, "s3cret")).toBe(false);
    expect(bearerMatches("Bearer ", "")).toBe(false);
  });
});
