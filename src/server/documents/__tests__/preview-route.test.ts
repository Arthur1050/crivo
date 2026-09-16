import "dotenv/config";
import { describe, expect, it, vi } from "vitest";
import { PermissionDeniedError, type AuthContext } from "../../auth/session";
import { createDocumentPreviewGetHandler } from "../../../../app/api/documents/[id]/preview/route";

const context: AuthContext = {
  user: { id: "user-1", name: "Leitor", email: "reader@example.test" },
  tenantId: "tenant-1",
  roles: ["corretor"],
  leadScope: { tenantId: "tenant-1", assignedUserId: "user-1" },
};

function route(overrides: Partial<Parameters<typeof createDocumentPreviewGetHandler>[0]> = {}) {
  const authorize = vi.fn(async () => context);
  const find = vi.fn(async () => ({ status: "pronto" as const, extractedText: "<script>inert</script> texto integral" }));
  const handler = createDocumentPreviewGetHandler({ authorize, find, ...overrides });
  return { handler, authorize, find };
}

function request() {
  return new Request("https://crivo.test/api/documents/document-1/preview");
}

function params(id = "document-1") {
  return { params: Promise.resolve({ id }) };
}

describe("document preview route (lote-12 T16)", () => {
  it("retorna o texto integral pronto como dado JSON sem interpretar HTML", async () => {
    const { handler } = route();
    const response = await handler(request(), params());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "pronto", text: "<script>inert</script> texto integral" });
  });

  it("marca fora_do_agente sem omitir o texto", async () => {
    const { handler } = route({ find: vi.fn(async () => ({ status: "fora_do_agente" as const, extractedText: "texto preservado" })) });
    const response = await handler(request(), params());
    expect(await response.json()).toEqual({ status: "fora_do_agente", text: "texto preservado", warning: "Este documento está fora do contexto do agente por limite de conteúdo." });
  });

  it.each(["processando", "falha"] as const)("%s é indistinguível de não encontrado e não expõe texto", async (status) => {
    const { handler } = route({ find: vi.fn(async () => null) });
    const response = await handler(request(), params());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Documento não encontrado." });
  });

  it.each(["expirado", "deleted", "outro tenant", "id ausente"])("%s retorna 404 seguro", async () => {
    const { handler } = route({ find: vi.fn(async () => null) });
    const response = await handler(request(), params());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Documento não encontrado." });
  });

  it("uma negativa de documentos:ler não consulta documento nem retorna conteúdo parcial", async () => {
    const denied = new PermissionDeniedError("documentos", "ler");
    const { handler, find } = route({ authorize: vi.fn(async () => { throw denied; }) });
    const response = await handler(request(), params());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Acesso negado." });
    expect(find).not.toHaveBeenCalled();
  });

  it("consulta somente o tenant resolvido pela autorização", async () => {
    const { handler, find } = route();
    await handler(request(), params("foreign-document"));
    expect(find).toHaveBeenCalledWith("tenant-1", "foreign-document", expect.any(Date));
  });

  it("resposta de não encontrado também é no-store", async () => {
    const { handler } = route({ find: vi.fn(async () => null) });
    const response = await handler(request(), params());
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
