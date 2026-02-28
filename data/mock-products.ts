import type { Product } from "@/types/product";

export const mockProducts: Product[] = [
  {
    id: "bread-sourdough",
    name: "Rustic Sourdough Loaf",
    description: "48-hour fermented loaf with a caramelized crust and airy crumb.",
    category: "Bread",
    priceUGX: 18000,
    image:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80",
    soldOut: false,
    featured: true,
    options: { sizes: ["Regular", "Large"] },
  },
  {
    id: "bread-brioche",
    name: "Golden Brioche",
    description: "Rich buttery brioche ideal for breakfast and tea service.",
    category: "Bread",
    priceUGX: 22000,
    image:
      "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1200&q=80",
    soldOut: false,
    options: { sizes: ["Mini", "Family"] },
  },
  {
    id: "cake-red-velvet",
    name: "Signature Red Velvet",
    description: "Layered red velvet with cream cheese frosting and cocoa dusting.",
    category: "Cakes",
    priceUGX: 95000,
    image:
      "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=80",
    soldOut: false,
    featured: true,
    options: {
      sizes: ["1kg", "2kg", "3kg"],
      flavors: ["Classic", "Vanilla Cream", "Chocolate Cream"],
    },
  },
  {
    id: "cake-black-forest",
    name: "Black Forest Cake",
    description: "Dark chocolate sponge, cherry filling, and fresh whipped cream.",
    category: "Cakes",
    priceUGX: 110000,
    image:
      "https://images.unsplash.com/photo-1559622214-58f2ddc7ea1a?auto=format&fit=crop&w=1200&q=80",
    soldOut: false,
    options: {
      sizes: ["1kg", "2kg", "4kg"],
      flavors: ["Cherry", "Mocha", "Chocolate"],
    },
  },
  {
    id: "pastry-croissant",
    name: "Butter Croissant",
    description: "Flaky, laminated croissant baked fresh every morning.",
    category: "Pastries",
    priceUGX: 8500,
    image:
      "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=1200&q=80",
    soldOut: false,
    featured: true,
    options: { flavors: ["Classic", "Chocolate", "Almond"] },
  },
  {
    id: "pastry-danish",
    name: "Fruit Danish",
    description: "Custard danish topped with seasonal fruit and apricot glaze.",
    category: "Pastries",
    priceUGX: 12000,
    image:
      "https://images.unsplash.com/photo-1509365465985-25d11c17e812?auto=format&fit=crop&w=1200&q=80",
    soldOut: false,
  },
  {
    id: "savory-quiche",
    name: "Spinach Quiche Slice",
    description: "Savory tart with spinach, cheese, and roasted onion.",
    category: "Savory",
    priceUGX: 16000,
    image:
      "https://images.unsplash.com/photo-1464306076886-da185f6a9d05?auto=format&fit=crop&w=1200&q=80",
    soldOut: false,
  },
  {
    id: "savory-sausage-roll",
    name: "Sausage Roll",
    description: "Hand-rolled puff pastry with seasoned beef sausage filling.",
    category: "Savory",
    priceUGX: 14000,
    image:
      "https://images.unsplash.com/photo-1532635221-8ec15f2ce05d?auto=format&fit=crop&w=1200&q=80",
    soldOut: true,
  },
  {
    id: "pizza-margherita",
    name: "Woodstone Margherita Pizza",
    description: "Tomato basil sauce, mozzarella, and extra virgin olive oil.",
    category: "Pizza",
    priceUGX: 42000,
    image:
      "https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=1200&q=80",
    soldOut: false,
    options: { sizes: ["Medium", "Large"] },
  },
  {
    id: "pizza-pepperoni",
    name: "Pepperoni Pizza",
    description: "Slow-proof crust with mozzarella and premium beef pepperoni.",
    category: "Pizza",
    priceUGX: 48000,
    image:
      "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80",
    soldOut: false,
    options: { sizes: ["Medium", "Large", "Party"] },
  },
];

