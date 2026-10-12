import { unstable_rethrow } from "next/navigation";
import { ImageResponse } from "next/og";
import { lojaCacheada } from "../../../src/dados/cache";
import { slugValido } from "../../../src/lib/catalogo";
import { registrarErro } from "../../../src/loja/indisponivel";
import { corDoCartao, corDoTextoSobre } from "../../../src/tema/cor";

export const alt = "Vitrine de imóveis da imobiliária";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Cartão de compartilhamento da loja (VOG-01 AC5): PNG de 1200×630 com o nome
 * da loja sobre a cor dela, usado como `og:image` do catálogo e do imóvel sem
 * foto (AD-043). A cor é o hex literal gravado pelo gestor, ou a cor padrão
 * quando não há; não é o accent derivado pela Astryx (AD-046). Sem fonte, foto
 * nem logo remotos: nada é buscado fora do servidor durante a geração.
 *
 * Loja que a vitrine não mostra (slug fora do formato, inexistente, inativa,
 * sem CRECI ou sem WhatsApp) não tem cartão: 404, sem PNG nem marca.
 *
 * O Satori só entende `div` com `style` inline; a regra de "sem `style`" é das
 * páginas, e o cartão não é página nem passa pela Astryx.
 */
export default async function CartaoDaLoja({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slugValido(slug)) return new Response(null, { status: 404 });

  let loja: Awaited<ReturnType<typeof lojaCacheada>>;
  try {
    loja = await lojaCacheada(slug);
  } catch (erro) {
    unstable_rethrow(erro);
    registrarErro("cartao", erro);
    return new Response(null, { status: 503 });
  }
  if (!loja) return new Response(null, { status: 404 });

  const fundo = corDoCartao(loja.cor);
  const texto = corDoTextoSobre(fundo);
  const lugar = [loja.cidade?.trim(), loja.uf?.trim()].filter(Boolean).join("/");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
          background: fundo,
          color: texto,
        }}
      >
        <div style={{ display: "flex", fontSize: 96, fontWeight: 700, textAlign: "center", lineHeight: 1.1 }}>
          {loja.nome}
        </div>
        <div style={{ display: "flex", fontSize: 40, marginTop: 32, opacity: 0.85 }}>
          {lugar ? `Imóveis disponíveis em ${lugar}` : "Imóveis disponíveis"}
        </div>
      </div>
    ),
    { ...size }
  );
}
