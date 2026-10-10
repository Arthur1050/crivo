import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Center } from "@astryxdesign/core/Center";
import { Icon } from "@astryxdesign/core/Icon";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { SVGProps } from "react";
import { textoAlternativoDaFoto } from "../../lib/apresentacao";
import type { Imovel } from "../../db/views";

/** Glifo de foto para o espaço reservado: a lib não traz um e a vitrine não declara pacote de ícones. */
function IconeDeFoto(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m3 17 5-5 4 4 3-3 6 6" />
    </svg>
  );
}

interface Props {
  imovel: Pick<Imovel, "tipo" | "bairro" | "fotos">;
  /** Proporção largura/altura da moldura (a mesma com ou sem foto). */
  proporcao?: number;
}

/**
 * Foto principal do imóvel, direto da URL cadastrada, sem otimizador (AD-043):
 * `loading="lazy"`, `referrerPolicy="no-referrer"` e `alt` com tipo, bairro e
 * posição (VITEM AC8). Sem foto, um espaço reservado com ícone e texto na mesma
 * proporção (VITEM AC6). A astryx não tem primitivo de imagem; o `<img>` fica
 * dentro de `AspectRatio` com `fit="cover"`, sem estilo próprio.
 */
export function FotoDoImovel({ imovel, proporcao = 4 / 3 }: Props) {
  const fotos = imovel.fotos ?? [];
  const principal = fotos[0];

  return (
    <AspectRatio ratio={proporcao} fit={principal ? "cover" : undefined}>
      {principal ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={principal}
          alt={textoAlternativoDaFoto({ tipo: imovel.tipo, bairro: imovel.bairro, posicao: 1, total: fotos.length })}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <Center height="100%">
          <VStack gap={1} hAlign="center">
            <Icon icon={IconeDeFoto} size="lg" color="secondary" />
            <Text type="supporting">Sem foto</Text>
          </VStack>
        </Center>
      )}
    </AspectRatio>
  );
}
