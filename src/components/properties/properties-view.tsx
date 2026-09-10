"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { NavLink } from "@/src/components/shared/nav-link";
import {
  PropertyFormDialog,
  type CaptadorOption,
} from "@/src/components/properties/property-form-dialog";
import { PropertiesTable } from "@/src/components/properties/properties-table";
import type { Property } from "@/src/server/data";

export interface PropertiesEmptyState {
  title: string;
  description: string;
  showClearFilters: boolean;
}

interface PropertiesViewProps {
  properties: Property[];
  captadores: CaptadorOption[];
  canWrite: boolean;
  /** `null` quando há imóveis a listar; caso contrário, qual dos dois vazios mostrar. */
  emptyState: PropertiesEmptyState | null;
}

type FormTarget = "closed" | "create" | Property;

/**
 * Coordena a interatividade de `/imoveis` (lote-11 — IMOV-01/04): o botão
 * "Novo imóvel" e o menu de editar de cada linha da tabela abrem o MESMO
 * `PropertyFormDialog` (T17 — um diálogo só serve criação e edição), então o
 * estado de qual alvo está aberto vive aqui, num componente client — o RSC de
 * `page.tsx` não pode segurar state.
 */
export function PropertiesView({
  properties,
  captadores,
  canWrite,
  emptyState,
}: PropertiesViewProps) {
  const [formTarget, setFormTarget] = useState<FormTarget>("closed");

  return (
    <VStack gap={4}>
      {canWrite && (
        <HStack hAlign="end">
          <Button
            label="Novo imóvel"
            variant="primary"
            icon={<PlusIcon size={16} />}
            onClick={() => setFormTarget("create")}
          />
        </HStack>
      )}

      {emptyState ? (
        <EmptyState
          title={emptyState.title}
          description={emptyState.description}
          actions={
            emptyState.showClearFilters ? (
              <NavLink href="/imoveis" isStandalone>
                Limpar filtros
              </NavLink>
            ) : undefined
          }
        />
      ) : (
        <PropertiesTable
          properties={properties}
          canWrite={canWrite}
          onEdit={(property) => setFormTarget(property)}
        />
      )}

      <PropertyFormDialog
        isOpen={formTarget !== "closed"}
        property={formTarget === "create" || formTarget === "closed" ? null : formTarget}
        captadores={captadores}
        onOpenChange={(isOpen) => {
          if (!isOpen) setFormTarget("closed");
        }}
      />
    </VStack>
  );
}
