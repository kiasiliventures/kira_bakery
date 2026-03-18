export const PRODUCT_CATEGORIES = [
  "Bread",
  "Cakes",
  "Pastries",
  "Others",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type ProductOptionSet = {
  sizes?: string[];
  flavors?: string[];
};

export type ProductVariantPrice = {
  label: string;
  priceUGX: number;
};

export type Product = {
  id: string;
  name: string;
  description: string;
  category: ProductCategory;
  priceUGX: number;
  image: string;
  soldOut: boolean;
  stockQuantity?: number;
  featured?: boolean;
  options?: ProductOptionSet;
  variantPrices?: ProductVariantPrice[];
};
