import { describe, expect, it } from "vitest";
import { canEditMeetingAttendance } from "../meeting-attendance";

const NOW = new Date("2026-08-15T12:00:00.000Z");

describe("canEditMeetingAttendance", () => {
  it("sem reunião (meetingAt nulo): não editável", () => {
    expect(canEditMeetingAttendance(null, NOW)).toBe(false);
  });

  it("reunião futura: não editável", () => {
    const future = new Date("2026-08-15T12:00:00.001Z");
    expect(canEditMeetingAttendance(future, NOW)).toBe(false);
  });

  it("reunião passada: editável", () => {
    const past = new Date("2026-08-15T11:59:59.999Z");
    expect(canEditMeetingAttendance(past, NOW)).toBe(true);
  });

  it("limite exato (meetingAt === now): não editável — 'já passou', não 'está passando'", () => {
    expect(canEditMeetingAttendance(new Date(NOW.getTime()), NOW)).toBe(false);
  });

  it("aceita meetingAt como string ISO (serialização RSC→client)", () => {
    expect(canEditMeetingAttendance("2026-08-15T11:00:00.000Z", NOW)).toBe(true);
    expect(canEditMeetingAttendance("2026-08-15T13:00:00.000Z", NOW)).toBe(false);
  });
});
