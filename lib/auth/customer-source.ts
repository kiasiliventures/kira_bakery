import type { User } from "@supabase/supabase-js";

export const CUSTOMER_ORIGIN_METADATA_KEY = "customer_origin";
export const STOREFRONT_CUSTOMER_ORIGIN = "storefront_pwa";

type UserMetadataRecord = Record<string, unknown>;

function toUserMetadataRecord(value: unknown): UserMetadataRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as UserMetadataRecord;
}

export function mergeStorefrontCustomerMetadata(existingMetadata?: unknown): UserMetadataRecord {
  return {
    ...toUserMetadataRecord(existingMetadata),
    [CUSTOMER_ORIGIN_METADATA_KEY]: STOREFRONT_CUSTOMER_ORIGIN,
  };
}

export function isStorefrontCustomerUser(user: Pick<User, "user_metadata">): boolean {
  const metadata = toUserMetadataRecord(user.user_metadata);
  return metadata[CUSTOMER_ORIGIN_METADATA_KEY] === STOREFRONT_CUSTOMER_ORIGIN;
}
