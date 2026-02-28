"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/lib/constants";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";
import type { CartItem } from "@/types/order";

type AddCartInput = Omit<CartItem, "quantity"> & { quantity?: number };
export function getCartLineKey(item: {
  productId: string;
  selectedSize?: string;
  selectedFlavor?: string;
}): string {
  return `${item.productId}::${item.selectedSize ?? ""}::${item.selectedFlavor ?? ""}`;
}

type CartContextValue = {
  items: CartItem[];
  addItem: (item: AddCartInput) => void;
  removeItem: (lineKey: string) => void;
  clearCart: () => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  itemCount: number;
  subtotalUGX: number;
};

const CartContext = createContext<CartContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() =>
    readLocalStorage<CartItem[]>(STORAGE_KEYS.cart, []),
  );

  useEffect(() => {
    writeLocalStorage(STORAGE_KEYS.cart, items);
  }, [items]);

  const value = useMemo<CartContextValue>(() => {
    const addItem = (item: AddCartInput) => {
      setItems((prev) => {
        const key = getCartLineKey(item);
        const existingIndex = prev.findIndex(
          (cartItem) => getCartLineKey(cartItem) === key,
        );

        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = {
            ...next[existingIndex],
            quantity: next[existingIndex].quantity + (item.quantity ?? 1),
          };
          return next;
        }

        return [...prev, { ...item, quantity: item.quantity ?? 1 }];
      });
    };

    const removeItem = (lineKey: string) => {
      setItems((prev) => prev.filter((item) => getCartLineKey(item) !== lineKey));
    };

    const clearCart = () => setItems([]);

    const updateQuantity = (lineKey: string, quantity: number) => {
      setItems((prev) =>
        prev
          .map((item) =>
            getCartLineKey(item) === lineKey
              ? { ...item, quantity: Math.max(1, quantity) }
              : item,
          )
          .filter((item) => item.quantity > 0),
      );
    };

    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotalUGX = items.reduce(
      (sum, item) => sum + item.priceUGX * item.quantity,
      0,
    );

    return {
      items,
      addItem,
      removeItem,
      clearCart,
      updateQuantity,
      itemCount,
      subtotalUGX,
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within AppProvider");
  }

  return context;
}
