import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db";
import { tenants, tenantStorefronts } from "../../db/schema";
import type { Action, Resource, Role } from "../../lib/permissions";
import type { StorefrontInput } from "../../lib/storefront";
import type { AuthContext } from "../auth/session";

/**
 * Server action da vitrine (tasks.md — L16a T15; VCFG-02, VATIV-01, VREV-02).
 * Mesmo harness de `properties-actions.test.ts`: identidade fabricada, decisão
 * de permissão real (matriz de `src/lib/permissions.ts`), imobiliária-fixture
 * própria por teste.
 */

let sessionRoles: Role[] = ["administrador"];
let sessionTenantId = "";
const sessionUser = { id: "", name: "", email: "" };

vi.mock("../auth/session", async (importActual) => {
  const actual = await importActual<typeof import("../auth/session")>();
  const fakeSession = async (): Promise<AuthContext> => ({
    user: sessionUser,
    tenantId: sessionTenantId,
    roles: sessionRoles,
    leadScope: { tenantId: sessionTenantId, assignedUserId: null },
  });
  return {
    ...actual,
    verifySession: fakeSession,
    requirePermission: async (resource: Resource, action: Action) =>
      actual.authorizeOrThrow(await fakeSession(), resource, action),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../storefront/schedule", () => ({ scheduleStorefrontRevalidation: vi.fn() }));

import { revalidatePath } from "next/cache";
import { getStorefront, saveStorefront } from "../data/storefront";
import { saveStorefrontAction } from "../actions/storefront";
import { scheduleStorefrontRevalidation } from "../storefront/schedule";

const scheduled = vi.mocked(scheduleStorefrontRevalidation);
const createdTenantIds: string[] = [];

async function createTenant(name: string, agentWhatsapp: string | null = "5534999990000"): Promise<string> {
  const id = randomUUID();
  await db.insert(tenants).values({
    id, name, agentName: `Agente ${name}`, supportedModality: "ambos", slug: `fixture-t15-${id}`, agentWhatsapp,
  });
  createdTenantIds.push(id);
  sessionTenantId = id;
  scheduled.mockClear();
  return id;
}

function formInput(overrides: Partial<StorefrontInput> = {}): StorefrontInput {
  return {
    active: false,
    layout: "grade",
    font: "inter",
    accentColor: "",
    creci: "",
    legalName: "",
    headline: "",
    about: "",
    instagram: "",
    phone: "",
    address: "",
    ...overrides,
  };
}

const completeInput = formInput({
  active: true,
  layout: "editorial",
  font: "playfair",
  accentColor: "#AABBCC",
  creci: "CRECI 12345-J",
  legalName: "Imobiliária Exemplo Ltda",
  headline: "Casas e apartamentos",
  instagram: "@Imobiliaria.X",
  phone: "(11) 99999-1234",
});

afterEach(async () => {
  sessionRoles = ["administrador"];
  if (createdTenantIds.length > 0) {
    await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    createdTenantIds.length = 0;
  }
});

afterAll(async () => {
  await db.$client.end();
});

describe("saveStorefrontAction (L16a T15)", () => {
  it("corretor é recusado por permissão: nada é gravado e nada é agendado", async () => {
    const tenantId = await createTenant("T15 Corretor");
    sessionRoles = ["corretor"];

    const result = await saveStorefrontAction(completeInput);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Sem permissão para escrever configuracoes.");
    expect(await db.select().from(tenantStorefronts).where(eq(tenantStorefronts.tenantId, tenantId))).toHaveLength(0);
    expect(scheduled).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalledWith("/configuracoes");
  });

  it("campo inválido: recusa indicando o campo, o banco fica inalterado e nada é agendado", async () => {
    const tenantId = await createTenant("T15 Campo inválido");
    await saveStorefront(tenantId, {
      active: false, layout: "editorial", accentColor: "#112233", font: "lora",
      creci: "CRECI ANTIGO", legalName: "Razão Antiga", headline: "Título antigo", about: null,
      instagram: "antigo", phone: "1133334444", address: null,
    });
    const before = await getStorefront(tenantId);

    const result = await saveStorefrontAction({ ...completeInput, active: false, accentColor: "vermelho" });

    expect(result).toEqual({
      ok: false,
      error: expect.any(String),
      errors: [{ field: "cor", message: expect.any(String) }],
    });
    expect(await getStorefront(tenantId)).toEqual(before);
    expect(scheduled).not.toHaveBeenCalled();
  });

  it("VATIV-01 AC4: ativação com as três pré-condições faltando → três recusas na ordem e nada é gravado", async () => {
    const tenantId = await createTenant("T15 Sem nada", null);

    const result = await saveStorefrontAction(formInput({ active: true }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.field)).toEqual(["creci", "razaoSocial", "whatsappAgente"]);
    expect(await db.select().from(tenantStorefronts).where(eq(tenantStorefronts.tenantId, tenantId))).toHaveLength(0);
    expect(scheduled).not.toHaveBeenCalled();
  });

  it("VATIV-01 AC1 a AC3: cada pré-condição sozinha é recusada no próprio campo", async () => {
    await createTenant("T15 Sem CRECI");
    const noCreci = await saveStorefrontAction({ ...completeInput, creci: "  " });
    expect(noCreci.ok === false && noCreci.errors.map((e) => e.field)).toEqual(["creci"]);

    const noLegalName = await saveStorefrontAction({ ...completeInput, legalName: "" });
    expect(noLegalName.ok === false && noLegalName.errors.map((e) => e.field)).toEqual(["razaoSocial"]);

    await createTenant("T15 Sem WhatsApp", "   ");
    const noWhatsapp = await saveStorefrontAction(completeInput);
    expect(noWhatsapp.ok === false && noWhatsapp.errors.map((e) => e.field)).toEqual(["whatsappAgente"]);
    expect(scheduled).not.toHaveBeenCalled();
  });

  it("ativação completa: grava normalizada, agenda uma vez com o tenant e revalida a tela", async () => {
    const tenantId = await createTenant("T15 Completa");

    const result = await saveStorefrontAction(completeInput);

    expect(result).toEqual({ ok: true });
    expect(await getStorefront(tenantId)).toMatchObject({
      active: true, layout: "editorial", font: "playfair", accentColor: "#aabbcc",
      creci: "CRECI 12345-J", legalName: "Imobiliária Exemplo Ltda", headline: "Casas e apartamentos",
      about: null, instagram: "imobiliaria.x", phone: "11999991234", address: null,
    });
    expect(scheduled).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveBeenCalledWith(tenantId);
    expect(revalidatePath).toHaveBeenCalledWith("/configuracoes");
  });

  it("VATIV-01 AC7: desativar grava sem exigir outro campo, mesmo sem WhatsApp do agente, e agenda o aviso", async () => {
    const tenantId = await createTenant("T15 Desativa");
    expect(await saveStorefrontAction(completeInput)).toEqual({ ok: true });
    scheduled.mockClear();
    await db.update(tenants).set({ agentWhatsapp: null }).where(eq(tenants.id, tenantId));

    const result = await saveStorefrontAction(formInput({ active: false }));

    expect(result).toEqual({ ok: true });
    expect(await getStorefront(tenantId)).toMatchObject({ active: false, creci: null, legalName: null });
    expect(scheduled).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveBeenCalledWith(tenantId);
  });

  it("grava sempre no tenant da sessão: a linha de outro tenant fica intocada", async () => {
    const other = await createTenant("T15 Outra");
    await saveStorefront(other, {
      active: false, layout: "editorial", accentColor: "#112233", font: "lora",
      creci: "CRECI OUTRA", legalName: "Outra Ltda", headline: null, about: null,
      instagram: null, phone: null, address: null,
    });
    const beforeOther = await getStorefront(other);

    const mine = await createTenant("T15 Minha");
    expect(await saveStorefrontAction(completeInput)).toEqual({ ok: true });

    expect(await getStorefront(other)).toEqual(beforeOther);
    expect((await getStorefront(mine)).creci).toBe("CRECI 12345-J");
  });
});
