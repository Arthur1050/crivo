import { describe, expect, it } from "vitest";
import { ErroDeLeitura, lerDoBanco } from "../erro-de-leitura";

// Erro como o Drizzle o entrega: mensagem com SQL e a causa do `pg` com o host.
function erroDoDriver(codigo?: string) {
  const causa = Object.assign(new Error("getaddrinfo ENOTFOUND banco.interno.invalid"), {
    code: codigo,
    hostname: "banco.interno.invalid",
  });
  return Object.assign(
    new Error('Failed query: select "slug" from "vitrine"."lojas" where "slug" = $1\nparams: loja-a'),
    { cause: causa, query: 'select "slug" from "vitrine"."lojas"', params: ["loja-a"] }
  );
}

describe("L16b T18 — falha de leitura sem detalhe técnico (VSEG-02, Edge Case de banco indisponível)", () => {
  it("troca o erro do driver por um sem SQL, host nem parâmetros", async () => {
    const falha = await lerDoBanco(() => Promise.reject(erroDoDriver("ENOTFOUND"))).catch((e: unknown) => e);

    expect(falha).toBeInstanceOf(ErroDeLeitura);
    const erro = falha as ErroDeLeitura;
    expect(erro.name).toBe("ErroDeLeitura");
    expect(erro.message).toBe("Falha ao ler o catálogo da vitrine.");
    expect(erro.cause).toBeUndefined();
    // Nada do original sobrevive no que o Next imprime: nome, mensagem, primeira
    // linha da pilha e os campos próprios (o driver pendura `query` e `params`).
    expect(Object.keys(erro).sort()).toEqual(["code", "name"]);
    const impresso = [erro.name, erro.message, erro.stack?.split("\n")[0] ?? "", String(erro.code)].join("\n");
    for (const proibido of ["select", "lojas", "banco.interno.invalid", "loja-a", "params", "getaddrinfo"]) {
      expect(impresso).not.toContain(proibido);
    }
  });

  it("guarda o código da causa, do erro ou de qualquer nível da cadeia", async () => {
    const naCausa = await lerDoBanco(() => Promise.reject(erroDoDriver("ENOTFOUND"))).catch((e: unknown) => e);
    expect((naCausa as ErroDeLeitura).code).toBe("ENOTFOUND");

    const noProprio = await lerDoBanco(() =>
      Promise.reject(Object.assign(new Error("senha recusada"), { code: "28P01" }))
    ).catch((e: unknown) => e);
    expect((noProprio as ErroDeLeitura).code).toBe("28P01");
  });

  it("sem código textual na cadeia, o código fica indefinido", async () => {
    const semCodigo = await lerDoBanco(() => Promise.reject(erroDoDriver(undefined))).catch((e: unknown) => e);
    expect((semCodigo as ErroDeLeitura).code).toBeUndefined();

    const codigoNumerico = await lerDoBanco(() =>
      Promise.reject(Object.assign(new Error("x"), { code: 42 }))
    ).catch((e: unknown) => e);
    expect((codigoNumerico as ErroDeLeitura).code).toBeUndefined();
  });

  it("devolve o resultado da leitura sem alterá-lo quando não falha", async () => {
    expect(await lerDoBanco(() => Promise.resolve({ slug: "loja-a" }))).toEqual({ slug: "loja-a" });
    expect(await lerDoBanco(() => Promise.resolve(null))).toBeNull();
  });
});
