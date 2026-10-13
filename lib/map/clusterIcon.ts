// Cluster bubbles for /map at thousands of pins: coloured by the majority verdict of the listings
// inside, with dark ink per the #208 pin-contrast spec, and a screen-reader name that says what
// activating the bubble does ("23 listings, mostly Go. Zoom in").

export type MapVerdict = "go" | "hold" | "pass" | "none";

/** Same ink #208 uses on amber / green / teal / red pill fills (WCAG AA for 12px bold). */
export const CLUSTER_INK = "#0b1220";

export const CLUSTER_FILL: Record<MapVerdict, string> = {
  go: "#22c55e",
  hold: "#f59e0b",
  pass: "#ef4444",
  // Not enough data (no verdict, or a personal desk where verdicts are not shown).
  none: "#cbd5e1",
};

const WORD: Record<MapVerdict, string> = {
  go: "Go",
  hold: "Hold",
  pass: "Pass",
  none: "not enough data",
};

/**
 * Verdict for one map point. /api/deals/map encodes it in `type` (GO = "private", HOLD = "auction");
 * "dealer" covers PASS, unknown and every personal-desk pin, so it reads as "none" unless the point
 * also carries an explicit `verdict`.
 */
export function pointVerdict(p: {
  verdict?: string | null;
  type?: string | null;
}): MapVerdict {
  const v = String(p.verdict ?? "").toLowerCase();
  if (v === "go" || v === "buy") return "go";
  if (v === "hold" || v === "wait") return "hold";
  if (v === "pass") return "pass";
  if (p.type === "private") return "go";
  if (p.type === "auction") return "hold";
  return "none";
}

/**
 * Majority verdict. A tie, or a cluster where most pins have no verdict, is "none": the bubble
 * should not claim a colour the data does not support.
 */
export function majorityVerdict(
  counts: Partial<Record<MapVerdict, number>>,
): MapVerdict {
  const total = (["go", "hold", "pass", "none"] as const).reduce(
    (n, k) => n + (counts[k] ?? 0),
    0,
  );
  if (!total) return "none";
  let best: MapVerdict = "none";
  let bestN = 0;
  let tie = false;
  for (const k of ["go", "hold", "pass"] as const) {
    const n = counts[k] ?? 0;
    if (n > bestN) {
      best = k;
      bestN = n;
      tie = false;
    } else if (n > 0 && n === bestN) tie = true;
  }
  if (tie || bestN === 0 || (counts.none ?? 0) > bestN) return "none";
  return best;
}

export function clusterLabel(count: number, verdict: MapVerdict): string {
  const n = count.toLocaleString("en-US");
  const noun = count === 1 ? "listing" : "listings";
  return verdict === "none"
    ? `${n} ${noun}. Zoom in`
    : `${n} ${noun}, mostly ${WORD[verdict]}. Zoom in`;
}

/** Diameter steps by count (36 / 44 / 52 px) — the bubble itself is a ≥36px target, 44px+ past 100. */
export function clusterSize(count: number): number {
  return count < 100 ? 36 : count < 1000 ? 44 : 52;
}

// Inline (not Tailwind's sr-only) so it works regardless of which files Tailwind scans.
const SR_ONLY =
  "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";

const abbreviate = (n: number) =>
  n >= 10000
    ? `${Math.round(n / 1000)}k`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : String(n);

export function clusterIconHtml(count: number, verdict: MapVerdict): string {
  const size = clusterSize(count);
  const fill = CLUSTER_FILL[verdict];
  return (
    `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${fill};` +
    `color:${CLUSTER_INK};border:2px solid #fff;box-shadow:0 0 0 1px rgba(11,18,32,.35),0 2px 6px rgba(0,0,0,.35);` +
    `display:flex;align-items:center;justify-content:center;font:700 12px/1 system-ui">` +
    `<span aria-hidden="true">${abbreviate(count)}</span>` +
    `<span style="${SR_ONLY}">${clusterLabel(count, verdict)}</span></div>`
  );
}
