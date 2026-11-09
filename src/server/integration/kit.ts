import "server-only";
import type { Lead, PersistedQualificationColumns } from "../data";
import type { Vertical } from "../../vertical-kit";
import { createProblemResponses } from "./problem";
import { authenticate, type AuthResult } from "./auth";
import { withIntegrationRoute } from "./route";
import { createLeadPatchParser, type LeadPatchDto } from "./parsers";
import { patchLead, serializeLead } from "./leads";

export function createIntegrationKit<Q, Wire extends object>(vertical: Vertical<Q, Wire, PersistedQualificationColumns>) {
  const { qualification } = vertical;
  const responses = createProblemResponses(vertical.brand);
  const authenticateIntegration = (request: Request) => authenticate(request, responses.problem, vertical.brand);
  return {
    ...responses,
    authenticateIntegration,
    parseLeadPatch: createLeadPatchParser(qualification),
    serializeLead: (lead: Lead) => serializeLead(lead, qualification),
    applyLeadPatch(tenantId: string, leadId: string, dto: LeadPatchDto<Q>) {
      const { qualification: patch, ...coreFields } = dto;
      return patchLead(tenantId, leadId, {
        ...coreFields,
        ...(qualification && patch ? { leadColumns: qualification.toLeadColumns(patch) } : {}),
      });
    },
    withIntegrationRoute<Ctx = unknown>(handler: (request: Request, auth: AuthResult, ctx: Ctx) => Promise<Response>) {
      return withIntegrationRoute(handler, authenticateIntegration);
    },
  };
}
