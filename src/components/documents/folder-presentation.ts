import { formatFileSize } from "../../lib/format";
import {
  FOLDER_ERROR_MESSAGES, NO_FOLDER_LABEL,
  type DocumentFolderOption, type DocumentFolderSummary, type FolderActionErrorCode,
} from "../../lib/document-folders";

export interface FolderCardItem {
  id: string;
  name: string;
  fileCountLabel: string;
  sizeLabel: string;
  updatedLabel: string;
  fileCount: number;
}

export function formatFileCount(count: number): string {
  return `${count} ${count === 1 ? "arquivo" : "arquivos"}`;
}

export function formatFolderCount(count: number): string {
  return `${count} ${count === 1 ? "pasta" : "pastas"}`;
}

const timeZone = "America/Sao_Paulo";
const civilFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone, year: "numeric", month: "2-digit", day: "2-digit",
});

function civilDay(date: Date): number {
  const parts = civilFormatter.formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  return Date.UTC(value("year"), value("month") - 1, value("day"));
}

export function formatFolderUpdatedLabel(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "Atualizada agora";
  if (minutes < 60) return `Atualizada há ${minutes} min`;
  const dateDay = civilDay(date);
  const nowDay = civilDay(now);
  if (dateDay === nowDay) return `Atualizada há ${Math.floor(minutes / 60)} h`;
  if (nowDay - dateDay === 86_400_000) return "Atualizada ontem";
  const sameYear = new Date(dateDay).getUTCFullYear() === new Date(nowDay).getUTCFullYear();
  return `Atualizada em ${new Intl.DateTimeFormat("pt-BR", {
    day: "numeric", month: "short", timeZone, ...(sameYear ? {} : { year: "numeric" }),
  }).format(date)}`;
}

export function toFolderCardItems(folders: DocumentFolderSummary[], now: Date): FolderCardItem[] {
  return folders.map((folder) => ({
    id: folder.id, name: folder.name, fileCount: folder.fileCount,
    fileCountLabel: formatFileCount(folder.fileCount),
    sizeLabel: formatFileSize(folder.totalSizeBytes),
    updatedLabel: formatFolderUpdatedLabel(folder.lastActivityAt, now),
  }));
}

export function deleteFolderCopy(name: string, fileCount: number): { title: string; description: string } {
  return {
    title: `Excluir a pasta "${name}"?`,
    description: fileCount === 0 ? "A pasta está vazia." : fileCount === 1
      ? `O arquivo dela volta para ${NO_FOLDER_LABEL}.`
      : `Os ${fileCount} arquivos dela voltam para ${NO_FOLDER_LABEL}.`,
  };
}

export function folderErrorMessage(result: { code: FolderActionErrorCode; error: string }): string {
  return result.code === "sem-permissao" || result.code === "nome-invalido"
    ? result.error : FOLDER_ERROR_MESSAGES[result.code];
}

export const NO_FOLDER_OPTION_VALUE = "__sem-pasta__";

export function folderSelectorOptions(folders: DocumentFolderOption[]): { value: string; label: string }[] {
  return [
    { value: NO_FOLDER_OPTION_VALUE, label: NO_FOLDER_LABEL },
    ...folders.map(({ id, name }) => ({ value: id, label: name })),
  ];
}

export function folderIdFromSelector(value: string | null): string | null {
  return value === NO_FOLDER_OPTION_VALUE ? null : value;
}
