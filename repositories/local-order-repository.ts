import { STORAGE_KEYS } from "@/lib/constants";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";
import type { OrderRepository } from "@/repositories/order-repository";
import type { Order, OrderStatus } from "@/types/order";

export class LocalOrderRepository implements OrderRepository {
  async getAll(): Promise<Order[]> {
    return readLocalStorage<Order[]>(STORAGE_KEYS.orders, []);
  }

  async create(order: Order): Promise<void> {
    const orders = await this.getAll();
    writeLocalStorage(STORAGE_KEYS.orders, [order, ...orders]);
  }

  async updateStatus(id: string, status: OrderStatus): Promise<void> {
    const orders = await this.getAll();
    const updated = orders.map((order) =>
      order.id === id ? { ...order, status } : order,
    );
    writeLocalStorage(STORAGE_KEYS.orders, updated);
  }
}

