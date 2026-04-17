import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type StorefrontProductImageVariant = "thumbnail" | "card" | "detail" | "hero";

type StorefrontProductImageOverridePolicy = {
  sizes?: string;
  quality?: 65 | 70 | 75;
};

type StorefrontProductImageProps = {
  src?: string | null;
  alt: string;
  variant: StorefrontProductImageVariant;
  className?: string;
  imageClassName?: string;
  fallback?: ReactNode;
  priority?: boolean;
  onError?: ComponentProps<typeof Image>["onError"];
  overridePolicy?: StorefrontProductImageOverridePolicy;
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
  thumbnail: {
    containerClassName: "relative h-full w-full overflow-hidden rounded-xl bg-surface-alt",
    imageClassName: "object-cover",
    fallbackClassName:
      "flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground",
    sizes: "80px",
    quality: 65,
  },
  card: {
    containerClassName: "relative h-52 w-full overflow-hidden bg-surface-alt",
    imageClassName: "object-cover",
    fallbackClassName:
      "flex h-full items-center justify-center text-sm text-muted-foreground",
    sizes:
      "(max-width: 767px) calc(100vw - 2rem), (max-width: 1279px) calc((100vw - 3.5rem) / 2), 320px",
    quality: 70,
  },
  detail: {
    containerClassName:
      "relative h-[360px] overflow-hidden rounded-2xl bg-surface-alt md:h-[480px]",
    imageClassName: "object-cover",
    fallbackClassName:
      "flex h-full items-center justify-center text-sm text-muted-foreground",
    sizes: "(max-width: 1023px) calc(100vw - 2rem), 560px",
    quality: 75,
  },
  hero: {
    containerClassName: "relative h-full w-full overflow-hidden bg-surface-alt",
    imageClassName: "object-cover",
    fallbackClassName:
      "flex h-full items-center justify-center text-sm text-muted-foreground",
    sizes: "100vw",
    quality: 75,
  },
};

export function StorefrontProductImage({
  src,
  alt,
  variant,
  className,
  imageClassName,
  fallback,
  priority = false,
  onError,
  overridePolicy,
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
          sizes={overridePolicy?.sizes ?? config.sizes}
          quality={overridePolicy?.quality ?? config.quality}
          className={cn(config.imageClassName, imageClassName)}
          onError={onError}
        />
      ) : (
        fallback ?? <div className={config.fallbackClassName}>No product image</div>
      )}
    </div>
  );
}
