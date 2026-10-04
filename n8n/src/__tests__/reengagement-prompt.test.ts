import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PreparationFrame } from "../../../src/server/reengagement/context";
import { reengagementFixtureFrame as frame } from "./reengagement-fixtures";
import { FIELD_LABELS } from "../phase.mjs";
import { buildSystemMessage } from "../system-message.mjs";
import { admitReengagementDocuments, buildReengagementPrompt, REENGAGEMENT_READ_ONLY_TOOLS, validateReengagementText } from "../reengagement-prompt.mjs";

const settings = { agentName: "Marina", realEstateName: "Imóveis Fixture" };

function prepare(input = frame(), ceiling = 100000) {
  const result = buildReengagementPrompt({ frame: input, settings, documentCeilingBytes: ceiling });
  expect(result.ok).toBe(true); if (!result.ok || !result.systemMessage) throw new Error("fixture prompt inválido"); return result;
}
describe("T46 — tarefa proativa pura, sem inbound nem texto substituto", () => {
  it("usa os fatos informados mesmo com pendingField obsoleto e não repergunta", () => {
    const prepared = prepare(); expect(prepared.pendingField).toBe("propertyType");
    expect(prepared.baseSystemMessage).toContain(FIELD_LABELS.propertyType); expect(prepared.systemMessage).toContain('"budgetCents":"0"'); expect(prepared.systemMessage).toContain('"chainedOperation":false');
    expect(prepared.systemMessage).toContain("Não repergunte dados já informados");
  });
  it("atribui nota humana à equipe/system e mantém lead/user e agente/assistant", () => {
    const prepared = prepare(); expect(prepared.history).toEqual([{ role: "user", content: "Quero novo no Centro" }, { role: "system", content: "Mensagem enviada ao lead por Ana, da equipe da imobiliária: Conversamos sobre a região" }, { role: "assistant", content: "Seguimos por aqui" }]);
    expect(prepared.systemMessage).toContain("Nota factual da equipe"); expect(prepared.systemMessage).toContain("Não cite notas internas");
  });
  it("sem pendência real retoma naturalmente; agendamento não inventa qualificação/horário", () => {
    const input = frame(); input.facts.propertyType = "casa"; const prepared = prepare(input); expect(prepared.pendingField).toBeNull(); expect(prepared.systemMessage).toContain("sem inventar pergunta ou pendência");
    input.agent.phase = "agendando"; input.facts.modality = null; expect(prepare(input).pendingField).toBeNull(); expect(prepare(input).systemMessage).toContain("sem inventar horário/reunião ou nova qualificação");
  });
  it("vazio/4096/4097 são discriminados por trim e unidades UTF-16 sem contingência", () => {
    for (const invalid of [null, undefined, 123, "", " \n ", "a".repeat(4097), "😀".repeat(2049)]) expect(validateReengagementText(invalid)).toEqual({ ok: false, code: "invalid-text" });
    expect(validateReengagementText(" " + "a".repeat(4096) + " ")).toEqual({ ok: true, text: "a".repeat(4096) }); expect(validateReengagementText("😀".repeat(2048))).toEqual({ ok: true, text: "😀".repeat(2048) });
  });
  it("histórico contém só falas reais; tarefa permanece instrução de sistema sem inbound sintético", () => {
    const input = frame(), prepared = prepare(input); expect(prepared.history).toHaveLength(input.history.length); expect(prepared.history?.filter((row) => row.role === "user")).toEqual([{ role: "user", content: input.history[0].content }]);
    expect(prepared.systemMessage).toContain('"kind":"system-task"'); expect(prepared.systemMessage).toContain("Não há nova fala do lead"); expect(prepared.prompt).not.toContain(input.history[0].content);
  });
  it("não modifica fatos, perguntados, openingHistory ou mensagens nem com entradas congeladas", () => {
    const input = frame(), before = structuredClone(input); Object.freeze(input.agent.askedFields); Object.freeze(input.agent.openingHistory); Object.freeze(input.agent); Object.freeze(input.facts); input.history.forEach(Object.freeze); Object.freeze(input.history); Object.freeze(input);
    prepare(input); expect(input).toEqual(before);
  });
  it("persona/fase usam exatamente a fonte compartilhada, sem alterar identidade normal", () => {
    const prepared = prepare(), expected = buildSystemMessage({ settings, phase: "qualificando", perguntados: ["modality", "region", "budgetCents", "chainedOperation"], firstTurn: false, now: frame().preparedAt });
    expect(prepared.baseSystemMessage).toBe(expected); expect(prepared.systemMessage?.startsWith(expected)).toBe(true);
    const source = readFileSync(new URL("../reengagement-prompt.mjs", import.meta.url), "utf8"); expect(source).toContain('import { buildSystemMessage } from "./system-message.mjs"'); expect(source).not.toContain("AI_TRANSPARENCY_INSTRUCTION");
  });
  it("mede overhead UTF-8 antes de documentos e desconta teto sem ampliar orçamento", () => {
    const prepared = prepare(), suffix = prepared.systemMessage!.slice(prepared.baseSystemMessage!.length), original = buildSystemMessage({ settings, phase: "qualificando", perguntados: [], firstTurn: false, now: frame().preparedAt });
    const expected = Buffer.byteLength(suffix, "utf8") + Buffer.byteLength(prepared.prompt!, "utf8") + Math.max(0, Buffer.byteLength(prepared.baseSystemMessage!, "utf8") - Buffer.byteLength(original, "utf8"));
    expect(prepared.overheadBytes).toBe(expected); expect(prepared.maxDocumentBytes).toBe(100000 - expected); expect(prepare(frame(), 1).maxDocumentBytes).toBe(0);
    expect(buildReengagementPrompt({ frame: frame(), settings }).maxDocumentBytes).toBe(0);
  });
  it("documento cabe exatamente no orçamento restante ou envelope inteiro é recusado sem corte", () => {
    const envelope = { retrievalMode: "direct", documents: [{ contentMode: "full", content: "Documento íntegro ç😀" }] }, measured = Buffer.byteLength(JSON.stringify(envelope), "utf8"), overhead = prepare().overheadBytes!;
    const prepared = prepare(frame(), overhead + measured); expect(admitReengagementDocuments(prepared, envelope)).toEqual({ ok: true, context: envelope }); expect(admitReengagementDocuments(prepare(frame(), overhead + measured - 1), envelope)).toEqual({ ok: false, code: "context-read-failed" });
    expect(envelope.documents[0].content).toBe("Documento íntegro ç😀"); expect(admitReengagementDocuments(prepared, { retrievalMode: "direct", documents: [{ contentMode: "partial", content: "x" }] }).ok).toBe(false);
  });
  it("contexto inválido e orçamento desconhecido recusam; catálogo contém somente leituras", () => {
    const input = frame(); input.agent.phase = "encerrada" as PreparationFrame["agent"]["phase"]; expect(buildReengagementPrompt({ frame: input }).ok).toBe(false);
    expect(buildReengagementPrompt({ frame: frame(), documentCeilingBytes: NaN }).ok).toBe(false); expect(buildReengagementPrompt({ frame: frame(), documentCeilingBytes: -1 }).ok).toBe(false);
    expect(REENGAGEMENT_READ_ONLY_TOOLS).toEqual(["consultar_documentos", "buscar_imoveis"]); expect(Object.isFrozen(REENGAGEMENT_READ_ONLY_TOOLS)).toBe(true); expect(prepare().systemMessage).toContain("Não registrar qualificação, agendar, escalar, responder/enviar ou alterar memória");
  });
});
