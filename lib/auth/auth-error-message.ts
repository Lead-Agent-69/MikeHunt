/** Converts provider errors into concise, actionable customer-facing copy. */
export function authErrorMessage(
  error: string | null | undefined,
  fallback = "We couldn't complete that request. Please try again.",
): string {
  const message = error?.toLowerCase() ?? "";

  if (message.includes("invalid login credentials")) {
    return "That email or password does not match. Try again or reset your password.";
  }
  if (message.includes("email not confirmed")) {
    return "Confirm your email, then sign in.";
  }
  if (
    message.includes("already registered") ||
    message.includes("already exists")
  ) {
    return "An account already exists for this email. Sign in instead.";
  }
  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("security purposes")
  ) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (message.includes("password should be") || message.includes("password")) {
    return "Choose a stronger password and try again.";
  }

  return fallback;
}

export function authCallbackMessage(
  error: string | null | undefined,
): string | null {
  switch (error) {
    case "oauth":
      return "Google sign-in did not finish. Please try again or use email.";
    case "account_setup":
      return "You signed in, but we could not finish setting up your account. Please try again.";
    case "supabase_not_configured":
      return "Sign-in is temporarily unavailable. Please try again shortly.";
    default:
      return null;
  }
}
