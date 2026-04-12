"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { STORAGE_KEYS } from "@/lib/constants";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";
import type { CartItem } from "@/types/order";

type AddCartInput = Omit<CartItem, "quantity"> & { quantity?: number };
type Theme = "light" | "dark";

const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedTheme = window.localStorage.getItem(STORAGE_KEYS.theme);
  return storedTheme === "light" || storedTheme === "dark" ? storedTheme : null;
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia(THEME_MEDIA_QUERY).matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", theme === "dark" ? "#171311" : "#f5e6d3");
  }
}

export function getCartLineKey(item: {
  productId: string;
  selectedSize?: string;
  selectedFlavor?: string;
}): string {
  return `${item.productId}::${item.selectedSize ?? ""}::${item.selectedFlavor ?? ""}`;
}

function clampQuantity(quantity: number, stockQuantity?: number) {
  const normalizedQuantity = Math.max(1, quantity);

  if (typeof stockQuantity !== "number" || stockQuantity <= 0) {
    return normalizedQuantity;
  }

  return Math.min(normalizedQuantity, stockQuantity);
}

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

type CartContextValue = {
  items: CartItem[];
  addItem: (item: AddCartInput) => void;
  removeItem: (lineKey: string) => void;
  replaceItems: (items: CartItem[]) => void;
  clearCart: () => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  itemCount: number;
  subtotalUGX: number;
  lastItemAddedAt: number;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const CartContext = createContext<CartContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [themePreference, setThemePreference] = useState<Theme | null>(() => getStoredTheme());
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document === "undefined") {
      return "light";
    }

    const currentTheme = document.documentElement.dataset.theme;
    return currentTheme === "light" || currentTheme === "dark" ? currentTheme : "light";
  });
  const [items, setItems] = useState<CartItem[]>(() =>
    readLocalStorage<CartItem[]>(STORAGE_KEYS.cart, []),
  );
  const [lastItemAddedAt, setLastItemAddedAt] = useState(0);

  useEffect(() => {
    writeLocalStorage(STORAGE_KEYS.cart, items);
  }, [items]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(THEME_MEDIA_QUERY);
    const syncTheme = (nextTheme: Theme) => {
      setThemeState(nextTheme);
      applyTheme(nextTheme);
    };

    if (themePreference) {
      window.localStorage.setItem(STORAGE_KEYS.theme, themePreference);
      syncTheme(themePreference);
      return;
    }

    window.localStorage.removeItem(STORAGE_KEYS.theme);
    syncTheme(getSystemTheme());

    const handleChange = (event: MediaQueryListEvent) => {
      syncTheme(event.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [themePreference]);

  const themeValue = useMemo<ThemeContextValue>(() => {
    const setTheme = (nextTheme: Theme) => {
      setThemePreference(nextTheme);
    };

    const toggleTheme = () => {
      const currentTheme = themePreference ?? getSystemTheme();
      setThemePreference(currentTheme === "dark" ? "light" : "dark");
    };

    return {
      theme,
      setTheme,
      toggleTheme,
    };
  }, [theme, themePreference]);

  const cartValue = useMemo<CartContextValue>(() => {
    const addItem = (item: AddCartInput) => {
      setLastItemAddedAt(Date.now());
      setItems((prev) => {
        const key = getCartLineKey(item);
        const existingIndex = prev.findIndex(
          (cartItem) => getCartLineKey(cartItem) === key,
        );

        if (existingIndex >= 0) {
          const next = [...prev];
          const nextStockQuantity =
            item.stockQuantity ?? next[existingIndex].stockQuantity;
          next[existingIndex] = {
            ...next[existingIndex],
            stockQuantity: nextStockQuantity,
            quantity: clampQuantity(
              next[existingIndex].quantity + (item.quantity ?? 1),
              nextStockQuantity,
            ),
          };
          return next;
        }

        return [
          ...prev,
          {
            ...item,
            quantity: clampQuantity(item.quantity ?? 1, item.stockQuantity),
          },
        ];
      });
    };

    const removeItem = (lineKey: string) => {
      setItems((prev) => prev.filter((item) => getCartLineKey(item) !== lineKey));
    };

    const replaceItems = (nextItems: CartItem[]) => {
      setItems(
        nextItems
          .map((item) => ({
            ...item,
            quantity: clampQuantity(item.quantity, item.stockQuantity),
          }))
          .filter((item) => item.quantity > 0),
      );
    };

    const clearCart = () => setItems([]);

    const updateQuantity = (lineKey: string, quantity: number) => {
      setItems((prev) =>
        prev
          .map((item) =>
            getCartLineKey(item) === lineKey
              ? {
                  ...item,
                  quantity: clampQuantity(quantity, item.stockQuantity),
                }
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
      replaceItems,
      clearCart,
      updateQuantity,
      itemCount,
      subtotalUGX,
      lastItemAddedAt,
    };
  }, [items, lastItemAddedAt]);

  return (
    <ThemeContext.Provider value={themeValue}>
      <CartContext.Provider value={cartValue}>{children}</CartContext.Provider>
    </ThemeContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within AppProvider");
  }

  return context;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within AppProvider");
  }

  return context;
}
