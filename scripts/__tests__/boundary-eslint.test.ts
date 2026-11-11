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

  // A T43 reclassificou `scripts/preview-message-pricing.tsx` como app; a exceção de import que resta no núcleo
  // é a de `phase.mjs` (`n8n-modules`, até o L18c), em `src/server/integration/parsers.ts`.
  it.each(["@/n8n/verticals/real-estate/src/phase.mjs", "../../../n8n/verticals/real-estate/src/phase.mjs"])("respeita a exceção de transição: %s", async (target) => {
    expect(await violations("src/server/integration/parsers.ts", `import '${target}';`)).toEqual([]);
  });

  it.each(["@/src/components/chats/message-thread", "../../../n8n/verticals/real-estate/src/system-message.mjs"])("mantém a recusa para outro import no arquivo com exceção: %s", async (target) => {
    expect(await violations("src/server/integration/parsers.ts", `import '${target}';`)).toEqual([
      { ruleId: "no-restricted-imports", severity: 2 },
    ]);
  });

  it("permite ao vertical importar o núcleo por caminho que sai da pasta app", async () => {
    expect(await violations("app/api/v1/properties/route.ts", "import '../../../../src/server/integration/problem';")).toEqual([]);
  });
});
