import { notFound } from "next/navigation";
import { ProductDetailView } from "@/components/product-detail-view";
import { getCachedCatalogProductById } from "@/lib/catalog/products";

type ProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const product = await getCachedCatalogProductById(id);

  if (!product) {
    notFound();
  }

  return <ProductDetailView key={product.id} product={product} />;
}
