import type { CartItem, CheckoutFormData, Order } from "@/types/order";
import type { Product, ProductCategory, ProductOptionSet } from "@/types/product";

type ProductRow = {
  id: string;
  name: string;
  description: string;
  category: ProductCategory;
  price_ugx: number;
  image: string;
  sold_out: boolean;
  featured: boolean;
  options: ProductOptionSet | null;
};

type LegacyCategory = {
  name: string;
};

type LegacyVariantRow = {
  name: string;
  price: number;
  is_available: boolean;
  sort_order?: number | null;
};

type LegacyProductRow = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  categories?: LegacyCategory | LegacyCategory[] | null;
  product_variants?: LegacyVariantRow[] | null;
};

type OrderItemRow = {
  product_id: string | null;
  name: string;
  image: string;
  price_ugx: number;
  quantity: number;
  selected_size: string | null;
  selected_flavor: string | null;
};

type CakeRequestRow = {
  flavor: string;
  size: string;
  message: string;
  event_date: string;
  budget_min: number;
  budget_max: number;
  reference_image_name: string | null;
};

type OrderRow = {
  id: string;
  total_ugx: number;
  status: Order["status"];
  created_at: string;
  delivery_method: CheckoutFormData["deliveryMethod"];
  customer_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  delivery_date: string | null;
  notes: string | null;
  order_items?: OrderItemRow[] | null;
  cake_requests?: CakeRequestRow | CakeRequestRow[] | null;
};

export function mapProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    priceUGX: row.price_ugx,
    image: row.image,
    soldOut: row.sold_out,
    featured: row.featured,
    options: row.options ?? undefined,
  };
}

function normalizeCategory(raw: string | undefined): ProductCategory {
  const value = (raw ?? "").trim().toLowerCase();
  if (value.includes("bread")) return "Bread";
  if (value.includes("cake")) return "Cakes";
  if (value.includes("pastr")) return "Pastries";
  return "Others";
}

export function mapLegacyProductRow(row: LegacyProductRow): Product {
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  const availableVariants = (row.product_variants ?? [])
    .filter((variant) => variant.is_available)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const primaryVariant = availableVariants[0];
  const sizeOptions = availableVariants.map((variant) => variant.name).filter(Boolean);

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: normalizeCategory(category?.name),
    priceUGX: primaryVariant ? Math.round(Number(primaryVariant.price)) : 0,
    image: row.image_url ?? "",
    soldOut: !row.is_available,
    featured: row.is_featured,
    options: sizeOptions.length > 0 ? { sizes: sizeOptions } : undefined,
  };
}

function mapItemRow(row: OrderItemRow): CartItem {
  return {
    productId: row.product_id ?? "",
    name: row.name,
    image: row.image,
    priceUGX: row.price_ugx,
    quantity: row.quantity,
    selectedSize: row.selected_size ?? undefined,
    selectedFlavor: row.selected_flavor ?? undefined,
  };
}

export function mapOrderRow(row: OrderRow): Order {
  const cakeRequest = Array.isArray(row.cake_requests)
    ? row.cake_requests[0]
    : row.cake_requests;

  return {
    id: row.id,
    totalUGX: row.total_ugx,
    status: row.status,
    createdAt: row.created_at,
    customer: {
      deliveryMethod: row.delivery_method,
      customerName: row.customer_name,
      phone: row.phone,
      email: row.email ?? undefined,
      address: row.address ?? undefined,
      deliveryDate: row.delivery_date ?? undefined,
      notes: row.notes ?? undefined,
    },
    items: (row.order_items ?? []).map(mapItemRow),
    cakeRequest: cakeRequest
      ? {
          flavor: cakeRequest.flavor,
          size: cakeRequest.size,
          message: cakeRequest.message,
          eventDate: cakeRequest.event_date,
          budgetMin: cakeRequest.budget_min,
          budgetMax: cakeRequest.budget_max,
          referenceImageName: cakeRequest.reference_image_name ?? undefined,
        }
      : undefined,
  };
}
