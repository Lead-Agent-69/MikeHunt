/** Width-relative triage, retaining the existing 360px card's approximate feel. */
export function vehicleSwipeDecision(
  offset: number,
  velocity: number,
  width: number,
): "save" | "pass" | null {
  if (![offset, velocity, width].every(Number.isFinite) || width <= 0)
    return null;
  const distance = offset / width;
  const speed = velocity / width;
  if (distance > 0.28 || (distance > 0.11 && speed > 1.67)) return "save";
  if (distance < -0.28 || (distance < -0.11 && speed < -1.67)) return "pass";
  return null;
}
