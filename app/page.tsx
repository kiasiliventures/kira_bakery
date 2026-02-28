import Image from "next/image";
import Link from "next/link";
import { CategoryTile } from "@/components/category-tile";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#7A4A2A]">
            Since 2020
          </p>
          <h1 className="max-w-xl text-5xl leading-tight text-[#2D1F16] md:text-6xl">
            Delicious Baked Fresh Daily
          </h1>
          <p className="max-w-lg text-lg text-[#5f4637]">
            Artisan breads, pastries, cakes, and pizza made fresh in Kira every day.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/menu">
              <Button size="lg">Order Now</Button>
            </Link>
            <Link href="/menu">
              <Button size="lg" variant="outline">
                View Menu
              </Button>
            </Link>
          </div>
        </div>
        <div className="relative h-[420px] overflow-hidden rounded-2xl">
          <Image
            src="https://images.unsplash.com/photo-1517433670267-08bbd4be890f?auto=format&fit=crop&w=1400&q=80"
            alt="Fresh bakery display interior"
            fill
            priority
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-6 text-3xl text-[#2D1F16]">Browse Categories</h2>
        <div className="grid gap-6 md:grid-cols-3">
          <CategoryTile
            name="Pastries"
            href="/menu"
            image="https://images.unsplash.com/photo-1483695028939-5bb13f8648b0?auto=format&fit=crop&w=1200&q=80"
          />
          <CategoryTile
            name="Bread"
            href="/menu"
            image="https://images.unsplash.com/photo-1608198093002-ad4e005484ec?auto=format&fit=crop&w=1200&q=80"
          />
          <CategoryTile
            name="Cakes"
            href="/menu"
            image="https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=1200&q=80"
          />
        </div>
      </section>
    </div>
  );
}
