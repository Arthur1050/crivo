"use client";

import { MODALITY, PROPERTY_KIND, PROPERTY_STATUS } from "../../verticals/real-estate/vocabulary";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import type { Modality, PropertyKind, PropertyStatus } from "@/src/verticals/real-estate/data/properties";

const STATUS_OPTIONS: { value: PropertyStatus; label: string }[] = [
  { value: PROPERTY_STATUS.available, label: "Disponível" },
  { value: PROPERTY_STATUS.reserved, label: "Reservado" },
  { value: PROPERTY_STATUS.sold, label: "Vendido" },
];

const PUBLISHED_OPTIONS: { value: string; label: string }[] = [
  { value: "true", label: "Publicado" },
  { value: "false", label: "Não publicado" },
];

const KIND_OPTIONS: { value: PropertyKind; label: string }[] = [
  { value: PROPERTY_KIND.house, label: "Casa" },
  { value: PROPERTY_KIND.apartment, label: "Apartamento" },
  { value: PROPERTY_KIND.townhouse, label: "Sobrado" },
  { value: PROPERTY_KIND.penthouse, label: "Cobertura" },
  { value: PROPERTY_KIND.land, label: "Terreno" },
  { value: PROPERTY_KIND.commercial_room, label: "Sala comercial" },
  { value: PROPERTY_KIND.farmhouse, label: "Chácara" },
];

const MODALITY_OPTIONS: { value: Modality; label: string }[] = [
  { value: MODALITY.new, label: "Novo" },
  { value: MODALITY.used, label: "Usado" },
  { value: MODALITY.both, label: "Ambos" },
];

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Barra de filtros/busca de `/imoveis` (lote-11 — IMOV-01). Molde direto de
 * `documents-toolbar.tsx`: cada filtro escreve seu parâmetro na URL
 * (`status`, `publicado`, `tipo`, `modalidade`, `q`) via `router.replace`,
 * para que o RSC da página releia `searchParams` e refaça a consulta
 * filtrada no servidor — nenhum filtro é aplicado no client. A busca por
 * bairro/cidade é debounced (~300ms); os seletores aplicam imediatamente.
 */
export function PropertiesToolbar() {
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
        placeholder="Bairro ou cidade…"
        value={search}
        onChange={handleSearchChange}
        hasClear
        width={260}
      />
      <Selector
        label="Status"
        placeholder="Todos os status"
        hasClear
        value={searchParams.get("status")}
        onChange={(value) => updateParam("status", value)}
        options={STATUS_OPTIONS}
        width={180}
      />
      <Selector
        label="Publicação"
        placeholder="Todas"
        hasClear
        value={searchParams.get("publicado")}
        onChange={(value) => updateParam("publicado", value)}
        options={PUBLISHED_OPTIONS}
        width={160}
      />
      <Selector
        label="Tipo"
        placeholder="Todos os tipos"
        hasClear
        value={searchParams.get("tipo")}
        onChange={(value) => updateParam("tipo", value)}
        options={KIND_OPTIONS}
        width={200}
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
    </HStack>
  );
}
