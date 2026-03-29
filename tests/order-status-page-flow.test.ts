import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("order status page flow", () => {
  it("fetches current order state on open without background polling and keeps manual refresh", () => {
    const source = readFileSync(
      path.join(rootDir, "components", "order-status-view.tsx"),
      "utf8",
    );

    expect(source).toContain('refresh: "1"');
    expect(source).toContain("setRequestSequence((current) => current + 1)");
    expect(source).not.toContain("setTimeout(");
    expect(source).not.toContain("setInterval(");
  });

  it("keeps ready push notifications pointed at the canonical order page", () => {
    const source = readFileSync(
      path.join(rootDir, "lib", "push", "order-ready.ts"),
      "utf8",
    );

    expect(source).toContain('import { buildOrderPath } from "@/lib/orders/order-link";');
    expect(source).not.toContain('"/payment/result"');
    expect(source).not.toContain('"/account/orders"');
  });
});
