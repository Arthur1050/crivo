import type { VerticalBrand } from "../vertical-kit";

/**
 * Recusa de duplicata (DOCBIN-01 AC4): a mensagem identifica o documento já
 * cadastrado no mesmo tenant, para o usuário abrir e editar o existente em vez
 * de reenviar. Compartilhada pelo cliente de upload e pela finalização no
 * servidor. Sem nome (corrida resolvida pelo índice único), cai no texto geral.
 */
export function duplicateDocumentMessage(tenantNoun: VerticalBrand["tenantNoun"], existingName?: string | null): string {
  const name = existingName?.trim();
  return name
    ? `Este arquivo já está cadastrado nesta ${tenantNoun.singular} como “${name}”. Abra esse documento na lista para editar nome, modalidade, categoria ou validade.`
    : `Este arquivo já foi enviado nesta ${tenantNoun.singular}. Abra o documento existente na lista para editar nome, modalidade, categoria ou validade.`;
}
