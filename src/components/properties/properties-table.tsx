"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SquarePenIcon, Trash2Icon } from "lucide-react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { HStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { formatCurrencyBRL } from "@/src/lib/format";
import { deletePropertyAction } from "@/src/server/actions/properties";
import type { Property, PropertyKind, PropertyStatus } from "@/src/server/data";

const KIND_LABELS: Record<PropertyKind, string> = {
  casa: "Casa",
  apartamento: "Apartamento",
  sobrado: "Sobrado",
  cobertura: "Cobertura",
  terreno: "Terreno",
  sala_comercial: "Sala comercial",
  chacara: "Chácara",
};

const STATUS_LABELS: Record<PropertyStatus, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
};

const STATUS_DOT_VARIANTS: Record<PropertyStatus, "success" | "warning" | "neutral"> = {
  disponivel: "success",
  reservado: "warning",
  vendido: "neutral",
};

interface PropertyRow extends Record<string, unknown> {
  id: string;
  reference: string;
  kind: PropertyKind;
  location: string;
  priceCents: bigint;
  areaSqm: number;
  bedrooms: number;
  status: PropertyStatus;
  published: boolean;
  property: Property;
}

interface PropertiesTableProps {
  properties: Property[];
  /** IMOV-04 AC2/AC3: cosmético — a recusa de verdade é sempre do servidor. */
  canWrite: boolean;
  onEdit: (property: Property) => void;
}

/**
 * Listagem do catálogo de imóveis do tenant ativo em linhas edge-to-edge
 * (lote-11 — IMOV-04/IMOV-05): nunca em cards por linha (`CLAUDE.md`). O
 * filtro/busca acontece no servidor (o RSC de `/imoveis` lê `searchParams`);
 * esta tabela apresenta o resultado recebido via props. O menu de linha
 * (editar/excluir) só é renderizado quando `canWrite` é verdadeiro — molde
 * direto de `documents-table.tsx`.
 */
export function PropertiesTable({ properties, canWrite, onEdit }: PropertiesTableProps) {
  const router = useRouter();
  const [deletingProperty, setDeletingProperty] = useState<Property | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const rows: PropertyRow[] = properties.map((property) => ({
    id: property.id,
    reference: property.reference,
    kind: property.kind,
    location: `${property.neighborhood}, ${property.city}`,
    priceCents: property.priceCents,
    areaSqm: property.areaSqm,
    bedrooms: property.bedrooms,
    status: property.status,
    published: property.published,
    property,
  }));

  async function handleConfirmDelete() {
    if (!deletingProperty) return;
    setIsDeleting(true);
    setDeleteError(null);

    const result = await deletePropertyAction({
      propertyId: deletingProperty.id,
    });

    setIsDeleting(false);

    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }

    setDeletingProperty(null);
    router.refresh();
  }

  const columns: TableColumn<PropertyRow>[] = [
    {
      key: "reference",
      header: "Referência",
      width: pixel(110),
      renderCell: (row) => (
        <Text type="body" weight="medium">
          {row.reference}
        </Text>
      ),
    },
    {
      key: "kind",
      header: "Tipo",
      width: proportional(1),
      renderCell: (row) => <Text type="body">{KIND_LABELS[row.kind]}</Text>,
    },
    {
      key: "location",
      header: "Bairro / cidade",
      width: proportional(2),
      renderCell: (row) => <Text type="body">{row.location}</Text>,
    },
    {
      key: "priceCents",
      header: "Preço",
      width: pixel(150),
      renderCell: (row) => <Text type="body">{formatCurrencyBRL(row.priceCents)}</Text>,
    },
    {
      key: "areaSqm",
      header: "Área",
      width: pixel(90),
      renderCell: (row) => <Text type="body">{row.areaSqm} m²</Text>,
    },
    {
      key: "bedrooms",
      header: "Dormitórios",
      width: pixel(110),
      renderCell: (row) => <Text type="body">{row.bedrooms}</Text>,
    },
    {
      key: "status",
      header: "Status",
      width: pixel(150),
      renderCell: (row) => (
        <HStack gap={2} vAlign="center">
          <StatusDot
            variant={STATUS_DOT_VARIANTS[row.status]}
            label={STATUS_LABELS[row.status]}
          />
          <Text type="body">{STATUS_LABELS[row.status]}</Text>
        </HStack>
      ),
    },
    {
      key: "published",
      header: "Publicação",
      width: pixel(130),
      renderCell: (row) => (
        <Badge
          label={row.published ? "Publicado" : "Não publicado"}
          variant={row.published ? "success" : "neutral"}
        />
      ),
    },
  ];

  if (canWrite) {
    columns.push({
      key: "actions",
      header: "",
      width: pixel(140),
      renderCell: (row) => (
        <DropdownMenu
          button={{ label: "Ações", variant: "ghost", size: "sm" }}
          items={[
            {
              label: "Editar",
              icon: <SquarePenIcon size={16} />,
              onClick: () => onEdit(row.property),
            },
            { type: "divider" },
            {
              label: "Excluir",
              icon: <Trash2Icon size={16} />,
              onClick: () => {
                setDeleteError(null);
                setDeletingProperty(row.property);
              },
            },
          ]}
        />
      ),
    });
  }

  return (
    <>
      <Card padding={0}>
        <Table
          data={rows}
          columns={columns}
          idKey="id"
          density="compact"
          dividers="rows"
          hasHover
        />
      </Card>

      <AlertDialog
        isOpen={deletingProperty !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setDeletingProperty(null);
            setDeleteError(null);
          }
        }}
        title="Excluir imóvel?"
        description={
          deleteError ??
          `"${deletingProperty?.reference ?? ""}" será removido permanentemente. Esta ação não pode ser desfeita.`
        }
        actionLabel="Excluir"
        actionVariant="destructive"
        isActionLoading={isDeleting}
        onAction={handleConfirmDelete}
      />
    </>
  );
}
