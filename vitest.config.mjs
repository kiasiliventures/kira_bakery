import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
      "server-only": path.join(rootDir, "tests/support/server-only.js"),
    },
  },
  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
  },
});
