import type { User } from "@supabase/supabase-js";

export const CUSTOMER_ORIGIN_METADATA_KEY = "customer_origin";
export const STOREFRONT_CUSTOMER_ORIGIN = "storefront_pwa";
const PRIVILEGED_PROVISIONED_ROLES = new Set(["admin", "manager", "staff"]);

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

export function isProvisionedPrivilegedUser(user: Pick<User, "app_metadata">): boolean {
  const metadata = toUserMetadataRecord(user.app_metadata);
  const requestedRole = typeof metadata.role === "string" ? metadata.role.trim().toLowerCase() : "";
  const provisionedByAdmin = metadata.provisioned_by_admin === true;

  return provisionedByAdmin && PRIVILEGED_PROVISIONED_ROLES.has(requestedRole);
}

export function shouldBackfillStorefrontCustomerOrigin(
  user: Pick<User, "user_metadata" | "app_metadata">,
): boolean {
  return !isStorefrontCustomerUser(user) && !isProvisionedPrivilegedUser(user);
}
