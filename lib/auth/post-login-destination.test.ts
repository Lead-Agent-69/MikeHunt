import { describe, expect, it } from "vitest";
import { postLoginDestination } from "./post-login-destination";

describe("post-login destination", () => {
  it("requires setup before a new account's intended vehicle", () => {
    expect(postLoginDestination(false, "/deal/123?tab=evidence")).toBe(
      "/onboarding?next=%2Fdeal%2F123%3Ftab%3Devidence",
    );
  });
  it("keeps returning users on their intended destination", () => {
    expect(postLoginDestination(true, "/deal/123")).toBe("/deal/123");
    expect(postLoginDestination(true, "/onboarding")).toBe("/discover");
  });
  it("does not nest setup or redirect outside the app", () => {
    expect(postLoginDestination(false, "/onboarding")).toBe("/onboarding");
    expect(postLoginDestination(false, "//evil.example")).toBe("/onboarding");
  });
});
