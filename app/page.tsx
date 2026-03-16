import Image from "next/image";
import Link from "next/link";
import { CategoryTile } from "@/components/category-tile";
import {
  mapLegacyAdminProductRow,
  mapLegacyProductRow,
  mapSharedProductRow,
} from "@/lib/supabase/mappers";
import { getSupabasePublicServerClient } from "@/lib/supabase/server";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@/types/product";

type SharedHomeProductRow = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  base_price: string | number;
  stock_quantity: number;
  is_available: boolean;
  is_featured: boolean;
  categories?: { name: string } | { name: string }[] | null;
};

async function getCategoryImages() {
  const supabase = getSupabasePublicServerClient();
  const images: Partial<Record<ProductCategory, string>> = {};

  const shared = await supabase
    .from("products")
    .select("id,name,description,image_url,base_price,stock_quantity,is_available,is_featured,categories(name)")
    .order("created_at", { ascending: false });

  if (shared.error?.code === "42703") {
    const legacy = await supabase
      .from("products")
      .select("id,name,description,category,image,sold_out,price_ugx,featured,options")
      .order("created_at", { ascending: false });

    if (legacy.error?.code === "42703") {
      const legacyAdmin = await supabase
        .from("products")
        .select(
          "id,name,description,image_url,is_available,is_featured,categories(name),product_variants(name,price,is_available,sort_order)",
        )
        .order("created_at", { ascending: false });

      if (legacyAdmin.error) {
        console.error("home_legacy_admin_category_images_failed", legacyAdmin.error.message);
        return images;
      }

      for (const row of legacyAdmin.data ?? []) {
        const product = mapLegacyAdminProductRow(row);
        if (!product.soldOut && product.image && !images[product.category]) {
          images[product.category] = product.image;
        }
      }

      return images;
    }

    if (legacy.error) {
      console.error("home_legacy_category_images_failed", legacy.error.message);
      return images;
    }

    for (const row of legacy.data ?? []) {
      const product = mapLegacyProductRow(row);
      if (!product.soldOut && product.image && !images[product.category]) {
        images[product.category] = product.image;
      }
    }

    return images;
  }

  if (shared.error) {
    console.error("home_category_images_failed", shared.error.message);
    return images;
  }

  for (const row of (shared.data ?? []) as SharedHomeProductRow[]) {
    const product = mapSharedProductRow(row);
    if (!product.soldOut && product.image && !images[product.category]) {
      images[product.category] = product.image;
    }
  }

  return images;
}

export default async function HomePage() {
  const categoryImages = await getCategoryImages();

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
