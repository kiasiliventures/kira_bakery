import { MenuCatalog } from "@/components/menu-catalog";

export default function MenuPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-4xl text-foreground">Menu</h1>
      <p className="max-w-2xl text-muted">
        Browse our range of freshly baked breads, cakes, pastries, yoghurt and other delightful treats.
      </p>
      <MenuCatalog />
    </div>
  );
}
