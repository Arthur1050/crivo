import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema";
import baseline from "../boundary/schema-baseline.json";
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
    expect(snapshotSchema(schema)).toEqual(baseline);
  });

  it.each(["column", "index", "check", "enum"] as const)("detecta mudança em %s", (change) => {
    expect(snapshotSchema(fixture(change))).not.toEqual(snapshotSchema(fixture()));
  });
});
