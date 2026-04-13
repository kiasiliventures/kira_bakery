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

type CakeReferenceImageSniffResult = {
  mimeType: CakeReferenceImageMimeType;
  extension: (typeof CAKE_REFERENCE_IMAGE_ALLOWED_EXTENSIONS)[number];
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

function matchesJpegSignature(bytes: Uint8Array) {
  return bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff;
}

function matchesPngSignature(bytes: Uint8Array) {
  return bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
}

function matchesWebpSignature(bytes: Uint8Array) {
  return bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50;
}

function sniffCakeReferenceImage(bytes: Uint8Array): CakeReferenceImageSniffResult | null {
  if (matchesJpegSignature(bytes)) {
    return {
      mimeType: "image/jpeg",
      extension: ".jpg",
    };
  }

  if (matchesPngSignature(bytes)) {
    return {
      mimeType: "image/png",
      extension: ".png",
    };
  }

  if (matchesWebpSignature(bytes)) {
    return {
      mimeType: "image/webp",
      extension: ".webp",
    };
  }

  return null;
}

function getCakeReferenceImageExtension(filename: string) {
  const match = /\.[a-z0-9]+$/i.exec(filename.trim().toLowerCase());
  return match?.[0] ?? "";
}

export async function validateCakeReferenceImageFileContents(
  file: Blob & CakeReferenceImageFileLike,
) {
  const metadataError = validateCakeReferenceImageFile(file);
  if (metadataError) {
    return metadataError;
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffCakeReferenceImage(header);
  if (!sniffed) {
    return "Use a valid JPG, PNG, or WebP image.";
  }

  if (file.type !== sniffed.mimeType) {
    return "The uploaded file content does not match its declared image type.";
  }

  const extension = getCakeReferenceImageExtension(file.name);
  if (!CAKE_REFERENCE_IMAGE_ALLOWED_EXTENSIONS.includes(extension)) {
    return "Use a JPG, PNG, or WebP image extension.";
  }

  if (
    (sniffed.mimeType === "image/jpeg" && ![".jpg", ".jpeg"].includes(extension))
    || (sniffed.mimeType === "image/png" && extension !== ".png")
    || (sniffed.mimeType === "image/webp" && extension !== ".webp")
  ) {
    return "The uploaded file extension does not match its actual image format.";
  }

  return null;
}
