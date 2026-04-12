export const PRODUCT_CATEGORIES = [
  "Bread",
  "Cakes",
  "Pastries",
  "Others",
] as const;

export type ProductCategory = string;

function getCategoryOrderIndex(category: ProductCategory) {
  const preferredIndex = PRODUCT_CATEGORIES.findIndex(
    (preferredCategory) => preferredCategory.toLowerCase() === category.toLowerCase(),
  );

  return preferredIndex >= 0 ? preferredIndex : Number.MAX_SAFE_INTEGER;
}

export function sortProductCategories(categories: ProductCategory[]) {
  return [...new Set(categories.map((category) => category.trim()).filter(Boolean))].sort(
    (left, right) =>
      getCategoryOrderIndex(left) - getCategoryOrderIndex(right)
      || left.localeCompare(right),
  );
}

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
