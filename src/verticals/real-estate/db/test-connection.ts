/** Papel de banco da vitrine pública (AD-040); o mesmo nome em todos os alvos. */
export const STOREFRONT_ROLE = "krivo_vitrine";

/**
 * URL com que o papel `krivo_vitrine` conecta no alvo de `baseUrl` (a URL do
 * worker, já resolvida por `resolveTestDatabaseUrl`): troca só usuário e senha
 * e preserva host, banco e parâmetros. A senha vem da variável do ambiente
 * local `VITRINE_TEST_DB_PASSWORD` e nunca aparece em mensagem de erro.
 */
export function resolveStorefrontTestUrl(input: {
  baseUrl: string;
  password: string | undefined;
}): string {
  const { baseUrl, password } = input;
  if (!password) {
    throw new Error(
      "VITRINE_TEST_DB_PASSWORD não definida no ambiente local: o teste do papel da vitrine precisa dela para conectar como o papel."
    );
  }
  const url = new URL(baseUrl);
  url.username = STOREFRONT_ROLE;
  // O setter de `URL` não codifica `%`; sem isto uma senha com `%` vira URL inválida.
  url.password = encodeURIComponent(password);
  return url.toString();
}
