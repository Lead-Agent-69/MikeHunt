const ALLOWED_VERDICTS = new Set(["go", "hold", "pass", "not_enough_data"]);

/**
 * Parse ?verdict= into a PostgREST filter for /api/deals/map.
 * - missing / "actionable" → go+hold (trust gate demotes most GO→HOLD; go-only maps were empty)
 * - "all" → no verdict filter
 * - "go" | "hold" | "pass" | "not_enough_data" → single eq
 * - "go,hold" → in()
 */
export function parseMapVerdicts(raw: string | null): {
  mode: "all" | "in" | "eq";
  values: string[];
} {
  const token = (raw ?? "actionable").trim().toLowerCase();
  if (!token || token === "actionable") {
    return { mode: "in", values: ["go", "hold"] };
  }
  if (token === "all") return { mode: "all", values: [] };
  const parts = token
    .split(",")
    .map((p) => p.trim())
    .filter((p) => ALLOWED_VERDICTS.has(p));
  if (parts.length === 0) return { mode: "in", values: ["go", "hold"] };
  if (parts.length === 1) return { mode: "eq", values: parts };
  return { mode: "in", values: Array.from(new Set(parts)) };
}
