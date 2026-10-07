import "dotenv/config";
import { pathToFileURL } from "node:url";
import { and, inArray, isNull } from "drizzle-orm";
import { db } from "./index";
import { serviceApiKeys } from "./schema";

/**
 * Revoga as chaves de serviço ativas de um rótulo (`n8n/README.md` §12.3,
 * passo 4), recusando deixar o agente sem nenhuma chave ativa.
 *
 * Par de `db:mint-service-key`: emitir é aditivo, revogar é este comando. A
 * validação do CRM casa por `key_hash` com `revoked_at IS NULL`, então a
 * revogação só vale depois de a chave nova estar autenticando (passo 3). Esta
 * trava garante o mínimo: nunca zerar as chaves ativas. Linhas já revogadas
 * ficam como estão, e nem `key_hash` nem valor de chave saem na saída.
 *
 * Uso: `npm run db:revoke-service-key -- "<rótulo>"`
 */

const USAGE = 'Uso: npm run db:revoke-service-key -- "<rótulo>"';

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export class RevokeServiceKeyError extends Error {
  constructor(
    readonly reason: "sem-rotulo" | "nao-encontrada" | "ultima-chave",
    message: string
  ) {
    super(message);
    this.name = "RevokeServiceKeyError";
  }
}

export async function revokeServiceKeysByLabel(
  label: string,
  executor: DbExecutor = db
): Promise<{ revoked: number }> {
  const wanted = label.trim();
  if (!wanted) throw new RevokeServiceKeyError("sem-rotulo", USAGE);

  return executor.transaction(async (tx) => {
    // Trava as ativas: duas revogações simultâneas não zeram as chaves juntas.
    const active = await tx
      .select({ id: serviceApiKeys.id, label: serviceApiKeys.label })
      .from(serviceApiKeys)
      .where(isNull(serviceApiKeys.revokedAt))
      .for("update");
    const matching = active.filter((row) => row.label === wanted);

    if (matching.length === 0) {
      throw new RevokeServiceKeyError(
        "nao-encontrada",
        `Nenhuma chave de serviço ativa com o rótulo '${wanted}'. Nada foi alterado.`
      );
    }
    if (matching.length === active.length) {
      throw new RevokeServiceKeyError(
        "ultima-chave",
        `Recusado: revogar '${wanted}' deixaria o agente sem nenhuma chave de serviço ativa. ` +
          "Emita a chave nova e confirme que ela autentica antes (n8n/README.md §12.3, passos 1 a 3). " +
          "Nada foi alterado."
      );
    }

    await tx
      .update(serviceApiKeys)
      .set({ revokedAt: new Date() })
      .where(and(inArray(serviceApiKeys.id, matching.map((row) => row.id)), isNull(serviceApiKeys.revokedAt)));
    return { revoked: matching.length };
  });
}

export async function runRevokeServiceKeyCli(
  args: string[],
  deps: {
    revoke: (label: string) => Promise<{ revoked: number }>;
    log: (line: string) => void;
    error: (line: string) => void;
  }
): Promise<number> {
  try {
    const label = (args[0] ?? "").trim();
    const { revoked } = await deps.revoke(label);
    deps.log(`${revoked} chave(s) de serviço revogada(s) com o rótulo '${label}'.`);
    return 0;
  } catch (error) {
    deps.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  runRevokeServiceKeyCli(process.argv.slice(2), {
    revoke: (label) => revokeServiceKeysByLabel(label),
    log: (line) => console.log(line),
    error: (line) => console.error(line),
  }).then(async (code) => {
    await db.$client.end();
    process.exit(code);
  });
}
