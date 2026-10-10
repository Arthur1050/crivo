import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import type { Imovel } from "../../db/views";
import { formatarPreco, resumoDosAtributos, rotuloDaModalidade, rotuloDoTipo } from "../../lib/apresentacao";
import { referenciaParaUrl } from "../../lib/catalogo";
import type { PropsDoCatalogo } from "../comum/catalogo";
import { FotoDoImovel } from "../comum/foto-do-imovel";
import { ApresentacaoDaLoja, CatalogoVazio, SobreALoja } from "../comum/secoes";

function CartaoDoImovel({ slug, imovel }: { slug: string; imovel: Imovel }) {
  const tipo = rotuloDoTipo(imovel.tipo);
  const modalidade = rotuloDaModalidade(imovel.modalidade);
  const referencia = imovel.referencia.toUpperCase();
  const preco = formatarPreco(imovel.precoCentavos);

  return (
    <ClickableCard
      label={`${tipo} em ${imovel.bairro}, ${referencia}, ${preco}`}
      href={`/c/${slug}/imovel/${referenciaParaUrl(imovel.referencia)}`}
      padding={0}
    >
      <VStack>
        <FotoDoImovel imovel={imovel} />
        <VStack gap={1} padding={3}>
          <Text type="label" color="secondary">
            {[tipo, modalidade, referencia].filter(Boolean).join(" · ")}
          </Text>
          <Text type="large" weight="bold">
            {preco}
          </Text>
          <Text>
            {imovel.bairro}, {imovel.cidade}
          </Text>
          <Text type="supporting">{resumoDosAtributos(imovel)}</Text>
        </VStack>
      </VStack>
    </ClickableCard>
  );
}

/**
 * Catálogo em grade (VTEMA AC4): apresentação, faixa "Destaques" (omitida sem
 * destaque), grade de cards (3 colunas no desktop, 1 no celular), paginação e
 * "Sobre". O cabeçalho e o rodapé legal vêm do layout da loja. Componente puro
 * de props, montado e provado pela página de catálogo (T21).
 */
export function CatalogoGrade({ loja, destaques, imoveis, paginacao }: PropsDoCatalogo) {
  return (
    <VStack gap={8}>
      <ApresentacaoDaLoja loja={loja} />

      {destaques.length > 0 ? (
        <VStack as="section" gap={3}>
          <Heading level={2}>Destaques</Heading>
          <Grid columns={{ minWidth: 280, max: 3 }} gap={4}>
            {destaques.map((imovel) => (
              <CartaoDoImovel key={imovel.referencia} slug={loja.slug} imovel={imovel} />
            ))}
          </Grid>
        </VStack>
      ) : null}

      {imoveis.length > 0 ? (
        <VStack as="section" gap={4}>
          <Heading level={2}>Imóveis disponíveis</Heading>
          <Grid columns={{ minWidth: 280, max: 3 }} gap={4}>
            {imoveis.map((imovel) => (
              <CartaoDoImovel key={imovel.referencia} slug={loja.slug} imovel={imovel} />
            ))}
          </Grid>
          {paginacao}
        </VStack>
      ) : (
        <CatalogoVazio loja={loja} />
      )}

      <SobreALoja loja={loja} />
    </VStack>
  );
}
