import { NextResponse } from "next/server";
import {
  CATALOG_REVALIDATE_SECONDS,
  getCachedCatalogProducts,
} from "@/lib/catalog/products";

export async function GET() {
  try {
    const products = await getCachedCatalogProducts();
    return NextResponse.json(products, {
      headers: {
        "Cache-Control": `s-maxage=${CATALOG_REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load products." },
      { status: 500 },
    );
  }
}
