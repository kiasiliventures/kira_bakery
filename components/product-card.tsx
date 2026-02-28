"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useCart } from "@/components/providers/app-provider";
import { formatUGX } from "@/lib/format";
import type { Product } from "@/types/product";

type ProductCardProps = {
  product: Product;
};

const FALLBACK_PRODUCT_IMAGE =
  "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=80";

export function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();
  const [imageSrc, setImageSrc] = useState(product.image);

  return (
    <Card className="overflow-hidden">
      <Link href={`/menu/${product.id}`} className="block">
        <div className="relative h-52 w-full">
          <Image
            src={imageSrc}
            alt={product.name}
            fill
            className="rounded-t-2xl object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
            onError={() => setImageSrc(FALLBACK_PRODUCT_IMAGE)}
          />
        </div>
      </Link>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{product.name}</CardTitle>
          {product.soldOut && (
            <Badge className="bg-[#f4d4d4] text-[#8f2a2a]">Sold Out</Badge>
          )}
        </div>
        <p className="text-sm text-[#5f4637]">{product.description}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="font-semibold text-[#2D1F16]">{formatUGX(product.priceUGX)}</p>
      </CardContent>
      <CardFooter className="pt-0">
        <Button
          disabled={product.soldOut}
          className="w-full"
          onClick={() =>
            addItem({
              productId: product.id,
              name: product.name,
              image: imageSrc,
              priceUGX: product.priceUGX,
            })
          }
        >
          {product.soldOut ? "Unavailable" : "Add to Cart"}
        </Button>
      </CardFooter>
    </Card>
  );
}
