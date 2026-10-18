export function selectedSourceIds(raw: string | null | undefined): string[] {
  return Array.from(
    new Set(
      (raw || "")
        .toLowerCase()
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id && id !== "all"),
    ),
  ).slice(0, 25);
}
export function validSourceSelection(raw: string) {
  return (
    !raw ||
    raw === "all" ||
    (raw.split(",").length <= 25 && /^[a-z0-9_-]+(?:,[a-z0-9_-]+)*$/i.test(raw))
  );
}
