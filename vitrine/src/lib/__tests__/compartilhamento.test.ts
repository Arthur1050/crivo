import { describe, expect, it } from "vitest";
import { metadataDoCatalogo } from "../compartilhamento";

const LOJA = { slug: "loja-a", nome: "Imobiliária Alfa", titulo: "Imóveis selecionados", cidade: "Uberaba", uf: "MG" };

describe("L16b fechamento — metadataDoCatalogo (VOG-01 AC1, AC2)", () => {
  it("título, descrição, og:url do catálogo e twitter:card da loja", () => {
    const meta = metadataDoCatalogo(LOJA);
    expect(meta.title).toBe("Imobiliária Alfa — imóveis");
    expect(meta.description).toBe("Imóveis selecionados");
    expect(meta.openGraph).toMatchObject({
      title: "Imobiliária Alfa — imóveis",
      description: "Imóveis selecionados",
      url: "/c/loja-a",
      siteName: "Imobiliária Alfa",
      locale: "pt_BR",
      type: "website",
    });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", title: "Imobiliária Alfa — imóveis" });
  });

  it("sem título institucional a descrição é a da cidade e UF", () => {
    expect(metadataDoCatalogo({ ...LOJA, titulo: null }).description).toBe("Imóveis disponíveis em Uberaba/MG");
  });

  it("as imagens só entram quando são passadas, e nunca há robots (o noindex vem do layout)", () => {
    const sem = metadataDoCatalogo(LOJA);
    expect(sem.openGraph).not.toHaveProperty("images");
    expect(sem.twitter).not.toHaveProperty("images");
    expect(sem).not.toHaveProperty("robots");

    const com = metadataDoCatalogo(LOJA, { og: ["/c/loja-a/opengraph-image"], twitter: ["/c/loja-a/twitter"] });
    expect(com.openGraph).toMatchObject({ images: ["/c/loja-a/opengraph-image"] });
    expect(com.twitter).toMatchObject({ images: ["/c/loja-a/twitter"] });
  });

  it("não carrega dado de imóvel: só campos da loja", () => {
    const texto = JSON.stringify(metadataDoCatalogo(LOJA));
    expect(texto).not.toMatch(/imovel|referencia|R\$|quartos/i);
  });
});
