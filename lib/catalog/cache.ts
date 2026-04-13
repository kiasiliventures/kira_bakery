import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

export const CATALOG_PRODUCTS_TAG = "catalog:products";
export const CATALOG_BASE_REVALIDATION_PATHS = [
  "/",
  "/menu",
  "/api/products",
  "/sitemap.xml",
] as const;

export type CatalogRevalidationSource =
  | "admin_category_create"
  | "admin_category_patch"
  | "admin_product_create"
  | "admin_product_patch"
  | "admin_product_image_upload"
  | "admin_product_delete"
  | "admin_variant_create"
  | "admin_variant_patch";

type CatalogMutationInvalidationRule = {
  tags: readonly string[];
  paths: readonly string[];
  includeProductScopedSurfaces: boolean;
};

export const CATALOG_MUTATION_INVALIDATION_MAP: Record<
  CatalogRevalidationSource,
  CatalogMutationInvalidationRule
> = {
  admin_category_create: {
    tags: [CATALOG_PRODUCTS_TAG],
    paths: CATALOG_BASE_REVALIDATION_PATHS,
    includeProductScopedSurfaces: false,
  },
  admin_category_patch: {
    tags: [CATALOG_PRODUCTS_TAG],
    paths: CATALOG_BASE_REVALIDATION_PATHS,
    includeProductScopedSurfaces: true,
  },
  admin_product_create: {
    tags: [CATALOG_PRODUCTS_TAG],
    paths: CATALOG_BASE_REVALIDATION_PATHS,
    includeProductScopedSurfaces: true,
  },
  admin_product_patch: {
    tags: [CATALOG_PRODUCTS_TAG],
    paths: CATALOG_BASE_REVALIDATION_PATHS,
    includeProductScopedSurfaces: true,
  },
  admin_product_image_upload: {
    tags: [CATALOG_PRODUCTS_TAG],
    paths: CATALOG_BASE_REVALIDATION_PATHS,
    includeProductScopedSurfaces: true,
  },
  admin_product_delete: {
    tags: [CATALOG_PRODUCTS_TAG],
    paths: CATALOG_BASE_REVALIDATION_PATHS,
    includeProductScopedSurfaces: true,
  },
  admin_variant_create: {
    tags: [CATALOG_PRODUCTS_TAG],
    paths: CATALOG_BASE_REVALIDATION_PATHS,
    includeProductScopedSurfaces: true,
  },
  admin_variant_patch: {
    tags: [CATALOG_PRODUCTS_TAG],
    paths: CATALOG_BASE_REVALIDATION_PATHS,
    includeProductScopedSurfaces: true,
  },
};

export function getCatalogProductTag(productId: string) {
  return `catalog:product:${productId}`;
}

function normalizeProductIds(productIds: string[]) {
  return [...new Set(productIds.map((productId) => productId.trim()).filter(Boolean))];
}

export function getCatalogRevalidationPaths(
  source: CatalogRevalidationSource,
  productIds: string[],
) {
  const normalizedProductIds = normalizeProductIds(productIds);
  const rule = CATALOG_MUTATION_INVALIDATION_MAP[source];
  const paths = new Set<string>(rule.paths);

  if (rule.includeProductScopedSurfaces) {
    for (const productId of normalizedProductIds) {
      paths.add(`/menu/${productId}`);
      paths.add(`/api/products/${productId}`);
    }
  }

  return [...paths];
}

export function getCatalogRevalidationTags(
  source: CatalogRevalidationSource,
  productIds: string[],
) {
  const normalizedProductIds = normalizeProductIds(productIds);
  const rule = CATALOG_MUTATION_INVALIDATION_MAP[source];
  const tags = new Set<string>(rule.tags);

  if (rule.includeProductScopedSurfaces) {
    for (const productId of normalizedProductIds) {
      tags.add(getCatalogProductTag(productId));
    }
  }

  return [...tags];
}

export function revalidateCatalogMenuSurfaces(
  source: CatalogRevalidationSource,
  productIds: string[],
) {
  const normalizedProductIds = normalizeProductIds(productIds);
  const tags = getCatalogRevalidationTags(source, normalizedProductIds);

  for (const tag of tags) {
    revalidateTag(tag, "max");
  }

  const paths = getCatalogRevalidationPaths(source, normalizedProductIds);

  for (const path of paths) {
    revalidatePath(path);
  }

  return {
    source,
    tags,
    paths,
    productIds: normalizedProductIds,
  };
}
