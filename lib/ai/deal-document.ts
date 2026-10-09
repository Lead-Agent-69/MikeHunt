import { z } from "zod";

const amount = z.number().finite().nonnegative().nullable();
const lineItem = z.object({
  name: z.string().trim().min(1).max(200),
  amount: z.number().finite().nonnegative(),
});

export const dealDocumentSchema = z.object({
  vehicle: z.object({
    year: z.number().int().min(1886).max(2100).nullable(),
    make: z.string().max(100).nullable(),
    model: z.string().max(200).nullable(),
    vin: z.string().max(17).nullable(),
    mileage: amount,
  }),
  selling_price: amount,
  fees: z.array(lineItem).max(100),
  addons: z.array(lineItem).max(100),
  taxes: amount,
  total_out_the_door: amount,
  red_flags: z.array(z.string().max(500)).max(30),
});

export function parseDealDocument(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) throw new Error("Missing document JSON");
  return dealDocumentSchema.parse(JSON.parse(text.slice(start, end + 1)));
}
