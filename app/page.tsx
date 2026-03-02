import Image from "next/image";
import Link from "next/link";
import { CategoryTile } from "@/components/category-tile";

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="relative left-1/2 right-1/2 -mx-[50vw] min-h-[560px] w-screen overflow-hidden">
        <Image
          src="/images/hero_image.png"
          alt="Premium bakery bread and pastry display"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 mx-auto grid min-h-[560px] w-full max-w-6xl items-center gap-8 px-4 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-5">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#f3dcc6]">
              Since 2020
            </p>
            <h1 className="max-w-xl text-5xl leading-tight text-[#fff8f0] md:text-6xl">
              KiRA Bakery
            </h1>
            <p className="max-w-lg text-lg text-[#f4e7da]">
              Deliciously Baked, Fresh Daily
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/menu"
                className="inline-flex h-12 items-center justify-center rounded-2xl px-8 text-base font-semibold text-white shadow-[0_10px_22px_rgba(148,2,2,0.25)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#940202]/35 focus-visible:ring-offset-2"
                style={{ backgroundColor: "#940202", color: "#FFFFFF" }}
              >
                Order Now
              </Link>
              <Link
                href="/menu"
                className="inline-flex h-12 items-center justify-center rounded-2xl border-2 px-8 text-base font-semibold shadow-[0_6px_16px_rgba(58,42,30,0.08)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#940202]/35 focus-visible:ring-offset-2"
                style={{
                  borderColor: "#940202",
                  backgroundColor: "#FFF8F0",
                  color: "#940202",
                }}
              >
                View Menu
              </Link>
            </div>
          </div>
          <div aria-hidden className="hidden lg:block" />
        </div>
      </section>

      <section>
        <h2 className="mb-6 text-3xl text-[#2D1F16]">Browse Products</h2>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
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
          <CategoryTile
            name="Pastries"
            href="/menu"
            image="https://images.unsplash.com/photo-1483695028939-5bb13f8648b0?auto=format&fit=crop&w=1200&q=80"
          />
          <CategoryTile
            name="Others"
            href="/menu"
            image="https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=80"
          />
        </div>
      </section>
    </div>
  );
}
