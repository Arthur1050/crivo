/**
 * `npm run vitrine:dev` — sobe a vitrine (`vitrine/`, porta 3100) contra o banco
 * de TESTE, lendo como o papel `krivo_vitrine`, o mesmo que a vitrine usa em
 * produção (lote-16b — VPROJ-01).
 *
 * O que ele faz: deriva a URL do papel a partir da `TEST_DATABASE_URL` (troca só
 * usuário e senha, a senha vem de `VITRINE_TEST_DB_PASSWORD`, do ambiente local),
 * gera um segredo de revalidação descartável e sobe `next dev -p 3100` na pasta
 * `vitrine/`. O processo filho recebe só as 3 variáveis da vitrine: nenhuma
 * variável do CRM (banco real, tokens, chaves) atravessa para ele.
 *
 * Nenhuma connection string, senha ou segredo é impresso: só host e nome do
 * banco, o papel e a porta.
 */
import "dotenv/config";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { resolveVitrineTestUrl, VITRINE_ROLE } from "../src/db/test-connection";

export const PORTA_DEV = 3100;

// Sem `NodeJS.ProcessEnv`: o Next o amplia exigindo `NODE_ENV`, e aqui só passam variáveis soltas.
type Ambiente = Record<string, string | undefined>;

export interface AmbienteDaVitrine {
  VITRINE_DATABASE_URL: string;
  VITRINE_REVALIDATE_SECRET: string;
  VITRINE_PUBLIC_URL: string;
}

/** As 3 variáveis que a vitrine lê. Lança, sem expor valor, se faltar entrada. */
export function ambienteDaVitrine(input: {
  baseUrl: string | undefined;
  password: string | undefined;
  porta?: number;
  segredo?: string;
}): AmbienteDaVitrine {
  if (!input.baseUrl) {
    throw new Error("TEST_DATABASE_URL não definida: o vitrine:dev só roda contra o banco de teste.");
  }
  return {
    VITRINE_DATABASE_URL: resolveVitrineTestUrl({ baseUrl: input.baseUrl, password: input.password }),
    VITRINE_REVALIDATE_SECRET: input.segredo ?? randomBytes(24).toString("hex"),
    VITRINE_PUBLIC_URL: `http://localhost:${input.porta ?? PORTA_DEV}`,
  };
}

/** Variáveis do CRM que não podem atravessar para o processo da vitrine. */
const SENSIVEL = /DATABASE|PASSWORD|SECRET|TOKEN|KEY|API|CREDENTIAL|AUTH/i;

export function ambienteDoFilho(pai: Ambiente, vitrine: AmbienteDaVitrine): Ambiente {
  const filho: Ambiente = {};
  for (const [nome, valor] of Object.entries(pai)) {
    if (!SENSIVEL.test(nome)) filho[nome] = valor;
  }
  return { ...filho, ...vitrine };
}

export interface DependenciasDev {
  env: Ambiente;
  cwd: string;
  spawn: (comando: string, args: string[], opcoes: SpawnOptions) => ChildProcess;
  log: (linha: string) => void;
  erro: (linha: string) => void;
}

/** Sobe a vitrine. Devolve o processo, ou `null` (já avisado) se faltar configuração. */
export function iniciarVitrineDev(deps: DependenciasDev): ChildProcess | null {
  let ambiente: AmbienteDaVitrine;
  try {
    ambiente = ambienteDaVitrine({
      baseUrl: deps.env.TEST_DATABASE_URL,
      password: deps.env.VITRINE_TEST_DB_PASSWORD,
    });
  } catch (e) {
    deps.erro((e as Error).message);
    return null;
  }

  const url = new URL(ambiente.VITRINE_DATABASE_URL);
  deps.log(
    `vitrine:dev -> banco DE TESTE: ${url.hostname}${url.pathname}, papel ${VITRINE_ROLE}, ${ambiente.VITRINE_PUBLIC_URL}`
  );

  return deps.spawn("npx", ["next", "dev", "-p", String(PORTA_DEV)], {
    cwd: path.resolve(deps.cwd, "vitrine"),
    stdio: "inherit",
    shell: true,
    env: ambienteDoFilho(deps.env, ambiente) as NodeJS.ProcessEnv,
  });
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/vitrine-dev.ts")) {
  const filho = iniciarVitrineDev({
    env: process.env,
    cwd: process.cwd(),
    spawn,
    log: (linha) => console.log(linha),
    erro: (linha) => console.error(linha),
  });
  if (!filho) process.exit(1);
  filho.on("exit", (code) => process.exit(code ?? 0));
}
