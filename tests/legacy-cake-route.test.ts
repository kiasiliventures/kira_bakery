import { describe, expect, it } from "vitest";

describe("legacy cake route", () => {
  it("returns gone and points callers to the supported custom request route", async () => {
    const { POST } = await import("@/app/api/cake/route");

    const response = await POST(
      new Request("https://example.com/api/cake", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      message:
        "This legacy cake request endpoint is no longer supported. Use /api/cakes/custom-request instead.",
    });
  });
});
