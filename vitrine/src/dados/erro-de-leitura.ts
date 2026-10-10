/**
 * Falha de leitura do banco, sem o texto original (lote-16b — T18; VSEG-02).
 *
 * O Next imprime no log do servidor todo erro lançado por uma função com
 * `use cache`, com a mensagem e a causa. A do driver cita o SQL, os parâmetros e
 * o host. A camada de cache troca o erro por este, que só leva o código
 * (`ENOTFOUND`, `28P01`, `57014`...), útil para diagnosticar e sem dado sensível.
 * A regra de log da vitrine é "prefixo, slug, status e nome de erro".
 */
export class ErroDeLeitura extends Error {
  readonly code: string | undefined;

  constructor(causa: unknown) {
    super("Falha ao ler o catálogo da vitrine.");
    this.name = "ErroDeLeitura";
    this.code = codigoDe(causa);
  }
}

/** Primeiro `code` textual na cadeia de causas (o Drizzle embrulha o erro do `pg`). */
function codigoDe(erro: unknown): string | undefined {
  let atual: unknown = erro;
  for (let nivel = 0; nivel < 4 && typeof atual === "object" && atual !== null; nivel += 1) {
    const codigo = (atual as { code?: unknown }).code;
    if (typeof codigo === "string") return codigo;
    atual = (atual as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Executa a leitura e, se falhar, lança `ErroDeLeitura` no lugar do erro original. */
export async function lerDoBanco<T>(leitura: () => Promise<T>): Promise<T> {
  try {
    return await leitura();
  } catch (erro) {
    throw new ErroDeLeitura(erro);
  }
}
