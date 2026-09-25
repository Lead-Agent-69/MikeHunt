import { generateObject } from 'ai';
import { z } from 'zod';
import { structuredModel } from '../config';

export interface ValuationRequest {
  make: string;
  model: string;
  year: number;
  mileage: number;
  condition: string;
  ask_price: number;
  location_state?: string;
}

const ValuationResultSchema = z.object({
  estimatedWholesalePrice: z.number().describe('The estimated wholesale / auction value of the vehicle (MMR equivalent).'),
  estimatedRetailPrice: z.number().describe('The estimated retail selling price of the vehicle.'),
  estimatedRepairCost: z.number().describe('The estimated repair cost based on the vehicle condition (e.g., $0 for clean title, $1500 for minor collision).'),
  confidence: z.enum(['high', 'medium', 'low']),
  rationale: z.string().describe('A 1-2 sentence explanation of why this valuation was given, mentioning demand and depreciation.'),
  isArbitrageOpportunity: z.boolean().describe('True if this vehicle is significantly cheaper than typical market value and could be flipped easily, especially across state lines.')
});

export type ValuationResult = z.infer<typeof ValuationResultSchema>;

/**
 * Agent responsible for predicting the valuation of a vehicle.
 */
export async function predictVehicleValuation(vehicle: ValuationRequest): Promise<ValuationResult> {
  const prompt = `
    You are an expert automotive pricing analyst and dealer. 
    Given the following vehicle details, estimate the wholesale (auction) price and the retail price.
    Also, determine if this is an arbitrage opportunity (can be bought cheap and sold high).
    
    Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}
    Mileage: ${vehicle.mileage} miles
    Condition: ${vehicle.condition}
    Asking Price: $${vehicle.ask_price}
    Location: ${vehicle.location_state || 'Unknown'}
  `;

  try {
    const { object } = await generateObject({
      model: structuredModel,
      schema: ValuationResultSchema,
      prompt,
    });
    
    return object;
  } catch (error) {
    console.error('Failed to predict valuation:', error);
    throw error;
  }
}
