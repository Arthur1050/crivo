/** T59 real-app fixture helper, no production route or credentials on stdout.
 * Run with: npx tsx --conditions=react-server scripts/preview-message-thread.mts
 * Start app with BETTER_AUTH_URL=http://localhost:3000 npm run dev:test.
 * Browser: http://localhost:4179/open (server binds only to loopback).
 * POST /confirm-fep persists a fixture receipt, then ChatRefresh reads it.
 * POST /cleanup removes only this helper's own fixture rows and shuts it down.
 * Interrupted run: --cleanup-conversation <fixture UUID>, with ownership guards.
 */
import "dotenv/config";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL required; no production fallback.");
process.env.VITEST = "1";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const { db } = await import("../src/db/index");
const { auth } = await import("../src/server/auth/config");
const { tenants, tenant_members, leads, conversations, messages, users, whatsappChannels, whatsappMessageReceipts } = await import("../src/db/schema");
async function cleanupOwned(ownedTenantId: string, ownedUserId: string) {
  await db.delete(messages).where(eq(messages.tenantId, ownedTenantId));
  await db.delete(conversations).where(eq(conversations.tenantId, ownedTenantId));
  await db.delete(leads).where(eq(leads.tenantId, ownedTenantId));
  await db.delete(tenant_members).where(eq(tenant_members.organizationId, ownedTenantId));
  await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, ownedTenantId));
  await db.delete(tenants).where(eq(tenants.id, ownedTenantId));
  await db.delete(users).where(eq(users.id, ownedUserId));
}
if (process.argv[2] === "--cleanup-conversation") {
  const [owned] = await db.select({ tenantId: tenants.id, slug: tenants.slug, userId: users.id, email: users.email, leadName: leads.name })
    .from(conversations).innerJoin(tenants, eq(tenants.id, conversations.tenantId))
    .innerJoin(leads, eq(leads.id, conversations.leadId))
    .innerJoin(tenant_members, eq(tenant_members.organizationId, tenants.id))
    .innerJoin(users, eq(users.id, tenant_members.userId))
    .where(eq(conversations.id, process.argv[3]));
  if (!owned || owned.slug !== `fixture-t59-${owned.tenantId}` || owned.leadName !== "Lead Fixture T59"
      || !/^t59-[0-9a-f-]+@fixture\.invalid$/.test(owned.email)) throw new Error("Cleanup refused: fixture ownership not proven.");
  await cleanupOwned(owned.tenantId, owned.userId);
  await db.$client.end();
  console.log("T59 interrupted fixture rows removed after ownership checks.");
  process.exit(0);
}
const tenantId = randomUUID();
const leadId = randomUUID();
const conversationId = randomUUID();
const phoneNumberId = `fixture-t59-${randomUUID()}`;
const refreshMessageId = randomUUID();
const refreshWamid = `fixture-wamid-${randomUUID()}`;
const signup = await auth.api.signUpEmail({ body: {
  email: `t59-${randomUUID()}@fixture.invalid`, password: randomUUID(), name: "Operador Fixture T59",
}, returnHeaders: true });
const sessionCookies = signup.headers.getSetCookie();
if (sessionCookies.length === 0) throw new Error("Fixture auth did not return a session.");

async function cleanup() {
  await cleanupOwned(tenantId, signup.response.user.id);
}

try {
  await db.insert(tenants).values({ id: tenantId, name: "Imobiliária Fixture T59", agentName: "Agente Fixture",
    supportedModality: "ambos", slug: `fixture-t59-${tenantId}` });
  await db.insert(tenant_members).values({ userId: signup.response.user.id, organizationId: tenantId, role: "gestor" });
  await db.insert(whatsappChannels).values({ tenantId, phoneNumberId, accountKind: "test", usageEnabled: false });
  const now = Date.now();
  await db.insert(leads).values({ id: leadId, tenantId, assignedUserId: signup.response.user.id, name: "Lead Fixture T59",
    phone: "Fixture sem telefone", status: "em_qualificacao", firstContactAt: new Date(now - 60000),
    humanTakeoverAt: new Date(now - 30000), humanTakeoverBy: signup.response.user.id, whatsappPhoneNumberId: phoneNumberId });
  await db.insert(conversations).values({ id: conversationId, tenantId, leadId });
  const fixtures = [
    { sender: "lead" as const, content: "Inbound Fixture T59, sem classificação de saída.", classification: null },
    { sender: "agente" as const, content: "Primeira saída Fixture T59.", classification: "paid_service" as const },
    { sender: "agente" as const, content: "Retomada Fixture T59.", classification: "free_service" as const },
    { sender: "humano" as const, content: "Saída humana Fixture T59 aguardando recibo.", classification: "pending" as const },
    { sender: "humano" as const, content: "Saída legada Fixture T59 sem canal confirmado.", classification: null },
  ];
  for (const [index, fixture] of fixtures.entries()) {
    const isRefresh = index === 3;
    const id = isRefresh ? refreshMessageId : randomUUID();
    const wamid = isRefresh ? refreshWamid : `fixture-wamid-${randomUUID()}`;
    await db.insert(messages).values({ id, tenantId, conversationId, sender: fixture.sender, content: fixture.content,
      sentAt: new Date(now - 60000 + index * 1000),
      authorUserId: fixture.sender === "humano" ? signup.response.user.id : null,
      authorName: fixture.sender === "humano" ? "Autora Fixture T59" : null,
      externalId: fixture.classification ? wamid : null, whatsappPhoneNumberId: fixture.classification ? phoneNumberId : null });
    if (fixture.classification) await db.insert(whatsappMessageReceipts).values({ tenantId, phoneNumberId, wamid,
      messageId: id, classification: fixture.classification, orphanExpiresAt: null });
  }
} catch (error) {
  await cleanup();
  throw error;
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/open") {
    response.writeHead(302, { "Set-Cookie": sessionCookies, Location: `http://localhost:3000/chats?conversa=${conversationId}`,
      "Cache-Control": "no-store" });
    response.end();
    return;
  }
  if (request.method === "POST" && request.url === "/cleanup") {
    await cleanup();
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("T59 fixture rows removed.");
    await db.$client.end();
    server.close(() => process.exit(0));
    return;
  }
  if (request.method === "POST" && request.url === "/confirm-fep") {
    try {
      await db.update(whatsappMessageReceipts).set({ classification: "free_entry_point", deliveredAt: new Date(),
        pricingModel: "PMP", category: "service", pricingType: "free_entry_point", billable: false })
        .where(and(eq(whatsappMessageReceipts.tenantId, tenantId), eq(whatsappMessageReceipts.messageId, refreshMessageId)));
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("Fixture receipt confirmed; wait for ChatRefresh.");
    } catch {
      response.writeHead(500);
      response.end("Fixture receipt update failed.");
    }
    return;
  }
  response.writeHead(404);
  response.end();
});
server.listen(4179, "127.0.0.1", () => console.log("T59 real-app fixture: http://localhost:4179/open; POST /confirm-fep; POST /cleanup"));
process.once("SIGINT", async () => {
  server.close();
  await cleanup();
  await db.$client.end();
  console.log("T59 fixture rows removed.");
  process.exit(0);
});
