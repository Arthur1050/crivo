import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "../../db";
import { loginAttempts } from "../../db/schema";

/**
 * Contador de tentativas de login falhas POR E-MAIL (spec.md — AUTH-01 AC4).
 *
 * O rate limit nativo do better-auth (`rateLimit.customRules` em `config.ts`)
 * é chaveado por IP + rota e continua ligado: ele cobre a enxurrada vinda de
 * uma origem só. O que ele não cobre é a AC como está escrita — "para o mesmo
 * e-mail": um ataque distribuído troca de IP a cada tentativa e nunca esbarra
 * naquele limite. Os dois limites são complementares, e é por isso que este
 * módulo soma ao outro em vez de substituí-lo.
 *
 * O contador mora no Postgres porque o produto roda serverless na Vercel:
 * memória de processo não sobrevive entre invocações nem é compartilhada entre
 * instâncias, então um `Map` em módulo contaria quase sempre do zero.
 */

/** "em 1 minuto" da AC4. Janela deslizante: cada tentativa vale 60s. */
export const LOGIN_ATTEMPT_WINDOW_SECONDS = 60;

/** "mais de 10 tentativas ... falham" — a 11ª da janela é recusada. */
export const MAX_FAILED_LOGIN_ATTEMPTS = 10;

/**
 * A chave é o e-mail normalizado. Sem isto, alternar a caixa de uma letra
 * ("Fulano@x.com") daria ao atacante um contador novo a cada tentativa.
 */
function attemptKey(email: string): string {
  return email.trim().toLowerCase();
}

function windowStart(): Date {
  return new Date(Date.now() - LOGIN_ATTEMPT_WINDOW_SECONDS * 1000);
}

/**
 * Quantas falhas este e-mail acumulou na janela corrente. A consulta para no
 * limite: acima dele a resposta é sempre a mesma (recusar), então contar mais
 * não muda nada.
 */
export async function countRecentFailedLogins(email: string): Promise<number> {
  const rows = await db
    .select({ id: loginAttempts.id })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, attemptKey(email)),
        gte(loginAttempts.attemptedAt, windowStart())
      )
    )
    .limit(MAX_FAILED_LOGIN_ATTEMPTS);
  return rows.length;
}

/** O e-mail esgotou a janela e novas tentativas dele devem ser recusadas? */
export async function isLoginBlocked(email: string): Promise<boolean> {
  return (await countRecentFailedLogins(email)) >= MAX_FAILED_LOGIN_ATTEMPTS;
}

/**
 * Registra uma falha e apaga as tentativas já vencidas. A limpeza anda junto
 * com a gravação de propósito: sem cron nem job, é o próprio caminho que faz a
 * tabela crescer que a mantém pequena.
 */
export async function recordFailedLogin(email: string): Promise<void> {
  await db.insert(loginAttempts).values({ email: attemptKey(email) });
  await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.attemptedAt, windowStart()));
}
