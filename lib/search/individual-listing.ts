/** Known non-vehicle pages. Static patterns shared by DB scopes and row checks. */
export const PROMOTIONAL_LISTING_TITLE =
  "^[[:space:]]*(check out (these|our) (great )?deals|browse (our )?(inventory|vehicles)|shop (our )?(inventory|vehicles)|view (all |our )?inventory)[[:space:]!.]*$";
export const MODEL_SEARCH_LISTING_URL = "[/]searchnew[.]aspx([?]|$)";

export function applyIndividualListingScope<T>(query: T): T {
  return (query as any)
    .or(
      `title.is.null,title.not.imatch.${JSON.stringify(PROMOTIONAL_LISTING_TITLE)}`,
    )
    .or(
      `source_url.is.null,source_url.not.imatch.${JSON.stringify(MODEL_SEARCH_LISTING_URL)}`,
    );
}

/** Do not delete retained records or infer availability from this classification. */
export function isNonVehicleListing(row: {
  title?: unknown;
  source_url?: unknown;
}) {
  return (
    (typeof row.title === "string" &&
      /^(?:check out (?:these|our) (?:great )?deals|browse (?:our )?(?:inventory|vehicles)|shop (?:our )?(?:inventory|vehicles)|view (?:all |our )?inventory)[\s!.]*$/i.test(
        row.title.trim(),
      )) ||
    (typeof row.source_url === "string" &&
      new RegExp(MODEL_SEARCH_LISTING_URL, "i").test(row.source_url))
  );
}
