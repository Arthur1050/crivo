/**
 * Recusa de duplicata (DOCBIN-01 AC4): a mensagem identifica o documento já
 * cadastrado no mesmo tenant, para o usuário abrir e editar o existente em vez
 * de reenviar. Compartilhada pelo cliente de upload e pela finalização no
 * servidor. Sem nome (corrida resolvida pelo índice único), cai no texto geral.
 */
export function duplicateDocumentMessage(existingName?: string | null): string {
  const name = existingName?.trim();
  return name
    ? `Este arquivo já está cadastrado nesta imobiliária como “${name}”. Abra esse documento na lista para editar nome, modalidade, categoria ou validade.`
    : "Este arquivo já foi enviado nesta imobiliária. Abra o documento existente na lista para editar nome, modalidade, categoria ou validade.";
}
