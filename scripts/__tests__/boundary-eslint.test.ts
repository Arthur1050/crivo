import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import config from "../../eslint.config.mjs";

const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config });

async function violations(filePath: string, source: string) {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter((message) => message.ruleId === "no-restricted-imports")
    .map(({ ruleId, severity }) => ({ ruleId, severity }));
}

describe("ESLint da fronteira (BOUND-02)", () => {
  it.each(["@/src/components/chats/message-thread", "../components/chats/message-thread", "@/src/lib/storefront"])("recusa import de app/vertical no núcleo: %s", async (target) => {
    expect(await violations("src/lib/sample.ts", `import '${target}';`)).toEqual([
      { ruleId: "no-restricted-imports", severity: 2 },
    ]);
  });

  // A lista de campos do agente passou a chegar pela faceta de qualificação: não resta exceção de import
  // no núcleo, e o `phase.mjs` que `parsers.ts` importava até a correção do Verifier volta a ser recusado.
  it.each(["@/n8n/verticals/real-estate/src/phase.mjs", "../../../n8n/verticals/real-estate/src/phase.mjs"])("recusa o import do phase.mjs do vertical no núcleo: %s", async (target) => {
    expect(await violations("src/server/integration/parsers.ts", `import '${target}';`)).toEqual([
      { ruleId: "no-restricted-imports", severity: 2 },
    ]);
  });

  it.each(["@/src/components/chats/message-thread", "../../../n8n/verticals/real-estate/src/system-message.mjs"])("mantém a recusa para outro import do vertical ou do app: %s", async (target) => {
    expect(await violations("src/server/integration/parsers.ts", `import '${target}';`)).toEqual([
      { ruleId: "no-restricted-imports", severity: 2 },
    ]);
  });

  it("permite ao vertical importar o núcleo por caminho que sai da pasta app", async () => {
    expect(await violations("app/api/v1/properties/route.ts", "import '../../../../src/server/integration/problem';")).toEqual([]);
  });
});
