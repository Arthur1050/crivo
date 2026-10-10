import { Grid } from "@astryxdesign/core/Grid";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import type { Imovel } from "../../db/views";
import { formatarPreco, resumoDosAtributos, rotuloDaModalidade, rotuloDoTipo } from "../../lib/apresentacao";
import { referenciaParaUrl } from "../../lib/catalogo";
import type { PropsDoCatalogo } from "../comum/catalogo";
import { FotoDoImovel } from "../comum/foto-do-imovel";
import { ApresentacaoDaLoja, CatalogoVazio, SobreALoja } from "../comum/secoes";

function enderecoDoImovel(slug: string, imovel: Imovel): string {
  return `/c/${slug}/imovel/${referenciaParaUrl(imovel.referencia)}`;
}

function LinhaDoImovel({ slug, imovel }: { slug: string; imovel: Imovel }) {
  const tipo = rotuloDoTipo(imovel.tipo);
  const modalidade = rotuloDaModalidade(imovel.modalidade);

  return (
    <ListItem
      label={`${tipo} em ${imovel.bairro}`}
      href={enderecoDoImovel(slug, imovel)}
      startContent={
        <VStack width={112}>
          <FotoDoImovel imovel={imovel} />
        </VStack>
      }
      description={
        <VStack gap={0.5}>
          <Text weight="bold">{formatarPreco(imovel.precoCentavos)}</Text>
          <Text type="supporting">
            {[modalidade, imovel.referencia.toUpperCase(), `${imovel.bairro}, ${imovel.cidade}`]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          <Text type="supporting">{resumoDosAtributos(imovel)}</Text>
        </VStack>
      }
      endContent={imovel.destaque ? <Token label="Destaque" size="sm" /> : undefined}
    />
  );
}

/**
 * Catálogo editorial (VTEMA AC5): cabeçalho com a foto do primeiro destaque
 * (omitida sem destaque), lista de linhas de ponta a ponta (foto à esquerda,
 * dados à direita), paginação e "Sobre". O cabeçalho e o rodapé legal da loja
 * vêm do layout. Mesmas props do template em grade; montado e provado pela
 * página de catálogo (T21).
 */
export function CatalogoEditorial({ loja, destaques, imoveis, paginacao }: PropsDoCatalogo) {
  const primeiro = destaques[0];

  return (
    <VStack gap={8}>
      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={6} align="center">
        <ApresentacaoDaLoja loja={loja} />
        {primeiro ? (
          <VStack gap={2}>
            <FotoDoImovel imovel={primeiro} proporcao={16 / 9} />
            <Link href={enderecoDoImovel(loja.slug, primeiro)} isStandalone>
              {`${rotuloDoTipo(primeiro.tipo)} em ${primeiro.bairro} · ${formatarPreco(primeiro.precoCentavos)}`}
            </Link>
          </VStack>
        ) : null}
      </Grid>

      {imoveis.length > 0 ? (
        <VStack as="section" gap={4}>
          <Heading level={2}>Imóveis disponíveis</Heading>
          <List hasDividers>
            {imoveis.map((imovel) => (
              <LinhaDoImovel key={imovel.referencia} slug={loja.slug} imovel={imovel} />
            ))}
          </List>
          {paginacao}
        </VStack>
      ) : (
        <CatalogoVazio loja={loja} />
      )}

      <SobreALoja loja={loja} />
    </VStack>
  );
}
