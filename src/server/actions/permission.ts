import "server-only";
import {
  PermissionDeniedError,
  requirePermission,
} from "../auth/session";
import type { Action, Resource } from "../../lib/permissions";

/**
 * Ponte entre a guarda de permissão (que lança — `requirePermission`) e as
 * server actions do CRM, que devolvem `{ ok: false, error }` em vez de
 * estourar na tela (lote-8 — PERM-01 AC5).
 *
 * Devolve `null` quando a operação é permitida, para que a action siga o
 * mesmo formato de curto-circuito das validações que ela já faz:
 *
 * ```ts
 * const denied = await denyIfForbidden("configuracoes", "escrever");
 * if (denied) return denied;
 * ```
 *
 * Vive fora de `auth/session.ts` de propósito: é a camada de action que
 * escolhe traduzir a recusa em resultado, e importar a guarda de outro módulo
 * mantém a decisão de permissão testável com uma sessão controlada.
 */
export async function denyIfForbidden(
  resource: Resource,
  action: Action
): Promise<{ ok: false; error: string } | null> {
  try {
    await requirePermission(resource, action);
    return null;
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
