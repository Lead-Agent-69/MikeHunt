export interface TableHealthEvidence {
  readiness?: string;
  userStatus?: string;
  activeRows?: number;
  photoCoveragePct?: number;
  freshnessHours?: number | null;
}

const LABELS: Record<string, string> = {
  ready: "Listings available",
  needs_run: "Needs refresh",
  needs_login: "Sign-in required",
  blocked: "Unavailable",
  disabled: "Not connected",
  no_rows: "No saved matches",
};

/** Customer copy describes recorded evidence, never total vendor inventory. */
export function tableHealthCopy(health?: TableHealthEvidence | null) {
  const readiness = health?.readiness || "";
  const label =
    health?.userStatus === "Needs database" ||
    health?.userStatus === "Off for site terms"
      ? "Unavailable"
      : Object.prototype.hasOwnProperty.call(LABELS, readiness)
        ? LABELS[readiness]
        : "Not verified";
  const parts = [label];
  const rows = health?.activeRows;
  if (typeof rows === "number" && Number.isSafeInteger(rows) && rows >= 0)
    parts.push(
      `${rows.toLocaleString()} saved listing${rows === 1 ? "" : "s"}`,
    );
  const photos = health?.photoCoveragePct;
  if (
    typeof photos === "number" &&
    Number.isFinite(photos) &&
    photos >= 0 &&
    photos <= 100
  )
    parts.push(`${Math.round(photos)}% with photos`);
  const hours = health?.freshnessHours;
  parts.push(
    typeof hours === "number" && Number.isFinite(hours) && hours >= 0
      ? hours < 1
        ? "Latest listing seen within the past hour"
        : `Latest listing seen ${Math.floor(hours)}h ago`
      : "Listing freshness not verified",
  );
  return { label, description: parts.join(" · ") };
}
