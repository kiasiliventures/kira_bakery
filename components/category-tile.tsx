import Image from "next/image";
import Link from "next/link";

type CategoryTileProps = {
  name: string;
  image: string;
  href: string;
};

export function CategoryTile({ name, image, href }: CategoryTileProps) {
  return (
    <Link href={href}>
      <div className="group relative h-56 overflow-hidden rounded-2xl shadow-[0_6px_18px_rgba(53,35,24,0.12)] transition-transform duration-200 hover:-translate-y-0.5">
        <Image
          src={image}
          alt={name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/52 via-black/15 to-transparent" />
        <p className="absolute bottom-4 left-4 font-serif text-2xl text-white">{name}</p>
      </div>
    </Link>
  );
}
