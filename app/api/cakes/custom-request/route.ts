import { NextResponse } from "next/server";
import {
  buildCakeReferenceImagePath,
  CAKE_REFERENCE_IMAGES_BUCKET,
  CAKE_REFERENCE_IMAGE_MAX_SIZE_BYTES,
  validateCakeReferenceImageFile,
} from "@/lib/cake-reference-images";
import { cakeRequestSchema, parseCakeRequestFormData } from "@/lib/cakes";
import { createCakeCustomRequest, getCakePrices } from "@/lib/cakes-data";
import { validateSameOriginMutation } from "@/lib/http/same-origin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { CakeReferenceImage } from "@/types/cakes";

const MAX_CAKE_CUSTOM_REQUEST_BODY_BYTES = CAKE_REFERENCE_IMAGE_MAX_SIZE_BYTES + 128 * 1024;

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { message: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

function payloadTooLarge() {
  return NextResponse.json(
    { message: "The request is too large. Keep the reference image under 5 MB." },
    { status: 413 },
  );
}

async function deleteUploadedReferenceImage(referenceImage: CakeReferenceImage) {
  const supabase = getSupabaseServerClient();
  const removeResult = await supabase.storage
    .from(referenceImage.bucket)
    .remove([referenceImage.path]);

  if (removeResult.error) {
    throw new Error(removeResult.error.message);
  }
}

async function uploadReferenceImage(file: File, requestId: string): Promise<CakeReferenceImage> {
  const path = buildCakeReferenceImagePath(requestId, file.name);
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const supabase = getSupabaseServerClient();
  const uploadResult = await supabase.storage
    .from(CAKE_REFERENCE_IMAGES_BUCKET)
    .upload(path, fileBuffer, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message);
  }

  return {
    bucket: CAKE_REFERENCE_IMAGES_BUCKET,
    path,
    originalFilename: file.name,
    contentType: file.type,
    sizeBytes: file.size,
  };
}

export async function POST(request: Request) {
  let uploadedReferenceImage: CakeReferenceImage | undefined;

  try {
    const sameOriginViolation = validateSameOriginMutation(request);
    if (sameOriginViolation) {
      return sameOriginViolation;
    }

    const rateLimit = await enforceRateLimit(request, "cake-custom-request", 10, 15 * 60_000);
    if (!rateLimit.allowed) {
      return tooManyRequests(rateLimit.retryAfterSeconds);
    }

    const contentType = request.headers.get("Content-Type") ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json(
        { message: "Submit the cake request as multipart form data." },
        { status: 400 },
      );
    }

    const contentLengthHeader = request.headers.get("Content-Length");
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(contentLength) && contentLength > MAX_CAKE_CUSTOM_REQUEST_BODY_BYTES) {
        return payloadTooLarge();
      }
    }

    const formData = await request.formData();
    const parsed = cakeRequestSchema.safeParse(parseCakeRequestFormData(formData));

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid cake request payload.", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const referenceImageValue = formData.get("referenceImage");
    let referenceImageFile: File | undefined;

    if (referenceImageValue instanceof File) {
      referenceImageFile = referenceImageValue.size > 0 ? referenceImageValue : undefined;
    } else if (referenceImageValue !== null) {
      return NextResponse.json(
        { message: "Use a valid JPG, PNG, or WebP reference image." },
        { status: 400 },
      );
    }

    if (referenceImageFile) {
      const referenceImageError = validateCakeReferenceImageFile(referenceImageFile);
      if (referenceImageError) {
        return NextResponse.json({ message: referenceImageError }, { status: 400 });
      }
    }

    const prices = await getCakePrices();
    const selectedPrice = prices.find((price) => price.id === parsed.data.priceId);

    if (!selectedPrice) {
      return NextResponse.json(
        { message: "The selected cake combination is no longer available." },
        { status: 400 },
      );
    }

    if (
      selectedPrice.flavourId !== parsed.data.flavourId
      || selectedPrice.shapeId !== parsed.data.shapeId
      || selectedPrice.sizeId !== parsed.data.sizeId
      || selectedPrice.tierOptionId !== parsed.data.tierOptionId
      || selectedPrice.toppingId !== parsed.data.toppingId
    ) {
      return NextResponse.json(
        { message: "Cake selection does not match the current pricing matrix." },
        { status: 400 },
      );
    }

    const requestId = crypto.randomUUID();

    if (referenceImageFile) {
      uploadedReferenceImage = await uploadReferenceImage(referenceImageFile, requestId);
    }

    try {
      const created = await createCakeCustomRequest({
        requestId,
        customerName: parsed.data.customerName,
        phone: parsed.data.phone,
        email: parsed.data.email || undefined,
        notes: parsed.data.notes || undefined,
        eventDate: parsed.data.eventDate,
        messageOnCake: parsed.data.messageOnCake || undefined,
        referenceImage: uploadedReferenceImage,
        price: selectedPrice,
      });

      return NextResponse.json(
        {
          ok: true,
          requestId: created.id,
          status: created.status,
          createdAt: created.created_at,
        },
        { status: 201 },
      );
    } catch (error) {
      if (uploadedReferenceImage) {
        try {
          await deleteUploadedReferenceImage(uploadedReferenceImage);
        } catch (cleanupError) {
          console.warn(
            "cake_reference_image_rollback_failed",
            cleanupError instanceof Error ? cleanupError.message : "unknown",
          );
        }
      }

      throw error;
    }
  } catch (error) {
    console.error("cake_custom_request_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ message: "Unable to submit your cake request." }, { status: 500 });
  }
}
