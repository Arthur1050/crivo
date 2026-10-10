import { bigint, boolean, integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";
import type { Fonte, Layout } from "../contrato";

/**
 * As duas views públicas do schema `vitrine` (AD-040), declaradas como
 * existentes: a vitrine nunca cria nem altera nada, e o papel `crivo_vitrine`
 * só tem `SELECT` nelas. Nome e ordem das colunas são os de
 * `COLUNAS_DAS_VIEWS` (contrato.ts); `vitrine-views-paridade.test.ts` os confere
 * contra o banco.
 *
 * `.notNull()` descreve o que a view garante (o corte de visibilidade exige
 * CRECI, razão social e WhatsApp, e os campos do imóvel são obrigatórios na
 * tabela de origem); o Postgres reporta toda coluna de view como anulável.
 */
const vitrine = pgSchema("vitrine");

export const lojas = vitrine
  .view("lojas", {
    slug: text("slug").notNull(),
    nome: text("nome").notNull(),
    logo: text("logo"),
    whatsapp: text("whatsapp").notNull(),
    cidade: text("cidade"),
    uf: text("uf"),
    layout: text("layout").$type<Layout>().notNull(),
    cor: text("cor"),
    fonte: text("fonte").$type<Fonte>().notNull(),
    creci: text("creci").notNull(),
    razaoSocial: text("razao_social").notNull(),
    titulo: text("titulo"),
    sobre: text("sobre"),
    instagram: text("instagram"),
    telefone: text("telefone"),
    endereco: text("endereco"),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull(),
  })
  .existing();

export const imoveis = vitrine
  .view("imoveis", {
    lojaSlug: text("loja_slug").notNull(),
    referencia: text("referencia").notNull(),
    tipo: text("tipo").notNull(),
    modalidade: text("modalidade").notNull(),
    bairro: text("bairro").notNull(),
    cidade: text("cidade").notNull(),
    uf: text("uf").notNull(),
    precoCentavos: bigint("preco_centavos", { mode: "bigint" }).notNull(),
    areaM2: integer("area_m2").notNull(),
    quartos: integer("quartos").notNull(),
    banheiros: integer("banheiros").notNull(),
    vagas: integer("vagas").notNull(),
    descricao: text("descricao"),
    fotos: text("fotos").array(),
    destaque: boolean("destaque").notNull(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull(),
  })
  .existing();

export type Loja = typeof lojas.$inferSelect;
export type Imovel = typeof imoveis.$inferSelect;
