import { NextResponse } from "next/server";
import { mapLegacyProductRow, mapProductRow } from "@/lib/supabase/mappers";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id,name,description,category,price_ugx,image,sold_out,featured,options")
    .eq("id", id)
    .maybeSingle();

  if (error?.code === "42703") {
    // Backward compatibility for legacy schema with category/image/availability split.
    const legacy = await supabase
      .from("products")
      .select(
        "id,name,description,image_url,is_available,is_featured,categories(name),product_variants(name,price,is_available,sort_order)",
      )
      .eq("id", id)
      .maybeSingle();

    if (legacy.error) {
      return NextResponse.json({ message: legacy.error.message }, { status: 500 });
    }
    if (!legacy.data) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(mapLegacyProductRow(legacy.data));
  }

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ message: "Product not found" }, { status: 404 });
  }

  return NextResponse.json(mapProductRow(data));
}
