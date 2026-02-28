import type { Order, OrderStatus } from "@/types/order";

export interface OrderRepository {
  getAll(): Promise<Order[]>;
  create(order: Order): Promise<void>;
  updateStatus(id: string, status: OrderStatus): Promise<void>;
}

