"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Selector, SelectorOption } from "@astryxdesign/core/Selector";
import { HStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import type { DocumentCategory, Modality } from "@/src/server/data";

const MODALITY_OPTIONS: { value: Modality; label: string }[] = [
  { value: "novo", label: "Novo" },
  { value: "usado", label: "Usado" },
  { value: "ambos", label: "Ambos" },
];

const SEARCH_DEBOUNCE_MS = 300;

interface DocumentsToolbarProps {
  categories: DocumentCategory[];
}

/**
 * Barra de filtros/busca de `/documentos` (lote-2 — DOC-01). Cada mudança é
 * escrita na URL (`modalidade`, `categoria`, `q`) via `router.replace`, para
 * que o RSC da página releia `searchParams` e refaça a consulta filtrada no
 * servidor — nenhum filtro é aplicado no client. A busca por nome é
 * debounced (~300ms); modalidade e categoria aplicam imediatamente.
 */
export function DocumentsToolbar({ categories }: DocumentsToolbarProps) {
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

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParam("q", value.trim() ? value : null);
    }, SEARCH_DEBOUNCE_MS);
  }

  return (
    <HStack gap={3} wrap="wrap" vAlign="end">
      <TextInput
        label="Buscar"
        placeholder="Nome do documento…"
        value={search}
        onChange={handleSearchChange}
        hasClear
        width={260}
      />
      <Selector
        label="Modalidade"
        placeholder="Todas as modalidades"
        hasClear
        value={searchParams.get("modalidade")}
        onChange={(value) => updateParam("modalidade", value)}
        options={MODALITY_OPTIONS}
        width={200}
      />
      <Selector
        label="Categoria"
        placeholder="Todas as categorias"
        hasClear
        value={searchParams.get("categoria")}
        onChange={(value) => updateParam("categoria", value)}
        options={categories.map((category) => ({
          value: category.id,
          label: category.name,
        }))}
        renderOption={(option) => {
          const category = categories.find((c) => c.id === option.value);
          return (
            <SelectorOption
              label={
                category ? (
                  <Token label={category.name} color={category.color} size="sm" />
                ) : (
                  option.label
                )
              }
            />
          );
        }}
        width={200}
      />
    </HStack>
  );
}
