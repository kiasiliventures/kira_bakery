import type { Product } from "@/types/product";

export interface ProductRepository {
  getAll(): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;
  create(product: Product): Promise<void>;
  updateSoldOut(id: string, soldOut: boolean): Promise<void>;
}

