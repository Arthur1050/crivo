import { describe, expect, it } from "vitest";
import { parseWorkerEndpoints, resolveTestDatabaseUrl, resolveVitrineTestUrl } from "../test-connection";

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

describe("resolveVitrineTestUrl (L16a T7 — VBANCO-02)", () => {
  it("troca usuário e senha por krivo_vitrine e preserva host, banco e parâmetros", () => {
    expect(resolveVitrineTestUrl({ baseUrl: BASE, password: "senha-do-papel" })).toBe(
      "postgresql://krivo_vitrine:senha-do-papel@ep-holy-rice-avsjapng-pooler.c-11.us-east-1.aws.neon.tech/neondb?sslmode=require"
    );
  });

  it("funciona sobre a URL de um worker", () => {
    const worker = resolveTestDatabaseUrl({ baseUrl: BASE, endpoints: ENDPOINTS, poolId: "2" });
    expect(resolveVitrineTestUrl({ baseUrl: worker, password: "x" })).toBe(
      "postgresql://krivo_vitrine:x@ep-lively-voice-avoata4u-pooler.c-11.us-east-1.aws.neon.tech/neondb?sslmode=require"
    );
  });

  it("codifica caracteres especiais da senha para o parser da URL devolver a senha original", () => {
    const password = "a b/c@d:e?f#g%h";
    const url = new URL(resolveVitrineTestUrl({ baseUrl: BASE, password }));
    expect(url.username).toBe("krivo_vitrine");
    expect(decodeURIComponent(url.password)).toBe(password);
    expect(url.hostname).toBe("ep-holy-rice-avsjapng-pooler.c-11.us-east-1.aws.neon.tech");
    expect(url.pathname).toBe("/neondb");
  });

  it("senha ausente ou vazia → erro claro, sem a URL nem a senha base na mensagem", () => {
    for (const password of [undefined, ""]) {
      let message = "";
      try {
        resolveVitrineTestUrl({ baseUrl: BASE, password });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain("VITRINE_TEST_DB_PASSWORD");
      expect(message).not.toContain("segredo");
      expect(message).not.toContain("ep-holy-rice");
    }
  });
});
