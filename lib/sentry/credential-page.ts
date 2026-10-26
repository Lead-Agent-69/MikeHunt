/** Email recovery hashes must not enter error reports or session recordings. */
export function isRecoveryCredentialPage(href: string): boolean {
  try {
    const url = new URL(href);
    return (
      url.pathname === "/reset-password" &&
      new URLSearchParams(url.hash.slice(1)).has("token_hash")
    );
  } catch {
    return false;
  }
}
