import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { textoAlternativoDaFoto } from "../../lib/apresentacao";
import type { Imovel } from "../../db/views";
import { EspacoSemFoto } from "./espaco-sem-foto";

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
        <EspacoSemFoto />
      )}
    </AspectRatio>
  );
}
