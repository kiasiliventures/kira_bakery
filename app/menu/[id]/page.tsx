import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailView } from "@/components/product-detail-view";
import { getCachedCatalogProductById } from "@/lib/catalog/products";
import { getAbsoluteUrl } from "@/lib/site";

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getCachedCatalogProductById(id);

  if (!product) {
    return {
      title: "Product Not Found",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const description = `${product.name} from KiRA Bakery. ${product.description}`;

  return {
    title: product.name,
    description,
    alternates: {
      canonical: `/menu/${product.id}`,
    },
    openGraph: {
      type: "website",
      url: `/menu/${product.id}`,
      title: `${product.name} | KiRA Bakery`,
      description,
      images: product.image
        ? [
            {
              url: product.image,
              alt: product.name,
            },
          ]
        : undefined,
    },
    twitter: {
      card: product.image ? "summary_large_image" : "summary",
      title: `${product.name} | KiRA Bakery`,
      description,
      images: product.image ? [product.image] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const product = await getCachedCatalogProductById(id);

  if (!product) {
    notFound();
  }

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.image ? [product.image] : undefined,
    category: product.category,
    brand: {
      "@type": "Brand",
      name: "KiRA Bakery",
    },
    offers: {
      "@type": "Offer",
      url: getAbsoluteUrl(`/menu/${product.id}`),
      priceCurrency: "UGX",
      price: product.priceUGX,
      availability: product.soldOut
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <ProductDetailView key={product.id} product={product} />
    </>
  );
}
