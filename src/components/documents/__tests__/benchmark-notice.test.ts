import { describe, expect, it } from "vitest";
import {
  REQUIRED_BENCHMARK_MODALITIES,
  describeBenchmarkNotice,
} from "../benchmark-notice";

const COMPLETE = { published: REQUIRED_BENCHMARK_MODALITIES, stale: 0 };

describe("aviso de benchmark de teto (lote-12 T27)", () => {
  it("benchmark completo e atual não gera aviso", () => {
    expect(describeBenchmarkNotice(COMPLETE, true)).toBeNull();
  });

  it("benchmark ausente avisa que nenhum documento entra no contexto", () => {
    const notice = describeBenchmarkNotice({ published: 0, stale: 0 }, true);
    expect(notice?.title).toContain("não medido");
    expect(notice?.description).toContain("nenhum documento entra no contexto");
  });

  it("benchmark parcial conta como ausente, porque as três modalidades são necessárias", () => {
    for (const published of [1, 2]) {
      expect(describeBenchmarkNotice({ published, stale: 0 }, true)?.title).toContain("não medido");
    }
  });

  it("benchmark obsoleto tem aviso próprio, distinto do ausente", () => {
    const obsoleto = describeBenchmarkNotice({ published: 3, stale: 1 }, true);
    const ausente = describeBenchmarkNotice({ published: 0, stale: 0 }, true);
    expect(obsoleto?.title).toContain("desatualizado");
    expect(obsoleto?.title).not.toBe(ausente?.title);
  });

  it("ausente prevalece sobre obsoleto quando as duas condições valem", () => {
    // Sem os três tetos publicados, refazer o benchmark é a única ação útil;
    // dizer "desatualizado" mandaria o operador ao lugar errado.
    expect(describeBenchmarkNotice({ published: 2, stale: 2 }, true)?.title).toContain("não medido");
  });

  it.each([
    ["ausente", { published: 0, stale: 0 }],
    ["parcial", { published: 2, stale: 0 }],
    ["obsoleto", { published: 3, stale: 3 }],
    ["completo", COMPLETE],
  ])("quem não opera o benchmark nunca vê o aviso %s", (_caso, summary) => {
    expect(describeBenchmarkNotice(summary, false)).toBeNull();
  });

  it("o aviso nunca carrega valor de teto, para não sugerir que ele mudou", () => {
    const avisos = [
      describeBenchmarkNotice({ published: 0, stale: 0 }, true),
      describeBenchmarkNotice({ published: 3, stale: 1 }, true),
    ];
    for (const aviso of avisos) {
      expect(JSON.stringify(aviso)).not.toMatch(/\d{3,}|bytes|token/i);
    }
  });

  it("todo aviso é de severidade warning, nunca error", () => {
    // Benchmark pendente degrada a admissão, não quebra o produto.
    expect(describeBenchmarkNotice({ published: 0, stale: 0 }, true)?.status).toBe("warning");
    expect(describeBenchmarkNotice({ published: 3, stale: 2 }, true)?.status).toBe("warning");
  });
});
