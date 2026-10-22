import { isAuctionChannel } from "@/lib/sources/source-meta";
import { photoEvidence } from "@/lib/images/photo-evidence";
import { conditionFromTitleType } from "@/lib/deals/title-badge-model";

export type DataQualityField =
  | "photo"
  | "vin"
  | "title"
  | "damage"
  | "mileage"
  | "location"
  | "price"
  | "seller"
  | "sellerContact"
  | "auction"
  | "source";

export interface DataQualityInput {
  source?: string | null;
  images?: unknown;
  imageUrl?: string | null;
  photoAudit?: unknown;
  vin?: string | null;
  titleType?: string | null;
  condition?: string | null;
  damageType?: string | null;
  mileage?: number | null;
  locationCity?: string | null;
  locationState?: string | null;
  askPrice?: number | null;
  seller?: string | null;
  sellerType?: string | null;
  sellerPhone?: string | null;
  sellerEmail?: string | null;
  sellerContactUrl?: string | null;
  auctionEndAt?: string | Date | null;
  sourceUrl?: string | null;
}

export interface DataQualityGrade {
  score: number;
  label: "Excellent" | "Good" | "Thin" | "Sparse";
  present: DataQualityField[];
  missing: DataQualityField[];
}

const FIELD_LABELS: Record<DataQualityField, string> = {
  photo: "photo",
  vin: "VIN",
  title: "title type",
  damage: "damage/condition",
  mileage: "mileage",
  location: "location",
  price: "price",
  seller: "seller",
  sellerContact: "seller contact",
  auction: "auction date",
  source: "source link",
};

export function fieldLabel(field: DataQualityField) {
  return FIELD_LABELS[field];
}

export function qualityFieldLabel(field: string) {
  return FIELD_LABELS[field as DataQualityField] || field;
}

function usableText(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const text = value.trim();
  return (
    !!text &&
    !/^(?:unknown|n\/?a|none|null|undefined|not[ _-](?:reported|provided|available)|tbd|[-—]+)$/i.test(
      text,
    )
  );
}

function reportedNumber(value: unknown, minimum: number): boolean {
  return (
    (typeof value === "number" ||
      (typeof value === "string" && !!value.trim())) &&
    Number.isFinite(Number(value)) &&
    Number(value) >= minimum
  );
}

function usableUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function gradeDataQuality(input: DataQualityInput): DataQualityGrade {
  const images = photoEvidence(
    [
      ...(Array.isArray(input.images) ? input.images : []),
      ...(input.imageUrl ? [input.imageUrl] : []),
    ],
    input.photoAudit,
  ).images;
  const sellerType = String(input.sellerType || "").toLowerCase();
  const auctionDateExpected = input.source
    ? isAuctionChannel(input.source) || sellerType === "auction"
    : !["dealer", "private", "retail"].includes(sellerType);
  // Operability/damage categories and placeholder strings do not report a title status.
  const titleCondition = conditionFromTitleType(
    usableText(input.condition) ? input.condition : input.titleType,
  );
  const titleReported = [
    "clean_title",
    "rebuilt_title",
    "salvage_title",
    "parts_only",
  ].includes(titleCondition || "");
  const checks: Array<[DataQualityField, boolean]> = [
    ["photo", images.length > 0],
    ["vin", /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(input.vin || "").trim())],
    ["title", titleReported],
    ["damage", usableText(input.condition) || usableText(input.damageType)],
    ["mileage", reportedNumber(input.mileage, 0)],
    [
      "location",
      usableText(input.locationCity) || usableText(input.locationState),
    ],
    ["price", reportedNumber(input.askPrice, Number.MIN_VALUE)],
    ["seller", usableText(input.seller) || usableText(input.sellerType)],
    [
      "sellerContact",
      usableText(input.sellerPhone) ||
        usableText(input.sellerEmail) ||
        usableUrl(input.sellerContactUrl),
    ],
    ["source", usableUrl(input.sourceUrl)],
  ];
  if (auctionDateExpected) {
    checks.push([
      "auction",
      !!input.auctionEndAt &&
        Number.isFinite(new Date(input.auctionEndAt).getTime()),
    ]);
  }

  const present = checks.filter(([, ok]) => ok).map(([field]) => field);
  const missing = checks.filter(([, ok]) => !ok).map(([field]) => field);
  const score = Math.round((present.length / checks.length) * 100);
  const label =
    score >= 88
      ? "Excellent"
      : score >= 68
        ? "Good"
        : score >= 45
          ? "Thin"
          : "Sparse";

  return { score, label, present, missing };
}
