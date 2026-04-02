"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/providers/app-provider";
import { StorefrontProductImage } from "@/components/storefront-product-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { formatUGX } from "@/lib/format";
import {
  getDefaultProductSize,
  getSelectedProductPrice,
} from "@/lib/product-pricing";
import type { Product } from "@/types/product";

type ProductDetailViewProps = {
  product: Product;
};

export function ProductDetailView({ product }: ProductDetailViewProps) {
  const { addItem } = useCart();
  const [imageSrc, setImageSrc] = useState(product.image);
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState(getDefaultProductSize(product) ?? "");
  const [flavor, setFlavor] = useState(product.options?.flavors?.[0] ?? "");
  const selectedPriceUGX = getSelectedProductPrice(product, size);

  const lowStockCount =
    product.stockQuantity && product.stockQuantity > 0 && product.stockQuantity < 10
      ? product.stockQuantity
      : null;
  const maxSelectableQuantity =
    typeof product.stockQuantity === "number" && product.stockQuantity > 0
      ? Math.min(product.stockQuantity, 5)
      : 5;
  const selectedQuantity = Math.min(quantity, maxSelectableQuantity);

  return (
    <section className="grid gap-8 lg:grid-cols-2">
      <StorefrontProductImage
        src={imageSrc}
        alt={product.name}
        variant="detail"
        priority
        onError={() => setImageSrc("")}
      />
      <Card>
        <CardContent className="space-y-5 p-6">
          <p className="text-sm uppercase tracking-wide text-badge-foreground">{product.category}</p>
          <h1 className="font-serif text-4xl text-foreground">{product.name}</h1>
          <p className="text-muted">{product.description}</p>
          <div className="space-y-1">
            <p className="text-2xl font-semibold text-foreground">{formatUGX(selectedPriceUGX)}</p>
            {product.variantPrices && product.variantPrices.length > 1 ? (
              <p className="text-sm text-muted">Price updates to match your selected size.</p>
            ) : null}
          </div>
          {lowStockCount ? (
            <p className="text-sm font-medium text-badge-foreground">
              {lowStockCount} pieces left
            </p>
          ) : null}
          {product.options?.sizes && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Size</label>
              <Select value={size} onChange={(event) => setSize(event.target.value)}>
                {product.options.sizes.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {product.options?.flavors && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Flavor</label>
              <Select value={flavor} onChange={(event) => setFlavor(event.target.value)}>
                {product.options.flavors.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Quantity</label>
            <Select
              value={String(selectedQuantity)}
              onChange={(event) => setQuantity(Number(event.target.value))}
            >
              {Array.from({ length: maxSelectableQuantity }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </div>
          <Button
            disabled={product.soldOut}
            className="w-full"
            onClick={() =>
              addItem({
                productId: product.id,
                name: product.name,
                image: imageSrc,
                priceUGX: selectedPriceUGX,
                stockQuantity: product.stockQuantity,
                selectedSize: size || undefined,
                selectedFlavor: flavor || undefined,
                quantity: selectedQuantity,
              })
            }
          >
            {product.soldOut ? "Out of Stock" : "Add to Cart"}
          </Button>
          <Link href="/menu" className="inline-block text-sm text-accent underline underline-offset-4">
            Back to menu
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
