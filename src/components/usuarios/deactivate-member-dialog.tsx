"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import type { MemberRow } from "@/src/components/usuarios/users-table";
import {
  deactivateMemberAction,
  getDeactivationPreviewAction,
  type CarteiraDestination,
} from "@/src/server/actions/deactivate";

interface Preview {
  leadsAtivos: { id: string; name: string }[];
  reunioesFuturas: { leadId: string; leadName: string; meetingAt: string }[];
}

export interface BrokerOption {
  userId: string;
  name: string;
}

/**
 * Desativação com destino da carteira (USER-02).
 *
 * A escolha nunca é feita às cegas: antes de perguntar o destino, a tela lê do
 * servidor quantos leads ativos a pessoa tem e **quais reuniões futuras já
 * estão marcadas com ela** (spec.md — Edge Cases), porque é essa lista que
 * torna a decisão informada.
 */
export function DeactivateMemberDialog({
  member,
  brokers,
  onClose,
}: {
  member: MemberRow | null;
  brokers: BrokerOption[];
  onClose: () => void;
}) {
  return (
    <Dialog
      isOpen={member !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      purpose="form"
      width={520}
    >
      {member && (
        <DeactivateForm
          key={member.memberId}
          member={member}
          brokers={brokers.filter((broker) => broker.userId !== member.userId)}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function DeactivateForm({
  member,
  brokers,
  onClose,
}: {
  member: MemberRow;
  brokers: BrokerOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [destino, setDestino] = useState<CarteiraDestination["tipo"]>(
    "redistribuir"
  );
  const [corretorId, setCorretorId] = useState<string | null>(
    brokers[0]?.userId ?? null
  );
  const [banner, setBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void getDeactivationPreviewAction({ memberId: member.memberId }).then(
      (result) => {
        if (!active) return;
        if (!result.ok) {
          setBanner(result.error);
          return;
        }
        setPreview({
          leadsAtivos: result.preview.leadsAtivos,
          reunioesFuturas: result.preview.reunioesFuturas.map((meeting) => ({
            leadId: meeting.leadId,
            leadName: meeting.leadName,
            meetingAt: meeting.meetingAt.toISOString(),
          })),
        });
      }
    );
    return () => {
      active = false;
    };
  }, [member.memberId]);

  const hasCarteira = (preview?.leadsAtivos.length ?? 0) > 0;

  async function handleSubmit() {
    setBanner(null);
    setIsSubmitting(true);

    const escolha: CarteiraDestination | undefined = !hasCarteira
      ? undefined
      : destino === "transferir"
        ? { tipo: "transferir", corretorId: corretorId ?? "" }
        : { tipo: destino };

    const result = await deactivateMemberAction({
      memberId: member.memberId,
      destino: escolha,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setBanner(result.error);
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <Layout
      header={<DialogHeader title="Desativar usuário" onOpenChange={onClose} />}
      content={
        <LayoutContent>
          <VStack gap={4}>
            {banner && <Banner status="error" title={banner} />}

            <Text type="body" color="secondary">
              {member.name} perde o acesso a esta imobiliária e sai das listas de
              atribuição. O nome dele continua nos leads que já atendeu.
            </Text>

            {preview === null ? (
              <Text type="supporting" color="secondary">
                Carregando a carteira…
              </Text>
            ) : (
              <>
                {preview.reunioesFuturas.length > 0 && (
                  <List
                    header={
                      <Text type="body" weight="medium">
                        Reuniões futuras já marcadas ({preview.reunioesFuturas.length})
                      </Text>
                    }
                    density="compact"
                    hasDividers
                  >
                    {preview.reunioesFuturas.map((meeting) => (
                      <ListItem
                        key={meeting.leadId}
                        label={meeting.leadName}
                        endContent={
                          <Timestamp
                            value={meeting.meetingAt}
                            format="date_time"
                          />
                        }
                      />
                    ))}
                  </List>
                )}

                {hasCarteira ? (
                  <RadioList
                    label={`Destino dos ${preview.leadsAtivos.length} leads ativos`}
                    value={destino}
                    onChange={(value) =>
                      setDestino(value as CarteiraDestination["tipo"])
                    }
                    isRequired
                  >
                    <RadioListItem
                      value="transferir"
                      label="Transferir para um corretor"
                      description="Todos os leads ativos passam para a mesma pessoa."
                      isDisabled={brokers.length === 0}
                    />
                    <RadioListItem
                      value="redistribuir"
                      label="Redistribuir pela política"
                      description="Cada lead vai para o corretor de menor carga no momento."
                      isDisabled={brokers.length === 0}
                    />
                    <RadioListItem
                      value="manter"
                      label="Manter com o desativado"
                      description="A atribuição não muda; o Pipeline passa a sinalizar responsável inativo."
                    />
                  </RadioList>
                ) : (
                  <Text type="body">
                    Sem leads ativos: nada precisa ser redistribuído.
                  </Text>
                )}

                {hasCarteira && destino === "transferir" && (
                  <Selector
                    label="Corretor que recebe a carteira"
                    value={corretorId ?? undefined}
                    onChange={(value) => setCorretorId(value)}
                    options={brokers.map((broker) => ({
                      value: broker.userId,
                      label: broker.name,
                    }))}
                    isRequired
                  />
                )}
              </>
            )}
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter>
          <HStack gap={2} hAlign="end">
            <Button label="Cancelar" variant="secondary" onClick={onClose} />
            <Button
              label="Desativar"
              variant="destructive"
              isLoading={isSubmitting}
              isDisabled={preview === null}
              clickAction={handleSubmit}
            />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}
