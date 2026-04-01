import { beforeEach, describe, expect, it, vi } from "vitest";

const findOrphanedCakeReferenceImagesMock = vi.fn();
const cleanupOrphanedCakeReferenceImagesMock = vi.fn();

vi.mock("@/lib/cake-reference-image-cleanup", () => ({
  findOrphanedCakeReferenceImages: findOrphanedCakeReferenceImagesMock,
  cleanupOrphanedCakeReferenceImages: cleanupOrphanedCakeReferenceImagesMock,
}));

describe("cake reference image cleanup route", () => {
  beforeEach(() => {
    vi.resetModules();
    findOrphanedCakeReferenceImagesMock.mockReset();
    cleanupOrphanedCakeReferenceImagesMock.mockReset();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("rejects requests without the cron secret", async () => {
    const { GET } = await import("@/app/api/internal/storage/cake-reference-images/cleanup/route");
    const response = await GET(
      new Request("https://example.com/api/internal/storage/cake-reference-images/cleanup"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Unauthorized.",
    });
  });

  it("supports dry-run cleanup inspection", async () => {
    findOrphanedCakeReferenceImagesMock.mockResolvedValue({
      cutoff: new Date("2026-04-01T12:00:00.000Z"),
      scannedCount: 3,
      orphanedObjects: [
        { path: "cake-requests/request-1/1710000000000-delete.png" },
      ],
    });

    const { GET } = await import("@/app/api/internal/storage/cake-reference-images/cleanup/route");
    const response = await GET(
      new Request(
        "https://example.com/api/internal/storage/cake-reference-images/cleanup?dryRun=1",
        {
          headers: {
            authorization: "Bearer test-cron-secret",
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      dryRun: true,
      cutoff: "2026-04-01T12:00:00.000Z",
      scannedCount: 3,
      orphanedCount: 1,
      orphanedPaths: ["cake-requests/request-1/1710000000000-delete.png"],
    });
  });

  it("executes orphan cleanup when authorized", async () => {
    cleanupOrphanedCakeReferenceImagesMock.mockResolvedValue({
      cutoff: new Date("2026-04-01T12:00:00.000Z"),
      scannedCount: 3,
      orphanedCount: 1,
      deletedCount: 1,
      deletedPaths: ["cake-requests/request-1/1710000000000-delete.png"],
    });

    const { GET } = await import("@/app/api/internal/storage/cake-reference-images/cleanup/route");
    const response = await GET(
      new Request("https://example.com/api/internal/storage/cake-reference-images/cleanup", {
        headers: {
          authorization: "Bearer test-cron-secret",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      dryRun: false,
      cutoff: "2026-04-01T12:00:00.000Z",
      scannedCount: 3,
      orphanedCount: 1,
      deletedCount: 1,
      deletedPaths: ["cake-requests/request-1/1710000000000-delete.png"],
    });
  });
});
