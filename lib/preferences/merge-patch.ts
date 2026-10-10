export function mergePreferencePatch(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  const merged = { ...existing, ...patch };
  for (const key of ["buyerScope", "profileContact"]) {
    const previous = existing[key];
    const next = patch[key];
    if (next && typeof next === "object" && !Array.isArray(next)) {
      merged[key] = {
        ...(previous && typeof previous === "object" && !Array.isArray(previous)
          ? previous
          : {}),
        ...next,
      };
    }
  }
  return merged;
}
