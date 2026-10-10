import { beforeEach, describe, expect, it, vi } from "vitest";

const espiao = vi.hoisted(() => ({ timingSafeEqual: vi.fn() }));

vi.mock("node:crypto", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:crypto")>();
  espiao.timingSafeEqual.mockImplementation(real.timingSafeEqual);
  return { ...real, timingSafeEqual: espiao.timingSafeEqual };
});

import { lerCorpo, verificarSegredo } from "../revalidacao";

const SEGREDO = "s3gredo-de-revalidacao-0123456789";

describe("L16b T11 — verificarSegredo (VCACHE-02 AC4, AC7)", () => {
  beforeEach(() => {
    espiao.timingSafeEqual.mockClear();
  });

  it("aceita o segredo certo no formato Bearer", () => {
    expect(verificarSegredo(`Bearer ${SEGREDO}`, SEGREDO)).toBe(true);
    expect(verificarSegredo(`bearer ${SEGREDO}`, SEGREDO)).toBe(true);
  });

  it("recusa segredo errado do mesmo tamanho e de outro tamanho", () => {
    const mesmoTamanho = SEGREDO.slice(0, -1) + (SEGREDO.endsWith("9") ? "8" : "9");
    expect(mesmoTamanho).toHaveLength(SEGREDO.length);
    expect(verificarSegredo(`Bearer ${mesmoTamanho}`, SEGREDO)).toBe(false);
    expect(verificarSegredo(`Bearer ${SEGREDO}x`, SEGREDO)).toBe(false);
    expect(verificarSegredo(`Bearer ${SEGREDO.slice(0, 5)}`, SEGREDO)).toBe(false);
  });

  it("recusa cabeçalho sem Bearer, ausente ou vazio", () => {
    for (const cabecalho of [SEGREDO, `Basic ${SEGREDO}`, "Bearer", "Bearer ", "", null, undefined]) {
      expect(verificarSegredo(cabecalho, SEGREDO), String(cabecalho)).toBe(false);
    }
  });

  it("segredo configurado vazio nunca autoriza, nem com cabeçalho 'vazio' igual", () => {
    for (const configurado of ["", "   ", undefined]) {
      for (const cabecalho of ["Bearer ", "Bearer", "Bearer x", `Bearer ${configurado ?? ""}`, null]) {
        expect(verificarSegredo(cabecalho, configurado), `${configurado}|${cabecalho}`).toBe(false);
      }
    }
  });

  it("compara em tempo constante: timingSafeEqual é chamado, com buffers de 32 bytes", () => {
    verificarSegredo(`Bearer ${SEGREDO}`, SEGREDO);
    expect(espiao.timingSafeEqual).toHaveBeenCalledTimes(1);
    const [a, b] = espiao.timingSafeEqual.mock.calls[0] as [Buffer, Buffer];
    expect(a).toHaveLength(32);
    expect(b).toHaveLength(32);
  });

  it("segredo de outro tamanho não derruba a comparação (timingSafeEqual exige o mesmo tamanho)", () => {
    expect(() => verificarSegredo("Bearer curto", SEGREDO)).not.toThrow();
    expect(() => verificarSegredo(`Bearer ${"x".repeat(500)}`, SEGREDO)).not.toThrow();
  });
});

describe("L16b T11 — lerCorpo (VCACHE-02 AC5)", () => {
  it("corpo com slug válido", () => {
    expect(lerCorpo('{"slug":"loja-a"}')).toEqual({ ok: true, corpo: { slug: "loja-a" } });
    expect(lerCorpo('{"slug":"loja-a","extra":1}')).toEqual({ ok: true, corpo: { slug: "loja-a" } });
    expect(lerCorpo(`{"slug":"${"a".repeat(63)}"}`).ok).toBe(true);
  });

  it("corpo que não é JSON", () => {
    for (const texto of ["", "slug=loja-a", "{slug:", "undefined"]) {
      expect(lerCorpo(texto), texto).toEqual({ ok: false, motivo: "nao-json" });
    }
  });

  it("JSON sem slug (objeto vazio, lista, nulo, número, slug não texto)", () => {
    for (const texto of ["{}", "[]", "null", "7", '"loja-a"', '{"slug":7}', '{"slug":null}', '{"outro":"loja-a"}', '{"slug":["a"]}']) {
      expect(lerCorpo(texto), texto).toEqual({ ok: false, motivo: "sem-slug" });
    }
  });

  it("slug fora de ^[a-z0-9-]{1,63}$", () => {
    for (const slug of ["", "Loja", "a_b", "a b", "../x", "a".repeat(64)]) {
      expect(lerCorpo(JSON.stringify({ slug })), JSON.stringify(slug)).toEqual({
        ok: false,
        motivo: "slug-invalido",
      });
    }
  });
});
