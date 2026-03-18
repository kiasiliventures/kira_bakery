import type { Product } from "@/types/product";

export function getDefaultProductSize(product: Product): string | undefined {
  return product.variantPrices?.[0]?.label ?? product.options?.sizes?.[0];
}

export function getSelectedProductPrice(
  product: Product,
  selectedSize?: string,
): number {
  if (!product.variantPrices?.length) {
    return product.priceUGX;
  }

  const matchedVariant = selectedSize
    ? product.variantPrices.find((variant) => variant.label === selectedSize)
    : null;

  return matchedVariant?.priceUGX ?? product.variantPrices[0].priceUGX;
}

export function getProductPriceRange(product: Product):
  | {
      min: number;
      max: number;
    }
  | null {
  if (!product.variantPrices?.length) {
    return null;
  }

  const prices = product.variantPrices.map((variant) => variant.priceUGX);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}
