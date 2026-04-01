import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CUSTOMER_ORIGIN_METADATA_KEY,
  STOREFRONT_CUSTOMER_ORIGIN,
} from "@/lib/auth/customer-source";

const singleMock = vi.fn();
const upsertMock = vi.fn();
const fromMock = vi.fn();
const getSupabaseServerClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

describe("ensureCustomerForUser", () => {
  beforeEach(() => {
    singleMock.mockReset();
    upsertMock.mockReset();
    fromMock.mockReset();
    getSupabaseServerClientMock.mockReset();

    upsertMock.mockReturnValue({
      select: () => ({
        single: singleMock,
      }),
    });

    fromMock.mockReturnValue({
      upsert: upsertMock,
    });

    getSupabaseServerClientMock.mockReturnValue({
      from: fromMock,
    });
  });

  it("rejects accounts that were not created from the storefront signup flow", async () => {
    const { ensureCustomerForUser } = await import("@/lib/customers");

    await expect(
      ensureCustomerForUser({
        id: "staff-1",
        email: "staff@example.com",
        user_metadata: {},
      } as never),
    ).rejects.toThrow("not eligible for customer profile creation");

    expect(getSupabaseServerClientMock).not.toHaveBeenCalled();
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
  });
});
