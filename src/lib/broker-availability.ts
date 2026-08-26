/**
 * Filtros de disponibilidade da política de atribuição (lote-8 — ATRIB-02,
 * ATRIB-03; AD-022).
 *
 * Funções puras, sem I/O: recebem os candidatos já montados pela camada de
 * acesso a dados (carga ativa, janela de trabalho e reuniões já marcadas) e
 * devolvem quem está elegível. Quem desempata continua sendo `assignBroker`
 * (`./broker-assignment`), **intacto**: carga → `createdAt` → `id`.
 *
 * Dois momentos, duas regras:
 * - **agendamento** (`selectForMeeting`): a janela precisa cobrir o intervalo
 *   INTEIRO da reunião, e o corretor não pode ter outra reunião sobreposta;
 * - **escalonamento** (`selectForEscalation`): basta a janela cobrir o
 *   instante — e, se ninguém estiver em janela, o filtro **degrada** para
 *   todos os candidatos, porque a spec prefere um responsável fora de horário
 *   a um lead órfão (ATRIB-03 AC3).
 */

import type { BrokerLoad } from "./broker-assignment";
import { coversInstant, coversInterval, type WorkWindow } from "./work-window";

export interface BrokerMeeting {
  start: Date;
  end: Date;
}

export interface BrokerCandidate extends BrokerLoad {
  /** `null` = janela não declarada, indisponível sempre (AGENDA-01 AC5). */
  window: WorkWindow | null;
  meetings: BrokerMeeting[];
}

/** Projeção para o desempate: `assignBroker` não vê janela nem reunião. */
function toLoad(candidate: BrokerCandidate): BrokerLoad {
  return {
    id: candidate.id,
    createdAt: candidate.createdAt,
    activeLeads: candidate.activeLeads,
  };
}

/**
 * Dois intervalos meio-abertos `[start, end)` se sobrepõem? Reunião que começa
 * exatamente quando a outra termina NÃO se sobrepõe — é o slot seguinte.
 */
function overlaps(meeting: BrokerMeeting, start: Date, end: Date): boolean {
  return meeting.start.getTime() < end.getTime() &&
    start.getTime() < meeting.end.getTime();
}

/**
 * Candidatos ao agendamento de uma reunião (ATRIB-02 AC2/AC6): janela cobrindo
 * o intervalo inteiro e nenhuma reunião sobreposta. Lista vazia significa
 * "nenhum corretor cobre o horário" — o chamador recusa o agendamento com
 * `sem-corretor-disponivel` (AC5), nunca escolhe alguém fora da janela.
 */
export function selectForMeeting(
  candidates: BrokerCandidate[],
  start: Date,
  end: Date
): BrokerLoad[] {
  return candidates
    .filter(
      (candidate) =>
        coversInterval(candidate.window, start, end) &&
        !candidate.meetings.some((meeting) => overlaps(meeting, start, end))
    )
    .map(toLoad);
}

/**
 * Candidatos ao escalonamento (ATRIB-03 AC2/AC3): quem está em janela naquele
 * instante; se ninguém estiver, **todos** os candidatos ativos.
 *
 * A degradação é requisito, não descuido: o lead escalado não pode ficar órfão,
 * e um responsável fora do horário de trabalho é melhor do que nenhum. Com a
 * lista de candidatos vazia o resultado é vazio, e o chamador grava o
 * escalonamento com o lead sinalizado (AC4).
 */
export function selectForEscalation(
  candidates: BrokerCandidate[],
  at: Date
): BrokerLoad[] {
  const inWindow = candidates.filter((candidate) =>
    coversInstant(candidate.window, at)
  );
  return (inWindow.length > 0 ? inWindow : candidates).map(toLoad);
}
