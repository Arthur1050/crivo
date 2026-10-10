import "dotenv/config";
import { getViewConfig } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
// AD-044: testes da suíte raiz podem importar de `vitrine/`.
import { imoveis, lojas } from "../../../vitrine/src/db/views";
import { db } from "../index";

async function colunasReais(view: "lojas" | "imoveis"): Promise<string[]> {
  const resultado = await db.execute(sql`
    select column_name from information_schema.columns
    where table_schema = 'vitrine' and table_name = ${view}
    order by ordinal_position`);
  return (resultado.rows as { column_name: string }[]).map((linha) => linha.column_name);
}

// A view vem do `drizzle-orm` instalado em `vitrine/` e `getViewConfig` do da
// raiz: os tipos das duas cópias são nominalmente incompatíveis (AD-044, F13),
// mas o símbolo que ele lê (`Symbol.for("drizzle:ViewBaseConfig")`) é o mesmo.
type VisaoDaRaiz = Parameters<typeof getViewConfig>[0];

function configDaView(view: typeof lojas | typeof imoveis) {
  return getViewConfig(view as unknown as VisaoDaRaiz);
}

function colunasDeclaradas(view: typeof lojas | typeof imoveis): string[] {
  return Object.values(configDaView(view).selectedFields).map(
    (coluna) => (coluna as { name: string }).name
  );
}

describe("L16b T3 — views declaradas na vitrine batem com o banco (VPROJ-02 AC8)", () => {
  afterAll(async () => {
    await db.$client.end();
  });

  it("vitrine.lojas: colunas declaradas = information_schema, nome e ordem", async () => {
    const reais = await colunasReais("lojas");
    expect(reais.length).toBeGreaterThan(0);
    expect(colunasDeclaradas(lojas)).toEqual(reais);
  });

  it("vitrine.imoveis: colunas declaradas = information_schema, nome e ordem", async () => {
    const reais = await colunasReais("imoveis");
    expect(reais.length).toBeGreaterThan(0);
    expect(colunasDeclaradas(imoveis)).toEqual(reais);
  });

  it("as declaradas pertencem ao schema vitrine e têm o nome das views", () => {
    expect(configDaView(lojas)).toMatchObject({ name: "lojas", schema: "vitrine" });
    expect(configDaView(imoveis)).toMatchObject({ name: "imoveis", schema: "vitrine" });
  });
});
