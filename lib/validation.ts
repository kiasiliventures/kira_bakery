import { z } from "zod";

function emptyStringToUndefined(value: unknown) {
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return value;
}

const optionalTextField = z.string().optional().or(z.literal(""));
const optionalFiniteNumber = z.preprocess(
  emptyStringToUndefined,
  z.number().finite().optional(),
);

export const deliveryLocationSchema = z.object({
  placeId: optionalTextField,
  addressText: optionalTextField,
  latitude: optionalFiniteNumber,
  longitude: optionalFiniteNumber,
});

export const checkoutSchema = z
  .object({
    deliveryMethod: z.enum(["delivery", "pickup"]),
    customerName: z.string().min(2, "Name is required"),
    phone: z
      .string()
      .min(9, "Phone is required")
      .regex(/^\+?[0-9]{9,15}$/, "Use a valid phone number"),
    email: z.string().email("Use a valid email").optional().or(z.literal("")),
    address: optionalTextField,
    deliveryDate: optionalTextField,
    notes: z.string().max(300, "Keep notes under 300 characters").optional(),
    deliveryLocation: deliveryLocationSchema.optional(),
    deliveryQuoteToken: optionalTextField,
  })
  .superRefine((data, ctx) => {
    if (data.deliveryMethod === "delivery") {
      if (!data.address || data.address.trim().length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["address"],
          message: "Address is required for delivery",
        });
      }

      if (!data.deliveryLocation?.placeId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["address"],
          message: "Select a valid delivery location from search results",
        });
      }

      if (
        typeof data.deliveryLocation?.latitude !== "number"
        || typeof data.deliveryLocation?.longitude !== "number"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["address"],
          message: "We need a verified delivery location before you can continue",
        });
      }

      if (!data.deliveryDate || data.deliveryDate.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deliveryDate"],
          message: "Delivery date is required for delivery",
        });
      }

      if (!data.deliveryQuoteToken || data.deliveryQuoteToken.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["address"],
          message: "Refresh the delivery quote before placing your order",
        });
      }
    }
  });

export const deliveryQuoteRequestSchema = z.object({
  placeId: z.string().min(1, "A delivery place is required"),
  addressText: z.string().min(3, "A delivery address is required"),
  latitude: optionalFiniteNumber,
  longitude: optionalFiniteNumber,
});

export const deliveryAutocompleteRequestSchema = z.object({
  input: z.string().min(3, "Enter at least 3 characters"),
  sessionToken: optionalTextField,
});

export const cakeBuilderSchema = z
  .object({
    flavor: z.string().min(1, "Flavor is required"),
    size: z.string().min(1, "Size is required"),
    message: z.string().min(2, "Message is required").max(120),
    eventDate: z.string().min(1, "Event date is required"),
    budgetMin: z.coerce.number().int().min(50000),
    budgetMax: z.coerce.number().int().min(60000),
    referenceImageName: z.string().optional(),
  })
  .refine((data) => data.budgetMax >= data.budgetMin, {
    message: "Maximum budget must be greater than minimum budget",
    path: ["budgetMax"],
  });

export type CheckoutSchemaInput = z.infer<typeof checkoutSchema>;
export type CakeBuilderSchemaInput = z.infer<typeof cakeBuilderSchema>;
