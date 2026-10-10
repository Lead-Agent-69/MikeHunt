import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const card = () =>
  readFileSync("components/discovery/DiscoveryCard.tsx", "utf8");

// Opening tag (up to the first unquoted ">") for every interactive element.
function interactiveTags(src: string): string[] {
  const tags: string[] = [];
  const re = /<(Link|a|button|summary)[\s>]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index + 1;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    tags.push(src.slice(m.index, i + 1));
  }
  return tags;
}

describe("DiscoveryCard tap targets (WCAG 2.5.5, 44px)", () => {
  it("every link, button and disclosure toggle is at least 44px tall", () => {
    const tags = interactiveTags(card());
    expect(tags.length).toBeGreaterThanOrEqual(5);
    for (const tag of tags) {
      expect(tag, tag).toMatch(/\b(min-h-11|h-11)\b/);
    }
  });

  it("links get a flex box so min-height applies to the inline element", () => {
    for (const tag of interactiveTags(card()).filter((t) =>
      /^<(Link|a)[\s>]/.test(t),
    )) {
      expect(tag, tag).toMatch(/\binline-flex\b/);
      expect(tag, tag).toMatch(/\bitems-center\b/);
    }
  });
});
