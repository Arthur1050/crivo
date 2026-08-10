import type { ComponentType } from "react";
import {
  FileIcon,
  FileTextIcon,
  FileTypeIcon as FileTypeLucideIcon,
  ImageIcon,
  PresentationIcon,
  SheetIcon,
} from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import { resolveFileKind, type FileKind } from "@/src/lib/file-type";

type FileHue = "red" | "blue" | "green" | "orange" | "purple" | "gray";

const KIND_ICON: Record<
  FileKind,
  ComponentType<{ size?: number; className?: string }>
> = {
  pdf: FileTextIcon,
  documento: FileTypeLucideIcon,
  planilha: SheetIcon,
  apresentacao: PresentationIcon,
  imagem: ImageIcon,
  generico: FileIcon,
};

const KIND_HUE: Record<FileKind, FileHue> = {
  pdf: "red",
  documento: "blue",
  planilha: "green",
  apresentacao: "orange",
  imagem: "purple",
  generico: "gray",
};

// Mapa literal por matiz (AD-012 — Tailwind v4 só gera a utility que
// encontra escaneando o código-fonte; string interpolada não funciona).
const HUE_ICON_CLASS: Record<FileHue, string> = {
  red: "text-red-vivid",
  blue: "text-blue-vivid",
  green: "text-green-vivid",
  orange: "text-orange-vivid",
  purple: "text-purple-vivid",
  gray: "text-gray-vivid",
};

interface FileTypeIconProps {
  mimeType: string;
  size?: number;
}

/**
 * Chip de ícone colorido por tipo de arquivo (lote-6b — UI-02, design.md §
 * R2), mesmo padrão do chip de KPI (`src/components/dashboard/kpi-tiles.tsx`):
 * `Card variant={hue}` com o ícone em `text-<hue>-vivid`. Uma única
 * definição, usada nos dois lugares que mostram documentos (card de
 * Configurações e coluna Nome da tabela de Documentos) — zero divergência.
 */
export function FileTypeIcon({ mimeType, size = 16 }: FileTypeIconProps) {
  const kind = resolveFileKind(mimeType);
  const Icon = KIND_ICON[kind];
  const hue = KIND_HUE[kind];

  return (
    <Card variant={hue} padding={1.5}>
      <Icon size={size} className={HUE_ICON_CLASS[hue]} />
    </Card>
  );
}
