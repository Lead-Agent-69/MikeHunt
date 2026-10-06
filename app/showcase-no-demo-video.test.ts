import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("/showcase has no third-party demo video", () => {
  it("does not load the w3schools sample clip or any .mp4", () => {
    const page = readFileSync("app/(marketing)/showcase/page.tsx", "utf8");
    expect(page).not.toContain("w3schools");
    expect(page).not.toMatch(/\.mp4/);
  });

  it("the video deck falls back to the poster image when an item has no video", () => {
    const deck = readFileSync("components/ui/video-deck-carousel.tsx", "utf8");
    expect(deck).toContain("video?: string;");
    expect(deck).toContain("{activeItem.video ? (");
    expect(deck).toContain("{activeItem.video && (");
  });
});
