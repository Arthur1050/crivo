/**
 * Escopo de leitura de lead (lote-8 — SCOPE-01; design.md — Escopo).
 *
 * `assignedUserId` preenchido significa "só os leads desta pessoa";
 * `null` significa "toda a imobiliária".
 *
 * O tipo mora num módulo próprio, sem nenhuma dependência, porque as duas
 * pontas precisam dele: a guarda de sessão (`src/server/auth/session.ts`), que
 * o produz, e a camada de acesso a dados (`src/server/data/index.ts`), que o
 * consome. Fazer a DAL importar da guarda arrastaria `next/headers` e o
 * better-auth para dentro de toda leitura.
 *
 * A razão de ser um TIPO obrigatório, e não um campo opcional a mais: as
 * funções de leitura de lead deixaram de aceitar `tenantId: string`, então um
 * call site esquecido **não compila** em vez de vazar lead de outro corretor
 * silenciosamente (design.md — Risks & Concerns).
 */
export interface LeadScope {
  tenantId: string;
  assignedUserId: string | null;
}
