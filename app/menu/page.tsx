import { MenuCatalog } from "@/components/menu-catalog";

export default function MenuPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-4xl text-foreground">Menu</h1>
      <p className="max-w-2xl text-muted">
        Explore our bread, cakes, pastries, and other bakery favorites including
        yoghurt and miscellaneous items. Prices are listed in UGX.
      </p>
      <MenuCatalog />
    </div>
  );
}
