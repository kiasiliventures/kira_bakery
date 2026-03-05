import { NextResponse } from "next/server";
import { mapLegacyProductRow, mapProductRow } from "@/lib/supabase/mappers";
import { getSupabasePublicServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getSupabasePublicServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id,name,description,category,price_ugx,image,sold_out,featured,options")
    .order("created_at", { ascending: false });

  if (error?.code === "42703") {
    const legacy = await supabase
      .from("products")
      .select(
        "id,name,description,image_url,is_available,is_featured,categories(name),product_variants(name,price,is_available,sort_order)",
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (legacy.error) {
      console.error("products_legacy_read_failed", legacy.error.message);
      return NextResponse.json({ message: "Unable to load products." }, { status: 500 });
    }

    return NextResponse.json((legacy.data ?? []).map(mapLegacyProductRow));
  }

  if (error) {
    console.error("products_read_failed", error.message);
    return NextResponse.json({ message: "Unable to load products." }, { status: 500 });
  }

  return NextResponse.json(data.map(mapProductRow));
}
