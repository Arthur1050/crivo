import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      // "server-only" resolves to a throwing stub outside Next's RSC build
      // (its package.json only swaps in the no-op via the "react-server"
      // export condition, which Vitest's plain Node runtime doesn't set).
      // Alias to the package's own no-op so DAL modules that import
      // "server-only" are testable under Vitest.
      "server-only": path.resolve(
        __dirname,
        "node_modules/server-only/empty.js"
      ),
    },
  },
});
