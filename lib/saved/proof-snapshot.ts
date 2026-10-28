import { fieldLabel, gradeDataQuality } from "@/lib/data-quality";
import { isAuctionChannel } from "@/lib/sources/source-meta";

export function savedTrustExplanation(snapshot: {
  source?: string | null;
  priceEvidence?: { kind?: string };
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
  const rawScore = Number(snapshot.dataQuality?.score || 0);
  const qualityScore = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, rawScore))
    : 0;
  const missing = new Set(snapshot.dataQuality?.missing || []);
  const vinKnown = !!snapshot.vin && !missing.has("VIN") && !missing.has("vin");
  const mileageKnown = snapshot.odometer != null && !missing.has("mileage");
  const titleKnown =
    !!snapshot.titleType && !missing.has("title type") && !missing.has("title");
  const auction =
    isAuctionChannel(snapshot.source || "") ||
    snapshot.sellerType === "auction";
  const purchasePrice = ["asking", "buy_now"].includes(
    snapshot.priceEvidence?.kind || "",
  );
  const reasons = [
    snapshot.sourceUrl && !missing.has("source link")
      ? "Original source link is present"
      : null,
    snapshot.images?.length && !missing.has("photo")
      ? `${snapshot.images.length} photo${snapshot.images.length === 1 ? "" : "s"}`
      : null,
    vinKnown ? "VIN captured" : null,
    mileageKnown ? "Mileage captured" : null,
    snapshot.auctionEndAt ? "Auction end is known" : null,
    (snapshot.seller || snapshot.sellerType) && !missing.has("seller")
      ? "Seller/source is identified"
      : null,
  ].filter(Boolean) as string[];
  const nextChecks = [
    purchasePrice
      ? null
      : auction
        ? "confirm final auction cost and fees"
        : "confirm full purchase price",
    vinKnown ? null : "verify VIN",
    mileageKnown ? null : "verify mileage",
    titleKnown ? null : "confirm title type",
    snapshot.sellerPhone || snapshot.sellerEmail || snapshot.sellerContactUrl
      ? null
      : "find seller contact path",
    auction && !snapshot.auctionEndAt ? "confirm auction timing" : null,
    "confirm total purchase costs",
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
          (snapshot.sourceUrl ? 10 : 0),
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

/** Reassess captured facts, including legacy saves, without rewriting their history or freshness. */
export function sourceBackedSavedSnapshot<T extends Record<string, any>>(
  snapshot: T,
  clientProof?: unknown,
) {
  const text = (value: unknown) =>
    typeof value === "string" ? value : undefined;
  const numeric = (value: unknown) =>
    (typeof value === "number" ||
      (typeof value === "string" && value.trim())) &&
    Number.isFinite(Number(value))
      ? Number(value)
      : undefined;
  const quality = gradeDataQuality({
    source: text(snapshot.source),
    images: snapshot.images,
    photoAudit: snapshot.photoAudit,
    vin: text(snapshot.vin),
    titleType: text(snapshot.titleType),
    condition: text(snapshot.condition),
    damageType: text(snapshot.damageType),
    mileage: numeric(snapshot.odometer),
    locationCity: text(snapshot.locationCity),
    locationState: text(snapshot.locationState),
    askPrice: numeric(snapshot.askingPrice),
    seller: text(snapshot.seller),
    sellerType: text(snapshot.sellerType),
    sellerPhone: text(snapshot.sellerPhone),
    sellerEmail: text(snapshot.sellerEmail),
    sellerContactUrl: text(snapshot.sellerContactUrl),
    sourceUrl: text(snapshot.sourceUrl),
    auctionEndAt: text(snapshot.auctionEndAt),
  });
  const dataQuality = {
    score: quality.score,
    label: quality.label,
    missing: quality.missing.map(fieldLabel),
  };
  const capturedContext = sanitizeClientProofSnapshot(clientProof);
  return {
    ...snapshot,
    dataQuality,
    trustExplanation: savedTrustExplanation({ ...snapshot, dataQuality }),
    evidenceBasis: "listing_details_at_save",
    ...(Object.keys(capturedContext).length
      ? {
          searchContextAtSave: {
            ...capturedContext,
            origin: "client",
            verified: false,
          },
        }
      : {}),
  };
}

function boundedContextText(value: string, limit: number) {
  let result = "";
  for (const character of value.trim()) {
    const point = character.codePointAt(0)!;
    if (point === 0 || (point >= 0xd800 && point <= 0xdfff)) continue;
    if (result.length + character.length > limit) break;
    result += character;
  }
  return result;
}

function contextScore(value: unknown) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
}

function sanitizeStringList(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) =>
      typeof item === "string" ? boundedContextText(item, 240) : "",
    )
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
      score: contextScore(quality.score),
      label:
        typeof quality.label === "string"
          ? boundedContextText(quality.label, 40)
          : undefined,
      missing: sanitizeStringList(quality.missing, 12) || [],
    };
  }

  if (trust && typeof trust === "object") {
    sanitized.trustExplanation = {
      confidence:
        typeof trust.confidence === "string"
          ? boundedContextText(trust.confidence, 20)
          : undefined,
      score: trust.score != null ? contextScore(trust.score) : undefined,
      reasons: sanitizeStringList(trust.reasons, 8),
      missing: sanitizeStringList(trust.missing, 12),
      nextChecks: sanitizeStringList(trust.nextChecks, 8),
      summary:
        typeof trust.summary === "string"
          ? boundedContextText(trust.summary, 240)
          : undefined,
    };
  }

  return sanitized;
}
