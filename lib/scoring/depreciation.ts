// lib/scoring/depreciation.ts
// Fit a depreciation line through real market (price, mileage) points. Lets a deal screen answer
// "is this priced where the curve says it should be?" and "what does +5k miles cost in resale?".
// Pure linear regression over our own deals data — $0, no AI.

export interface DataPoint {
  mileage: number;
  price: number;
}

export interface DepreciationFit {
  slope: number; // $ per mile (negative)
  intercept: number;
  n: number;
  depreciationPer1000Miles: number; // positive $
  predictPriceAtMileage: (miles: number) => number;
}

export function fitDepreciationCurve(
  points: DataPoint[],
): DepreciationFit | null {
  const xs = points.filter(
    (p) =>
      Number.isFinite(p.mileage) &&
      Number.isFinite(p.price) &&
      p.mileage > 0 &&
      p.price > 0,
  );
  const n = xs.length;
  if (n < 8) return null;

  const sumX = xs.reduce((s, p) => s + p.mileage, 0);
  const sumY = xs.reduce((s, p) => s + p.price, 0);
  const sumXY = xs.reduce((s, p) => s + p.mileage * p.price, 0);
  const sumX2 = xs.reduce((s, p) => s + p.mileage * p.mileage, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return {
    slope,
    intercept,
    n,
    depreciationPer1000Miles: Math.round(Math.abs(slope) * 1000),
    predictPriceAtMileage: (miles: number) =>
      Math.round(intercept + slope * miles),
  };
}
