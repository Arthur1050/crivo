import type { ChildProcess, SpawnOptions } from "node:child_process";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ambienteDaVitrine,
  ambienteDoFilho,
  iniciarVitrineDev,
  PORTA_DEV,
} from "../vitrine-dev";

const BASE = "postgresql://dono:senha-do-dono@ep-teste-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require";
const SENHA = "p@ss:w/rd%41#x";

function ambienteDoPai(): Record<string, string | undefined> {
  return {
    PATH: "/usr/bin",
    TEST_DATABASE_URL: BASE,
    VITRINE_TEST_DB_PASSWORD: SENHA,
    DATABASE_URL: "postgresql://dono:real@producao.example/neondb",
    WHATSAPP_ACCESS_TOKEN: "token-da-meta",
    BETTER_AUTH_SECRET: "segredo-do-crm",
    RESEND_API_KEY: "chave",
  };
}

function executar(env: Record<string, string | undefined>) {
  const linhas: string[] = [];
  const chamadas: { comando: string; args: string[]; opcoes: SpawnOptions }[] = [];
  const filho = { on: vi.fn() } as unknown as ChildProcess;
  const resultado = iniciarVitrineDev({
    env,
    cwd: path.resolve("/repo"),
    spawn: (comando, args, opcoes) => {
      chamadas.push({ comando, args, opcoes });
      return filho;
    },
    log: (l) => linhas.push(l),
    erro: (l) => linhas.push(l),
  });
  return { resultado, linhas, chamadas, filho };
}

describe("L16b T6 — vitrine:dev contra o banco de teste (VPROJ-01)", () => {
  it("o ambiente do filho tem as 3 variáveis da vitrine e a porta é a 3100", () => {
    const { chamadas } = executar(ambienteDoPai());
    expect(chamadas).toHaveLength(1);
    const { comando, args, opcoes } = chamadas[0];
    expect(`${comando} ${args.join(" ")}`).toBe(`npx next dev -p ${PORTA_DEV}`);
    expect(PORTA_DEV).toBe(3100);
    expect(opcoes.cwd).toBe(path.resolve("/repo", "vitrine"));
    const env = opcoes.env as Record<string, string>;
    expect(env.VITRINE_PUBLIC_URL).toBe("http://localhost:3100");
    expect(env.VITRINE_REVALIDATE_SECRET).toMatch(/^[0-9a-f]{48}$/);
    const url = new URL(env.VITRINE_DATABASE_URL);
    expect(url.username).toBe("krivo_vitrine");
    expect(decodeURIComponent(url.password)).toBe(SENHA);
    expect(url.hostname).toBe("ep-teste-pooler.us-east-1.aws.neon.tech");
    expect(url.pathname).toBe("/neondb");
  });

  it("nenhuma linha impressa contém senha, segredo ou connection string", () => {
    const { linhas, chamadas } = executar(ambienteDoPai());
    const env = chamadas[0].opcoes.env as Record<string, string>;
    expect(linhas.length).toBeGreaterThan(0);
    const proibidos = [SENHA, encodeURIComponent(SENHA), env.VITRINE_REVALIDATE_SECRET, env.VITRINE_DATABASE_URL, "senha-do-dono"];
    for (const linha of linhas) {
      for (const proibido of proibidos) expect(linha).not.toContain(proibido);
      expect(linha).not.toMatch(/postgres(ql)?:\/\//);
    }
    expect(linhas.join("\n")).toContain("krivo_vitrine");
  });

  it("variáveis do CRM (banco real, tokens, chaves) não atravessam para a vitrine", () => {
    const { chamadas } = executar(ambienteDoPai());
    const env = chamadas[0].opcoes.env as Record<string, string | undefined>;
    for (const nome of ["DATABASE_URL", "TEST_DATABASE_URL", "VITRINE_TEST_DB_PASSWORD", "WHATSAPP_ACCESS_TOKEN", "BETTER_AUTH_SECRET", "RESEND_API_KEY"]) {
      expect(env[nome], nome).toBeUndefined();
    }
    expect(env.PATH).toBe("/usr/bin");
  });

  it("sem a senha do papel não sobe nada e a mensagem não expõe a URL", () => {
    const env = ambienteDoPai();
    delete env.VITRINE_TEST_DB_PASSWORD;
    const { resultado, chamadas, linhas } = executar(env);
    expect(resultado).toBeNull();
    expect(chamadas).toHaveLength(0);
    expect(linhas.join("\n")).toContain("VITRINE_TEST_DB_PASSWORD");
    expect(linhas.join("\n")).not.toContain("senha-do-dono");
    expect(linhas.join("\n")).not.toMatch(/postgres(ql)?:\/\//);
  });

  it("sem TEST_DATABASE_URL não sobe nada (nunca cai no banco real)", () => {
    const env = ambienteDoPai();
    delete env.TEST_DATABASE_URL;
    const { resultado, chamadas } = executar(env);
    expect(resultado).toBeNull();
    expect(chamadas).toHaveLength(0);
  });

  it("cada execução gera um segredo diferente", () => {
    const a = ambienteDaVitrine({ baseUrl: BASE, password: SENHA });
    const b = ambienteDaVitrine({ baseUrl: BASE, password: SENHA });
    expect(a.VITRINE_REVALIDATE_SECRET).not.toBe(b.VITRINE_REVALIDATE_SECRET);
  });

  it("ambienteDoFilho não altera o ambiente do pai", () => {
    const pai = ambienteDoPai();
    const copia = { ...pai };
    ambienteDoFilho(pai, ambienteDaVitrine({ baseUrl: BASE, password: SENHA }));
    expect(pai).toEqual(copia);
  });
});
