import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
const revalidateTagMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}));

describe("catalog cache invalidation map", () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
    revalidateTagMock.mockReset();
  });

  it("keeps category creation scoped to base catalog surfaces", async () => {
    const { revalidateCatalogMenuSurfaces } = await import("@/lib/catalog/cache");
    const result = revalidateCatalogMenuSurfaces("admin_category_create", []);

    expect(result.tags).toEqual(["catalog:products"]);
    expect(result.paths).toEqual(["/", "/menu", "/api/products", "/sitemap.xml"]);
    expect(revalidateTagMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledTimes(4);
  });

  it("includes product-scoped surfaces for category and image mutations", async () => {
    const { revalidateCatalogMenuSurfaces } = await import("@/lib/catalog/cache");
    const result = revalidateCatalogMenuSurfaces("admin_category_patch", ["product-1", "product-1"]);

    expect(result.tags).toEqual(["catalog:products", "catalog:product:product-1"]);
    expect(result.paths).toEqual([
      "/",
      "/menu",
      "/api/products",
      "/sitemap.xml",
      "/menu/product-1",
      "/api/products/product-1",
    ]);

    revalidateTagMock.mockReset();
    revalidatePathMock.mockReset();

    const imageResult = revalidateCatalogMenuSurfaces("admin_product_image_upload", ["product-9"]);
    expect(imageResult.tags).toEqual(["catalog:products", "catalog:product:product-9"]);
    expect(imageResult.paths).toEqual([
      "/",
      "/menu",
      "/api/products",
      "/sitemap.xml",
      "/menu/product-9",
      "/api/products/product-9",
    ]);
  });
});
