export function isSourceLandingPage(href?: string | null): boolean {
  if (!href) return false;
  try {
    const url = new URL(href);
    return /^\/(?:inventory|vehicles|cars|used|used-cars|search)?\/?$/i.test(
      url.pathname,
    );
  } catch {
    return false;
  }
}

export function sourceLinkLabel(href?: string | null): string {
  return isSourceLandingPage(href) ? "Seller website" : "Original listing";
}
