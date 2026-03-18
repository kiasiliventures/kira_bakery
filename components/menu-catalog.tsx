"use client";

import { useState } from "react";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { PRODUCT_CATEGORIES, type Product, type ProductCategory } from "@/types/product";

type MenuCatalogProps = {
  products: Product[];
};

export function MenuCatalog({ products }: MenuCatalogProps) {
  const [activeCategory, setActiveCategory] = useState<ProductCategory>("Bread");

  const filtered = products.filter((product) => product.category === activeCategory);

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {PRODUCT_CATEGORIES.map((category) => (
          <Button
            key={category}
            variant={activeCategory === category ? "default" : "outline"}
            onClick={() => setActiveCategory(category)}
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
    </section>
  );
}
