"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "../auth/session";
import { sendInvitationEmail } from "../auth/email";
import { denyIfForbidden } from "./permission";
import { ROLES, type Role } from "../../lib/permissions";
import {
  countActiveAdministrators,
  createInvitation,
  createMembership,
  createPendingUser,
  deleteUser,
  findUserByEmail,
  getMembership,
  getTenant,
  getTenantMemberById,
  setMemberRoles,
} from "../data";
import { validateName } from "../validation";

/**
 * Gestão de usuários da imobiliária (spec.md — USER-01; design.md — Gestão de
 * usuários).
 *
 * Três invariantes valem para todas as actions deste módulo:
 *
 * - **A imobiliária vem da sessão, nunca do `input`** (mesmo padrão de
 *   `documents.ts`). Um `memberId` de outra imobiliária não é encontrado, o
 *   que é o desfecho de "recurso de outra imobiliária" da spec.
 * - **A recusa por permissão é a primeira coisa que acontece** (PERM-01 AC5):
 *   `usuarios/escrever` é exclusivo do administrador, e a checagem roda antes
 *   de qualquer leitura ou escrita.
 * - **Falha de e-mail nunca desfaz escrita** (USER-01 AC4): o convite devolve
 *   `ok: true` com `emailSent: false` e um aviso, e o administrador reenvia.
 */

export type UsersActionResult = { ok: true } | { ok: false; error: string };

export type InviteResult =
  | {
      ok: true;
      memberId: string;
      /** `false` quando o provedor falhou: o usuário existe e o convite é reenviável. */
      emailSent: boolean;
      warning?: string;
    }
  | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): UsersActionResult {
  if (!EMAIL_PATTERN.test(email.trim())) {
    return { ok: false, error: "E-mail inválido." };
  }
  return { ok: true };
}

function validateRoles(roles: Role[]): UsersActionResult {
  if (roles.length === 0) {
    return { ok: false, error: "Escolha ao menos um papel." };
  }
  const unknown = roles.filter((role) => !ROLES.includes(role));
  if (unknown.length > 0) {
    return { ok: false, error: `Papel inválido: ${unknown.join(", ")}.` };
  }
  return { ok: true };
}

/** URL da tela de aceite. `BETTER_AUTH_URL` já é a base canônica do produto. */
function invitationUrl(token: string): string {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/convite/${token}`;
}

export interface InviteUserInput {
  name: string;
  email: string;
  roles: Role[];
}

/**
 * Convida um e-mail para a imobiliária ativa (USER-01 AC1/AC2/AC3/AC4).
 *
 * O usuário nasce **em convite pendente**: linha em `users` sem credencial de
 * senha, mais o vínculo em `tenant_members`. É o mesmo estado do seed, e é o
 * que mantém o convidado elegível a receber lead e reunião antes de aceitar.
 */
export async function inviteUserAction(
  input: InviteUserInput
): Promise<InviteResult> {
  const denied = await denyIfForbidden("usuarios", "escrever");
  if (denied) return denied;

  const nameCheck = validateName(input.name, "Nome");
  if (!nameCheck.ok) return nameCheck;

  const emailCheck = validateEmail(input.email);
  if (!emailCheck.ok) return emailCheck;

  const rolesCheck = validateRoles(input.roles);
  if (!rolesCheck.ok) return rolesCheck;

  const session = await verifySession();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  const existing = await findUserByEmail(email);

  let userId: string;

  if (existing) {
    // AC3: já pertence a ESTA imobiliária — recusa com mensagem própria, sem
    // criar vínculo duplicado.
    const membership = await getMembership(session.tenantId, existing.id);
    if (membership) {
      return {
        ok: false,
        error: "Este e-mail já pertence a esta imobiliária.",
      };
    }
    // AC2: usuário conhecido em OUTRA imobiliária ganha vínculo novo, nunca um
    // segundo usuário — o e-mail é a identidade global.
    userId = existing.id;
  } else {
    userId = (await createPendingUser({ name, email })).id;
  }

  const memberId = await createMembership({
    tenantId: session.tenantId,
    userId,
    roles: input.roles,
  });

  const invitation = await createInvitation({
    tenantId: session.tenantId,
    email,
    roles: input.roles,
    inviterId: session.user.id,
  });

  const tenant = await getTenant(session.tenantId);

  const sent = await sendInvitationEmail({
    to: email,
    name: existing?.name ?? name,
    tenantName: tenant?.name ?? "Crivo",
    url: invitationUrl(invitation.id),
  });

  revalidatePath("/usuarios");

  if (!sent.ok) {
    // AC4: a criação NÃO é desfeita. O convite fica pendente e reenviável.
    return {
      ok: true,
      memberId,
      emailSent: false,
      warning: `Usuário criado, mas o convite não pôde ser enviado (${sent.error}). Use "Reenviar convite".`,
    };
  }

  return { ok: true, memberId, emailSent: true };
}

export interface ResendInviteInput {
  memberId: string;
}

/**
 * Reenvia o convite de um vínculo (USER-01 AC5): emite token novo e invalida o
 * anterior — a invalidação acontece dentro de `createInvitation`, na mesma
 * transação em que o novo token nasce.
 */
export async function resendInviteAction(
  input: ResendInviteInput
): Promise<InviteResult> {
  const denied = await denyIfForbidden("usuarios", "escrever");
  if (denied) return denied;

  const session = await verifySession();
  const member = await getTenantMemberById(session.tenantId, input.memberId);

  if (!member) {
    return { ok: false, error: "Usuário não encontrado." };
  }

  const invitation = await createInvitation({
    tenantId: session.tenantId,
    email: member.email,
    roles: member.roles,
    inviterId: session.user.id,
  });

  const tenant = await getTenant(session.tenantId);

  const sent = await sendInvitationEmail({
    to: member.email,
    name: member.name,
    tenantName: tenant?.name ?? "Crivo",
    url: invitationUrl(invitation.id),
  });

  revalidatePath("/usuarios");

  if (!sent.ok) {
    return {
      ok: true,
      memberId: member.memberId,
      emailSent: false,
      warning: `Convite reemitido, mas o e-mail não pôde ser enviado (${sent.error}).`,
    };
  }

  return { ok: true, memberId: member.memberId, emailSent: true };
}

export interface UpdateMemberRolesInput {
  memberId: string;
  roles: Role[];
}

/**
 * Altera os papéis de um vínculo (USER-01 AC8/AC9).
 *
 * Não existe invalidação de cache de papel a fazer: a guarda de sessão lê
 * `tenant_members` a cada requisição, então o papel novo já vale na requisição
 * seguinte, sem sair e entrar de novo.
 */
export async function updateMemberRolesAction(
  input: UpdateMemberRolesInput
): Promise<UsersActionResult> {
  const denied = await denyIfForbidden("usuarios", "escrever");
  if (denied) return denied;

  const rolesCheck = validateRoles(input.roles);
  if (!rolesCheck.ok) return rolesCheck;

  const session = await verifySession();
  const member = await getTenantMemberById(session.tenantId, input.memberId);

  if (!member) {
    return { ok: false, error: "Usuário não encontrado." };
  }

  // AC9: a imobiliária não pode ficar sem administrador ativo. A contagem
  // ignora o vínculo que está sendo alterado — é justamente ele que deixaria
  // de ser administrador.
  const losesAdmin =
    member.roles.includes("administrador") &&
    !input.roles.includes("administrador");

  if (losesAdmin) {
    const remaining = await countActiveAdministrators(
      session.tenantId,
      member.memberId
    );
    if (remaining === 0) {
      return {
        ok: false,
        error: "A imobiliária precisa de ao menos um administrador ativo.",
      };
    }
  }

  await setMemberRoles(session.tenantId, member.memberId, input.roles);

  revalidatePath("/usuarios");
  return { ok: true };
}

export interface DeleteUserInput {
  memberId: string;
}

/**
 * Exclusão real de um usuário (lote-11 — T9; spec.md Edge Cases). Diferente
 * de `deactivateMemberAction` (USER-02): aqui a linha é apagada de verdade, e
 * a FK `properties.captured_by_user_id` (restrict) é a barreira — se o
 * usuário ainda captar algum imóvel, `deleteUser` traduz a violação numa
 * recusa legível em vez do erro cru do Postgres. Desativar continua
 * funcionando nos dois casos (com ou sem imóvel capturado): esta action não
 * toca `deactivateMembership`.
 */
export async function deleteUserAction(
  input: DeleteUserInput
): Promise<UsersActionResult> {
  const denied = await denyIfForbidden("usuarios", "escrever");
  if (denied) return denied;

  const session = await verifySession();
  const member = await getTenantMemberById(session.tenantId, input.memberId);

  if (!member) {
    return { ok: false, error: "Usuário não encontrado." };
  }

  const result = await deleteUser(member.userId);
  if (!result.ok) {
    const plural = result.propertiesCaptured === 1 ? "imóvel" : "imóveis";
    return {
      ok: false,
      error: `Não é possível excluir: este usuário ainda é captador de ${result.propertiesCaptured} ${plural}. Transfira a captação para outro usuário ou desative-o em vez de excluir.`,
    };
  }

  revalidatePath("/usuarios");
  return { ok: true };
}
