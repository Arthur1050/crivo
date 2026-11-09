import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "../../../db";
import { leads, tenants } from "../../../db/schema";
import { LEAD_STATUS } from "../../../lib/vocabulary";
import { testVertical } from "../../../vertical-kit/__tests__/fixture-vertical";
import { realEstate } from "../../../verticals/real-estate";
import { getDashboardKpis, getPendingAttendanceAppointments, serviceScope } from "../index";

const tenantId = randomUUID();
const scope = serviceScope(tenantId);
const pendingId = randomUUID();
const attendedId = randomUUID();
const firstContactAt = new Date("2026-08-29T10:00:00Z");
const now = new Date("2026-08-30T12:00:00Z");
const range = { from: firstContactAt, to: now };

beforeAll(async () => {
  await db.insert(tenants).values({
    id: tenantId,
    name: "Tenant de comparecimento",
    slug: `fixture-${tenantId}`,
    agentName: "Agente de teste",
    supportedSegment: "ambos",
  });
  await db.insert(leads).values([
    {
      id: pendingId,
      tenantId,
      name: "Pessoa com comparecimento pendente",
      phone: "+5534999001111",
      status: LEAD_STATUS.goal_reached,
      firstContactAt,
      appointmentAt: new Date("2026-08-30T10:00:00Z"),
    },
    {
      id: attendedId,
      tenantId,
      name: "Pessoa que compareceu",
      phone: "+5534999002222",
      status: LEAD_STATUS.goal_reached,
      firstContactAt,
      appointmentAt: new Date("2026-08-29T11:00:00Z"),
      appointmentAttended: true,
    },
  ]);
});

afterAll(async () => {
  await db.delete(leads).where(eq(leads.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
});

it.each([
  { vertical: realEstate, pendingIds: [pendingId], confirmed: 1, rate: 1 },
  { vertical: testVertical, pendingIds: [], confirmed: 0, rate: null },
])("aplica a chave de $vertical.id às pendências e ao comparecimento", async ({
  vertical, pendingIds, confirmed, rate,
}) => {
  const pending = await getPendingAttendanceAppointments(scope, now, vertical.appointments);
  expect(pending.map((row) => row.leadId)).toEqual(pendingIds);

  const kpis = await getDashboardKpis(scope, range, vertical.appointments);
  expect(kpis).toMatchObject({
    leadCount: 2,
    confirmedAppointmentCount: confirmed,
    attendanceRate: rate,
  });
});
