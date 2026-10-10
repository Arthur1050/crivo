import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MENSAGENS_PT_BR } from "../mensagens";

// O catálogo em inglês que a lib instalada traz (`vitrine/node_modules`).
const EN: Record<string, { defaultMessage: string }> = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../node_modules/@astryxdesign/core/locales/en.json"), "utf8")
);

const MARCADORES = /\{[a-zA-Z]+(?:,[^}]*)?\}/g;

describe("L16b T21 — textos da Astryx em português", () => {
  it("toda chave traduzida existe no catálogo da lib: renomear ou remover numa atualização quebra aqui", () => {
    for (const chave of Object.keys(MENSAGENS_PT_BR)) {
      expect(EN, chave).toHaveProperty([chave]);
    }
  });

  it("cada tradução mantém os marcadores {variável, tipo} do original", () => {
    for (const [chave, { defaultMessage }] of Object.entries(MENSAGENS_PT_BR)) {
      const esperados = (EN[chave].defaultMessage.match(MARCADORES) ?? []).sort();
      const obtidos = (defaultMessage.match(MARCADORES) ?? []).sort();
      expect(obtidos, chave).toEqual(esperados);
    }
  });

  it("cobre a paginação inteira, o carrossel, o visualizador de fotos e o link em nova aba", () => {
    const chaves = Object.keys(MENSAGENS_PT_BR);
    const exigidas = Object.keys(EN).filter((chave) =>
      /^@astryx\.(pagination\.|carousel\.|lightbox\.|link\.newTab)/.test(chave)
    );
    expect(exigidas.length).toBeGreaterThan(10);
    expect(chaves.sort()).toEqual(exigidas.sort());
  });
});
