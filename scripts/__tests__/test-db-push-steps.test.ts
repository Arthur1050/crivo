import { beforeEach, describe, expect, it, vi } from "vitest";
import { restoreDrizzleBlindIndexes } from "../drizzle-blind-indexes";
import { applyDocumentFoldersSql, verifyDocumentFoldersState } from "../document-folders/apply";
import { verifyVitrineState } from "../vitrine/apply";
import { realSteps } from "../test-db-push";

vi.mock("../drizzle-blind-indexes", () => ({ restoreDrizzleBlindIndexes: vi.fn() }));
vi.mock("../document-folders/apply", () => ({ applyDocumentFoldersSql: vi.fn(), verifyDocumentFoldersState: vi.fn() }));
vi.mock("../vitrine/apply", () => ({ verifyVitrineState: vi.fn(), dropVitrineSchema: vi.fn(), applyVitrineSql: vi.fn() }));

const url = "postgresql://teste.example.test/banco";
beforeEach(() => { vi.resetAllMocks(); });

describe("L17 T2 — ligação real das etapas compostas (L-026)", () => {
  it("restaura os índices antes de aplicar o SQL das pastas na mesma conexão", async () => {
    let finishRestore!: () => void;
    vi.mocked(restoreDrizzleBlindIndexes).mockReturnValue(new Promise<void>((resolve) => { finishRestore = resolve; }));
    vi.mocked(applyDocumentFoldersSql).mockResolvedValue();
    const pending = realSteps().restoreIndexes!(url);
    expect(restoreDrizzleBlindIndexes).toHaveBeenCalledExactlyOnceWith(url);
    expect(applyDocumentFoldersSql).not.toHaveBeenCalled();
    finishRestore();
    await pending;
    expect(applyDocumentFoldersSql).toHaveBeenCalledExactlyOnceWith(url);
  });

  it("falha da restauração propaga e impede o SQL das pastas", async () => {
    const error = new Error("restauração recusada");
    vi.mocked(restoreDrizzleBlindIndexes).mockRejectedValue(error);
    await expect(realSteps().restoreIndexes!(url)).rejects.toBe(error);
    expect(restoreDrizzleBlindIndexes).toHaveBeenCalledExactlyOnceWith(url);
    expect(applyDocumentFoldersSql).not.toHaveBeenCalled();
  });

  it("falha do SQL das pastas também propaga", async () => {
    const error = new Error("SQL recusado");
    vi.mocked(restoreDrizzleBlindIndexes).mockResolvedValue();
    vi.mocked(applyDocumentFoldersSql).mockRejectedValue(error);
    await expect(realSteps().restoreIndexes!(url)).rejects.toBe(error);
    expect(applyDocumentFoldersSql).toHaveBeenCalledExactlyOnceWith(url);
  });

  it.each([
    [["problema vitrine"], ["problema pastas"], ["problema vitrine", "problema pastas"]],
    [["problema vitrine"], [], ["problema vitrine"]],
    [[], ["problema pastas"], ["problema pastas"]],
    [[], [], []],
  ])("concatena as conferências da vitrine %j e das pastas %j", async (vitrine, folders, expected) => {
    vi.mocked(verifyVitrineState).mockResolvedValue(vitrine);
    vi.mocked(verifyDocumentFoldersState).mockResolvedValue(folders);
    expect(await realSteps().verify(url)).toEqual(expected);
    expect(verifyVitrineState).toHaveBeenCalledExactlyOnceWith(url);
    expect(verifyDocumentFoldersState).toHaveBeenCalledExactlyOnceWith(url);
  });
});
