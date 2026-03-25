import "server-only";

import type { User } from "@supabase/supabase-js";
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

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveFullName(user: User, checkoutName?: string | null) {
  const userMetadata = user.user_metadata as { full_name?: string } | undefined;
  return normalizeText(checkoutName) ?? normalizeText(userMetadata?.full_name) ?? null;
}

export async function ensureCustomerForUser(
  user: User,
  input?: EnsureCustomerInput,
): Promise<CustomerRow> {
  const email = normalizeText(user.email);
  if (!email) {
    throw new Error("Authenticated customer account is missing an email address.");
  }

  const supabase = getSupabaseServerClient();
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
