"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { sortProductCategories, type Product, type ProductCategory } from "@/types/product";

type MenuCatalogProps = {
  products: Product[];
  initialCategory?: string;
};

export function MenuCatalog({ products, initialCategory }: MenuCatalogProps) {
  const categories = useMemo(
    () => sortProductCategories(products.map((product) => product.category)),
    [products],
  );
  const resolvedInitialCategory = useMemo(
    () =>
      categories.find(
        (category) => category.toLowerCase() === initialCategory?.trim().toLowerCase(),
      ),
    [categories, initialCategory],
  );
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>("");
  const activeCategory =
    (selectedCategory && categories.includes(selectedCategory) ? selectedCategory : null)
    ?? resolvedInitialCategory
    ?? categories[0]
    ?? "";

  const filtered = products.filter((product) => product.category === activeCategory);

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <Button
            key={category}
            variant={activeCategory === category ? "default" : "outline"}
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </Button>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {categories.length === 0 ? (
        <p className="text-muted">No menu categories are available right now.</p>
      ) : null}
      {categories.length > 0 && filtered.length === 0 ? (
        <p className="text-muted">No products are currently available in {activeCategory}.</p>
      ) : null}
    </section>
  );
}
