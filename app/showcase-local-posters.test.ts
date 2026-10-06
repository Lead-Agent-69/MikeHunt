import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("/showcase loads no third-party images", () => {
  const page = readFileSync("app/(marketing)/showcase/page.tsx", "utf8");

  it("has no Unsplash or other remote image URLs", () => {
    expect(page).not.toContain("unsplash.com");
    expect(page).not.toMatch(/image:\s*"https?:\/\//);
  });

  it("uses the local neutral placeholder poster", () => {
    expect(page).toContain('const POSTER = "/images/car-placeholder.jpg";');
    expect(existsSync("public/images/car-placeholder.jpg")).toBe(true);
  });
});
