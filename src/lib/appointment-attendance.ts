/**
 * Regra de quando o controle de comparecimento à reunião fica editável
 * (lote-7 — KPI-02). Função pura: nenhuma leitura de relógio interna —
 * `now` é sempre injetado, para o teste nunca depender do relógio real
 * (design.md — Components: "reunião marcada e já passada").
 *
 * Marcar comparecimento de uma reunião que ainda não aconteceu não tem
 * significado (spec.md — Assumptions): sem `appointmentAt`, ou com `appointmentAt`
 * no futuro (inclusive o instante exato de `now`), o controle continua
 * somente leitura.
 */
export function canEditAppointmentAttendance(
  appointmentAt: Date | string | null,
  now: Date
): boolean {
  if (appointmentAt === null) {
    return false;
  }
  const appointmentInstant = appointmentAt instanceof Date ? appointmentAt : new Date(appointmentAt);
  return appointmentInstant.getTime() < now.getTime();
}
