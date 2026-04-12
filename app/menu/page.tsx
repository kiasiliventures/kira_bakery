import type { Metadata } from "next";
import { MenuCatalog } from "@/components/menu-catalog";
import { getCachedCatalogProducts } from "@/lib/catalog/products";

export const metadata: Metadata = {
  title: "Menu",
  description:
    "Browse the KiRA Bakery menu for breads, cakes, pastries, yoghurt, and other freshly baked treats.",
  alternates: {
    canonical: "/menu",
  },
};

type MenuPageProps = {
  searchParams?: Promise<{
    category?: string;
  }>;
};

export default async function MenuPage({ searchParams }: MenuPageProps) {
  const products = await getCachedCatalogProducts();
  const resolvedSearchParams = await searchParams;
  const initialCategory = resolvedSearchParams?.category?.trim() || undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-4xl text-foreground">Menu</h1>
      <p className="max-w-2xl text-muted">
        Browse our range of freshly baked breads, cakes, pastries, yoghurt and other delightful treats.
      </p>
      <MenuCatalog products={products} initialCategory={initialCategory} />
    </div>
  );
}
