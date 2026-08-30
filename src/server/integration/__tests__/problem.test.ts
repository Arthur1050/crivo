import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../../../db";
import { integrationRefusals } from "../../../db/schema";
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

    // lote-9 — SAUDE-01/T9: instrumentado, mas sem novo parâmetro em
    // problem() e sem alterar corpo/status/header Allow da resposta.
    describe("instrumentação (T9)", () => {
      const ROUTE_PREFIX = `/api/v1/__test-method-not-allowed-t9__/${randomUUID()}`;

      afterAll(async () => {
        await db
          .delete(integrationRefusals)
          .where(like(integrationRefusals.route, `${ROUTE_PREFIX}%`));
        await db.$client.end();
      });

      it("grava a recusa com tenantId = null quando chamado com um Request real, sem alterar Allow nem o corpo", async () => {
        const route = `${ROUTE_PREFIX}/leads`;
        const handler = methodNotAllowed(["POST"]);
        const request = new Request(`http://local${route}`, { method: "GET" });

        const response = handler(request);
        expect(response.status).toBe(405);
        expect(response.headers.get("content-type")).toBe(PROBLEM_CONTENT_TYPE);
        expect(response.headers.get("allow")).toBe("POST");
        const body = await response.json();
        expect(body.code).toBe("metodo-nao-suportado");

        // `methodNotAllowed()` continua síncrono (não pode virar async sem
        // quebrar os testes de rota legados que chamam `handler()` sem
        // `await`) — a gravação é disparada sem ser esperada pelo handler.
        // `vi.waitFor` espera a escrita assíncrona terminar, sem acoplar o
        // teste a um `setTimeout` arbitrário.
        await vi.waitFor(
          async () => {
            const rows = await db
              .select()
              .from(integrationRefusals)
              .where(eq(integrationRefusals.route, route));
            expect(rows).toHaveLength(1);
          },
          { timeout: 10000, interval: 100 }
        );

        const rows = await db
          .select()
          .from(integrationRefusals)
          .where(eq(integrationRefusals.route, route));
        expect(rows[0].tenantId).toBeNull();
        expect(rows[0].status).toBe(405);
        expect(rows[0].code).toBe("metodo-nao-suportado");
        expect(rows[0].method).toBe("GET");
      });

      it("chamado sem Request (handler() legado) continua funcionando e não grava nada", async () => {
        const route = `${ROUTE_PREFIX}/sem-request`;
        const handler = methodNotAllowed(["POST"]);

        const response = handler();
        expect(response.status).toBe(405);

        const rows = await db
          .select()
          .from(integrationRefusals)
          .where(eq(integrationRefusals.route, route));
        expect(rows).toHaveLength(0);
      });
    });
  });
});
