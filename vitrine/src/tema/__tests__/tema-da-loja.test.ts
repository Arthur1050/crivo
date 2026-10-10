import { generateThemeCSS } from "@astryxdesign/core/theme";
import { resolveThemeTokens } from "@astryxdesign/core/theme/tokens";
import { neutralTheme } from "@astryxdesign/theme-neutral";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FONTES } from "../../contrato";
import { COR_PADRAO, corDoCartao, corValida } from "../cor";
import { cssDoTema, temaDaLoja } from "../tema-da-loja";

const tokensDe = (tema: ReturnType<typeof temaDaLoja>) => resolveThemeTokens(tema, { mode: "light" });
const accent = (cor: string | null, slug = "loja-a") =>
  tokensDe(temaDaLoja({ slug, cor, fonte: "inter" }))["--color-accent"];

describe("L16b T10 — accent da loja (VTEMA AC1, AC2)", () => {
  it("duas lojas de cores diferentes têm accents diferentes entre si e do padrão", () => {
    const a = accent("#d4145a");
    const b = accent("#12a150");
    const padrao = accent(null);
    expect(a).toBeTruthy();
    expect(new Set([a, b, padrao]).size).toBe(3);
  });

  it("sem cor, a loja usa o accent do tema neutro (a cor padrão da vitrine)", () => {
    expect(accent(null)).toBe(resolveThemeTokens(neutralTheme, { mode: "light" })["--color-accent"]);
  });

  it("COR_PADRAO (usada no cartão OG, no servidor) é o accent do tema neutro no modo claro", () => {
    const doNeutro = resolveThemeTokens(neutralTheme, { mode: "light" })["--color-accent"];
    expect(COR_PADRAO.toLowerCase()).toBe(String(doNeutro).toLowerCase());
  });

  it("cor fora de #rrggbb minúsculo vira a cor padrão e nunca chega ao CSS", () => {
    const padrao = accent(null);
    for (const invalida of ["#FFF", "#FFFFFF", "red", "#d4145", "#d4145a;}</style><script>", "", "d4145a"]) {
      expect(accent(invalida), invalida).toBe(padrao);
      const css = cssDoTema(temaDaLoja({ slug: "loja-a", cor: invalida, fonte: "inter" }));
      expect(css.tema + css.reset).not.toContain("</style");
      expect(css.tema + css.reset).not.toContain("<script");
    }
  });

  it("a saída do CSS nunca contém </style, mesmo com cor válida", () => {
    const css = cssDoTema(temaDaLoja({ slug: "loja-a", cor: "#d4145a", fonte: "lora" }));
    expect(css.tema + css.reset).not.toContain("</style");
  });

  it("corValida e corDoCartao", () => {
    expect(corValida("#d4145a")).toBe("#d4145a");
    expect(corValida("#D4145A")).toBeNull();
    expect(corValida(null)).toBeNull();
    expect(corDoCartao("#d4145a")).toBe("#d4145a");
    expect(corDoCartao(null)).toBe(COR_PADRAO);
    expect(corDoCartao("azul")).toBe(COR_PADRAO);
  });
});

describe("L16b T10 — fonte da loja (VTEMA AC3)", () => {
  it("--font-family-body e --font-family-heading valem var(--font-<fonte>) para as 4 fontes", () => {
    expect([...FONTES]).toEqual(["inter", "montserrat", "lora", "playfair"]);
    for (const fonte of FONTES) {
      const tokens = tokensDe(temaDaLoja({ slug: "loja-a", cor: null, fonte }));
      expect(tokens["--font-family-body"], fonte).toBe(`var(--font-${fonte})`);
      expect(tokens["--font-family-heading"], fonte).toBe(`var(--font-${fonte})`);
    }
  });

  it("fonte fora da lista cai em inter", () => {
    const tokens = tokensDe(temaDaLoja({ slug: "loja-a", cor: null, fonte: "comic" as never }));
    expect(tokens["--font-family-body"]).toBe("var(--font-inter)");
  });
});

describe("L16b T10 — CSS do tema para o servidor (VTEMA AC7; AD-046)", () => {
  it("camada astryx-theme com o escopo da loja e a saída exata de generateThemeCSS", () => {
    const tema = temaDaLoja({ slug: "loja-a", cor: "#d4145a", fonte: "lora" });
    const css = cssDoTema(tema);
    const { component } = generateThemeCSS(tema);
    expect(css.tema.startsWith("@layer astryx-theme {")).toBe(true);
    expect(css.tema).toContain('@scope ([data-astryx-theme="loja-loja-a"])');
    expect(css.tema).toBe(`@layer astryx-theme {\n${component}\n}`);
    expect(css.tema).toContain("--color-accent");
    expect(css.tema).toContain("--font-family-body: var(--font-lora)");
  });

  it("camada reset com a prosa do tema, no mesmo escopo", () => {
    const tema = temaDaLoja({ slug: "loja-a", cor: "#d4145a", fonte: "lora" });
    const css = cssDoTema(tema);
    const { prose } = generateThemeCSS(tema);
    expect(css.reset.startsWith("@layer reset {")).toBe(true);
    expect(css.reset).toContain('@scope ([data-astryx-theme="loja-loja-a"])');
    expect(css.reset).toContain(":where(h1, h2, h3, h4, h5, h6)");
    expect(css.reset).toBe(`@layer reset {\n${prose}\n}`);
  });

  it("o escopo é o nome da loja: duas lojas não compartilham seletor", () => {
    const a = cssDoTema(temaDaLoja({ slug: "loja-a", cor: "#d4145a", fonte: "inter" }));
    const b = cssDoTema(temaDaLoja({ slug: "loja-b", cor: "#12a150", fonte: "inter" }));
    expect(a.tema).not.toContain("loja-loja-b");
    expect(b.tema).not.toContain("loja-loja-a");
    expect(a.tema).not.toBe(b.tema);
  });

  it("slug fora de ^[a-z0-9-]{1,63}$ não vira tema", () => {
    for (const slug of ["", "Loja", "a_b", "a".repeat(64), 'a"]){x'])
      expect(() => temaDaLoja({ slug, cor: null, fonte: "inter" }), slug).toThrow();
  });
});

describe("L16b T10 — alarme de upgrade da Astryx (AD-046)", () => {
  it("o runtime do <Theme> ainda injeta nas camadas reset e astryx-theme", () => {
    const caminho = fileURLToPath(
      new URL("../../../node_modules/@astryxdesign/core/dist/Theme/Theme.js", import.meta.url)
    );
    const fonte = readFileSync(caminho, "utf8");
    expect(fonte).toContain("@layer reset {");
    expect(fonte).toContain("@layer astryx-theme {");
  });
});
