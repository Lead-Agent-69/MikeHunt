export type RunOutcome =
  | "imported"
  | "unverified_empty"
  | "blocked"
  | "failed"
  | "skipped"
  | "cancelled"
  | "simulated";
export function runOutcome(
  success: boolean,
  saved: number,
  error?: string,
): RunOutcome {
  if (/empty inventory is not verified|no accepted rows/i.test(error || ""))
    return "unverified_empty";
  if (/aborted|cancelled/i.test(error || "")) return "cancelled";
  if (/permission|circuit breaker|budget|quota/i.test(error || ""))
    return "skipped";
  if (/403|401|captcha|challenge|robots|disallow/i.test(error || ""))
    return "blocked";
  return success ? (saved > 0 ? "imported" : "unverified_empty") : "failed";
}
export function redactDiagnostic(message: string): string {
  return message
    .replace(
      /(authorization|cookie|password|token|api[_-]?key|secret)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .replace(/https?:\/\/[^\s]+/g, (url) => {
      try {
        const p = new URL(url);
        p.username = "";
        p.password = "";
        p.search = "";
        p.hash = "";
        return p.toString();
      } catch {
        return "[url]";
      }
    })
    .slice(0, 2000);
}
