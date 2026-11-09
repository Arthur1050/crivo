import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testVertical } from "../../src/vertical-kit/__tests__/fixture-vertical";
import { DEFAULT_GENERATED_DIR, DEFAULT_SRC_DIR, generateAll } from "../n8n-inline.mjs";

type Node = {
  name: string;
  parameters: { url?: string; jsCode?: string; workflowJson?: string };
};
type Graph = {
  nodes: Node[];
  connections: Record<string, Record<string, { node: string }[][]>>;
};

const fixtureUrl = "https://crm.fixture.example/api/v1";
const fixtureTenant = "tenant-fixture";
const fixtureTable = "fixture-conversation-state";
const fixtureCatalog = "buscar_recursos";
const reminder = "Data Table: lembretes devidos (agenda_envios)";
const scheduleTool = "agendar_reuniao";
const requireFromTest = createRequire(import.meta.url);

let root: string;
let output: string;

function resourceTool(symbol: string, name: string) {
  return `const ${symbol} = tool({
    type: "n8n-nodes-base.httpRequestTool", version: 4.5,
    config: { name: "${name}", position: [0, 0], parameters: {
      method: "GET", url: CRM_BASE_URL + "/resources", toolDescription: "Consulta recursos disponíveis."
    } }
  });\n`;
}

function writeFixture() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "krivo-agent-fixture-"));
  output = path.join(root, "generated");
  const verticalsDir = path.join(root, "verticals");
  const directory = path.join(verticalsDir, testVertical.id);
  const blocks = {
    "qualification-tool": "",
    "escalation-tool": "",
    "documents-tool": "",
    "search-catalog-tool": resourceTool("fixtureCatalogTool", fixtureCatalog),
    "agent-tools-list": "      tools: [fixtureCatalogTool, responderLeadTool],\n",
    "reengagement-documents-tool": "",
    "reengagement-catalog-tool": resourceTool("fixtureReadonlyTool", "consultar_recursos"),
    "reengagement-read-validation": `    "if (steps.some(step => !REENGAGEMENT_READ_ONLY_TOOLS.includes(step?.action?.tool) || !Array.isArray(step?.observation?.resources))) return { json: { ok: false, code: 'context-read-failed' } };\\n" +
`,
    "reengagement-agent": `const agent = node({
      type: "@n8n/n8n-nodes-langchain.agent", version: 3.1,
      config: { name: "Agente proativo somente leitura", position: [980, 0],
        parameters: { promptType: "define" }, subnodes: { model, tools: [fixtureReadonlyTool] } }
    });\n`,
    "reengagement-tool-node-ids": '  "consultar_recursos", "OpenAI Chat Model", "Agente proativo somente leitura", "Code: validar texto e leituras",\n',
  };
  const sharedModule = (file: string) => fs.readFileSync(path.join(DEFAULT_SRC_DIR, file), "utf8");
  const modules = {
    "phase.mjs": 'export const resolveConversationPhase = () => "fechando";\nexport const nextFieldToAsk = () => null;\n',
    "system-message.mjs": 'export const buildSystemMessage = () => "Você atende o tenant de teste.";\n',
    "reengagement-prompt.mjs": `export const buildReengagementPrompt = () => ({
      ok: true, systemMessage: "Atenda o tenant de teste.", prompt: "Retome o contato.", overheadBytes: 0
    });
    export const REENGAGEMENT_READ_ONLY_TOOLS = ["consultar_recursos"];
    export const validateReengagementText = (text) => ({ ok: typeof text === "string", text });\n`,
    "fixture-gate.mjs": sharedModule("gate.mjs")
      .replace("é uma frase sobre o imóvel", "é uma frase sobre o assunto"),
    "fixture-session.mjs": sharedModule("session.mjs")
      .replace("com a atribuição ao corretor", "com a atribuição ao autor")
      .replace("da equipe da imobiliária", "da equipe do tenant"),
    "fixture-voice.mjs": `export const checkOpening = () => ({ ok: true });
    export const checkCapabilityPromise = () => ({ ok: true });
    export const extractOpening = (text) => text;\n`,
  };
  const agent = {
    id: testVertical.id,
    appointments: testVertical.appointments,
    values: {
      crmBaseUrl: fixtureUrl,
      sampleTenantSlug: fixtureTenant,
      sampleTenantName: testVertical.brand.name,
      conversationStateTableId: fixtureTable,
      tenantConfigTableId: "fixture-tenant-config",
      respondToLeadWorkflowId: "fixture-respond-to-lead",
      projectId: "fixture-project",
      archivedQualificationWorkflowId: "fixture-archived-workflow",
      gateModule: "fixture-gate.mjs",
      sessionModule: "fixture-session.mjs",
      voiceModule: "fixture-voice.mjs",
    },
    blocks: Object.keys(blocks),
    workflows: ["erros", "principal", "reengagement-contextual", "scheduler", "smoke-memoria", "smoke-reset", "tool-responder-lead"],
  };
  fs.mkdirSync(path.join(directory, "blocks"), { recursive: true });
  fs.mkdirSync(path.join(directory, "src"));
  fs.writeFileSync(path.join(directory, "agent.mjs"), "export const agent = " + JSON.stringify(agent));
  for (const [name, text] of Object.entries(blocks)) {
    fs.writeFileSync(path.join(directory, "blocks", name + ".ts"), text);
  }
  for (const [name, text] of Object.entries(modules)) {
    fs.writeFileSync(path.join(directory, "src", name), text);
  }
  generateAll({ vertical: testVertical.id, verticalsDir, generatedDir: output });
}

function loadWorkflow(name: string, directory = output) {
  const source = fs.readFileSync(path.join(directory, name + ".ts"), "utf8");
  const { outputText } = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  });
  const exports: { default?: { toJSON(): Graph } } = {};
  const requireFromFixture = (specifier: string) => {
    if (specifier === "../generated/reengagement-contextual") {
      return { default: loadWorkflow("reengagement-contextual", directory) };
    }
    return requireFromTest(specifier);
  };
  new Function("exports", "require", outputText)(exports, requireFromFixture);
  if (!exports.default) throw new Error(`Workflow de teste ausente: ${name}`);
  return exports.default;
}

function targets(graph: Graph, node: string, connection: string) {
  return graph.connections[node]?.[connection]?.flat().map((target) => target.node) ?? [];
}

function graphNode(graph: Graph, name: string) {
  const node = graph.nodes.find((candidate) => candidate.name === name);
  if (!node) throw new Error(`Nó de teste ausente: ${name}`);
  return node;
}

describe("agente gerado para outro vertical", () => {
  beforeAll(writeFixture);
  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("liga a ferramenta e os dados do vertical ao agente gerado", () => {
    const graph = loadWorkflow("principal").toJSON();
    expect(targets(graph, fixtureCatalog, "ai_tool")).toEqual(["AI Agent"]);
    expect(graphNode(graph, fixtureCatalog).parameters.url).toBe(fixtureUrl + "/resources");
    expect(graphNode(graph, "Data Table: conversa_estado (antes do buffer)").parameters).toMatchObject({
      dataTableId: { value: fixtureTable },
    });
    expect(graphNode(graph, "Code: montar system message e marcar campo perguntado").parameters.jsCode)
      .toContain("Você atende o tenant de teste.");
    expect(fs.readFileSync(path.join(output, "principal.ts"), "utf8")).toContain(fixtureTenant);
  });

  it("remove o workflow, a ferramenta e o ramo de agendamento quando a chave está desligada", () => {
    const names = fs.readdirSync(output);
    expect(names).not.toContain("tool-agendar-reuniao.ts");
    expect(names).not.toContain("benchmark-contexto.ts");
    const graph = loadWorkflow("principal").toJSON();
    expect(graph.nodes.map((node) => node.name)).not.toContain(scheduleTool);
    expect(targets(graph, scheduleTool, "ai_tool")).toEqual([]);
    expect(targets(loadWorkflow("principal", DEFAULT_GENERATED_DIR).toJSON(), scheduleTool, "ai_tool")).toEqual(["AI Agent"]);

    const schedule = loadWorkflow("scheduler").toJSON();
    const real = loadWorkflow("scheduler", DEFAULT_GENERATED_DIR).toJSON();
    const realTargets = targets(real, "A cada 1h", "main");
    expect(realTargets).toContain(reminder);
    expect(targets(schedule, "A cada 1h", "main")).toEqual(realTargets.filter((name) => name !== reminder));
    expect(schedule.nodes.map((node) => node.name)).not.toContain(reminder);
  });

  it("não leva vocabulário da imobiliária aos nós, inclusive no workflow proativo embutido", () => {
    const workflows = fs.readdirSync(output);
    expect(workflows).toHaveLength(7);
    for (const filename of workflows) {
      const graph = loadWorkflow(path.basename(filename, ".ts")).toJSON();
      const marketTerms = graph.nodes.flatMap((node) => {
        const term = /im[oó]ve|imobili|corretor|buscar_imoveis/i.exec(JSON.stringify(node))?.[0];
        return term ? [`${node.name}: ${term}`] : [];
      });
      expect(marketTerms, filename).toEqual([]);
    }
    const schedule = loadWorkflow("scheduler").toJSON();
    const embedded = JSON.parse(graphNode(schedule, "Executar: geração B readonly").parameters.workflowJson ?? "") as Graph;
    expect(targets(embedded, "consultar_recursos", "ai_tool")).toEqual(["Agente proativo somente leitura"]);
    expect(graphNode(embedded, "consultar_recursos").parameters.url).toBe(fixtureUrl + "/resources");
  });
});
