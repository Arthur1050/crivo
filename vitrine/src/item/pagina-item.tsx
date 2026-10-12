import { Button } from "@astryxdesign/core/Button";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Fragment } from "react";
import type { Imovel, Loja } from "../db/views";
import { formatarPreco, rotuloDaModalidade, rotuloDoTipo, textoAlternativoDaFoto } from "../lib/apresentacao";
import { linkWhatsapp, mensagemItem } from "../lib/contato";
import { FotoDoImovel } from "../templates/comum/foto-do-imovel";
import { GaleriaDoImovel } from "./galeria-do-imovel";

interface Props {
  loja: Pick<Loja, "slug" | "nome" | "whatsapp">;
  imovel: Imovel;
}

/** Quebras de linha da descrição preservadas como `<br>`; o texto nunca é interpretado como HTML (VITEM AC7). */
function TextoComQuebras({ texto }: { texto: string }) {
  const linhas = texto.split(/\r\n|\r|\n/);
  return (
    <Text as="p">
      {linhas.map((linha, indice) => (
        <Fragment key={indice}>
          {indice > 0 ? <br /> : null}
          {linha}
        </Fragment>
      ))}
    </Text>
  );
}

/** Um número do imóvel com o rótulo (quartos, banheiros, vagas, área). */
function Atributo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <VStack gap={0.5}>
      <Text type="label" color="secondary">
        {rotulo}
      </Text>
      <Text type="large" weight="bold">
        {valor}
      </Text>
    </VStack>
  );
}

/**
 * Composição do imóvel (VITEM-01, VITEM-02): galeria (ou espaço reservado sem
 * foto), tipo, bairro, referência, preço, atributos, descrição como texto e o
 * botão de interesse com a referência na mensagem do WhatsApp. O cabeçalho e o
 * rodapé legal vêm do layout da loja. Componente de props, montado e provado
 * pela rota do imóvel (T23).
 *
 * Nada aqui usa endereço, captador nem dado de lead: o `Imovel` das views já
 * não os traz (VSEG AC5).
 */
export function PaginaItem({ loja, imovel }: Props) {
  const tipo = rotuloDoTipo(imovel.tipo);
  const modalidade = rotuloDaModalidade(imovel.modalidade);
  const referencia = imovel.referencia.toUpperCase();
  const fotos = imovel.fotos ?? [];
  const whatsapp = linkWhatsapp(loja.whatsapp, mensagemItem(imovel.referencia, loja.nome));
  const descricao = imovel.descricao?.trim() ? imovel.descricao : null;

  return (
    <VStack gap={6}>
      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={6}>
        {fotos.length > 0 ? (
          <GaleriaDoImovel
            fotos={fotos}
            textos={fotos.map((_, indice) =>
              textoAlternativoDaFoto({
                tipo: imovel.tipo,
                bairro: imovel.bairro,
                posicao: indice + 1,
                total: fotos.length,
              })
            )}
          />
        ) : (
          <FotoDoImovel imovel={imovel} />
        )}

        <VStack gap={5}>
          <VStack gap={1}>
            <Text type="label" color="secondary">
              {[referencia, modalidade].filter(Boolean).join(" · ")}
            </Text>
            <Heading level={1}>{`${tipo} em ${imovel.bairro}`}</Heading>
            <Text color="secondary">{`${imovel.cidade}/${imovel.uf}`}</Text>
          </VStack>

          <Text type="display-3" weight="bold">
            {formatarPreco(imovel.precoCentavos)}
          </Text>

          <Grid columns={2} gap={4}>
            <Atributo rotulo="Quartos" valor={String(imovel.quartos)} />
            <Atributo rotulo="Banheiros" valor={String(imovel.banheiros)} />
            <Atributo rotulo="Vagas" valor={String(imovel.vagas)} />
            <Atributo rotulo="Área" valor={`${imovel.areaM2} m²`} />
          </Grid>

          <HStack gap={2} hAlign="start" wrap="wrap">
            {whatsapp ? (
              <Button
                label="Tenho interesse"
                variant="primary"
                size="lg"
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
              />
            ) : null}
            <Button label="Ver todos os imóveis" size="lg" href={`/c/${encodeURIComponent(loja.slug)}`} />
          </HStack>
        </VStack>
      </Grid>

      {descricao ? (
        <VStack as="section" gap={2}>
          <Heading level={2}>Sobre o imóvel</Heading>
          <TextoComQuebras texto={descricao} />
        </VStack>
      ) : null}
    </VStack>
  );
}
