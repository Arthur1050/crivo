"use client";

import { Center } from "@astryxdesign/core/Center";
import { Icon } from "@astryxdesign/core/Icon";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { SVGProps } from "react";

/** Glifo de foto: a lib não traz um e a vitrine não declara pacote de ícones. */
function IconeDeFoto(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m3 17 5-5 4 4 3-3 6 6" />
    </svg>
  );
}

/**
 * Espaço reservado do imóvel sem foto (VITEM AC6), dentro da moldura de
 * `FotoDoImovel`. É componente de cliente porque `Icon` recebe o glifo como
 * função, e função não atravessa a fronteira servidor → cliente.
 */
export function EspacoSemFoto() {
  return (
    <Center height="100%">
      <VStack gap={1} hAlign="center">
        <Icon icon={IconeDeFoto} size="lg" color="secondary" />
        <Text type="supporting">Sem foto</Text>
      </VStack>
    </Center>
  );
}
