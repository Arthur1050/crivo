import { enumValue, optionalNullableField, parseBudgetCents } from "../../lib/patch-fields";
import type { LeadQualificationRow, QualificationPatchResult } from "../../vertical-kit";
import { CREDIT_STATUS, MODALITY, MOTIVATION, PROPERTY_TYPE } from "./vocabulary";

const enumField = <T extends string>(values: Record<string, T>) => {
  const allowed = Object.values(values);
  return {
    parse: (raw: unknown) => enumValue(raw, allowed),
    message: `inválido. Valores aceitos: ${allowed.join(", ")}.`,
  };
};

const stringField = {
  parse: (raw: unknown) => typeof raw === "string" ? raw.trim() : undefined,
  message: "deve ser uma string.",
};

const fields = {
  region: stringField,
  purchaseHorizon: stringField,
  modality: enumField(MODALITY),
  propertyType: enumField(PROPERTY_TYPE),
  motivation: enumField(MOTIVATION),
  creditStatus: enumField(CREDIT_STATUS),
  budgetCents: { parse: parseBudgetCents, message: "deve ser um inteiro maior ou igual a 0." },
  chainedOperation: {
    parse: (raw: unknown) => typeof raw === "boolean" ? raw : undefined,
    message: "deve ser booleano.",
  },
};

type Qualification = {
  [Field in keyof typeof fields]?: Exclude<ReturnType<(typeof fields)[Field]["parse"]>, undefined> | null;
};

function parsePatch(json: Record<string, unknown>): QualificationPatchResult<Qualification> {
  const dto: Qualification = {};
  for (const [field, { parse, message }] of Object.entries(fields)) {
    const outcome = optionalNullableField<string | bigint | boolean>(json, field, parse);
    if (!outcome.present) continue;
    if (!outcome.ok) return {
      ok: false,
      detail: `Campo '${field}' ${message}`,
      ...(parse === stringField.parse ? { beforeCoreText: true } : {}),
    };
    Object.assign(dto, { [field]: outcome.value });
  }
  return { ok: true, dto };
}

function serialize(row: LeadQualificationRow) {
  return {
    modality: row.modality,
    region: row.region,
    budgetCents: row.budgetCents === null ? null : row.budgetCents.toString(),
    propertyType: row.propertyType,
    purchaseHorizon: row.purchaseHorizon,
    motivation: row.motivation,
    creditStatus: row.creditStatus,
    chainedOperation: row.chainedOperation,
  };
}

export const qualification = {
  parsePatch,
  serialize,
  toLeadColumns: (patch: Qualification) => patch,
  promptFacts: serialize,
};
