import "dotenv/config";
import { describe, expect, it } from "vitest";
import { createIntegrationKit } from "../kit";
import { PROBLEM_CODE } from "../../../lib/vocabulary";
import { realEstate } from "../../../verticals/real-estate";
import { testVertical } from "../../../vertical-kit/__tests__/fixture-vertical";

describe("marca na resposta de problema", () => {
  for (const [vertical, prefix] of [[realEstate, "urn:krivo:problem:"], [testVertical, "urn:acme:problem:"]] as const) {
    it(`liga o vertical ${vertical.id} às respostas e ao handler 405`, async () => {
      const { problem, methodNotAllowed } = createIntegrationKit(vertical);
      for (const code of Object.values(PROBLEM_CODE)) {
        const response = problem(409, code, "Detalhe distinto");
        expect(response.status).toBe(409);
        expect(response.headers.get("content-type")).toBe("application/problem+json");
        expect(await response.json()).toMatchObject({ type: `${prefix}${code}`, code, status: 409, detail: "Detalhe distinto" });
      }
      expect(await problem(401, PROBLEM_CODE.unauthenticated).json()).not.toHaveProperty("detail");
      const response = methodNotAllowed(["GET", "PATCH"])();
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, PATCH");
      expect(await response.json()).toMatchObject({ type: `${prefix}metodo-nao-suportado`, code: "metodo-nao-suportado" });
    });
  }
});
