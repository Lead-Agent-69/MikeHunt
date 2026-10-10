// lib/deals/dedup.ts
// Pure TS mirror of step 1 (exact VIN) of public.dedupe_deals (20261010220000), used by tests and by
// any caller that needs the plan without a database round-trip. The database function is what runs
// in production; keep the two in sync (lib/deals/dedup.contract.test.ts checks both).
//
// Rules:
//  - Only a 17-char VIN with a valid ISO 3779 check digit groups rows.
//  - Same VIN, same make, model years within 1 → one car. Canonical = earliest-seen active row
//    (then earliest created, then id); every other row points straight at it (never chains).
//  - Same VIN but a different make, or years 2+ apart → a conflict: flagged, never merged.

import { isValidVin, normalizeVin } from "@/lib/vehicle/vin";

export type DedupRow = {
  id: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  created_at: string;
  first_seen_at?: string | null;
  active?: boolean | null;
  duplicate_of_id?: string | null;
};

export type DedupPlan = {
  /** Canonical row of every multi-row, non-conflicting VIN group. */
  canonical: string[];
  /** Desired pointer for every non-canonical row in those groups (full state, not a delta). */
  pointers: Array<{ id: string; duplicate_of_id: string }>;
  conflicts: Array<{ vin: string; ids: string[]; reason: string }>;
};

const norm = (s: string | null | undefined) =>
  String(s || "")
    .trim()
    .toLowerCase();

function seenAt(r: DedupRow) {
  const t = Date.parse(r.first_seen_at || r.created_at || "");
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

/** Why a same-VIN group is not one car, or null when it is. */
export function vinConflictReason(rows: DedupRow[]): string | null {
  const makes = new Set(rows.map((r) => norm(r.make)).filter(Boolean));
  if (makes.size > 1) return `make differs: ${Array.from(makes).join(" / ")}`;
  const years = rows.map((r) => Number(r.year)).filter((y) => y > 0);
  if (years.length && Math.max(...years) - Math.min(...years) >= 2)
    return `model years ${Math.min(...years)}-${Math.max(...years)} are 2+ apart`;
  return null;
}

export function planVinDedup(rows: DedupRow[]): DedupPlan {
  const groups = new Map<string, DedupRow[]>();
  for (const r of rows) {
    const vin = normalizeVin(String(r.vin || ""));
    if (!isValidVin(vin)) continue;
    if (!groups.has(vin)) groups.set(vin, []);
    groups.get(vin)!.push(r);
  }
  const plan: DedupPlan = { canonical: [], pointers: [], conflicts: [] };
  for (const [vin, group] of Array.from(groups.entries())) {
    if (group.length < 2) continue;
    const reason = vinConflictReason(group);
    if (reason) {
      plan.conflicts.push({ vin, ids: group.map((r) => r.id), reason });
      continue;
    }
    const sorted = [...group].sort(
      (a, b) =>
        Number(b.active !== false) - Number(a.active !== false) ||
        seenAt(a) - seenAt(b) ||
        a.id.localeCompare(b.id),
    );
    const [canon, ...rest] = sorted;
    plan.canonical.push(canon.id);
    for (const r of rest)
      plan.pointers.push({ id: r.id, duplicate_of_id: canon.id });
  }
  plan.pointers.sort((a, b) => a.id.localeCompare(b.id));
  return plan;
}
