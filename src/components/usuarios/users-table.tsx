"use client";

import { useState } from "react";
import { MailIcon, ShieldIcon, UserMinusIcon } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { DeactivateMemberDialog } from "@/src/components/usuarios/deactivate-member-dialog";
import { MemberRolesDialog } from "@/src/components/usuarios/member-roles-dialog";
import { ResendInviteDialog } from "@/src/components/usuarios/resend-invite-dialog";
import type { Role } from "@/src/lib/permissions";

export interface MemberRow extends Record<string, unknown> {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  roles: Role[];
  workDays: number[] | null;
  workHoursStart: string | null;
  workHoursEnd: string | null;
  inviteState: "pendente" | "ativo";
  isDeactivated: boolean;
}

const ROLE_LABELS: Record<Role, string> = {
  administrador: "Administrador",
  gestor: "Gestor",
  corretor: "Corretor",
};

const ROLE_COLORS: Record<Role, "purple" | "blue" | "teal"> = {
  administrador: "purple",
  gestor: "blue",
  corretor: "teal",
};

// ISO 1(segunda)–7(domingo), mesma convenção do schema e do formulário de
// Configurações.
const WEEKDAY_SHORT: Record<number, string> = {
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
  7: "Dom",
};

function formatWorkWindow(row: MemberRow): string | null {
  if (!row.workDays || row.workDays.length === 0) return null;
  if (!row.workHoursStart || !row.workHoursEnd) return null;
  const days = [...row.workDays]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_SHORT[day] ?? String(day))
    .join(", ");
  return `${days} · ${row.workHoursStart}–${row.workHoursEnd}`;
}

interface UsersTableProps {
  members: MemberRow[];
}

/**
 * Equipe da imobiliária em linhas densas edge-to-edge (AGENTS.md: dado denso
 * é linha, nunca um card por pessoa). Um card único envolve a tabela, com
 * `padding={0}` para as linhas encostarem na borda — o mesmo tratamento da
 * tabela de Documentos.
 */
export function UsersTable({ members }: UsersTableProps) {
  const [rolesTarget, setRolesTarget] = useState<MemberRow | null>(null);
  const [resendTarget, setResendTarget] = useState<MemberRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<MemberRow | null>(
    null
  );

  // Só corretor ativo pode receber carteira (USER-01 AC10).
  const activeBrokers = members
    .filter(
      (member) => !member.isDeactivated && member.roles.includes("corretor")
    )
    .map((member) => ({ userId: member.userId, name: member.name }));

  const columns: TableColumn<MemberRow>[] = [
    {
      key: "name",
      header: "Nome",
      width: proportional(2),
      renderCell: (row) => (
        <VStack gap={0}>
          <Text type="body" weight="medium">
            {row.name}
          </Text>
          <Text type="supporting" color="secondary">
            {row.email}
          </Text>
        </VStack>
      ),
    },
    {
      key: "roles",
      header: "Papéis",
      width: proportional(2),
      renderCell: (row) => (
        <HStack gap={1} wrap="wrap">
          {row.roles.map((role) => (
            <Token
              key={role}
              label={ROLE_LABELS[role]}
              color={ROLE_COLORS[role]}
              size="sm"
            />
          ))}
        </HStack>
      ),
    },
    {
      key: "workWindow",
      header: "Janela de trabalho",
      width: proportional(2),
      renderCell: (row) => {
        const workWindow = formatWorkWindow(row);
        return workWindow ? (
          <Text type="body">{workWindow}</Text>
        ) : (
          <Text type="supporting" color="secondary">
            Não declarada
          </Text>
        );
      },
    },
    {
      key: "inviteState",
      header: "Situação",
      width: pixel(180),
      renderCell: (row) =>
        row.isDeactivated ? (
          <Badge label="Desativado" variant="neutral" />
        ) : row.inviteState === "pendente" ? (
          <HStack gap={2} vAlign="center">
            <StatusDot variant="warning" label="Convite pendente" />
            <Text type="body">Convite pendente</Text>
          </HStack>
        ) : (
          <HStack gap={2} vAlign="center">
            <StatusDot variant="success" label="Ativo" />
            <Text type="body">Ativo</Text>
          </HStack>
        ),
    },
    {
      key: "actions",
      header: "",
      width: pixel(140),
      renderCell: (row) =>
        row.isDeactivated ? (
          // Vínculo desativado não volta por esta tela: reativar é assunto de
          // outro lote, e oferecer a ação sem ter a operação seria mentira.
          <Text type="supporting" color="secondary">
            Sem ações
          </Text>
        ) : (
          <DropdownMenu
            button={{ label: "Ações", variant: "ghost", size: "sm" }}
            items={[
              {
                label: "Alterar papéis",
                icon: <ShieldIcon size={16} />,
                onClick: () => setRolesTarget(row),
              },
              {
                label: "Reenviar convite",
                icon: <MailIcon size={16} />,
                onClick: () => setResendTarget(row),
              },
              { type: "divider" },
              {
                label: "Desativar",
                icon: <UserMinusIcon size={16} />,
                onClick: () => setDeactivateTarget(row),
              },
            ]}
          />
        ),
    },
  ];

  return (
    <>
      <Card padding={0}>
        <Table
          data={members}
          columns={columns}
          idKey="memberId"
          density="compact"
          dividers="rows"
          hasHover
        />
      </Card>

      <MemberRolesDialog
        member={rolesTarget}
        onClose={() => setRolesTarget(null)}
      />

      <ResendInviteDialog
        member={resendTarget}
        onClose={() => setResendTarget(null)}
      />

      <DeactivateMemberDialog
        member={deactivateTarget}
        brokers={activeBrokers}
        onClose={() => setDeactivateTarget(null)}
      />
    </>
  );
}
