import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { tenant_members } from "../../db/schema";
import {
  can,
  parseRoles,
  type Action,
  type Resource,
  type Role,
} from "../../lib/permissions";
import { auth } from "./config";

/**
 * Guarda de sessão e escopo (design.md — Guarda de sessão e escopo; spec.md
 * AUTH-01, TENANT-01; AD-021).
 *
 * É AQUI que mora a autorização de verdade. O `proxy.ts` faz apenas checagem
 * otimista do cookie: ele prova que existe um cookie, nunca que a sessão vale.
 * Toda leitura de dado do CRM passa por esta camada, o mais perto possível do
 * banco.
 */

// Papéis e leitura do formato do plugin moram em `src/lib/permissions.ts`
// (função pura, testada em vitest, também consumida pela navegação). Este
// módulo os reexporta porque é a superfície de auth que os consumidores já
// importam — uma implementação só, nunca duas cópias.
export { parseRoles, type Role } from "../../lib/permissions";

/**
 * Escopo de leitura de lead. `assignedUserId` preenchido significa "só os
 * leads desta pessoa" (SCOPE-01); `null` significa "toda a imobiliária".
 *
 * O tipo existe para virar erro de compilação: a partir da T17 as funções de
 * leitura de lead deixam de aceitar `tenantId: string` e passam a exigir este
 * objeto, de modo que um call site esquecido não compile em vez de vazar lead
 * de outro corretor silenciosamente.
 */
export interface LeadScope {
  tenantId: string;
  assignedUserId: string | null;
}

export interface AuthContext {
  user: { id: string; name: string; email: string };
  tenantId: string;
  roles: Role[];
  leadScope: LeadScope;
}

export type AuthFailure =
  | { ok: false; reason: "sem-sessao" }
  | { ok: false; reason: "sem-vinculo"; user: AuthContext["user"] };

export type AuthResolution = { ok: true; context: AuthContext } | AuthFailure;

/**
 * Corretor "puro" — o vínculo tem o papel corretor e NENHUM outro. É a
 * condição exata da SCOPE-01: quem acumula gestor + corretor enxerga a
 * imobiliária inteira, porque papéis acumulados são união de permissões, nunca
 * interseção.
 */
function isBrokerOnly(roles: Role[]): boolean {
  return roles.length > 0 && roles.every((role) => role === "corretor");
}

/**
 * Núcleo testável da guarda: resolve quem é o usuário, qual é a imobiliária
 * ativa, quais papéis ele tem NELA e qual o escopo de leitura — sem redirecionar.
 * `verifySession()` é a casca que aplica o redirecionamento.
 */
export async function resolveAuthContext(
  requestHeaders: Headers
): Promise<AuthResolution> {
  const session = await auth.api.getSession({ headers: requestHeaders });

  // Cobre sessão ausente E sessão expirada: o better-auth devolve null nos
  // dois casos, porque a expiração é checada na leitura.
  if (!session) return { ok: false, reason: "sem-sessao" };

  const user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };

  // Vínculos ATIVOS do usuário. Ordem determinística (`createdAt`, depois
  // `id`) porque o fallback da AC4 de TENANT-01 é "o primeiro vínculo" — sem
  // ordem estável, "o primeiro" mudaria entre requisições.
  const memberships = await db
    .select()
    .from(tenant_members)
    .where(
      and(
        eq(tenant_members.userId, user.id),
        isNull(tenant_members.deactivatedAt)
      )
    )
    .orderBy(asc(tenant_members.createdAt), asc(tenant_members.id));

  if (memberships.length === 0) {
    return { ok: false, reason: "sem-vinculo", user };
  }

  // TENANT-01 AC4: imobiliária ativa que não corresponde a nenhum vínculo do
  // usuário é IGNORADA e cai no primeiro vínculo dele. Sem isso, o seletor de
  // imobiliária voltaria a ser campo livre — a exposição que o login fecha na
  // porta entraria pela janela.
  const active =
    memberships.find(
      (membership) => membership.organizationId === session.session.activeOrganizationId
    ) ?? memberships[0];

  const roles = parseRoles(active.role);

  return {
    ok: true,
    context: {
      user,
      tenantId: active.organizationId,
      roles,
      leadScope: {
        tenantId: active.organizationId,
        assignedUserId: isBrokerOnly(roles) ? user.id : null,
      },
    },
  };
}

/**
 * Guarda usada pelos Server Components e server actions do CRM.
 *
 * Memoizada com `cache()` do React: dentro de um mesmo render pass, chamar
 * `verifySession()` em cinco lugares resolve a sessão UMA vez. O escopo de
 * memoização é fornecido pelo Next por requisição — fora de um render pass
 * (por exemplo, num teste em Node puro) `cache()` é um no-op, o que é
 * justamente por que o comportamento testado mora em `resolveAuthContext`.
 */
export const verifySession = cache(async (): Promise<AuthContext> => {
  const resolution = await resolveAuthContext(await headers());

  if (!resolution.ok) {
    // Sem vínculo o usuário está autenticado, mas não pertence a imobiliária
    // nenhuma: vai para a tela dedicada (TENANT-01 AC6), nunca para uma tela
    // do CRM sem imobiliária resolvida.
    redirect(resolution.reason === "sem-vinculo" ? "/sem-acesso" : "/login");
  }

  return resolution.context;
});

/** Escopo de leitura de lead do vínculo ativo (SCOPE-01). */
export const getLeadScope = cache(async (): Promise<LeadScope> => {
  const context = await verifySession();
  return context.leadScope;
});

/**
 * Recusa por permissão (PERM-01 AC5). Erro próprio, e não `Error` cru, para
 * que quem chama consiga distinguir "não pode" de "quebrou".
 */
export class PermissionDeniedError extends Error {
  constructor(
    readonly resource: Resource,
    readonly action: Action
  ) {
    super(`Sem permissão para ${action} ${resource}.`);
    this.name = "PermissionDeniedError";
  }
}

/**
 * Decisão de permissão sobre um contexto já resolvido: checa a matriz, emite o
 * log estruturado da negativa (PERM-01 AC6) e lança.
 *
 * Separada de `requirePermission` porque é ela que carrega TODO o
 * comportamento — a outra só resolve a sessão. É o que permite exercitar a
 * recusa real com uma sessão de corretor controlada, sem precisar de um
 * request scope do Next.
 */
export function authorizeOrThrow(
  context: AuthContext,
  resource: Resource,
  action: Action
): AuthContext {
  if (can(context.roles, resource, action)) return context;

  // Única observabilidade nova do lote (context.md — Papéis e permissões).
  // Linha única em JSON para ser consultável no log da Vercel: usuário,
  // imobiliária ativa e recurso negado, como a AC6 exige.
  console.warn(
    JSON.stringify({
      event: "permissao-negada",
      userId: context.user.id,
      userEmail: context.user.email,
      tenantId: context.tenantId,
      roles: context.roles,
      resource,
      action,
    })
  );

  throw new PermissionDeniedError(resource, action);
}

/**
 * Guarda de permissão do vínculo ATIVO (PERM-01 AC5): recusa no servidor
 * mesmo quando o controle não estava visível na tela, porque não depende de
 * nada que venha do cliente — papéis e imobiliária saem da sessão.
 */
export async function requirePermission(
  resource: Resource,
  action: Action
): Promise<AuthContext> {
  return authorizeOrThrow(await verifySession(), resource, action);
}
