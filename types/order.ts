export type OrderStatus = "Pending" | "In Progress" | "Ready" | "Delivered";

export type CartItem = {
  productId: string;
  name: string;
  image: string;
  priceUGX: number;
  quantity: number;
  selectedSize?: string;
  selectedFlavor?: string;
};

export type CheckoutFormData = {
  customerName: string;
  phone: string;
  email?: string;
  address: string;
  deliveryDate: string;
  notes?: string;
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

