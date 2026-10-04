import { getIntegrationUsage } from "../../../../../../src/server/data/whatsapp";
import { MAX_BODY_BYTES, parseUsageSync } from "../../../../../../src/server/integration/parsers";
import { methodNotAllowed, problem } from "../../../../../../src/server/integration/problem";
import { withIntegrationRoute } from "../../../../../../src/server/integration/route";
import { syncUsage } from "../../../../../../src/server/whatsapp/analytics";

export const POST = withIntegrationRoute(async (request, auth) => {
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return problem(413, "corpo-grande-demais", "Corpo excede o limite de 100 KiB.");
  let value: unknown;
  try { value = JSON.parse(body); } catch { return problem(400, "payload-invalido", "Corpo não é JSON válido."); }
  const parsed = parseUsageSync(value);
  if (!parsed.ok) return problem(400, "payload-invalido", parsed.detail);
  // Adapter continua ausente até prova real da conta/contrato; não vem do caller.
  const synced = await syncUsage(auth, parsed.dto);
  if (!synced.ok && synced.reason === "persistence-failed") return problem(503, "servico-indisponivel", "Sincronização de consumo temporariamente indisponível.");
  try {
    const snapshot = await getIntegrationUsage(auth, parsed.dto.phoneNumberId);
    const result = synced.ok ? "synced" : ["cadence", "lease-active"].includes(synced.reason) ? "skipped" : "unavailable";
    return Response.json({ result, ...(!synced.ok ? { reason: synced.reason } : {}), snapshot });
  } catch {
    return problem(503, "servico-indisponivel", "Leitura de consumo temporariamente indisponível.");
  }
});
export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
