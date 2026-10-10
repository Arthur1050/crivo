import type { Imovel, Loja } from "../db/views";

/**
 * Apresentação dos dados da vitrine (lote-16b — VCAT-01, VITEM-01, VOG-01).
 * Puro: sem `next`, sem I/O, sem importar do CRM (o formato pt-BR é declarado
 * aqui, não lido de `src/lib/format.ts`).
 */

/** `R$ 520.000`: reais inteiros, ponto de milhar, sem centavos (VCAT AC11). */
export function formatarPreco(centavos: bigint): string {
  const reais = centavos / 100n;
  return `R$ ${reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/**
 * Tipos de imóvel do catálogo e o rótulo de cada um. O `Record` quebra a
 * compilação se um tipo daqui for renomeado ou esquecido (L-029);
 * `vitrine-tipos-paridade.test.ts`, na suíte raiz, quebra se o enum do CRM
 * ganhar ou perder um valor.
 */
export const TIPOS_DE_IMOVEL = [
  "casa",
  "apartamento",
  "sobrado",
  "cobertura",
  "terreno",
  "sala_comercial",
  "chacara",
] as const;
export type TipoDeImovel = (typeof TIPOS_DE_IMOVEL)[number];

const ROTULO_DO_TIPO: Record<TipoDeImovel, string> = {
  casa: "Casa",
  apartamento: "Apartamento",
  sobrado: "Sobrado",
  cobertura: "Cobertura",
  terreno: "Terreno",
  sala_comercial: "Sala comercial",
  chacara: "Chácara",
};

/** Rótulo do tipo; um código novo no banco cai num rótulo legível em vez de quebrar a página. */
export function rotuloDoTipo(tipo: string): string {
  if (Object.hasOwn(ROTULO_DO_TIPO, tipo)) return ROTULO_DO_TIPO[tipo as TipoDeImovel];
  const texto = tipo.replace(/_/g, " ").trim();
  return texto === "" ? "Imóvel" : texto.charAt(0).toUpperCase() + texto.slice(1);
}

export const MODALIDADES = ["novo", "usado", "ambos"] as const;
export type Modalidade = (typeof MODALIDADES)[number];

const ROTULO_DA_MODALIDADE: Record<Exclude<Modalidade, "ambos">, string> = {
  novo: "Novo",
  usado: "Usado",
};

/** `ambos` não descreve o imóvel (assumption da spec): sem rótulo. */
export function rotuloDaModalidade(modalidade: string): string | null {
  return Object.hasOwn(ROTULO_DA_MODALIDADE, modalidade)
    ? ROTULO_DA_MODALIDADE[modalidade as keyof typeof ROTULO_DA_MODALIDADE]
    : null;
}

/** `alt` da foto: tipo, bairro e posição (VITEM AC8). */
export function textoAlternativoDaFoto(input: {
  tipo: string;
  bairro: string;
  posicao: number;
  total?: number;
}): string {
  const posicao = input.total ? `foto ${input.posicao} de ${input.total}` : `foto ${input.posicao}`;
  return `${rotuloDoTipo(input.tipo)} em ${input.bairro}, ${posicao}`;
}

export interface MetadadosDeCompartilhamento {
  titulo: string;
  descricao: string;
}

/** Título "<nome> — imóveis"; descrição = título institucional ou "Imóveis disponíveis em <cidade>/<uf>" (VOG AC2). */
export function metadadosDoCatalogo(
  loja: Pick<Loja, "nome" | "titulo" | "cidade" | "uf">
): MetadadosDeCompartilhamento {
  const titulo = `${loja.nome} — imóveis`;
  const institucional = loja.titulo?.trim();
  if (institucional) return { titulo, descricao: institucional };
  const lugar = [loja.cidade?.trim(), loja.uf?.trim()].filter(Boolean).join("/");
  return { titulo, descricao: lugar ? `Imóveis disponíveis em ${lugar}` : "Imóveis disponíveis" };
}

/** Título "<Tipo> em <bairro> — <REF>"; descrição "<quartos> quartos · <área> m² · <preço>" (VOG AC3). */
export function metadadosDoItem(
  imovel: Pick<Imovel, "tipo" | "bairro" | "referencia" | "quartos" | "areaM2" | "precoCentavos">
): MetadadosDeCompartilhamento {
  return {
    titulo: `${rotuloDoTipo(imovel.tipo)} em ${imovel.bairro} — ${imovel.referencia.toUpperCase()}`,
    descricao: `${imovel.quartos} quartos · ${imovel.areaM2} m² · ${formatarPreco(imovel.precoCentavos)}`,
  };
}

/**
 * Atributos do card do catálogo (VCAT AC6): "3 quartos · 2 banheiros · 1 vaga ·
 * 120 m²". Singular só para 1; zero fica no plural ("0 vagas"), como se fala.
 */
export function resumoDosAtributos(
  imovel: Pick<Imovel, "quartos" | "banheiros" | "vagas" | "areaM2">
): string {
  const contar = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;
  return [
    contar(imovel.quartos, "quarto", "quartos"),
    contar(imovel.banheiros, "banheiro", "banheiros"),
    contar(imovel.vagas, "vaga", "vagas"),
    `${imovel.areaM2} m²`,
  ].join(" · ");
}

