function containsPatch(actual: unknown, expected: unknown): boolean {
  if (expected === undefined) return true;
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => containsPatch(actual[index], value))
    );
  }
  if (expected !== null && typeof expected === "object") {
    return (
      actual !== null &&
      typeof actual === "object" &&
      Object.entries(expected).every(([key, value]) =>
        containsPatch((actual as Record<string, unknown>)[key], value),
      )
    );
  }
  return actual === expected;
}

/** Guest cookies are useful for browsing, but are not an account onboarding save. */
export function confirmOnboardingSave(
  body: {
    authed?: boolean;
    local?: boolean;
    prefs?: unknown;
    profile?: { id?: string; onboarded?: boolean };
  },
  kind: "preferences" | "profile",
  expected: Record<string, unknown>,
  configured: boolean,
) {
  if (configured && (body.authed === false || body.local === true)) {
    throw new Error(
      "Your session has expired. Sign in again before saving your buying profile.",
    );
  }
  const saved = kind === "preferences" ? body.prefs : body.profile;
  if (
    !containsPatch(saved, expected) ||
    (configured && kind === "profile" && !body.profile?.id)
  ) {
    throw new Error(
      "Your buying profile save could not be confirmed. Please try again.",
    );
  }
}
