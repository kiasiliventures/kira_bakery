import { beforeEach, describe, expect, it, vi } from "vitest";

const validateSameOriginMutationMock = vi.fn();
const enforceRateLimitMock = vi.fn();
const getCakePricesMock = vi.fn();
const createCakeCustomRequestMock = vi.fn();
const uploadMock = vi.fn();
const removeMock = vi.fn();
const fromMock = vi.fn();
const getSupabaseServerClientMock = vi.fn();

vi.mock("@/lib/http/same-origin", () => ({
  validateSameOriginMutation: validateSameOriginMutationMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: enforceRateLimitMock,
}));

vi.mock("@/lib/cakes-data", () => ({
  getCakePrices: getCakePricesMock,
  createCakeCustomRequest: createCakeCustomRequestMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

const priceId = "9e1a00db-2211-4cab-8253-0fae1d44fbc0";
const flavourId = "7d4df30d-55ab-4b6d-8973-3f2a2c15c258";
const shapeId = "f7652a0f-1666-4d6f-a2b3-dc07fca3d5d6";
const sizeId = "1b0ef9da-37d1-46d4-b394-4512dd0327d7";
const tierOptionId = "bc30d702-2f09-4952-ac8d-a84a69c13bc2";
const toppingId = "4cd31977-cd5c-4956-b1e5-551cc1f55af5";
const requestId = "66a0eb48-4457-4d56-ac3a-7b9fb9967fef";

function createValidFormData() {
  const formData = new FormData();
  formData.set("customerName", "Jane Doe");
  formData.set("phone", "+256700000000");
  formData.set("email", "jane@example.com");
  formData.set("eventDate", "2026-04-03");
  formData.set("messageOnCake", "Happy Birthday");
  formData.set("notes", "Please match the image colors.");
  formData.set("priceId", priceId);
  formData.set("flavourId", flavourId);
  formData.set("shapeId", shapeId);
  formData.set("sizeId", sizeId);
  formData.set("tierOptionId", tierOptionId);
  formData.set("toppingId", toppingId);
  return formData;
}

describe("cake custom request route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    validateSameOriginMutationMock.mockReset();
    validateSameOriginMutationMock.mockReturnValue(null);
    enforceRateLimitMock.mockReset();
    enforceRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 9,
      retryAfterSeconds: 60,
    });
    getCakePricesMock.mockReset();
    getCakePricesMock.mockResolvedValue([
      {
        id: priceId,
        flavourId,
        shapeId,
        sizeId,
        tierOptionId,
        toppingId,
        weightKg: 2,
        priceUgx: 95000,
        sourceNote: null,
        isActive: true,
        createdAt: "2026-04-01T10:00:00.000Z",
        updatedAt: "2026-04-01T10:00:00.000Z",
        flavourCode: "vanilla",
        flavourName: "Vanilla",
        shapeCode: "round",
        shapeName: "Round",
        sizeCode: "medium",
        sizeName: "Medium",
        tierOptionCode: "single",
        tierOptionName: "Single Tier",
        tierCount: 1,
        toppingCode: "buttercream",
        toppingName: "Buttercream",
      },
    ]);
    createCakeCustomRequestMock.mockReset();
    createCakeCustomRequestMock.mockResolvedValue({
      id: requestId,
      status: "pending",
      created_at: "2026-04-01T10:00:00.000Z",
    });
    uploadMock.mockReset();
    uploadMock.mockResolvedValue({ data: { path: "unused" }, error: null });
    removeMock.mockReset();
    removeMock.mockResolvedValue({ data: [], error: null });
    fromMock.mockReset();
    fromMock.mockReturnValue({
      upload: uploadMock,
      remove: removeMock,
    });
    getSupabaseServerClientMock.mockReset();
    getSupabaseServerClientMock.mockReturnValue({
      storage: {
        from: fromMock,
      },
    });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(requestId);
  });

  it("submits a valid cake request with no image", async () => {
    const { POST } = await import("@/app/api/cakes/custom-request/route");
    const formData = createValidFormData();

    const response = await POST(
      new Request("https://example.com/api/cakes/custom-request", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      requestId,
      status: "pending",
      createdAt: "2026-04-01T10:00:00.000Z",
    });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(createCakeCustomRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        referenceImage: undefined,
      }),
    );
  });

  it("uploads a valid image during final submit", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1710000000000);
    const { POST } = await import("@/app/api/cakes/custom-request/route");
    const formData = createValidFormData();
    formData.set(
      "referenceImage",
      new File(["image-binary"], "My Cake Design.png", { type: "image/png" }),
    );

    const response = await POST(
      new Request("https://example.com/api/cakes/custom-request", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(201);
    expect(fromMock).toHaveBeenCalledWith("cake-reference-images");
    expect(uploadMock).toHaveBeenCalledWith(
      "cake-requests/66a0eb48-4457-4d56-ac3a-7b9fb9967fef/1710000000000-my-cake-design.png",
      expect.any(Buffer),
      expect.objectContaining({
        contentType: "image/png",
      }),
    );
    expect(createCakeCustomRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        referenceImage: {
          bucket: "cake-reference-images",
          path: "cake-requests/66a0eb48-4457-4d56-ac3a-7b9fb9967fef/1710000000000-my-cake-design.png",
          originalFilename: "My Cake Design.png",
          contentType: "image/png",
          sizeBytes: 12,
        },
      }),
    );

    nowSpy.mockRestore();
  });

  it("rejects an invalid image mime type", async () => {
    const { POST } = await import("@/app/api/cakes/custom-request/route");
    const formData = createValidFormData();
    formData.set("referenceImage", new File(["gif"], "idea.gif", { type: "image/gif" }));

    const response = await POST(
      new Request("https://example.com/api/cakes/custom-request", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Use a JPG, PNG, or WebP image.",
    });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(createCakeCustomRequestMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized image", async () => {
    const { POST } = await import("@/app/api/cakes/custom-request/route");
    const formData = createValidFormData();
    formData.set(
      "referenceImage",
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.webp", { type: "image/webp" }),
    );

    const response = await POST(
      new Request("https://example.com/api/cakes/custom-request", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Keep the image under 5 MB.",
    });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(createCakeCustomRequestMock).not.toHaveBeenCalled();
  });

  it("rolls back the uploaded image if the database insert fails", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1710000000000);
    createCakeCustomRequestMock.mockRejectedValue(new Error("db insert failed"));
    const { POST } = await import("@/app/api/cakes/custom-request/route");
    const formData = createValidFormData();
    formData.set(
      "referenceImage",
      new File(["image-binary"], "My Cake Design.png", { type: "image/png" }),
    );

    const response = await POST(
      new Request("https://example.com/api/cakes/custom-request", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Unable to submit your cake request.",
    });
    expect(removeMock).toHaveBeenCalledWith([
      "cake-requests/66a0eb48-4457-4d56-ac3a-7b9fb9967fef/1710000000000-my-cake-design.png",
    ]);

    nowSpy.mockRestore();
  });
});
