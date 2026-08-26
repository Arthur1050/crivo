"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { createLocalAccountIssuer } from "@better-auth/core/db";
import { db } from "../../db";
import { tenant_invitations } from "../../db/schema";
import { auth } from "../auth/config";
import { findUserByEmail, getInvitation } from "../data";

/**
 * Aceite de convite (spec.md — USER-01 AC6/AC7 e o Edge Case do convite aberto
 * por outra conta autenticada).
 *
 * Esta é a única action do CRM que roda **sem sessão**: quem a chama é
 * justamente quem ainda não tem uma. A autorização dela é o próprio token —
 * um uuid emitido pelo administrador, de uso único e com validade.
 */

export type AcceptInvitationResult =
  | { ok: true; needsLogin: false }
  /** Usuário já tinha senha (foi convidado para uma segunda imobiliária). */
  | { ok: true; needsLogin: true }
  | { ok: false; error: string };

/** Mesma mensagem para token inexistente, usado e expirado: quem abre um link
 * inválido não precisa saber em qual dos três casos caiu, e a instrução é a
 * mesma nos três (USER-01 AC7). */
const INVALID_INVITATION =
  "Este convite não vale mais. Peça um novo convite ao administrador da imobiliária.";

const MIN_PASSWORD_LENGTH = 8;

export interface AcceptInvitationInput {
  token: string;
  password: string;
}

export async function acceptInvitationAction(
  input: AcceptInvitationInput
): Promise<AcceptInvitationResult> {
  const invitation = await getInvitation(input.token);

  // Token inexistente, já usado ou expirado caem todos aqui: `isUsable`
  // resolve os três (`src/server/data/index.ts`).
  if (!invitation || !invitation.isUsable) {
    return { ok: false, error: INVALID_INVITATION };
  }

  const user = await findUserByEmail(invitation.email);
  if (!user) return { ok: false, error: INVALID_INVITATION };

  // Edge case da spec: o convite foi aberto por alguém já autenticado com
  // OUTRA conta. A sessão corrente é encerrada antes de qualquer ativação —
  // senão a pessoa acabaria navegando o CRM com a identidade errada.
  const requestHeaders = await headers();
  const current = await auth.api.getSession({ headers: requestHeaders });
  if (current && current.user.id !== user.id) {
    await auth.api.signOut({ headers: requestHeaders });
  }

  const context = await auth.$context;
  const existingCredential =
    await context.internalAdapter.findCredentialAccount(user.id);

  if (existingCredential) {
    // Quem já tem senha foi convidado para uma segunda imobiliária: o vínculo
    // nasceu com o convite e já vale. Não há senha a definir — e trocar a
    // senha dele por um link de convite seria uma redefinição disfarçada.
    await markAccepted(invitation.id);
    return { ok: true, needsLogin: true };
  }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }

  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    issuer: createLocalAccountIssuer("credential"),
    password: await context.password.hash(input.password),
  });

  await markAccepted(invitation.id);

  // AC6: ativar e **criar a sessão dele**. O `nextCookies()` (último plugin da
  // configuração) aplica o cookie emitido aqui na resposta da server action.
  await auth.api.signInEmail({
    body: { email: invitation.email, password: input.password },
  });

  return { ok: true, needsLogin: false };
}

async function markAccepted(invitationId: string): Promise<void> {
  await db
    .update(tenant_invitations)
    .set({ status: "accepted" })
    .where(eq(tenant_invitations.id, invitationId));
}
