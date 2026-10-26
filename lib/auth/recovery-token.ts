/** Recovery hashes are bearer credentials. Never log them or put them in analytics. */
export function isRecoveryToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:pkce_)?(?:[a-f0-9]{56}|[a-f0-9]{64})$/i.test(value)
  );
}
