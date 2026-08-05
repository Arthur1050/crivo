import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { tenants } from "../../../db/schema";
import { getTenantSettings } from "../settings";

// Tenants PRÓPRIOS deste arquivo (nunca o snapshot do seed) — mesmo padrão
// de isolamento dos demais testes de integração do lote-5/lote-6.
describe("server/integration settings — getTenantSettings", () => {
  let configuredTenantId: string;
  let unconfiguredTenantId: string;
  const NON_EXISTENT_TENANT_ID = "eeeeeeee-0000-4000-8000-000000000099";

  beforeAll(async () => {
    configuredTenantId = randomUUID();
    unconfiguredTenantId = randomUUID();

    await db.insert(tenants).values([
      {
        id: configuredTenantId,
        name: "Imobiliária Configurada Settings",
        agentName: "Agente Configurado",
        supportedModality: "ambos",
        agentPresentationMessage: "Oi! Sou o agente virtual.",
        meetingDays: [1, 2, 3, 4, 5],
        meetingHoursStart: "09:00",
        meetingHoursEnd: "18:00",
      },
      {
        id: unconfiguredTenantId,
        name: "Imobiliária Sem Horário Settings",
        agentName: "Agente Sem Horário",
        supportedModality: "novo",
        // agentPresentationMessage e os 3 campos de horário ficam null (default).
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, configuredTenantId));
    await db.delete(tenants).where(eq(tenants.id, unconfiguredTenantId));
    await db.$client.end();
  });

  it("retorna o shape completo com horário comercial configurado (INT-09 AC2)", async () => {
    const result = await getTenantSettings(configuredTenantId);

    expect(result).toEqual({
      realEstateName: "Imobiliária Configurada Settings",
      agentName: "Agente Configurado",
      supportedModality: "ambos",
      agentPresentationMessage: "Oi! Sou o agente virtual.",
      meetingDays: [1, 2, 3, 4, 5],
      meetingHoursStart: "09:00",
      meetingHoursEnd: "18:00",
    });
  });

  it("retorna null nos 3 campos de horário comercial quando o tenant não configurou (CONF-05 AC4)", async () => {
    const result = await getTenantSettings(unconfiguredTenantId);

    expect(result).not.toBeNull();
    expect(result!.meetingDays).toBeNull();
    expect(result!.meetingHoursStart).toBeNull();
    expect(result!.meetingHoursEnd).toBeNull();
    expect(result!.agentPresentationMessage).toBeNull();
    expect(result!.realEstateName).toBe("Imobiliária Sem Horário Settings");
    expect(result!.supportedModality).toBe("novo");
  });

  it("retorna null para um tenant inexistente", async () => {
    const result = await getTenantSettings(NON_EXISTENT_TENANT_ID);
    expect(result).toBeNull();
  });
});
