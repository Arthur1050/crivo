import { describe, expect, it } from "vitest";
import { canEditAppointmentAttendance } from "../appointment-attendance";

const NOW = new Date("2026-08-15T12:00:00.000Z");

describe("canEditMeetingAttendance", () => {
  it("sem reunião (meetingAt nulo): não editável", () => {
    expect(canEditAppointmentAttendance(null, NOW)).toBe(false);
  });

  it("reunião futura: não editável", () => {
    const future = new Date("2026-08-15T12:00:00.001Z");
    expect(canEditAppointmentAttendance(future, NOW)).toBe(false);
  });

  it("reunião passada: editável", () => {
    const past = new Date("2026-08-15T11:59:59.999Z");
    expect(canEditAppointmentAttendance(past, NOW)).toBe(true);
  });

  it("limite exato (meetingAt === now): não editável — 'já passou', não 'está passando'", () => {
    expect(canEditAppointmentAttendance(new Date(NOW.getTime()), NOW)).toBe(false);
  });

  it("aceita meetingAt como string ISO (serialização RSC→client)", () => {
    expect(canEditAppointmentAttendance("2026-08-15T11:00:00.000Z", NOW)).toBe(true);
    expect(canEditAppointmentAttendance("2026-08-15T13:00:00.000Z", NOW)).toBe(false);
  });
});
