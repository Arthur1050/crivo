import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";

export const MENSAGEM_INDISPONIVEL = "Vitrine temporariamente indisponível.";

/**
 * Estado de falha ao ler o banco (Edge Case de VSEG-02): só a mensagem, sem
 * host, SQL nem pilha. `paginaInteira` centraliza na tela quando o estado
 * substitui o layout da loja.
 */
export function VitrineIndisponivel({ paginaInteira = false }: { paginaInteira?: boolean }) {
  const estado = (
    <EmptyState
      headingLevel={1}
      title={MENSAGEM_INDISPONIVEL}
      description="Tente novamente em alguns instantes."
    />
  );
  return paginaInteira ? <Center height="100vh">{estado}</Center> : estado;
}

/**
 * Registra a falha sem dado de linha: prefixo, onde falhou e o nome e o código
 * do erro. A mensagem do erro fica de fora porque pode citar host, usuário ou
 * trecho do SQL.
 */
export function registrarErro(onde: string, erro: unknown): void {
  const nome = erro instanceof Error ? erro.name : typeof erro;
  const codigo = (erro as { code?: unknown } | null)?.code;
  const sufixo = typeof codigo === "string" ? ` ${codigo}` : "";
  console.error(`[vitrine] erro (${onde}): ${nome}${sufixo}`);
}
