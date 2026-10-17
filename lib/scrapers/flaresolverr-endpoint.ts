/**
 * Accept either the FlareSolverr service root (`http://host:8191`) or the
 * command endpoint (`http://host:8191/v1`) without ever producing `/v1/v1`.
 *
 * Keeping this normalization in one place matters because the scraper has
 * multiple escalation clients and deployments historically used both forms.
 */
export function normalizeFlareSolverrBaseUrl(value?: string): string {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/(?:\/v1)+$/i, "");
}

export function flareSolverrApiUrl(value?: string): string {
  const baseUrl = normalizeFlareSolverrBaseUrl(value);
  return baseUrl ? `${baseUrl}/v1` : "";
}

export function flareSolverrHealthUrl(value?: string): string {
  const baseUrl = normalizeFlareSolverrBaseUrl(value);
  return baseUrl ? `${baseUrl}/health` : "";
}
