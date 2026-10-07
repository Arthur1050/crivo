/**
 * Mensagem de confirmação do opt-out (AD-038). O opt-out nasce só da palavra
 * exata `sair` (`gate.mjs`) ou da tela do CRM (AD-034); os dois caminhos
 * enviam este mesmo texto. Constante pura, sem I/O, sem dependências — roda
 * dentro de um Code node do n8n e é importada pelo CRM.
 */

/** Confirmação única dos dois caminhos de opt-out (OPTMSG-01 AC1, AC2). */
export const OPT_OUT_CONFIRMATION =
  "Pronto, registramos seu pedido. Você não vai mais receber mensagens nossas por este número. Até mais!";
