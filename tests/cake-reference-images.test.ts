import { describe, expect, it } from "vitest";
import {
  buildCakeReferenceImagePath,
  getCakeReferenceImageCleanupCutoff,
  sanitizeCakeReferenceImageFilename,
  validateCakeReferenceImageFile,
} from "@/lib/cake-reference-images";

describe("cake reference image helpers", () => {
  it("sanitizes uploaded filenames into a safe storage path segment", () => {
    expect(sanitizeCakeReferenceImageFilename("  My Cake Design (Final).PNG ")).toBe(
      "my-cake-design-final.png",
    );
  });

  it("builds a request-scoped storage path", () => {
    expect(
      buildCakeReferenceImagePath(
        "56d94776-2b36-45f0-b7bd-5a8df5a3b8dc",
        "Inspiration Image.webp",
        1710000000000,
      ),
    ).toBe(
      "cake-requests/56d94776-2b36-45f0-b7bd-5a8df5a3b8dc/1710000000000-inspiration-image.webp",
    );
  });

  it("rejects gif uploads", () => {
    expect(
      validateCakeReferenceImageFile({
        name: "idea.gif",
        size: 1024,
        type: "image/gif",
      }),
    ).toBe("Use a JPG, PNG, or WebP image.");
  });

  it("computes the orphan cleanup cutoff using the 7 day retention window", () => {
    expect(getCakeReferenceImageCleanupCutoff(new Date("2026-04-08T12:00:00.000Z")).toISOString()).toBe(
      "2026-04-01T12:00:00.000Z",
    );
  });
});
