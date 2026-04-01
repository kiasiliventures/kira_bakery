import { beforeEach, describe, expect, it, vi } from "vitest";

const listMock = vi.fn();
const removeMock = vi.fn();
const fromMock = vi.fn();
const getSupabaseServerClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

describe("cake reference image cleanup", () => {
  beforeEach(() => {
    listMock.mockReset();
    removeMock.mockReset();
    fromMock.mockReset();
    getSupabaseServerClientMock.mockReset();

    const fromTableMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [
            {
              reference_image_path:
                "cake-requests/request-2/1710000000000-keep.png",
            },
          ],
          error: null,
        }),
      }),
    });

    fromMock.mockReturnValue({
      list: listMock,
      remove: removeMock,
    });

    getSupabaseServerClientMock.mockReturnValue({
      storage: {
        from: fromMock,
      },
      from: fromTableMock,
    });
  });

  it("finds orphaned files older than the 7 day cutoff", async () => {
    listMock
      .mockResolvedValueOnce({
        data: [
          { name: "request-1", id: null },
          { name: "request-2", id: null },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            name: "1710000000000-delete.png",
            id: "file-1",
            created_at: "2026-04-01T12:00:00.000Z",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            name: "1710000000000-keep.png",
            id: "file-2",
            created_at: "2026-04-01T12:00:00.000Z",
          },
        ],
        error: null,
      });

    const { findOrphanedCakeReferenceImages } = await import("@/lib/cake-reference-image-cleanup");
    const result = await findOrphanedCakeReferenceImages(new Date("2026-04-08T12:00:00.000Z"));

    expect(result.scannedCount).toBe(2);
    expect(result.orphanedObjects).toEqual([
      {
        path: "cake-requests/request-1/1710000000000-delete.png",
        createdAt: "2026-04-01T12:00:00.000Z",
      },
    ]);
  });

  it("deletes orphaned files in storage", async () => {
    listMock
      .mockResolvedValueOnce({
        data: [{ name: "request-1", id: null }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            name: "1710000000000-delete.png",
            id: "file-1",
            created_at: "2026-04-01T12:00:00.000Z",
          },
        ],
        error: null,
      });
    removeMock.mockResolvedValue({ data: [], error: null });

    const { cleanupOrphanedCakeReferenceImages } = await import("@/lib/cake-reference-image-cleanup");
    const result = await cleanupOrphanedCakeReferenceImages(new Date("2026-04-08T12:00:00.000Z"));

    expect(removeMock).toHaveBeenCalledWith([
      "cake-requests/request-1/1710000000000-delete.png",
    ]);
    expect(result.deletedCount).toBe(1);
  });
});
