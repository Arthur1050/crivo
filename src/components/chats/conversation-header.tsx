"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import type { ConversationControls } from "@/src/lib/conversation-control";
import {
  assumeConversationAction,
  registerOptOutAction,
  returnConversationToAgentAction,
} from "@/src/server/actions/chats";

interface ConversationHeaderProps {
  leadId: string;
  leadName: string;
  phone: string | null;
  /** Calculado no servidor por `conversationControls` (T4). */
  controls: ConversationControls;
  /**
   * Texto pronto de quem conduz (THREAD-01 AC4): o nome do agente, o nome de
   * quem assumiu, "Escalado para humano" ou a data do opt-out.
   */
  conductorLabel: string;
}

const OPT_OUT_DESCRIPTION =
  "O lead não receberá mais mensagens, nem do agente nem da equipe. Esta ação não pode ser desfeita pela tela.";

const CONDUCTOR_DOT = {
  agente: "success",
  humano: "accent",
  escalado: "warning",
  "opt-out": "neutral",
} as const;

/**
 * Cabeçalho da conversa no Chats (lote-14 — design.md C6): quem conduz e os
 * controles "Assumir conversa", "Devolver ao agente" e "Registrar opt-out".
 * A visibilidade de cada controle vem pronta de `conversationControls`; as
 * actions revalidam permissão, escopo e estado no servidor.
 */
export function ConversationHeader({
  leadId,
  leadName,
  phone,
  controls,
  conductorLabel,
}: ConversationHeaderProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isOptOutOpen, setIsOptOutOpen] = useState(false);
  const [isOptingOut, setIsOptingOut] = useState(false);
  // A confirmação de opt-out envia uma mensagem: a chave de idempotência nasce
  // com a caixa aberta e vale para as novas tentativas dela.
  const [optOutRequestId, setOptOutRequestId] = useState<string | null>(null);

  async function runAction(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    setNotice(null);
    const result = await action();
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  async function confirmOptOut() {
    if (!optOutRequestId) return;
    setIsOptingOut(true);
    setError(null);
    setNotice(null);
    const result = await registerOptOutAction({ leadId, requestId: optOutRequestId });
    setIsOptingOut(false);
    setIsOptOutOpen(false);
    if (!result.ok) setError(result.error);
    else if (result.warning) setNotice(result.warning);
    router.refresh();
  }

  return (
    <VStack gap={3} padding={4}>
      <HStack gap={3} vAlign="center">
        <Avatar name={leadName} size="md" />
        <StackItem size="fill">
          <VStack gap={0.5}>
            <Heading level={3}>{leadName}</Heading>
            <HStack gap={2} vAlign="center">
              {phone && (
                <Text type="supporting" color="secondary">
                  {phone}
                </Text>
              )}
              <StatusDot
                variant={CONDUCTOR_DOT[controls.conductor]}
                label={conductorLabel}
              />
              <Text type="supporting" color="secondary">
                {conductorLabel}
              </Text>
            </HStack>
          </VStack>
        </StackItem>
        <HStack gap={2} vAlign="center">
          {controls.canAssume && (
            <Button
              label="Assumir conversa"
              variant="primary"
              size="sm"
              clickAction={() =>
                runAction(() => assumeConversationAction({ leadId }))
              }
            />
          )}
          {controls.canReturn && (
            <Button
              label="Devolver ao agente"
              variant="secondary"
              size="sm"
              clickAction={() =>
                runAction(() => returnConversationToAgentAction({ leadId }))
              }
            />
          )}
          {controls.canOptOut && (
            <Button
              label="Registrar opt-out"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOptOutRequestId(crypto.randomUUID());
                setIsOptOutOpen(true);
              }}
            />
          )}
        </HStack>
      </HStack>

      {error && <Banner status="error" title={error} />}
      {notice && <Banner status="warning" title={notice} />}

      <AlertDialog
        isOpen={isOptOutOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) setIsOptOutOpen(false);
        }}
        title="Registrar opt-out deste lead?"
        description={OPT_OUT_DESCRIPTION}
        actionLabel="Registrar opt-out"
        cancelLabel="Cancelar"
        actionVariant="destructive"
        isActionLoading={isOptingOut}
        onAction={confirmOptOut}
      />
    </VStack>
  );
}
