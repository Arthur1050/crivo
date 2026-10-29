import type { DocumentFolderSummary } from "../../../lib/document-folders";

export const FOLDER_NOW = new Date("2026-07-30T15:00:00Z");

export const FOLDER_FIXTURES: DocumentFolderSummary[] = [
  ["Contratos", 24, 18_400_000, "2026-07-30T14:48:00Z"],
  ["Lançamentos", 38, 96_200_000, "2026-07-29T15:00:00Z"],
  ["Documentação legal", 16, 8_800_000, "2026-07-28T15:00:00Z"],
  ["Financiamento", 11, 6_500_000, "2026-07-27T15:00:00Z"],
  ["Tabelas de preço", 29, 24_100_000, "2026-07-25T15:00:00Z"],
  ["Treinamento da equipe", 18, 12_600_000, "2026-07-22T15:00:00Z"],
].map(([name, fileCount, totalSizeBytes, date], index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  name: String(name),
  fileCount: Number(fileCount),
  totalSizeBytes: Number(totalSizeBytes),
  lastActivityAt: new Date(String(date)),
}));
