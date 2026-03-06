import { NextResponse } from "next/server";
import {
  mapLegacyAdminProductRow,
  mapLegacyProductRow,
  mapSharedProductRow,
} from "@/lib/supabase/mappers";
import { getSupabasePublicServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getSupabasePublicServerClient();
  const shared = await supabase
    .from("products")
    .select("id,name,description,image_url,base_price,stock_quantity,is_available,is_featured,categories(name)")
    .order("created_at", { ascending: false });

  if (shared.error?.code === "42703") {
    const legacy = await supabase
      .from("products")
      .select("id,name,description,category,price_ugx,image,sold_out,featured,options")
      .order("created_at", { ascending: false });

    if (legacy.error?.code === "42703") {
      const legacyAdmin = await supabase
        .from("products")
        .select(
          "id,name,description,image_url,is_available,is_featured,categories(name),product_variants(name,price,is_available,sort_order)",
        )
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (legacyAdmin.error) {
        console.error("products_legacy_admin_read_failed", legacyAdmin.error.message);
        return NextResponse.json({ message: "Unable to load products." }, { status: 500 });
      }

      return NextResponse.json((legacyAdmin.data ?? []).map(mapLegacyAdminProductRow));
    }

    if (legacy.error) {
      console.error("products_legacy_read_failed", legacy.error.message);
      return NextResponse.json({ message: "Unable to load products." }, { status: 500 });
    }

    return NextResponse.json((legacy.data ?? []).map(mapLegacyProductRow));
  }

  if (shared.error) {
    console.error("products_read_failed", shared.error.message);
    return NextResponse.json({ message: "Unable to load products." }, { status: 500 });
  }

  return NextResponse.json((shared.data ?? []).map(mapSharedProductRow));
}
