/**
 * Usuário mock exibido no rodapé da sidebar (redesign-crm-astryx — RD-01 AC4).
 * O projeto não tem autenticação nem tabela de usuários no MVP (AD-001); o
 * discuss decidiu por um helper puro em vez de schema descartável. Quando a
 * autenticação existir, este helper é substituído pelo usuário real — o
 * contrato de exibição (nome + email) não muda.
 *
 * Sem `server-only` de propósito: a sidebar é um Client Component e chama
 * este helper com dados já serializados vindos do layout RSC.
 */
export interface MockManager {
  name: string;
  email: string;
}

/** Identificação mínima do tenant necessária para derivar o gestor mock. */
export interface MockManagerTenant {
  id: string;
  name: string;
}

/** Nome fixo do gestor mock (design.md — R0, rodapé da sidebar). */
const MANAGER_NAME = "Gestor Demo";

const EMAIL_DOMAIN_SUFFIX = "com.br";

// Marcas diacríticas combinantes (U+0300–U+036F) produzidas por normalize("NFD").
// Construída via `new RegExp` com escapes ASCII de propósito: um literal de
// regex com os caracteres combinantes crus é ilegível e frágil a reencoding.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Reduz um nome de imobiliária a um slug de domínio: sem acentos, minúsculo,
 * apenas [a-z0-9] separados por hífen.
 */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Deriva o gestor mock do tenant ativo. Puro e determinístico: o mesmo tenant
 * sempre produz o mesmo `{name, email}`, e tenants com nomes diferentes
 * produzem emails diferentes (o email é derivado do nome do tenant). Quando o
 * nome não gera nenhum caractere de slug (nome só com símbolos/espaços), o
 * `id` do tenant é usado como domínio — nunca um email malformado do tipo
 * "gestor@.com.br".
 */
export function getMockManager(tenant: MockManagerTenant): MockManager {
  const slug = slugify(tenant.name);
  const domain = slug === "" ? tenant.id : slug;
  return {
    name: MANAGER_NAME,
    email: `gestor@${domain}.${EMAIL_DOMAIN_SUFFIX}`,
  };
}
