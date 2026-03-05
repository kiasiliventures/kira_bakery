import type { ProductRepository } from "@/repositories/product-repository";
import type { Product } from "@/types/product";

export class SupabaseProductRepository implements ProductRepository {
  async getAll(): Promise<Product[]> {
    const response = await fetch("/api/products", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to load products.");
    }
    return (await response.json()) as Product[];
  }

  async getById(id: string): Promise<Product | null> {
    const response = await fetch(`/api/products/${id}`, { cache: "no-store" });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error("Failed to load product.");
    }
    return (await response.json()) as Product;
  }
}
