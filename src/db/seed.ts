import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { db } from "./index";
import {
  conversations,
  documentCategories,
  documents,
  leads,
  messages,
  properties,
  serviceApiKeys,
  tenant_members,
  tenantApiKeys,
  tenants,
  users,
} from "./schema";
import { normalizeForSearch } from "../lib/normalize-text";

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
// 1:1 com os enums do catálogo de imóveis (lote-11 — schema.ts).
type PropertyKind =
  | "casa"
  | "apartamento"
  | "sobrado"
  | "cobertura"
  | "terreno"
  | "sala_comercial"
  | "chacara";
type PropertyStatus = "disponivel" | "reservado" | "vendido";

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

interface PropertyCatalogDef {
  key: string;
  kind: PropertyKind;
  modality: Modality;
  status: PropertyStatus;
  published: boolean;
  neighborhood: string;
  priceCents: bigint;
  areaSqm: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpots: number;
}

// lote-11 — SEEDIM-01: as 4 combinações de status × publicação necessárias
// para exercitar o corte de visibilidade (`disponivel`+publicado é o único
// caso visível ao contrato — IMOV-05 AC3). `PROPERTY_TYPES` acima é a enum de
// QUALIFICAÇÃO (2 valores, inalterada); `kind` aqui é a enum PRÓPRIA do
// catálogo (7 valores, design.md — Data Models) — as duas nunca se
// confundem.
const PROPERTY_CATALOG_DEFS: PropertyCatalogDef[] = [
  {
    key: "disponivel-publicado",
    kind: "apartamento",
    modality: "novo",
    status: "disponivel",
    published: true,
    neighborhood: REGIONS[0],
    priceCents: BigInt(380000 * 100),
    areaSqm: 72,
    bedrooms: 2,
    bathrooms: 2,
    parkingSpots: 1,
  },
  {
    key: "disponivel-nao-publicado",
    kind: "casa",
    modality: "usado",
    status: "disponivel",
    published: false,
    neighborhood: REGIONS[1],
    priceCents: BigInt(520000 * 100),
    areaSqm: 140,
    bedrooms: 3,
    bathrooms: 2,
    parkingSpots: 2,
  },
  {
    key: "reservado",
    kind: "cobertura",
    modality: "novo",
    status: "reservado",
    published: true,
    neighborhood: REGIONS[2],
    priceCents: BigInt(890000 * 100),
    areaSqm: 180,
    bedrooms: 4,
    bathrooms: 3,
    parkingSpots: 3,
  },
  {
    key: "vendido",
    kind: "sobrado",
    modality: "usado",
    status: "vendido",
    published: false,
    neighborhood: REGIONS[3],
    priceCents: BigInt(610000 * 100),
    areaSqm: 160,
    bedrooms: 3,
    bathrooms: 3,
    parkingSpots: 2,
  },
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
  // Identificador legível único do tenant (lote-7 — SEC-01/REAL-01),
  // persistido em `tenants.slug`. Igual a `key` por convenção — os dois já
  // nomeiam o mesmo tenant no seed, e `key` já era usado como semente de
  // `id()`, então reaproveitar evita um segundo identificador redundante.
  slug: string;
  name: string;
  agentName: string;
  supportedModality: Modality;
  // Baseline pré-piloto (Lote 4 — DASH-05; lote-9 — BASE-01). Nullable nos
  // cinco campos, para os três tenants: o baseline é um snapshot único
  // preenchido por quem tem `configuracoes:escrever`, nunca inventado pelo
  // seed (design.md — Risks: "Seed escreve baseline mockado num tenant").
  // Preenchê-lo é sempre ato do usuário, inclusive no tenant de demonstração.
  baselineLeadsPerMonth: number | null;
  baselineFirstResponseMinutes: number | null;
  baselineLeadToMeetingPct: number | null;
  baselineEscalationPct: number | null;
  baselineAttendancePct: number | null;
  // Identidade institucional (redesign-crm-astryx — RD-02): valores distintos
  // entre os tenants, para que a troca de tenant no shell seja visível.
  city: string;
  state: string;
  agentWhatsapp: string;
  website: string;
  agentPresentationMessage: string;
  // Tom de voz e personalidade (lote-6b — PER-03): texto livre distinto por
  // tenant, mesmo padrão de identidade opcional dos demais campos acima.
  agentVoiceTone: string;
  // Equipe da imobiliária (lote-8 — SEED-01): usuários com vínculo em
  // `tenant_members`. `role` é o formato nativo do plugin (papéis acumulados
  // separados por vírgula). A janela de trabalho é por vínculo — só corretor
  // tem, e é ela que a atribuição por agenda consome (`workDays` em ISO
  // 1(segunda)-7(domingo), horas `HH:MM` em America/Sao_Paulo).
  members: {
    key: string;
    name: string;
    email: string;
    role: string;
    workDays?: number[];
    workHoursStart?: string;
    workHoursEnd?: string;
  }[];
  // lote-7 — REAL-01: só o tenant de demonstração recebe leads, conversas e
  // mensagens fictícios. Os tenants-piloto mantêm toda a configuração
  // (corretores, categorias, documentos, chave de API) mas nascem sem
  // nenhum lead — o dado real vem só do agente, pelo contrato.
  seedLeadData: boolean;
}

// Janelas de trabalho dos corretores do seed (lote-8 — SEED-01 AC2). São
// deliberadamente DIFERENTES entre si e deixam faixas cobertas por um único
// corretor, que é o insumo dos testes de atribuição por agenda:
//   - seg-sex 08:00-13:00 → só o corretor da manhã
//   - seg-sex 14:00-19:00 → só o corretor da tarde
//   - sábado               → só o corretor de fim de semana
// Dias em ISO 1(segunda)-7(domingo), horas "HH:MM" em America/Sao_Paulo —
// mesma convenção de `tenants.meetingDays`.
const MORNING_WINDOW = {
  workDays: [1, 2, 3, 4, 5],
  workHoursStart: "08:00",
  workHoursEnd: "14:00",
};
const AFTERNOON_WINDOW = {
  workDays: [1, 2, 3, 4, 5],
  workHoursStart: "13:00",
  workHoursEnd: "19:00",
};
const SATURDAY_WINDOW = {
  workDays: [6],
  workHoursStart: "09:00",
  workHoursEnd: "13:00",
};

const TENANT_DEFS: TenantDef[] = [
  {
    key: "vale-uberaba",
    slug: "vale-uberaba",
    name: "Imobiliária Vale do Uberaba",
    agentName: "Bia",
    supportedModality: "ambos",
    baselineLeadsPerMonth: null,
    baselineFirstResponseMinutes: null,
    baselineLeadToMeetingPct: null,
    baselineEscalationPct: null,
    baselineAttendancePct: null,
    seedLeadData: false,
    city: "Uberaba",
    state: "MG",
    agentWhatsapp: "+55 34 99100-0001",
    website: "https://valeuberaba.com.br",
    // lote-6b — PER-01 AC6: apresenta nome + imobiliária, sem "assistente
    // virtual"/"agente virtual"/"robô"/"IA"/"automatizado".
    agentPresentationMessage:
      "Olá! Aqui é a Bia, da Imobiliária Vale do Uberaba. Posso te ajudar a encontrar o imóvel ideal — me conta o que você procura?",
    agentVoiceTone:
      "Tom acolhedor e paciente, como quem já viu de tudo no mercado e gosta de explicar com calma. Usa expressões como \"olha só\" e \"deixa eu te explicar\" de vez em quando — nunca formal demais.",
    members: [
      {
        key: "admin",
        name: "Helena Braga Teixeira",
        email: "helena.teixeira@valeuberaba.com.br",
        role: "administrador",
      },
      {
        key: "gestor",
        name: "Paulo César Miranda",
        email: "paulo.miranda@valeuberaba.com.br",
        role: "gestor",
      },
      {
        key: "b1",
        name: "Marcos Aurélio Silva",
        email: "marcos.silva@valeuberaba.com.br",
        role: "corretor",
        ...MORNING_WINDOW,
      },
      {
        key: "b2",
        name: "Camila Fernandes Rocha",
        email: "camila.rocha@valeuberaba.com.br",
        role: "corretor",
        ...AFTERNOON_WINDOW,
      },
      {
        key: "b3",
        name: "Rodrigo Almeida Costa",
        email: "rodrigo.costa@valeuberaba.com.br",
        role: "corretor",
        ...SATURDAY_WINDOW,
      },
    ],
  },
  {
    key: "triangulo",
    slug: "triangulo",
    name: "Triângulo Imóveis",
    agentName: "Lucas",
    supportedModality: "ambos",
    baselineLeadsPerMonth: null,
    baselineFirstResponseMinutes: null,
    baselineLeadToMeetingPct: null,
    baselineEscalationPct: null,
    baselineAttendancePct: null,
    seedLeadData: false,
    city: "Uberlândia",
    state: "MG",
    agentWhatsapp: "+55 34 99200-0002",
    website: "https://trianguloimoveis.com.br",
    // lote-6b — PER-01 AC6: apresenta nome + imobiliária, sem "assistente
    // virtual"/"agente virtual"/"robô"/"IA"/"automatizado".
    agentPresentationMessage:
      "Oi! Sou o Lucas, da Triângulo Imóveis. Me conta qual imóvel você procura que eu te ajudo a chegar na melhor opção.",
    agentVoiceTone:
      "Tom direto e descontraído, frases curtas, gosta de confirmar rápido e seguir andando na conversa. Usa \"boa\" e \"show\" pra reagir ao que o lead conta.",
    members: [
      {
        key: "admin",
        name: "Renata Alves Bittencourt",
        email: "renata.bittencourt@trianguloimoveis.com.br",
        role: "administrador",
      },
      {
        key: "gestor",
        name: "Sérgio Tavares Pinto",
        email: "sergio.pinto@trianguloimoveis.com.br",
        role: "gestor",
      },
      {
        key: "b1",
        name: "Fernanda Souza Lima",
        email: "fernanda.lima@trianguloimoveis.com.br",
        role: "corretor",
        ...MORNING_WINDOW,
      },
      {
        key: "b2",
        name: "André Luiz Martins",
        email: "andre.martins@trianguloimoveis.com.br",
        role: "corretor",
        ...AFTERNOON_WINDOW,
      },
      {
        key: "b3",
        name: "Juliana Pereira Dias",
        email: "juliana.dias@trianguloimoveis.com.br",
        role: "corretor",
        ...SATURDAY_WINDOW,
      },
    ],
  },
  // lote-7 — REAL-01: tenant só de demonstração comercial. É o único que
  // recebe o dataset fictício rico (leads/conversas/mensagens/baseline) —
  // os dois tenants-piloto acima operam só com dado real a partir daqui.
  {
    key: "crivo-demo",
    slug: "crivo-demo",
    name: "Crivo Demo",
    agentName: "Sofia",
    supportedModality: "ambos",
    baselineLeadsPerMonth: null,
    baselineFirstResponseMinutes: null,
    baselineLeadToMeetingPct: null,
    baselineEscalationPct: null,
    baselineAttendancePct: null,
    seedLeadData: true,
    city: "Belo Horizonte",
    state: "MG",
    agentWhatsapp: "+55 31 99300-0003",
    website: "https://crivo.com.br",
    // lote-6b — PER-01 AC6: apresenta nome + imobiliária, sem "assistente
    // virtual"/"agente virtual"/"robô"/"IA"/"automatizado".
    agentPresentationMessage:
      "Oi! Aqui é a Sofia, da Crivo Demo. Me conta o que você procura que eu já vejo o que temos disponível pra você.",
    agentVoiceTone:
      "Tom entusiasmado e prestativo, sempre disposto a detalhar as opções. Usa \"legal\" e \"perfeito\" para confirmar o que o lead conta.",
    members: [
      {
        key: "admin",
        name: "Eduardo Mendes Prado",
        email: "eduardo.prado@crivo.com.br",
        role: "administrador",
      },
      {
        key: "gestor",
        name: "Patrícia Nogueira Vasques",
        email: "patricia.vasques@crivo.com.br",
        role: "gestor",
      },
      {
        key: "b1",
        name: "Larissa Andrade Nunes",
        email: "larissa.nunes@crivo.com.br",
        role: "corretor",
        ...MORNING_WINDOW,
      },
      {
        key: "b2",
        name: "Gustavo Ribeiro Cardoso",
        email: "gustavo.cardoso@crivo.com.br",
        role: "corretor",
        ...AFTERNOON_WINDOW,
      },
      {
        key: "b3",
        name: "Beatriz Moraes Correia",
        email: "beatriz.correia@crivo.com.br",
        role: "corretor",
        ...SATURDAY_WINDOW,
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
      content: `Olá, ${leadName}! Aqui é ${agentName}, da ${tenantName}. Vi seu interesse em imóveis — posso te ajudar a encontrar a opção ideal?`,
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
    {
      // Documento expirado (lote-5 — LGPD-02): data absoluta e fixa no
      // passado, sempre expirada em qualquer momento em que o seed rodar —
      // torna o TTL demonstrável por tenant sem depender do job já ter
      // rodado (spec.md, LGPD-02 AC2).
      key: "tabela-precos-expirada",
      name: "Tabela de Preços 2019 (Descontinuada).pdf",
      modality: "ambos" as Modality,
      mimeType: "application/pdf",
      sizeBytes: BigInt(153200),
      expiresAt: new Date(Date.UTC(2020, 0, 1)),
      categoryKey: "tabelas-precos" as string | null,
    },
  ].map((d) => ({ ...d, key: `${tenantKey}:${d.key}` }));
}

/**
 * Gera uma chave de API opaca (64 chars hex, alta entropia) e seu hash
 * sha256 — mesmo algoritmo que `src/server/integration/auth.ts` (T2) usa
 * para resolver o tenant a partir do header `Authorization`. Diferente de
 * `id()` acima, a chave NÃO é determinística: cada `db:seed` gera (e
 * imprime) um valor novo, invalidando o anterior — comportamento aceito e
 * documentado (design.md — Risks: "Reseed rotaciona as chaves").
 */
function generateApiKey(): { key: string; hash: string } {
  const key = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(key).digest("hex");
  return { key, hash };
}

/** Chave em claro gerada para um tenant — só existe em memória (retorno de
 * `runSeed`); nunca persistida (design.md — Data Models). */
export interface SeededApiKey {
  tenantId: string;
  tenantName: string;
  key: string;
}

export interface SeedResult {
  apiKeys: SeededApiKey[];
  // Chave de serviço do agente (lote-7 — SEC-01): única, cross-tenant, mesmo
  // tratamento das chaves por tenant acima — só existe em claro aqui, o
  // banco guarda só o hash (service_api_keys). Reseed gera (e imprime) uma
  // chave nova, invalidando a anterior — mesmo comportamento documentado das
  // chaves por tenant.
  serviceApiKey: string;
}

export async function runSeed(): Promise<SeedResult> {
  // Âncora única de "agora" para todo o seed — todas as datas relativas
  // (firstContactAt e derivadas) partem deste instante (design.md — "Duas
  // fontes de agora"; datas espalhadas pelos últimos ~90 dias relativos ao
  // momento do seed, não a uma data absoluta fixa).
  const seedNow = new Date();

  // Monta todas as linhas em memória primeiro; a transação abaixo faz apenas
  // deletes + inserts em lote (poucos round-trips de rede até o Neon, em vez
  // de uma escrita por linha).
  const tenantRows: (typeof tenants.$inferInsert)[] = [];
  const userRows: (typeof users.$inferInsert)[] = [];
  const memberRows: (typeof tenant_members.$inferInsert)[] = [];
  const categoryRows: (typeof documentCategories.$inferInsert)[] = [];
  const leadRows: (typeof leads.$inferInsert)[] = [];
  const conversationRows: (typeof conversations.$inferInsert)[] = [];
  const messageRows: (typeof messages.$inferInsert)[] = [];
  const documentRows: (typeof documents.$inferInsert)[] = [];
  const apiKeyRows: (typeof tenantApiKeys.$inferInsert)[] = [];
  const propertyRows: (typeof properties.$inferInsert)[] = [];
  const seededApiKeys: SeededApiKey[] = [];

  // Chave de serviço do agente (lote-7 — SEC-01): gerada UMA vez, fora do
  // loop de tenants — é deliberadamente cross-tenant (schema.ts), então não
  // faz sentido uma por tenant. Mesmo gerador não-determinístico das chaves
  // por tenant (generateApiKey) — reseed rotaciona.
  const { key: serviceApiKey, hash: serviceApiKeyHash } = generateApiKey();

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
      baselineEscalationPct: tenantDef.baselineEscalationPct,
      baselineAttendancePct: tenantDef.baselineAttendancePct,
      city: tenantDef.city,
      state: tenantDef.state,
      agentWhatsapp: tenantDef.agentWhatsapp,
      website: tenantDef.website,
      agentPresentationMessage: tenantDef.agentPresentationMessage,
      agentVoiceTone: tenantDef.agentVoiceTone,
      slug: tenantDef.slug,
    });

    // Chave de API do tenant (lote-5 — INT-01): gerada a cada execução do
    // seed (não determinística como `id()` acima — ver `generateApiKey`),
    // valor em claro só sobrevive no retorno de `runSeed`, nunca em disco.
    const { key: apiKey, hash: apiKeyHash } = generateApiKey();
    apiKeyRows.push({
      tenantId,
      label: "Seed — piloto",
      keyHash: apiKeyHash,
    });
    seededApiKeys.push({ tenantId, tenantName: tenantDef.name, key: apiKey });

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

    // lote-8 (AD-021/SEED-01): corretor é sempre um usuário. A tabela
    // `brokers` saiu do schema — cada membro da equipe vira uma linha em
    // `users` mais um vínculo em `tenant_members` com papel e (para corretor)
    // janela de trabalho. Todos nascem SEM linha em `accounts`, portanto sem
    // senha: é o estado de convite pendente, que já é elegível a receber lead
    // e reunião (SEED-01 AC3/AC4). O administrador com credencial vem do
    // comando de bootstrap (`npm run db:create-admin`), nunca daqui.
    const brokerIds: string[] = [];
    for (const m of tenantDef.members) {
      const userId = id(`user:${tenantDef.key}:${m.key}`);
      if (m.role.split(",").includes("corretor")) brokerIds.push(userId);
      userRows.push({
        id: userId,
        name: m.name,
        email: m.email,
      });
      memberRows.push({
        id: id(`member:${tenantDef.key}:${m.key}`),
        organizationId: tenantId,
        userId,
        role: m.role,
        workDays: m.workDays ?? null,
        workHoursStart: m.workHoursStart ?? null,
        workHoursEnd: m.workHoursEnd ?? null,
      });
    }

    // lote-11 — SEEDIM-01: bloco de imóveis por imobiliária, com captador
    // sempre entre os corretores ativos DAQUELA imobiliária (`brokerIds`,
    // construído acima) — nunca um usuário de outro tenant. `sequence`/
    // `reference` nascem no próprio seed (não passam por `createProperty`),
    // então são atribuídos aqui na mesma disciplina da DAL (`IM-000N`).
    // Determinístico: mesma `tenantDef.key` + mesma `def.key` sempre geram o
    // mesmo `id()`, o que é o que faz duas execuções produzirem o mesmo
    // conjunto (AC 1.3 — idempotência, mesmo padrão de tenants/users/leads).
    for (const [i, def] of PROPERTY_CATALOG_DEFS.entries()) {
      const propertyId = id(`property:${tenantDef.key}:${def.key}`);
      const capturedByUserId = brokerIds[i % brokerIds.length];
      propertyRows.push({
        id: propertyId,
        tenantId,
        capturedByUserId,
        sequence: i + 1,
        reference: `IM-${String(i + 1).padStart(4, "0")}`,
        kind: def.kind,
        modality: def.modality,
        status: def.status,
        published: def.published,
        neighborhood: def.neighborhood,
        neighborhoodNormalized: normalizeForSearch(def.neighborhood),
        city: tenantDef.city,
        cityNormalized: normalizeForSearch(tenantDef.city),
        state: tenantDef.state,
        priceCents: def.priceCents,
        areaSqm: def.areaSqm,
        bedrooms: def.bedrooms,
        bathrooms: def.bathrooms,
        parkingSpots: def.parkingSpots,
      });
    }

    // lote-7 — REAL-01: só o tenant de demonstração recebe lead/conversa/
    // mensagem fictícios. Os tenants-piloto nascem com toda a configuração
    // acima (corretores/categorias/chave), mas zero linhas aqui.
    if (tenantDef.seedLeadData) {
      const leadDefs = buildLeadDefs(tenantDef.key);

      for (const [i, leadDef] of leadDefs.entries()) {
        const leadId = id(`lead:${tenantDef.key}:${i}`);
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
        // lote-8 (AD-022/SEED-01 AC7): o lead só ganha dono no agendamento.
        // Todo lead do seed nasce sem responsável, exceto os que já nascem
        // com reunião marcada — esses recebem um corretor, distribuído de
        // forma determinística entre os corretores da imobiliária.
        const assignedUserId =
          meetingAt && brokerIds.length > 0
            ? brokerIds[i % brokerIds.length]
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
          assignedUserId,
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
    // apagada antes das categorias. `tenant_api_keys` referencia `tenants`,
    // então precisa ser apagada antes dos tenants também.
    await tx.delete(messages);
    await tx.delete(conversations);
    await tx.delete(documents);
    await tx.delete(leads);
    // `properties.captured_by_user_id`/`tenant_id` também não têm cascata
    // (lote-11 — restrict implícito, T3), mesma razão de `leads` acima: vem
    // ANTES de `tenant_members`/`tenants`/`users`.
    await tx.delete(properties);
    await tx.delete(documentCategories);
    await tx.delete(tenantApiKeys);
    // service_api_keys não referencia tenants (sem FK — schema.ts), mas
    // segue o mesmo tratamento de delete-and-insert das demais chaves.
    await tx.delete(serviceApiKeys);
    // `tenant_members` e `tenant_invitations` têm FK em cascata para
    // `tenants`, mas `users` não: apagar os vínculos e os usuários é
    // explícito, e vem DEPOIS de `leads` (que referencia `users` por
    // `assigned_user_id`, sem cascata) e ANTES de `tenants`.
    await tx.delete(tenant_members);
    await tx.delete(tenants);
    await tx.delete(users);

    // Ordem de insert respeita as FKs (pais antes dos filhos).
    // `document_categories` precisa existir antes de `documents`, que
    // referencia `category_id`.
    await tx.insert(tenants).values(tenantRows);
    await tx.insert(users).values(userRows);
    await tx.insert(tenant_members).values(memberRows);
    // `properties` referencia `tenants`/`users`, ambos já inseridos acima.
    await tx.insert(properties).values(propertyRows);
    await tx.insert(documentCategories).values(categoryRows);
    await tx.insert(leads).values(leadRows);
    await tx.insert(conversations).values(conversationRows);
    await tx.insert(messages).values(messageRows);
    await tx.insert(documents).values(documentRows);
    await tx.insert(tenantApiKeys).values(apiKeyRows);
    await tx.insert(serviceApiKeys).values({
      label: "Seed — agente n8n",
      keyHash: serviceApiKeyHash,
    });
  });

  return { apiKeys: seededApiKeys, serviceApiKey };
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  runSeed()
    .then(({ apiKeys, serviceApiKey }) => {
      console.log("Seed concluído.");
      // Único momento em que a chave em claro existe fora do processo do
      // agente que a usa — o banco só guarda o hash (design.md — Risks:
      // "Chaves de API impressas no output do seed"). Reseed gera (e
      // imprime) chaves novas, invalidando as anteriores.
      console.log(
        "\nChaves de API por tenant (mostradas uma única vez — guarde em local seguro):"
      );
      for (const { tenantName, key } of apiKeys) {
        console.log(`  ${tenantName}: ${key}`);
      }
      // Chave de serviço do agente (lote-7 — SEC-01): mesmo tratamento
      // acima, mostrada uma única vez.
      console.log(
        `\nChave de serviço do agente (mostrada uma única vez — guarde em local seguro):\n  ${serviceApiKey}`
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("Erro ao rodar seed:", err);
      process.exit(1);
    });
}
