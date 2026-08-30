import type { ReactNode } from "react";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { RelativeTime } from "@/src/components/shared/relative-time";
import { resolveIntegrationHealth } from "@/src/lib/pilot-metrics";
import type { RefusalSummary } from "@/src/server/data";

interface IntegrationHealthProps {
  /** Instante da última mensagem `sender = 'agente'` do tenant
   * (`getLastAgentMessageAt`) — proxy de "última atividade bem-sucedida do
   * agente" (SAUDE-02 AC3). `null` quando o tenant nunca recebeu nenhuma. */
  lastSuccessAt: Date | null;
  /** Recusas das últimas 24h já agrupadas por (código, rota)
   * (`getIntegrationRefusalsSince`, T6) — do tenant ativo mais as sem tenant
   * identificado (SAUDE-02 AC6). */
  refusals: RefusalSummary[];
  /** "Agora" para decidir a janela de 24h (mesmo padrão de
   * `getPendingAttendanceMeetings`: quem chama decide o instante, a lib pura
   * só compara). Default cobre o caso comum sem obrigar todo caller a passar. */
  now?: Date;
}

const NO_CODE_LABEL = "Sem código";

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/**
 * Bloco "Saúde da integração" do Dashboard (lote-9 — SAUDE-02), Server
 * Component de apresentação: resolve o estado com `resolveIntegrationHealth`
 * (lib pura, sem I/O) a partir de dados já buscados pelo chamador
 * (`lastSuccessAt`, `refusals`) e só formata para exibição.
 *
 * "Destaque visual sem mudar de posição" (AC5): o `StatusDot` e o rótulo de
 * estado sempre ocupam o mesmo lugar no card — só a cor (`error`/`success`)
 * e o pulso mudam com o estado, o bloco nunca se move nem soma/perde linhas
 * por causa do estado.
 *
 * Recusas são identificadas só por código e rota (AC7) — `RefusalSummary` já
 * chega sem nenhum campo de lead, então não há o que vazar aqui.
 */
export function IntegrationHealth({
  lastSuccessAt,
  refusals,
  now = new Date(),
}: IntegrationHealthProps): ReactNode {
  const refusalCount = refusals.reduce((sum, refusal) => sum + refusal.count, 0);
  const state = resolveIntegrationHealth({ lastSuccessAt, refusalCount }, now);
  const isProblem = state === "problema";

  return (
    <VStack gap={4}>
      <HStack gap={2} vAlign="center">
        <StatusDot
          variant={isProblem ? "error" : "success"}
          label={isProblem ? "Problema" : "Saudável"}
          isPulsing={isProblem}
        />
        <Text type="body" weight="medium">
          {isProblem ? "Problema detectado" : "Saudável"}
        </Text>
      </HStack>

      <HStack gap={8} wrap="wrap">
        <VStack gap={0.5}>
          <Text type="label" color="secondary">
            Última atividade bem-sucedida
          </Text>
          {lastSuccessAt ? (
            <RelativeTime value={lastSuccessAt.toISOString()} />
          ) : (
            <Text type="body" color="secondary">
              Nenhuma atividade registrada
            </Text>
          )}
        </VStack>

        <VStack gap={0.5}>
          <Text type="label" color="secondary">
            Recusas nas últimas 24h
          </Text>
          <Text type="body" weight="medium">
            {refusalCount}
          </Text>
        </VStack>
      </HStack>

      {refusals.length === 0 ? (
        <EmptyState
          title="Nenhuma recusa nas últimas 24h"
          description="O contrato de integração não recusou nenhuma chamada do agente nesse período."
        />
      ) : (
        <List density="balanced">
          {refusals.map((refusal) => (
            <ListItem
              key={`${refusal.code ?? "sem-codigo"}::${refusal.route}`}
              label={refusal.route}
              description={
                <HStack gap={2} vAlign="center">
                  <Token label={refusal.code ?? NO_CODE_LABEL} color="red" size="sm" />
                  <Text type="supporting" color="secondary">
                    {refusal.count} {pluralize(refusal.count, "ocorrência", "ocorrências")}
                  </Text>
                </HStack>
              }
              endContent={
                <RelativeTime value={refusal.lastOccurredAt.toISOString()} />
              }
            />
          ))}
        </List>
      )}
    </VStack>
  );
}
