import { describe, expect, it } from "vitest";
import {
  CUSTOMER_ORIGIN_METADATA_KEY,
  STOREFRONT_CUSTOMER_ORIGIN,
  isProvisionedPrivilegedUser,
  isStorefrontCustomerUser,
  mergeStorefrontCustomerMetadata,
  shouldBackfillStorefrontCustomerOrigin,
} from "@/lib/auth/customer-source";

describe("customer source helpers", () => {
  it("marks storefront signup metadata with the customer origin", () => {
    expect(
      mergeStorefrontCustomerMetadata({
        full_name: "Jane Doe",
      }),
    ).toEqual({
      full_name: "Jane Doe",
      [CUSTOMER_ORIGIN_METADATA_KEY]: STOREFRONT_CUSTOMER_ORIGIN,
    });
  });

  it("identifies storefront customer users from metadata", () => {
    expect(
      isStorefrontCustomerUser({
        user_metadata: {
          [CUSTOMER_ORIGIN_METADATA_KEY]: STOREFRONT_CUSTOMER_ORIGIN,
        },
      }),
    ).toBe(true);

    expect(
      isStorefrontCustomerUser({
        user_metadata: {
          [CUSTOMER_ORIGIN_METADATA_KEY]: "backoffice",
        },
      }),
    ).toBe(false);
  });

  it("identifies admin-provisioned privileged users from app metadata", () => {
    expect(
      isProvisionedPrivilegedUser({
        app_metadata: {
          role: "staff",
          provisioned_by_admin: true,
        },
      } as never),
    ).toBe(true);

    expect(
      isProvisionedPrivilegedUser({
        app_metadata: {
          role: "staff",
          provisioned_by_admin: false,
        },
      } as never),
    ).toBe(false);
  });

  it("backfills storefront customer origin only for non-privileged users", () => {
    expect(
      shouldBackfillStorefrontCustomerOrigin({
        user_metadata: {},
        app_metadata: {},
      } as never),
    ).toBe(true);

    expect(
      shouldBackfillStorefrontCustomerOrigin({
        user_metadata: {
          [CUSTOMER_ORIGIN_METADATA_KEY]: STOREFRONT_CUSTOMER_ORIGIN,
        },
        app_metadata: {},
      } as never),
    ).toBe(false);

    expect(
      shouldBackfillStorefrontCustomerOrigin({
        user_metadata: {},
        app_metadata: {
          role: "manager",
          provisioned_by_admin: true,
        },
      } as never),
    ).toBe(false);
  });
});
