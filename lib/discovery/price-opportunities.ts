import { z } from "zod";
import type { DiscoveryDeal } from "@/components/discovery/types";

const responseSchema = z
  .object({
    configured: z.boolean().optional(),
    state: z.string(),
    count: z.number().finite().nonnegative(),
    deals: z.array(
      z
        .object({
          id: z.string().min(1),
          title: z.string(),
          source: z.string(),
          askPrice: z.number().finite(),
          images: z.array(z.string()),
          grade: z.enum(["great", "good", "fair", "high", "unknown"]),
          gradeLabel: z.string(),
          discountPct: z.number().finite(),
          listingCount: z.number().finite().nonnegative(),
          alsoOn: z.array(
            z.object({
              source: z.string(),
              askPrice: z.number().finite(),
              url: z.string(),
            }),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type PriceOpportunities = {
  deals: DiscoveryDeal[];
  count: number;
  state: string;
};

export async function loadPriceOpportunities(
  url: string,
): Promise<PriceOpportunities> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Price opportunities unavailable");
  const body = responseSchema.parse(await response.json());
  if (body.configured === false)
    throw new Error("Inventory connection unavailable");
  return body as PriceOpportunities;
}
