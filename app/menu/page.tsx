import { MenuCatalog } from "@/components/menu-catalog";

export default function MenuPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-4xl text-[#2D1F16]">Menu</h1>
      <p className="max-w-2xl text-[#5f4637]">
        Explore our bread, cakes, pastries, savory bites, and pizza. Prices are listed in
        UGX.
      </p>
      <MenuCatalog />
    </div>
  );
}

