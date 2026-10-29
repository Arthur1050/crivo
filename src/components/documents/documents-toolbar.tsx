"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon, SlidersHorizontalIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSubMenu,
} from "@astryxdesign/core/DropdownMenu";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack, StackItem } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import {
  DEFAULT_DOCUMENT_SORT,
  DOCUMENT_SORT_OPTIONS,
} from "@/src/components/documents/document-sort";
import { NO_FOLDER_LABEL, NO_FOLDER_PARAM } from "@/src/lib/document-folders";
import type { DocumentCategory, Modality } from "@/src/server/data";

const MODALITY_OPTIONS: { value: Modality; label: string }[] = [
  { value: "novo", label: "Novo" },
  { value: "usado", label: "Usado" },
  { value: "ambos", label: "Ambos" },
];

/** Valor sentinela do item "todas": o rádio precisa de string, a URL não. */
const ALL = "todas";

const SEARCH_DEBOUNCE_MS = 300;

interface DocumentsToolbarProps {
  categories: DocumentCategory[];
  showFolderFilter?: boolean;
}

/**
 * Barra de busca e filtros de `/documentos` (lote-2 — DOC-01), no desenho do
 * gerenciador de arquivos: busca à esquerda e um único menu "Filtrar e
 * ordenar" à direita. Cada mudança é escrita na URL (`modalidade`,
 * `categoria`, `q`, `ordem`) via `router.replace`, para que o RSC da página
 * releia `searchParams` e refaça a consulta filtrada no servidor. A busca por
 * nome é debounced (~300ms); os itens do menu aplicam imediatamente.
 */
export function DocumentsToolbar({ categories, showFolderFilter = false }: DocumentsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const modality = searchParams.get("modalidade");
  const categoryId = searchParams.get("categoria");
  const sort = searchParams.get("ordem") ?? DEFAULT_DOCUMENT_SORT;
  const folder = searchParams.get("pasta");
  const activeFilterCount = Number(Boolean(modality)) + Number(Boolean(categoryId))
    + Number(showFolderFilter && folder === NO_FOLDER_PARAM);

  function updateParams(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ q: value.trim() ? value : null });
    }, SEARCH_DEBOUNCE_MS);
  }

  return (
    <HStack gap={3} vAlign="center" wrap="wrap">
      <StackItem size="fill">
        <TextInput
          label="Buscar documentos"
          isLabelHidden
          placeholder="Buscar documentos…"
          startIcon={SearchIcon}
          value={search}
          onChange={handleSearchChange}
          hasClear
          width="min(100%, 512px)"
        />
      </StackItem>
      <DropdownMenu
        button={{
          label:
            activeFilterCount > 0
              ? `Filtrar e ordenar (${activeFilterCount})`
              : "Filtrar e ordenar",
          icon: <SlidersHorizontalIcon size={16} />,
          size: "sm",
        }}
        hasChevron={false}
        menuWidth={220}
      >
        <DropdownMenuRadioGroup
          aria-label="Modalidade"
          value={modality ?? ALL}
          onChange={(value) => updateParams({ modalidade: value === ALL ? null : value })}
        >
          <DropdownMenuRadioItem value={ALL} label="Todos os documentos" />
          {MODALITY_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} label={option.label} />
          ))}
        </DropdownMenuRadioGroup>
        <Divider />
        <DropdownMenuSubMenu label="Categoria" menuWidth={220}>
          <DropdownMenuRadioGroup
            aria-label="Categoria"
            value={categoryId ?? ALL}
            onChange={(value) => updateParams({ categoria: value === ALL ? null : value })}
          >
            <DropdownMenuRadioItem value={ALL} label="Todas as categorias" />
            {categories.map((category) => (
              <DropdownMenuRadioItem
                key={category.id}
                value={category.id}
                label={<Token label={category.name} color={category.color} size="sm" />}
              />
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubMenu>
        {showFolderFilter && (
          <DropdownMenuSubMenu label="Pasta">
            <DropdownMenuRadioGroup
              aria-label="Pasta"
              value={folder === NO_FOLDER_PARAM ? NO_FOLDER_PARAM : ALL}
              onChange={(value) => updateParams({ pasta: value === ALL ? null : value })}
            >
              <DropdownMenuRadioItem value={ALL} label="Todas" />
              <DropdownMenuRadioItem value={NO_FOLDER_PARAM} label={NO_FOLDER_LABEL} />
            </DropdownMenuRadioGroup>
          </DropdownMenuSubMenu>
        )}
        <DropdownMenuSubMenu label="Ordenar por" menuWidth={200}>
          <DropdownMenuRadioGroup
            aria-label="Ordenar por"
            value={sort}
            onChange={(value) =>
              updateParams({ ordem: value === DEFAULT_DOCUMENT_SORT ? null : value })
            }
          >
            {DOCUMENT_SORT_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value} label={option.label} />
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubMenu>
        {activeFilterCount > 0 && (
          <>
            <Divider />
            <DropdownMenuItem
              label="Limpar filtros"
              onClick={() => updateParams({
                modalidade: null,
                categoria: null,
                ...(showFolderFilter ? { pasta: null } : {}),
              })}
            />
          </>
        )}
      </DropdownMenu>
    </HStack>
  );
}
