import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("push notification order linking flow", () => {
  it("auto-links an existing browser subscription to each new order before hiding the CTA", () => {
    const source = readFileSync(
      path.join(rootDir, "components", "enable-order-notifications.tsx"),
      "utf8",
    );

    expect(source).toContain("registration.pushManager.getSubscription()");
    expect(source).toContain("await linkSubscriptionToOrder(orderId, existingSubscription as PushSubscriptionWithJson);");
    expect(source).toContain('setLinkState("linked")');
    expect(source).toContain("Successive guest orders need a fresh order link");
    expect(source).not.toContain("hasExistingSubscription");
  });
});
