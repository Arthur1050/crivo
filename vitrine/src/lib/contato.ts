/**
 * Links de contato da vitrine (lote-16b — VITEM-02, VLEGAL-01, VCAT-01). Puros.
 * Os números vêm das views já como o gestor digitou (com máscara, `+`, espaço):
 * aqui só ficam os dígitos e entra o código do Brasil quando falta.
 */

const CODIGO_DO_PAIS = "55";

/** Só os dígitos; com 10 ou 11 (DDD + número) recebe o `55`; com 12 ou 13 já o tem. */
function digitosComPais(numero: string): string {
  const digitos = numero.replace(/\D/g, "");
  return digitos.length === 10 || digitos.length === 11 ? `${CODIGO_DO_PAIS}${digitos}` : digitos;
}

/** `https://wa.me/<dígitos>?text=<mensagem>`, ou `null` se o número não tem dígito. */
export function linkWhatsapp(numero: string, mensagem: string): string | null {
  const digitos = digitosComPais(numero);
  if (digitos === "") return null;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`;
}

/** "Olá! Vi o imóvel <REF> na vitrine da <nome> e tenho interesse." (AD-043); a referência vai em maiúsculas. */
export function mensagemItem(referencia: string, nomeDaLoja: string): string {
  return `Olá! Vi o imóvel ${referencia.toUpperCase()} na vitrine da ${nomeDaLoja} e tenho interesse.`;
}

/** "Olá! Vi a vitrine da <nome> e gostaria de atendimento." */
export function mensagemCatalogo(nomeDaLoja: string): string {
  return `Olá! Vi a vitrine da ${nomeDaLoja} e gostaria de atendimento.`;
}

/** `tel:+<dígitos>`, com o `55` quando o número tem 10 ou 11 dígitos; `null` sem dígito. */
export function linkTelefone(telefone: string): string | null {
  const digitos = digitosComPais(telefone);
  return digitos === "" ? null : `tel:+${digitos}`;
}

/** `https://instagram.com/<handle>`; aceita o handle com `@` na frente. `null` se ficar vazio. */
export function linkInstagram(handle: string): string | null {
  const limpo = handle.trim().replace(/^@+/, "");
  return limpo === "" ? null : `https://instagram.com/${encodeURIComponent(limpo)}`;
}
