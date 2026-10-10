import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  db: { marca: "db-da-app" },
  lojaPorSlug: vi.fn(),
  imoveisDaLoja: vi.fn(),
  imovelPorReferencia: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheLife: mocks.cacheLife, cacheTag: mocks.cacheTag }));
vi.mock("../../db/conexao", () => ({ dbDaApp: () => mocks.db }));
vi.mock("../consultas", () => ({
  lojaPorSlug: mocks.lojaPorSlug,
  imoveisDaLoja: mocks.imoveisDaLoja,
  imovelPorReferencia: mocks.imovelPorReferencia,
}));

import { imoveisCacheados, imovelCacheado, lojaCacheada } from "../cache";

describe("L16b T5 — camada de cache por loja (VCACHE-01 AC1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lojaPorSlug.mockResolvedValue({ slug: "loja-a" });
    mocks.imoveisDaLoja.mockResolvedValue([{ referencia: "AP-1" }]);
    mocks.imovelPorReferencia.mockResolvedValue({ referencia: "AP-1" });
  });

  const chamadas = [
    {
      nome: "lojaCacheada",
      chamar: (slug: string) => lojaCacheada(slug),
      consulta: () => mocks.lojaPorSlug,
      argumentos: (slug: string) => [mocks.db, slug],
    },
    {
      nome: "imoveisCacheados",
      chamar: (slug: string) => imoveisCacheados(slug),
      consulta: () => mocks.imoveisDaLoja,
      argumentos: (slug: string) => [mocks.db, slug],
    },
    {
      nome: "imovelCacheado",
      chamar: (slug: string) => imovelCacheado(slug, "ap-1"),
      consulta: () => mocks.imovelPorReferencia,
      argumentos: (slug: string) => [mocks.db, slug, "ap-1"],
    },
  ];

  for (const { nome, chamar, consulta, argumentos } of chamadas) {
    it(`${nome}: perfil vitrine e tag tenant:<slug>:catalogo com o slug recebido`, async () => {
      await chamar("loja-a");
      expect(mocks.cacheLife).toHaveBeenCalledTimes(1);
      expect(mocks.cacheLife).toHaveBeenCalledWith("vitrine");
      expect(mocks.cacheTag).toHaveBeenCalledTimes(1);
      expect(mocks.cacheTag).toHaveBeenCalledWith("tenant:loja-a:catalogo");

      await chamar("outra-loja-9");
      expect(mocks.cacheTag).toHaveBeenLastCalledWith("tenant:outra-loja-9:catalogo");
    });

    it(`${nome}: lê pela conexão da app e pelo slug pedido`, async () => {
      await chamar("loja-a");
      expect(consulta()).toHaveBeenCalledWith(...argumentos("loja-a"));
    });
  }

  it("devolve o resultado da consulta sem alterá-lo", async () => {
    expect(await lojaCacheada("loja-a")).toEqual({ slug: "loja-a" });
    expect(await imoveisCacheados("loja-a")).toEqual([{ referencia: "AP-1" }]);
    expect(await imovelCacheado("loja-a", "ap-1")).toEqual({ referencia: "AP-1" });
  });
});
