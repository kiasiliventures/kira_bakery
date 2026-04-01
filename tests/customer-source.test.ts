import { describe, expect, it } from "vitest";
import {
  CUSTOMER_ORIGIN_METADATA_KEY,
  STOREFRONT_CUSTOMER_ORIGIN,
  isStorefrontCustomerUser,
  mergeStorefrontCustomerMetadata,
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
});
