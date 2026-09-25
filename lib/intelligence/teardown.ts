// lib/intelligence/teardown.ts
export interface TeardownValue {
  engine: number;
  transmission: number;
  electronics: number;
  bodyParts: number;
  interior: number;
  total: number;
}

/**
 * Calculates a rough estimate of teardown (parts) value for a salvage vehicle based on its retail baseline.
 * Usually, parts sell for a premium individually, but they take time to sell.
 * For a rough model, a salvage vehicle might yield 60-80% of its wholesale value in parts if fully stripped.
 */
export function estimateTeardownValue(
  baselineRetail: number,
  make: string,
  model: string,
): TeardownValue {
  // Base parts value is roughly 40% of retail baseline
  const basePartsValue = baselineRetail * 0.4;

  // High demand parts vehicles (trucks, sports cars, common sedans with high accident rates)
  let demandMultiplier = 1.0;
  const lowerMake = make.toLowerCase();

  // Example multipliers
  if (["honda", "toyota", "ford", "chevrolet"].includes(lowerMake)) {
    demandMultiplier = 1.2; // High demand for common parts
  } else if (["bmw", "mercedes-benz", "audi", "porsche"].includes(lowerMake)) {
    demandMultiplier = 1.5; // Expensive European parts
  } else if (["tesla", "rivian", "lucid"].includes(lowerMake)) {
    demandMultiplier = 1.8; // High value battery & electronics
  }

  const totalValue = basePartsValue * demandMultiplier;

  // Approximate breakdown
  return {
    engine: Math.round(totalValue * 0.35),
    transmission: Math.round(totalValue * 0.15),
    electronics: Math.round(totalValue * 0.2),
    bodyParts: Math.round(totalValue * 0.2),
    interior: Math.round(totalValue * 0.1),
    total: Math.round(totalValue),
  };
}
