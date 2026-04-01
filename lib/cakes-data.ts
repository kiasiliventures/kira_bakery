import "server-only";

import { unstable_cache } from "next/cache";
import type {
  CakeConfig,
  CakeConfigOption,
  CakePrice,
  CakeReferenceImage,
  CakeTierOption,
} from "@/types/cakes";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type CakeOptionRow = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type CakeTierOptionRow = CakeOptionRow & {
  tier_count: number;
};

type CakePriceRow = {
  id: string;
  flavour_id: string;
  shape_id: string;
  size_id: string;
  tier_option_id: string;
  topping_id: string;
  weight_kg: number | string;
  price_ugx: number;
  source_note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const cakeOptionSelection = "id,code,name,sort_order,is_active";
const cakeTierOptionSelection = `${cakeOptionSelection},tier_count`;
const cakePriceSelection =
  "id,flavour_id,shape_id,size_id,tier_option_id,topping_id,weight_kg,price_ugx,source_note,is_active,created_at,updated_at";
const CAKE_BUILDER_REVALIDATE_SECONDS = 600;

function parseNumber(value: number | string) {
  return typeof value === "number" ? value : Number(value);
}

function mapOption(row: CakeOptionRow): CakeConfigOption {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    sortOrder: row.sort_order,
  };
}

function mapTierOption(row: CakeTierOptionRow): CakeTierOption {
  return {
    ...mapOption(row),
    tierCount: row.tier_count,
  };
}

function sortOptions<T extends { sortOrder: number; name: string }>(rows: T[]) {
  return [...rows].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  );
}

function sortPrices(rows: CakePrice[]) {
  return [...rows].sort((left, right) => {
    const leftKey = [
      left.shapeName,
      left.sizeName,
      String(left.tierCount),
      left.toppingName,
      left.flavourName,
    ].join("|");
    const rightKey = [
      right.shapeName,
      right.sizeName,
      String(right.tierCount),
      right.toppingName,
      right.flavourName,
    ].join("|");
    return leftKey.localeCompare(rightKey);
  });
}

type CakeCollections = {
  flavourRows: CakeOptionRow[];
  shapeRows: CakeOptionRow[];
  sizeRows: CakeOptionRow[];
  toppingRows: CakeOptionRow[];
  tierOptionRows: CakeTierOptionRow[];
  prices: CakePriceRow[];
};

async function loadCollectionsUncached(): Promise<CakeCollections> {
  const supabase = getSupabaseServerClient();
  const [flavoursResult, shapesResult, sizesResult, toppingsResult, tierOptionsResult, pricesResult] =
    await Promise.all([
      supabase.from("cake_flavours").select(cakeOptionSelection).order("sort_order", { ascending: true }),
      supabase.from("cake_shapes").select(cakeOptionSelection).order("sort_order", { ascending: true }),
      supabase.from("cake_sizes").select(cakeOptionSelection).order("sort_order", { ascending: true }),
      supabase.from("cake_toppings").select(cakeOptionSelection).order("sort_order", { ascending: true }),
      supabase.from("cake_tier_options").select(cakeTierOptionSelection).order("sort_order", { ascending: true }),
      supabase.from("cake_prices").select(cakePriceSelection).order("created_at", { ascending: false }),
    ]);

  const error = [
    flavoursResult.error,
    shapesResult.error,
    sizesResult.error,
    toppingsResult.error,
    tierOptionsResult.error,
    pricesResult.error,
  ].find(Boolean);

  if (error) {
    throw new Error(`Failed to load cake data: ${error.message}`);
  }

  return {
    flavourRows: (flavoursResult.data ?? []) as CakeOptionRow[],
    shapeRows: (shapesResult.data ?? []) as CakeOptionRow[],
    sizeRows: (sizesResult.data ?? []) as CakeOptionRow[],
    toppingRows: (toppingsResult.data ?? []) as CakeOptionRow[],
    tierOptionRows: (tierOptionsResult.data ?? []) as CakeTierOptionRow[],
      prices: (pricesResult.data ?? []) as CakePriceRow[],
  };
}

const getCachedCollections = unstable_cache(
  async () => loadCollectionsUncached(),
  ["cake-builder-collections"],
  { revalidate: CAKE_BUILDER_REVALIDATE_SECONDS },
);

function buildCakeConfig(collections: CakeCollections): CakeConfig {
  const { flavourRows, shapeRows, sizeRows, toppingRows, tierOptionRows } = collections;

  return {
    flavours: sortOptions(flavourRows.filter((row) => row.is_active).map(mapOption)),
    shapes: sortOptions(shapeRows.filter((row) => row.is_active).map(mapOption)),
    sizes: sortOptions(sizeRows.filter((row) => row.is_active).map(mapOption)),
    toppings: sortOptions(toppingRows.filter((row) => row.is_active).map(mapOption)),
    tierOptions: sortOptions(tierOptionRows.filter((row) => row.is_active).map(mapTierOption)),
  };
}

function buildCakePrices(collections: CakeCollections): CakePrice[] {
  const { flavourRows, shapeRows, sizeRows, toppingRows, tierOptionRows, prices } = collections;
  const flavourMap = new Map(flavourRows.filter((row) => row.is_active).map((row) => [row.id, row]));
  const shapeMap = new Map(shapeRows.filter((row) => row.is_active).map((row) => [row.id, row]));
  const sizeMap = new Map(sizeRows.filter((row) => row.is_active).map((row) => [row.id, row]));
  const toppingMap = new Map(toppingRows.filter((row) => row.is_active).map((row) => [row.id, row]));
  const tierOptionMap = new Map(tierOptionRows.filter((row) => row.is_active).map((row) => [row.id, row]));

  const activePrices = prices
    .filter((price) => price.is_active)
    .map((price) => {
      const flavour = flavourMap.get(price.flavour_id);
      const shape = shapeMap.get(price.shape_id);
      const size = sizeMap.get(price.size_id);
      const topping = toppingMap.get(price.topping_id);
      const tierOption = tierOptionMap.get(price.tier_option_id);

      if (!flavour || !shape || !size || !topping || !tierOption) {
        return null;
      }

      return {
        id: price.id,
        flavourId: price.flavour_id,
        shapeId: price.shape_id,
        sizeId: price.size_id,
        tierOptionId: price.tier_option_id,
        toppingId: price.topping_id,
        weightKg: parseNumber(price.weight_kg),
        priceUgx: price.price_ugx,
        sourceNote: price.source_note,
        isActive: price.is_active,
        createdAt: price.created_at,
        updatedAt: price.updated_at,
        flavourCode: flavour.code,
        flavourName: flavour.name,
        shapeCode: shape.code,
        shapeName: shape.name,
        sizeCode: size.code,
        sizeName: size.name,
        tierOptionCode: tierOption.code,
        tierOptionName: tierOption.name,
        tierCount: tierOption.tier_count,
        toppingCode: topping.code,
        toppingName: topping.name,
      } satisfies CakePrice;
    })
    .filter((price): price is CakePrice => price !== null);

  return sortPrices(activePrices);
}

export async function getCakeBuilderData(): Promise<{ config: CakeConfig; prices: CakePrice[] }> {
  const collections = await getCachedCollections();
  return {
    config: buildCakeConfig(collections),
    prices: buildCakePrices(collections),
  };
}

export async function getCakeConfig(): Promise<CakeConfig> {
  const { config } = await getCakeBuilderData();
  return config;
}

export async function getCakePrices(): Promise<CakePrice[]> {
  const { prices } = await getCakeBuilderData();
  return prices;
}

export async function createCakeCustomRequest(input: {
  requestId: string;
  customerName: string;
  phone: string;
  email?: string;
  notes?: string;
  eventDate: string;
  messageOnCake?: string;
  referenceImage?: CakeReferenceImage;
  price: CakePrice;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("cake_custom_requests")
    .insert({
      id: input.requestId,
      customer_name: input.customerName,
      phone: input.phone,
      email: input.email || null,
      notes: input.notes || null,
      reference_image_bucket: input.referenceImage?.bucket ?? null,
      reference_image_path: input.referenceImage?.path ?? null,
      reference_image_original_name: input.referenceImage?.originalFilename ?? null,
      reference_image_content_type: input.referenceImage?.contentType ?? null,
      reference_image_size_bytes: input.referenceImage?.sizeBytes ?? null,
      reference_image_uploaded_at: input.referenceImage ? new Date().toISOString() : null,
      source_note: "client_pwa_cake_builder",
      request_payload: {
        eventDate: input.eventDate,
        messageOnCake: input.messageOnCake || "",
        referenceImage: input.referenceImage ?? null,
        priceId: input.price.id,
        priceUgx: input.price.priceUgx,
        weightKg: input.price.weightKg,
        flavour: {
          id: input.price.flavourId,
          code: input.price.flavourCode,
          name: input.price.flavourName,
        },
        shape: {
          id: input.price.shapeId,
          code: input.price.shapeCode,
          name: input.price.shapeName,
        },
        size: {
          id: input.price.sizeId,
          code: input.price.sizeCode,
          name: input.price.sizeName,
        },
        tierOption: {
          id: input.price.tierOptionId,
          code: input.price.tierOptionCode,
          name: input.price.tierOptionName,
          tierCount: input.price.tierCount,
        },
        topping: {
          id: input.price.toppingId,
          code: input.price.toppingCode,
          name: input.price.toppingName,
        },
      },
      status: "pending",
    })
    .select("id,status,created_at")
    .single();

  if (error) {
    throw new Error(`Failed to create cake request: ${error.message}`);
  }

  return data;
}
