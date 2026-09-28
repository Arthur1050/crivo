import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Endpoints das branches do Neon de cada worker (`test-workers.local.json`,
 * fora do git; modelo em `test-workers.example.json`). Só valem para
 * `npm test` (`TEST_WORKER_BRANCHES=1`, ver `scripts/test-suite.mjs`): testes
 * pontuais ficam na branch base, livre enquanto a suíte paralela roda. Sem o
 * arquivo, tudo roda em série num banco só, como antes.
 */
function workerEndpoints(): string[] {
  if (process.env.TEST_WORKER_BRANCHES !== "1") return [];
  const file = path.resolve(__dirname, "test-workers.local.json");
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { endpoints?: unknown };
  return Array.isArray(parsed.endpoints)
    ? parsed.endpoints.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

const endpoints = workerEndpoints();

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    // Test files hit the real Neon database with shared tenant/lead rows
    // (delete-and-insert seed, cross-file fixtures). Sharing one database,
    // parallel files race those writes, so the suite runs serially. With one
    // Neon branch per worker (src/db/test-connection.ts) each worker writes to
    // its own copy and files run in parallel, one worker per branch.
    fileParallelism: endpoints.length > 0,
    maxWorkers: Math.max(endpoints.length, 1),
    env: { TEST_DATABASE_WORKER_ENDPOINTS: endpoints.join(",") },
    exclude: ["**/node_modules/**", "workflows/**"],
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
