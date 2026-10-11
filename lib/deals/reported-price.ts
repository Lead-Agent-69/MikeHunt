/** Unknown/placeholder listing prices must not look like free cars. */
export function reportedPrice(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value)
    : "Not reported";
}
