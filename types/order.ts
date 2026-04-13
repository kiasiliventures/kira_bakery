export type OrderStatus =
  | "Pending Payment"
  | "Paid"
  | "Ready"
  | "Completed"
  | "Payment Failed"
  | "Cancelled";

export type CartItem = {
  productId: string;
  name: string;
  image: string;
  priceUGX: number;
  quantity: number;
  stockQuantity?: number;
  selectedSize?: string;
  selectedFlavor?: string;
};

export type StaleCartAdjustmentType =
  | "price_changed"
  | "item_unavailable"
  | "quantity_adjusted"
  | "selection_updated"
  | "details_updated";

export type StaleCartAdjustment = {
  productId: string;
  name: string;
  selectedSize?: string;
  selectedFlavor?: string;
  type: StaleCartAdjustmentType;
  previousPriceUGX?: number;
  currentPriceUGX?: number;
  previousQuantity?: number;
  currentQuantity?: number;
  previousSelectedSize?: string;
  currentSelectedSize?: string;
};

export type StaleCartPayload = {
  code: "STALE_CART";
  message: string;
  cart: {
    items: CartItem[];
    subtotalUGX: number;
  };
  adjustments: StaleCartAdjustment[];
};

export type CheckoutFormData = {
  deliveryMethod: "delivery" | "pickup";
  customerName: string;
  phone: string;
  email?: string;
  address?: string;
  deliveryDate?: string;
  notes?: string;
  deliveryLocation?: {
    placeId?: string;
    addressText?: string;
    latitude?: number;
    longitude?: number;
  };
};

export type CakeBuilderFormData = {
  flavor: string;
  size: string;
  message: string;
  eventDate: string;
  budgetMin: number;
  budgetMax: number;
  referenceImageName?: string;
};

export type Order = {
  id: string;
  items: CartItem[];
  totalUGX: number;
  status: OrderStatus;
  createdAt: string;
  customer: CheckoutFormData;
  cakeRequest?: CakeBuilderFormData;
};
