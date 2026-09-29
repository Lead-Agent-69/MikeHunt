// Map low-level network failures to something a user can act on.
export function friendlyAuthError(raw: unknown): string {
  const msg =
    typeof raw === "string"
      ? raw
      : raw instanceof Error
        ? raw.message
        : "";
  if (!msg) return "Something went wrong. Please try again.";
  if (/fetch failed|failed to fetch|networkerror|network request failed|load failed|timeout/i.test(msg))
    return "Can't reach the server right now. Check your connection and try again.";
  return msg;
}
