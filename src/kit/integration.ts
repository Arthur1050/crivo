import "server-only";
import { createIntegrationKit } from "../server/integration/kit";
import { realEstate } from "../verticals/real-estate";

export const {
  problem, methodNotAllowed, authenticateIntegration, withIntegrationRoute,
  parseLeadPatch, parseAgentState, serializeLead, applyLeadPatch,
} = createIntegrationKit(realEstate);
export { authenticateIntegration as authenticate };
export { PROBLEM_CONTENT_TYPE } from "../server/integration/problem";
export type { AuthResult } from "../server/integration/auth";
export type { ProblemCode } from "../server/integration/problem";
export { INSTRUMENTED, type RouteContext } from "../server/integration/route";
export type LeadPatchDto = Parameters<typeof applyLeadPatch>[2];
