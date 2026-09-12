import "dotenv/config";
import { pathToFileURL } from "node:url";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { conversations, leads, messages, tenants } from "./schema";

/**
 * Reset do lead de smoke no CRM — alvo 3 do checklist de limpeza
 * (`n8n/smoke/roteiro.md` §9).
 *
 * A limpeza entre cenários da prova conversacional (AD-027) tem três alvos em
 * dois sistemas. Este comando cobre o único que mora no CRM; os outros dois
 * (sessão em `n8n_chat_histories` e linha de `conversa_estado`) são do n8n e
 * saem pelo workflow `crivo-smoke-reset` (`n8n/workflows/smoke-reset.ts`).
 *
 * Os dois lados ficam separados de propósito: para este script alcançar a
 * memória do n8n ele precisaria de credencial do Postgres da instância, e o
 * desacoplamento entre CRM e n8n (INT-08) vale nas duas direções — cada
 * sistema limpa o próprio estado.
 *
 * **Ordem obrigatória** `messages` → `conversations` → `leads`: as FKs não têm
 * `onDelete` (`schema.ts` — `conversations.leadId` é a única que aponta para
 * `leads.id`), então apagar fora de ordem é rejeitado pelo banco. Tudo numa
 * transação: metade apagada é estado pior do que não ter apagado nada.
 *
 * Idempotente: rodar de novo sem lead nenhum não é erro, é `nada-a-apagar`.
 *
 * Uso: `npm run smoke:reset`
 */

// Alvo FIXO, não parametrizável pela linha de comando. É uma rotina
// destrutiva: com alvo por argumento, um waId digitado errado apagaria a
// conversa de um lead real em vez da do número de teste. Trocar de alvo é
// editar estas duas constantes deliberadamente, num commit — não um argumento
// de terminal. Os valores são os do `roteiro.md` §1.
const SMOKE_TENANT_SLUG = "triangulo";
const SMOKE_EXTERNAL_ID = "553499532444";

export interface SmokeResetResult {
  outcome: "apagado" | "nada-a-apagar";
  deletedMessages: number;
  deletedConversations: number;
}

export async function resetSmokeLead(options?: {
  tenantSlug?: string;
  externalId?: string;
}): Promise<SmokeResetResult> {
  const tenantSlug = options?.tenantSlug ?? SMOKE_TENANT_SLUG;
  const externalId = options?.externalId ?? SMOKE_EXTERNAL_ID;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug));

  if (!tenant) {
    throw new Error(
      `Imobiliária de slug '${tenantSlug}' não existe. Rode \`npm run db:seed\` ou confira o slug.`
    );
  }

  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(
      and(eq(leads.tenantId, tenant.id), eq(leads.externalId, externalId))
    );

  if (!lead) {
    return { outcome: "nada-a-apagar", deletedMessages: 0, deletedConversations: 0 };
  }

  return db.transaction(async (tx) => {
    const conversationRows = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.leadId, lead.id));
    const conversationIds = conversationRows.map((row) => row.id);

    let deletedMessages = 0;
    if (conversationIds.length > 0) {
      const removed = await tx
        .delete(messages)
        .where(inArray(messages.conversationId, conversationIds))
        .returning({ id: messages.id });
      deletedMessages = removed.length;
    }

    const removedConversations = await tx
      .delete(conversations)
      .where(eq(conversations.leadId, lead.id))
      .returning({ id: conversations.id });

    await tx.delete(leads).where(eq(leads.id, lead.id));

    return {
      outcome: "apagado" as const,
      deletedMessages,
      deletedConversations: removedConversations.length,
    };
  });
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  resetSmokeLead()
    .then((result) => {
      if (result.outcome === "nada-a-apagar") {
        console.log(
          `CRM limpo: nenhum lead '${SMOKE_EXTERNAL_ID}' em '${SMOKE_TENANT_SLUG}'.`
        );
      } else {
        console.log(
          `CRM limpo: lead '${SMOKE_EXTERNAL_ID}' de '${SMOKE_TENANT_SLUG}' apagado (${result.deletedMessages} mensagens, ${result.deletedConversations} conversas).`
        );
      }
      console.log(
        "Falta o lado do n8n (memória + conversa_estado): rode o workflow `crivo-smoke-reset`."
      );
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
