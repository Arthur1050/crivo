import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createIntegrationKit } from "../kit";
import { realEstate } from "../../../verticals/real-estate";
import { testVertical } from "../../../vertical-kit/__tests__/fixture-vertical";

const data = vi.hoisted(() => ({
  resolveServiceApiKeyHash: vi.fn(), resolveTenantIdByApiKeyHash: vi.fn(), resolveTenantIdBySlug: vi.fn(), recordIntegrationRefusal: vi.fn(),
}));
vi.mock("../../data", () => data);

beforeEach(() => {
  vi.resetAllMocks();
  data.resolveServiceApiKeyHash.mockResolvedValue("service-id");
  data.resolveTenantIdBySlug.mockImplementation(async (slug: string) => slug === "tenant-one" ? "id-one" : slug === "tenant-two" ? "id-two" : null);
});
function request(headers: Record<string, string> = {}) {
  return new Request("http://local/api/v1/leads", { headers: { Authorization: "Bearer service-secret", ...headers } });
}

describe("header da marca na autenticação", () => {
  for (const [vertical, header, other, urn] of [[realEstate, "X-Krivo-Tenant", "X-Acme-Tenant", "krivo"], [testVertical, "X-Acme-Tenant", "X-Krivo-Tenant", "acme"]] as const) {
    it(`resolve o header exclusivo de ${vertical.id} e ignora o da outra marca`, async () => {
      const { authenticateIntegration } = createIntegrationKit(vertical);
      expect(await authenticateIntegration(request({ [header]: " tenant-one ", [other]: "tenant-two" }))).toEqual({ tenantId: "id-one" });
      expect(data.resolveServiceApiKeyHash).toHaveBeenCalledWith(createHash("sha256").update("service-secret").digest("hex"));
      expect(data.resolveTenantIdBySlug).toHaveBeenCalledWith("tenant-one");
      expect(await authenticateIntegration(request({ [header.toLowerCase()]: "tenant-two" }))).toEqual({ tenantId: "id-two" });
      expect(data.resolveTenantIdByApiKeyHash).not.toHaveBeenCalled();
    });
    for (const value of [undefined, null, "", "   ", "invalid"] as const) {
      it(`recusa header ${String(value)} em ${vertical.id}`, async () => {
        const { authenticateIntegration } = createIntegrationKit(vertical);
        const response = await authenticateIntegration(request({ [other]: "tenant-two", ...(typeof value === "string" ? { [header]: value } : {}) }));
        expect(response).toBeInstanceOf(Response);
        expect((response as Response).status).toBe(401);
        expect(await (response as Response).json()).toMatchObject({
          type: `urn:${urn}:problem:tenant-nao-identificado`, code: "tenant-nao-identificado",
          detail: value === "invalid" ? `${header} não corresponde a nenhum tenant conhecido.` : `Chave de serviço exige o header ${header}.`,
        });
        expect(data.resolveTenantIdByApiKeyHash).not.toHaveBeenCalled();
        if (value !== "invalid") expect(data.resolveTenantIdBySlug).not.toHaveBeenCalled();
      });
    }
    it(`a chave de tenant ignora ambos os headers em ${vertical.id}`, async () => {
      data.resolveServiceApiKeyHash.mockResolvedValue(null);
      data.resolveTenantIdByApiKeyHash.mockResolvedValue("key-tenant");
      expect(await createIntegrationKit(vertical).authenticateIntegration(request({ [header]: "tenant-one", [other]: "tenant-two" }))).toEqual({ tenantId: "key-tenant" });
      expect(data.resolveTenantIdBySlug).not.toHaveBeenCalled();
      data.resolveTenantIdByApiKeyHash.mockResolvedValue(null);
      const response = await createIntegrationKit(vertical).authenticateIntegration(request());
      expect(await (response as Response).json()).toMatchObject({ type: `urn:${urn}:problem:nao-autenticado`, detail: "Chave de API inválida ou revogada." });
    });
    it(`recusa credencial ausente e malformada antes de consultar o banco em ${vertical.id}`, async () => {
      for (const headers of [{}, { Authorization: "" }, { Authorization: "Bearer " }, { Authorization: "Basic key" }] as Record<string, string>[]) {
        const response = await createIntegrationKit(vertical).authenticateIntegration(new Request("http://local", { headers }));
        expect((response as Response).status).toBe(401);
        expect(await (response as Response).json()).toMatchObject({ type: `urn:${urn}:problem:nao-autenticado` });
      }
      expect(data.resolveServiceApiKeyHash).not.toHaveBeenCalled();
      expect(data.resolveTenantIdByApiKeyHash).not.toHaveBeenCalled();
      expect(data.resolveTenantIdBySlug).not.toHaveBeenCalled();
    });
  }
});
