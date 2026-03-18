import "server-only";

import { unstable_cache } from "next/cache";
import {
  mapLegacyAdminProductRow,
  mapLegacyProductRow,
  mapSharedProductRow,
} from "@/lib/supabase/mappers";
import { getSupabasePublicServerClient } from "@/lib/supabase/server";
import type { Product, ProductCategory } from "@/types/product";

type SharedCatalogProductRow = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  base_price: string | number;
  stock_quantity: number;
  is_available: boolean;
  is_featured: boolean;
  categories?: { name: string } | { name: string }[] | null;
};

export const CATALOG_REVALIDATE_SECONDS = 300;

let lastKnownCatalogProducts: Product[] | null = null;
const lastKnownCatalogProductsById = new Map<string, Product>();

function rememberCatalogProducts(products: Product[]) {
  lastKnownCatalogProducts = products;

  for (const product of products) {
    lastKnownCatalogProductsById.set(product.id, product);
  }
}

function rememberCatalogProduct(product: Product | null) {
  if (!product) {
    return;
  }

  lastKnownCatalogProductsById.set(product.id, product);
}

async function loadCatalogProducts(): Promise<Product[]> {
  const supabase = getSupabasePublicServerClient();
  const shared = await supabase
    .from("products")
    .select(
      "id,name,description,image_url,base_price,stock_quantity,is_available,is_featured,categories(name)",
    )
    .order("created_at", { ascending: false });

  if (shared.error?.code === "42703") {
    const legacy = await supabase
      .from("products")
      .select("id,name,description,category,price_ugx,image,sold_out,featured,options")
      .order("created_at", { ascending: false });

    if (legacy.error?.code === "42703") {
      const legacyAdmin = await supabase
        .from("products")
        .select(
          "id,name,description,image_url,is_available,is_featured,categories(name),product_variants(name,price,is_available,sort_order)",
        )
        .order("created_at", { ascending: false });

      if (legacyAdmin.error) {
        console.error("catalog_legacy_admin_read_failed", legacyAdmin.error.message);
        throw new Error("Unable to load products.");
      }

      return (legacyAdmin.data ?? []).map(mapLegacyAdminProductRow);
    }

    if (legacy.error) {
      console.error("catalog_legacy_read_failed", legacy.error.message);
      throw new Error("Unable to load products.");
    }

    return (legacy.data ?? []).map(mapLegacyProductRow);
  }

  if (shared.error) {
    console.error("catalog_read_failed", shared.error.message);
    throw new Error("Unable to load products.");
  }

  return ((shared.data ?? []) as SharedCatalogProductRow[]).map(mapSharedProductRow);
}

async function loadCatalogProductById(id: string): Promise<Product | null> {
  const supabase = getSupabasePublicServerClient();
  const shared = await supabase
    .from("products")
    .select(
      "id,name,description,image_url,base_price,stock_quantity,is_available,is_featured,categories(name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (shared.error?.code === "42703") {
    const legacy = await supabase
      .from("products")
      .select("id,name,description,category,price_ugx,image,sold_out,featured,options")
      .eq("id", id)
      .maybeSingle();

    if (legacy.error?.code === "42703") {
      const legacyAdmin = await supabase
        .from("products")
        .select(
          "id,name,description,image_url,is_available,is_featured,categories(name),product_variants(name,price,is_available,sort_order)",
        )
        .eq("id", id)
        .maybeSingle();

      if (legacyAdmin.error) {
        console.error("catalog_product_legacy_admin_read_failed", legacyAdmin.error.message);
        throw new Error("Unable to load product.");
      }

      return legacyAdmin.data ? mapLegacyAdminProductRow(legacyAdmin.data) : null;
    }

    if (legacy.error) {
      console.error("catalog_product_legacy_read_failed", legacy.error.message);
      throw new Error("Unable to load product.");
    }

    return legacy.data ? mapLegacyProductRow(legacy.data) : null;
  }

  if (shared.error) {
    console.error("catalog_product_read_failed", shared.error.message);
    throw new Error("Unable to load product.");
  }

  return shared.data ? mapSharedProductRow(shared.data as SharedCatalogProductRow) : null;
}

const getCachedCatalogProductsLoader = unstable_cache(loadCatalogProducts, ["catalog-products"], {
  revalidate: CATALOG_REVALIDATE_SECONDS,
});

export async function getCachedCatalogProducts(): Promise<Product[]> {
  try {
    const products = await getCachedCatalogProductsLoader();
    rememberCatalogProducts(products);
    return products;
  } catch (error) {
    if (lastKnownCatalogProducts) {
      console.warn(
        "catalog_products_using_stale_fallback",
        error instanceof Error ? error.message : error,
      );
      return lastKnownCatalogProducts;
    }

    throw error;
  }
}

export async function getCachedCatalogProductById(id: string): Promise<Product | null> {
  try {
    const product = await unstable_cache(
      async () => loadCatalogProductById(id),
      ["catalog-product", id],
      { revalidate: CATALOG_REVALIDATE_SECONDS },
    )();

    rememberCatalogProduct(product);
    return product;
  } catch (error) {
    const fallbackProduct =
      lastKnownCatalogProductsById.get(id)
      ?? lastKnownCatalogProducts?.find((product) => product.id === id)
      ?? null;

    if (fallbackProduct) {
      console.warn(
        "catalog_product_using_stale_fallback",
        id,
        error instanceof Error ? error.message : error,
      );
      return fallbackProduct;
    }

    throw error;
  }
}

export async function getCachedCategoryImages(): Promise<
  Partial<Record<ProductCategory, string>>
> {
  const images: Partial<Record<ProductCategory, string>> = {};

  let products: Product[];
  try {
    products = await getCachedCatalogProducts();
  } catch (error) {
    console.error(
      "catalog_category_images_failed",
      error instanceof Error ? error.message : error,
    );
    return images;
  }

  for (const product of products) {
    if (!product.soldOut && product.image && !images[product.category]) {
      images[product.category] = product.image;
    }
  }

  return images;
}
