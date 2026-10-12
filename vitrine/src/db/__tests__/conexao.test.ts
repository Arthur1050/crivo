import { afterEach, describe, expect, it, vi } from "vitest";

describe("L16b T4 — conexão da vitrine (VPROJ-01 AC6)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("sem VITRINE_DATABASE_URL a conexão da app falha, e a mensagem não expõe URL", async () => {
    vi.stubEnv("VITRINE_DATABASE_URL", "");
    vi.resetModules();
    const { dbDaApp } = await import("../conexao");
    let erro: unknown;
    try {
      dbDaApp();
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(Error);
    const mensagem = (erro as Error).message;
    expect(mensagem).toContain("VITRINE_DATABASE_URL");
    expect(mensagem).not.toMatch(/postgres(ql)?:\/\//);
  });

  it("com a variável definida a conexão é criada uma vez, no primeiro uso, sem abrir conexão", async () => {
    vi.stubEnv("VITRINE_DATABASE_URL", "postgres://papel:senha@host.invalido:5432/banco");
    vi.resetModules();
    const { dbDaApp } = await import("../conexao");
    const primeira = dbDaApp();
    expect(dbDaApp()).toBe(primeira);
    expect(primeira.$client.options.connectionString).toBe(
      "postgres://papel:senha@host.invalido:5432/banco"
    );
    await primeira.$client.end();
  });

  it("criarDb usa a URL recebida (não lê o ambiente) e limita o pool a 3 conexões", async () => {
    vi.stubEnv("VITRINE_DATABASE_URL", "postgres://do-ambiente@host.invalido/ambiente");
    vi.resetModules();
    const { criarDb } = await import("../conexao");
    const db = criarDb("postgres://recebida@host.invalido/recebida");
    expect(db.$client.options.connectionString).toBe("postgres://recebida@host.invalido/recebida");
    expect(db.$client.options.max).toBe(3);
    await db.$client.end();
  });
});

describe("L16b fechamento — a conexão da app lê só VITRINE_DATABASE_URL (VPROJ-01 AC6)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("com DATABASE_URL definida e VITRINE_DATABASE_URL vazia a conexão da app continua falhando", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://dono:senha@host.invalido:5432/banco");
    vi.stubEnv("VITRINE_DATABASE_URL", "");
    vi.resetModules();
    const { dbDaApp } = await import("../conexao");
    expect(() => dbDaApp()).toThrow(/VITRINE_DATABASE_URL/);
  });
});
