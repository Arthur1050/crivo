/** L14b T1: diagnóstico GET, sem cadastro, habilitação ou saldo numérico.
 * Uso: tsx scripts/whatsapp-account-preflight.ts --waba-id <id>
 *   [--tenant-id <uuid> --phone-number-id <id>] [--evidence <arquivo.json>]
 * Evidência opcional é preparada por revisão de fontes primárias. Uma URL
 * isolada não comprova o contrato: o operador deve revisar o conteúdo citado.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";

const GRAPH_VERSION = "v25.0";
export const PREFLIGHT_TIMEOUT_MS = 15_000;
type Gate = { state: "confirmed" | "pending"; code: string; source?: string };
export interface PrimaryEvidence {
  timezone?: { timezoneId: number; iana: string; source: string };
  analytics?: { source: string; monthlyServiceVolume: true; explicitZero: true };
}
export interface PreflightInput {
  wabaId: string;
  tenantId?: string;
  phoneNumberId?: string;
  evidence?: PrimaryEvidence;
}
export interface PreflightReport {
  graphVersion: string;
  dryRun: true;
  usageEnabled: false;
  account: Gate & { wabaId?: string; testAccount?: boolean; timezoneId?: number };
  ownership: Gate & { tenantId?: string; phoneNumberId?: string };
  timezone: Gate & { iana?: string };
  monthlyContract: Gate;
  analytics: Gate;
  zero: Gate;
}
function pending(code: string): Gate { return { state: "pending", code }; }
function primary(source: unknown): source is string {
  if (typeof source !== "string") return false;
  try {
    const url = new URL(source);
    const secret = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    return url.protocol === "https:" && url.hostname === "developers.facebook.com"
      && !url.username && !url.password && !url.search && !url.hash
      && /^[a-z0-9/_.-]+$/i.test(url.pathname) && !(secret && source.includes(secret));
  }
  catch { return false; }
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function httpFailure(status: number): string {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate-limited";
  return "graph-failure";
}

/** Token vem exclusivamente do processo servidor. Não retorna corpo/erro da Meta. */
export async function preflightWhatsAppAccount(
  input: PreflightInput,
  deps: { fetch?: typeof fetch } = {},
): Promise<PreflightReport> {
  const result: PreflightReport = {
    graphVersion: GRAPH_VERSION, dryRun: true, usageEnabled: false,
    account: pending("not-queried"), ownership: pending("not-verified"),
    timezone: pending("primary-timezone-evidence-missing"),
    monthlyContract: pending("monthly-contract-not-proven"),
    analytics: pending("monthly-contract-not-proven"), zero: pending("zero-not-proven"),
  };
  if (!/^\d+$/.test(input.wabaId) || (input.phoneNumberId && !/^\d+$/.test(input.phoneNumberId))
    || (input.tenantId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.tenantId))) {
    result.account = pending("invalid-input"); return result;
  }
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!token) { result.account = pending("credential-missing"); return result; }
  async function get(path: string, params: Record<string, string>) {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    try {
      const response = await (deps.fetch ?? fetch)(url, {
        method: "GET", headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
      });
      if (!response.ok) return { failure: httpFailure(response.status) };
      const payload = record(await response.json());
      return payload ? { payload } : { failure: "invalid-response" };
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      return { failure: name === "AbortError" || name === "TimeoutError" ? "timeout" : "transport-failure" };
    }
  }
  const account = await get(input.wabaId, { fields: "id,name,timezone_id" });
  if (!account.payload) { result.account = pending(account.failure ?? "invalid-response"); return result; }
  if (account.payload.id !== input.wabaId || typeof account.payload.name !== "string") {
    result.account = pending("account-mismatch"); return result;
  }
  const testAccount = /^Test WhatsApp Business Account$/i.test(account.payload.name.trim());
  const timezoneId = typeof account.payload.timezone_id === "number" ? account.payload.timezone_id : undefined;
  result.account = { state: "confirmed", code: "account-read", wabaId: input.wabaId, testAccount, timezoneId };
  const proof = input.evidence?.timezone;
  if (proof && primary(proof.source) && proof.timezoneId === timezoneId) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: proof.iana }).format();
      result.timezone = { state: "confirmed", code: "primary-timezone-reviewed", iana: proof.iana, source: proof.source };
    } catch { result.timezone = pending("invalid-iana-timezone"); }
  }
  if (!input.tenantId || !input.phoneNumberId) {
    result.ownership = pending("expected-tenant-number-missing");
  } else {
    let after: string | undefined;
    let matches = 0;
    for (let page = 0; page < 20; page++) {
      const numbers = await get(`${input.wabaId}/phone_numbers`, {
        fields: "id", limit: "100", ...(after ? { after } : {}),
      });
      if (!numbers.payload) { result.ownership = pending(numbers.failure ?? "invalid-response"); break; }
      if (!Array.isArray(numbers.payload.data) || numbers.payload.data.some((row) => typeof record(row)?.id !== "string")) {
        result.ownership = pending("invalid-number-response"); break;
      }
      matches += numbers.payload.data.filter((row) => record(row)?.id === input.phoneNumberId).length;
      const paging = record(numbers.payload.paging);
      if (!paging?.next) {
        result.ownership = matches === 1
          ? { state: "confirmed", code: "waba-membership", tenantId: input.tenantId, phoneNumberId: input.phoneNumberId }
          : pending(matches === 0 ? "number-mismatch" : "duplicate-number");
        break;
      }
      const cursor = record(paging.cursors)?.after;
      if (typeof cursor !== "string" || !cursor || cursor === after || page === 19) {
        result.ownership = pending("incomplete-number-pagination"); break;
      }
      after = cursor;
    }
  }
  const contract = input.evidence?.analytics;
  if (testAccount) result.analytics = pending("test-account-production-unproven");
  else if (result.ownership.state !== "confirmed" || result.timezone.state !== "confirmed") {
    result.analytics = pending("account-number-timezone-unverified");
  } else if (contract && primary(contract.source) && contract.monthlyServiceVolume === true && contract.explicitZero === true) {
    result.monthlyContract = { state: "confirmed", code: "monthly-contract-reviewed", source: contract.source };
    result.analytics = pending("account-access-full-month-response-pending");
    // Prova documental é distinta da primeira consulta integral real e da
    // representação observada de zero. T12/T65 fecham esses gates; nunca saldo.
    result.zero = pending("documented-zero-account-response-pending");
  }
  return result;
}

async function main() {
  config({ quiet: true });
  const args = process.argv.slice(2);
  const value = (key: string) => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
  const wabaId = value("--waba-id");
  if (!wabaId) { console.error("Uso: --waba-id <id> [--tenant-id <uuid> --phone-number-id <id>] [--evidence <arquivo.json>]"); process.exitCode = 1; return; }
  let evidence: PrimaryEvidence | undefined;
  const file = value("--evidence");
  if (file) {
    try { evidence = JSON.parse(readFileSync(file, "utf8")) as PrimaryEvidence; }
    catch { console.error("Arquivo de evidência inválido"); process.exitCode = 1; return; }
  }
  console.log(JSON.stringify(await preflightWhatsAppAccount({
    wabaId, tenantId: value("--tenant-id"), phoneNumberId: value("--phone-number-id"), evidence,
  }), null, 2));
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/whatsapp-account-preflight.ts")) {
  main().catch(() => { console.error("Falha no diagnóstico"); process.exitCode = 1; });
}
