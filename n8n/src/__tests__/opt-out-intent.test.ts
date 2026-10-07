import { describe, expect, it } from "vitest";
import { OPT_OUT_CONFIRMATION } from "../opt-out-intent.mjs";

describe("OPT_OUT_CONFIRMATION (SAIR-02 AC4)", () => {
  it("é exatamente o texto publicado em e3e25681 (L-037)", () => {
    expect(OPT_OUT_CONFIRMATION).toBe(
      "Pronto, registramos seu pedido. Você não vai mais receber mensagens nossas por este número. Até mais!"
    );
  });

  it("não promete retomada de contato", () => {
    expect(OPT_OUT_CONFIRMATION).not.toMatch(/chamar novamente/i);
    expect(OPT_OUT_CONFIRMATION).not.toMatch(/mudar de ideia/i);
  });
});
