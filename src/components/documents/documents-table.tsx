"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DownloadIcon, EyeIcon, RefreshCwIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { Token } from "@astryxdesign/core/Token";
import { DocumentPreviewDialog } from "@/src/components/documents/document-preview-dialog";
import {
  deriveDocumentState,
  deriveRowActions,
  describeFailure,
  documentDownloadPath,
} from "@/src/components/documents/document-row-state";
import { EditDocumentDialog } from "@/src/components/documents/edit-document-dialog";
import { FileTypeIcon } from "@/src/components/documents/file-type-icon";
import { formatFileSize } from "@/src/lib/format";
import { deleteDocumentAction, retryDocumentAction } from "@/src/server/actions/documents";
import type { Document, DocumentCategory, Modality } from "@/src/server/data";

/** O texto extraído nunca chega ao cliente pela listagem (T27, DOCVIEW-01). */
export type DocumentTableItem = Omit<Document, "extractedText">;

const MODALITY_LABELS: Record<Modality, string> = {
  novo: "Novo",
  usado: "Usado",
  ambos: "Ambos",
};

const MODALITY_BADGE_VARIANT: Record<Modality, "blue" | "purple" | "teal"> = {
  novo: "blue",
  usado: "purple",
  ambos: "teal",
};

const NO_CATEGORY_LABEL = "Sem categoria";
/** `expiresAt` é nullable (reserva LGPD do schema) — RD-05 AC2. */
const NO_EXPIRY_LABEL = "Sem validade";

interface DocumentRow extends Record<string, unknown> {
  id: string;
  name: string;
  modality: Modality;
  category: DocumentCategory | null;
  sizeBytes: bigint;
  uploadedAt: string;
  expiresAt: string | null;
  document: DocumentTableItem;
}

interface DocumentsTableProps {
  documents: DocumentTableItem[];
  categories: DocumentCategory[];
  /**
   * Reflete `documentos:escrever`. Esconder um botão é conveniência de
   * interface: cada rota e action revalida permissão e tenant por conta
   * própria, então a API segue sendo a autoridade.
   */
  canWrite: boolean;
}

/**
 * Listagem de documentos do tenant ativo em linhas edge-to-edge (lote-2 —
 * DOC-01/04/05): nunca em cards por linha. O filtro/busca acontece no servidor
 * (RSC lê `searchParams` e consulta o banco já filtrado); esta tabela
 * apresenta o resultado recebido via props e expõe as ações de editar/excluir
 * por linha.
 *
 * Recomposta em redesign-crm-astryx (RD-05 AC2, design.md § R3): colunas
 * Nome (ícone de arquivo + nome), Modalidade, Categoria, Enviado em,
 * Validade, Tamanho e Ações, em densidade compacta dentro de um card único.
 * Nenhuma ação muda — só a composição (RD-05 AC3).
 */
export function DocumentsTable({ documents, categories, canWrite }: DocumentsTableProps) {
  const router = useRouter();
  const [editingDocument, setEditingDocument] = useState<DocumentTableItem | null>(null);
  const [deletingDocument, setDeletingDocument] = useState<DocumentTableItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentTableItem | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  const categoryById = new Map(
    categories.map((category) => [category.id, category])
  );

  const rows: DocumentRow[] = documents.map((document) => ({
    id: document.id,
    name: document.name,
    modality: document.modality,
    category: document.categoryId
      ? categoryById.get(document.categoryId) ?? null
      : null,
    sizeBytes: document.sizeBytes,
    uploadedAt: document.uploadedAt.toISOString(),
    expiresAt: document.expiresAt ? document.expiresAt.toISOString() : null,
    document,
  }));

  async function handleConfirmDelete() {
    if (!deletingDocument) return;
    setIsDeleting(true);
    setDeleteError(null);

    const result = await deleteDocumentAction({
      documentId: deletingDocument.id,
    });

    setIsDeleting(false);

    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }

    setDeletingDocument(null);
    router.refresh();
  }

  async function handleRetry(document: DocumentTableItem) {
    setRetryError(null);
    const result = await retryDocumentAction({ documentId: document.id });
    if (!result.ok) {
      setRetryError(result.error);
      return;
    }
    router.refresh();
  }

  const columns: TableColumn<DocumentRow>[] = [
    {
      key: "name",
      header: "Nome",
      width: proportional(2),
      renderCell: (row) => (
        <HStack gap={2} vAlign="center">
          <FileTypeIcon mimeType={row.document.mimeType} />
          <Text type="body" weight="medium">
            {row.name}
          </Text>
        </HStack>
      ),
    },
    {
      key: "modality",
      header: "Modalidade",
      width: proportional(1),
      renderCell: (row) => (
        <Badge
          label={MODALITY_LABELS[row.modality]}
          variant={MODALITY_BADGE_VARIANT[row.modality]}
        />
      ),
    },
    {
      key: "category",
      header: "Categoria",
      width: proportional(1),
      renderCell: (row) =>
        row.category ? (
          <Token label={row.category.name} color={row.category.color} size="sm" />
        ) : (
          <Text type="body" color="secondary">
            {NO_CATEGORY_LABEL}
          </Text>
        ),
    },
    {
      key: "status",
      header: "Estado",
      width: pixel(170),
      renderCell: (row) => {
        const presentation = deriveDocumentState(row.document);
        return (
          <HStack gap={2} vAlign="center">
            <StatusDot
              variant={presentation.variant}
              label={presentation.label}
              tooltip={
                presentation.state === "falha"
                  ? describeFailure(row.document.failureCode)
                  : presentation.description
              }
              isPulsing={presentation.state === "processando"}
            />
            <Text type="body">{presentation.label}</Text>
          </HStack>
        );
      },
    },
    {
      key: "uploadedAt",
      header: "Enviado em",
      width: pixel(160),
      renderCell: (row) => <Timestamp value={row.uploadedAt} format="date" />,
    },
    {
      key: "expiresAt",
      header: "Validade",
      width: pixel(160),
      renderCell: (row) =>
        row.expiresAt ? (
          <Timestamp value={row.expiresAt} format="date_time" />
        ) : (
          <Text type="supporting" color="secondary">
            {NO_EXPIRY_LABEL}
          </Text>
        ),
    },
    {
      key: "sizeBytes",
      header: "Tamanho",
      width: pixel(110),
      renderCell: (row) => <Text type="body">{formatFileSize(row.sizeBytes)}</Text>,
    },
    {
      key: "actions",
      header: "",
      // 140px (não os 72px originais) — o botão "Ações" com label + chevron
      // precisa de ~87px e transbordava a coluna, encostando na borda direita
      // da área de conteúdo (lote-3 — UI-01); a largura extra também garante
      // o respiro visível pedido no AC.
      width: pixel(140),
      renderCell: (row) => {
        const { state } = deriveDocumentState(row.document);
        const actions = deriveRowActions(state, canWrite);
        const items = [];

        if (actions.canPreview) {
          items.push({
            label: "Visualizar texto",
            icon: <EyeIcon size={16} />,
            onClick: () => setPreviewDocument(row.document),
          });
        }
        if (actions.canDownload) {
          items.push({
            label: "Baixar original",
            icon: <DownloadIcon size={16} />,
            // A rota autenticada responde com Content-Disposition: attachment,
            // então a navegação vira download sem sair da página.
            onClick: () => window.location.assign(documentDownloadPath(row.id)),
          });
        }
        if (actions.canRetry) {
          items.push({
            label: "Reprocessar",
            icon: <RefreshCwIcon size={16} />,
            onClick: () => void handleRetry(row.document),
          });
        }
        if (actions.canEdit) {
          items.push({
            label: "Editar",
            icon: <SquarePenIcon size={16} />,
            onClick: () => setEditingDocument(row.document),
          });
        }
        if (actions.canDelete) {
          if (items.length > 0) items.push({ type: "divider" as const });
          items.push({
            label: "Excluir",
            icon: <Trash2Icon size={16} />,
            onClick: () => {
              setDeleteError(null);
              setDeletingDocument(row.document);
            },
          });
        }

        if (items.length === 0) {
          return (
            <Text type="supporting" color="secondary">
              Sem ações
            </Text>
          );
        }
        return <DropdownMenu button={{ label: "Ações", variant: "ghost", size: "sm" }} items={items} />;
      },
    },
  ];

  return (
    <>
      {/*
        Card único envolvendo a tabela densa edge-to-edge (design.md § R3):
        `padding={0}` para que as linhas encostem na borda do card — o card é
        só o contêiner da tabela, nunca um invólucro por linha.
      */}
      <VStack gap={3}>
        {retryError && <Banner status="error" title={retryError} />}
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
      </VStack>

      <DocumentPreviewDialog
        documentId={previewDocument?.id ?? null}
        documentName={previewDocument?.name ?? ""}
        isOpen={previewDocument !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPreviewDocument(null);
        }}
      />

      <EditDocumentDialog
        document={editingDocument}
        categories={categories}
        onClose={() => setEditingDocument(null)}
      />

      <AlertDialog
        isOpen={deletingDocument !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setDeletingDocument(null);
            setDeleteError(null);
          }
        }}
        title="Excluir documento?"
        description={
          deleteError ??
          `"${deletingDocument?.name ?? ""}" será removido permanentemente. Esta ação não pode ser desfeita.`
        }
        actionLabel="Excluir"
        actionVariant="destructive"
        isActionLoading={isDeleting}
        onAction={handleConfirmDelete}
      />
    </>
  );
}
