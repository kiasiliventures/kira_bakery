import { z } from "zod";
import { PRODUCT_CATEGORIES } from "@/types/product";

export const checkoutSchema = z
  .object({
    deliveryMethod: z.enum(["delivery", "pickup"]),
    customerName: z.string().min(2, "Name is required"),
    phone: z
      .string()
      .min(9, "Phone is required")
      .regex(/^\+?[0-9]{9,15}$/, "Use a valid phone number"),
    email: z.string().email("Use a valid email").optional().or(z.literal("")),
    address: z.string().optional().or(z.literal("")),
    deliveryDate: z.string().optional().or(z.literal("")),
    notes: z.string().max(300, "Keep notes under 300 characters").optional(),
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

      if (!data.deliveryDate || data.deliveryDate.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deliveryDate"],
          message: "Delivery date is required for delivery",
        });
      }
    }
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

export const adminProductSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(8),
  category: z.enum(PRODUCT_CATEGORIES),
  priceUGX: z.coerce.number().int().min(3000),
  image: z.string().url("Use a valid image URL"),
  soldOut: z.coerce.boolean().default(false),
});

export type CheckoutSchemaInput = z.infer<typeof checkoutSchema>;
export type CakeBuilderSchemaInput = z.infer<typeof cakeBuilderSchema>;
export type AdminProductSchemaInput = z.infer<typeof adminProductSchema>;
