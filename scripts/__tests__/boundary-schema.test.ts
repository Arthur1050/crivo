import { getTableColumns, sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema";
import * as realEstateSchema from "../../src/verticals/real-estate/schema";
import { LEAD_QUALIFICATION_FIELDS } from "../../src/vertical-kit";
import { qualification } from "../../src/verticals/real-estate/qualification";
import baseline from "../boundary/schema-baseline.json";
import transitional from "../boundary/transitional.json";
import { snapshotSchema } from "../boundary/schema-snapshot";

function fixture(change?: "column" | "index" | "check" | "enum") {
  const state = pgEnum("sample_state", change === "enum" ? ["open", "closed"] : ["open"]);
  const records = pgTable("sample", {
    id: integer("id").primaryKey(),
    name: change === "column" ? integer("name") : text("name"),
    state: state("state"),
  }, (table) => [
    index("sample_name_idx").on(change === "index" ? table.id : table.name),
    check("sample_id_check", change === "check" ? sql`${table.id} >= 0` : sql`${table.id} > 0`),
  ]);
  return { state, records };
}

describe("foto do schema (KEEP-03)", () => {
  it("preserva o conjunto de tabelas, colunas, tipos, índices, checks e enums da base", () => {
    expect(snapshotSchema({ ...schema, ...realEstateSchema })).toEqual(baseline);
  });

  it.each(["column", "index", "check", "enum"] as const)("detecta mudança em %s", (change) => {
    expect(snapshotSchema(fixture(change))).not.toEqual(snapshotSchema(fixture()));
  });
});

it("registra as colunas e os enums transitórios da qualificação até o L18c (QUAL-01, BOUND-04)", () => {
  const columns = getTableColumns(schema.leads);
  const enums = [schema.modalityEnum, schema.propertyTypeEnum, schema.motivationEnum, schema.creditStatusEnum];
  expect(LEAD_QUALIFICATION_FIELDS).toHaveLength(8);
  expect(enums.map((item) => item.enumName)).toEqual(["modality", "property_type", "motivation", "credit_status"]);
  const terms = [
    ...LEAD_QUALIFICATION_FIELDS.map((field) => `column:leads.${columns[field].name}`),
    ...enums.map((item) => `enum:${item.enumName}`),
  ];
  expect(transitional.filter((item) => /^(column|enum):/.test(item.term)).map(({ path, term, removedIn, category }) =>
    ({ path, term, removedIn, category }))).toEqual(terms.map((term) => ({ path: "src/db/schema.ts", term, removedIn: "L18c", category: "stored" })));
});

it("mantém a lista gravada da restrição de asked_fields igual à faceta da imobiliária até o L18c (KEEP-03, BOUND-04)", () => {
  const { tables } = snapshotSchema(schema) as { tables: Record<string, { checkConstraints: Record<string, { value: string }> }> };
  const { value } = tables["public.lead_agent_state"].checkConstraints.lead_agent_state_asked_fields;
  expect(value).toBe(`cardinality("lead_agent_state"."asked_fields") <= 8 and "lead_agent_state"."asked_fields" <@ ARRAY[${
    qualification.agentFields.map((field) => `'${field}'`).join(", ")}]::text[]`);
  expect(transitional.filter((item) => item.term.startsWith("check:")).map(({ path, term, removedIn, category }) => ({ path, term, removedIn, category })))
    .toEqual([{ path: "src/db/schema.ts", term: "check:lead_agent_state_asked_fields", removedIn: "L18c", category: "stored" }]);
});
