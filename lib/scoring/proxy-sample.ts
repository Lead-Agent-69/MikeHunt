/** A regression proxy must not report a passing metric without enough observations. */
export function requireProxySample(
  errors: readonly number[],
  minimum = 50,
): void {
  if (!Number.isInteger(minimum) || minimum < 1) {
    throw new Error("Invalid minimum sample size");
  }
  if (errors.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Invalid proxy observations");
  }
  if (errors.length < minimum) {
    throw new Error(
      `Insufficient proxy evidence: ${errors.length} scored vehicles; need ${minimum}. No accuracy claim can be made.`,
    );
  }
}
