"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxList, CheckboxListItem } from "@astryxdesign/core/CheckboxList";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TimeInput } from "@astryxdesign/core/TimeInput";
import {
  createISOTimeString,
  type ISOTimeString,
} from "@astryxdesign/core/utils";
import type { WorkWindowField } from "@/src/lib/work-window";
import { saveWorkWindowAction } from "@/src/server/actions/work-window";

/**
 * Edição da janela de trabalho de um vínculo (AGENDA-01 AC1/AC6).
 *
 * Um componente só para as duas superfícies porque a regra é uma só: o próprio
 * corretor salva a sua pelo rodapé da sidebar, administrador e gestor salvam a
 * de qualquer um pela tabela de Usuários. Quem pode salvar é decidido em
 * `saveWorkWindowAction`, no servidor (AC7) — esta tela só mostra o que ela
 * responde, exatamente como o `MemberRolesDialog` faz com a regra do último
 * administrador.
 */

// ISO 1(segunda)–7(domingo), mesma convenção do schema e do formulário de
// Configurações.
const WEEKDAY_OPTIONS: { value: string; label: string }[] = [
  { value: "1", label: "Segunda" },
  { value: "2", label: "Terça" },
  { value: "3", label: "Quarta" },
  { value: "4", label: "Quinta" },
  { value: "5", label: "Sexta" },
  { value: "6", label: "Sábado" },
  { value: "7", label: "Domingo" },
];

const HELPER =
  "Dias e horário em que este corretor atende. A reunião só é atribuída a quem tem a janela cobrindo o horário inteiro.";

export interface WorkWindowTarget {
  memberId: string;
  name: string;
  email: string;
  workDays: number[] | null;
  workHoursStart: string | null;
  workHoursEnd: string | null;
}

export function WorkWindowDialog({
  target,
  title,
  onClose,
}: {
  target: WorkWindowTarget | null;
  title: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      isOpen={target !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      purpose="form"
      width={480}
    >
      {target && (
        <WorkWindowForm
          key={target.memberId}
          target={target}
          title={title}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

/** `HH:MM` do banco para o valor controlado do `TimeInput`. */
function toTimeValue(stored: string | null): ISOTimeString | undefined {
  if (!stored) return undefined;
  return createISOTimeString(stored) ?? undefined;
}

/**
 * O `TimeInput` pode devolver `HH:MM:SS`; a janela é gravada em `HH:MM`
 * (design.md — `tenant_members`), e é esse o formato que `validateWorkWindow`
 * aceita.
 */
function toStoredTime(value: ISOTimeString | undefined): string {
  return value ? value.slice(0, 5) : "";
}

function WorkWindowForm({
  target,
  title,
  onClose,
}: {
  target: WorkWindowTarget;
  title: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [days, setDays] = useState<string[]>(
    (target.workDays ?? []).map(String)
  );
  const [start, setStart] = useState(toTimeValue(target.workHoursStart));
  const [end, setEnd] = useState(toTimeValue(target.workHoursEnd));
  const [fieldError, setFieldError] = useState<{
    field: WorkWindowField;
    message: string;
  } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function errorOf(field: WorkWindowField) {
    return fieldError?.field === field
      ? ({ type: "error", message: fieldError.message } as const)
      : undefined;
  }

  async function handleSubmit() {
    setBanner(null);
    setFieldError(null);
    setIsSubmitting(true);

    const result = await saveWorkWindowAction({
      memberId: target.memberId,
      days: days.map(Number),
      start: toStoredTime(start),
      end: toStoredTime(end),
    });

    setIsSubmitting(false);

    if (!result.ok) {
      // AC3/AC4: o campo inválido vem apontado pelo servidor e é destacado
      // nele mesmo. Sem campo (permissão, vínculo inexistente) vira banner.
      if (result.field) {
        setFieldError({ field: result.field, message: result.error });
      } else {
        setBanner(result.error);
      }
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <Layout
      header={<DialogHeader title={title} onOpenChange={onClose} />}
      content={
        <LayoutContent>
          <VStack gap={4}>
            {banner && <Banner status="error" title={banner} />}

            <Text type="body" color="secondary">
              {target.name} · {target.email}
            </Text>

            <FormLayout>
              <CheckboxList
                label="Dias de atendimento"
                description={HELPER}
                value={days}
                onChange={(values) => {
                  setDays(values);
                  setFieldError(null);
                }}
                status={errorOf("workDays")}
              >
                {WEEKDAY_OPTIONS.map((day) => (
                  <CheckboxListItem
                    key={day.value}
                    value={day.value}
                    label={day.label}
                  />
                ))}
              </CheckboxList>

              <FormLayout direction="horizontal">
                <TimeInput
                  label="Horário de início"
                  placeholder="Selecione um horário"
                  hourFormat="24h"
                  value={start}
                  onChange={(value) => {
                    setStart(value);
                    setFieldError(null);
                  }}
                  status={errorOf("workHoursStart")}
                />
                <TimeInput
                  label="Horário de fim"
                  placeholder="Selecione um horário"
                  hourFormat="24h"
                  value={end}
                  onChange={(value) => {
                    setEnd(value);
                    setFieldError(null);
                  }}
                  status={errorOf("workHoursEnd")}
                />
              </FormLayout>
            </FormLayout>
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter>
          <HStack gap={2} hAlign="end">
            <Button label="Cancelar" variant="secondary" onClick={onClose} />
            <Button
              label="Salvar"
              variant="primary"
              isLoading={isSubmitting}
              clickAction={handleSubmit}
            />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}
