import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CUSTOMER_ORIGIN_METADATA_KEY,
  STOREFRONT_CUSTOMER_ORIGIN,
} from "@/lib/auth/customer-source";

const singleMock = vi.fn();
const upsertMock = vi.fn();
const updateUserByIdMock = vi.fn();
const profileMaybeSingleMock = vi.fn();
const profileEqMock = vi.fn();
const profileSelectMock = vi.fn();
const fromMock = vi.fn();
const getSupabaseServerClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

describe("ensureCustomerForUser", () => {
  beforeEach(() => {
    singleMock.mockReset();
    upsertMock.mockReset();
    updateUserByIdMock.mockReset();
    profileMaybeSingleMock.mockReset();
    profileEqMock.mockReset();
    profileSelectMock.mockReset();
    fromMock.mockReset();
    getSupabaseServerClientMock.mockReset();

    upsertMock.mockReturnValue({
      select: () => ({
        single: singleMock,
      }),
    });

    profileEqMock.mockReturnValue({
      maybeSingle: profileMaybeSingleMock,
    });

    profileSelectMock.mockReturnValue({
      eq: profileEqMock,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: profileSelectMock,
        };
      }

      if (table === "customers") {
        return {
          upsert: upsertMock,
        };
      }

      throw new Error(`Unexpected table access: ${table}`);
    });

    getSupabaseServerClientMock.mockReturnValue({
      auth: {
        admin: {
          updateUserById: updateUserByIdMock,
        },
      },
      from: fromMock,
    });

    profileMaybeSingleMock.mockResolvedValue({
      data: null,
      error: null,
    });
    updateUserByIdMock.mockResolvedValue({
      data: { user: null },
      error: null,
    });
  });

  it("rejects accounts provisioned for privileged backoffice roles", async () => {
    const { ensureCustomerForUser } = await import("@/lib/customers");

    await expect(
      ensureCustomerForUser({
        id: "staff-1",
        email: "staff@example.com",
        user_metadata: {},
        app_metadata: {
          role: "staff",
          provisioned_by_admin: true,
        },
      } as never),
    ).rejects.toThrow("not eligible for customer profile creation");

    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("rejects accounts that still have a privileged profile row", async () => {
    profileMaybeSingleMock.mockResolvedValue({
      data: {
        role: "staff",
      },
      error: null,
    });

    const { ensureCustomerForUser } = await import("@/lib/customers");

    await expect(
      ensureCustomerForUser({
        id: "legacy-staff-1",
        email: "legacy@example.com",
        user_metadata: {},
        app_metadata: {},
      } as never),
    ).rejects.toThrow("not eligible for customer profile creation");

    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("backfills missing storefront customer metadata for non-privileged accounts before upserting", async () => {
    singleMock.mockResolvedValue({
      data: {
        id: "customer-legacy-1",
        email: "customer@example.com",
        full_name: "Jane Doe",
        phone: "+256700000000",
        default_address: "Kampala Road",
      },
      error: null,
    });

    const { ensureCustomerForUser } = await import("@/lib/customers");

    await expect(
      ensureCustomerForUser(
        {
          id: "customer-legacy-1",
          email: "customer@example.com",
          user_metadata: {
            full_name: "Jane Doe",
          },
          app_metadata: {},
        } as never,
        {
          phone: "+256700000000",
          defaultAddress: "Kampala Road",
        },
      ),
    ).resolves.toEqual({
      id: "customer-legacy-1",
      email: "customer@example.com",
      full_name: "Jane Doe",
      phone: "+256700000000",
      default_address: "Kampala Road",
    });

    expect(profileSelectMock).toHaveBeenCalledWith("role");
    expect(updateUserByIdMock).toHaveBeenCalledWith("customer-legacy-1", {
      user_metadata: {
        full_name: "Jane Doe",
        [CUSTOMER_ORIGIN_METADATA_KEY]: STOREFRONT_CUSTOMER_ORIGIN,
      },
    });
  });

  it("upserts storefront customer accounts into the customers table", async () => {
    singleMock.mockResolvedValue({
      data: {
        id: "customer-1",
        email: "customer@example.com",
        full_name: "Jane Doe",
        phone: "+256700000000",
        default_address: "Kampala Road",
      },
      error: null,
    });

    const { ensureCustomerForUser } = await import("@/lib/customers");

    await expect(
      ensureCustomerForUser(
        {
          id: "customer-1",
          email: "customer@example.com",
          user_metadata: {
            full_name: "Jane Doe",
            [CUSTOMER_ORIGIN_METADATA_KEY]: STOREFRONT_CUSTOMER_ORIGIN,
          },
        } as never,
        {
          phone: "+256700000000",
          defaultAddress: "Kampala Road",
        },
      ),
    ).resolves.toEqual({
      id: "customer-1",
      email: "customer@example.com",
      full_name: "Jane Doe",
      phone: "+256700000000",
      default_address: "Kampala Road",
    });

    expect(fromMock).toHaveBeenCalledWith("customers");
    expect(upsertMock).toHaveBeenCalledWith(
      {
        id: "customer-1",
        email: "customer@example.com",
        full_name: "Jane Doe",
        phone: "+256700000000",
        default_address: "Kampala Road",
      },
      {
        onConflict: "id",
      },
    );
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });
});
