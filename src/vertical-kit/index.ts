import { ROLE, type Role } from "../lib/vocabulary";

export const CORE_RESOURCES = ["dashboard", "pipeline", "chats", "documents", "settings", "users"] as const;
export type CoreResource = (typeof CORE_RESOURCES)[number];
export type Action = "read" | "write";

export interface VerticalBrand {
  name: string;
  problemUrn: string;
  tenantHeader: string;
  alertTag: string;
  tenantNoun: { singular: string; plural: string };
}

export interface VerticalResource {
  name: string;
  permissions: Record<Role, readonly Action[]>;
}

export type ParseResult<T> = { ok: true; dto: T } | { ok: false; detail: string };

// Colunas transitórias do lead, preservadas até a migração física do L18c.
interface QualificationColumnValues {
  modality: string | null;
  region: string | null;
  budgetCents: bigint | null;
  propertyType: string | null;
  purchaseHorizon: string | null;
  motivation: string | null;
  creditStatus: string | null;
  chainedOperation: boolean | null;
}

export const LEAD_QUALIFICATION_FIELDS = [
  "region", "purchaseHorizon", "modality", "propertyType", "motivation",
  "creditStatus", "budgetCents", "chainedOperation",
] as const satisfies readonly (keyof QualificationColumnValues)[];

export type LeadQualificationRow<Row extends QualificationColumnValues = QualificationColumnValues> =
  Pick<Row, (typeof LEAD_QUALIFICATION_FIELDS)[number]>;
export type LeadQualificationColumns = Partial<LeadQualificationRow>;

export type QualificationPatchResult<T> =
  | { ok: true; dto: T }
  | { ok: false; detail: string; beforeCoreText?: true };

export interface QualificationFacet<Q, Wire, Columns extends LeadQualificationColumns = LeadQualificationColumns> {
  parsePatch(json: Record<string, unknown>): QualificationPatchResult<Partial<Q>>;
  serialize(row: LeadQualificationRow): Wire;
  toLeadColumns(qualification: Partial<Q>): Columns;
  promptFacts(row: LeadQualificationRow): Record<string, unknown>;
}

export interface DocumentSegmentsFacet {
  values: readonly string[];
  matches(documentSegment: string, querySegment: string): boolean;
}

export interface Vertical<Q = unknown, Wire = unknown, Columns extends LeadQualificationColumns = LeadQualificationColumns> {
  id: string;
  brand: VerticalBrand;
  resources: readonly VerticalResource[];
  appointments: boolean;
  qualification: QualificationFacet<Q, Wire, Columns> | null;
  documentSegments: DocumentSegmentsFacet | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(field: string): never {
  throw new Error(`Vertical inválido: ${field}.`);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Valida a configuração na carga, antes de qualquer peça consumir o vertical. */
export function defineVertical<V extends Vertical>(vertical: V): V {
  if (!isRecord(vertical)) invalid("vertical");
  if (!nonEmpty(vertical.id)) invalid("id");
  if (!isRecord(vertical.brand)) invalid("brand");
  for (const field of ["name", "problemUrn", "tenantHeader", "alertTag"] as const) {
    if (!nonEmpty(vertical.brand[field])) invalid(`brand.${field}`);
  }
  const { tenantNoun } = vertical.brand;
  if (!isRecord(tenantNoun)) invalid("brand.tenantNoun");
  for (const field of ["singular", "plural"] as const) {
    if (!nonEmpty(tenantNoun[field])) invalid(`brand.tenantNoun.${field}`);
  }
  if (!Array.isArray(vertical.resources)) invalid("resources");
  const names = new Set<string>();
  for (const [index, resource] of vertical.resources.entries()) {
    const field = `resources[${index}]`;
    if (!isRecord(resource) || !nonEmpty(resource.name)) invalid(`${field}.name`);
    if (CORE_RESOURCES.some(name => name === resource.name) || names.has(resource.name)) invalid(`${field}.name`);
    names.add(resource.name);
    if (!isRecord(resource.permissions)) invalid(`${field}.permissions`);
    for (const role of Object.values(ROLE)) {
      const actions = resource.permissions[role];
      if (!Object.hasOwn(resource.permissions, role) || !Array.isArray(actions)
        || actions.some(action => action !== "read" && action !== "write")) invalid(`${field}.permissions.${role}`);
    }
  }
  if (typeof vertical.appointments !== "boolean") invalid("appointments");
  if (vertical.qualification !== null) {
    if (!isRecord(vertical.qualification)) invalid("qualification");
    for (const field of ["parsePatch", "serialize", "toLeadColumns", "promptFacts"] as const) {
      if (typeof vertical.qualification[field] !== "function") invalid(`qualification.${field}`);
    }
  }
  if (vertical.documentSegments !== null) {
    if (!isRecord(vertical.documentSegments)) invalid("documentSegments");
    if (!Array.isArray(vertical.documentSegments.values) || !vertical.documentSegments.values.every(nonEmpty)) invalid("documentSegments.values");
    if (typeof vertical.documentSegments.matches !== "function") invalid("documentSegments.matches");
  }
  return vertical;
}
