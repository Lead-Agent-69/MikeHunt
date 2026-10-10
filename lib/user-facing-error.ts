/**
 * Backend and provider failures can contain implementation details that are neither useful nor
 * appropriate for buyers. Keep the original error for monitoring, but display a calm recovery
 * message in customer-facing UI.
 */
export function userFacingErrorMessage(
  error: unknown,
  fallback = "We couldn't complete that request. Please try again.",
) {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  const message = raw.replace(/\s+/g, " ").trim();

  if (!message) return fallback;
  if (
    /unexpected (end|token)|json.*(parse|input)|execute ['"]?json|syntaxerror/i.test(
      message,
    )
  )
    return fallback;
  if (/abort(ed|ing)?|cancelled/i.test(message)) {
    return "That request was cancelled. Try again when you're ready.";
  }
  if (/sign in|unauthori[sz]ed|forbidden|session|jwt|token/i.test(message)) {
    return "Your session needs attention. Sign in again, then try once more.";
  }
  if (/network|fetch|offline|connection|timed? ?out/i.test(message)) {
    return "We couldn't reach MIKEHUNT right now. Check your connection and try again.";
  }
  if (
    /supabase|postgrest|postgres|database|docker|runner|scrap(er|ing)|worker|rpc|kong|service.?role|api.?key|relation .+ does not exist|stack|exception|unexpected (end|token)|json.*(parse|input)|execute ['"]?json|syntaxerror/i.test(
      message,
    )
  ) {
    return fallback;
  }

  return message.length > 220 ? fallback : message;
}
