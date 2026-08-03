/**
 * Parsers puros payload→DTO da API de integração (design.md —
 * `src/server/integration/parsers.ts`). Sem I/O, sem dependências externas —
 * mesmo padrão `ValidationResult` de `src/server/validation.ts`, adaptado
 * para devolver o DTO tipado junto do resultado (`{ ok: true; dto }`), já
 * que aqui o parser produz o dado, não só o valida.
 *
 * Enums são 1:1 com o schema: lidos direto de `db/schema.ts`
 * (`enumValues`), nunca duplicados como listas literais — se o schema
 * ganhar um valor novo, o parser acompanha automaticamente.
 */
import {
  creditStatusEnum,
  leadStatusEnum,
  modalityEnum,
  motivationEnum,
  propertyTypeEnum,
  senderEnum,
} from "../../db/schema";

// Limite de tamanho de corpo (design.md — Tech Decisions; Edge Cases: 413).
// O corte em si é responsabilidade do handler (Content-Length/tamanho do
// texto lido) — este módulo só exporta o número acordado no contrato.
export const MAX_BODY_BYTES = 100 * 1024;

export type ParseResult<T> =
  | { ok: true; dto: T }
  | { ok: false; detail: string };

type LeadStatus = (typeof leadStatusEnum.enumValues)[number];
type Modality = (typeof modalityEnum.enumValues)[number];
type PropertyType = (typeof propertyTypeEnum.enumValues)[number];
type MotivationValue = (typeof motivationEnum.enumValues)[number];
type CreditStatus = (typeof creditStatusEnum.enumValues)[number];
type Sender = (typeof senderEnum.enumValues)[number];

// ISO-8601 completo (data + hora + timezone) — as 3 datas do contrato
// (firstContactAt, sentAt, meetingAt) representam um instante, não um dia
// (coerente com as colunas `timestamptz` do schema).
const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

function parseIsoDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !ISO_DATETIME_PATTERN.test(value)) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Inteiro ≥ 0, aceito como `number` ou `string` numérica — gravado bigint
 * (bigint não é serializável em JSON, então nunca chega como tal). */
function parseBudgetCents(value: unknown): bigint | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? BigInt(value) : undefined;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyTrimmed(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

// ---- POST /api/v1/leads -------------------------------------------------

export interface LeadCreateDto {
  name: string;
  phone: string;
  externalId: string;
  firstContactAt: Date;
}

export function parseLeadCreate(json: unknown): ParseResult<LeadCreateDto> {
  if (!isPlainObject(json)) {
    return { ok: false, detail: "Corpo da requisição deve ser um objeto JSON." };
  }

  const name = nonEmptyTrimmed(json.name);
  if (!name) return { ok: false, detail: "Campo 'name' é obrigatório." };

  const phone = nonEmptyTrimmed(json.phone);
  if (!phone) return { ok: false, detail: "Campo 'phone' é obrigatório." };

  const externalId = nonEmptyTrimmed(json.externalId);
  if (!externalId) {
    return { ok: false, detail: "Campo 'externalId' é obrigatório." };
  }

  const firstContactAt = parseIsoDate(json.firstContactAt);
  if (!firstContactAt) {
    return {
      ok: false,
      detail: "Campo 'firstContactAt' é obrigatório e deve ser uma data ISO-8601 válida.",
    };
  }

  return { ok: true, dto: { name, phone, externalId, firstContactAt } };
}

// ---- PATCH /api/v1/leads/{id} -------------------------------------------

export interface LeadPatchDto {
  // NOT NULL no schema — presente precisa ser um valor válido do enum,
  // nunca `null` (diferente dos demais campos, todos nullable).
  status?: LeadStatus;
  modality?: Modality | null;
  region?: string | null;
  budgetCents?: bigint | null;
  propertyType?: PropertyType | null;
  purchaseHorizon?: string | null;
  motivation?: MotivationValue | null;
  creditStatus?: CreditStatus | null;
  chainedOperation?: boolean | null;
  executiveSummary?: string | null;
  escalationReason?: string | null;
  meetingAt?: Date | null;
}

/**
 * Resolve um campo opcional-e-anulável do patch: chave ausente no JSON →
 * `{ present: false }` (dto não ganha a chave — coluna intocada, padrão
 * SPG-1); `null` explícito → `{ present: true, ok: true, value: null }`
 * (limpa a coluna); valor presente → validado por `parseValue` (`undefined`
 * de `parseValue` sinaliza formato inválido).
 */
function optionalNullableField<T>(
  body: Record<string, unknown>,
  key: string,
  parseValue: (raw: unknown) => T | undefined
):
  | { present: false }
  | { present: true; ok: true; value: T | null }
  | { present: true; ok: false } {
  if (!(key in body)) return { present: false };
  const raw = body[key];
  if (raw === null) return { present: true, ok: true, value: null };
  const parsed = parseValue(raw);
  return parsed === undefined
    ? { present: true, ok: false }
    : { present: true, ok: true, value: parsed };
}

export function parseLeadPatch(json: unknown): ParseResult<LeadPatchDto> {
  if (!isPlainObject(json)) {
    return { ok: false, detail: "Corpo da requisição deve ser um objeto JSON." };
  }

  const dto: LeadPatchDto = {};

  // `status` não aceita `null` explícito — coluna NOT NULL no schema.
  if ("status" in json) {
    const status = enumValue(json.status, leadStatusEnum.enumValues);
    if (!status) {
      return {
        ok: false,
        detail: `Campo 'status' inválido. Valores aceitos: ${leadStatusEnum.enumValues.join(", ")}.`,
      };
    }
    dto.status = status;
  }

  const stringFields: (keyof LeadPatchDto)[] = [
    "region",
    "purchaseHorizon",
    "executiveSummary",
    "escalationReason",
  ];
  for (const field of stringFields) {
    const outcome = optionalNullableField(json, field, (raw) =>
      typeof raw === "string" ? raw.trim() : undefined
    );
    if (!outcome.present) continue;
    if (!outcome.ok) {
      return { ok: false, detail: `Campo '${field}' deve ser uma string.` };
    }
    (dto[field] as string | null | undefined) = outcome.value;
  }

  const enumFields: {
    field: keyof LeadPatchDto;
    allowed: readonly string[];
  }[] = [
    { field: "modality", allowed: modalityEnum.enumValues },
    { field: "propertyType", allowed: propertyTypeEnum.enumValues },
    { field: "motivation", allowed: motivationEnum.enumValues },
    { field: "creditStatus", allowed: creditStatusEnum.enumValues },
  ];
  for (const { field, allowed } of enumFields) {
    const outcome = optionalNullableField(json, field, (raw) =>
      enumValue(raw, allowed)
    );
    if (!outcome.present) continue;
    if (!outcome.ok) {
      return {
        ok: false,
        detail: `Campo '${field}' inválido. Valores aceitos: ${allowed.join(", ")}.`,
      };
    }
    (dto[field] as string | null | undefined) = outcome.value;
  }

  const budgetOutcome = optionalNullableField(json, "budgetCents", parseBudgetCents);
  if (budgetOutcome.present) {
    if (!budgetOutcome.ok) {
      return {
        ok: false,
        detail: "Campo 'budgetCents' deve ser um inteiro maior ou igual a 0.",
      };
    }
    dto.budgetCents = budgetOutcome.value;
  }

  const chainedOutcome = optionalNullableField(json, "chainedOperation", (raw) =>
    typeof raw === "boolean" ? raw : undefined
  );
  if (chainedOutcome.present) {
    if (!chainedOutcome.ok) {
      return { ok: false, detail: "Campo 'chainedOperation' deve ser booleano." };
    }
    dto.chainedOperation = chainedOutcome.value;
  }

  const meetingAtOutcome = optionalNullableField(json, "meetingAt", parseIsoDate);
  if (meetingAtOutcome.present) {
    if (!meetingAtOutcome.ok) {
      return {
        ok: false,
        detail: "Campo 'meetingAt' deve ser uma data ISO-8601 válida.",
      };
    }
    dto.meetingAt = meetingAtOutcome.value;
  }

  return { ok: true, dto };
}

// ---- POST /api/v1/leads/{id}/messages -----------------------------------

export interface MessageCreateDto {
  externalId: string;
  sender: Sender;
  content: string;
  sentAt: Date;
}

export function parseMessageCreate(json: unknown): ParseResult<MessageCreateDto> {
  if (!isPlainObject(json)) {
    return { ok: false, detail: "Corpo da requisição deve ser um objeto JSON." };
  }

  const externalId = nonEmptyTrimmed(json.externalId);
  if (!externalId) {
    return { ok: false, detail: "Campo 'externalId' é obrigatório." };
  }

  const sender = enumValue(json.sender, senderEnum.enumValues);
  if (!sender) {
    return {
      ok: false,
      detail: `Campo 'sender' inválido. Valores aceitos: ${senderEnum.enumValues.join(", ")}.`,
    };
  }

  const content = nonEmptyTrimmed(json.content);
  if (!content) return { ok: false, detail: "Campo 'content' é obrigatório." };

  const sentAt = parseIsoDate(json.sentAt);
  if (!sentAt) {
    return {
      ok: false,
      detail: "Campo 'sentAt' é obrigatório e deve ser uma data ISO-8601 válida.",
    };
  }

  return { ok: true, dto: { externalId, sender, content, sentAt } };
}
