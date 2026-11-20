import "server-only";

import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../../../db";
import { leads } from "../../../db/schema";
import { assignedTo, type DashboardRange, type LeadScope } from "../../../server/data";
import { MODALITY, MOTIVATION } from "../vocabulary";

export interface LeadDistributionBucket {
  bucket: string;
  count: number;
}

export interface LeadDistributions {
  modality: LeadDistributionBucket[];
  motivation: LeadDistributionBucket[];
}

// Buckets fixos (sempre presentes, mesmo com contagem 0) — "nao_informado"
// cobre leads com o campo nulo (spec.md — distribuições nunca excluem dado).
const MODALITY_BUCKETS = [MODALITY.new, MODALITY.used, MODALITY.both, "nao_informado"] as const;
const MOTIVATION_BUCKETS = [MOTIVATION.investor, MOTIVATION.resident, "nao_informado"] as const;

/**
 * Distribuições de P por `modality` e `motivation` (lote-4 — DASH-04).
 * Buckets fixos, cada distribuição somando |P| (todo lead cai em exatamente
 * um bucket, incluindo "nao_informado" para campo nulo).
 */
export async function getLeadDistributions(
  scope: LeadScope,
  range: DashboardRange
): Promise<LeadDistributions> {
  const rows = await db
    .select({ modality: leads.modality, motivation: leads.motivation })
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, scope.tenantId),
        assignedTo(scope),
        gte(leads.firstContactAt, range.from),
        lte(leads.firstContactAt, range.to)
      )
    );

  const modalityCounts = new Map<string, number>();
  const motivationCounts = new Map<string, number>();
  for (const row of rows) {
    const modalityBucket = row.modality ?? "nao_informado";
    modalityCounts.set(
      modalityBucket,
      (modalityCounts.get(modalityBucket) ?? 0) + 1
    );
    const motivationBucket = row.motivation ?? "nao_informado";
    motivationCounts.set(
      motivationBucket,
      (motivationCounts.get(motivationBucket) ?? 0) + 1
    );
  }

  return {
    modality: MODALITY_BUCKETS.map((bucket) => ({
      bucket,
      count: modalityCounts.get(bucket) ?? 0,
    })),
    motivation: MOTIVATION_BUCKETS.map((bucket) => ({
      bucket,
      count: motivationCounts.get(bucket) ?? 0,
    })),
  };
}
