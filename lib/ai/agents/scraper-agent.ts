import { generateObject } from 'ai';
import { z } from 'zod';
import { structuredModel } from '../config';

// Define the schema for the vehicle data we want to extract to match the DB
const VehicleDataSchema = z.object({
  title: z.string().describe('The full title of the deal (e.g., 2018 Ford F-150 XLT)'),
  make: z.string().describe('The make or brand of the vehicle (e.g., Ford, Toyota)'),
  model: z.string().describe('The specific model of the vehicle'),
  year: z.number().describe('The manufacturing year of the vehicle'),
  ask_price: z.number().describe('The listed price of the vehicle'),
  mileage: z.number().optional().describe('The current mileage of the vehicle'),
  vin: z.string().describe('The 17-character Vehicle Identification Number').optional(),
  condition: z.enum(['run_drive', 'repairable', 'parts_only', 'clean_title', 'rebuilt_title', 'salvage_title', 'flood', 'fire', 'hail']).default('run_drive'),
  damage_type: z.string().optional().describe('Type of damage if any (e.g., front end, hail, water)'),
  color: z.string().optional(),
  body_style: z.string().optional(),
  fuel_type: z.string().optional(),
  transmission: z.string().optional(),
  drivetrain: z.string().optional(),
  engine: z.string().optional(),
  images: z.array(z.string()).describe('An array of image URLs found on the page').default([]),
  description: z.string().optional().describe('A summary of the deal description and notable features'),
});

export type ExtractedVehicleData = z.infer<typeof VehicleDataSchema>;

/**
 * Agent responsible for extracting structured vehicle data from raw, unstructured text or HTML.
 */
export async function extractVehicleDataFromText(rawText: string): Promise<ExtractedVehicleData | null> {
  try {
    const { object } = await generateObject({
      model: structuredModel,
      schema: VehicleDataSchema,
      prompt: `
        Extract the vehicle data from the following raw text or HTML scraped from a dealer website.
        If a specific piece of information is not found, leave it empty or use the default value.
        Be robust against typos and varied formatting. Make sure to pull out all image URLs if they exist.
        
        Raw Data:
        ${rawText.substring(0, 30000)} // Truncate to prevent token limits on massive pages
      `,
    });
    
    return object;
  } catch (error) {
    console.error('Failed to extract vehicle data:', error);
    return null;
  }
}
