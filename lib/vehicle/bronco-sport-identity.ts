type IdentityRow = {
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  title?: string | null;
  year?: number | null;
};

/** Only repair explicit modern Bronco Sport titles; classic Sport trims remain Bronco. */
export function broncoSportIdentity(row: IdentityRow) {
  if (
    row.make?.trim().toLowerCase() !== "ford" ||
    row.model?.trim().toLowerCase() !== "bronco"
  )
    return null;
  if (!/\bford\s+bronco\s+sport\b/i.test(row.title || "")) return null;
  const titleYear = Number(row.title?.match(/\b(?:19|20)\d{2}\b/)?.[0]);
  const year = row.year || titleYear;
  if (!year || year < 2021 || (titleYear && titleYear !== year)) return null;
  const trim = row.trim?.replace(/^sport(?:\s+|$)/i, "").trim() || null;
  return { model: "Bronco Sport", trim };
}
