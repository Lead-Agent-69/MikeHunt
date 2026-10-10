// lib/data-quality/canonical-groups.ts
// Group listing rows that are the same car: rows sharing a 17-char VIN, and rows linked by
// deals.duplicate_of_id (public.dedupe_deals: exact VIN + fuzzy cross-source match). Pure, no I/O.
// A VIN-conflict row (quality_flags has 'vin_conflict') is never VIN-grouped: same VIN, different
// year/make means one listing is wrong, so it stays its own card.

export interface GroupableRow {
  id?: string | null;
  vin?: string | null;
  duplicate_of_id?: string | null;
  quality_flags?: string[] | null;
}

const VIN17 = /^[A-HJ-NPR-Z0-9]{17}$/;

export function groupSameCar<T extends GroupableRow>(rows: T[]): T[][] {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  const byKey = new Map<string, number>();
  const link = (key: string, i: number) => {
    const j = byKey.get(key);
    if (j === undefined) byKey.set(key, i);
    else union(i, j);
  };

  rows.forEach((r, i) => {
    const root = String(r.duplicate_of_id || r.id || "");
    if (root) link(`root:${root}`, i);
    if (r.id) link(`root:${r.id}`, i);
    const vin = String(r.vin || "")
      .trim()
      .toUpperCase();
    const conflict =
      Array.isArray(r.quality_flags) &&
      r.quality_flags.includes("vin_conflict");
    if (VIN17.test(vin) && !conflict) link(`vin:${vin}`, i);
  });

  const groups = new Map<number, T[]>();
  rows.forEach((r, i) => {
    const g = find(i);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r);
  });
  return Array.from(groups.values());
}
