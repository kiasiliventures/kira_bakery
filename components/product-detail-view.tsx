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

const FALLBACK_PRODUCT_IMAGE =
  "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=80";

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
    return <p className="text-[#5f4637]">Loading product...</p>;
  }

  return (
    <section className="grid gap-8 lg:grid-cols-2">
      <div className="relative h-[360px] overflow-hidden rounded-2xl md:h-[480px]">
        <Image
          src={imageSrc || FALLBACK_PRODUCT_IMAGE}
          alt={product.name}
          fill
          className="object-cover"
          priority
          onError={() => setImageSrc(FALLBACK_PRODUCT_IMAGE)}
        />
      </div>
      <Card>
        <CardContent className="space-y-5 p-6">
          <p className="text-sm uppercase tracking-wide text-[#7A4A2A]">{product.category}</p>
          <h1 className="font-serif text-4xl text-[#2D1F16]">{product.name}</h1>
          <p className="text-[#5f4637]">{product.description}</p>
          <p className="text-2xl font-semibold text-[#2D1F16]">{formatUGX(product.priceUGX)}</p>
          {product.options?.sizes && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Size</label>
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
              <label className="text-sm font-medium">Flavor</label>
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
            <label className="text-sm font-medium">Quantity</label>
            <Select
              value={String(quantity)}
              onChange={(event) => setQuantity(Number(event.target.value))}
            >
              {[1, 2, 3, 4, 5].map((value) => (
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
                image: imageSrc || FALLBACK_PRODUCT_IMAGE,
                priceUGX: product.priceUGX,
                selectedSize: size || undefined,
                selectedFlavor: flavor || undefined,
                quantity,
              })
            }
          >
            {product.soldOut ? "Sold Out" : "Add to Cart"}
          </Button>
          <Link href="/menu" className="inline-block text-sm text-[#7A4A2A] underline">
            Back to menu
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
