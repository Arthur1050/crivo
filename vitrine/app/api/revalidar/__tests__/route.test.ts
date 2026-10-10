import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));

import { DELETE, GET, PATCH, POST, PUT } from "../route";

const SEGREDO = "s3gredo-de-revalidacao-0123456789";

function pedido(corpo: string, cabecalhos: Record<string, string> = {}, metodo = "POST") {
  return new Request("http://vitrine.test/api/revalidar", {
    method: metodo,
    headers: { "content-type": "application/json", ...cabecalhos },
    body: metodo === "GET" || metodo === "HEAD" ? undefined : corpo,
  });
}

const comSegredo = { authorization: `Bearer ${SEGREDO}` };

describe("L16b T12 — POST /api/revalidar (VCACHE-02)", () => {
  let logs: string[];

  beforeEach(() => {
    vi.stubEnv("VITRINE_REVALIDATE_SECRET", SEGREDO);
    mocks.revalidateTag.mockClear();
    logs = [];
    for (const nivel of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, nivel).mockImplementation((...partes: unknown[]) => {
        logs.push(partes.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" "));
      });
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("AC3: segredo e slug válidos → 204 e uma chamada com a tag da loja e { expire: 0 }", async () => {
    const resposta = await POST(pedido('{"slug":"loja-a"}', comSegredo));
    expect(resposta.status).toBe(204);
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("tenant:loja-a:catalogo", { expire: 0 });
  });

  it("AC3: revalidar a loja A não invalida a tag da B", async () => {
    await POST(pedido('{"slug":"loja-a"}', comSegredo));
    const tags = mocks.revalidateTag.mock.calls.map((chamada) => chamada[0]);
    expect(tags).toEqual(["tenant:loja-a:catalogo"]);
  });

  it("AC4: sem segredo, com segredo errado ou sem Bearer → 401 e nenhuma revalidação", async () => {
    for (const cabecalhos of [{}, { authorization: "Bearer errado" }, { authorization: SEGREDO }]) {
      const resposta = await POST(pedido('{"slug":"loja-a"}', cabecalhos));
      expect(resposta.status, JSON.stringify(cabecalhos)).toBe(401);
    }
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("AC4: VITRINE_REVALIDATE_SECRET vazio ou ausente → 401 mesmo com cabeçalho igual", async () => {
    for (const configurado of ["", "   "]) {
      vi.stubEnv("VITRINE_REVALIDATE_SECRET", configurado);
      const resposta = await POST(pedido('{"slug":"loja-a"}', { authorization: `Bearer ${configurado}` }));
      expect(resposta.status, JSON.stringify(configurado)).toBe(401);
    }
    vi.unstubAllEnvs();
    delete process.env.VITRINE_REVALIDATE_SECRET;
    expect((await POST(pedido('{"slug":"loja-a"}', { authorization: "Bearer x" }))).status).toBe(401);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("AC5: corpo que não é JSON, sem slug ou com slug inválido → 400 e nenhuma revalidação", async () => {
    for (const corpo of ["", "slug=loja-a", "{}", '{"slug":7}', '{"slug":"Loja_A"}', `{"slug":"${"a".repeat(64)}"}`]) {
      const resposta = await POST(pedido(corpo, comSegredo));
      expect(resposta.status, corpo).toBe(400);
    }
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("AC6: GET, PUT, PATCH e DELETE → 405 com Allow: POST, sem revalidar", async () => {
    for (const [nome, manipulador] of Object.entries({ GET, PUT, PATCH, DELETE })) {
      const resposta = await manipulador();
      expect(resposta.status, nome).toBe(405);
      expect(resposta.headers.get("allow"), nome).toBe("POST");
    }
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("AC10: o log leva [vitrine], o slug e o desfecho; nunca o segredo nem o cabeçalho", async () => {
    await POST(pedido('{"slug":"loja-a"}', comSegredo));
    await POST(pedido('{"slug":"loja-a"}', { authorization: `Bearer ${SEGREDO}x` }));
    await POST(pedido("nao-json", comSegredo));
    const saida = logs.join("\n");
    expect(logs.length).toBe(3);
    for (const linha of logs) expect(linha).toContain("[vitrine]");
    expect(logs[0]).toContain("loja-a");
    expect(logs[0]).toContain("204");
    expect(logs[1]).toContain("401");
    expect(logs[2]).toContain("400");
    expect(saida).not.toContain(SEGREDO);
    expect(saida.toLowerCase()).not.toContain("bearer");
    expect(saida.toLowerCase()).not.toContain("authorization");
  });

  it("AC10: slug inválido nunca é escrito no log (sem injeção de linha)", async () => {
    await POST(pedido('{"slug":"loja\\nINJETADA"}', comSegredo));
    expect(logs.join("\n")).not.toContain("INJETADA");
  });

  it("nenhuma resposta define cookie (VSEG AC7)", async () => {
    const respostas = [
      await POST(pedido('{"slug":"loja-a"}', comSegredo)),
      await POST(pedido('{"slug":"loja-a"}')),
      await POST(pedido("x", comSegredo)),
      await GET(),
    ];
    for (const resposta of respostas) expect(resposta.headers.get("set-cookie")).toBeNull();
  });
});
