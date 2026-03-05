import type { ProductRepository } from "@/repositories/product-repository";
import { SupabaseProductRepository } from "@/repositories/supabase-product-repository";

let productRepository: ProductRepository | null = null;

export function getProductRepository(): ProductRepository {
  if (!productRepository) {
    productRepository = new SupabaseProductRepository();
  }
  return productRepository;
}
