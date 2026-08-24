/**
 * Matriz de permissões do produto (lote-8 — PERM-01; design.md — Matriz de
 * permissões).
 *
 * Função pura, sem I/O — mesmo padrão de `src/lib/broker-assignment.ts`: a
 * regra vive aqui e é testada em vitest; quem faz I/O (a guarda de sessão, as
 * server actions, a navegação) apenas a consome. Nenhum `server-only` aqui de
 * propósito: a navegação precisa da mesma regra para ocultar item de menu
 * (PERM-01 AC7), e ocultar é cosmético — a recusa de verdade continua no
 * servidor (AC5).
 */

export const ROLES = ["administrador", "gestor", "corretor"] as const;
export type Role = (typeof ROLES)[number];

export const RESOURCES = [
  "dashboard",
  "pipeline",
  "chats",
  "documentos",
  "configuracoes",
  "usuarios",
] as const;
export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = ["ler", "escrever"] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * A tabela de `context.md` (§ Papéis e permissões), transcrita sem
 * interpretação:
 *
 * |               | Dashboard | Pipeline | Chats | Documentos | Configurações | Usuários |
 * | Administrador | tudo      | tudo     | tudo  | CRUD       | editar        | gerencia |
 * | Gestor        | tudo      | tudo     | tudo  | CRUD       | editar        | —        |
 * | Corretor      | carteira  | carteira | carteira | leitura | —             | —        |
 *
 * "Tudo" × "própria carteira" é diferença de **escopo**, não de ação: as duas
 * concedem ler (e, em Pipeline e Chats, escrever). Quem estreita o alcance do
 * corretor aos leads dele é o `LeadScope` (SCOPE-01), na camada de acesso a
 * dados — nunca esta matriz. Dashboard não tem escrita em lugar nenhum do
 * produto, então ninguém a recebe.
 */
const PERMISSION_MATRIX: Record<Role, Record<Resource, readonly Action[]>> = {
  administrador: {
    dashboard: ["ler"],
    pipeline: ["ler", "escrever"],
    chats: ["ler", "escrever"],
    documentos: ["ler", "escrever"],
    configuracoes: ["ler", "escrever"],
    // PERM-01 AC2: gestão de usuários, papéis e convites é exclusiva do
    // administrador — é a única linha que separa administrador de gestor.
    usuarios: ["ler", "escrever"],
  },
  gestor: {
    dashboard: ["ler"],
    pipeline: ["ler", "escrever"],
    chats: ["ler", "escrever"],
    documentos: ["ler", "escrever"],
    configuracoes: ["ler", "escrever"],
    usuarios: [],
  },
  corretor: {
    dashboard: ["ler"],
    pipeline: ["ler", "escrever"],
    chats: ["ler", "escrever"],
    // PERM-01 AC3: leitura dos documentos de contexto, sem escrita.
    documentos: ["ler"],
    // PERM-01 AC3: nenhum acesso a Configurações — nem leitura.
    configuracoes: [],
    usuarios: [],
  },
};

/**
 * Decide se um conjunto de papéis pode executar uma ação sobre um recurso.
 *
 * Papéis acumulados são **união**, nunca interseção (PERM-01 AC4): basta um
 * papel conceder. É o que faz um gestor que também atende como corretor não
 * perder o alcance do gestor por acumular o papel menor.
 */
export function can(roles: Role[], resource: Resource, action: Action): boolean {
  return roles.some((role) => PERMISSION_MATRIX[role][resource].includes(action));
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
