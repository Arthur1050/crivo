import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deriveBenchmarkIdentity,
  extractMemoryWindow,
  extractModelId,
  extractToolCatalog,
} from "../benchmark-identity";

const principal = readFileSync("n8n/workflows/principal.ts", "utf8");
const modules = ["business-hours.mjs", "phase.mjs", "system-message.mjs"].map((file) =>
  readFileSync(`n8n/src/${file}`, "utf8")
);

describe("benchmark identity (lote-12 T34)", () => {
  // Estas três leituras ancoram a identidade no agente real: se `principal.ts`
  // mudar de forma que a extração quebre, o teste falha em vez de o benchmark
  // gravar uma identidade vazia.
  it("lê o snapshot datado do modelo do agente publicado", () => {
    expect(extractModelId(principal)).toBe("gpt-5.4-nano-2026-03-17");
  });

  it("lê a janela de memória do agente", () => {
    expect(extractMemoryWindow(principal)).toBe(50);
  });

  it("o catálogo inclui as seis tools com descrição e parâmetros do modelo", () => {
    const catalog = extractToolCatalog(principal);
    for (const name of ["registrar_qualificacao", "escalar_para_humano", "consultar_documentos", "buscar_imoveis", "responder_lead", "agendar_reuniao"]) {
      expect(catalog).toContain(name);
    }
    expect(catalog).toContain("campo=");
    expect(catalog).toContain("quartosMin=");
    expect(catalog).toContain("mensagem=");
  });

  it("é determinística e independe de fim de linha", () => {
    const a = deriveBenchmarkIdentity({ principalSource: principal, systemMessageSources: modules, workflowVersion: "v1" });
    const b = deriveBenchmarkIdentity({
      // `\r?\n`: o arquivo pode já estar com CRLF; `\n` puro geraria `\r\r\n`.
      principalSource: principal.replace(/\r?\n/g, "\r\n"),
      systemMessageSources: modules.map((m) => m.replace(/\r?\n/g, "\r\n")),
      workflowVersion: "v1",
    });
    expect(b).toEqual(a);
  });

  it("mudar a descrição de uma tool muda o hash do catálogo e nada mais", () => {
    const base = deriveBenchmarkIdentity({ principalSource: principal, systemMessageSources: modules, workflowVersion: "v1" });
    const changed = deriveBenchmarkIdentity({
      principalSource: principal.replace("ÚNICA forma de enviar mensagem", "Forma de enviar mensagem"),
      systemMessageSources: modules,
      workflowVersion: "v1",
    });
    expect(changed.toolsHash).not.toBe(base.toolsHash);
    expect({ ...changed, toolsHash: base.toolsHash }).toEqual(base);
  });

  it("mudar o texto do system message muda só o hash dele", () => {
    const base = deriveBenchmarkIdentity({ principalSource: principal, systemMessageSources: modules, workflowVersion: "v1" });
    const changed = deriveBenchmarkIdentity({
      principalSource: principal,
      systemMessageSources: [...modules.slice(0, 2), `${modules[2]}\n// mudança`],
      workflowVersion: "v1",
    });
    expect(changed.systemMessageHash).not.toBe(base.systemMessageHash);
    expect(changed.toolsHash).toBe(base.toolsHash);
  });

  it("fonte sem o nó de modelo é recusada, nunca vira identidade vazia", () => {
    expect(() => extractModelId("export default {}")).toThrow(/Modelo/);
  });
});
