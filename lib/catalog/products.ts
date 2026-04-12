import "server-only";

import { unstable_cache } from "next/cache";
import { CATALOG_PRODUCTS_TAG, getCatalogProductTag } from "@/lib/catalog/cache";
import {
  mapLegacyAdminProductRow,
  mapLegacyProductRow,
  mapSharedProductRow,
} from "@/lib/supabase/mappers";
import { getSupabasePublicServerClient } from "@/lib/supabase/server";
import { sortProductCategories, type Product, type ProductCategory } from "@/types/product";

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

export const CATALOG_REVALIDATE_SECONDS = 600;
const KAMPALA_TIME_ZONE = "Africa/Kampala";
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

const kampalaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: KAMPALA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getWeeklyRotationBucket(now = new Date()) {
  const parts = kampalaDateFormatter.formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  const kampalaDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = kampalaDate.getUTCDay() || 7;
  const thursday = new Date(kampalaDate);
  thursday.setUTCDate(kampalaDate.getUTCDate() + (4 - dayOfWeek));

  const weekYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
  const firstDayOfWeek = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + (4 - firstDayOfWeek));

  const week = 1 + Math.floor((thursday.getTime() - firstThursday.getTime()) / WEEK_IN_MS);

  return weekYear * 100 + week;
}

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

export function getCatalogCategories(products: Product[]) {
  return sortProductCategories(products.map((product) => product.category));
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
  tags: [CATALOG_PRODUCTS_TAG],
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
      {
        revalidate: CATALOG_REVALIDATE_SECONDS,
        tags: [CATALOG_PRODUCTS_TAG, getCatalogProductTag(id)],
      },
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

export async function getCachedCategoryImages(): Promise<Record<ProductCategory, string[]>> {
  const result: Record<ProductCategory, string[]> = {};

  let products: Product[];
  try {
    products = await getCachedCatalogProducts();
  } catch (error) {
    console.error(
      "catalog_category_images_failed",
      error instanceof Error ? error.message : error,
    );
    return result;
  }

  const categories = getCatalogCategories(products);
  const imagesByCategory = new Map<ProductCategory, Set<string>>();
  const imageSortKeysByCategory = new Map<ProductCategory, Map<string, string>>();
  const eligibleProducts = products
    .filter((product) => !product.soldOut && product.image.trim().length > 0)
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );

  for (const product of eligibleProducts) {
    const image = product.image.trim();
    const categoryImages = imagesByCategory.get(product.category) ?? new Set<string>();
    const imageSortKeys = imageSortKeysByCategory.get(product.category) ?? new Map<string, string>();

    if (!imagesByCategory.has(product.category)) {
      imagesByCategory.set(product.category, categoryImages);
    }

    if (!imageSortKeysByCategory.has(product.category)) {
      imageSortKeysByCategory.set(product.category, imageSortKeys);
    }

    categoryImages.add(image);

    if (!imageSortKeys.has(image)) {
      imageSortKeys.set(image, `${product.name}\u0000${product.id}`);
    }
  }

  const bucket = getWeeklyRotationBucket();

  for (const category of categories) {
    const images = [...(imagesByCategory.get(category) ?? new Set<string>())].sort(
      (left, right) => {
        const sortKeys = imageSortKeysByCategory.get(category);
        const leftKey = sortKeys?.get(left) ?? left;
        const rightKey = sortKeys?.get(right) ?? right;

        return leftKey.localeCompare(rightKey) || left.localeCompare(right);
      },
    );

    if (images.length === 0) {
      result[category] = [];
      continue;
    }

    // Monday-based Kampala weeks keep the leading image stable for the whole week,
    // while preserving the rest of the ordered candidates as client-side fallbacks.
    const startIndex = bucket % images.length;
    result[category] = [
      ...images.slice(startIndex),
      ...images.slice(0, startIndex),
    ];
  }

  return result;
}
