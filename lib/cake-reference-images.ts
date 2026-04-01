export const CAKE_REFERENCE_IMAGES_BUCKET = "cake-reference-images";
export const CAKE_REFERENCE_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const CAKE_REFERENCE_IMAGE_ORPHAN_RETENTION_DAYS = 7;
export const CAKE_REFERENCE_IMAGE_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const CAKE_REFERENCE_IMAGE_ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

const SAFE_FILENAME_MAX_LENGTH = 80;
const DEFAULT_SAFE_FILENAME = "reference-image";

export type CakeReferenceImageMimeType =
  (typeof CAKE_REFERENCE_IMAGE_ALLOWED_MIME_TYPES)[number];

export type CakeReferenceImageFileLike = {
  name: string;
  size: number;
  type: string;
};

export function formatCakeReferenceImageMaxSize() {
  return `${Math.round(CAKE_REFERENCE_IMAGE_MAX_SIZE_BYTES / (1024 * 1024))} MB`;
}

export function getCakeReferenceImageCleanupCutoff(referenceDate = new Date()) {
  return new Date(
    referenceDate.getTime() - CAKE_REFERENCE_IMAGE_ORPHAN_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
}

export function sanitizeCakeReferenceImageFilename(filename: string) {
  const trimmed = filename.trim().toLowerCase();
  const extensionMatch = /\.[a-z0-9]+$/i.exec(trimmed);
  const extension = extensionMatch?.[0] ?? "";
  const baseName = extension ? trimmed.slice(0, -extension.length) : trimmed;
  const safeBaseName = baseName
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SAFE_FILENAME_MAX_LENGTH);
  const safeExtension = CAKE_REFERENCE_IMAGE_ALLOWED_EXTENSIONS.includes(extension)
    ? extension
    : "";

  return `${safeBaseName || DEFAULT_SAFE_FILENAME}${safeExtension}`;
}

export function buildCakeReferenceImagePath(
  requestId: string,
  filename: string,
  timestamp = Date.now(),
) {
  return `cake-requests/${requestId}/${timestamp}-${sanitizeCakeReferenceImageFilename(filename)}`;
}

export function validateCakeReferenceImageFile(file: CakeReferenceImageFileLike) {
  if (!file.name.trim()) {
    return "Choose an image file to upload.";
  }

  if (!CAKE_REFERENCE_IMAGE_ALLOWED_MIME_TYPES.includes(file.type as CakeReferenceImageMimeType)) {
    return "Use a JPG, PNG, or WebP image.";
  }

  if (file.size <= 0) {
    return "Choose an image that is not empty.";
  }

  if (file.size > CAKE_REFERENCE_IMAGE_MAX_SIZE_BYTES) {
    return `Keep the image under ${formatCakeReferenceImageMaxSize()}.`;
  }

  return null;
}
