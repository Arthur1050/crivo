"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "../auth/session";
import { getTenantMemberById, setMemberWorkWindow } from "../data";
import {
  validateWorkWindow,
  type WorkWindowField,
} from "../../lib/work-window";

/**
 * Edição da janela de trabalho de um corretor (spec.md — AGENDA-01).
 *
 * A regra de quem pode salvar é própria desta story, não da matriz de
 * permissões: **o próprio corretor salva a sua** (AC1) e **administrador ou
 * gestor salvam a de qualquer um** (AC6) — o gestor precisa corrigir a agenda
 * de quem está de férias, e por isso `usuarios/escrever` (exclusivo do
 * administrador) não serve como guarda aqui.
 *
 * Como em `users.ts`, a imobiliária vem da sessão e nunca do `input`: um
 * `memberId` de outra imobiliária simplesmente não é encontrado.
 */

export type SaveWorkWindowResult =
  | { ok: true }
  | { ok: false; error: string; field?: WorkWindowField };

export interface SaveWorkWindowInput {
  memberId: string;
  days: number[];
  start: string;
  end: string;
}

/** Papéis que administram a agenda de terceiros (AGENDA-01 AC6). */
const MANAGES_OTHERS = ["administrador", "gestor"] as const;

export async function saveWorkWindowAction(
  input: SaveWorkWindowInput
): Promise<SaveWorkWindowResult> {
  const session = await verifySession();
  const member = await getTenantMemberById(session.tenantId, input.memberId);

  if (!member) {
    return { ok: false, error: "Usuário não encontrado." };
  }

  const isSelf = member.userId === session.user.id;
  const managesOthers = session.roles.some((role) =>
    (MANAGES_OTHERS as readonly string[]).includes(role)
  );

  // AC7: recusa no SERVIDOR, mesmo que o controle não estivesse na tela.
  if (!isSelf && !managesOthers) {
    // Mesma linha estruturada das demais negativas de permissão do produto
    // (PERM-01 AC6): usuário, imobiliária ativa e recurso negado.
    console.warn(
      JSON.stringify({
        event: "permissao-negada",
        userId: session.user.id,
        userEmail: session.user.email,
        tenantId: session.tenantId,
        roles: session.roles,
        resource: "janela-de-trabalho",
        action: "escrever",
      })
    );
    return {
      ok: false,
      error: "Sem permissão para editar a janela de trabalho de outro usuário.",
    };
  }

  const validation = validateWorkWindow({
    days: input.days,
    start: input.start,
    end: input.end,
  });

  if (!validation.ok) {
    return { ok: false, error: validation.message, field: validation.field };
  }

  await setMemberWorkWindow(session.tenantId, member.memberId, {
    days: input.days,
    start: input.start,
    end: input.end,
  });

  revalidatePath("/usuarios");
  return { ok: true };
}
