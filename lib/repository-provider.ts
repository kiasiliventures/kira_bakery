import { LocalOrderRepository } from "@/repositories/local-order-repository";
import { LocalProductRepository } from "@/repositories/local-product-repository";
import type { OrderRepository } from "@/repositories/order-repository";
import type { ProductRepository } from "@/repositories/product-repository";

let productRepository: ProductRepository | null = null;
let orderRepository: OrderRepository | null = null;

export function getProductRepository(): ProductRepository {
  if (!productRepository) {
    productRepository = new LocalProductRepository();
  }
  return productRepository;
}

export function getOrderRepository(): OrderRepository {
  if (!orderRepository) {
    orderRepository = new LocalOrderRepository();
  }
  return orderRepository;
}

