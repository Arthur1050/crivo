import "dotenv/config";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { db } from "./index";
import {
  brokers,
  conversations,
  documentCategories,
  documents,
  leads,
  messages,
  tenants,
} from "./schema";

/**
 * Gera um UUID v4 determinístico a partir de uma seed textual fixa.
 * Mesma seed → mesmo UUID sempre, o que garante idempotência do seed
 * (delete-and-insert transacional termina no mesmo estado a cada execução).
 */
function id(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

type Modality = "novo" | "usado" | "ambos";
type LeadStatus =
  | "em_qualificacao"
  | "qualificado_agendado"
  | "escalado_humano";
// 1:1 com o enum `category_color` do schema (paleta fixa Token da Astryx).
type CategoryColor =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "cyan"
  | "blue"
  | "purple"
  | "pink"
  | "gray";

const REGIONS = [
  "Abadia",
  "Fabrício",
  "Leblon",
  "Mercês",
  "Country Club",
  "Jardim Sumaré",
  "Boa Vista",
  "São Benedito",
  "Vila Recreio",
  "Ponte Alta",
];

const PROPERTY_TYPES = ["casa", "apartamento"] as const;
const MOTIVATIONS = ["investidor", "morador"] as const;
const CREDIT_STATUSES = ["pre_aprovado", "recurso_proprio", "fgts"] as const;
const HORIZONS_NOVO = [
  "24 meses (na planta)",
  "30 meses (em obras)",
  "36 meses (lançamento)",
];
const HORIZONS_USADO = ["imediato", "30 dias", "90 dias"];
const ESCALATION_REASONS = [
  "Lead pediu para falar diretamente com um corretor humano.",
  "Negociação de permuta complexa que exige avaliação presencial.",
  "Dúvidas jurídicas sobre financiamento que fogem do escopo do agente.",
  "Solicitação de visita técnica urgente antes de concluir a qualificação.",
];

const FIRST_NAMES = [
  "Ana",
  "Bruno",
  "Carla",
  "Diego",
  "Elaine",
  "Fábio",
  "Gabriela",
  "Henrique",
  "Isabela",
  "João",
  "Karina",
  "Leonardo",
  "Mariana",
  "Nathan",
  "Olívia",
  "Paulo",
  "Queila",
  "Rafael",
  "Sabrina",
  "Thiago",
  "Uendel",
  "Vanessa",
  "Wesley",
  "Yasmin",
  "Zélia",
  "Otávio",
  "Patrícia",
  "Ricardo",
  "Simone",
  "Tatiane",
];

const LAST_NAMES = [
  "Almeida",
  "Barbosa",
  "Carvalho",
  "Dias",
  "Esteves",
  "Ferreira",
  "Gonçalves",
  "Henriques",
  "Ibrahim",
  "Junqueira",
  "Klein",
  "Lopes",
  "Martins",
  "Nogueira",
  "Oliveira",
  "Pires",
  "Quintino",
  "Ramos",
  "Souza",
  "Teixeira",
];

interface TenantDef {
  key: string;
  name: string;
  agentName: string;
  supportedModality: Modality;
  // Baseline pré-piloto mockado (Lote 4 — DASH-05). Valores distintos e
  // plausíveis por tenant: atendimento manual antes do agente.
  baselineLeadsPerMonth: number;
  baselineFirstResponseMinutes: number;
  baselineLeadToMeetingPct: number;
  brokers: { key: string; name: string; phone: string; email: string }[];
}

const TENANT_DEFS: TenantDef[] = [
  {
    key: "vale-uberaba",
    name: "Imobiliária Vale do Uberaba",
    agentName: "Bia",
    supportedModality: "ambos",
    baselineLeadsPerMonth: 16,
    baselineFirstResponseMinutes: 300,
    baselineLeadToMeetingPct: 18,
    brokers: [
      {
        key: "b1",
        name: "Marcos Aurélio Silva",
        phone: "+55 34 99101-2233",
        email: "marcos.silva@valeuberaba.com.br",
      },
      {
        key: "b2",
        name: "Camila Fernandes Rocha",
        phone: "+55 34 99102-3344",
        email: "camila.rocha@valeuberaba.com.br",
      },
      {
        key: "b3",
        name: "Rodrigo Almeida Costa",
        phone: "+55 34 99103-4455",
        email: "rodrigo.costa@valeuberaba.com.br",
      },
    ],
  },
  {
    key: "triangulo",
    name: "Triângulo Imóveis",
    agentName: "Lucas",
    supportedModality: "ambos",
    baselineLeadsPerMonth: 22,
    baselineFirstResponseMinutes: 180,
    baselineLeadToMeetingPct: 27,
    brokers: [
      {
        key: "b1",
        name: "Fernanda Souza Lima",
        phone: "+55 34 99201-5566",
        email: "fernanda.lima@trianguloimoveis.com.br",
      },
      {
        key: "b2",
        name: "André Luiz Martins",
        phone: "+55 34 99202-6677",
        email: "andre.martins@trianguloimoveis.com.br",
      },
      {
        key: "b3",
        name: "Juliana Pereira Dias",
        phone: "+55 34 99203-7788",
        email: "juliana.dias@trianguloimoveis.com.br",
      },
    ],
  },
];

// Distribuição fixa nos 3 status do pipeline (soma = 25 leads/tenant)
const STATUS_SEQUENCE: LeadStatus[] = [
  ...Array(10).fill("em_qualificacao" as const),
  ...Array(8).fill("qualificado_agendado" as const),
  ...Array(7).fill("escalado_humano" as const),
];

interface LeadDef {
  name: string;
  phone: string;
  status: LeadStatus;
  modality: Modality;
}

function buildLeadDefs(tenantKey: string): LeadDef[] {
  return STATUS_SEQUENCE.map((status, i) => {
    const first = FIRST_NAMES[(hashIndex(tenantKey, String(i), "first")) % FIRST_NAMES.length];
    const last = LAST_NAMES[(hashIndex(tenantKey, String(i), "last")) % LAST_NAMES.length];
    const modality: Modality = i % 3 === 0 ? "ambos" : i % 3 === 1 ? "novo" : "usado";
    const ddd = "34";
    const line = String(90000 + i).padStart(5, "0");
    return {
      name: `${first} ${last}`,
      phone: `+55 ${ddd} 9${line}-${String(1000 + i)}`,
      status,
      modality,
    };
  });
}

// Índice pseudo-determinístico derivado de uma seed textual (sem Math.random,
// para que o conteúdo do seed permaneça idêntico entre execuções).
function hashIndex(...parts: string[]): number {
  const hash = createHash("sha256").update(parts.join(":")).digest();
  return hash.readUInt32BE(0);
}

// Distância em dias (0..90) de firstContactAt até o momento do seed, para o
// lead de índice `i` dentre `total` leads do tenant. A fórmula é fixa
// (mesmo `i` sempre produz o mesmo offset), mas a âncora ("agora") é
// relativa ao momento em que o seed roda — design.md ("Duas fontes de
// agora"). Distribuição linear de 0 (hoje) a 90 (há ~90 dias) garante leads
// nas janelas de 7/30/90 dias em ambos os tenants (mesma sequência de
// status/índice em cada um).
function offsetDaysFor(i: number, total: number): number {
  return Math.round((i * 90) / (total - 1));
}

function buildQualification(seedIndex: number, modality: Modality) {
  const region = REGIONS[seedIndex % REGIONS.length];
  const propertyType = PROPERTY_TYPES[seedIndex % PROPERTY_TYPES.length];
  const motivation = MOTIVATIONS[seedIndex % MOTIVATIONS.length];
  const creditStatus = CREDIT_STATUSES[seedIndex % CREDIT_STATUSES.length];
  const purchaseHorizon =
    modality === "novo"
      ? HORIZONS_NOVO[seedIndex % HORIZONS_NOVO.length]
      : HORIZONS_USADO[seedIndex % HORIZONS_USADO.length];
  const budgetCents = BigInt(280000 + (seedIndex % 12) * 35000) * BigInt(100);
  const chainedOperation = seedIndex % 3 === 0;
  return {
    region,
    propertyType,
    motivation,
    creditStatus,
    purchaseHorizon,
    budgetCents,
    chainedOperation,
  };
}

function buildExecutiveSummary(
  leadName: string,
  modality: Modality,
  qualification: ReturnType<typeof buildQualification>
): string {
  const budgetReais = (Number(qualification.budgetCents) / 100).toLocaleString(
    "pt-BR",
    { style: "currency", currency: "BRL" }
  );
  return (
    `${leadName} busca imóvel ${modality} do tipo ${qualification.propertyType} ` +
    `na região de ${qualification.region}, orçamento de até ${budgetReais}, ` +
    `horizonte de compra de ${qualification.purchaseHorizon}, perfil ${qualification.motivation}, ` +
    `crédito ${qualification.creditStatus}. ` +
    `${qualification.chainedOperation ? "Depende da venda do imóvel atual (operação casada)." : "Sem operação casada."} ` +
    `Reunião de apresentação agendada.`
  );
}

function buildMessages(
  leadName: string,
  agentName: string,
  tenantName: string,
  modality: Modality,
  status: LeadStatus,
  qualification: ReturnType<typeof buildQualification> | null,
  escalationReason: string | null
): { sender: "agente" | "lead"; content: string }[] {
  const modalityText =
    modality === "novo" ? "novo" : modality === "usado" ? "usado" : "novo ou usado, tô aberto aos dois";
  const msgs: { sender: "agente" | "lead"; content: string }[] = [
    {
      sender: "agente",
      content: `Olá, ${leadName}! Aqui é ${agentName}, assistente virtual da ${tenantName}. Vi seu interesse em imóveis — posso te ajudar a encontrar a opção ideal?`,
    },
    {
      sender: "lead",
      content: `Oi! Sim, estou procurando um imóvel ${modalityText}.`,
    },
    {
      sender: "agente",
      content: `Perfeito. Em qual região você tem interesse e qual tipo de imóvel procura — casa ou apartamento?`,
    },
  ];

  if (status === "em_qualificacao") {
    msgs.push(
      {
        sender: "lead",
        content: `Ainda estou decidindo a região, mas prefiro apartamento.`,
      },
      {
        sender: "agente",
        content: `Sem problema! Me conta um pouco mais sobre seu orçamento e prazo para essa compra, assim consigo te indicar as melhores opções.`,
      }
    );
    return msgs;
  }

  if (!qualification) {
    throw new Error("qualification é obrigatório para leads além de em_qualificacao");
  }

  const budgetReais = (Number(qualification.budgetCents) / 100).toLocaleString(
    "pt-BR",
    { style: "currency", currency: "BRL" }
  );

  msgs.push(
    {
      sender: "lead",
      content: `Tô de olho no bairro ${qualification.region}, prefiro ${qualification.propertyType}.`,
    },
    {
      sender: "agente",
      content: `Ótimo! E qual seria o orçamento aproximado e o prazo que você imagina para fechar negócio?`,
    },
    {
      sender: "lead",
      content: `Consigo investir até ${budgetReais}, e meu horizonte é de ${qualification.purchaseHorizon}.`,
    }
  );

  if (status === "escalado_humano") {
    msgs.push(
      {
        sender: "lead",
        content: `Na verdade prefiro conversar direto com um corretor humano para fechar os detalhes.`,
      },
      {
        sender: "agente",
        content: `Sem problema! Vou te conectar com um de nossos corretores para continuar o atendimento. Motivo do encaminhamento: ${escalationReason}`,
      }
    );
    return msgs;
  }

  // qualificado_agendado
  msgs.push(
    {
      sender: "agente",
      content: `Você já tem alguma pré-aprovação de crédito ou pretende usar recurso próprio${modality !== "novo" ? "/FGTS" : ""}?`,
    },
    {
      sender: "lead",
      content: `Estou com ${
        qualification.creditStatus === "pre_aprovado"
          ? "crédito pré-aprovado"
          : qualification.creditStatus === "fgts"
            ? "saldo de FGTS disponível"
            : "recurso próprio"
      }.`,
    },
    {
      sender: "agente",
      content: `Perfeito, já tenho tudo que preciso! Vou agendar uma apresentação com um de nossos corretores. Pode ser essa semana?`,
    },
    {
      sender: "lead",
      content: `Pode sim, pode marcar!`,
    }
  );
  return msgs;
}

// Mesmos 3 nomes de categoria são semeados em AMBOS os tenants de propósito:
// prova que a unicidade de nome é escopada por tenant (lower(name), tenant_id),
// não global (lote-2 — CONF-01/02).
interface CategoryDef {
  key: string;
  name: string;
  color: CategoryColor;
}

// Cores fixas e determinísticas por categoria — cobre o invariante do lote 3
// (CAT-01 fixture): ≥2 cores distintas por tenant, com pelo menos uma 'gray'
// (mesmas 3 categorias são semeadas em ambos os tenants, então o invariante
// vale para os dois).
const CATEGORY_DEFS: CategoryDef[] = [
  { key: "tabelas-precos", name: "Tabelas de Preços", color: "blue" },
  { key: "contratos", name: "Contratos", color: "green" },
  { key: "guias", name: "Guias e Manuais", color: "gray" },
];

function documentDefsFor(tenantKey: string) {
  return [
    {
      key: "tabela-precos-novo",
      name: "Tabela de Preços - Empreendimentos Novos.pdf",
      modality: "novo" as Modality,
      mimeType: "application/pdf",
      sizeBytes: BigInt(482311),
      expiresAt: null as Date | null,
      categoryKey: "tabelas-precos" as string | null,
    },
    {
      key: "guia-avaliacao-usado",
      name: "Guia de Avaliação - Imóveis Usados.pdf",
      modality: "usado" as Modality,
      mimeType: "application/pdf",
      sizeBytes: BigInt(210004),
      expiresAt: null as Date | null,
      // Sem categoria de propósito — prova que documentos podem existir sem
      // categoria atribuída (lote-2 — DOC-04).
      categoryKey: null as string | null,
    },
    {
      key: "contrato-padrao",
      name: "Modelo de Contrato Padrão.docx",
      modality: "ambos" as Modality,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: BigInt(88452),
      expiresAt: new Date(Date.UTC(2027, 0, 1)),
      categoryKey: "contratos" as string | null,
    },
  ].map((d) => ({ ...d, key: `${tenantKey}:${d.key}` }));
}

export async function runSeed(): Promise<void> {
  // Âncora única de "agora" para todo o seed — todas as datas relativas
  // (firstContactAt e derivadas) partem deste instante (design.md — "Duas
  // fontes de agora"; datas espalhadas pelos últimos ~90 dias relativos ao
  // momento do seed, não a uma data absoluta fixa).
  const seedNow = new Date();

  // Monta todas as linhas em memória primeiro; a transação abaixo faz apenas
  // deletes + inserts em lote (poucos round-trips de rede até o Neon, em vez
  // de uma escrita por linha).
  const tenantRows: (typeof tenants.$inferInsert)[] = [];
  const brokerRows: (typeof brokers.$inferInsert)[] = [];
  const categoryRows: (typeof documentCategories.$inferInsert)[] = [];
  const leadRows: (typeof leads.$inferInsert)[] = [];
  const conversationRows: (typeof conversations.$inferInsert)[] = [];
  const messageRows: (typeof messages.$inferInsert)[] = [];
  const documentRows: (typeof documents.$inferInsert)[] = [];

  for (const tenantDef of TENANT_DEFS) {
    const tenantId = id(`tenant:${tenantDef.key}`);
    tenantRows.push({
      id: tenantId,
      name: tenantDef.name,
      agentName: tenantDef.agentName,
      supportedModality: tenantDef.supportedModality,
      baselineLeadsPerMonth: tenantDef.baselineLeadsPerMonth,
      baselineFirstResponseMinutes: tenantDef.baselineFirstResponseMinutes,
      baselineLeadToMeetingPct: tenantDef.baselineLeadToMeetingPct,
    });

    const categoryIds = new Map<string, string>();
    for (const c of CATEGORY_DEFS) {
      const categoryId = id(`category:${tenantDef.key}:${c.key}`);
      categoryIds.set(c.key, categoryId);
      categoryRows.push({
        id: categoryId,
        tenantId,
        name: c.name,
        color: c.color,
      });
    }

    const brokerIds: string[] = [];
    for (const b of tenantDef.brokers) {
      const brokerId = id(`broker:${tenantDef.key}:${b.key}`);
      brokerIds.push(brokerId);
      brokerRows.push({
        id: brokerId,
        tenantId,
        name: b.name,
        phone: b.phone,
        email: b.email,
      });
    }

    const leadDefs = buildLeadDefs(tenantDef.key);

    for (const [i, leadDef] of leadDefs.entries()) {
      const leadId = id(`lead:${tenantDef.key}:${i}`);
      const brokerId = brokerIds[i % brokerIds.length];
      const offsetDays = offsetDaysFor(i, leadDefs.length);
      const firstContactAt = new Date(
        seedNow.getTime() - offsetDays * 86400000
      );
      const firstResponseAt = new Date(firstContactAt.getTime() + 15 * 60000);

      const isQualified = leadDef.status === "qualificado_agendado";
      const isEscalated = leadDef.status === "escalado_humano";
      // Calculada para qualquer lead além de em_qualificacao (usada no
      // conteúdo da conversa mesmo quando não é persistida nas colunas de
      // qualificação — essas só são preenchidas quando isQualified).
      const messageQualification =
        leadDef.status === "em_qualificacao"
          ? null
          : buildQualification(i, leadDef.modality);
      const qualification = isQualified ? messageQualification : null;
      const escalationReason = isEscalated
        ? ESCALATION_REASONS[i % ESCALATION_REASONS.length]
        : null;
      // Só leads qualificado_agendado têm reunião marcada — coerente com o
      // resumo executivo, que só é preenchido no mesmo caso.
      const meetingAt = isQualified
        ? new Date(firstContactAt.getTime() + 3 * 86400000)
        : null;
      // Última atualização do registro = evento mais recente conhecido do
      // lead (reunião marcada, senão a 1ª resposta). Mantém created_at
      // (nascimento do lead) e updated_at coerentes com firstContactAt em
      // vez do "agora" fixo do defaultNow() do schema. meetingAt pode cair
      // no futuro (reunião agendada) — updated_at nunca deve ultrapassar o
      // momento real do seed, senão registros parecem "modificados no
      // futuro" (quebra o invariante de outras camadas de que updatedAt
      // avança a partir de now() em mutações subsequentes).
      const updatedAtCandidate = meetingAt ?? firstResponseAt;
      const updatedAt =
        updatedAtCandidate.getTime() > seedNow.getTime()
          ? seedNow
          : updatedAtCandidate;

      leadRows.push({
        id: leadId,
        tenantId,
        brokerId,
        name: leadDef.name,
        phone: leadDef.phone,
        status: leadDef.status,
        modality: isQualified ? leadDef.modality : null,
        region: qualification?.region ?? null,
        budgetCents: qualification?.budgetCents ?? null,
        propertyType: qualification?.propertyType ?? null,
        purchaseHorizon: qualification?.purchaseHorizon ?? null,
        motivation: qualification?.motivation ?? null,
        creditStatus: qualification?.creditStatus ?? null,
        chainedOperation: qualification?.chainedOperation ?? null,
        executiveSummary: isQualified
          ? buildExecutiveSummary(leadDef.name, leadDef.modality, qualification!)
          : null,
        escalationReason,
        meetingAt,
        meetingAttended: null,
        firstContactAt,
        firstResponseAt,
        createdAt: firstContactAt,
        updatedAt,
      });

      const conversationId = id(`conversation:${tenantDef.key}:${i}`);
      conversationRows.push({
        id: conversationId,
        tenantId,
        leadId,
        createdAt: firstContactAt,
      });

      const msgs = buildMessages(
        leadDef.name,
        tenantDef.agentName,
        tenantDef.name,
        leadDef.modality,
        leadDef.status,
        messageQualification,
        escalationReason
      );
      for (const [mi, m] of msgs.entries()) {
        const messageId = id(`message:${tenantDef.key}:${i}:${mi}`);
        messageRows.push({
          id: messageId,
          tenantId,
          conversationId,
          sender: m.sender,
          content: m.content,
          sentAt: new Date(firstContactAt.getTime() + mi * 60000),
        });
      }
    }

    for (const d of documentDefsFor(tenantDef.key)) {
      const docId = id(`document:${d.key}`);
      documentRows.push({
        id: docId,
        tenantId,
        name: d.name,
        modality: d.modality,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        categoryId: d.categoryKey ? (categoryIds.get(d.categoryKey) ?? null) : null,
        expiresAt: d.expiresAt,
      });
    }
  }

  await db.transaction(async (tx) => {
    // Ordem de delete respeita as FKs (filhos antes dos pais). `documents`
    // referencia `document_categories` (category_id), então precisa ser
    // apagada antes das categorias.
    await tx.delete(messages);
    await tx.delete(conversations);
    await tx.delete(documents);
    await tx.delete(leads);
    await tx.delete(brokers);
    await tx.delete(documentCategories);
    await tx.delete(tenants);

    // Ordem de insert respeita as FKs (pais antes dos filhos).
    // `document_categories` precisa existir antes de `documents`, que
    // referencia `category_id`.
    await tx.insert(tenants).values(tenantRows);
    await tx.insert(brokers).values(brokerRows);
    await tx.insert(documentCategories).values(categoryRows);
    await tx.insert(leads).values(leadRows);
    await tx.insert(conversations).values(conversationRows);
    await tx.insert(messages).values(messageRows);
    await tx.insert(documents).values(documentRows);
  });
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  runSeed()
    .then(() => {
      console.log("Seed concluído.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Erro ao rodar seed:", err);
      process.exit(1);
    });
}
