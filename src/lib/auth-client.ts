import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

/**
 * Cliente do better-auth para os componentes client (spec.md — AUTH-01).
 * Fala com o handler de `app/api/auth/[...all]/route.ts` e cuida do cookie de
 * sessão sozinho — nenhum componente monta requisição de login à mão.
 *
 * `baseURL` fica implícito: sem ele o cliente usa a própria origem da página,
 * que é o que queremos tanto em `localhost` quanto no domínio de produção.
 */
export const authClient = createAuthClient({
  plugins: [organizationClient()],
});

export const { signIn, signOut, useSession } = authClient;
