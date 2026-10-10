import { z } from "zod";

const amount = z.number().finite().nonnegative().nullable().default(null);
const line = z.object({
  name: z.string().min(1).max(200),
  amount: z.number().finite().nonnegative(),
});
export const offerSchema = z.object({
  vehicle: z
    .object({
      year: amount,
      make: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      vin: z.string().nullable().optional(),
      mileage: amount,
    })
    .default({ year: null, mileage: null }),
  selling_price: amount,
  fees: z.array(line).max(100).default([]),
  addons: z.array(line).max(100).default([]),
  taxes: amount,
  total_out_the_door: amount,
  red_flags: z.array(z.string().max(1000)).max(30).default([]),
});
export type Offer = z.infer<typeof offerSchema>;
export function reviewOffer(offer: Offer) {
  const values = [
    offer.selling_price,
    offer.taxes,
    ...offer.fees
      .filter((line) => !/\(already included\)/i.test(line.name))
      .map((line) => line.amount),
    ...offer.addons
      .filter((line) => !/\(already included\)/i.test(line.name))
      .map((line) => line.amount),
  ];
  const sum =
    values.reduce<number>(
      (total, value) => total + (value == null ? 0 : Math.round(value * 100)),
      0,
    ) / 100;
  const difference =
    offer.total_out_the_door == null
      ? null
      : Math.round((offer.total_out_the_door - sum) * 100) / 100;
  return {
    sum,
    difference,
    incomplete: offer.selling_price == null || offer.taxes == null,
  };
}
