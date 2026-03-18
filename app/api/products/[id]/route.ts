import { NextResponse } from "next/server";
import {
  CATALOG_REVALIDATE_SECONDS,
  getCachedCatalogProductById,
} from "@/lib/catalog/products";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    const product = await getCachedCatalogProductById(id);

    if (!product) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(product, {
      headers: {
        "Cache-Control": `s-maxage=${CATALOG_REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load product." },
      { status: 500 },
    );
  }
}
