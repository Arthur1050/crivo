import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../../db";
import {
  accounts,
  conversations,
  documentCategories,
  documents,
  integrationRefusals,
  leads,
  messages,
  properties,
  serviceApiKeys,
  tenant_invitations,
  tenant_members,
  tenantApiKeys,
  tenants,
  users,
} from "../../db/schema";
import { assignBroker, type BrokerLoad } from "../../lib/broker-assignment";
import {
  selectForEscalation,
  selectForMeeting,
  type BrokerCandidate,
} from "../../lib/broker-availability";
import type { LeadScope } from "../../lib/lead-scope";
import { normalizeForSearch } from "../../lib/normalize-text";
import { parseRoles, type Role } from "../../lib/permissions";
import { isPendingAttendance } from "../../lib/pilot-metrics";

export type { LeadScope };

/**
 * Escopo de imobiliária inteira, para o **contrato de integração**
 * (`/api/v1/**`) e para asserções de teste sobre estado persistido.
 *
 * O agente não é um usuário e não tem papel (SEC-01, AD-021): ele autentica
 * pela credencial de serviço e o tenant vem do header `X-Crivo-Tenant`. Existe
 * como função nomeada, e não como objeto literal solto, para que todo ponto
 * que lê lead sem filtro de responsável diga em voz alta por quê.
 */
export function serviceScope(tenantId: string): LeadScope {
  return { tenantId, assignedUserId: null };
}

/**
 * Filtro de carteira (SCOPE-01 AC1/AC5): `undefined` quando o escopo alcança a
 * imobiliária inteira — `and()` do drizzle descarta `undefined`, então o
 * WHERE fica idêntico ao de antes deste lote.
 *
 * Como o filtro é `assigned_user_id = X`, lead **sem responsável** não casa:
 * ele fica visível para administrador e gestor e invisível para quem só tem
 * papel corretor, que é exatamente a AC5.
 */
function assignedTo(scope: LeadScope) {
  return scope.assignedUserId === null
    ? undefined
    : eq(leads.assignedUserId, scope.assignedUserId);
}

export type Tenant = typeof tenants.$inferSelect;

/**
 * Corretor de uma imobiliária (lote-8 — AD-021). Deixou de ser uma linha da
 * tabela `brokers` (removida) e passou a ser a projeção do vínculo
 * usuário↔imobiliária: `id` é o `users.id` (o mesmo valor que
 * `leads.assignedUserId` guarda), `tenantId` é a imobiliária do vínculo e
 * `createdAt` é a data DO VÍNCULO — é ela que sustenta o desempate
 * determinístico da política de atribuição.
 */
export interface Broker {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  createdAt: Date;
}
export type Lead = typeof leads.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentCategory = typeof documentCategories.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type LeadStatus = Lead["status"];
export type Modality = Document["modality"];
export type CategoryColor = DocumentCategory["color"];
export type PropertyKind = Property["kind"];
export type PropertyStatus = Property["status"];

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

/**
 * Resolve se um hash sha256 corresponde a uma chave de SERVIÇO ativa
 * (lote-7 — SEC-01), devolvendo o id da chave quando sim. Molde de
 * `resolveTenantIdByApiKeyHash` acima: chaves com `revokedAt` preenchido
 * são ignoradas. Deliberadamente NÃO devolve tenant nenhum — a chave de
 * serviço é cross-tenant por construção (schema.ts); quem chama resolve o
 * tenant à parte, pelo header `X-Crivo-Tenant` (`resolveTenantIdBySlug`
 * abaixo), nunca pela chave.
 */
export async function resolveServiceApiKeyHash(
  keyHash: string
): Promise<string | null> {
  const rows = await db
    .select({ id: serviceApiKeys.id })
    .from(serviceApiKeys)
    .where(
      and(eq(serviceApiKeys.keyHash, keyHash), isNull(serviceApiKeys.revokedAt))
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Resolve o `tenantId` a partir do `slug` legível (lote-7 — SEC-01), usado
 * pelo modo de autenticação de serviço (header `X-Crivo-Tenant`). `null`
 * para slug desconhecido ou string vazia — nunca cai em nenhum tenant
 * default (design.md — Error Handling Strategy: `401 tenant-nao-identificado`
 * é responsabilidade de quem chama, não desta função).
 */
export async function resolveTenantIdBySlug(
  slug: string
): Promise<string | null> {
  const rows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Vínculo com papel `corretor` (lote-8 — ATRIB-02). O plugin `organization`
 * grava papéis acumulados numa string separada por vírgula
 * (`"corretor,administrador"` — AD-021), então a checagem é de PERTENCIMENTO
 * ao conjunto, nunca igualdade: quem acumula corretor com outro papel
 * continua sendo corretor, que é a mesma união de permissões da PERM-01 AC4.
 */
const HAS_BROKER_ROLE = sql`'corretor' = any(string_to_array(${tenant_members.role}, ','))`;

/**
 * Corretor **elegível a receber lead**: papel corretor e vínculo ativo
 * (USER-01 AC10 — usuário desativado sai de toda lista de atribuição, mas
 * continua nomeado nos leads que já atendeu, o que é responsabilidade do join
 * com `users` em `getLeads`, não desta condição).
 */
const IS_ASSIGNABLE_BROKER = and(
  HAS_BROKER_ROLE,
  isNull(tenant_members.deactivatedAt)
);

export async function getBrokers(tenantId: string): Promise<Broker[]> {
  return db
    .select({
      id: users.id,
      tenantId: tenant_members.organizationId,
      name: users.name,
      email: users.email,
      createdAt: tenant_members.createdAt,
    })
    .from(tenant_members)
    .innerJoin(users, eq(tenant_members.userId, users.id))
    .where(
      and(eq(tenant_members.organizationId, tenantId), IS_ASSIGNABLE_BROKER)
    );
}

/**
 * Lead + nome do corretor responsável (`null` quando `assignedUserId` é nulo).
 * Extensão ADITIVA do retorno de `getLeads` (redesign-crm-astryx — RD-03 AC3):
 * todas as colunas de `leads` continuam presentes e inalteradas.
 */
export type LeadWithBroker = Lead & {
  brokerName: string | null;
  /**
   * `null` = responsável ativo (ou lead sem responsável). Preenchido quando o
   * vínculo do responsável foi desativado e a carteira dele foi MANTIDA
   * (USER-02 AC4): é o sinal de "responsável inativo" que o Pipeline exibe
   * para administrador e gestor. Derivado do vínculo, não de coluna nova em
   * `leads` — a atribuição em si continua intacta.
   */
  brokerDeactivatedAt: Date | null;
};

export async function getLeads(
  scope: LeadScope,
  filters?: { status?: LeadStatus }
): Promise<LeadWithBroker[]> {
  return db
    .select({
      ...getTableColumns(leads),
      brokerName: users.name,
      brokerDeactivatedAt: tenant_members.deactivatedAt,
    })
    .from(leads)
    // LEFT (não INNER): leads sem corretor continuam aparecendo no Kanban,
    // apenas sem avatar (spec.md — Edge Cases).
    .leftJoin(users, eq(leads.assignedUserId, users.id))
    // Único por (userId, organizationId), então nunca duplica a linha do lead.
    .leftJoin(
      tenant_members,
      and(
        eq(tenant_members.userId, leads.assignedUserId),
        eq(tenant_members.organizationId, leads.tenantId)
      )
    )
    .where(
      and(
        eq(leads.tenantId, scope.tenantId),
        assignedTo(scope),
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
  scope: LeadScope,
  limit = 5
): Promise<RecentLead[]> {
  return db
    .select({
      id: leads.id,
      name: leads.name,
      budgetCents: leads.budgetCents,
      modality: leads.modality,
      status: leads.status,
      brokerName: users.name,
      firstContactAt: leads.firstContactAt,
    })
    .from(leads)
    .leftJoin(users, eq(leads.assignedUserId, users.id))
    .where(and(eq(leads.tenantId, scope.tenantId), assignedTo(scope)))
    .orderBy(desc(leads.firstContactAt), asc(leads.id))
    .limit(limit);
}

/**
 * Lead por identificador, dentro do escopo (SCOPE-01 AC4): lead de outro
 * corretor devolve `null` — o mesmo `null` de lead inexistente, sem nenhum
 * sinal de que o lead existe.
 */
export async function getLead(
  scope: LeadScope,
  leadId: string
): Promise<Lead | null> {
  const rows = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, scope.tenantId),
        eq(leads.id, leadId),
        assignedTo(scope)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Conversa é sempre de um lead, então herda o escopo dele (SCOPE-01 AC2). */
function conversationInScope(scope: LeadScope) {
  if (scope.assignedUserId === null) return undefined;
  return exists(
    db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          eq(leads.id, conversations.leadId),
          eq(leads.assignedUserId, scope.assignedUserId)
        )
      )
  );
}

export async function getConversations(
  scope: LeadScope
): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(
      and(eq(conversations.tenantId, scope.tenantId), conversationInScope(scope))
    );
}

export async function getMessages(
  scope: LeadScope,
  conversationId: string
): Promise<Message[]> {
  return db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, scope.tenantId),
        eq(messages.conversationId, conversationId),
        // Mensagem herda o escopo da conversa, que herda o do lead: pedir a
        // thread de outro corretor pelo id da conversa devolve `[]`.
        scope.assignedUserId === null
          ? undefined
          : exists(
              db
                .select({ id: conversations.id })
                .from(conversations)
                .innerJoin(leads, eq(conversations.leadId, leads.id))
                .where(
                  and(
                    eq(conversations.id, messages.conversationId),
                    eq(leads.assignedUserId, scope.assignedUserId)
                  )
                )
            )
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
  // Caminho do contrato (SEC-01): o agente não é usuário e enxerga a
  // imobiliária inteira, por credencial de serviço.
  const lead = await getLead(serviceScope(tenantId), leadId);
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
  scope: LeadScope
): Promise<ConversationSummary[]> {
  const [conversationRows, leadRows, messageRows] = await Promise.all([
    db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, scope.tenantId),
          conversationInScope(scope)
        )
      ),
    db
      .select({ id: leads.id, name: leads.name })
      .from(leads)
      .where(and(eq(leads.tenantId, scope.tenantId), assignedTo(scope))),
    // Ordenada ASC por sentAt/id: a última iteração do loop abaixo sobrescreve
    // o Map com a mensagem mais recente de cada conversa.
    db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, scope.tenantId),
          scope.assignedUserId === null
            ? undefined
            : exists(
                db
                  .select({ id: conversations.id })
                  .from(conversations)
                  .innerJoin(leads, eq(conversations.leadId, leads.id))
                  .where(
                    and(
                      eq(conversations.id, messages.conversationId),
                      eq(leads.assignedUserId, scope.assignedUserId)
                    )
                  )
              )
        )
      )
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

// ---------------------------------------------------------------------------
// Catálogo de imóveis (lote-11 — IMOV-01/02). Molde direto de `getDocuments`
// (`and(...)` com `undefined` condicional) e de `isNull(tenant_members.
// deactivatedAt)` (`getBrokers`).
// ---------------------------------------------------------------------------

export interface PropertyFilters {
  status?: PropertyStatus;
  published?: boolean;
  kind?: PropertyKind;
  modality?: Modality;
  // Comparado contra `neighborhoodNormalized`/`cityNormalized` — o chamador
  // não precisa normalizar antes; `getProperties` normaliza aqui, uma vez,
  // com a mesma função usada na escrita (design.md — Colunas `*Normalized`).
  search?: string;
}

export async function getProperties(
  tenantId: string,
  filters?: PropertyFilters
): Promise<Property[]> {
  const normalizedSearch = filters?.search
    ? normalizeForSearch(filters.search)
    : undefined;

  return db
    .select()
    .from(properties)
    .where(
      and(
        eq(properties.tenantId, tenantId),
        filters?.status ? eq(properties.status, filters.status) : undefined,
        filters?.published !== undefined
          ? eq(properties.published, filters.published)
          : undefined,
        filters?.kind ? eq(properties.kind, filters.kind) : undefined,
        filters?.modality
          ? eq(properties.modality, filters.modality)
          : undefined,
        normalizedSearch
          ? or(
              ilike(properties.neighborhoodNormalized, `%${normalizedSearch}%`),
              ilike(properties.cityNormalized, `%${normalizedSearch}%`)
            )
          : undefined
      )
    )
    .orderBy(desc(properties.updatedAt));
}

/**
 * Membro ativo de uma imobiliária (IMOV-02 AC4): falso para usuário de outro
 * tenant e para vínculo com `deactivatedAt` preenchido — mesma condição de
 * `IS_ASSIGNABLE_BROKER`, sem o filtro de papel (o captador não precisa ser
 * corretor; qualquer papel ativo serve).
 */
export async function isActiveMemberOf(
  tenantId: string,
  userId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: tenant_members.id })
    .from(tenant_members)
    .where(
      and(
        eq(tenant_members.organizationId, tenantId),
        eq(tenant_members.userId, userId),
        isNull(tenant_members.deactivatedAt)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Campos de entrada de um imóvel (IMOV-01/03). `sequence` e `reference`
 * nascem calculados por `createProperty` — nunca aceitos aqui, o que é o que
 * torna `UpdatePropertyPatch` (abaixo) imutável para os dois por construção
 * (IMOV-03 AC6), não por checagem em runtime.
 */
export interface NewProperty {
  capturedByUserId: string;
  kind: PropertyKind;
  modality: Modality;
  status?: PropertyStatus;
  published?: boolean;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  priceCents: bigint;
  areaSqm: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpots: number;
  description?: string | null;
  photoUrls?: string[];
}

export type UpdatePropertyPatch = Partial<NewProperty>;

export type CreatePropertyResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

const MAX_PROPERTY_REFERENCE_ATTEMPTS = 3;

function buildPropertyReference(sequence: number): string {
  return `IM-${String(sequence).padStart(4, "0")}`;
}

/**
 * `sequence` nasce como `max(sequence) + 1` **por tenant** (IMOV-03 AC5) e
 * `reference` é derivada dele. A corrida entre duas criações concorrentes
 * lendo o mesmo `max` é resolvida pelo índice único do banco (IMOV-03 AC7),
 * nunca pela aplicação — por isso a leitura do `max` não roda em transação
 * com o insert: é a rejeição do índice na segunda tentativa que garante a
 * unicidade, e o retry aqui é só recuperação dessa rejeição.
 */
export async function createProperty(
  tenantId: string,
  input: NewProperty
): Promise<CreatePropertyResult> {
  for (let attempt = 0; attempt < MAX_PROPERTY_REFERENCE_ATTEMPTS; attempt++) {
    const [row] = await db
      .select({ maxSequence: max(properties.sequence) })
      .from(properties)
      .where(eq(properties.tenantId, tenantId));
    const sequence = (row?.maxSequence ?? 0) + 1;

    try {
      const rows = await db
        .insert(properties)
        .values({
          tenantId,
          capturedByUserId: input.capturedByUserId,
          sequence,
          reference: buildPropertyReference(sequence),
          kind: input.kind,
          modality: input.modality,
          status: input.status ?? "disponivel",
          published: input.published ?? false,
          street: input.street ?? null,
          number: input.number ?? null,
          complement: input.complement ?? null,
          neighborhood: input.neighborhood,
          neighborhoodNormalized: normalizeForSearch(input.neighborhood),
          city: input.city,
          cityNormalized: normalizeForSearch(input.city),
          state: input.state,
          priceCents: input.priceCents,
          areaSqm: input.areaSqm,
          bedrooms: input.bedrooms,
          bathrooms: input.bathrooms,
          parkingSpots: input.parkingSpots,
          description: input.description ?? null,
          photoUrls: input.photoUrls ?? [],
        })
        .returning({ id: properties.id });
      return { ok: true, id: rows[0].id };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Colisão em (tenant_id, sequence) ou (tenant_id, reference): outra
      // criação concorrente já ocupou este número — recalcula o `max` e
      // tenta de novo (até `MAX_PROPERTY_REFERENCE_ATTEMPTS` vezes).
    }
  }
  return {
    ok: false,
    error:
      "Não foi possível gerar uma referência única para o imóvel. Tente novamente.",
  };
}

/**
 * Retorna `false` (no-op) quando nenhuma linha corresponde a `tenantId` +
 * `propertyId`. `sequence`/`reference` não podem aparecer em `patch` — o
 * tipo `UpdatePropertyPatch` não os declara (IMOV-03 AC6). Ao alterar
 * `neighborhood`/`city`, a coluna `*Normalized` gêmea é recalculada aqui,
 * nunca deixada como estava.
 */
export async function updateProperty(
  tenantId: string,
  propertyId: string,
  patch: UpdatePropertyPatch
): Promise<boolean> {
  const setValues = {
    ...patch,
    updatedAt: sql`now()`,
    ...(patch.neighborhood !== undefined
      ? { neighborhoodNormalized: normalizeForSearch(patch.neighborhood) }
      : {}),
    ...(patch.city !== undefined
      ? { cityNormalized: normalizeForSearch(patch.city) }
      : {}),
  };

  const rows = await db
    .update(properties)
    .set(setValues)
    .where(and(eq(properties.tenantId, tenantId), eq(properties.id, propertyId)))
    .returning({ id: properties.id });
  return rows.length > 0;
}

/**
 * Retorna `false` (no-op) quando nenhuma linha corresponde a `tenantId` +
 * `propertyId` — nunca lança erro para um id inexistente/de outro tenant.
 */
export async function deleteProperty(
  tenantId: string,
  propertyId: string
): Promise<boolean> {
  const rows = await db
    .delete(properties)
    .where(and(eq(properties.tenantId, tenantId), eq(properties.id, propertyId)))
    .returning({ id: properties.id });
  return rows.length > 0;
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
 * Query dos leads de P (lote-9 — PERF-01), separada de `getDashboardKpis`
 * para o teste conseguir inspecionar o SQL gerado via `.toSQL()` sem
 * executar contra o banco. Projeção explícita: só as 4 colunas que a
 * agregação em TS de fato lê (`status`, `firstContactAt`, `firstResponseAt`,
 * `meetingAttended`) — nunca `executive_summary`, `escalation_reason` nem
 * qualquer outro campo de texto longo do lead.
 */
function periodLeadsQuery(scope: LeadScope, range: DashboardRange) {
  return db
    .select({
      status: leads.status,
      firstContactAt: leads.firstContactAt,
      firstResponseAt: leads.firstResponseAt,
      meetingAttended: leads.meetingAttended,
    })
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, scope.tenantId),
        assignedTo(scope),
        gte(leads.firstContactAt, range.from),
        lte(leads.firstContactAt, range.to)
      )
    );
}

/** Exportada só para o teste de projeção (PERF-01) — nunca chamada fora de `getDashboardKpis` em código de produção. */
export const __testOnly_periodLeadsQuery = periodLeadsQuery;

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
  scope: LeadScope,
  range: DashboardRange
): Promise<DashboardKpis> {
  const periodLeads = await periodLeadsQuery(scope, range);

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
  scope: LeadScope,
  range: DashboardRange,
  granularity: DashboardGranularity
): Promise<LeadVolumeBucket[]> {
  const rows = await db
    .select({ firstContactAt: leads.firstContactAt })
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, scope.tenantId),
        assignedTo(scope),
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
  scope: LeadScope,
  range: DashboardRange
): Promise<LeadDistributions> {
  const rows = await db
    .select({ modality: leads.modality, motivation: leads.motivation })
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, scope.tenantId),
        assignedTo(scope),
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
const POSTGRES_FOREIGN_KEY_VIOLATION = "23503";

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

function isForeignKeyViolation(err: unknown): boolean {
  return pgErrorCode(err) === POSTGRES_FOREIGN_KEY_VIOLATION;
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
  // Baseline pré-piloto (lote-9 — BASE-01), cinco colunas independentes.
  // Mesmo padrão SPG-1 dos campos de horário comercial acima (sem
  // normalização de texto — são `integer`): chave ausente = coluna
  // intocada; `null` explícito = limpa; valor presente = grava como veio
  // (a validação de faixa já rodou na action antes de chegar aqui).
  baselineLeadsPerMonth?: number | null;
  baselineFirstResponseMinutes?: number | null;
  baselineLeadToMeetingPct?: number | null;
  baselineEscalationPct?: number | null;
  baselineAttendancePct?: number | null;
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

  if (updates.baselineLeadsPerMonth !== undefined) {
    setValues.baselineLeadsPerMonth = updates.baselineLeadsPerMonth;
  }
  if (updates.baselineFirstResponseMinutes !== undefined) {
    setValues.baselineFirstResponseMinutes = updates.baselineFirstResponseMinutes;
  }
  if (updates.baselineLeadToMeetingPct !== undefined) {
    setValues.baselineLeadToMeetingPct = updates.baselineLeadToMeetingPct;
  }
  if (updates.baselineEscalationPct !== undefined) {
    setValues.baselineEscalationPct = updates.baselineEscalationPct;
  }
  if (updates.baselineAttendancePct !== undefined) {
    setValues.baselineAttendancePct = updates.baselineAttendancePct;
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
 * AND id AND assignedTo(scope)` (mesmo filtro de carteira que a leitura usa
 * desde o lote-8), sempre atualiza `updatedAt` para refletir o momento da
 * transição. Retorna `null` (no-op) quando nenhuma linha corresponde ao
 * escopo (lead inexistente, de outro tenant, OU fora da carteira do
 * corretor — lote-9, SCOPE-02).
 *
 * `actor` (lote-5 — INT-04) registra quem mudou o status por último:
 * default `"humano"` preserva o comportamento de todo call site existente
 * (o Kanban é a única origem antes deste lote); a API do agente passa
 * `"agente"` explicitamente via `updateLeadFromAgent`, nunca por aqui.
 */
export async function updateLeadStatus(
  scope: LeadScope,
  leadId: string,
  status: LeadStatus,
  actor: StatusActor = "humano"
): Promise<Lead | null> {
  const rows = await db
    .update(leads)
    .set({ status, statusChangedBy: actor, updatedAt: new Date() })
    .where(
      and(eq(leads.tenantId, scope.tenantId), eq(leads.id, leadId), assignedTo(scope))
    )
    .returning();
  return rows[0] ?? null;
}

/**
 * Troca o corretor responsável por um lead a partir do painel de detalhe
 * (lote-7 — ATRIB-02): `WHERE tenant_id AND id AND assignedTo(scope)` (mesmo
 * padrão de `updateLeadStatus`, lote-9 — SCOPE-02), com o NOVO corretor
 * validado contra o tenant NA MESMA query — um corretor de outro tenant
 * nunca é aceito, mesmo que o `leadId` seja válido. Retorna `null` (no-op)
 * para lead inexistente/de outro tenant/fora do escopo do ator, ou para
 * corretor inexistente/de outro tenant.
 *
 * lote-8 (AD-021): o corretor é um usuário, e "pertencer ao tenant" passou a
 * ser ter vínculo em `tenant_members` com aquela imobiliária.
 */
export async function updateLeadBroker(
  scope: LeadScope,
  leadId: string,
  brokerId: string
): Promise<Lead | null> {
  const rows = await db
    .update(leads)
    .set({ assignedUserId: brokerId, updatedAt: new Date() })
    .where(
      and(
        eq(leads.tenantId, scope.tenantId),
        eq(leads.id, leadId),
        assignedTo(scope),
        exists(
          db
            .select({ id: tenant_members.id })
            .from(tenant_members)
            .where(
              and(
                eq(tenant_members.userId, brokerId),
                eq(tenant_members.organizationId, scope.tenantId),
                IS_ASSIGNABLE_BROKER
              )
            )
        )
      )
    )
    .returning();
  return rows[0] ?? null;
}

/**
 * Persiste o comparecimento à reunião de um lead (lote-7 — KPI-02): três
 * estados possíveis (`null` pendente, `true` compareceu, `false` não
 * compareceu), escopado pelo mesmo padrão de `updateLeadStatus` (lote-9 —
 * SCOPE-02). Retorna `null` (no-op) para lead inexistente, de outro tenant,
 * ou fora da carteira do corretor, sem escrever nada.
 */
export async function setMeetingAttendance(
  scope: LeadScope,
  leadId: string,
  value: boolean | null
): Promise<Lead | null> {
  const rows = await db
    .update(leads)
    .set({ meetingAttended: value, updatedAt: new Date() })
    .where(
      and(eq(leads.tenantId, scope.tenantId), eq(leads.id, leadId), assignedTo(scope))
    )
    .returning();
  return rows[0] ?? null;
}

export interface PendingMeeting {
  leadId: string;
  leadName: string;
  meetingAt: Date;
  assignedUserId: string | null;
  brokerName: string | null;
}

/**
 * Reuniões que cobram confirmação de comparecimento (lote-9 — PRES-01,
 * PRES-02): candidatas vêm do banco já reduzidas ao essencial (`meeting_at`
 * preenchido, `meeting_attended` ainda `null`, escopadas por tenant +
 * `assignedTo(scope)` — SCOPE-02, mesmo filtro de carteira das escritas), e a
 * janela temporal exata (`+30min` a `+30min+14d`) é decidida por
 * `isPendingAttendance` (T4, `src/lib/pilot-metrics.ts`) — a MESMA função
 * pura testada isoladamente, nunca uma segunda conta de datas duplicada em
 * SQL. Corretor só carrega em seu própria carteira; administrador/gestor
 * (`assignedUserId: null` no escopo) veem qualquer lead do tenant, INCLUSIVE
 * o sem responsável (`assignedTo` devolve `undefined` — sem filtro — quando o
 * escopo é de imobiliária inteira; lote-8 AD-022, edge case da spec).
 * Ordenado pela reunião mais antiga primeiro (mais urgente), id como
 * desempate determinístico.
 */
export async function getPendingAttendanceMeetings(
  scope: LeadScope,
  now: Date
): Promise<PendingMeeting[]> {
  const rows = await db
    .select({
      leadId: leads.id,
      leadName: leads.name,
      meetingAt: leads.meetingAt,
      meetingAttended: leads.meetingAttended,
      assignedUserId: leads.assignedUserId,
      brokerName: users.name,
    })
    .from(leads)
    .leftJoin(users, eq(leads.assignedUserId, users.id))
    .where(
      and(
        eq(leads.tenantId, scope.tenantId),
        assignedTo(scope),
        isNotNull(leads.meetingAt),
        isNull(leads.meetingAttended)
      )
    )
    .orderBy(asc(leads.meetingAt), asc(leads.id));

  return rows
    .filter((row) => isPendingAttendance(row.meetingAt!, row.meetingAttended, now))
    .map((row) => ({
      leadId: row.leadId,
      leadName: row.leadName,
      meetingAt: row.meetingAt!,
      assignedUserId: row.assignedUserId,
      brokerName: row.brokerName,
    }));
}

/**
 * Instante da última mensagem `sender = 'agente'` do tenant (lote-7 —
 * SHELL-01): alimenta o subtítulo real da sidebar, sem nenhuma chamada à
 * instância n8n (INT-08) — o dado vem só do próprio CRM. `null` quando o
 * tenant nunca recebeu mensagem do agente.
 */
export async function getLastAgentMessageAt(tenantId: string): Promise<Date | null> {
  const rows = await db
    .select({ lastSentAt: max(messages.sentAt) })
    .from(messages)
    .where(and(eq(messages.tenantId, tenantId), eq(messages.sender, "agente")));
  return rows[0]?.lastSentAt ?? null;
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
  /**
   * Responsável escolhido pela política de atribuição do CRM (lote-8 —
   * AD-022), nunca pelo payload do agente: `LeadPatchDto` não tem este campo,
   * então nada que venha da rede o alcança. Existe aqui para que a atribuição
   * caia na MESMA `UPDATE` do status e do `meetingAt`.
   */
  assignedUserId?: string | null;
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
  if ("assignedUserId" in input) setValues.assignedUserId = input.assignedUserId;

  const rows = await db
    .update(leads)
    .set(setValues)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
    .returning();
  return rows[0] ?? null;
}

// Únicos status que contam como "carga ativa" de um corretor (lote-7 —
// ATRIB-01): um lead já agendado ou perdido não ocupa mais a atenção dele.
const ACTIVE_LEAD_STATUSES: LeadStatus[] = ["em_qualificacao", "escalado_humano"];

/**
 * Carga ativa de cada corretor do tenant (lote-7 — ATRIB-01), para
 * `assignBroker` (função pura em `src/lib/broker-assignment.ts`) escolher
 * quem recebe um lead novo. Uma única query agregada (LEFT JOIN, nunca
 * INNER): corretor sem nenhum lead ativo aparece com `activeLeads: 0` em vez
 * de sumir do resultado — o join já filtra pelos status ativos, então
 * `count(leads.id)` conta só as linhas que casaram.
 */
export async function getBrokerLoads(tenantId: string): Promise<BrokerLoad[]> {
  const rows = await db
    .select({
      id: tenant_members.userId,
      createdAt: tenant_members.createdAt,
      activeLeads: count(leads.id),
    })
    .from(tenant_members)
    .leftJoin(
      leads,
      and(
        eq(leads.assignedUserId, tenant_members.userId),
        eq(leads.tenantId, tenant_members.organizationId),
        inArray(leads.status, ACTIVE_LEAD_STATUSES)
      )
    )
    .where(
      and(eq(tenant_members.organizationId, tenantId), IS_ASSIGNABLE_BROKER)
    )
    .groupBy(tenant_members.userId, tenant_members.createdAt);

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    activeLeads: Number(row.activeLeads),
  }));
}

/**
 * Duração do slot de reunião do produto (spec.md — Assumptions: "30 minutos,
 * alinhado ao início da hora ou à meia hora"). É o que transforma o
 * `meetingAt` gravado num intervalo, tanto para o filtro de sobreposição
 * quanto para a checagem de janela.
 */
export const MEETING_DURATION_MS = 30 * 60 * 1000;

/**
 * Reuniões já marcadas de cada corretor, agregadas na própria linha do vínculo
 * (subconsulta correlacionada). `json_agg` devolve os instantes como string
 * ISO — convertidos para `Date` no mapeamento.
 */
const MEETINGS_JSON = sql<string[] | null>`(
  select json_agg(agenda.meeting_at)
  from ${leads} agenda
  where agenda.assigned_user_id = ${tenant_members.userId}
    and agenda.tenant_id = ${tenant_members.organizationId}
    and agenda.meeting_at is not null
)`;

/**
 * Candidatos à atribuição por agenda (lote-8 — ATRIB-02, ATRIB-03): carga
 * ativa, janela de trabalho declarada e reuniões já marcadas de cada corretor
 * ATIVO da imobiliária, numa query agregada só.
 *
 * Estende `getBrokerLoads` sem substituí-lo: mesmo LEFT JOIN (corretor sem
 * lead ativo continua aparecendo com `activeLeads: 0`) e mesmo filtro
 * `IS_ASSIGNABLE_BROKER` — papel corretor e vínculo ativo, que é o que faz o
 * corretor desativado sair dos candidatos mesmo com a janela cobrindo o
 * horário (spec.md — Edge Cases).
 *
 * A janela é `null` quando qualquer uma das três colunas está vazia: janela
 * pela metade é janela não declarada, e quem não declarou é indisponível
 * sempre (AGENDA-01 AC5).
 */
export async function getBrokerCandidates(
  tenantId: string
): Promise<BrokerCandidate[]> {
  const rows = await db
    .select({
      id: tenant_members.userId,
      createdAt: tenant_members.createdAt,
      activeLeads: count(leads.id),
      workDays: tenant_members.workDays,
      workHoursStart: tenant_members.workHoursStart,
      workHoursEnd: tenant_members.workHoursEnd,
      meetings: MEETINGS_JSON,
    })
    .from(tenant_members)
    .leftJoin(
      leads,
      and(
        eq(leads.assignedUserId, tenant_members.userId),
        eq(leads.tenantId, tenant_members.organizationId),
        inArray(leads.status, ACTIVE_LEAD_STATUSES)
      )
    )
    .where(
      and(eq(tenant_members.organizationId, tenantId), IS_ASSIGNABLE_BROKER)
    )
    // Pela PK do vínculo: o Postgres deriva as demais colunas de
    // `tenant_members` (dependência funcional), inclusive as da subconsulta.
    .groupBy(tenant_members.id);

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    activeLeads: Number(row.activeLeads),
    window:
      row.workDays && row.workDays.length > 0 && row.workHoursStart && row.workHoursEnd
        ? {
            days: row.workDays,
            start: row.workHoursStart,
            end: row.workHoursEnd,
          }
        : null,
    meetings: (row.meetings ?? []).map((meetingAt) => {
      const start = new Date(meetingAt);
      return { start, end: new Date(start.getTime() + MEETING_DURATION_MS) };
    }),
  }));
}

/**
 * Contato do corretor escolhido, para o chamador do contrato (ATRIB-02 AC4) e
 * para o convite do evento no calendário (AC8, pelo e-mail).
 *
 * Consultado DEPOIS da escolha, e nunca junto com os candidatos: a lista de
 * corretores não pode sair do CRM (AD-018), então quem monta os candidatos não
 * carrega nome nem e-mail de ninguém.
 */
export async function getBrokerContact(
  tenantId: string,
  userId: string
): Promise<{ name: string; email: string } | null> {
  const rows = await db
    .select({ name: users.name, email: users.email })
    .from(tenant_members)
    .innerJoin(users, eq(tenant_members.userId, users.id))
    .where(
      and(
        eq(tenant_members.organizationId, tenantId),
        eq(tenant_members.userId, userId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export type AssignFailureReason =
  | "lead-nao-encontrado"
  | "sem-corretor-disponivel"
  | "conflito-de-agenda";

export type AssignResult =
  | {
      ok: true;
      /** `null` só no escalonamento sem nenhum corretor ativo (ATRIB-03 AC4). */
      brokerId: string | null;
      lead: Lead;
    }
  | { ok: false; reason: AssignFailureReason };

/**
 * Atribuição no agendamento (ATRIB-02; AD-022). Escolhe entre os corretores
 * cuja janela cobre INTEIRAMENTE o slot de 30 minutos e que não têm reunião
 * sobreposta, pelo desempate determinístico de sempre — e grava a escolha
 * junto com `meetingAt` e o resto do patch numa **única** `UPDATE`.
 *
 * Nada é gravado quando ninguém cobre o horário: o chamador recusa o
 * agendamento com `sem-corretor-disponivel` (AC5). Dois agendamentos
 * concorrentes sobre o mesmo corretor e o mesmo instante escolhem o mesmo
 * candidato — quem perde a corrida bate no índice único
 * `leads_assigned_user_id_meeting_at_idx` e recebe `conflito-de-agenda` (AC7).
 * A trava é do banco de propósito: nenhuma checagem de aplicação sobrevive à
 * concorrência.
 *
 * A escolha é SEMPRE pela disponibilidade, mesmo que o lead já tivesse
 * responsável: a reunião precisa cair com quem atende naquele horário
 * (spec.md — Success Criteria).
 */
export async function assignBrokerForMeeting(
  tenantId: string,
  leadId: string,
  meetingAt: Date,
  patch: UpdateLeadFromAgentInput = {}
): Promise<AssignResult> {
  const candidates = await getBrokerCandidates(tenantId);
  const meetingEnd = new Date(meetingAt.getTime() + MEETING_DURATION_MS);
  const brokerId = assignBroker(
    selectForMeeting(candidates, meetingAt, meetingEnd)
  );

  if (!brokerId) return { ok: false, reason: "sem-corretor-disponivel" };

  try {
    const updated = await updateLeadFromAgent(tenantId, leadId, {
      ...patch,
      meetingAt,
      assignedUserId: brokerId,
    });
    if (!updated) return { ok: false, reason: "lead-nao-encontrado" };
    return { ok: true, brokerId, lead: updated };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, reason: "conflito-de-agenda" };
    }
    throw error;
  }
}

/**
 * Rede de segurança do escalonamento (ATRIB-03; AD-022): o lead que passa a
 * `escalado_humano` sem responsável recebe um na MESMA `UPDATE` que grava o
 * status — nunca numa segunda escrita que possa falhar sozinha.
 *
 * Escolhe o de menor carga entre quem está em janela no instante do
 * escalonamento e, se ninguém estiver, entre todos os corretores ativos (AC3).
 * Imobiliária sem nenhum corretor ativo grava o escalonamento assim mesmo, com
 * o lead sem responsável (AC4) — o Pipeline já exibe "Sem responsável" para
 * administrador e gestor, que é o sinal de pendente de atribuição.
 *
 * Lead que JÁ tem responsável não é reatribuído (AC5): o patch é gravado e o
 * responsável atual é devolvido intacto.
 */
export async function assignBrokerForEscalation(
  tenantId: string,
  leadId: string,
  at: Date,
  patch: UpdateLeadFromAgentInput = {}
): Promise<AssignResult> {
  const lead = await getLead(serviceScope(tenantId), leadId);
  if (!lead) return { ok: false, reason: "lead-nao-encontrado" };

  let brokerId = lead.assignedUserId;

  if (!brokerId) {
    const candidates = await getBrokerCandidates(tenantId);
    brokerId = assignBroker(selectForEscalation(candidates, at));
  }

  const updated = await updateLeadFromAgent(tenantId, leadId, {
    ...patch,
    // Chave ausente quando não há corretor: a coluna não é tocada.
    ...(brokerId ? { assignedUserId: brokerId } : {}),
  });

  if (!updated) return { ok: false, reason: "lead-nao-encontrado" };
  return { ok: true, brokerId, lead: updated };
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
 * seguinte devolve o lead já existente (`created: false`), com o corretor já
 * atribuído preservado (nunca reatribuído).
 *
 * **O lead nasce SEM responsável** (lote-8 — ATRIB-02 AC1; AD-022). A
 * atribuição por menor carga na criação (ATRIB-01, lote-7) foi removida daqui:
 * quando o lead é criado ainda não existe informação nenhuma sobre quando ele
 * pode se reunir — o horário só emerge durante a conversa. O responsável passa
 * a ser escolhido no agendamento (`assignBrokerForMeeting`) ou, como rede de
 * segurança, no escalonamento (`assignBrokerForEscalation`).
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
 *
 * `first_response_at` (lote-7 — KPI-01): quando a mensagem é de fato
 * inserida (`created === true`, nunca numa reentrega descartada por
 * idempotência), é do agente, e o lead ainda não tem `first_response_at`,
 * grava o `sentAt` dela na MESMA transação — uma escrita a mais no insert
 * que já existe, sem round-trip extra. Gravado uma única vez: mensagens
 * seguintes do agente nunca sobrescrevem o valor.
 */
export async function ingestAgentMessage(
  tenantId: string,
  leadId: string,
  input: IngestAgentMessageInput
): Promise<IngestAgentMessageResult | null> {
  return db.transaction(async (tx) => {
    const leadRows = await tx
      .select({ id: leads.id, firstResponseAt: leads.firstResponseAt })
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
      if (input.sender === "agente" && leadRows[0].firstResponseAt === null) {
        await tx
          .update(leads)
          .set({ firstResponseAt: input.sentAt })
          .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)));
      }
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
  // Ponte temporária até o fluxo intent + Blob substituir a criação
  // metadata-only na UI (lote-12). A linha nasce explicitamente inelegível e
  // sem texto; não finge que existe um objeto no storage nem pode alcançar o
  // contexto do agente. O repositório novo concentra o caminho real.
  const legacyId = randomUUID();
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
      storageProvider: "legacy_metadata",
      storageKey: `legacy-metadata/${legacyId}`,
      storageEtag: "not-uploaded",
      contentSha256: createHash("sha256")
        .update(`${tenantId}:${legacyId}`)
        .digest("hex"),
      status: "falha",
      failureCode: "LEGACY_METADATA_UPLOAD_DISABLED",
      failureMessage: "O documento precisa ser reenviado pelo fluxo de upload atual.",
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

// ---------------------------------------------------------------------------
// Gestão de usuários (lote-8 — USER-01/USER-02)
//
// A imobiliária ativa nunca vem do cliente: toda função abaixo recebe o
// `tenantId` já resolvido pela guarda de sessão e escopa a escrita por ele —
// mesma disciplina das funções de documento.
// ---------------------------------------------------------------------------

/** Estado do convite de um vínculo (USER-01 AC1). */
export type MemberInviteState = "pendente" | "ativo";

export interface TenantMember {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  roles: Role[];
  workDays: number[] | null;
  workHoursStart: string | null;
  workHoursEnd: string | null;
  deactivatedAt: Date | null;
  /**
   * `pendente` = usuário sem credencial (nenhuma linha de senha em `accounts`),
   * exatamente o estado em que o convite e o seed o deixam; `ativo` = já
   * definiu a senha pela tela de aceite.
   */
  inviteState: MemberInviteState;
  createdAt: Date;
}

/** Existe credencial de senha para este usuário? (define o estado do convite) */
const HAS_CREDENTIAL = sql<boolean>`exists (
  select 1 from ${accounts}
  where ${accounts.userId} = ${tenant_members.userId}
    and ${accounts.providerId} = 'credential'
)`;

/**
 * Membros da imobiliária, ativos e desativados, na mesma ordem determinística
 * usada pela guarda de sessão (`createdAt`, depois `id` do vínculo).
 */
export async function getTenantMembers(
  tenantId: string
): Promise<TenantMember[]> {
  const rows = await db
    .select({
      memberId: tenant_members.id,
      userId: tenant_members.userId,
      name: users.name,
      email: users.email,
      role: tenant_members.role,
      workDays: tenant_members.workDays,
      workHoursStart: tenant_members.workHoursStart,
      workHoursEnd: tenant_members.workHoursEnd,
      deactivatedAt: tenant_members.deactivatedAt,
      createdAt: tenant_members.createdAt,
      hasCredential: HAS_CREDENTIAL,
    })
    .from(tenant_members)
    .innerJoin(users, eq(tenant_members.userId, users.id))
    .where(eq(tenant_members.organizationId, tenantId))
    .orderBy(asc(tenant_members.createdAt), asc(tenant_members.id));

  return rows.map((row) => ({
    memberId: row.memberId,
    userId: row.userId,
    name: row.name,
    email: row.email,
    roles: parseRoles(row.role),
    workDays: row.workDays,
    workHoursStart: row.workHoursStart,
    workHoursEnd: row.workHoursEnd,
    deactivatedAt: row.deactivatedAt,
    inviteState: row.hasCredential ? "ativo" : "pendente",
    createdAt: row.createdAt,
  }));
}

export async function getTenantMemberById(
  tenantId: string,
  memberId: string
): Promise<TenantMember | null> {
  const members = await getTenantMembers(tenantId);
  return members.find((member) => member.memberId === memberId) ?? null;
}

/**
 * O e-mail é a identidade global do usuário (context.md — Usuários): único no
 * sistema inteiro, nunca por imobiliária. É esta busca que faz o convite a um
 * e-mail já conhecido virar vínculo novo em vez de segundo usuário
 * (USER-01 AC2).
 */
export async function findUserByEmail(
  email: string
): Promise<{ id: string; name: string; email: string } | null> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, email.toLowerCase()));
  return rows[0] ?? null;
}

/**
 * Usuário em convite pendente: linha em `users` e NENHUMA linha de credencial
 * em `accounts`. É o mesmo estado que o seed produz (SEED-01 AC3), e por isso
 * o convidado já é elegível a receber lead e reunião antes de aceitar (AC4).
 * A senha nasce só na tela de aceite.
 */
export async function createPendingUser(input: {
  name: string;
  email: string;
}): Promise<{ id: string; name: string; email: string }> {
  const rows = await db
    .insert(users)
    .values({ name: input.name, email: input.email.toLowerCase() })
    .returning({ id: users.id, name: users.name, email: users.email });
  return rows[0];
}

export async function createMembership(input: {
  tenantId: string;
  userId: string;
  roles: Role[];
}): Promise<string> {
  const rows = await db
    .insert(tenant_members)
    .values({
      organizationId: input.tenantId,
      userId: input.userId,
      role: input.roles.join(","),
    })
    .returning({ id: tenant_members.id });
  return rows[0].id;
}

export async function getMembership(
  tenantId: string,
  userId: string
): Promise<{
  id: string;
  roles: Role[];
  deactivatedAt: Date | null;
  workDays: number[] | null;
  workHoursStart: string | null;
  workHoursEnd: string | null;
} | null> {
  const rows = await db
    .select()
    .from(tenant_members)
    .where(
      and(
        eq(tenant_members.userId, userId),
        eq(tenant_members.organizationId, tenantId)
      )
    );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    roles: parseRoles(row.role),
    deactivatedAt: row.deactivatedAt,
    // A janela vem junto porque o shell precisa dela para o próprio usuário
    // editar a sua (AGENDA-01 AC1) — a linha já estava sendo lida inteira.
    workDays: row.workDays,
    workHoursStart: row.workHoursStart,
    workHoursEnd: row.workHoursEnd,
  };
}

/**
 * Grava os papéis do vínculo. Escopada ao tenant na mesma sentença: um
 * `memberId` de outra imobiliária nunca é alterado, mesmo sendo um uuid válido
 * (spec.md — Edge Cases: recurso de outra imobiliária é inexistente).
 */
export async function setMemberRoles(
  tenantId: string,
  memberId: string,
  roles: Role[]
): Promise<boolean> {
  const rows = await db
    .update(tenant_members)
    .set({ role: roles.join(",") })
    .where(
      and(
        eq(tenant_members.id, memberId),
        eq(tenant_members.organizationId, tenantId)
      )
    )
    .returning({ id: tenant_members.id });
  return rows.length > 0;
}

/**
 * Grava a janela de trabalho do vínculo (AGENDA-01 AC1/AC6). Escopada ao tenant
 * na mesma sentença, como `setMemberRoles`: um `memberId` de outra imobiliária
 * nunca é alterado. A janela é por VÍNCULO — a mesma pessoa pode atender em
 * horários diferentes em duas imobiliárias.
 */
export async function setMemberWorkWindow(
  tenantId: string,
  memberId: string,
  window: { days: number[]; start: string; end: string }
): Promise<boolean> {
  const rows = await db
    .update(tenant_members)
    .set({
      workDays: window.days,
      workHoursStart: window.start,
      workHoursEnd: window.end,
    })
    .where(
      and(
        eq(tenant_members.id, memberId),
        eq(tenant_members.organizationId, tenantId)
      )
    )
    .returning({ id: tenant_members.id });
  return rows.length > 0;
}

/** Vínculo com o papel administrador e ativo (`deactivatedAt` nulo). */
const HAS_ADMIN_ROLE = sql`'administrador' = any(string_to_array(${tenant_members.role}, ','))`;

/**
 * Quantos administradores ATIVOS a imobiliária tem, ignorando opcionalmente um
 * vínculo (o que está sendo alterado). Sustenta a USER-01 AC9 e o edge case do
 * último administrador: a contagem é feita antes de escrever, nunca depois.
 */
export async function countActiveAdministrators(
  tenantId: string,
  excludeMemberId?: string
): Promise<number> {
  const rows = await db
    .select({ id: tenant_members.id })
    .from(tenant_members)
    .where(
      and(
        eq(tenant_members.organizationId, tenantId),
        isNull(tenant_members.deactivatedAt),
        HAS_ADMIN_ROLE
      )
    );
  return rows.filter((row) => row.id !== excludeMemberId).length;
}

/** Validade do convite: 7 dias, o padrão da biblioteca (context.md). */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface Invitation {
  id: string;
  tenantId: string;
  email: string;
  roles: Role[];
  status: string;
  expiresAt: Date;
  /**
   * Pendente e dentro da validade — o único estado em que o convite ainda
   * ativa alguém (USER-01 AC7). Resolvido aqui, e não em quem renderiza: ler
   * o relógio durante o render de um componente é chamada impura.
   */
  isUsable: boolean;
}

function toInvitation(
  row: typeof tenant_invitations.$inferSelect,
  now: Date = new Date()
): Invitation {
  return {
    id: row.id,
    tenantId: row.organizationId,
    email: row.email,
    roles: parseRoles(row.role),
    status: row.status,
    expiresAt: row.expiresAt,
    isUsable: row.status === "pending" && row.expiresAt.getTime() > now.getTime(),
  };
}

/**
 * Emite um convite e **invalida** todo convite pendente anterior daquele
 * e-mail naquela imobiliária (USER-01 AC5): o token antigo passa a `cancelado`
 * na mesma transação em que o novo nasce, então um link antigo deixa de servir
 * assim que o administrador reenvia.
 */
export async function createInvitation(input: {
  tenantId: string;
  email: string;
  roles: Role[];
  inviterId: string;
  now?: Date;
}): Promise<Invitation> {
  const now = input.now ?? new Date();
  const email = input.email.toLowerCase();

  return db.transaction(async (tx) => {
    await tx
      .update(tenant_invitations)
      .set({ status: "cancelado" })
      .where(
        and(
          eq(tenant_invitations.organizationId, input.tenantId),
          eq(tenant_invitations.email, email),
          eq(tenant_invitations.status, "pending")
        )
      );

    const rows = await tx
      .insert(tenant_invitations)
      .values({
        organizationId: input.tenantId,
        email,
        role: input.roles.join(","),
        status: "pending",
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
        inviterId: input.inviterId,
      })
      .returning();

    return toInvitation(rows[0]);
  });
}

/** Convite pelo token da URL — que é o próprio id da linha. */
export async function getInvitation(token: string): Promise<Invitation | null> {
  const rows = await db
    .select()
    .from(tenant_invitations)
    .where(eq(tenant_invitations.id, token));
  return rows[0] ? toInvitation(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Desativação e destino da carteira (lote-8 — USER-02)
// ---------------------------------------------------------------------------

export interface CarteiraLead {
  id: string;
  name: string;
  status: LeadStatus;
  meetingAt: Date | null;
}

/**
 * Leads **ativos** do responsável (`em_qualificacao` e `escalado_humano`) —
 * exatamente os que a desativação pode mover. Lead já agendado ou histórico
 * não entra: a USER-02 AC5 exige que ele nunca mude de responsável.
 *
 * Ordem determinística: é ela que torna a redistribuição reproduzível.
 */
export async function getActiveLeadsOfMember(
  tenantId: string,
  userId: string
): Promise<CarteiraLead[]> {
  return db
    .select({
      id: leads.id,
      name: leads.name,
      status: leads.status,
      meetingAt: leads.meetingAt,
    })
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, tenantId),
        eq(leads.assignedUserId, userId),
        inArray(leads.status, ACTIVE_LEAD_STATUSES)
      )
    )
    .orderBy(asc(leads.createdAt), asc(leads.id));
}

/**
 * Reuniões futuras do corretor (spec.md — Edge Cases: desativar um corretor
 * com reuniões marcadas mostra essas reuniões junto da escolha de destino).
 * Independente do status: uma reunião marcada vale mesmo em lead já agendado —
 * é justamente o caso mais comum.
 */
export async function getUpcomingMeetingsOfMember(
  tenantId: string,
  userId: string,
  from: Date = new Date()
): Promise<{ leadId: string; leadName: string; meetingAt: Date }[]> {
  const rows = await db
    .select({
      leadId: leads.id,
      leadName: leads.name,
      meetingAt: leads.meetingAt,
    })
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, tenantId),
        eq(leads.assignedUserId, userId),
        gte(leads.meetingAt, from)
      )
    )
    .orderBy(asc(leads.meetingAt), asc(leads.id));

  return rows.map((row) => ({
    leadId: row.leadId,
    leadName: row.leadName,
    meetingAt: row.meetingAt as Date,
  }));
}

export type TransferResult =
  | { ok: true; moved: number }
  | { ok: false; reason: "destino-indisponivel" };

/**
 * Transfere a carteira ativa e desativa o vínculo **numa transação só**
 * (USER-02 AC2/AC7).
 *
 * A primeira coisa que a transação faz é travar o vínculo do corretor de
 * destino com `for update`, exigindo que ele esteja ativo e com papel
 * corretor. Isso é o que sustenta a AC7: uma desativação concorrente do
 * destino ou espera esta transação terminar, ou já está visível aqui — e, se
 * já estiver, nada é transferido e o vínculo de origem também não é
 * desativado. Não existe estado intermediário com metade dos leads movidos.
 */
export async function transferCarteiraAndDeactivate(input: {
  tenantId: string;
  memberId: string;
  fromUserId: string;
  toUserId: string;
  now?: Date;
}): Promise<TransferResult> {
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const destino = await tx
      .select({ id: tenant_members.id })
      .from(tenant_members)
      .where(
        and(
          eq(tenant_members.userId, input.toUserId),
          eq(tenant_members.organizationId, input.tenantId),
          IS_ASSIGNABLE_BROKER
        )
      )
      .for("update");

    if (destino.length === 0) {
      return { ok: false as const, reason: "destino-indisponivel" as const };
    }

    const moved = await tx
      .update(leads)
      .set({ assignedUserId: input.toUserId, updatedAt: now })
      .where(
        and(
          eq(leads.tenantId, input.tenantId),
          eq(leads.assignedUserId, input.fromUserId),
          inArray(leads.status, ACTIVE_LEAD_STATUSES)
        )
      )
      .returning({ id: leads.id });

    await tx
      .update(tenant_members)
      .set({ deactivatedAt: now })
      .where(
        and(
          eq(tenant_members.id, input.memberId),
          eq(tenant_members.organizationId, input.tenantId)
        )
      );

    return { ok: true as const, moved: moved.length };
  });
}

/** Desativa o vínculo sem tocar em nenhuma atribuição (USER-02 AC4/AC6). */
export async function deactivateMembership(
  tenantId: string,
  memberId: string,
  now: Date = new Date()
): Promise<boolean> {
  const rows = await db
    .update(tenant_members)
    .set({ deactivatedAt: now })
    .where(
      and(
        eq(tenant_members.id, memberId),
        eq(tenant_members.organizationId, tenantId)
      )
    )
    .returning({ id: tenant_members.id });
  return rows.length > 0;
}

export type DeleteUserResult =
  | { ok: true }
  | { ok: false; propertiesCaptured: number };

/**
 * Exclusão real de um usuário (lote-11 — T9; spec.md Edge Cases: "exclusão de
 * usuário tentada enquanto ele for captador de algum imóvel"). `tenant_members`
 * referencia `users.id` com `onDelete: "cascade"` (schema.ts), então apagar o
 * usuário já remove o vínculo em qualquer imobiliária a que ele pertença —
 * nenhum delete explícito de `tenant_members` é necessário aqui.
 *
 * `properties.captured_by_user_id` referencia `users.id` sem `onDelete`
 * (restrict — o default do Postgres): se o usuário ainda captar algum imóvel,
 * a exclusão é rejeitada pelo próprio banco, e a contagem de imóveis é lida
 * só nesse caminho de erro para compor a recusa legível.
 *
 * Uma violação de FK vinda de OUTRA tabela (ex.: `leads.assigned_user_id`,
 * que também referencia `users.id` sem cascata) não é traduzida aqui — está
 * fora do escopo desta task, que só cobre `captured_by_user_id` — e é
 * relançada como está.
 */
export async function deleteUser(userId: string): Promise<DeleteUserResult> {
  try {
    await db.delete(users).where(eq(users.id, userId));
    return { ok: true };
  } catch (err) {
    if (!isForeignKeyViolation(err)) throw err;

    const [row] = await db
      .select({ capturedCount: count() })
      .from(properties)
      .where(eq(properties.capturedByUserId, userId));
    const capturedCount = Number(row.capturedCount);

    if (capturedCount === 0) throw err;
    return { ok: false, propertiesCaptured: capturedCount };
  }
}

// ---------------------------------------------------------------------------
// Recusas do contrato de integração (lote-9 — SAUDE-01/02/03; AD-023).
// ---------------------------------------------------------------------------

export interface IntegrationRefusalInput {
  tenantId: string | null;
  route: string;
  method: string;
  status: number;
  code: string | null;
  occurredAt: Date;
}

/**
 * Grava uma recusa do contrato (SAUDE-01). Insere exatamente os seis campos
 * do design (`design.md` — Data Models, `IntegrationRefusal`) — nunca corpo,
 * cabeçalhos nem dado de lead. `tenantId` nulo é aceito de propósito: a
 * recusa por credencial inválida acontece antes de existir tenant.
 */
export async function recordIntegrationRefusal(
  input: IntegrationRefusalInput
): Promise<void> {
  await db.insert(integrationRefusals).values({
    tenantId: input.tenantId,
    route: input.route,
    method: input.method,
    status: input.status,
    code: input.code,
    occurredAt: input.occurredAt,
  });
}

export interface RefusalSummary {
  code: string | null;
  route: string;
  count: number;
  lastOccurredAt: Date;
}

/**
 * Recusas recentes para o painel de saúde (SAUDE-02): as do tenant pedido
 * MAIS as sem tenant (recusa anterior à identificação — cruza a fronteira de
 * tenant de propósito, design.md — Risks: "Recusa sem tenant aparece para
 * todas as imobiliárias"), agrupadas por `(code, route)`. Recusa mais antiga
 * que `since` fica de fora.
 */
export async function getIntegrationRefusalsSince(
  tenantId: string,
  since: Date
): Promise<RefusalSummary[]> {
  const rows = await db
    .select({
      code: integrationRefusals.code,
      route: integrationRefusals.route,
      count: count(),
      lastOccurredAt: max(integrationRefusals.occurredAt),
    })
    .from(integrationRefusals)
    .where(
      and(
        or(
          eq(integrationRefusals.tenantId, tenantId),
          isNull(integrationRefusals.tenantId)
        ),
        gte(integrationRefusals.occurredAt, since)
      )
    )
    .groupBy(integrationRefusals.code, integrationRefusals.route);

  return rows.map((row) => ({
    code: row.code,
    route: row.route,
    count: row.count,
    // NOT NULL na tabela (defaultNow) — todo grupo tem ao menos 1 linha, então
    // max() nunca devolve null aqui.
    lastOccurredAt: row.lastOccurredAt!,
  }));
}

/**
 * Purga recusas com mais de 30 dias (SAUDE-03), devolvendo a contagem
 * deletada. Comparação estrita (`<`): uma recusa com exatamente 30 dias de
 * idade ainda não tem "mais de 30 dias" e permanece; só quem é mais antigo
 * que o corte vence.
 */
export async function purgeIntegrationRefusals(
  now: Date
): Promise<{ deleted: number }> {
  const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - RETENTION_MS);

  const rows = await db
    .delete(integrationRefusals)
    .where(lt(integrationRefusals.occurredAt, cutoff))
    .returning({ id: integrationRefusals.id });

  return { deleted: rows.length };
}
