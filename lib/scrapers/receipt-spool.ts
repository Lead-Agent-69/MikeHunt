import { mkdir, appendFile, stat } from "node:fs/promises";
import path from "node:path";
import { redactDiagnostic } from "./run-outcome";

/** Bounded, private local evidence when the database cannot accept a run receipt. */
export async function spoolReceipt(event: Record<string, unknown>) {
  const dir = path.resolve(
    process.env.LOCAL_CACHE_PATH || ".cache",
    "receipts",
  );
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `pending-${process.pid}.jsonl`);
  const size = await stat(file)
    .then((s) => s.size)
    .catch(() => 0);
  if (size > 5 * 1024 * 1024)
    throw new Error(
      "Receipt spool full; reconcile before collecting more inventory",
    );
  const safe = Object.fromEntries(
    Object.entries(event).map(([key, value]) => [
      key,
      typeof value === "string" ? redactDiagnostic(value) : value,
    ]),
  );
  await appendFile(
    file,
    `${JSON.stringify({ ...safe, spooledAt: new Date().toISOString() })}\n`,
    { mode: 0o600 },
  );
}
