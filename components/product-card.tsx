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

export function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();
  const [imageSrc, setImageSrc] = useState(product.image);

  return (
    <Card className="overflow-hidden">
      <Link href={`/menu/${product.id}`} className="block">
        <div className="relative h-52 w-full bg-surface-alt">
          {imageSrc ? (
            <Image
              src={imageSrc}
              alt={product.name}
              fill
              className="rounded-t-2xl object-cover"
              sizes="(max-width: 768px) 100vw, 33vw"
              onError={() => setImageSrc("")}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-t-2xl text-sm text-muted-foreground">
              No product image
            </div>
          )}
        </div>
      </Link>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{product.name}</CardTitle>
          {product.soldOut && (
            <Badge className="bg-danger-soft text-danger">Sold Out</Badge>
          )}
        </div>
        <p className="text-sm text-muted">{product.description}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="font-semibold text-foreground">{formatUGX(product.priceUGX)}</p>
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
