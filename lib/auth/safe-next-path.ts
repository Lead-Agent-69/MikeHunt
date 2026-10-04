/**
 * Keeps post-auth navigation inside the MIKEHUNT app.
 *
 * `router.push` and OAuth callbacks both accept URLs, so a simple `startsWith("/")`
 * check would also allow protocol-relative URLs such as `//example.com`.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback = "/discover",
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("\r") ||
    value.includes("\n")
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://mikehunt.invalid");
    if (parsed.origin !== "https://mikehunt.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
