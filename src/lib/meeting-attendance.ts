/**
 * Regra de quando o controle de comparecimento à reunião fica editável
 * (lote-7 — KPI-02). Função pura: nenhuma leitura de relógio interna —
 * `now` é sempre injetado, para o teste nunca depender do relógio real
 * (design.md — Components: "reunião marcada e já passada").
 *
 * Marcar comparecimento de uma reunião que ainda não aconteceu não tem
 * significado (spec.md — Assumptions): sem `meetingAt`, ou com `meetingAt`
 * no futuro (inclusive o instante exato de `now`), o controle continua
 * somente leitura.
 */
export function canEditMeetingAttendance(
  meetingAt: Date | string | null,
  now: Date
): boolean {
  if (meetingAt === null) {
    return false;
  }
  const meetingInstant = meetingAt instanceof Date ? meetingAt : new Date(meetingAt);
  return meetingInstant.getTime() < now.getTime();
}
