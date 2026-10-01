export type DataQualityField =
  | "photo"
  | "vin"
  | "title"
  | "mileage"
  | "location"
  | "price"
  | "seller"
  | "source";

export interface DataQualityInput {
  images?: unknown;
  imageUrl?: string | null;
  vin?: string | null;
  condition?: string | null;
  damageType?: string | null;
  mileage?: number | null;
  locationCity?: string | null;
  locationState?: string | null;
  askPrice?: number | null;
  seller?: string | null;
  sellerType?: string | null;
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
  title: "title",
  mileage: "mileage",
  location: "location",
  price: "price",
  seller: "seller",
  source: "source link",
};

export function fieldLabel(field: DataQualityField) {
  return FIELD_LABELS[field];
}

export function gradeDataQuality(input: DataQualityInput): DataQualityGrade {
  const images = Array.isArray(input.images) ? input.images : [];
  const checks: Array<[DataQualityField, boolean]> = [
    ["photo", images.length > 0 || Boolean(input.imageUrl)],
    ["vin", Boolean(input.vin)],
    ["title", Boolean(input.condition || input.damageType)],
    ["mileage", Number(input.mileage || 0) > 0],
    ["location", Boolean(input.locationCity || input.locationState)],
    ["price", Number(input.askPrice || 0) > 0],
    ["seller", Boolean(input.seller || input.sellerType)],
    ["source", Boolean(input.sourceUrl)],
  ];

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
