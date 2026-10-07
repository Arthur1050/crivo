import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../index";
import { serviceApiKeys } from "../schema";
import {
  RevokeServiceKeyError,
  revokeServiceKeysByLabel,
  runRevokeServiceKeyCli,
} from "../revoke-service-key";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
class Rollback extends Error {}

/**
 * Cada caso roda numa transação revertida: apaga a tabela inteira dentro dela
 * para controlar todas as chaves ativas e desfaz tudo no fim (o banco de teste
 * guarda a chave de serviço do seed, que o caso não pode ver nem tocar).
 */
async function inRolledBackTransaction(body: (tx: Tx) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await tx.delete(serviceApiKeys);
      await body(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

const OLD_REVOCATION = new Date("2026-01-15T12:00:00.000Z");

async function seedKeys(tx: Tx) {
  const marker = randomUUID();
  const rows = [
    { label: "A", keyHash: `hash-a1-${marker}` },
    { label: "A", keyHash: `hash-a2-${marker}` },
    { label: "B", keyHash: `hash-b-${marker}` },
    { label: "A", keyHash: `hash-a-revogada-${marker}`, revokedAt: OLD_REVOCATION },
  ];
  await tx.insert(serviceApiKeys).values(rows);
  return { marker, hashes: rows.map((row) => row.keyHash) };
}

async function snapshot(tx: Tx) {
  const rows = await tx.select().from(serviceApiKeys);
  return rows
    .map((row) => ({ keyHash: row.keyHash, label: row.label, revokedAt: row.revokedAt?.toISOString() ?? null }))
    .sort((a, b) => a.keyHash.localeCompare(b.keyHash));
}

afterAll(async () => {
  await db.$client.end();
});

describe("L15 T8 — revogação de chave de serviço por rótulo (REVOGA-01)", () => {
  it("revoga todas as ativas do rótulo, devolve a quantidade e preserva a data da já revogada (AC1, AC4, L-053)", async () => {
    await inRolledBackTransaction(async (tx) => {
      await seedKeys(tx);
      const before = new Date();

      const result = await revokeServiceKeysByLabel("A", tx);

      expect(result).toEqual({ revoked: 2 });
      const rows = await tx.select().from(serviceApiKeys).where(eq(serviceApiKeys.label, "A"));
      expect(rows.filter((row) => row.revokedAt === null)).toHaveLength(0);
      const revoked = rows.filter((row) => row.revokedAt !== null);
      expect(revoked).toHaveLength(3);
      const preserved = revoked.find((row) => row.keyHash.includes("revogada"));
      expect(preserved?.revokedAt?.toISOString()).toBe(OLD_REVOCATION.toISOString());
      for (const row of revoked.filter((r) => !r.keyHash.includes("revogada"))) {
        expect(row.revokedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      }
      const [b] = await tx.select().from(serviceApiKeys).where(eq(serviceApiKeys.label, "B"));
      expect(b.revokedAt).toBeNull();
    });
  });

  it("recusa revogar a última chave ativa: lança, não altera nada e cita o README §12.3 (AC3)", async () => {
    await inRolledBackTransaction(async (tx) => {
      await seedKeys(tx);
      await revokeServiceKeysByLabel("A", tx);
      const before = await snapshot(tx);

      const attempt = revokeServiceKeysByLabel("B", tx);

      await expect(attempt).rejects.toBeInstanceOf(RevokeServiceKeyError);
      await expect(attempt).rejects.toMatchObject({ reason: "ultima-chave" });
      await expect(attempt).rejects.toThrow(/n8n\/README\.md §12\.3/);
      expect(await snapshot(tx)).toEqual(before);
    });
  });

  it("recusa quando todas as ativas têm o rótulo pedido, sem outra ativa de reserva (AC3)", async () => {
    await inRolledBackTransaction(async (tx) => {
      await tx.insert(serviceApiKeys).values([
        { label: "A", keyHash: `hash-unico-1-${randomUUID()}` },
        { label: "A", keyHash: `hash-unico-2-${randomUUID()}` },
      ]);
      const before = await snapshot(tx);

      await expect(revokeServiceKeysByLabel("A", tx)).rejects.toMatchObject({ reason: "ultima-chave" });

      expect(await snapshot(tx)).toEqual(before);
    });
  });

  it("rótulo sem chave ativa (inexistente, só de caixa diferente, ou só revogada) lança sem alterar linha (AC2)", async () => {
    await inRolledBackTransaction(async (tx) => {
      await seedKeys(tx);
      await tx.insert(serviceApiKeys).values({ label: "C", keyHash: `hash-c-${randomUUID()}`, revokedAt: OLD_REVOCATION });
      const before = await snapshot(tx);

      for (const label of ["inexistente", "a", "C"]) {
        await expect(revokeServiceKeysByLabel(label, tx)).rejects.toMatchObject({ reason: "nao-encontrada" });
      }

      expect(await snapshot(tx)).toEqual(before);
    });
  });

  it("rótulo vazio ou só espaços lança com o uso, sem alterar nada (AC5)", async () => {
    await inRolledBackTransaction(async (tx) => {
      await seedKeys(tx);
      const before = await snapshot(tx);

      for (const label of ["", "   "]) {
        await expect(revokeServiceKeysByLabel(label, tx)).rejects.toMatchObject({ reason: "sem-rotulo" });
      }
      await expect(revokeServiceKeysByLabel("", tx)).rejects.toThrow(/Uso: npm run db:revoke-service-key/);

      expect(await snapshot(tx)).toEqual(before);
    });
  });
});

describe("L15 T8 — saída do CLI (REVOGA-01 AC1, AC2, AC3, AC5, AC6)", () => {
  function cli(tx: Tx) {
    const out: string[] = [];
    const err: string[] = [];
    const run = (args: string[]) =>
      runRevokeServiceKeyCli(args, {
        revoke: (label) => revokeServiceKeysByLabel(label, tx),
        log: (line) => out.push(line),
        error: (line) => err.push(line),
      });
    return { out, err, run };
  }

  it("sucesso sai com 0 e imprime a quantidade revogada, sem key_hash nem valor de chave (AC1, AC6)", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { hashes } = await seedKeys(tx);
      const { out, err, run } = cli(tx);

      const code = await run(["A"]);

      expect(code).toBe(0);
      expect(out.join("\n")).toContain("2 chave(s) de serviço revogada(s) com o rótulo 'A'");
      const printed = [...out, ...err].join("\n");
      for (const hash of hashes) expect(printed).not.toContain(hash);
    });
  });

  it("recusa de última chave sai com 1, cita §12.3 e não imprime key_hash (AC3, AC6)", async () => {
    await inRolledBackTransaction(async (tx) => {
      const { hashes } = await seedKeys(tx);
      await revokeServiceKeysByLabel("A", tx);
      const { out, err, run } = cli(tx);

      const code = await run(["B"]);

      expect(code).toBe(1);
      expect(err.join("\n")).toContain("§12.3");
      const printed = [...out, ...err].join("\n");
      for (const hash of hashes) expect(printed).not.toContain(hash);
    });
  });

  it("sem rótulo ou rótulo em branco sai com 1 e imprime o uso (AC5)", async () => {
    await inRolledBackTransaction(async (tx) => {
      await seedKeys(tx);
      for (const args of [[], [""], ["   "]]) {
        const { err, run } = cli(tx);
        expect(await run(args)).toBe(1);
        expect(err.join("\n")).toContain('npm run db:revoke-service-key -- "<rótulo>"');
      }
    });
  });

  it("rótulo inexistente sai com 1 (AC2)", async () => {
    await inRolledBackTransaction(async (tx) => {
      await seedKeys(tx);
      const { err, run } = cli(tx);
      expect(await run(["inexistente"])).toBe(1);
      expect(err.join("\n")).toContain("inexistente");
    });
  });
});
