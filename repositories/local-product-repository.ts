import { mockProducts } from "@/data/mock-products";
import { STORAGE_KEYS } from "@/lib/constants";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";
import type { ProductRepository } from "@/repositories/product-repository";
import type { Product } from "@/types/product";

export class LocalProductRepository implements ProductRepository {
  async getAll(): Promise<Product[]> {
    const products = readLocalStorage<Product[]>(STORAGE_KEYS.products, []);
    if (products.length > 0) {
      return products;
    }

    writeLocalStorage(STORAGE_KEYS.products, mockProducts);
    return mockProducts;
  }

  async getById(id: string): Promise<Product | null> {
    const products = await this.getAll();
    return products.find((product) => product.id === id) ?? null;
  }

  async create(product: Product): Promise<void> {
    const products = await this.getAll();
    writeLocalStorage(STORAGE_KEYS.products, [product, ...products]);
  }

  async updateSoldOut(id: string, soldOut: boolean): Promise<void> {
    const products = await this.getAll();
    const updated = products.map((product) =>
      product.id === id ? { ...product, soldOut } : product,
    );
    writeLocalStorage(STORAGE_KEYS.products, updated);
  }
}

