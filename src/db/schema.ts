import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Enums (design.md — Data Models)
export const leadStatusEnum = pgEnum("lead_status", [
  "em_qualificacao",
  "qualificado_agendado",
  "escalado_humano",
]);

export const modalityEnum = pgEnum("modality", ["novo", "usado", "ambos"]);

export const propertyTypeEnum = pgEnum("property_type", [
  "casa",
  "apartamento",
]);

export const motivationEnum = pgEnum("motivation", [
  "investidor",
  "morador",
]);

export const creditStatusEnum = pgEnum("credit_status", [
  "pre_aprovado",
  "recurso_proprio",
  "fgts",
]);

export const senderEnum = pgEnum("sender", ["agente", "lead"]);

// Origem da última mudança de status de um lead (lote-5 — INT-04: trava
// humana). `null` = nunca alterado por nenhum ator (estado do seed).
export const statusActorEnum = pgEnum("status_actor", ["humano", "agente"]);

// 1:1 com as 10 cores do componente `Token` da Astryx (design.md — Cor de
// categoria). Paleta fixa: nenhum hex cru é aceito em nenhuma camada.
export const categoryColorEnum = pgEnum("category_color", [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "cyan",
  "blue",
  "purple",
  "pink",
  "gray",
]);

// Tables

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    agentName: text("agent_name").notNull(),
    supportedModality: modalityEnum("supported_modality").notNull(),
    // Baseline pré-piloto (Lote 4 — DASH-05). Snapshot único por tenant,
    // nullable até ser preenchido (mockado no seed por ora; real na Fase 10).
    baselineLeadsPerMonth: integer("baseline_leads_per_month"),
    baselineFirstResponseMinutes: integer("baseline_first_response_minutes"),
    baselineLeadToMeetingPct: integer("baseline_lead_to_meeting_pct"),
    // Baseline pré-piloto (lote-9 — BASE-01), somando-se aos três acima.
    // Nullable pela mesma razão: são snapshot único preenchido pelo usuário,
    // não pelo seed (AD-004) — o de escalonamento é o mais discutível de
    // levantar (a imobiliária não tinha agente antes), mas nasce nulo como
    // os demais até a imobiliária registrar.
    baselineEscalationPct: integer("baseline_escalation_pct"),
    baselineAttendancePct: integer("baseline_attendance_pct"),
    // Identidade institucional exibida no shell e editável em Configurações
    // (redesign-crm-astryx — RD-01/RD-02/RD-07). Todas nullable e aditivas: o
    // shell degrada graciosamente quando faltam (spec.md — Edge Cases) e a
    // Fase 9 troca a fonte, não as colunas (AD-004).
    city: text("city"),
    state: text("state"), // UF (2 chars por convenção do seed; sem constraint)
    agentWhatsapp: text("agent_whatsapp"),
    website: text("website"),
    agentPresentationMessage: text("agent_presentation_message"),
    // Horário comercial configurável pela imobiliária (lote-6 — CONF-05),
    // consumido pelo agente via GET /api/v1/settings (INT-09). Nullable/
    // aditivo (AD-004): tenants sem configuração respondem null nesses 3
    // campos e o fluxo aplica o fallback seg-sex 9h-18h (design.md). Dias em
    // ISO 1(segunda)-7(domingo); horas em texto "HH:MM" (sem timezone — o
    // fluxo interpreta em America/Sao_Paulo).
    meetingDays: integer("meeting_days").array(),
    meetingHoursStart: text("meeting_hours_start"),
    meetingHoursEnd: text("meeting_hours_end"),
    // Tom de voz / personalidade do agente (lote-6b — PER-03), texto livre
    // opcional preenchido pela imobiliária em Configurações. Nullable/aditiva
    // (mesmo padrão de `agentPresentationMessage`): descreve o JEITO DE FALAR
    // do agente, consumido pelo prompt (n8n) via GET /api/v1/settings — nunca
    // instrução de processo.
    agentVoiceTone: text("agent_voice_tone"),
    // Identificador legível único do tenant (lote-7 — SEC-01), usado pelo
    // header `X-Crivo-Tenant` do modo de autenticação de serviço do agente
    // e já espelhado no n8n como `tenantSlug` na Data Table `tenant_config`.
    //
    // NOT NULL com índice único TOTAL a partir do lote-8 (T3): o plugin
    // `organization` do better-auth, mapeado sobre esta tabela (AD-021),
    // exige `slug` obrigatório. Era nullable com índice único parcial só
    // porque o lote-7 não podia adicionar uma coluna NOT NULL contra uma
    // tabela que já tinha linhas; sem dado real a preservar, o reseed é o
    // caminho de convergência e a ressalva caducou.
    slug: text("slug").notNull(),
    // Exigidas pelo modelo `organization` do plugin do better-auth, que é
    // mapeado sobre esta tabela (AD-021). Ambas opcionais e sem consumidor no
    // CRM hoje — existem para que o plugin possa ler/escrever o modelo dele
    // sem uma tabela paralela ao lado de `tenants`.
    logo: text("logo"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("tenants_slug_idx").on(table.slug)]
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    // Corretor responsável (lote-8 — AD-021): era `broker_id -> brokers.id`.
    // `brokers` deixou de existir — corretor é sempre um usuário, e o vínculo
    // com a imobiliária (com papéis e janela de trabalho) mora em
    // `tenant_members`. Continua nullable: o lead nasce sem responsável e só
    // ganha um no agendamento ou no escalonamento (AD-022).
    assignedUserId: uuid("assigned_user_id").references(() => users.id),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    status: leadStatusEnum("status").notNull(),
    // Campos de qualificação (PRD §6.4) — nullable até o lead ser qualificado
    modality: modalityEnum("modality"),
    region: text("region"),
    budgetCents: bigint("budget_cents", { mode: "bigint" }),
    propertyType: propertyTypeEnum("property_type"),
    purchaseHorizon: text("purchase_horizon"),
    motivation: motivationEnum("motivation"),
    creditStatus: creditStatusEnum("credit_status"),
    chainedOperation: boolean("chained_operation"),
    executiveSummary: text("executive_summary"),
    escalationReason: text("escalation_reason"),
    meetingAt: timestamp("meeting_at", { withTimezone: true }),
    meetingAttended: boolean("meeting_attended"),
    firstContactAt: timestamp("first_contact_at", {
      withTimezone: true,
    }).notNull(),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Contrato de integração (lote-5 — INT-02/04, LGPD-01). Todas nullable/
    // aditivas (AD-004): leads do seed antigo nunca tiveram um `externalId`,
    // nunca sofreram opt-out, nunca tiveram status alterado por nenhum ator.
    externalId: text("external_id"), // id do lead no mundo do agente (ex.: wa_id)
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    statusChangedBy: statusActorEnum("status_changed_by"),
  },
  (table) => [
    // Idempotência de entrega (INT-02.2) escopada por tenant: dois tenants
    // podem receber o mesmo externalId (ex.: mesmo wa_id em duas
    // imobiliárias distintas). Parcial (WHERE NOT NULL) para não afetar as
    // linhas do seed antigo, que nunca têm externalId.
    uniqueIndex("leads_tenant_id_external_id_idx")
      .on(table.tenantId, table.externalId)
      .where(sql`${table.externalId} is not null`),
    // Conflito de agenda (lote-8 — ATRIB-02 AC7; AD-022): o mesmo corretor não
    // pode ter duas reuniões no mesmo instante na mesma imobiliária. A trava é
    // do BANCO, não da aplicação — dois agendamentos concorrentes leem a mesma
    // lista de candidatos e escolhem o mesmo corretor; só o índice garante que
    // exatamente um confirma e o outro recebe `conflito-de-agenda`.
    //
    // O slot do produto é de 30 minutos alinhados (spec.md — Assumptions),
    // então "mesmo `meeting_at`" é "mesmo intervalo". Sobreposição parcial
    // (14:00 × 14:15) é responsabilidade do filtro de candidatos
    // (`selectForMeeting`), que exclui quem já tem reunião sobreposta.
    //
    // Parcial, pela mesma disciplina de `leads_tenant_id_external_id_idx`: só
    // vale para lead COM reunião e COM responsável — lead sem reunião ou sem
    // dono (a regra do lote: o lead nasce órfão) nunca colide.
    uniqueIndex("leads_assigned_user_id_meeting_at_idx")
      .on(table.tenantId, table.assignedUserId, table.meetingAt)
      .where(
        sql`${table.meetingAt} is not null and ${table.assignedUserId} is not null`
      ),
  ]
);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Redundante em relação a conversations.tenant_id — simplifica o filtro de isolamento (design.md)
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    sender: senderEnum("sender").notNull(),
    content: text("content").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Contrato de integração (lote-5 — INT-05): id da mensagem no WhatsApp,
    // usado para deduplicar reentregas. Nullable/aditiva — mensagens do seed
    // antigo nunca têm externalId.
    externalId: text("external_id"),
  },
  (table) => [
    // Idempotência de ingestão (INT-05.2), escopada por tenant, parcial
    // (WHERE NOT NULL) pela mesma razão de leads_tenant_id_external_id_idx.
    uniqueIndex("messages_tenant_id_external_id_idx")
      .on(table.tenantId, table.externalId)
      .where(sql`${table.externalId} is not null`),
  ]
);

export const documentCategories = pgTable(
  "document_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    // Default 'gray' torna a migração não-destrutiva: categorias criadas
    // antes deste lote passam a ter essa cor sem exigir backfill manual
    // (spec.md — CAT-01.5).
    color: categoryColorEnum("color").notNull().default("gray"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Nome único por tenant, ignorando maiúsculas/minúsculas (lote-2 — CONF-01/02)
    uniqueIndex("document_categories_tenant_id_lower_name_idx").on(
      table.tenantId,
      sql`lower(${table.name})`
    ),
  ]
);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  modality: modalityEnum("modality").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
  categoryId: uuid("category_id").references(() => documentCategories.id, {
    onDelete: "set null",
  }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Reserva de TTL (LGPD) — enforcement é Fase 7 (design.md)
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

// Contrato de integração (lote-5 — INT-01): 1+ chave por tenant, valor em
// claro nunca persistido (só o hash sha256 — design.md, Tech Decisions).
// `revokedAt` permite revogar uma chave por tenant sem apagar o histórico.
export const tenantApiKeys = pgTable("tenant_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  label: text("label").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

// Chave de serviço do agente (lote-7 — SEC-01): uma credencial única usada
// pelo fluxo n8n para autenticar no contrato, no lugar de uma chave por
// tenant embutida em texto claro numa Data Table. Mesmo formato de
// `tenant_api_keys` (hash sha256 persistido, valor em claro só existe uma
// vez no output do seed). Deliberadamente SEM `tenantId`/FK: o tenant da
// chamada vem do header `X-Crivo-Tenant`, nunca da chave — a chave só prova
// que quem chama é o agente, não qual tenant ele está atendendo
// (design.md — Auth de serviço).
export const serviceApiKeys = pgTable("service_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // `null` = chave ativa. Preenchido = chave revogada (mesma semântica de
  // `tenant_api_keys.revokedAt`) — nunca apagamos a linha, só marcamos
  // quando parou de valer, preservando o histórico de rotação.
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Tabelas core do better-auth (lote-8 — AUTH-01; AD-021).
//
// Geradas por `npx auth@latest generate --config src/server/auth/config.ts`
// (design.md — Integration Points) e transcritas aqui com duas adaptações às
// convenções do projeto, nenhuma delas semântica: `.defaultRandom()` no lugar
// de `sql\`pg_catalog.gen_random_uuid()\`` (é o mesmo `gen_random_uuid()`), e
// `withTimezone: true` em todo timestamp, como em todas as tabelas acima.
// As `relations()` emitidas pelo CLI ficam de fora: o projeto não usa a API
// relacional do Drizzle em lugar nenhum.
//
// O `id` é `uuid` porque `src/server/auth/config.ts` configura
// `advanced.database.generateId: "uuid"` — sem isso o better-auth geraria um
// alfanumérico de 32 caracteres, incompatível com as PKs `uuid` de todo o
// resto do schema (risco registrado no design.md, provado por teste em T2).
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Imobiliária ativa da sessão (AD-021, que emenda a AD-007): substitui o
    // cookie `crivo_tenant` como fonte de verdade. `text` e sem FK porque é
    // assim que o plugin declara o campo (`type: "string"`) e é o que o CLI
    // emite — o valor é sempre um `tenants.id`, e a validação contra os
    // vínculos reais do usuário mora na guarda (`verifySession`, T7), não
    // numa constraint.
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("sessions_userId_idx").on(table.userId)]
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    // Hash da senha (e-mail + senha). Nunca a senha em claro — o better-auth
    // grava só o hash, mesma disciplina de `service_api_keys.keyHash`.
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("accounts_issuer_accountId_uidx").on(
      table.issuer,
      table.accountId
    ),
    index("accounts_userId_idx").on(table.userId),
  ]
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)]
);

// ---------------------------------------------------------------------------
// Plugin `organization` do better-auth mapeado sobre `tenants` (lote-8 —
// TENANT-01; AD-021). `organization` → `tenants` (tabela existente, acima),
// `member` → `tenant_members`, `invitation` → `tenant_invitations`.
//
// Os dois exports abaixo são snake_case, ao contrário do resto do arquivo:
// o adaptador Drizzle resolve a tabela por `schema[modelName]` (lookup por
// chave exata do módulo), então o nome do export TEM que ser o `modelName`
// configurado em `src/server/auth/config.ts`. Renomear um dos dois quebra o
// adaptador em runtime, não em compilação.
// ---------------------------------------------------------------------------

export const tenant_members = pgTable(
  "tenant_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Papéis do produto (`administrador` | `gestor` | `corretor`),
    // acumuláveis, separados por vírgula — formato nativo do plugin.
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // `additionalFields` do produto. A janela de trabalho é POR VÍNCULO, não
    // por usuário: a mesma pessoa pode atender em horários diferentes em duas
    // imobiliárias. Dias ISO 1(segunda)-7(domingo) e horas "HH:MM" em
    // America/Sao_Paulo — mesma convenção de `tenants.meetingDays`.
    workDays: integer("work_days").array(),
    workHoursStart: text("work_hours_start"),
    workHoursEnd: text("work_hours_end"),
    // `null` = vínculo ativo. Desativação nunca apaga a linha (USER-02).
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  },
  (table) => [
    // Um vínculo por par usuário × imobiliária. O plugin não declara esse
    // único; sem ele, convidar duas vezes o mesmo e-mail criaria dois
    // vínculos para a mesma pessoa na mesma imobiliária.
    uniqueIndex("tenant_members_user_id_organization_id_idx").on(
      table.userId,
      table.organizationId
    ),
    index("tenant_members_organizationId_idx").on(table.organizationId),
    index("tenant_members_userId_idx").on(table.userId),
  ]
);

export const tenant_invitations = pgTable(
  "tenant_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("tenant_invitations_organizationId_idx").on(table.organizationId),
    index("tenant_invitations_email_idx").on(table.email),
  ]
);

// ---------------------------------------------------------------------------
// Tentativas de login FALHAS, por e-mail (lote-8 — AUTH-01 AC4).
//
// O rate limit nativo do better-auth é chaveado por IP + rota, e a AC pede a
// garantia pelo E-MAIL. Os dois não se substituem: um ataque distribuído (um
// IP por tentativa) nunca esbarra no limite por IP, e um escritório inteiro
// atrás do mesmo NAT é punido pelo erro de um. Esta tabela é o contador do
// e-mail; o limite por IP continua onde estava, cobrindo a outra classe.
//
// Mora no Postgres, e não em memória de processo, porque o produto roda
// serverless na Vercel: memória de processo não sobrevive entre invocações,
// então um contador em memória contaria quase sempre do zero — o limite
// existiria só no papel.
//
// A linha vale enquanto a janela dela vale: `recordFailedLogin`
// (`src/server/auth/login-attempts.ts`) apaga as vencidas a cada gravação. A
// tabela é um contador, não um histórico de acesso.
// ---------------------------------------------------------------------------

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // E-mail TENTADO, normalizado em minúsculas. Não é FK para `users`: a
    // tentativa contra e-mail inexistente também conta. Contar só o que existe
    // na base faria o comportamento variar com a existência da conta — que é
    // exatamente a informação que a AC3 esconde na mensagem de falha.
    email: text("email").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("login_attempts_email_attempted_at_idx").on(
      table.email,
      table.attemptedAt
    ),
  ]
);

// ---------------------------------------------------------------------------
// Recusas do contrato de integração `/api/v1` (lote-9 — SAUDE-01; AD-023).
//
// Toda resposta >= 400 do contrato é registrada aqui por um wrapper único de
// rota, com `after()` fora do caminho da resposta. `tenantId` é nullable de
// propósito: a recusa por credencial inválida acontece antes de existir
// tenant, e é justamente a que precisa aparecer.
//
// NUNCA guarda: corpo da requisição, cabeçalhos, telefone, nome ou qualquer
// conteúdo de mensagem (SAUDE-01 AC4) — só metadado de transporte.
// ---------------------------------------------------------------------------

export const integrationRefusals = pgTable(
  "integration_refusals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    route: text("route").notNull(), // pathname, ex.: "/api/v1/leads/{id}/messages" — nunca query string
    method: text("method").notNull(), // "POST" | "GET" | ...
    status: integer("status").notNull(), // 401 | 404 | 405 | 409 | 413 | 422 | 5xx
    code: text("code"), // ProblemCode do corpo problem+json; null se o corpo não for problem+json
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Leitura de saúde por imobiliária (SAUDE-02): recusas recentes do tenant.
    index("integration_refusals_tenant_id_occurred_at_idx").on(
      table.tenantId,
      table.occurredAt
    ),
    // Purga por retenção de 30 dias (SAUDE-03), atravessando todos os tenants.
    index("integration_refusals_occurred_at_idx").on(table.occurredAt),
  ]
);
