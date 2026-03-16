import { NextResponse } from "next/server";
import {
  mapLegacyAdminProductRow,
  mapLegacyProductRow,
  mapSharedProductRow,
} from "@/lib/supabase/mappers";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const shared = await supabase
    .from("products")
    .select("id,name,description,image_url,base_price,stock_quantity,is_available,is_featured,categories(name)")
    .eq("id", id)
    .maybeSingle();

  if (shared.error?.code === "42703") {
    const legacy = await supabase
      .from("products")
      .select("id,name,description,category,price_ugx,image,sold_out,featured,options")
      .eq("id", id)
      .maybeSingle();

    if (legacy.error?.code === "42703") {
      const legacyAdmin = await supabase
        .from("products")
        .select(
          "id,name,description,image_url,is_available,is_featured,categories(name),product_variants(name,price,is_available,sort_order)",
        )
        .eq("id", id)
        .maybeSingle();

      if (legacyAdmin.error) {
        console.error("product_legacy_admin_read_failed", legacyAdmin.error.message);
        return NextResponse.json({ message: "Unable to load product." }, { status: 500 });
      }
      if (!legacyAdmin.data) {
        return NextResponse.json({ message: "Product not found" }, { status: 404 });
      }

      return NextResponse.json(mapLegacyAdminProductRow(legacyAdmin.data));
    }

    if (legacy.error) {
      console.error("product_legacy_read_failed", legacy.error.message);
      return NextResponse.json({ message: "Unable to load product." }, { status: 500 });
    }
    if (!legacy.data) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(mapLegacyProductRow(legacy.data));
  }

  if (shared.error) {
    console.error("product_read_failed", shared.error.message);
    return NextResponse.json({ message: "Unable to load product." }, { status: 500 });
  }
  if (!shared.data) {
    return NextResponse.json({ message: "Product not found" }, { status: 404 });
  }

  return NextResponse.json(mapSharedProductRow(shared.data));
}
