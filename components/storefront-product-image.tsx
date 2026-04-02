import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type StorefrontProductImageVariant = "card" | "category" | "detail" | "thumb";

type StorefrontProductImageProps = {
  src?: string | null;
  alt: string;
  variant: StorefrontProductImageVariant;
  className?: string;
  imageClassName?: string;
  fallback?: ReactNode;
  sizes?: string;
  quality?: number;
  priority?: boolean;
  onError?: ComponentProps<typeof Image>["onError"];
};

const variantConfig: Record<
  StorefrontProductImageVariant,
  {
    containerClassName: string;
    imageClassName: string;
    fallbackClassName: string;
    sizes: string;
    quality: number;
  }
> = {
  card: {
    containerClassName: "relative h-52 w-full overflow-hidden bg-surface-alt",
    imageClassName: "object-cover",
    fallbackClassName:
      "flex h-full items-center justify-center text-sm text-muted-foreground",
    sizes: "(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 384px",
    quality: 70,
  },
  category: {
    containerClassName: "relative h-56 w-full overflow-hidden bg-surface-alt",
    imageClassName: "object-cover",
    fallbackClassName:
      "flex h-full items-center justify-center text-sm text-muted-foreground",
    sizes: "(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 288px",
    quality: 70,
  },
  detail: {
    containerClassName:
      "relative h-[360px] overflow-hidden rounded-2xl bg-surface-alt md:h-[480px]",
    imageClassName: "object-cover",
    fallbackClassName:
      "flex h-full items-center justify-center text-sm text-muted-foreground",
    sizes: "(max-width: 1023px) 100vw, 560px",
    quality: 75,
  },
  thumb: {
    containerClassName: "relative h-full w-full overflow-hidden rounded-xl bg-surface-alt",
    imageClassName: "object-cover",
    fallbackClassName:
      "flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground",
    sizes: "80px",
    quality: 65,
  },
};

export function StorefrontProductImage({
  src,
  alt,
  variant,
  className,
  imageClassName,
  fallback,
  sizes,
  quality,
  priority = false,
  onError,
}: StorefrontProductImageProps) {
  const config = variantConfig[variant];
  const normalizedSrc = src?.trim();

  return (
    <div className={cn(config.containerClassName, className)}>
      {normalizedSrc ? (
        <Image
          src={normalizedSrc}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes ?? config.sizes}
          quality={quality ?? config.quality}
          className={cn(config.imageClassName, imageClassName)}
          onError={onError}
        />
      ) : (
        fallback ?? <div className={config.fallbackClassName}>No product image</div>
      )}
    </div>
  );
}
