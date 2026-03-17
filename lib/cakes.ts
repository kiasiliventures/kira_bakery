import { z } from "zod";
import type { CakePrice, CakeSelection } from "@/types/cakes";

const uuidSchema = z.string().uuid("Select a valid option");

export const cakeRequestSchema = z.object({
  customerName: z.string().trim().min(2, "Name is required").max(120),
  phone: z.string().trim().min(7, "Phone is required").max(40),
  email: z.string().trim().email("Use a valid email").max(200).optional().or(z.literal("")),
  eventDate: z.string().min(1, "Event date is required"),
  messageOnCake: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  priceId: uuidSchema,
  flavourId: uuidSchema,
  shapeId: uuidSchema,
  sizeId: uuidSchema,
  tierOptionId: uuidSchema,
  toppingId: uuidSchema,
});

export type CakeRequestInput = z.infer<typeof cakeRequestSchema>;

export const cakeSelectionFields = [
  "shapeId",
  "sizeId",
  "tierOptionId",
  "flavourId",
  "toppingId",
] as const satisfies Array<keyof CakeSelection>;

export function matchesCakeSelection(
  price: CakePrice,
  selection: Partial<CakeSelection>,
  omitField?: keyof CakeSelection,
) {
  return (
    (omitField === "flavourId" || !selection.flavourId || price.flavourId === selection.flavourId) &&
    (omitField === "shapeId" || !selection.shapeId || price.shapeId === selection.shapeId) &&
    (omitField === "sizeId" || !selection.sizeId || price.sizeId === selection.sizeId) &&
    (omitField === "tierOptionId"
      || !selection.tierOptionId
      || price.tierOptionId === selection.tierOptionId) &&
    (omitField === "toppingId" || !selection.toppingId || price.toppingId === selection.toppingId)
  );
}

export function getDistinctIds(
  prices: CakePrice[],
  selection: Partial<CakeSelection>,
  field: keyof CakeSelection,
) {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const price of prices) {
    if (!matchesCakeSelection(price, selection, field)) {
      continue;
    }

    const value = price[field];
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    ids.push(value);
  }

  return ids;
}
