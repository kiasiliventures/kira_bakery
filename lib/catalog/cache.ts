import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

export const CATALOG_PRODUCTS_TAG = "catalog:products";

export function getCatalogProductTag(productId: string) {
  return `catalog:product:${productId}`;
}

function normalizeProductIds(productIds: string[]) {
  return [...new Set(productIds.map((productId) => productId.trim()).filter(Boolean))];
}

export function getCatalogRevalidationPaths(productIds: string[]) {
  const normalizedProductIds = normalizeProductIds(productIds);
  const paths = new Set<string>([
    "/",
    "/menu",
    "/api/products",
    "/sitemap.xml",
  ]);

  for (const productId of normalizedProductIds) {
    paths.add(`/menu/${productId}`);
    paths.add(`/api/products/${productId}`);
  }

  return [...paths];
}

export function revalidateCatalogMenuSurfaces(productIds: string[]) {
  const normalizedProductIds = normalizeProductIds(productIds);
  const tags = [CATALOG_PRODUCTS_TAG];

  revalidateTag(CATALOG_PRODUCTS_TAG, "max");

  for (const productId of normalizedProductIds) {
    const tag = getCatalogProductTag(productId);
    revalidateTag(tag, "max");
    tags.push(tag);
  }

  const paths = getCatalogRevalidationPaths(normalizedProductIds);

  for (const path of paths) {
    revalidatePath(path);
  }

  return {
    tags,
    paths,
    productIds: normalizedProductIds,
  };
}
