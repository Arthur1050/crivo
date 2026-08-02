"use client";

import { useEffect } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";

/**
 * Error boundary do route group (crm) (design.md — Error Handling Strategy:
 * "Banco indisponível em uma página" → error.tsx no route group, shell
 * permanece, área afetada mostra erro amigável + retry). Client Component é
 * obrigatório para error boundaries no App Router.
 */
export default function CrmError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Center axis="both" height="100%" minHeight={320}>
      <Banner
        status="error"
        title="Não foi possível carregar esta área"
        description="Houve um problema ao buscar os dados. Tente novamente em instantes."
        endContent={
          <Button
            label="Tentar novamente"
            variant="secondary"
            onClick={() => unstable_retry()}
          />
        }
      />
    </Center>
  );
}
