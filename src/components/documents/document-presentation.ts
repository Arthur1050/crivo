import { MODALITY } from "../../verticals/real-estate/vocabulary";
import type { Document, Modality } from "@/src/server/data";

/** O texto extraído nunca chega ao cliente pela listagem (T27, DOCVIEW-01). */
export type DocumentTableItem = Omit<Document, "extractedText">;

export const MODALITY_LABELS: Record<Modality, string> = {
  [MODALITY.new]: "Novo",
  [MODALITY.used]: "Usado",
  [MODALITY.both]: "Ambos",
};

export const MODALITY_BADGE_VARIANT: Record<Modality, "blue" | "purple" | "teal"> = {
  [MODALITY.new]: "blue",
  [MODALITY.used]: "purple",
  [MODALITY.both]: "teal",
};

export const NO_CATEGORY_LABEL = "Sem categoria";
/** `expiresAt` é nullable (reserva LGPD do schema) — RD-05 AC2. */
export const NO_EXPIRY_LABEL = "Sem validade";
