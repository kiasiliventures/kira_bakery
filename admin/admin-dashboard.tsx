"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatUGX, generateId } from "@/lib/format";
import { getOrderRepository, getProductRepository } from "@/lib/repository-provider";
import { STORAGE_KEYS } from "@/lib/constants";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";
import { adminProductSchema, type AdminProductSchemaInput } from "@/lib/validation";
import type { Order, OrderStatus } from "@/types/order";
import { PRODUCT_CATEGORIES, type Product } from "@/types/product";
import { mockProducts } from "@/data/mock-products";

const ORDER_STATUSES: OrderStatus[] = ["Pending", "In Progress", "Ready", "Delivered"];

export function AdminDashboard() {
  const [products, setProducts] = useState<Product[]>(() => {
    const storedProducts = readLocalStorage<Product[]>(STORAGE_KEYS.products, []);
    if (storedProducts.length > 0) {
      return storedProducts;
    }
    writeLocalStorage(STORAGE_KEYS.products, mockProducts);
    return mockProducts;
  });
  const [orders, setOrders] = useState<Order[]>(() =>
    readLocalStorage<Order[]>(STORAGE_KEYS.orders, []),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState("");

  const loadAll = async () => {
    const productRepo = getProductRepository();
    const orderRepo = getOrderRepository();
    const [productValues, orderValues] = await Promise.all([
      productRepo.getAll(),
      orderRepo.getAll(),
    ]);
    setProducts(productValues);
    setOrders(orderValues);
  };

  const createProduct = async (formData: FormData) => {
    const input: AdminProductSchemaInput = {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      category: String(formData.get("category") ?? "") as AdminProductSchemaInput["category"],
      priceUGX: Number(formData.get("priceUGX") ?? 0),
      image: String(formData.get("image") ?? ""),
      soldOut: false,
    };

    const validation = adminProductSchema.safeParse(input);
    if (!validation.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        nextErrors[String(issue.path[0])] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    const response = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validation.data),
    });
    if (!response.ok) {
      setStatusMessage("Server validation failed for product payload.");
      return;
    }

    const productRepo = getProductRepository();
    await productRepo.create({
      id: generateId("product"),
      ...validation.data,
    });
    setErrors({});
    setStatusMessage("Product created in local DEV mode.");
    await loadAll();
  };

  const toggleSoldOut = async (product: Product) => {
    const productRepo = getProductRepository();
    await productRepo.updateSoldOut(product.id, !product.soldOut);
    await loadAll();
  };

  const changeOrderStatus = async (orderId: string, status: OrderStatus) => {
    const orderRepo = getOrderRepository();
    await orderRepo.updateStatus(orderId, status);
    await loadAll();
  };

  return (
    <div className="space-y-8">
      <Card className="border-[#C62828]/25 bg-[#fff6ee]">
        <CardContent className="p-4 text-sm font-semibold text-[#8f2a2a]">
          DEV MODE – No Authentication Enabled
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Manage Products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={createProduct} className="grid gap-3">
              <div>
                <Label htmlFor="name">Product Name</Label>
                <Input id="name" name="name" />
                {errors.name && <p className="text-xs text-[#8f2a2a]">{errors.name}</p>}
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" />
                {errors.description && (
                  <p className="text-xs text-[#8f2a2a]">{errors.description}</p>
                )}
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Select id="category" name="category" defaultValue="">
                  <option value="" disabled>
                    Select category
                  </option>
                  {PRODUCT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
                {errors.category && <p className="text-xs text-[#8f2a2a]">{errors.category}</p>}
              </div>
              <div>
                <Label htmlFor="priceUGX">Price UGX</Label>
                <Input id="priceUGX" name="priceUGX" type="number" min={3000} />
                {errors.priceUGX && <p className="text-xs text-[#8f2a2a]">{errors.priceUGX}</p>}
              </div>
              <div>
                <Label htmlFor="image">Image URL (Unsplash)</Label>
                <Input id="image" name="image" />
                {errors.image && <p className="text-xs text-[#8f2a2a]">{errors.image}</p>}
              </div>
              <Button>Create Product</Button>
            </form>
            {statusMessage && <p className="text-sm text-[#5f4637]">{statusMessage}</p>}
            <div className="space-y-2">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-xl border border-[#c2a98f]/30 p-3"
                >
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-[#5f4637]">
                      {product.category} - {formatUGX(product.priceUGX)}
                    </p>
                  </div>
                  <Button
                    variant={product.soldOut ? "default" : "outline"}
                    onClick={() => void toggleSoldOut(product)}
                  >
                    {product.soldOut ? "Mark Available" : "Mark Sold Out"}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {orders.length === 0 && <p className="text-[#5f4637]">No orders yet in local storage.</p>}
            {orders.map((order) => (
              <div key={order.id} className="rounded-xl border border-[#c2a98f]/30 p-3">
                <p className="font-medium text-[#2D1F16]">{order.id}</p>
                <p className="text-xs text-[#5f4637]">
                  {new Date(order.createdAt).toLocaleString()} - {formatUGX(order.totalUGX)}
                </p>
                <div className="mt-2">
                  <Select
                    value={order.status}
                    onChange={(event) =>
                      void changeOrderStatus(order.id, event.target.value as OrderStatus)
                    }
                  >
                    {ORDER_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
