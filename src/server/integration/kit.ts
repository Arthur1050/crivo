import "server-only";
import type { Vertical } from "../../vertical-kit";
import { createProblemResponses } from "./problem";
import { authenticate, type AuthResult } from "./auth";
import { withIntegrationRoute } from "./route";

export function createIntegrationKit(vertical: Vertical) {
  const responses = createProblemResponses(vertical.brand);
  const authenticateIntegration = (request: Request) => authenticate(request, responses.problem);
  return {
    ...responses,
    authenticateIntegration,
    withIntegrationRoute<Ctx = unknown>(handler: (request: Request, auth: AuthResult, ctx: Ctx) => Promise<Response>) {
      return withIntegrationRoute(handler, authenticateIntegration);
    },
  };
}
