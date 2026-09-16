import "dotenv/config";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PermissionDeniedError, type AuthContext } from "../../auth/session";
import { DocumentStorageError } from "../storage";
import { createDocumentDownloadGetHandler } from "../../../../app/api/documents/[id]/download/route";
const bytes = new TextEncoder().encode("original íntegro");
const auth: AuthContext = { user: { id: "u", name: "x", email: "x@test" }, tenantId: "tenant", roles: ["corretor"], leadScope: { tenantId: "tenant", assignedUserId: "u" } };
function fixture(overrides: Record<string, unknown> = {}) { const find = vi.fn(async () => ({ storageKey: "opaque", name: "../política\r.txt", mimeType: "text/plain" })); const open = vi.fn(async () => ({ key: "opaque", etag: "e", contentType: "text/plain", size: bytes.byteLength, stream: new Response(bytes).body! })); return { find, open, handler: createDocumentDownloadGetHandler({ authorize: async () => auth, find, storage: { open }, ...overrides }) }; }
const request = () => new Request("https://test/api/documents/id/download"); const params = (id = "id") => ({ params: Promise.resolve({ id }) });
describe("document download route (T17)", () => {
  it.each(["processando", "pronto", "falha", "fora_do_agente"])("streams original in %s", async () => { const { handler } = fixture(); const r = await handler(request(), params()); expect(await r.arrayBuffer()).toEqual(bytes.buffer); });
  it("preserva SHA-256 dos bytes", async () => { const { handler } = fixture(); const r = await handler(request(), params()); expect(createHash("sha256").update(new Uint8Array(await r.arrayBuffer())).digest("hex")).toBe(createHash("sha256").update(bytes).digest("hex")); });
  it("emite attachment e headers seguros", async () => { const { handler } = fixture(); const r = await handler(request(), params()); expect(r.headers).toMatchObject(expect.anything()); expect(r.headers.get("content-type")).toBe("text/plain"); expect(r.headers.get("content-disposition")).toContain("attachment"); expect(r.headers.get("x-content-type-options")).toBe("nosniff"); expect(r.headers.get("cache-control")).toBe("private, no-store"); });
  it.each(["expired", "deleted", "foreign", "missing"])("%s is safe 404", async () => { const { handler } = fixture({ find: async () => null }); expect((await handler(request(), params())).status).toBe(404); });
  it("never opens storage after forbidden", async () => { const { open, handler } = fixture({ authorize: async () => { throw new PermissionDeniedError("documentos", "ler"); } }); expect((await handler(request(), params())).status).toBe(403); expect(open).not.toHaveBeenCalled(); });
  it("returns 404 for absent blob", async () => { const { handler } = fixture({ storage: { open: async () => null } }); expect((await handler(request(), params())).status).toBe(404); });
  it("sanitizes storage outage", async () => { const { handler } = fixture({ storage: { open: async () => { throw new DocumentStorageError("transient"); } } }); expect(await handler(request(), params())).toMatchObject({ status: 503 }); });
});
