import type { MetadataRoute } from "next";
import { getCachedCatalogProducts } from "@/lib/catalog/products";
import { getAbsoluteUrl } from "@/lib/site";
import type { Product } from "@/types/product";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: getAbsoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: getAbsoluteUrl("/menu"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: getAbsoluteUrl("/cake-builder"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: getAbsoluteUrl("/contact"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: getAbsoluteUrl("/classes"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: getAbsoluteUrl("/terms"),
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: getAbsoluteUrl("/privacy"),
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  let products: Product[] = [];
  try {
    products = await getCachedCatalogProducts();
  } catch (error) {
    console.error("sitemap_catalog_load_failed", error instanceof Error ? error.message : error);
  }

  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: getAbsoluteUrl(`/menu/${product.id}`),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...productRoutes];
}
