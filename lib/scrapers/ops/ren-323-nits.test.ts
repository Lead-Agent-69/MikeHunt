/**
 * Ren's #323 nits: (f) only host-less source paths survive the URL scrubber, minus ?/#; and the
 * partial-trailing-token drop is capped (~64 chars) so minified HTML keeps its 2KB snippet.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_PARTIAL_DROP,
  MAX_SNIPPET_BYTES,
  deadLetter,
  dropPartialTail,
  newRunTelemetry,
  withRunTelemetry,
} from "./run-telemetry";
import { scrubContact, scrubUrls } from "../../security/scrub-urls";

describe("(f) source-path schemes: empty authority only, query/fragment stripped", () => {
  it.each([
    ["at (file:///app/.next/server/chunks/1.js:4:17)", "at (file:///app/.next/server/chunks/1.js:4:17)"],
    ["at file:///app/chunks/1.js?t=SECRET", "at file:///app/chunks/1.js"],
    ["at (file:///app/chunks/1.js?t=SECRET)", "at (file:///app/chunks/1.js)"],
    ["at webpack-internal:///(rsc)/./lib/x.ts?t=SECRET#frag", "at webpack-internal:///(rsc)/./lib/x.ts"],
    ["at app:///_next/static/a.js#t=SECRET", "at app:///_next/static/a.js"],
    ["at webpack:///./lib/x.ts?abcd:10:2", "at webpack:///./lib/x.ts:10:2"],
  ])("keeps %s as %s", (input, want) => expect(scrubUrls(input)).toBe(want));

  it.each([
    "x file://evil.com/c?e=bob%40gmail.com y",
    "x rsc://attacker.com/steal?t=SECRET y",
    "x webpack-internal://attacker.com/a?t=SECRET y",
    "x app://host.example/x?t=SECRET y",
    "x node://evil.example/?t=SECRET y",
    "x turbopack://evil.example/p#t=SECRET y",
  ])("scrubs hosted form %s", (input) => {
    const out = scrubUrls(input);
    expect(out).toBe("x [url] y");
    expect(out).not.toMatch(/SECRET|evil|attacker|host\.example|bob/);
  });

  it("nothing after ? or # survives anywhere", () => {
    const line =
      "fetch https://a.example/?t=SECRET at file:///app/1.js?t=SECRET:1:2 via rsc://attacker.com/?t=SECRET";
    expect(scrubContact(line)).not.toMatch(/SECRET|attacker/);
    expect(scrubContact(line)).toContain("file:///app/1.js");
  });
});

describe("(#327) only a trailing :line(:col) comes back from a stripped query", () => {
  it.each([
    ["webpack:///./lib/x.ts?abcd:10:2", "webpack:///./lib/x.ts:10:2"],
    ["webpack:///x.ts?t=SECRET:10", "webpack:///x.ts:10"],
    ["webpack:///x.ts?e=bob%40g.com:1:2", "webpack:///x.ts:1:2"],
    ["at (file:///app/1.js?t=SECRET:4:17)", "at (file:///app/1.js:4:17)"],
    ["webpack-internal:///./a.ts#t=SECRET:9999999:1", "webpack-internal:///./a.ts:9999999:1"],
  ])("%s -> %s", (input, want) => {
    const out = scrubUrls(input);
    expect(out).toBe(want);
    expect(out).not.toMatch(/SECRET|bob|%40|abcd|t=|e=/);
  });

  it.each([
    ["webpack:///x.ts?:5551234567", "webpack:///x.ts"], // 10 digits: a phone, not a line
    ["webpack:///x.ts?:12345678:1", "webpack:///x.ts"], // 8-digit line
    ["webpack:///x.ts?x:12345678:9", "webpack:///x.ts"], // :9 glued to other digits
    ["webpack:///x.ts#f:1:2:3", "webpack:///x.ts"], // three parts is not line:col
    ["webpack:///x.ts?t=SECRET:10x", "webpack:///x.ts"], // not at the very end
  ])("%s restores nothing", (input, want) => {
    const out = scrubUrls(input);
    expect(out).toBe(want);
    expect(out).not.toMatch(/555|SECRET|12345678/);
  });

  it.each([
    "x webpack://attacker.com/x.ts?t=SECRET:10:2 y",
    "x file://evil.com/c?e=bob%40gmail.com:1:2 y",
    "x rsc://attacker.com/a?t=1:10 y",
  ])("hosted form %s is still [url]", (input) => expect(scrubUrls(input)).toBe("x [url] y"));
});

describe("partial-tail drop is capped at ~64 chars", () => {
  it("a long unbroken run loses only the last MAX_PARTIAL_DROP chars", () => {
    const run = "<div><span>ok</span></div>".repeat(40) + "<p>bob.smith@g";
    const out = dropPartialTail(run);
    expect(out.length).toBe(run.length - MAX_PARTIAL_DROP);
    expect(out).not.toMatch(/bob|smith|@g/);
  });

  it("a phone fragment at the end of a minified run is dropped too", () => {
    const run = "<td>x</td>".repeat(30) + "<td>(555)123-4";
    expect(dropPartialTail(run)).not.toMatch(/555|123-4/);
  });

  it("short partial tokens are still dropped whole", () => {
    expect(dropPartialTail("Call me at (555) 123-4")).toBe("Call me at");
    expect(dropPartialTail("write bob.smith@g")).toBe("write");
  });

  it("minified HTML: the 2KB snippet keeps >1,900 chars and no contact fragments", async () => {
    // No whitespace at all, contacts sprinkled through, longer than both cuts.
    const cell = (i: number) =>
      i % 7 === 0
        ? `<td>(555)123-${String(4000 + i).slice(-4)}</td>`
        : i % 11 === 0
          ? `<td><a>seller${i}.smith@gmail.com</a></td>`
          : i % 13 === 0
            ? `<td><a>https://dealer.example/inv?id=${i}&ph=5551234567</a></td>`
            : `<td>2015-Ford-F-150-XLT-${i}</td>`;
    const raw = Array.from({ length: 1200 }, (_, i) => cell(i)).join("");
    expect(raw.length).toBeGreaterThan(16_384);
    expect(raw).not.toMatch(/\s/);
    const t = newRunTelemetry("s");
    await withRunTelemetry(t, async () => deadLetter("parse: x", { raw }));
    const snip = t.deadLetters[0].rawSnippet!;
    expect(snip.length).toBeGreaterThan(1900);
    expect(Buffer.byteLength(snip)).toBeLessThanOrEqual(MAX_SNIPPET_BYTES);
    expect(snip).not.toMatch(/555|gmail|smith@|@g|dealer\.example|ph=/);
    expect(snip).toContain("[phone]");
    expect(snip).toContain("[email]");
    expect(snip).toContain("[url]");
  });
});
