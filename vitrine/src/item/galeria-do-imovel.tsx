"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Carousel } from "@astryxdesign/core/Carousel";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { useLightbox } from "@astryxdesign/core/Lightbox";

interface Props {
  /** URLs cadastradas, na ordem do cadastro; ao menos uma (sem foto a página usa o espaço reservado). */
  fotos: readonly string[];
  /** `alt` de cada foto (tipo, bairro e posição), na mesma ordem de `fotos` (VITEM AC8). */
  textos: readonly string[];
}

/**
 * Galeria do imóvel (VITEM-01): carrossel com uma foto por vez e visualizador
 * em tela cheia ao clicar. É componente de cliente porque o visualizador guarda
 * estado; recebe só texto, nunca função, pela fronteira servidor → cliente.
 *
 * A foto vai direto da URL cadastrada, sem otimizador (AD-043): `loading="lazy"`
 * e `referrerPolicy="no-referrer"`. A Astryx não tem primitivo de imagem, então
 * o `<img>` fica dentro de `AspectRatio` com `fit="cover"`, sem estilo próprio.
 */
export function GaleriaDoImovel({ fotos, textos }: Props) {
  const lightbox = useLightbox({
    media: fotos.map((src, indice) => ({ src, alt: textos[indice] ?? "" })),
  });

  return (
    <>
      <Carousel hasSnap hasEdgeFade={false} gap={2} aria-label="Fotos do imóvel">
        {fotos.map((src, indice) => (
          <ClickableCard
            key={indice}
            label={`Ampliar a foto ${indice + 1} de ${fotos.length}`}
            onClick={() => lightbox.open(indice)}
            padding={0}
            width="100%"
          >
            <AspectRatio ratio={4 / 3} fit="cover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={textos[indice] ?? ""} loading="lazy" referrerPolicy="no-referrer" />
            </AspectRatio>
          </ClickableCard>
        ))}
      </Carousel>
      {lightbox.element}
    </>
  );
}
