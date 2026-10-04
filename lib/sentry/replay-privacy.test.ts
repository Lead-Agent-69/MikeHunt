import { describe, expect, it } from "vitest";
import { replayPrivacy } from "./replay-privacy";

describe("sentry replay privacy", () => {
  it("masks text and blocks media", () => {
    expect(replayPrivacy).toEqual({ maskAllText: true, blockAllMedia: true });
  });
});
