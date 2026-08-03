import { describe, expect, it } from "vitest";
import { DISTRIBUTION_HUES, toDistributionSlices } from "../distribution";

const MODALITY_LABELS = {
  novo: "Novo",
  usado: "Usado",
  ambos: "Ambos",
  nao_informado: "Não informado",
};

describe("toDistributionSlices", () => {
  it("calcula a participação de cada bucket sobre o total", () => {
    const slices = toDistributionSlices(
      [
        { bucket: "novo", count: 3 },
        { bucket: "usado", count: 1 },
      ],
      MODALITY_LABELS
    );

    expect(slices.map((slice) => slice.percent)).toEqual([0.75, 0.25]);
  });

  it("devolve percent 0 em vez de NaN quando o total é zero", () => {
    const slices = toDistributionSlices(
      [
        { bucket: "novo", count: 0 },
        { bucket: "usado", count: 0 },
      ],
      MODALITY_LABELS
    );

    expect(slices.map((slice) => slice.percent)).toEqual([0, 0]);
  });

  it("preserva a ordem dos buckets de entrada", () => {
    const slices = toDistributionSlices(
      [
        { bucket: "ambos", count: 1 },
        { bucket: "novo", count: 9 },
        { bucket: "usado", count: 2 },
      ],
      MODALITY_LABELS
    );

    expect(slices.map((slice) => slice.bucket)).toEqual([
      "ambos",
      "novo",
      "usado",
    ]);
  });

  it("aplica o matiz da Referência Visual R1 por modalidade", () => {
    const slices = toDistributionSlices(
      [
        { bucket: "novo", count: 1 },
        { bucket: "usado", count: 1 },
        { bucket: "ambos", count: 1 },
      ],
      MODALITY_LABELS
    );

    expect(slices.map((slice) => slice.hue)).toEqual([
      "blue",
      "orange",
      "purple",
    ]);
  });

  it("pinta o balde residual 'não informado' de cinza", () => {
    const [slice] = toDistributionSlices(
      [{ bucket: "nao_informado", count: 4 }],
      MODALITY_LABELS
    );

    expect(slice.hue).toBe("gray");
  });

  it("usa o rótulo pt-BR do mapa e cai no próprio bucket quando falta", () => {
    const slices = toDistributionSlices(
      [
        { bucket: "novo", count: 1 },
        { bucket: "bucket_sem_rotulo", count: 1 },
      ],
      MODALITY_LABELS
    );

    expect(slices.map((slice) => slice.label)).toEqual([
      "Novo",
      "bucket_sem_rotulo",
    ]);
  });

  it("puxa cores distintas da paleta para buckets desconhecidos", () => {
    const slices = toDistributionSlices(
      [
        { bucket: "desconhecido_a", count: 1 },
        { bucket: "desconhecido_b", count: 1 },
      ],
      {}
    );

    expect(slices.map((slice) => slice.hue)).toEqual([
      DISTRIBUTION_HUES[0],
      DISTRIBUTION_HUES[1],
    ]);
  });

  it("não deixa um bucket desconhecido roubar o cinza reservado ao residual", () => {
    const slices = toDistributionSlices(
      [
        { bucket: "desconhecido", count: 1 },
        { bucket: "nao_informado", count: 1 },
      ],
      MODALITY_LABELS
    );

    expect(slices[0].hue).not.toBe("gray");
    expect(slices[1].hue).toBe("gray");
  });
});
