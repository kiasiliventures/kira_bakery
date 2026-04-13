import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateCatalogMenuSurfacesMock = vi.fn();
const extractBearerTokenMock = vi.fn();
const requireInternalRequestSigningSecretMock = vi.fn();
const verifyInternalRequestTokenMock = vi.fn();

vi.mock("@/lib/catalog/cache", () => ({
  CATALOG_MUTATION_INVALIDATION_MAP: {
    admin_category_create: {},
    admin_category_patch: {},
    admin_product_create: {},
    admin_product_patch: {},
    admin_product_image_upload: {},
    admin_product_delete: {},
    admin_variant_create: {},
    admin_variant_patch: {},
  },
  revalidateCatalogMenuSurfaces: revalidateCatalogMenuSurfacesMock,
}));

vi.mock("@/lib/internal-auth", () => ({
  extractBearerToken: extractBearerTokenMock,
  InternalRequestAuthError: class InternalRequestAuthError extends Error {},
  requireInternalRequestSigningSecret: requireInternalRequestSigningSecretMock,
  verifyInternalRequestToken: verifyInternalRequestTokenMock,
}));

describe("internal catalog revalidation route", () => {
  beforeEach(() => {
    revalidateCatalogMenuSurfacesMock.mockReset();
    extractBearerTokenMock.mockReset();
    requireInternalRequestSigningSecretMock.mockReset();
    verifyInternalRequestTokenMock.mockReset();

    extractBearerTokenMock.mockReturnValue("signed-token");
    requireInternalRequestSigningSecretMock.mockReturnValue("secret");
    revalidateCatalogMenuSurfacesMock.mockReturnValue({
      source: "admin_category_patch",
      productIds: ["product-1"],
      tags: ["catalog:products", "catalog:product:product-1"],
      paths: ["/", "/menu", "/menu/product-1"],
    });
  });

  it("accepts category mutation sources and passes them through to the cache helper", async () => {
    const { POST } = await import("@/app/api/internal/catalog/revalidate/route");
    const request = new Request("https://example.com/api/internal/catalog/revalidate", {
      method: "POST",
      headers: {
        Authorization: "Bearer signed-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "admin_category_patch",
        productIds: ["product-1"],
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(verifyInternalRequestTokenMock).toHaveBeenCalled();
    expect(revalidateCatalogMenuSurfacesMock).toHaveBeenCalledWith("admin_category_patch", ["product-1"]);
    expect(payload).toEqual({
      ok: true,
      source: "admin_category_patch",
      productIds: ["product-1"],
      tags: ["catalog:products", "catalog:product:product-1"],
      paths: ["/", "/menu", "/menu/product-1"],
    });
  });
});
