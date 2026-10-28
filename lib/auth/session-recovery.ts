import { isAuthError, isAuthSessionMissingError } from "@supabase/supabase-js";

/** Missing/expired sessions need sign-in; transport/rate-limit/service errors need retry. */
export function authNeedsSignIn(error: unknown): boolean {
  return (
    isAuthSessionMissingError(error) ||
    (isAuthError(error) &&
      (error.status === 401 ||
        error.status === 403 ||
        [
          "session_not_found",
          "refresh_token_not_found",
          "refresh_token_already_used",
        ].includes(error.code || "")))
  );
}
