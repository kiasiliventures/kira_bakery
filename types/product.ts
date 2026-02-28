export const PRODUCT_CATEGORIES = [
  "Bread",
  "Cakes",
  "Pastries",
  "Savory",
  "Pizza",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type ProductOptionSet = {
  sizes?: string[];
  flavors?: string[];
};

export type Product = {
  id: string;
  name: string;
  description: string;
  category: ProductCategory;
  priceUGX: number;
  image: string;
  soldOut: boolean;
  featured?: boolean;
  options?: ProductOptionSet;
};

