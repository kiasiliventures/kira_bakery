import { describe, expect, it } from "vitest";
import {
  validateCakeReferenceImageFile,
  validateCakeReferenceImageFileContents,
} from "@/lib/cake-reference-images";

function makeFile(parts: ArrayBufferPart[], name: string, type: string) {
  return new File(parts, name, { type });
}

describe("validateCakeReferenceImageFile", () => {
  it("accepts supported metadata", () => {
    const file = makeFile([new Uint8Array([0xff, 0xd8, 0xff])], "cake.jpg", "image/jpeg");
    expect(validateCakeReferenceImageFile(file)).toBeNull();
  });
});

describe("validateCakeReferenceImageFileContents", () => {
  it("accepts a real jpeg signature", async () => {
    const file = makeFile([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], "cake.jpg", "image/jpeg");
    await expect(validateCakeReferenceImageFileContents(file)).resolves.toBeNull();
  });

  it("rejects mismatched mime metadata", async () => {
    const file = makeFile([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "cake.jpg", "image/jpeg");
    await expect(validateCakeReferenceImageFileContents(file)).resolves.toBe(
      "The uploaded file content does not match its declared image type.",
    );
  });

  it("rejects disguised non-image uploads", async () => {
    const file = makeFile([new TextEncoder().encode("not really an image")], "cake.png", "image/png");
    await expect(validateCakeReferenceImageFileContents(file)).resolves.toBe(
      "Use a valid JPG, PNG, or WebP image.",
    );
  });
});
