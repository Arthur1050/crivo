import "server-only";
import { after } from "next/server";
import { getTenantSlug } from "../data/storefront";
import { requestStorefrontRevalidation } from "./revalidation";

/**
 * Agenda o aviso de revalidação da vitrine para DEPOIS da resposta (lote-16a —
 * VREV-02, AD-042). A server action grava, responde ao gestor e só então o
 * `after()` resolve o slug da imobiliária e chama o cliente da T11.
 *
 * Nunca lança e nunca falha a ação: fora de um escopo de requisição o `after()`
 * lança, e a leitura do slug pode falhar; os dois viram um `warn` e nada é
 * enviado. Chamar isto só depois de uma escrita bem-sucedida é
 * responsabilidade da action — uma escrita recusada não avisa a vitrine.
 */
export function scheduleStorefrontRevalidation(tenantId: string): void {
  try {
    after(async () => {
      try {
        const slug = await getTenantSlug(tenantId);
        if (!slug) {
          console.warn(`[vitrine] revalidação não enviada: slug ilegível (tenant=${tenantId})`);
          return;
        }
        await requestStorefrontRevalidation(slug);
      } catch (error) {
        const name = error instanceof Error ? error.name : "Error";
        console.warn(`[vitrine] revalidação não enviada: erro=${name} (tenant=${tenantId})`);
      }
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    console.warn(`[vitrine] revalidação não agendada: erro=${name} (tenant=${tenantId})`);
  }
}
