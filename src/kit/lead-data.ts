import "server-only";

import { getLeads as selectLeads, getRecentLeads as selectRecentLeads, type LeadScope } from "../server/data";
import { leadQualification, recentLeadQualification } from "../verticals/real-estate/data/qualification";

export function getLeads(scope: LeadScope, filters?: Parameters<typeof selectLeads>[1]) {
  return selectLeads(scope, filters, leadQualification);
}

export function getRecentLeads(scope: LeadScope, limit?: number) {
  return selectRecentLeads(scope, limit, recentLeadQualification);
}

export type LeadWithAssignee = Awaited<ReturnType<typeof getLeads>>[number];
