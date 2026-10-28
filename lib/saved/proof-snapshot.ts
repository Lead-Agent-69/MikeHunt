export function savedTrustExplanation(snapshot: {
  vin?: string | null;
  odometer?: number | null;
  titleType?: string | null;
  sellerType?: string | null;
  seller?: string | null;
  sourceUrl?: string | null;
  images?: string[] | null;
  estimatedProfit?: number | null;
  profitScore?: number | null;
  dataQuality?: { score: number; missing: string[] };
  sellerPhone?: string | null;
  sellerEmail?: string | null;
  sellerContactUrl?: string | null;
  auctionEndAt?: string | null;
}) {
  const qualityScore = Number(snapshot.dataQuality?.score || 0);
  const profit = Number(snapshot.estimatedProfit || 0);
  const reasons = [
    snapshot.sourceUrl ? "Original source link is present" : null,
    snapshot.images?.length
      ? `${snapshot.images.length} photo${snapshot.images.length === 1 ? "" : "s"}`
      : null,
    snapshot.vin ? "VIN captured" : null,
    snapshot.odometer ? "Mileage captured" : null,
    snapshot.auctionEndAt ? "Auction end is known" : null,
    snapshot.seller || snapshot.sellerType
      ? "Seller/source is identified"
      : null,
    profit > 0
      ? `$${Math.round(profit).toLocaleString()} estimated spread`
      : null,
  ].filter(Boolean) as string[];
  const nextChecks = [
    snapshot.vin ? null : "verify VIN",
    snapshot.odometer ? null : "verify mileage",
    snapshot.titleType ? null : "confirm title type",
    snapshot.sellerPhone || snapshot.sellerEmail || snapshot.sellerContactUrl
      ? null
      : "find seller contact path",
    snapshot.auctionEndAt ? null : "confirm auction timing",
    snapshot.profitScore || profit ? null : "validate resale and fee math",
  ].filter(Boolean) as string[];
  const confidence =
    qualityScore >= 80 && reasons.length >= 5
      ? "high"
      : qualityScore >= 60 && reasons.length >= 3
        ? "medium"
        : "low";
  return {
    confidence,
    score: Math.round(
      Math.min(
        100,
        qualityScore * 0.55 +
          Math.min(25, reasons.length * 5) +
          (snapshot.sourceUrl ? 10 : 0) +
          (profit > 0 ? 10 : 0),
      ),
    ),
    reasons: reasons.slice(0, 5),
    missing: snapshot.dataQuality?.missing || [],
    nextChecks: nextChecks.slice(0, 4),
    summary: reasons.length
      ? reasons.slice(0, 3).join(" · ")
      : "Thin proof: verify original listing details before acting.",
  };
}

function sanitizeStringList(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

export function sanitizeClientProofSnapshot(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const input = value as any;
  const quality = input.dataQuality;
  const trust = input.trustExplanation;
  const sanitized: {
    dataQuality?: { score: number; label?: string; missing: string[] };
    trustExplanation?: {
      confidence?: string;
      score?: number;
      reasons?: string[];
      missing?: string[];
      nextChecks?: string[];
      summary?: string;
    };
  } = {};

  if (quality && typeof quality === "object") {
    sanitized.dataQuality = {
      score: Math.max(0, Math.min(100, Number(quality.score || 0))),
      label:
        typeof quality.label === "string"
          ? quality.label.slice(0, 40)
          : undefined,
      missing: sanitizeStringList(quality.missing, 12) || [],
    };
  }

  if (trust && typeof trust === "object") {
    sanitized.trustExplanation = {
      confidence:
        typeof trust.confidence === "string"
          ? trust.confidence.slice(0, 20)
          : undefined,
      score:
        trust.score != null
          ? Math.max(0, Math.min(100, Number(trust.score || 0)))
          : undefined,
      reasons: sanitizeStringList(trust.reasons, 8),
      missing: sanitizeStringList(trust.missing, 12),
      nextChecks: sanitizeStringList(trust.nextChecks, 8),
      summary:
        typeof trust.summary === "string"
          ? trust.summary.slice(0, 240)
          : undefined,
    };
  }

  return sanitized;
}
