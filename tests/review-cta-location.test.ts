import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("review CTA placement", () => {
  it("keeps the Google review prompt off the payment result page and on the order page", () => {
    const paymentResultSource = readFileSync(
      path.join(rootDir, "components", "payment-result-view.tsx"),
      "utf8",
    );
    const orderStatusSource = readFileSync(
      path.join(rootDir, "components", "order-status-view.tsx"),
      "utf8",
    );

    expect(paymentResultSource).not.toContain("OrderReviewPrompt");
    expect(orderStatusSource).toContain("OrderReviewPrompt");
  });
});
