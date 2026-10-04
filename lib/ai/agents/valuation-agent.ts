import { z } from 'zod';

export interface ValuationRequest {
  make: string;
  model: string;
  year: number;
  mileage: number;
  condition: string;
  ask_price: number;
  location_state?: string;
}

/**
 * Schema kept for type compatibility with callers. Numeric wholesale/retail fields
 * must NEVER be populated by an LLM and written to mmr_value / marketValue.
 */
const ValuationResultSchema = z.object({
  estimatedWholesalePrice: z.number().describe('Deprecated: LLM must not invent wholesale/MMR.'),
  estimatedRetailPrice: z.number().describe('Deprecated: LLM must not invent retail.'),
  estimatedRepairCost: z.number().describe('Deprecated: LLM must not invent repair cost as market truth.'),
  confidence: z.enum(['high', 'medium', 'low']),
  rationale: z.string().describe('Narrate-only explanation; must not invent dollar amounts as market truth.'),
  isArbitrageOpportunity: z.boolean(),
});

export type ValuationResult = z.infer<typeof ValuationResultSchema>;

/**
 * P0 (Ren): LLM price invent is DISABLED.
 * valuation-agent previously asked the model to invent wholesale/retail; ai-worker
 * stored those as mmr_value / marketValue; ValuationBreakdown labeled mmr as KBB.
 * Prices users see must come from fetched comps/guides only.
 *
 * Callers must fail closed — do not catch and substitute invented numbers.
 */
export async function predictVehicleValuation(
  _vehicle: ValuationRequest,
): Promise<ValuationResult> {
  throw new Error(
    'LLM price invent is disabled (P0). Market values must come from fetched comps/guides, not the model. Do not store model output as mmr_value or marketValue.',
  );
}

export function isLlmPriceInventEnabled(): boolean {
  return process.env.ENABLE_LLM_PRICE_INVENT === 'true';
}
