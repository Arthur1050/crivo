import { ROLE, type Role } from "./vocabulary";
import { CORE_RESOURCES, type CoreResource, type Action, type Vertical } from "../vertical-kit";

export const ROLES = [ROLE.admin, ROLE.manager, ROLE.attendant] as const;
export const ACTIONS = ["read", "write"] as const;
export type { Role, Action };
export type Resource = string;

const CORE_MATRIX: Record<Role, Record<CoreResource, readonly Action[]>> = {
  [ROLE.admin]: {
    dashboard: ["read"],
    pipeline: ["read", "write"],
    chats: ["read", "write"],
    documents: ["read", "write"],
    settings: ["read", "write"],
    users: ["read", "write"],
  },
  [ROLE.manager]: {
    dashboard: ["read"],
    pipeline: ["read", "write"],
    chats: ["read", "write"],
    documents: ["read", "write"],
    settings: ["read", "write"],
    users: [],
  },
  [ROLE.attendant]: {
    dashboard: ["read"],
    pipeline: ["read", "write"],
    chats: ["read", "write"],
    documents: ["read"],
    settings: [],
    users: [],
  },
};

/** Compõe uma cópia fechada da matriz; papéis acumulados concedem por união. */
export function createAccess(vertical: Vertical) {
  const matrix = new Map<string, Map<Role, readonly Action[]>>();
  for (const resource of CORE_RESOURCES) {
    matrix.set(resource, new Map(ROLES.map(role => [role, [...CORE_MATRIX[role][resource]]])));
  }
  for (const resource of vertical.resources) {
    matrix.set(resource.name, new Map(ROLES.map(role => [role, [...resource.permissions[role]]])));
  }
  return {
    RESOURCES: [...matrix.keys()],
    can(roles: readonly Role[], resource: Resource, action: Action): boolean {
      return roles.some(role => matrix.get(resource)?.get(role)?.includes(action) ?? false);
    },
  };
}

/**
 * Lê os papéis no formato nativo do plugin `organization`: string separada por
 * vírgula (AD-021). Papel desconhecido é descartado em vez de derrubar a
 * requisição — um valor sujo no banco não pode virar erro 500 na tela inteira.
 */
export function parseRoles(raw: string | null | undefined): Role[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is Role => (ROLES as readonly string[]).includes(role));
}
