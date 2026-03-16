"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { formatUGX } from "@/lib/format";
import { getProductRepository } from "@/lib/repository-provider";
import type { Product } from "@/types/product";

export function ProductDetailView({ id }: { id: string }) {
  const { addItem } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [imageSrc, setImageSrc] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState("");
  const [flavor, setFlavor] = useState("");

  useEffect(() => {
    const load = async () => {
      const repository = getProductRepository();
      const value = await repository.getById(id);
      setProduct(value);
      setImageSrc(value?.image ?? "");
      if (value?.options?.sizes?.[0]) {
        setSize(value.options.sizes[0]);
      }
      if (value?.options?.flavors?.[0]) {
        setFlavor(value.options.flavors[0]);
      }
    };
    void load();
  }, [id]);

  if (!product) {
    return <p className="text-muted">Loading product...</p>;
  }

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
      <div className="relative h-[360px] overflow-hidden rounded-2xl bg-surface-alt md:h-[480px]">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={product.name}
            fill
            className="object-cover"
            priority
            onError={() => setImageSrc("")}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No product image
          </div>
        )}
      </div>
      <Card>
        <CardContent className="space-y-5 p-6">
          <p className="text-sm uppercase tracking-wide text-badge-foreground">{product.category}</p>
          <h1 className="font-serif text-4xl text-foreground">{product.name}</h1>
          <p className="text-muted">{product.description}</p>
          <p className="text-2xl font-semibold text-foreground">{formatUGX(product.priceUGX)}</p>
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
                priceUGX: product.priceUGX,
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
