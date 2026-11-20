/**
 * Corpus sintético do benchmark de teto de contexto (lote-12 — T34, DOCLIM-01).
 *
 * Roda em dois lugares: inlined no Code node do workflow de benchmark, onde
 * gera o corpus de cada faixa sem que o corpus trafegue pela entrada da
 * execução, e no vitest, onde se prova que o envelope que ele serializa é
 * byte a byte o que `buildCanonicalContext` do CRM produziria para os mesmos
 * documentos. Essa igualdade é o que torna a faixa medida aqui comparável ao
 * teto que a admissão aplica lá.
 *
 * Determinístico: a mesma `seed` produz os mesmos documentos, fatos, histórico
 * e bytes — condição para o benchmark ser reproduzível.
 *
 * Os três fatos ficam no início do primeiro documento, no meio do documento
 * central e no fim do último, porque perda de informação em contexto longo
 * costuma ser posicional. Os documentos dos fatos têm modalidade `ambos`, para
 * participarem das três consultas.
 */

const MODALITIES_CYCLE = ["novo", "usado", "ambos"];

const FILLER = [
  "A imobiliária atende de segunda a sexta em horário comercial e aos sábados pela manhã, com plantão em lançamentos.",
  "Toda proposta de compra é registrada por escrito e encaminhada ao proprietário em até dois dias úteis.",
  "O sinal de negócio é devolvido integralmente quando o financiamento é negado pelo banco dentro do prazo acordado.",
  "Vistorias de entrada e saída são feitas com registro fotográfico e assinatura das duas partes.",
  "Imóveis na planta seguem o memorial descritivo aprovado pela construtora e registrado em cartório.",
  "A comissão de intermediação é paga pelo vendedor, salvo acordo diferente registrado no contrato.",
  "Documentos pessoais do comprador são solicitados apenas depois da aceitação formal da proposta.",
  "Para imóveis usados, a certidão de matrícula atualizada é conferida antes da assinatura do compromisso.",
  "Visitas acompanhadas são agendadas com pelo menos quatro horas de antecedência para confirmação do proprietário.",
  "Reformas combinadas antes da entrega das chaves precisam constar em aditivo contratual assinado.",
  "O condomínio informa a previsão de despesas extraordinárias na assembleia anual, registrada em ata.",
  "Imóveis com pendência de averbação só são anunciados depois da regularização documental.",
  "O corretor responsável acompanha o cliente desde a primeira visita até a assinatura da escritura.",
  "Financiamentos pelo sistema habitacional exigem avaliação do imóvel feita por engenheiro do banco.",
  "Chaves de imóveis desocupados ficam guardadas na sede e só saem com registro de retirada.",
  "Laudos de vistoria técnica ficam disponíveis para consulta do comprador durante toda a negociação.",
];

export const BENCHMARK_FACTS_TEMPLATE = [
  { position: "inicio", subject: "código de vistoria do Edifício Aurora Austral", prefix: "VST-" },
  { position: "meio", subject: "taxa do fundo de reserva do Residencial Ipê Branco", prefix: "" },
  { position: "fim", subject: "prazo de devolução das chaves do Condomínio Vila Serena Alta", prefix: "" },
];

/** PRNG mulberry32: pequeno, determinístico e sem dependência. */
function prng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(next, length) {
  let out = "";
  for (let i = 0; i < length; i += 1) out += Math.floor(next() * 16).toString(16);
  return out;
}

function syntheticUuid(next) {
  return `${hex(next, 8)}-${hex(next, 4)}-4${hex(next, 3)}-8${hex(next, 3)}-${hex(next, 12)}`;
}

function paragraph(next, sentences) {
  const parts = [];
  for (let i = 0; i < sentences; i += 1) parts.push(FILLER[Math.floor(next() * FILLER.length)]);
  return parts.join(" ");
}

/** Fatos com valores derivados da seed: únicos por rodada, verificáveis na resposta. */
export function buildBenchmarkFacts(seed) {
  const next = prng(seed * 7919 + 17);
  const codigo = `VST-${10000 + Math.floor(next() * 89999)}`;
  const taxa = `${1 + Math.floor(next() * 8)},${10 + Math.floor(next() * 89)}%`;
  const prazo = `${3 + Math.floor(next() * 40)} dias úteis`;
  return [
    { ...BENCHMARK_FACTS_TEMPLATE[0], value: codigo, sentence: `O ${BENCHMARK_FACTS_TEMPLATE[0].subject} é ${codigo}.` },
    { ...BENCHMARK_FACTS_TEMPLATE[1], value: taxa, sentence: `A ${BENCHMARK_FACTS_TEMPLATE[1].subject} é de ${taxa} ao mês.` },
    { ...BENCHMARK_FACTS_TEMPLATE[2], value: prazo, sentence: `O ${BENCHMARK_FACTS_TEMPLATE[2].subject} é de ${prazo} após a rescisão.` },
  ];
}

/**
 * Serializa exatamente como `JSON.stringify(buildCanonicalContext(documents, modality))`:
 * ordem por `uploadedAt` e desempate por `id`, filtro de compatibilidade de
 * modalidade e a mesma ordem de chaves. `uploadedAt` é ISO string aqui.
 */
export function serializeBenchmarkEnvelope(documents, modality) {
  const applies = (document) =>
    modality === "ambos" || document.modality === "ambos" || document.modality === modality;
  const sorted = [...documents].sort(
    (left, right) =>
      Date.parse(left.uploadedAt) - Date.parse(right.uploadedAt) || left.id.localeCompare(right.id)
  );
  return JSON.stringify({
    retrievalMode: "direct",
    documents: sorted.filter(applies).map((document) => ({
      id: document.id,
      name: document.name,
      modality: document.modality,
      category: document.category ?? null,
      contentMode: "full",
      content: document.content,
    })),
  });
}

function utf8Bytes(text) {
  // O sandbox do Code node nem sempre expõe TextEncoder; Buffer cobre esse caso.
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  return Buffer.byteLength(text, "utf8");
}

/**
 * Gera documentos até o envelope da `modality` alcançar `targetBytes`. Faixa
 * zero devolve envelope vazio: mede o custo fixo (prompt, tools, histórico).
 */
export function buildBenchmarkCorpus({ targetBytes, modality, seed = 1, documentBytes = 8000 }) {
  const next = prng(seed);
  const facts = buildBenchmarkFacts(seed);
  const base = Date.parse("2026-01-01T12:00:00.000Z");
  const documents = [];

  if (targetBytes > 0) {
    let index = 0;
    while (utf8Bytes(serializeBenchmarkEnvelope(documents, modality)) < targetBytes) {
      let content = "";
      while (utf8Bytes(content) < documentBytes) content += (content ? "\n\n" : "") + paragraph(next, 6);
      documents.push({
        id: syntheticUuid(next),
        name: `politica-sintetica-${String(index + 1).padStart(3, "0")}.md`,
        modality: MODALITIES_CYCLE[index % MODALITIES_CYCLE.length],
        category: null,
        uploadedAt: new Date(base + index * 60_000).toISOString(),
        content,
      });
      index += 1;
    }

    // Os fatos entram depois do corpus pronto, nas posições fixas; os
    // documentos que os carregam passam a `ambos` para valer nas três consultas.
    const first = documents[0];
    const middle = documents[Math.floor(documents.length / 2)];
    const last = documents[documents.length - 1];
    first.modality = "ambos";
    middle.modality = "ambos";
    last.modality = "ambos";
    first.content = `${facts[0].sentence}\n\n${first.content}`;
    const cut = Math.floor(middle.content.length / 2);
    middle.content = `${middle.content.slice(0, cut)}\n\n${facts[1].sentence}\n\n${middle.content.slice(cut)}`;
    last.content = `${last.content}\n\n${facts[2].sentence}`;
  }

  const envelope = serializeBenchmarkEnvelope(documents, modality);
  return { documents, facts, envelope, envelopeBytes: utf8Bytes(envelope) };
}

/** Histórico sintético de `count` mensagens alternadas, sem nenhum dos fatos. */
export function buildBenchmarkHistory(count = 50, seed = 1) {
  const next = prng(seed * 31 + 7);
  const leadTurns = [
    "Oi, vi um anúncio de vocês e queria saber mais sobre apartamentos.",
    "Estou procurando algo com dois quartos, perto do centro.",
    "Meu orçamento é até uns 450 mil, dá pra ver o que tem?",
    "Prefiro prédio com portaria e vaga de garagem.",
    "Ainda estou pesquisando, sem pressa, mas queria visitar alguns.",
    "Vocês trabalham com imóvel usado também ou só lançamento?",
  ];
  const agentTurns = [
    "Claro! Me conta um pouco do que você procura que eu te ajudo a filtrar.",
    "Entendi, dois quartos perto do centro. Você prefere apartamento ou casa?",
    "Beleza, com esse orçamento tem algumas opções boas. Qual bairro você curte mais?",
    "Anotado: portaria e garagem. Mais alguma coisa que não pode faltar?",
    "Sem problema, dá pra ir com calma. Quer que eu separe umas opções pra visitar?",
    "Trabalhamos com os dois, novo e usado. Tem preferência?",
  ];
  const messages = [];
  for (let i = 0; i < count; i += 1) {
    const pool = i % 2 === 0 ? leadTurns : agentTurns;
    messages.push({ type: i % 2 === 0 ? "user" : "ai", message: pool[Math.floor(next() * pool.length)] });
  }
  return messages;
}

/** Pergunta que exige os três fatos: só um documento consultado responde. */
export function buildBenchmarkQuestion(facts) {
  return (
    "Antes de fechar, me confirma três coisas das regras de vocês: " +
    `qual é o ${facts[0].subject}, qual é a ${facts[1].subject} e qual é o ${facts[2].subject}?`
  );
}
