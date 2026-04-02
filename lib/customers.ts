import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  isProvisionedPrivilegedUser,
  isStorefrontCustomerUser,
  mergeStorefrontCustomerMetadata,
} from "@/lib/auth/customer-source";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type CustomerRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  default_address: string | null;
};

type EnsureCustomerInput = {
  checkoutName?: string | null;
  phone?: string | null;
  defaultAddress?: string | null;
};

type ProfileRoleRow = {
  role: string | null;
};

const PRIVILEGED_PROFILE_ROLES = new Set(["admin", "manager", "staff"]);

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveFullName(user: User, checkoutName?: string | null) {
  const userMetadata = user.user_metadata as { full_name?: string } | undefined;
  return normalizeText(checkoutName) ?? normalizeText(userMetadata?.full_name) ?? null;
}

function isPrivilegedProfileRole(role: string | null | undefined) {
  const normalized = normalizeText(role)?.toLowerCase();
  return normalized ? PRIVILEGED_PROFILE_ROLES.has(normalized) : false;
}

export async function ensureCustomerForUser(
  user: User,
  input?: EnsureCustomerInput,
): Promise<CustomerRow> {
  if (!isStorefrontCustomerUser(user) && isProvisionedPrivilegedUser(user)) {
    throw new Error(
      "Authenticated account is not eligible for customer profile creation.",
    );
  }

  const supabase = getSupabaseServerClient();

  if (!isStorefrontCustomerUser(user)) {
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (existingProfileError) {
      throw new Error(
        `Unable to verify authenticated account role: ${existingProfileError.message}`,
      );
    }

    if (isPrivilegedProfileRole((existingProfile as ProfileRoleRow | null)?.role)) {
      throw new Error(
        "Authenticated account is not eligible for customer profile creation.",
      );
    }

    const { error: updateUserError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: mergeStorefrontCustomerMetadata(user.user_metadata),
    });

    if (updateUserError) {
      throw new Error(
        `Unable to mark authenticated account as a storefront customer: ${updateUserError.message}`,
      );
    }
  }

  const email = normalizeText(user.email);
  if (!email) {
    throw new Error(
      "Authenticated customer account is missing an email address.",
    );
  }
  const payload: Record<string, string> = {
    id: user.id,
    email,
  };

  const fullName = resolveFullName(user, input?.checkoutName);
  const phone = normalizeText(input?.phone);
  const defaultAddress = normalizeText(input?.defaultAddress);

  if (fullName) {
    payload.full_name = fullName;
  }
  if (phone) {
    payload.phone = phone;
  }
  if (defaultAddress) {
    payload.default_address = defaultAddress;
  }

  const { data, error } = await supabase
    .from("customers")
    .upsert(payload, {
      onConflict: "id",
    })
    .select("id,email,full_name,phone,default_address")
    .single();

  if (error || !data) {
    throw new Error(`Unable to ensure customer account: ${error?.message ?? "unknown error"}`);
  }

  return data as CustomerRow;
}
