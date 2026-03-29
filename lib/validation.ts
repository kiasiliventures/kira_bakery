import { z } from "zod";

const CHECKOUT_CUSTOMER_NAME_MAX_LENGTH = 80;
const CHECKOUT_ADDRESS_MAX_LENGTH = 240;
const CHECKOUT_LOCATION_FIELD_MAX_LENGTH = 240;
const CHECKOUT_DELIVERY_QUOTE_TOKEN_MAX_LENGTH = 1_024;
const CHECKOUT_OPTIONAL_NOTES_MAX_LENGTH = 300;

function emptyStringToUndefined(value: unknown) {
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return value;
}

function optionalTextFieldWithMax(maxLength: number, message: string) {
  return z.string().max(maxLength, message).optional().or(z.literal(""));
}

const optionalFiniteNumber = z.preprocess(
  emptyStringToUndefined,
  z.number().finite().optional(),
);

export const deliveryLocationSchema = z.object({
  placeId: optionalTextFieldWithMax(
    CHECKOUT_LOCATION_FIELD_MAX_LENGTH,
    `Keep the delivery place identifier under ${CHECKOUT_LOCATION_FIELD_MAX_LENGTH} characters`,
  ),
  addressText: optionalTextFieldWithMax(
    CHECKOUT_LOCATION_FIELD_MAX_LENGTH,
    `Keep the delivery location under ${CHECKOUT_LOCATION_FIELD_MAX_LENGTH} characters`,
  ),
  latitude: optionalFiniteNumber,
  longitude: optionalFiniteNumber,
});

export const checkoutSchema = z
  .object({
    deliveryMethod: z.enum(["delivery", "pickup"]),
    customerName: z
      .string()
      .min(2, "Name is required")
      .max(
        CHECKOUT_CUSTOMER_NAME_MAX_LENGTH,
        `Keep your name under ${CHECKOUT_CUSTOMER_NAME_MAX_LENGTH} characters`,
      ),
    phone: z
      .string()
      .min(9, "Phone is required")
      .regex(/^\+?[0-9]{9,15}$/, "Use a valid phone number"),
    email: z.string().email("Use a valid email").optional().or(z.literal("")),
    address: optionalTextFieldWithMax(
      CHECKOUT_ADDRESS_MAX_LENGTH,
      `Keep the address under ${CHECKOUT_ADDRESS_MAX_LENGTH} characters`,
    ),
    deliveryDate: optionalTextFieldWithMax(40, "Use a shorter delivery date value"),
    notes: z
      .string()
      .max(
        CHECKOUT_OPTIONAL_NOTES_MAX_LENGTH,
        `Keep notes under ${CHECKOUT_OPTIONAL_NOTES_MAX_LENGTH} characters`,
      )
      .optional(),
    deliveryLocation: deliveryLocationSchema.optional(),
    deliveryQuoteToken: optionalTextFieldWithMax(
      CHECKOUT_DELIVERY_QUOTE_TOKEN_MAX_LENGTH,
      `Keep the delivery quote token under ${CHECKOUT_DELIVERY_QUOTE_TOKEN_MAX_LENGTH} characters`,
    ),
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
  sessionToken: optionalTextFieldWithMax(200, "Keep the session token under 200 characters"),
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
