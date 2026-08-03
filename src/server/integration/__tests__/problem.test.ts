import { describe, expect, it } from "vitest";
import { methodNotAllowed, problem, PROBLEM_CONTENT_TYPE } from "../problem";

describe("server/integration problem", () => {
  describe("problem()", () => {
    it("monta uma Response application/problem+json com status, code e detail corretos (design.md — RFC 9457)", async () => {
      const response = problem(404, "recurso-nao-encontrado", "Lead não encontrado.");

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toBe(PROBLEM_CONTENT_TYPE);

      const body = await response.json();
      expect(body.status).toBe(404);
      expect(body.code).toBe("recurso-nao-encontrado");
      expect(body.detail).toBe("Lead não encontrado.");
      expect(typeof body.type).toBe("string");
      expect(typeof body.title).toBe("string");
      expect(body.title.length).toBeGreaterThan(0);
    });

    it("omite detail quando não informado (não emite a chave com undefined)", async () => {
      const response = problem(401, "nao-autenticado");
      const body = await response.json();
      expect(body.code).toBe("nao-autenticado");
      expect(body.status).toBe(401);
      expect("detail" in body).toBe(false);
    });

    it("cada ProblemCode gera um status/code coerente e reproduzível", async () => {
      const cases: Array<[number, Parameters<typeof problem>[1]]> = [
        [400, "payload-invalido"],
        [409, "transicao-invalida"],
        [409, "lead-travado-por-humano"],
        [409, "motivo-escalonamento-obrigatorio"],
        [413, "corpo-grande-demais"],
        [404, "rota-inexistente"],
        [405, "metodo-nao-suportado"],
      ];

      for (const [status, code] of cases) {
        const response = problem(status, code);
        expect(response.status).toBe(status);
        const body = await response.json();
        expect(body.code).toBe(code);
        expect(body.status).toBe(status);
      }
    });
  });

  describe("methodNotAllowed()", () => {
    it("retorna uma função que produz 405 problem+json com code metodo-nao-suportado e header Allow", async () => {
      const handler = methodNotAllowed(["GET", "POST"]);
      const response = handler();

      expect(response.status).toBe(405);
      expect(response.headers.get("content-type")).toBe(PROBLEM_CONTENT_TYPE);
      expect(response.headers.get("allow")).toBe("GET, POST");

      const body = await response.json();
      expect(body.code).toBe("metodo-nao-suportado");
      expect(body.status).toBe(405);
    });
  });
});
