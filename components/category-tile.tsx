import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";

type CategoryTileProps = {
  name: string;
  image: string;
  href: string;
};

export function CategoryTile({ name, image, href }: CategoryTileProps) {
  return (
    <Link href={href}>
      <Card className="group overflow-hidden transition-transform hover:-translate-y-1">
        <div className="relative h-48 w-full">
          <Image
            src={image}
            alt={name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
          <p className="absolute bottom-4 left-4 font-serif text-2xl text-white">{name}</p>
        </div>
      </Card>
    </Link>
  );
}

