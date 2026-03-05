import { NextResponse } from "next/server";
import { mapLegacyProductRow, mapProductRow } from "@/lib/supabase/mappers";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id,name,description,category,price_ugx,image,sold_out,featured,options")
    .order("created_at", { ascending: false });

  if (error?.code === "42703") {
    // Backward compatibility for legacy schema with category/image/availability split.
    const legacy = await supabase
      .from("products")
      .select(
        "id,name,description,image_url,is_available,is_featured,categories(name),product_variants(name,price,is_available,sort_order)",
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (legacy.error) {
      return NextResponse.json({ message: legacy.error.message }, { status: 500 });
    }

    return NextResponse.json((legacy.data ?? []).map(mapLegacyProductRow));
  }

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json(data.map(mapProductRow));
}
