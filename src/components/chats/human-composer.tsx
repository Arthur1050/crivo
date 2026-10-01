"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import {
  ChatComposer,
  ChatComposerInput,
  useChatComposerContext,
} from "@astryxdesign/core/Chat";
import { Text } from "@astryxdesign/core/Text";
import { sendHumanMessageAction } from "@/src/server/actions/chats";

interface HumanComposerProps {
  leadId: string;
  /** `ativo` com a janela aberta; `bloqueado` com ela fechada (JANELA-01). */
  state: "ativo" | "bloqueado";
  /** Texto pronto do servidor: "Janela do WhatsApp fecha em 3 h 20 min". */
  windowLabel: string | null;
  /** Aviso de janela fechada com o instante do fechamento (JANELA-01 AC3). */
  closedNotice: string;
}

type ComposerStatus = { type: "error" | "warning"; message: string };

/**
 * Botão de envio com rótulo em português (L-010): o `ChatSendButton` da
 * Astryx emite "Send" do catálogo. Lê o estado do composer pelo contexto.
 */
function SendButton({ isSending }: { isSending: boolean }) {
  const context = useChatComposerContext();
  return (
    <Button
      label="Enviar"
      variant="primary"
      size="sm"
      isLoading={isSending}
      isDisabled={!context?.canSend}
      onClick={() => context?.onSubmit(context.value)}
    />
  );
}

/**
 * Campo de envio do corretor ao lead (lote-14 — ENVIO-01, JANELA-01). O texto
 * só sai do campo depois de um envio aceito; com falha, o motivo aparece em
 * português e o texto fica para nova tentativa. A chave de idempotência nasce
 * com o rascunho e só é renovada quando a mensagem chegou ao lead.
 */
export function HumanComposer({
  leadId,
  state,
  windowLabel,
  closedNotice,
}: HumanComposerProps) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<ComposerStatus | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  // O `ChatComposer` chama `onChange("")` logo depois de `onSubmit`, mesmo no
  // modo controlado. Ignorar essa limpeza é o que mantém o texto no campo
  // quando o envio falha (ENVIO-01 AC9); só um envio aceito limpa o campo.
  const ignoreNextClearRef = useRef(false);

  function handleChange(value: string) {
    if (ignoreNextClearRef.current && value === "") {
      ignoreNextClearRef.current = false;
      return;
    }
    ignoreNextClearRef.current = false;
    setText(value);
  }

  const isBlocked = state === "bloqueado";

  async function handleSubmit(value: string) {
    if (isBlocked || isSending) return;
    ignoreNextClearRef.current = true;
    setIsSending(true);
    setStatus(null);
    const result = await sendHumanMessageAction({ leadId, text: value, requestId });
    setIsSending(false);

    if (result.ok) {
      setText("");
      setRequestId(crypto.randomUUID());
      router.refresh();
      return;
    }

    if (result.failure === "entregue-sem-registro") {
      // O lead recebeu: o campo é limpo e a chave renovada, para que uma
      // nova tentativa nunca reenvie a mesma mensagem.
      setText("");
      setRequestId(crypto.randomUUID());
      setStatus({ type: "warning", message: result.error });
      router.refresh();
      return;
    }

    setStatus({
      type: "error",
      message: result.failure === "janela-fechada" ? closedNotice : result.error,
    });
    router.refresh();
  }

  return (
    <ChatComposer
      value={text}
      onChange={handleChange}
      onSubmit={handleSubmit}
      placeholder="Escreva para o lead"
      isDisabled={isBlocked || isSending}
      elevation="none"
      input={
        <ChatComposerInput
          label="Mensagem para o lead"
          placeholder="Escreva para o lead"
        />
      }
      headerContext={
        windowLabel && !isBlocked ? (
          <Text type="supporting" color="secondary">
            {windowLabel}
          </Text>
        ) : undefined
      }
      sendButton={<SendButton isSending={isSending} />}
      status={isBlocked ? { type: "warning", message: closedNotice } : status ?? undefined}
    />
  );
}
