import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CATALOG_MUTATION_INVALIDATION_MAP,
  revalidateCatalogMenuSurfaces,
} from "@/lib/catalog/cache";
import {
  extractBearerToken,
  InternalRequestAuthError,
  requireInternalRequestSigningSecret,
  verifyInternalRequestToken,
} from "@/lib/internal-auth";

const CATALOG_REVALIDATION_PURPOSE = "storefront_catalog_revalidation";
const catalogRevalidationSources = Object.keys(CATALOG_MUTATION_INVALIDATION_MAP) as [
  keyof typeof CATALOG_MUTATION_INVALIDATION_MAP,
  ...(keyof typeof CATALOG_MUTATION_INVALIDATION_MAP)[],
];

const catalogRevalidationBodySchema = z.object({
  source: z.enum(catalogRevalidationSources),
  productIds: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
});

export async function POST(request: Request) {
  try {
    const providedToken = extractBearerToken(request);
    if (!providedToken) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    verifyInternalRequestToken({
      token: providedToken,
      secret: requireInternalRequestSigningSecret("STOREFRONT_INTERNAL_AUTH_TOKEN"),
      issuer: "kira-bakery-admin",
      audience: "kira-bakery-storefront",
      purpose: CATALOG_REVALIDATION_PURPOSE,
      method: "POST",
      path: new URL(request.url).pathname,
    });

    const body = await request.json().catch(() => null);
    const parsed = catalogRevalidationBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Invalid catalog revalidation payload.",
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const result = revalidateCatalogMenuSurfaces(parsed.data.source, parsed.data.productIds);

    return NextResponse.json({
      ok: true,
      source: parsed.data.source,
      productIds: result.productIds,
      tags: result.tags,
      paths: result.paths,
    });
  } catch (error) {
    if (error instanceof InternalRequestAuthError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to revalidate storefront catalog.",
      },
      { status: 500 },
    );
  }
}
