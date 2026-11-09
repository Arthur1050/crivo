/**
 * Política de atribuição de corretor a um lead novo (lote-7 — ATRIB-01).
 *
 * Função pura, sem I/O: recebe a carga já calculada de cada corretor e
 * devolve o escolhido. Isolada de propósito — é o ponto de extensão que o
 * lote futuro de usuários/papéis troca por atribuição por disponibilidade
 * de agenda + preferência do lead, sem tocar quem a chama
 * (design.md — Components).
 */

export interface BrokerLoad {
  id: string;
  createdAt: Date;
  activeLeads: number;
}

/**
 * Escolhe o corretor de menor `activeLeads`. Empate é desfeito por
 * `createdAt` ascendente (o corretor mais antigo) e, persistindo o empate,
 * por `id` ascendente — determinístico independente da ordem de entrada em
 * `candidates` (spec.md — "Lead real nasce com corretor responsável" AC2).
 * Lista vazia devolve `null` (spec.md — "Tenant sem nenhum corretor
 * cadastrado" AC3).
 */
export function assignBroker(candidates: BrokerLoad[]): string | null {
  if (candidates.length === 0) {
    return null;
  }

  let chosen = candidates[0];
  for (const candidate of candidates.slice(1)) {
    if (isBetter(candidate, chosen)) {
      chosen = candidate;
    }
  }
  return chosen.id;
}

function isBetter(a: BrokerLoad, b: BrokerLoad): boolean {
  if (a.activeLeads !== b.activeLeads) {
    return a.activeLeads < b.activeLeads;
  }
  const aTime = a.createdAt.getTime();
  const bTime = b.createdAt.getTime();
  if (aTime !== bTime) {
    return aTime < bTime;
  }
  return a.id < b.id;
}
