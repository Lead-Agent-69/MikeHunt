import {
  mkdir,
  writeFile,
  readdir,
  lstat,
  readFile,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redactDiagnostic } from "./run-outcome";

/** Bounded, private local evidence when the database cannot accept a run receipt. */
export async function spoolReceipt(event: Record<string, unknown>) {
  const dir = path.resolve(
    process.env.LOCAL_CACHE_PATH || ".cache",
    "receipts",
  );
  await mkdir(dir, { recursive: true });
  const names = await readdir(dir);
  const sizes = await Promise.all(
    names
      .filter((name) => /^pending-/.test(name))
      .map((name) => lstat(path.join(dir, name)).then((s) => s.size)),
  );
  const size = sizes.reduce((sum, bytes) => sum + bytes, 0);
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
  const receiptId = randomUUID();
  const body = JSON.stringify({
    ...safe,
    receiptId,
    spooledAt: new Date().toISOString(),
  });
  if (Buffer.byteLength(body) > 32_768)
    throw new Error("Receipt exceeds size limit");
  await writeFile(path.join(dir, `pending-${receiptId}.json`), body, {
    mode: 0o600,
    flag: "wx",
  });
}

let draining: Promise<number> | null = null;
export function reconcileReceipts(client: SupabaseClient): Promise<number> {
  if (draining) return draining;
  draining = drain(client).finally(() => {
    draining = null;
  });
  return draining;
}

async function drain(client: SupabaseClient) {
  const dir = path.resolve(
    process.env.LOCAL_CACHE_PATH || ".cache",
    "receipts",
  );
  const names = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  let delivered = 0;
  for (const name of names
    .filter((n) => /^pending-[a-f0-9-]{36}\.json$/.test(n))
    .sort()
    .slice(0, 100)) {
    const file = path.join(dir, name);
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 32_768)
      throw new Error("Invalid local receipt file");
    const event = JSON.parse(await readFile(file, "utf8"));
    if (
      name !== `pending-${event.receiptId}.json` ||
      !Number.isFinite(Date.parse(event.spooledAt))
    )
      throw new Error("Invalid receipt identity");
    const { error } = await client
      .from("scraper_receipts")
      .upsert(
        { id: event.receiptId, observed_at: event.spooledAt, event },
        { onConflict: "id", ignoreDuplicates: true },
      );
    if (error) return delivered;
    await unlink(file);
    delivered++;
  }
  return delivered;
}
