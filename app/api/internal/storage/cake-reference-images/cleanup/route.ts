import { NextResponse } from "next/server";
import {
  cleanupOrphanedCakeReferenceImages,
  findOrphanedCakeReferenceImages,
} from "@/lib/cake-reference-image-cleanup";

export const runtime = "nodejs";

function getCronSecret() {
  const value = process.env.CRON_SECRET?.trim();
  if (!value) {
    throw new Error("Missing required environment variable: CRON_SECRET");
  }
  return value;
}

function isAuthorized(request: Request) {
  const authorizationHeader = request.headers.get("authorization");
  if (!authorizationHeader) {
    return false;
  }

  return authorizationHeader === `Bearer ${getCronSecret()}`;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const url = new URL(request.url);
    const isDryRun = url.searchParams.get("dryRun") === "1";

    if (isDryRun) {
      const result = await findOrphanedCakeReferenceImages();
      return NextResponse.json({
        ok: true,
        dryRun: true,
        cutoff: result.cutoff.toISOString(),
        scannedCount: result.scannedCount,
        orphanedCount: result.orphanedObjects.length,
        orphanedPaths: result.orphanedObjects.map((item) => item.path),
      });
    }

    const result = await cleanupOrphanedCakeReferenceImages();
    return NextResponse.json({
      ok: true,
      dryRun: false,
      cutoff: result.cutoff.toISOString(),
      scannedCount: result.scannedCount,
      orphanedCount: result.orphanedCount,
      deletedCount: result.deletedCount,
      deletedPaths: result.deletedPaths,
    });
  } catch (error) {
    console.error(
      "cake_reference_image_cleanup_failed",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { message: "Unable to clean up orphaned cake reference images." },
      { status: 500 },
    );
  }
}
