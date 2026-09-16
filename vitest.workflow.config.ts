import path from "node:path";
import { workflow } from "@workflow/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [workflow({ rootDir: ".workflow-test" })],
  test: { include: ["workflows/__tests__/**/*.test.ts"], testTimeout: 30_000 },
  resolve: { alias: { "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js") } },
});
