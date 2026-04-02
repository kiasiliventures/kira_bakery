import Link from "next/link";
import { StorefrontProductImage } from "@/components/storefront-product-image";

type CategoryTileProps = {
  name: string;
  image?: string;
  href: string;
};

export function CategoryTile({ name, image, href }: CategoryTileProps) {
  return (
    <Link href={href}>
      <div className="group relative overflow-hidden rounded-2xl shadow-[var(--shadow-soft)] transition-transform duration-200 hover:-translate-y-0.5">
        <StorefrontProductImage
          src={image}
          alt={name}
          variant="category"
          imageClassName="transition-transform duration-300 group-hover:scale-105"
          fallback={
            <div
              className="h-full w-full"
              style={{ backgroundImage: "var(--gradient-category-fallback)" }}
            />
          }
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/52 via-black/15 to-transparent" />
        <p className="absolute bottom-4 left-4 font-serif text-2xl text-white">{name}</p>
      </div>
    </Link>
  );
}
