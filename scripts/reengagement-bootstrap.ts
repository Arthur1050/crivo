/** T65: diagnóstico somente leitura. Aplicação exige o gate posterior e
 * publishAgentState com âncora/reset/expectedRevision revalidados sob lock.
 * Uso: tsx scripts/reengagement-bootstrap.ts --tenant-id <uuid>
 * [--n8n-url <https-origin> --state-table-id <id>] [--preflight]
 * Credenciais vêm somente do processo. Não carrega env nem executa seed.
 */
import type { PreflightInput, PreflightReport } from "./whatsapp-account-preflight";

type Phase = "qualificando" | "agendando" | "encerrada";
type Gate = { state: "confirmed" | "pending"; code: string };
export interface CrmSnapshot {
  tenantId: string;
  tenantSlug: string;
  channels: { id: string; tenantId: string; phoneNumberId: string; wabaId: string | null; configurationRevision: number }[];
  leads: {
    id: string; tenantId: string; externalId: string | null; resetAt: string | null;
    anchorId: string | null; revision: number;
    projection: { anchorId: string; resetAt: string | null; phase: Phase | null } | null;
    consumedEpisodes: number;
  }[];
}
export type StateRead = { state: "observed"; row: Record<string, unknown> }
  | { state: "absent" } | { state: "pending" };
export interface BootstrapDependencies {
  readCrm: (tenantId: string) => Promise<CrmSnapshot | null>;
  readState: (key: { tenantSlug: string; waId: string; leadId: string }) => Promise<StateRead>;
  preflight?: (input: PreflightInput) => Promise<PreflightReport>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const phases = ["qualificando", "agendando", "encerrada"];
const gate = (code: string, confirmed = false): Gate => ({ state: confirmed ? "confirmed" : "pending", code });
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function date(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}
function scoped(snapshot: CrmSnapshot | null, tenantId: string): snapshot is CrmSnapshot {
  return !!snapshot && snapshot.tenantId === tenantId && !!snapshot.tenantSlug
    && snapshot.channels.every((channel) => channel.tenantId === tenantId && UUID.test(channel.id) && /^\d+$/.test(channel.phoneNumberId))
    && snapshot.leads.every((lead) => lead.tenantId === tenantId && UUID.test(lead.id)
      && (lead.anchorId === null || UUID.test(lead.anchorId)) && Number.isSafeInteger(lead.revision) && lead.revision >= 0);
}

/** A revisão do CRM é expectativa, nunca evidência da revisão do cache.
 * lastInboundAt é horário de transporte no workflow legado e não prova âncora.
 */
export async function diagnoseReengagementBootstrap(input: { tenantId?: string; apply?: boolean }, deps: BootstrapDependencies) {
  const base = { dryRun: true as const, usageEnabled: false as const, dispatchEnabled: false as const };
  if (input.apply) return { ...base, gate: gate("application-outside-diagnostic"), channels: [], leads: [] };
  if (!input.tenantId || !UUID.test(input.tenantId)) return { ...base, gate: gate("explicit-tenant-required"), channels: [], leads: [] };
  const tenantId = input.tenantId;
  let initial: CrmSnapshot | null;
  try { initial = await deps.readCrm(tenantId); } catch { return { ...base, tenantId, gate: gate("crm-read-failed"), channels: [], leads: [] }; }
  if (!scoped(initial, tenantId)) return { ...base, tenantId, gate: gate("tenant-snapshot-unverified"), channels: [], leads: [] };
  const channels = [];
  for (const channel of initial.channels) {
    let proof: PreflightReport | undefined;
    if (deps.preflight && channel.wabaId && /^\d+$/.test(channel.wabaId)) {
      try { proof = await deps.preflight({ tenantId, wabaId: channel.wabaId, phoneNumberId: channel.phoneNumberId }); } catch { /* pending */ }
    }
    channels.push({ channelId: channel.id, configurationRevision: channel.configurationRevision,
      usageEnabled: false as const, account: gate(proof?.account.state === "confirmed" ? "account-observed" : "account-unverified", proof?.account.state === "confirmed"),
      testAccount: proof?.account.testAccount === true,
      ownership: gate("tenant-channel-proof-required"), timezone: gate("account-iana-proof-required"),
      analytics: gate("full-civil-month-and-zero-proof-required") });
  }
  const observations: StateRead[] = [];
  for (const lead of initial.leads) {
    try { observations.push(lead.externalId ? await deps.readState({ tenantSlug: initial.tenantSlug, waId: lead.externalId, leadId: lead.id }) : { state: "pending" }); }
    catch { observations.push({ state: "pending" }); }
  }
  let current: CrmSnapshot | null;
  try { current = await deps.readCrm(tenantId); } catch { current = null; }
  const liveSnapshot = scoped(current, tenantId) ? current : null;
  const leads = initial.leads.map((lead, index) => {
    const observation = observations[index];
    const row = observation.state === "observed" ? observation.row : null;
    const phase = row && typeof row.fase === "string" && phases.includes(row.fase) ? row.fase as Phase : null;
    const observedRevision = row && Number.isSafeInteger(row.expectedRevision) && Number(row.expectedRevision) >= 0 ? Number(row.expectedRevision) : null;
    const observedAnchor = row && typeof row.anchorMessageId === "string" && UUID.test(row.anchorMessageId) ? row.anchorMessageId : null;
    const observedReset = row && Object.hasOwn(row, "resetObservedAt") ? date(row.resetObservedAt) : undefined;
    const live = liveSnapshot?.leads.find((candidate) => candidate.id === lead.id);
    let result = gate("state-read-pending");
    if (observation.state === "absent") result = gate("phase-absent");
    else if (row) {
      if (!phase) result = gate("phase-unobserved");
      else if (!observedAnchor || observedRevision === null || observedReset === undefined) result = gate("cache-context-proof-missing");
      else if (!live || current?.tenantSlug !== initial.tenantSlug) result = gate("crm-revalidation-failed");
      else if (observedAnchor !== lead.anchorId || live.anchorId !== lead.anchorId) result = gate("anchor-changed");
      else if (observedReset !== date(lead.resetAt) || date(live.resetAt) !== date(lead.resetAt)) result = gate("reset-changed");
      else if (observedRevision !== lead.revision || live.revision !== lead.revision) result = gate("revision-conflict");
      else if (live.projection?.anchorId === live.anchorId && date(live.projection.resetAt) === date(live.resetAt) && live.projection.phase === "encerrada" && phase !== "encerrada") result = gate("phase-closed");
      else result = gate(live.projection?.phase === phase && live.projection.anchorId === observedAnchor && date(live.projection.resetAt) === observedReset ? "projection-phase-current" : "observed-context-verified", true);
    }
    return { leadId: lead.id, phase, source: observation.state === "observed" ? "n8n-data-table-row" : observation.state,
      sourceVersion: row ? date(row.updatedAt) ?? null : null, observedAnchorId: observedAnchor, observedRevision,
      expectedRevision: lead.revision, gate: result,
      dispatch: gate(lead.consumedEpisodes > 0 || (live?.consumedEpisodes ?? 0) > 0 ? "episode-already-consumed" : "dispatch-outside-bootstrap") };
  });
  return { ...base, tenantId, gate: gate("readonly-diagnostic", true), channels, leads };
}

/** Public API contract: n8n-io/n8n packages/cli/src/public-api/v1/handlers/
 * data-tables/spec/paths/listDataTableRows.generated.yml. Unsupported installed
 * versions, incomplete pages or wrong tenant/key are pending, never absent.
 */
export function createN8nStateReader(options: { origin?: string; tableId?: string; apiKey?: string; fetch?: typeof fetch }): BootstrapDependencies["readState"] {
  return async (key) => {
    let origin: URL;
    try {
      origin = new URL(options.origin ?? "");
      if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/"
        || !/^[A-Za-z0-9]{16}$/.test(options.tableId ?? "") || !options.apiKey?.trim()) return { state: "pending" };
    } catch { return { state: "pending" }; }
    let cursor: string | undefined;
    const cursors = new Set<string>();
    const rows: Record<string, unknown>[] = [];
    for (let page = 0; page < 20; page++) {
      const url = new URL(`/api/v1/data-tables/${options.tableId}/rows`, origin);
      url.searchParams.set("filter", JSON.stringify({ type: "and", filters: [
        { columnName: "tenantSlug", condition: "eq", value: key.tenantSlug }, { columnName: "waId", condition: "eq", value: key.waId },
      ] }));
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);
      try {
        const response = await (options.fetch ?? fetch)(url, { method: "GET", headers: { "X-N8N-API-KEY": options.apiKey! }, signal: AbortSignal.timeout(15_000), redirect: "error" });
        if (!response.ok) return { state: "pending" };
        const payload = object(await response.json());
        if (!payload || !Array.isArray(payload.data) || !(payload.nextCursor === null || typeof payload.nextCursor === "string")) return { state: "pending" };
        for (const raw of payload.data) {
          const row = object(raw);
          if (!row || row.tenantSlug !== key.tenantSlug || row.waId !== key.waId || row.leadId !== key.leadId) return { state: "pending" };
          // Do not retain buffer, qualification, openings or transport text.
          rows.push({ fase: row.fase, updatedAt: row.updatedAt, anchorMessageId: row.anchorMessageId,
            expectedRevision: row.expectedRevision, ...(Object.hasOwn(row, "resetObservedAt") ? { resetObservedAt: row.resetObservedAt } : {}) });
        }
        if (payload.nextCursor === null) return rows.length === 0 ? { state: "absent" } : rows.length === 1 ? { state: "observed", row: rows[0] } : { state: "pending" };
        if (!payload.nextCursor || cursors.has(payload.nextCursor)) return { state: "pending" };
        cursors.add(payload.nextCursor); cursor = payload.nextCursor;
      } catch { return { state: "pending" }; }
    }
    return { state: "pending" };
  };
}

/** Both snapshots are consistent readonly transactions, selecting metadata only. */
async function readCrmSnapshot(tenantId: string): Promise<CrmSnapshot | null> {
  const [{ Pool }, { drizzle }, { and, desc, eq }, schema] = await Promise.all([
    import("pg"), import("drizzle-orm/node-postgres"), import("drizzle-orm"), import("../src/db/schema"),
  ]);
  if (!process.env.DATABASE_URL) throw new Error("crm-unconfigured");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await drizzle(pool).transaction(async (tx) => {
      const [tenant] = await tx.select({ id: schema.tenants.id, slug: schema.tenants.slug }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
      if (!tenant) return null;
      const channels = await tx.select({ id: schema.whatsappChannels.id, tenantId: schema.whatsappChannels.tenantId, phoneNumberId: schema.whatsappChannels.phoneNumberId,
        wabaId: schema.whatsappChannels.wabaId, configurationRevision: schema.whatsappChannels.configurationRevision }).from(schema.whatsappChannels).where(eq(schema.whatsappChannels.tenantId, tenantId));
      const records = await tx.select({ id: schema.leads.id, tenantId: schema.leads.tenantId, externalId: schema.leads.externalId, resetAt: schema.leads.memoryResetRequestedAt }).from(schema.leads).where(eq(schema.leads.tenantId, tenantId));
      const leads: CrmSnapshot["leads"] = [];
      for (const lead of records) {
        const [anchor] = await tx.select({ id: schema.messages.id }).from(schema.messages).innerJoin(schema.conversations,
          and(eq(schema.conversations.id, schema.messages.conversationId), eq(schema.conversations.tenantId, schema.messages.tenantId)))
          .where(and(eq(schema.messages.tenantId, tenantId), eq(schema.conversations.leadId, lead.id), eq(schema.messages.sender, "lead")))
          .orderBy(desc(schema.messages.sentAt), desc(schema.messages.id)).limit(1);
        const [state] = await tx.select({ revision: schema.leadAgentState.revision, anchorId: schema.leadAgentState.anchorMessageId, resetAt: schema.leadAgentState.resetObservedAt, phase: schema.leadAgentState.phase })
          .from(schema.leadAgentState).where(and(eq(schema.leadAgentState.tenantId, tenantId), eq(schema.leadAgentState.leadId, lead.id)));
        const episodes = await tx.select({ dispatchAt: schema.reengagementEpisodes.dispatchAuthorizedAt }).from(schema.reengagementEpisodes)
          .where(and(eq(schema.reengagementEpisodes.tenantId, tenantId), eq(schema.reengagementEpisodes.leadId, lead.id)));
        leads.push({ ...lead, resetAt: lead.resetAt?.toISOString() ?? null, anchorId: anchor?.id ?? null, revision: state?.revision ?? 0,
          projection: state ? { anchorId: state.anchorId, resetAt: state.resetAt?.toISOString() ?? null, phase: state.phase } : null,
          consumedEpisodes: episodes.filter((episode) => episode.dispatchAt !== null).length });
      }
      return { tenantId, tenantSlug: tenant.slug, channels, leads };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  } finally { await pool.end(); }
}

export async function runBootstrapCli(args: string[], deps?: BootstrapDependencies) {
  const allowed = new Set(["--tenant-id", "--n8n-url", "--state-table-id", "--preflight", "--apply"]);
  const parsed = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!allowed.has(flag) || parsed.has(flag)) return { dryRun: true, usageEnabled: false, dispatchEnabled: false, gate: gate("invalid-arguments"), channels: [], leads: [] };
    if (flag === "--preflight" || flag === "--apply") parsed.set(flag, "true");
    else {
      const value = args[++index];
      if (!value || value.startsWith("--")) return { dryRun: true, usageEnabled: false, dispatchEnabled: false, gate: gate("invalid-arguments"), channels: [], leads: [] };
      parsed.set(flag, value);
    }
  }
  return diagnoseReengagementBootstrap({ tenantId: parsed.get("--tenant-id"), apply: parsed.has("--apply") }, deps ?? {
    readCrm: readCrmSnapshot,
    readState: createN8nStateReader({ origin: parsed.get("--n8n-url"), tableId: parsed.get("--state-table-id"), apiKey: process.env.N8N_API_KEY }),
    preflight: parsed.has("--preflight") ? (input) => import("./whatsapp-account-preflight").then((module) => module.preflightWhatsAppAccount(input)) : undefined,
  });
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/reengagement-bootstrap.ts")) {
  runBootstrapCli(process.argv.slice(2)).then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (report.gate.state !== "confirmed") process.exitCode = 1;
  }).catch(() => { console.error("bootstrap-diagnostic-failed"); process.exitCode = 1; });
}
