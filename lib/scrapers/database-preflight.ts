interface ProbeError {
  code?: string | null;
}

interface ProbeResult {
  error?: ProbeError | null;
}

type DatabaseProbe = (signal: AbortSignal) => Promise<ProbeResult>;

/** Refuse to run a hosted worker whose target or credential cannot read inventory. */
export async function verifyScraperDatabaseConnection(
  probe: DatabaseProbe,
  timeoutMs = 10_000,
): Promise<void> {
  let result: ProbeResult;
  try {
    result = await probe(AbortSignal.timeout(timeoutMs));
  } catch {
    throw new Error(
      "Scraper database connection check failed (network or timeout)",
    );
  }
  if (!result.error) return;

  const code = String(result.error.code || "rejected")
    .replace(/[^a-z0-9_-]/gi, "")
    .slice(0, 64);
  throw new Error(
    `Scraper database connection check failed (${code || "rejected"})`,
  );
}
