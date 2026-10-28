import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";
import { expect, it } from "vitest";
import { authNeedsSignIn } from "./session-recovery";
it("recognizes the actual SDK missing-session error and expired/revoked sessions", () => {
  expect(authNeedsSignIn(new AuthSessionMissingError())).toBe(true);
  for (const status of [401, 403])
    expect(
      authNeedsSignIn(new AuthApiError("expired", status, undefined)),
    ).toBe(true);
  for (const code of [
    "session_not_found",
    "refresh_token_not_found",
    "refresh_token_already_used",
  ])
    expect(authNeedsSignIn(new AuthApiError("expired", 400, code))).toBe(true);
});
it("does not mislabel network failures, rate limits or service outages as signed out", () => {
  for (const error of [
    null,
    new Error("offline"),
    new AuthApiError("rate limited", 429, undefined),
    new AuthApiError("unavailable", 503, undefined),
    { status: 401 },
  ])
    expect(authNeedsSignIn(error)).toBe(false);
});
