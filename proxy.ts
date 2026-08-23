import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";

/**
 * Porta de entrada do CRM (design.md — Porta de entrada; spec.md AUTH-01 AC1).
 *
 * O arquivo é `proxy.ts`, não `middleware.ts`: o Next 16 depreciou o convention
 * `middleware` e renomeou para `proxy`
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`,
 * "Version history": v16.0.0).
 *
 * Faz **apenas checagem otimista do cookie de sessão**. Nunca consulta banco e
 * nunca importa a DAL — o proxy roda em toda requisição, inclusive prefetch,
 * e a autorização de verdade mora em `verifySession()` na camada de acesso a
 * dados (T7), o mais perto possível do dado. Um cookie presente aqui prova
 * apenas que existe um cookie; quem decide se a sessão vale é a guarda.
 */

// Rotas de aplicação que respondem sem sessão. `/login` e `/recuperar-senha`
// são a própria porta; `/convite/[token]` é como um usuário novo entra antes
// de ter sessão; `/sem-acesso` é a tela de usuário autenticado sem vínculo,
// e precisa responder sem redirecionar de volta para o login.
const PUBLIC_ROUTES = ["/login", "/recuperar-senha", "/convite", "/sem-acesso"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return NextResponse.next();
  }

  // Lê só o cookie — `getSessionCookie` cuida do prefixo `__Secure-` que a
  // biblioteca usa em produção, sem tocar no banco.
  if (getSessionCookie(request)) {
    return NextResponse.next();
  }

  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  // A negativa é obrigatória: sem `matcher`, o proxy roda até em CSS e imagem
  // (doc do Next: "auth logic or redirects can unintentionally block CSS, JS,
  // or images from loading").
  //
  // `api` sai inteiro, e é isso que mantém os dois caminhos de autenticação
  // independentes por desenho (AD-021): `/api/v1/**` e `/api/cron/**` seguem
  // na credencial de serviço com `X-Crivo-Tenant` (SEC-01 do lote-7), e
  // `/api/auth/**` é o próprio handler do better-auth, que não pode exigir a
  // sessão que ele mesmo emite.
  //
  // `.*\..*` cobre tudo que tem extensão — `favicon.ico` e todo arquivo de
  // `public/`, que é servido a partir da raiz (`/crivo_white_symbol.png`) e
  // seria redirecionado para o login sem essa negativa.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
