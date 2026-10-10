import { revalidateTag } from "next/cache";
import { tagDaLoja } from "../../../src/contrato";
import { lerCorpo, verificarSegredo } from "../../../src/revalidacao";

/**
 * `POST /api/revalidar` (lote-16b — VCACHE-02; AD-042): o CRM avisa que o
 * catálogo de uma loja mudou. Única rota da vitrine que aceita escrita, e ela
 * não grava nada: só expira a tag `tenant:<slug>:catalogo`.
 *
 * `{ expire: 0 }` é a forma que a doc do Next indica para chamada de sistema
 * externo (`revalidateTag.md`): a próxima leitura é bloqueante e traz o banco.
 * Os logs levam o prefixo `[vitrine]`, o slug (só quando válido) e o desfecho;
 * nunca o segredo nem o cabeçalho recebido.
 */

const SEM_CORPO = (status: number, cabecalhos?: HeadersInit) =>
  new Response(null, { status, headers: cabecalhos });

export async function POST(request: Request): Promise<Response> {
  // Autenticação antes de ler o corpo: sem segredo, nada é lido nem revalidado (AC4).
  const autorizado = verificarSegredo(
    request.headers.get("authorization"),
    process.env.VITRINE_REVALIDATE_SECRET
  );
  if (!autorizado) {
    console.warn("[vitrine] revalidar: recusado (401)");
    return SEM_CORPO(401);
  }

  const leitura = lerCorpo(await request.text());
  if (!leitura.ok) {
    console.warn(`[vitrine] revalidar: corpo recusado (400, ${leitura.motivo})`);
    return SEM_CORPO(400);
  }

  revalidateTag(tagDaLoja(leitura.corpo.slug), { expire: 0 });
  console.info(`[vitrine] revalidar: ${leitura.corpo.slug} (204)`);
  return SEM_CORPO(204);
}

/** Qualquer outro método (AC6). Explícitos para o desfecho não depender do padrão do framework. */
function naoPermitido(): Response {
  return SEM_CORPO(405, { Allow: "POST" });
}

export const GET = naoPermitido;
export const PUT = naoPermitido;
export const PATCH = naoPermitido;
export const DELETE = naoPermitido;
