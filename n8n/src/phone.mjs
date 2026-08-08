/**
 * Normalização do destinatário de envio no WhatsApp (nono dígito brasileiro).
 *
 * PROBLEMA REAL (execução 354 de `crivo-agente-principal`, confirmado contra
 * duas fontes): o webhook da Meta entrega o contato em `wa_id` no formato
 * LEGADO, sem o nono dígito — `553499532444` (12 dígitos) — enquanto a Cloud
 * API só aceita como destinatário o número atual, com o 9 — `5534999532444`
 * (13 dígitos, o mesmo valor que o painel da Meta usa no campo `to` do curl
 * de exemplo). Enviar o `wa_id` cru resulta em erro 131030 ("Recipient phone
 * number not in allowed list") — ou seja, TODA resposta do agente a um lead
 * brasileiro falha, não só a do número de teste.
 *
 * ESCOPO DELIBERADO: esta função normaliza SÓ o destinatário do envio. O
 * `wa_id` cru continua sendo a chave das Data Tables (`conversa_estado`,
 * `agenda_envios`) e o `externalId` do lead no CRM — mudar essas chaves
 * quebraria o casamento com os eventos recebidos da Meta, que sempre chegam
 * no formato legado.
 *
 * Função pura, sem I/O, sem dependências — roda dentro de um Code node do
 * n8n (sandbox: sem `require`, sem rede).
 */

// Marca do país no formato E.164 sem o "+" (é como o `wa_id` chega da Meta).
const BRAZIL_COUNTRY_CODE = "55";

// Comprimentos brasileiros: 55 + DDD(2) + 8 (formato legado, pré-nono-dígito)
// e 55 + DDD(2) + 9 (formato atual). Só o primeiro precisa de conserto.
const BR_LEGACY_LENGTH = 12;
const BR_DDD_END_INDEX = 4; // fim de "55" + DDD

// Discriminador celular x fixo (Anatel — Plano de Numeração Brasileiro,
// cartilha do nono dígito): o 9 foi acrescentado SÓ aos números do Serviço
// Móvel Pessoal, que no formato legado de 8 dígitos começavam com 6, 7, 8 ou
// 9; a telefonia fixa também tem 8 dígitos, mas começa com 2, 3, 4 ou 5 e
// NUNCA recebeu o nono dígito. Sem esse discriminador, um fixo de 8 dígitos
// gravado como contato viraria um celular inexistente de 9 dígitos.
const BR_MOBILE_LOCAL_PREFIX = /^[6-9]/;

const NON_DIGIT_PATTERN = /\D/g;

/**
 * Converte um `wa_id` da Meta no MSISDN aceito pela Cloud API como
 * destinatário de envio.
 *
 * Regras (nesta ordem):
 * 1. Entrada não-string ou sem nenhum dígito (null/undefined/""/lixo) → `""`.
 *    Devolver string vazia (em vez do valor cru) evita que o nó de envio
 *    mande literalmente "undefined" para a Meta; o envio falha de forma
 *    explícita, que é o comportamento defensivo dos módulos vizinhos
 *    (`normalizeEvent` → null, `detectOptOut` → false).
 * 2. Caracteres não numéricos (`+`, espaço, hífen) são descartados — o
 *    `wa_id` da Meta é sempre só dígitos, mas o valor pode chegar de uma
 *    Data Table preenchida à mão.
 * 3. Número brasileiro (prefixo `55`) no formato legado (12 dígitos) cujo
 *    número local começa com 6-9 (celular) → insere `9` depois do DDD.
 * 4. Qualquer outro caso — brasileiro já com 13 dígitos, fixo brasileiro de
 *    8 dígitos locais, número de outro país, comprimento inesperado — volta
 *    inalterado. Nenhuma regra de outro país é inventada aqui.
 *
 * Idempotente por construção: o resultado da regra 3 tem 13 dígitos e cai na
 * regra 4 numa segunda aplicação.
 *
 * @param {unknown} waId - `wa_id` do contato no evento da Meta
 * @returns {string} MSISDN pronto para `recipientPhoneNumber`
 */
export function toWhatsAppMsisdn(waId) {
  if (typeof waId !== "string") return "";

  const digits = waId.replace(NON_DIGIT_PATTERN, "");
  if (digits === "") return "";

  if (!digits.startsWith(BRAZIL_COUNTRY_CODE)) return digits;
  if (digits.length !== BR_LEGACY_LENGTH) return digits;

  const ddd = digits.slice(0, BR_DDD_END_INDEX);
  const local = digits.slice(BR_DDD_END_INDEX);
  if (!BR_MOBILE_LOCAL_PREFIX.test(local)) return digits;

  return `${ddd}9${local}`;
}
