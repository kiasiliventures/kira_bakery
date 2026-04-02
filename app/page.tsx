import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CategoryTile } from "@/components/category-tile";
import { getCachedCategoryImages } from "@/lib/catalog/products";
import { getAbsoluteUrl } from "@/lib/site";
import { PRODUCT_CATEGORIES } from "@/types/product";

export const metadata: Metadata = {
  title: "Bakery in Kira, Uganda",
  description:
    "Discover fresh bread, celebration cakes, pastries, and more from KiRA Bakery in Kira, Uganda.",
  alternates: {
    canonical: "/",
  },
};

export default async function HomePage() {
  const categoryImages = await getCachedCategoryImages();
  const localBusinessJsonLd = {
    "@context": "https://schema.org",
    "@type": "Bakery",
    name: "KiRA Bakery",
    url: getAbsoluteUrl("/"),
    image: getAbsoluteUrl("/images/hero_image_3.jpg"),
    telephone: "+256774624180",
    email: "kirabakery@gmail.com",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Kito village, Mamerito Mugerwa Road",
      addressLocality: "Kira",
      addressCountry: "UG",
    },
  };

  return (
    <div className="space-y-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
      />
      <section className="relative left-1/2 right-1/2 -mx-[50vw] min-h-[560px] w-screen overflow-hidden">
        <Image
          src="/images/hero_image_3.jpg"
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
              Freshly Baked Everyday
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/menu"
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-accent px-8 text-base font-semibold text-accent-foreground shadow-[var(--shadow-brand)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--accent-hover)] active:translate-y-0 active:bg-[var(--accent-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2"
              >
                Order Now
              </Link>
              <Link
                href="/menu"
                className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-accent bg-surface px-8 text-base font-semibold text-accent shadow-[var(--shadow-soft)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-alt hover:border-[var(--accent-hover)] hover:text-[var(--accent-hover)] active:translate-y-0 active:border-[var(--accent-active)] active:text-[var(--accent-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2"
              >
                View Menu
              </Link>
            </div>
          </div>
          <div aria-hidden className="hidden lg:block" />
        </div>
      </section>

      <section>
        <h2 className="mb-6 text-3xl text-foreground">Browse Products</h2>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {PRODUCT_CATEGORIES.map((category) => (
            <CategoryTile
              key={category}
              name={category}
              href="/menu"
              image={categoryImages[category]}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
