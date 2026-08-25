"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "../auth/session";
import { denyIfForbidden } from "./permission";
import { assignBroker, type BrokerLoad } from "../../lib/broker-assignment";
import {
  countActiveAdministrators,
  deactivateMembership,
  getActiveLeadsOfMember,
  getBrokerLoads,
  getTenantMemberById,
  getUpcomingMeetingsOfMember,
  transferCarteiraAndDeactivate,
  updateLeadBroker,
} from "../data";

/**
 * Desativação de usuário com destino da carteira (spec.md — USER-02).
 *
 * Desativar nunca apaga: o vínculo ganha `deactivatedAt`, o usuário sai de
 * toda lista de atribuição e continua nomeado nos leads que já atendeu
 * (USER-01 AC10). O que a desativação decide é o destino da carteira ATIVA —
 * e essa decisão é obrigatória quando existe carteira ativa, porque é
 * exatamente aí que um cliente ficaria sem atendimento.
 */

export type CarteiraDestination =
  | { tipo: "transferir"; corretorId: string }
  | { tipo: "redistribuir" }
  | { tipo: "manter" };

export interface DeactivateMemberInput {
  memberId: string;
  destino?: CarteiraDestination;
}

export type DeactivateResult =
  | { ok: true; leadsAtivos: number; leadsReatribuidos: number }
  | {
      ok: false;
      error: string;
      /** Verdadeiro quando falta escolher o destino da carteira (AC1). */
      escolhaDeCarteiraObrigatoria?: true;
      leadsAtivos?: number;
    };

/**
 * Tudo que a tela precisa mostrar antes de confirmar a desativação: quantos
 * leads ativos o corretor tem e quais reuniões futuras já estão marcadas com
 * ele (spec.md — Edge Cases). Leitura pura, nada é escrito.
 */
export interface DeactivationPreview {
  memberId: string;
  name: string;
  leadsAtivos: { id: string; name: string }[];
  reunioesFuturas: { leadId: string; leadName: string; meetingAt: Date }[];
}

export async function getDeactivationPreviewAction(input: {
  memberId: string;
}): Promise<
  { ok: true; preview: DeactivationPreview } | { ok: false; error: string }
> {
  const denied = await denyIfForbidden("usuarios", "escrever");
  if (denied) return denied;

  const session = await verifySession();
  const member = await getTenantMemberById(session.tenantId, input.memberId);
  if (!member) return { ok: false, error: "Usuário não encontrado." };

  const [ativos, reunioes] = await Promise.all([
    getActiveLeadsOfMember(session.tenantId, member.userId),
    getUpcomingMeetingsOfMember(session.tenantId, member.userId),
  ]);

  return {
    ok: true,
    preview: {
      memberId: member.memberId,
      name: member.name,
      leadsAtivos: ativos.map((lead) => ({ id: lead.id, name: lead.name })),
      reunioesFuturas: reunioes,
    },
  };
}

export async function deactivateMemberAction(
  input: DeactivateMemberInput
): Promise<DeactivateResult> {
  const denied = await denyIfForbidden("usuarios", "escrever");
  if (denied) return denied;

  const session = await verifySession();
  const member = await getTenantMemberById(session.tenantId, input.memberId);

  if (!member) return { ok: false, error: "Usuário não encontrado." };
  if (member.deactivatedAt) {
    return { ok: false, error: "Este usuário já está desativado." };
  }

  // AC8 da task / Edge Case do último administrador: vale inclusive quando o
  // administrador tenta desativar a si mesmo, porque a regra olha o vínculo,
  // não quem está pedindo.
  if (member.roles.includes("administrador")) {
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

  const ativos = await getActiveLeadsOfMember(session.tenantId, member.userId);

  // AC6: sem carteira ativa, desativa direto e não pergunta nada.
  if (ativos.length === 0) {
    await deactivateMembership(session.tenantId, member.memberId);
    revalidatePath("/usuarios");
    revalidatePath("/pipeline");
    return { ok: true, leadsAtivos: 0, leadsReatribuidos: 0 };
  }

  // AC1: com carteira ativa, a escolha do destino é obrigatória.
  if (!input.destino) {
    return {
      ok: false,
      error:
        "Escolha o destino da carteira antes de desativar: transferir, redistribuir ou manter.",
      escolhaDeCarteiraObrigatoria: true,
      leadsAtivos: ativos.length,
    };
  }

  if (input.destino.tipo === "transferir") {
    if (input.destino.corretorId === member.userId) {
      return {
        ok: false,
        error: "Escolha um corretor diferente para receber a carteira.",
      };
    }

    // AC2 + AC7: transferência e desativação numa transação só, com o vínculo
    // do destino travado. Ou tudo acontece, ou nada acontece.
    const result = await transferCarteiraAndDeactivate({
      tenantId: session.tenantId,
      memberId: member.memberId,
      fromUserId: member.userId,
      toUserId: input.destino.corretorId,
      now: new Date(),
    });

    if (!result.ok) {
      return {
        ok: false,
        error:
          "O corretor escolhido não está mais disponível. Nenhum lead foi transferido.",
      };
    }

    revalidatePath("/usuarios");
    revalidatePath("/pipeline");
    return {
      ok: true,
      leadsAtivos: ativos.length,
      leadsReatribuidos: result.moved,
    };
  }

  if (input.destino.tipo === "redistribuir") {
    // Candidatos são os corretores ATIVOS da imobiliária, menos quem está
    // saindo. `getBrokerLoads` já exclui vínculo desativado.
    const candidates: BrokerLoad[] = (
      await getBrokerLoads(session.tenantId)
    ).filter((candidate) => candidate.id !== member.userId);

    if (candidates.length === 0) {
      return {
        ok: false,
        error:
          "Não há outro corretor ativo para receber a carteira. Escolha manter os leads.",
      };
    }

    let reatribuidos = 0;

    for (const lead of ativos) {
      const chosen = assignBroker(candidates);
      if (!chosen) break;

      const updated = await updateLeadBroker(
        session.tenantId,
        lead.id,
        chosen
      );
      if (!updated) continue;

      reatribuidos += 1;
      // AC3: a carga é recalculada A CADA lead — o corretor que acabou de
      // receber entra mais pesado na escolha do próximo.
      const candidate = candidates.find((c) => c.id === chosen);
      if (candidate) candidate.activeLeads += 1;
    }

    await deactivateMembership(session.tenantId, member.memberId);
    revalidatePath("/usuarios");
    revalidatePath("/pipeline");
    return {
      ok: true,
      leadsAtivos: ativos.length,
      leadsReatribuidos: reatribuidos,
    };
  }

  // AC4: manter preserva a atribuição. O sinal de "responsável inativo" é
  // derivado do vínculo desativado (`LeadWithBroker.brokerDeactivatedAt`),
  // sem tocar em nenhum lead.
  await deactivateMembership(session.tenantId, member.memberId);
  revalidatePath("/usuarios");
  revalidatePath("/pipeline");
  return { ok: true, leadsAtivos: ativos.length, leadsReatribuidos: 0 };
}
