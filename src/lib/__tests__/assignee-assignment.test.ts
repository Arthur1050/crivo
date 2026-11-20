import { describe, expect, it } from "vitest";
import { assignAssignee, type AssigneeLoad } from "../assignee-assignment";

function broker(id: string, createdAt: string, activeLeads: number): AssigneeLoad {
  return { id, createdAt: new Date(createdAt), activeLeads };
}

describe("assignBroker", () => {
  it("devolve null para lista vazia (spec.md — tenant sem corretor)", () => {
    expect(assignAssignee([])).toBeNull();
  });

  it("com um único corretor, devolve o id dele independente da carga", () => {
    const only = broker("b1", "2026-01-01T00:00:00.000Z", 7);
    expect(assignAssignee([only])).toBe("b1");
  });

  it("com cargas 5/2/2, devolve o de carga 2 com createdAt mais antigo (id exato, não 'algum dos dois')", () => {
    const candidates = [
      broker("heavy", "2026-01-01T00:00:00.000Z", 5),
      broker("light-newer", "2026-03-01T00:00:00.000Z", 2),
      broker("light-older", "2026-02-01T00:00:00.000Z", 2),
    ];
    expect(assignAssignee(candidates)).toBe("light-older");
  });

  it("com carga e createdAt idênticos, devolve o de menor id — saída não depende da ordem de entrada", () => {
    const same = "2026-01-01T00:00:00.000Z";
    const higherFirst: AssigneeLoad[] = [
      broker("z-broker", same, 3),
      broker("a-broker", same, 3),
    ];
    const lowerFirst: AssigneeLoad[] = [
      broker("a-broker", same, 3),
      broker("z-broker", same, 3),
    ];

    expect(assignAssignee(higherFirst)).toBe("a-broker");
    expect(assignAssignee(lowerFirst)).toBe("a-broker");
  });

  it("não importa nenhum módulo de banco, rede ou Date.now() (módulo puro)", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        new URL("../assignee-assignment.ts", import.meta.url),
        "utf-8"
      )
    );
    expect(source).not.toMatch(/\bimport\b/);
    expect(source).not.toMatch(/Date\.now\(\)/);
  });
});
