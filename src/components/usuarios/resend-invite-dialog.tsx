"use client";

import { useState } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import type { MemberRow } from "@/src/components/usuarios/users-table";
import { resendInviteAction } from "@/src/server/actions/users";

/**
 * Reenvio de convite (USER-01 AC5): emite token novo e invalida o anterior.
 * O resultado do envio é dito na própria confirmação — inclusive a falha do
 * provedor, que é o caso comum enquanto não há chave de e-mail configurada.
 */
export function ResendInviteDialog({
  member,
  onClose,
}: {
  member: MemberRow | null;
  onClose: () => void;
}) {
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleResend() {
    if (!member) return;
    setIsSending(true);
    setMessage(null);

    const result = await resendInviteAction({ memberId: member.memberId });

    setIsSending(false);

    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    if (!result.emailSent) {
      setMessage(
        result.warning ?? "Convite reemitido, mas o e-mail não foi enviado."
      );
      return;
    }

    setMessage(null);
    onClose();
  }

  return (
    <AlertDialog
      isOpen={member !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setMessage(null);
          onClose();
        }
      }}
      title="Reenviar convite?"
      description={
        message ??
        `Um convite novo será enviado para ${member?.email ?? ""}. O link anterior deixa de valer.`
      }
      actionLabel="Reenviar"
      isActionLoading={isSending}
      onAction={handleResend}
    />
  );
}
