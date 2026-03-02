import { mockProducts } from "@/data/mock-products";
import { STORAGE_KEYS } from "@/lib/constants";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";
import type { ProductRepository } from "@/repositories/product-repository";
import type { Product } from "@/types/product";

type LegacyProduct = Omit<Product, "category"> & {
  category: Product["category"] | "Savory" | "Pizza";
};

export class LocalProductRepository implements ProductRepository {
  async getAll(): Promise<Product[]> {
    const products = readLocalStorage<LegacyProduct[]>(STORAGE_KEYS.products, []);
    if (products.length > 0) {
      const migrated: Product[] = products.map((product) => {
        const migratedCategory =
          product.category === "Savory" || product.category === "Pizza"
            ? "Others"
            : product.category;

        if (product.id === "cake-black-forest") {
          return {
            ...product,
            category: migratedCategory,
            image:
              "https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=1200&q=80",
          };
        }

        return {
          ...product,
          category: migratedCategory,
        };
      });
      writeLocalStorage(STORAGE_KEYS.products, migrated);
      return migrated;
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
