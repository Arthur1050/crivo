import { leads } from "../../../db/schema";

export const recentLeadQualification = {
  budgetCents: leads.budgetCents,
  modality: leads.modality,
};

export const leadQualification = {
  ...recentLeadQualification,
  region: leads.region,
  propertyType: leads.propertyType,
  purchaseHorizon: leads.purchaseHorizon,
  motivation: leads.motivation,
  creditStatus: leads.creditStatus,
  chainedOperation: leads.chainedOperation,
};
