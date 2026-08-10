import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { db } from "../../db";
import {
  brokers,
  conversations,
  documentCategories,
  documents,
  leads,
  messages,
  tenantApiKeys,
  tenants,
} from "../../db/schema";

export type Tenant = typeof tenants.$inferSelect;
export type Broker = typeof brokers.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentCategory = typeof documentCategories.$inferSelect;
export type LeadStatus = Lead["status"];
export type Modality = Document["modality"];
export type CategoryColor = DocumentCategory["color"];

const ALL_MODALITIES: Modality[] = ["novo", "usado", "ambos"];

/**
 * Única função da camada de acesso que não exige tenant_id — alimenta o
 * seletor de tenant (design.md — Camada de acesso a dados).
 */
export async function getTenants(): Promise<Tenant[]> {
  return db.select().from(tenants).orderBy(asc(tenants.createdAt), asc(tenants.id));
}

export async function getTenant(tenantId: string): Promise<Tenant | null> {
  const rows = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Resolve o tenant a partir do hash sha256 de uma API key (lote-5 —
 * `src/server/integration/auth.ts`, INT-01). Chaves com `revokedAt`
 * preenchido são ignoradas — a única função da camada de acesso que não
 * recebe `tenantId` como parâmetro, porque é ela quem o produz.
 */
export async function resolveTenantIdByApiKeyHash(
  keyHash: string
): Promise<string | null> {
  const rows = await db
    .select({ tenantId: tenantApiKeys.tenantId })
    .from(tenantApiKeys)
    .where(
      and(eq(tenantApiKeys.keyHash, keyHash), isNull(tenantApiKeys.revokedAt))
    )
    .limit(1);
  return rows[0]?.tenantId ?? null;
}

export async function getBrokers(tenantId: string): Promise<Broker[]> {
  return db.select().from(brokers).where(eq(brokers.tenantId, tenantId));
}

/**
 * Lead + nome do corretor responsável (`null` quando `brokerId` é nulo).
 * Extensão ADITIVA do retorno de `getLeads` (redesign-crm-astryx — RD-03 AC3):
 * todas as colunas de `leads` continuam presentes e inalteradas.
 */
export type LeadWithBroker = Lead & { brokerName: string | null };

export async function getLeads(
  tenantId: string,
  filters?: { status?: LeadStatus }
): Promise<LeadWithBroker[]> {
  return db
    .select({ ...getTableColumns(leads), brokerName: brokers.name })
    .from(leads)
    // LEFT (não INNER): leads sem corretor continuam aparecendo no Kanban,
    // apenas sem avatar (spec.md — Edge Cases).
    .leftJoin(brokers, eq(leads.brokerId, brokers.id))
    .where(
      and(
        eq(leads.tenantId, tenantId),
        filters?.status ? eq(leads.status, filters.status) : undefined
      )
    )
    // Determinístico (lote-3 — lesson do Verifier L2, mesmo gap de
    // getTenants): mais recentemente atualizado primeiro, id como desempate.
    .orderBy(desc(leads.updatedAt), asc(leads.id));
}

export interface RecentLead {
  id: string;
  name: string;
  budgetCents: bigint | null;
  modality: Lead["modality"];
  status: LeadStatus;
  brokerName: string | null;
  firstContactAt: Date;
}

/**
 * Últimos leads gerados pelo agente, para o card "Leads Recentes" do
 * dashboard (redesign-crm-astryx — RD-04 AC4/AC5). Ordena por
 * `firstContactAt` DESC (id como desempate determinístico) e é INDEPENDENTE
 * do filtro de período da página (spec.md — assumption "Leads Recentes"):
 * o período filtra KPIs e gráficos, nunca esta lista. Tenants com menos
 * leads que `limit` retornam apenas os existentes; sem leads, `[]`.
 */
export async function getRecentLeads(
  tenantId: string,
  limit = 5
): Promise<RecentLead[]> {
  return db
    .select({
      id: leads.id,
      name: leads.name,
      budgetCents: leads.budgetCents,
      modality: leads.modality,
      status: leads.status,
      brokerName: brokers.name,
      firstContactAt: leads.firstContactAt,
    })
    .from(leads)
    .leftJoin(brokers, eq(leads.brokerId, brokers.id))
    .where(eq(leads.tenantId, tenantId))
    .orderBy(desc(leads.firstContactAt), asc(leads.id))
    .limit(limit);
}

export async function getLead(
  tenantId: string,
  leadId: string
): Promise<Lead | null> {
  const rows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getConversations(
  tenantId: string
): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.tenantId, tenantId));
}

export async function getMessages(
  tenantId: string,
  conversationId: string
): Promise<Message[]> {
  return db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.conversationId, conversationId)
      )
    )
    // Determinístico (lote-3 — thread lida em ordem cronológica): mais antiga
    // primeiro, id como desempate.
    .orderBy(asc(messages.sentAt), asc(messages.id));
}

/**
 * Histórico de mensagens de um lead (lote-6b — CTX-02), para o novo
 * `GET /api/v1/leads/{id}/messages`. `null` quando o lead não existe no
 * tenant (mesma semântica de `getLead`) — distinto de `[]`, que é um lead
 * existente sem nenhuma mensagem. Filtra `tenantId` em `messages` E em
 * `conversations` (defesa em profundidade, como as demais queries desta
 * camada). Busca as `limit` mensagens mais RECENTES (`sentAt DESC, id DESC`)
 * e reverte em TS para devolver em ordem cronológica crescente — ordenar
 * ASC + `LIMIT n` devolveria as mais antigas, não as mais recentes.
 */
export async function getLeadMessages(
  tenantId: string,
  leadId: string,
  limit: number
): Promise<Message[] | null> {
  const lead = await getLead(tenantId, leadId);
  if (!lead) return null;

  const rows = await db
    .select(getTableColumns(messages))
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(conversations.tenantId, tenantId),
        eq(conversations.leadId, leadId)
      )
    )
    .orderBy(desc(messages.sentAt), desc(messages.id))
    .limit(limit);

  return rows.reverse();
}

export interface ConversationSummaryLastMessage {
  content: string;
  sentAt: Date;
  sender: Message["sender"];
}

export interface ConversationSummary {
  id: string;
  leadId: string;
  leadName: string;
  lastMessage: ConversationSummaryLastMessage | null;
}

/**
 * Lista de conversas do tenant para a tela de Chats (lote-3 — CHAT-01):
 * junta o nome do lead e a última mensagem de cada conversa. Conversas sem
 * nenhuma mensagem entram com `lastMessage: null` e ficam por último na
 * ordenação. Desempate determinístico por `conversations.createdAt DESC, id`
 * (design.md — Data Models), aplicado tanto entre conversas com mensagem
 * (sentAt empatado) quanto entre conversas sem mensagem.
 */
export async function getConversationSummaries(
  tenantId: string
): Promise<ConversationSummary[]> {
  const [conversationRows, leadRows, messageRows] = await Promise.all([
    db.select().from(conversations).where(eq(conversations.tenantId, tenantId)),
    db
      .select({ id: leads.id, name: leads.name })
      .from(leads)
      .where(eq(leads.tenantId, tenantId)),
    // Ordenada ASC por sentAt/id: a última iteração do loop abaixo sobrescreve
    // o Map com a mensagem mais recente de cada conversa.
    db
      .select()
      .from(messages)
      .where(eq(messages.tenantId, tenantId))
      .orderBy(asc(messages.sentAt), asc(messages.id)),
  ]);

  const leadNameById = new Map(leadRows.map((lead) => [lead.id, lead.name]));

  const lastMessageByConversation = new Map<string, Message>();
  for (const message of messageRows) {
    lastMessageByConversation.set(message.conversationId, message);
  }

  const entries = conversationRows.map((conversation) => {
    const lastMessage = lastMessageByConversation.get(conversation.id) ?? null;
    const summary: ConversationSummary = {
      id: conversation.id,
      leadId: conversation.leadId,
      leadName: leadNameById.get(conversation.leadId) ?? "",
      lastMessage: lastMessage
        ? {
            content: lastMessage.content,
            sentAt: lastMessage.sentAt,
            sender: lastMessage.sender,
          }
        : null,
    };
    return { summary, createdAt: conversation.createdAt };
  });

  entries.sort((a, b) => {
    const aHasMessage = a.summary.lastMessage !== null;
    const bHasMessage = b.summary.lastMessage !== null;
    if (aHasMessage !== bHasMessage) return aHasMessage ? -1 : 1;

    if (aHasMessage && bHasMessage) {
      const sentAtDiff =
        b.summary.lastMessage!.sentAt.getTime() -
        a.summary.lastMessage!.sentAt.getTime();
      if (sentAtDiff !== 0) return sentAtDiff;
    }

    const createdAtDiff = b.createdAt.getTime() - a.createdAt.getTime();
    if (createdAtDiff !== 0) return createdAtDiff;

    return a.summary.id < b.summary.id ? -1 : a.summary.id > b.summary.id ? 1 : 0;
  });

  return entries.map((entry) => entry.summary);
}

export interface DocumentFilters {
  modality?: Modality;
  categoryId?: string;
  search?: string;
}

export async function getDocuments(
  tenantId: string,
  filters?: DocumentFilters
): Promise<Document[]> {
  return db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, tenantId),
        filters?.modality ? eq(documents.modality, filters.modality) : undefined,
        filters?.categoryId
          ? eq(documents.categoryId, filters.categoryId)
          : undefined,
        filters?.search ? ilike(documents.name, `%${filters.search}%`) : undefined
      )
    )
    .orderBy(desc(documents.uploadedAt));
}

export async function getDocumentCategories(
  tenantId: string
): Promise<DocumentCategory[]> {
  return db
    .select()
    .from(documentCategories)
    .where(eq(documentCategories.tenantId, tenantId));
}

export interface DocumentSample {
  recent: Document[];
  countsByModality: Record<Modality, number>;
}

/**
 * Amostra usada em telas de resumo (ex.: dashboard de documentos): os 5
 * documentos mais recentes do tenant + a contagem total por modalidade
 * (todas as 3 modalidades sempre presentes, com 0 quando não há documentos).
 */
export async function getDocumentSample(
  tenantId: string
): Promise<DocumentSample> {
  const recent = await db
    .select()
    .from(documents)
    .where(eq(documents.tenantId, tenantId))
    .orderBy(desc(documents.uploadedAt))
    .limit(5);

  const counts = await db
    .select({ modality: documents.modality, count: count() })
    .from(documents)
    .where(eq(documents.tenantId, tenantId))
    .groupBy(documents.modality);

  const countsByModality = ALL_MODALITIES.reduce(
    (acc, modality) => {
      acc[modality] = 0;
      return acc;
    },
    {} as Record<Modality, number>
  );
  for (const row of counts) {
    countsByModality[row.modality] = Number(row.count);
  }

  return { recent, countsByModality };
}

export interface DashboardRange {
  from: Date;
  to: Date;
}

export interface DashboardKpis {
  avgFirstResponseMinutes: number | null;
  respondedCount: number;
  leadCount: number;
  qualificationRate: number | null;
  escalationRate: number | null;
  attendanceRate: number | null;
  confirmedMeetingCount: number;
}

/**
 * KPIs do Dashboard (lote-4 — DASH-01, DASH-07) para o conjunto P: leads do
 * tenant com `firstContactAt` dentro de `range` (limites inclusivos —
 * spec.md, assumption "Fuso dos limites de período"). Uma única query busca
 * P; toda agregação roda em TS (design.md — "volume do piloto é pequeno").
 * Taxas são frações 0–1 (não percentuais); `null` sempre que o denominador
 * relevante é 0 — nunca `NaN`/`Infinity` (DASH-07). Formatação para exibição
 * é responsabilidade da UI.
 */
export async function getDashboardKpis(
  tenantId: string,
  range: DashboardRange
): Promise<DashboardKpis> {
  const periodLeads = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, tenantId),
        gte(leads.firstContactAt, range.from),
        lte(leads.firstContactAt, range.to)
      )
    );

  const leadCount = periodLeads.length;

  const responded = periodLeads.filter((lead) => lead.firstResponseAt !== null);
  const respondedCount = responded.length;
  const avgFirstResponseMinutes =
    respondedCount === 0
      ? null
      : responded.reduce(
          (sum, lead) =>
            sum +
            (lead.firstResponseAt!.getTime() - lead.firstContactAt.getTime()) /
              60000,
          0
        ) / respondedCount;

  const qualifiedCount = periodLeads.filter(
    (lead) => lead.status === "qualificado_agendado"
  ).length;
  const qualificationRate = leadCount === 0 ? null : qualifiedCount / leadCount;

  const escalatedCount = periodLeads.filter(
    (lead) => lead.status === "escalado_humano"
  ).length;
  const escalationRate = leadCount === 0 ? null : escalatedCount / leadCount;

  const confirmedMeetings = periodLeads.filter(
    (lead) => lead.meetingAttended !== null
  );
  const confirmedMeetingCount = confirmedMeetings.length;
  const attendedCount = confirmedMeetings.filter(
    (lead) => lead.meetingAttended === true
  ).length;
  const attendanceRate =
    confirmedMeetingCount === 0 ? null : attendedCount / confirmedMeetingCount;

  return {
    avgFirstResponseMinutes,
    respondedCount,
    leadCount,
    qualificationRate,
    escalationRate,
    attendanceRate,
    confirmedMeetingCount,
  };
}

export type DashboardGranularity = "day" | "week";

export interface LeadVolumeBucket {
  bucketStart: Date;
  count: number;
}

function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

const DAY_MS = 86400000;

/** Início (segunda-feira 00:00 UTC) da semana ISO que contém `date`. */
function isoWeekStart(date: Date): number {
  const day = utcDayStart(date);
  const dow = new Date(day).getUTCDay(); // 0=domingo .. 6=sábado
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  return day - daysSinceMonday * DAY_MS;
}

/**
 * Série de volume de leads no tempo (lote-4 — DASH-03), buckets contínuos
 * (incluindo zerados) cobrindo `range` inteiro — nunca só os dias/semanas
 * com dado. Granularidade é decidida pelo chamador (`resolveDashboardPeriod`
 * na UI); esta função só constrói os buckets pedidos.
 */
export async function getLeadVolumeSeries(
  tenantId: string,
  range: DashboardRange,
  granularity: DashboardGranularity
): Promise<LeadVolumeBucket[]> {
  const rows = await db
    .select({ firstContactAt: leads.firstContactAt })
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, tenantId),
        gte(leads.firstContactAt, range.from),
        lte(leads.firstContactAt, range.to)
      )
    );

  const bucketOf = granularity === "day" ? utcDayStart : isoWeekStart;
  const step = granularity === "day" ? DAY_MS : 7 * DAY_MS;

  const counts = new Map<number, number>();
  for (const row of rows) {
    const bucket = bucketOf(row.firstContactAt);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  const startBucket = bucketOf(range.from);
  const endBucket = bucketOf(range.to);
  const buckets: LeadVolumeBucket[] = [];
  for (let bucket = startBucket; bucket <= endBucket; bucket += step) {
    buckets.push({ bucketStart: new Date(bucket), count: counts.get(bucket) ?? 0 });
  }
  return buckets;
}

export interface LeadDistributionBucket {
  bucket: string;
  count: number;
}

export interface LeadDistributions {
  modality: LeadDistributionBucket[];
  motivation: LeadDistributionBucket[];
}

// Buckets fixos (sempre presentes, mesmo com contagem 0) — "nao_informado"
// cobre leads com o campo nulo (spec.md — distribuições nunca excluem dado).
const MODALITY_BUCKETS = ["novo", "usado", "ambos", "nao_informado"] as const;
const MOTIVATION_BUCKETS = ["investidor", "morador", "nao_informado"] as const;

/**
 * Distribuições de P por `modality` e `motivation` (lote-4 — DASH-04).
 * Buckets fixos, cada distribuição somando |P| (todo lead cai em exatamente
 * um bucket, incluindo "nao_informado" para campo nulo).
 */
export async function getLeadDistributions(
  tenantId: string,
  range: DashboardRange
): Promise<LeadDistributions> {
  const rows = await db
    .select({ modality: leads.modality, motivation: leads.motivation })
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, tenantId),
        gte(leads.firstContactAt, range.from),
        lte(leads.firstContactAt, range.to)
      )
    );

  const modalityCounts = new Map<string, number>();
  const motivationCounts = new Map<string, number>();
  for (const row of rows) {
    const modalityBucket = row.modality ?? "nao_informado";
    modalityCounts.set(
      modalityBucket,
      (modalityCounts.get(modalityBucket) ?? 0) + 1
    );
    const motivationBucket = row.motivation ?? "nao_informado";
    motivationCounts.set(
      motivationBucket,
      (motivationCounts.get(motivationBucket) ?? 0) + 1
    );
  }

  return {
    modality: MODALITY_BUCKETS.map((bucket) => ({
      bucket,
      count: modalityCounts.get(bucket) ?? 0,
    })),
    motivation: MOTIVATION_BUCKETS.map((bucket) => ({
      bucket,
      count: motivationCounts.get(bucket) ?? 0,
    })),
  };
}

// --- Writes (lote-2 — CONF-01/02, DOC-01/02/04/05/06/07) ---------------
//
// Toda escrita abaixo filtra por tenantId no WHERE — nunca só pelo id do
// registro — para que um id vazado/adivinhado de outro tenant nunca seja
// afetado por engano.

const POSTGRES_UNIQUE_VIOLATION = "23505";

function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const record = err as { code?: unknown; cause?: unknown };
  if (typeof record.code === "string") return record.code;
  // drizzle-orm envolve o erro do driver `pg` em `DrizzleQueryError`,
  // preservando o erro original em `.cause` (que tem `.code`).
  if (record.cause !== undefined) return pgErrorCode(record.cause);
  return undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === POSTGRES_UNIQUE_VIOLATION;
}

export interface TenantSettingsUpdate {
  name: string;
  agentName: string;
  supportedModality: Modality;
  // Campos de identidade opcionais (redesign-crm-astryx — RD-07 AC3). Chave
  // ausente = coluna intocada; string vazia/em branco ou `null` = grava null.
  city?: string | null;
  state?: string | null;
  agentWhatsapp?: string | null;
  website?: string | null;
  agentPresentationMessage?: string | null;
  // Tom de voz / personalidade do agente (lote-6b — PER-03). Mesmo padrão
  // SPG-1 de `agentPresentationMessage`: chave ausente = coluna intocada;
  // string vazia/em branco ou `null` = grava null. Validação de tamanho
  // (500 chars) é responsabilidade da action, não desta camada.
  agentVoiceTone?: string | null;
  // Horário comercial (lote-6 — CONF-05). Mesmo padrão SPG-1 dos campos
  // acima, sem normalização de texto (dias são inteiros; horas já chegam
  // validadas pela action — T2): chave ausente = coluna intocada; `null`
  // explícito = limpa; valor presente = grava como veio.
  meetingDays?: number[] | null;
  meetingHoursStart?: string | null;
  meetingHoursEnd?: string | null;
}

/**
 * Normaliza um campo opcional de identidade: `undefined` (chave ausente no
 * payload) devolve `undefined` para que a coluna NÃO entre no `set` e fique
 * intocada; `null` ou string vazia/só espaços viram `null` na coluna
 * (RD-07 AC3: opcional vazio persiste null, sem erro de validação).
 */
function optionalTenantText(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export async function updateTenantSettings(
  tenantId: string,
  updates: TenantSettingsUpdate
): Promise<Tenant | null> {
  const setValues: Partial<typeof tenants.$inferInsert> = {
    name: updates.name,
    agentName: updates.agentName,
    supportedModality: updates.supportedModality,
  };

  const city = optionalTenantText(updates.city);
  if (city !== undefined) setValues.city = city;
  const state = optionalTenantText(updates.state);
  if (state !== undefined) setValues.state = state;
  const agentWhatsapp = optionalTenantText(updates.agentWhatsapp);
  if (agentWhatsapp !== undefined) setValues.agentWhatsapp = agentWhatsapp;
  const website = optionalTenantText(updates.website);
  if (website !== undefined) setValues.website = website;
  const agentPresentationMessage = optionalTenantText(
    updates.agentPresentationMessage
  );
  if (agentPresentationMessage !== undefined) {
    setValues.agentPresentationMessage = agentPresentationMessage;
  }
  const agentVoiceTone = optionalTenantText(updates.agentVoiceTone);
  if (agentVoiceTone !== undefined) {
    setValues.agentVoiceTone = agentVoiceTone;
  }

  if (updates.meetingDays !== undefined) {
    setValues.meetingDays = updates.meetingDays;
  }
  if (updates.meetingHoursStart !== undefined) {
    setValues.meetingHoursStart = updates.meetingHoursStart;
  }
  if (updates.meetingHoursEnd !== undefined) {
    setValues.meetingHoursEnd = updates.meetingHoursEnd;
  }

  const rows = await db
    .update(tenants)
    .set(setValues)
    .where(eq(tenants.id, tenantId))
    .returning();
  return rows[0] ?? null;
}

export type StatusActor = "humano" | "agente";

/**
 * Move um lead entre colunas do Kanban (lote-3 — PIPE-02): `WHERE tenant_id
 * AND id` (nunca só pelo id), sempre atualiza `updatedAt` para refletir o
 * momento da transição. Retorna `null` (no-op) quando nenhuma linha
 * corresponde a `tenantId` + `leadId` (lead inexistente OU de outro tenant).
 *
 * `actor` (lote-5 — INT-04) registra quem mudou o status por último:
 * default `"humano"` preserva o comportamento de todo call site existente
 * (o Kanban é a única origem antes deste lote); a API do agente passa
 * `"agente"` explicitamente via `updateLeadFromAgent`, nunca por aqui.
 */
export async function updateLeadStatus(
  tenantId: string,
  leadId: string,
  status: LeadStatus,
  actor: StatusActor = "humano"
): Promise<Lead | null> {
  const rows = await db
    .update(leads)
    .set({ status, statusChangedBy: actor, updatedAt: new Date() })
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
    .returning();
  return rows[0] ?? null;
}

export interface UpdateLeadFromAgentInput {
  status?: LeadStatus;
  modality?: Lead["modality"] | null;
  region?: string | null;
  budgetCents?: bigint | null;
  propertyType?: Lead["propertyType"] | null;
  purchaseHorizon?: string | null;
  motivation?: Lead["motivation"] | null;
  creditStatus?: Lead["creditStatus"] | null;
  chainedOperation?: boolean | null;
  executiveSummary?: string | null;
  escalationReason?: string | null;
  meetingAt?: Date | null;
}

/**
 * Upsert parcial de um lead vindo do agente (lote-5 — INT-03/04): uma única
 * `UPDATE` grava todos os campos presentes em `input` (chave ausente não
 * entra no `set` — coluna intocada; `null` explícito limpa), atomicidade por
 * construção (o chamador — `patchLead`, em `src/server/integration/leads.ts`
 * — já validou tudo antes de chegar aqui). Quando `status` está presente,
 * marca `statusChangedBy = 'agente'` na mesma escrita (nunca `updateLeadStatus`,
 * que é exclusivo do Kanban). Retorna `null` (no-op) quando nenhuma linha
 * corresponde a `tenantId` + `leadId`.
 */
export async function updateLeadFromAgent(
  tenantId: string,
  leadId: string,
  input: UpdateLeadFromAgentInput
): Promise<Lead | null> {
  const setValues: Partial<typeof leads.$inferInsert> = { updatedAt: new Date() };

  if (input.status !== undefined) {
    setValues.status = input.status;
    setValues.statusChangedBy = "agente";
  }
  if ("modality" in input) setValues.modality = input.modality;
  if ("region" in input) setValues.region = input.region;
  if ("budgetCents" in input) setValues.budgetCents = input.budgetCents;
  if ("propertyType" in input) setValues.propertyType = input.propertyType;
  if ("purchaseHorizon" in input) setValues.purchaseHorizon = input.purchaseHorizon;
  if ("motivation" in input) setValues.motivation = input.motivation;
  if ("creditStatus" in input) setValues.creditStatus = input.creditStatus;
  if ("chainedOperation" in input) {
    setValues.chainedOperation = input.chainedOperation;
  }
  if ("executiveSummary" in input) {
    setValues.executiveSummary = input.executiveSummary;
  }
  if ("escalationReason" in input) {
    setValues.escalationReason = input.escalationReason;
  }
  if ("meetingAt" in input) setValues.meetingAt = input.meetingAt;

  const rows = await db
    .update(leads)
    .set(setValues)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
    .returning();
  return rows[0] ?? null;
}

export interface CreateAgentLeadInput {
  name: string;
  phone: string;
  externalId: string;
  firstContactAt: Date;
}

export interface CreateAgentLeadResult {
  created: boolean;
  lead: Lead;
}

/**
 * Cria um lead vindo do agente (lote-5 — INT-02), sempre com status inicial
 * `em_qualificacao`. Idempotente por `(tenantId, externalId)`: a unicidade é
 * garantida no banco pelo índice parcial `leads_tenant_id_external_id_idx`
 * (schema.ts) — `onConflictDoNothing` absorve reentrega/concorrência (Edge
 * Cases: "dois requests concorrentes reentregam o mesmo externalId → no
 * máximo um recurso"); quando o insert é descartado por conflito, a busca
 * seguinte devolve o lead já existente (`created: false`).
 */
export async function createAgentLead(
  tenantId: string,
  input: CreateAgentLeadInput
): Promise<CreateAgentLeadResult> {
  const inserted = await db
    .insert(leads)
    .values({
      tenantId,
      name: input.name,
      phone: input.phone,
      externalId: input.externalId,
      firstContactAt: input.firstContactAt,
      status: "em_qualificacao",
    })
    .onConflictDoNothing({
      target: [leads.tenantId, leads.externalId],
      where: sql`${leads.externalId} is not null`,
    })
    .returning();

  if (inserted.length > 0) {
    return { created: true, lead: inserted[0] };
  }

  const existing = await db
    .select()
    .from(leads)
    .where(
      and(eq(leads.tenantId, tenantId), eq(leads.externalId, input.externalId))
    )
    .limit(1);

  if (!existing[0]) {
    // Inalcançável em teoria: o índice único parcial garante que, se o
    // insert foi descartado por conflito, existe uma linha correspondente.
    throw new Error(
      "createAgentLead: onConflictDoNothing sem linha nova nem existente."
    );
  }

  return { created: false, lead: existing[0] };
}

export interface IngestAgentMessageInput {
  externalId: string;
  sender: Message["sender"];
  content: string;
  sentAt: Date;
}

export interface IngestAgentMessageResult {
  created: boolean;
  message: Message;
}

/**
 * Ingestão idempotente de uma mensagem vinda do agente (lote-5 — INT-05),
 * dentro de uma única transação: garante que existe uma conversa do lead
 * (cria na primeira mensagem, reaproveita nas seguintes) e insere a mensagem
 * com `onConflictDoNothing` por `(tenantId, externalId)` — mesmo padrão de
 * `createAgentLead` acima; quando o insert é descartado por conflito, a
 * busca seguinte devolve a mensagem já existente (`created: false`). Retorna
 * `null` quando o lead não existe no tenant (404 na rota) — checado dentro
 * da MESMA transação para eliminar corrida entre o SELECT do lead e o
 * INSERT da mensagem.
 */
export async function ingestAgentMessage(
  tenantId: string,
  leadId: string,
  input: IngestAgentMessageInput
): Promise<IngestAgentMessageResult | null> {
  return db.transaction(async (tx) => {
    const leadRows = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
      .limit(1);
    if (!leadRows[0]) return null;

    const conversationRows = await tx
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.tenantId, tenantId), eq(conversations.leadId, leadId))
      )
      .limit(1);

    const conversation =
      conversationRows[0] ??
      (await tx.insert(conversations).values({ tenantId, leadId }).returning())[0];

    const inserted = await tx
      .insert(messages)
      .values({
        tenantId,
        conversationId: conversation.id,
        sender: input.sender,
        content: input.content,
        sentAt: input.sentAt,
        externalId: input.externalId,
      })
      .onConflictDoNothing({
        target: [messages.tenantId, messages.externalId],
        where: sql`${messages.externalId} is not null`,
      })
      .returning();

    if (inserted.length > 0) {
      return { created: true, message: inserted[0] };
    }

    const existing = await tx
      .select()
      .from(messages)
      .where(
        and(eq(messages.tenantId, tenantId), eq(messages.externalId, input.externalId))
      )
      .limit(1);

    if (!existing[0]) {
      // Inalcançável em teoria: mesmo raciocínio de createAgentLead — o
      // índice único parcial garante que existe uma linha correspondente.
      throw new Error(
        "ingestAgentMessage: onConflictDoNothing sem linha nova nem existente."
      );
    }

    return { created: false, message: existing[0] };
  });
}

export interface CreateDocumentInput {
  name: string;
  mimeType: string;
  sizeBytes: number | bigint;
  modality: Modality;
  categoryId?: string | null;
}

export async function createDocument(
  tenantId: string,
  input: CreateDocumentInput
): Promise<Document> {
  const rows = await db
    .insert(documents)
    .values({
      tenantId,
      name: input.name,
      mimeType: input.mimeType,
      sizeBytes:
        typeof input.sizeBytes === "bigint"
          ? input.sizeBytes
          : BigInt(Math.trunc(input.sizeBytes)),
      modality: input.modality,
      categoryId: input.categoryId ?? null,
    })
    .returning();
  return rows[0];
}

export interface UpdateDocumentInput {
  name: string;
  modality: Modality;
  categoryId?: string | null;
}

/**
 * Retorna `null` quando nenhuma linha corresponde a `tenantId` + `documentId`
 * (documento inexistente OU pertencente a outro tenant) — sinal explícito de
 * "não encontrado", nunca confundido com sucesso silencioso.
 */
export async function updateDocument(
  tenantId: string,
  documentId: string,
  updates: UpdateDocumentInput
): Promise<Document | null> {
  const setValues: Partial<typeof documents.$inferInsert> = {
    name: updates.name,
    modality: updates.modality,
  };
  if ("categoryId" in updates) {
    setValues.categoryId = updates.categoryId ?? null;
  }

  const rows = await db
    .update(documents)
    .set(setValues)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.id, documentId)))
    .returning();
  return rows[0] ?? null;
}

/**
 * Retorna `false` (no-op) quando nenhuma linha corresponde a `tenantId` +
 * `documentId` — nunca lança erro para um id inexistente/de outro tenant.
 */
export async function deleteDocument(
  tenantId: string,
  documentId: string
): Promise<boolean> {
  const rows = await db
    .delete(documents)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.id, documentId)))
    .returning({ id: documents.id });
  return rows.length > 0;
}

export type CreateDocumentCategoryResult =
  | { ok: true; category: DocumentCategory }
  | { ok: false; error: string };

/**
 * Traduz a violação do índice único (nome duplicado, case-insensitive, no
 * mesmo tenant) num erro de domínio — nunca deixa o erro bruto do Postgres
 * vazar para quem chama. `color` é opcional (lote-3 — CAT-01): quando
 * omitida, a coluna assume o default `'gray'` do schema.
 */
export async function createDocumentCategory(
  tenantId: string,
  name: string,
  color?: CategoryColor
): Promise<CreateDocumentCategoryResult> {
  try {
    const rows = await db
      .insert(documentCategories)
      .values({ tenantId, name, ...(color ? { color } : {}) })
      .returning();
    return { ok: true, category: rows[0] };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        error: "Já existe uma categoria com esse nome para este tenant.",
      };
    }
    throw err;
  }
}

/**
 * Atualiza a cor de uma categoria existente (lote-3 — CAT-01: edição pelo
 * gerenciador). Tenant-scoped como toda escrita desta camada; retorna `null`
 * (no-op) quando nenhuma linha corresponde a `tenantId` + `categoryId`.
 */
export async function updateDocumentCategory(
  tenantId: string,
  categoryId: string,
  updates: { color: CategoryColor }
): Promise<DocumentCategory | null> {
  const rows = await db
    .update(documentCategories)
    .set({ color: updates.color })
    .where(
      and(
        eq(documentCategories.tenantId, tenantId),
        eq(documentCategories.id, categoryId)
      )
    )
    .returning();
  return rows[0] ?? null;
}

/**
 * Retorna `false` (no-op) quando nenhuma linha corresponde a `tenantId` +
 * `categoryId`. No happy path, documentos que referenciavam a categoria têm
 * `category_id` automaticamente ajustado para `null` pela FK
 * `ON DELETE SET NULL` (schema.ts).
 */
export async function deleteDocumentCategory(
  tenantId: string,
  categoryId: string
): Promise<boolean> {
  const rows = await db
    .delete(documentCategories)
    .where(
      and(
        eq(documentCategories.tenantId, tenantId),
        eq(documentCategories.id, categoryId)
      )
    )
    .returning({ id: documentCategories.id });
  return rows.length > 0;
}
