import { describe, expect, it } from "vitest";
import { parseWorkerEndpoints, resolveTestDatabaseUrl } from "../test-connection";

const BASE = "postgresql://role:segredo@ep-holy-rice-avsjapng-pooler.c-11.us-east-1.aws.neon.tech/neondb?sslmode=require";
const ENDPOINTS = ["ep-sweet-unit-av3jrr1c", "ep-lively-voice-avoata4u"];

describe("resolveTestDatabaseUrl", () => {
  it("troca só o endpoint do host, preservando pooler, credencial, banco e parâmetros", () => {
    expect(resolveTestDatabaseUrl({ baseUrl: BASE, endpoints: ENDPOINTS, poolId: "2" })).toBe(
      "postgresql://role:segredo@ep-lively-voice-avoata4u-pooler.c-11.us-east-1.aws.neon.tech/neondb?sslmode=require"
    );
  });

  it("worker 1 usa o primeiro endpoint", () => {
    expect(resolveTestDatabaseUrl({ baseUrl: BASE, endpoints: ENDPOINTS, poolId: "1" })).toContain("@ep-sweet-unit-av3jrr1c-pooler.");
  });

  it("sem endpoints ou fora de um worker, mantém a URL base (suíte em série)", () => {
    expect(resolveTestDatabaseUrl({ baseUrl: BASE, endpoints: [], poolId: "1" })).toBe(BASE);
    expect(resolveTestDatabaseUrl({ baseUrl: BASE, endpoints: ENDPOINTS, poolId: undefined })).toBe(BASE);
  });

  it("host sem pooler continua sem pooler", () => {
    const direct = BASE.replace("-pooler", "");
    expect(resolveTestDatabaseUrl({ baseUrl: direct, endpoints: ENDPOINTS, poolId: "1" })).toContain("@ep-sweet-unit-av3jrr1c.c-11.");
  });

  it("recusa base fora do Neon e endpoint malformado", () => {
    expect(() => resolveTestDatabaseUrl({ baseUrl: "postgresql://u:p@localhost:5432/db", endpoints: ENDPOINTS, poolId: "1" })).toThrow("Neon");
    expect(() => resolveTestDatabaseUrl({ baseUrl: BASE, endpoints: ["outro-host.com"], poolId: "1" })).toThrow("inválido");
  });
});

describe("parseWorkerEndpoints", () => {
  it("separa por vírgula e ignora vazios", () => {
    expect(parseWorkerEndpoints(" ep-a , ,ep-b ")).toEqual(["ep-a", "ep-b"]);
    expect(parseWorkerEndpoints(undefined)).toEqual([]);
  });
});
