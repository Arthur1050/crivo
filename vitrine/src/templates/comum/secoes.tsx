import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { linkWhatsapp, mensagemCatalogo } from "../../lib/contato";
import type { PropsDoCatalogo } from "./catalogo";

type Loja = PropsDoCatalogo["loja"];

export const MENSAGEM_DO_CATALOGO_VAZIO = "Nenhum imóvel disponível no momento.";

/** Catálogo sem imóvel visível: a mensagem e o botão de WhatsApp da loja (VCAT AC7). */
export function CatalogoVazio({ loja }: { loja: Loja }) {
  const whatsapp = linkWhatsapp(loja.whatsapp, mensagemCatalogo(loja.nome));
  return (
    <EmptyState
      headingLevel={2}
      title={MENSAGEM_DO_CATALOGO_VAZIO}
      description="Fale com a imobiliária para saber das novidades."
      actions={
        whatsapp ? (
          <Button
            label="Falar no WhatsApp"
            variant="primary"
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
          />
        ) : undefined
      }
    />
  );
}

/** Cabeçalho do catálogo: nome da loja e, se houver, o título institucional. */
export function ApresentacaoDaLoja({ loja }: { loja: Loja }) {
  return (
    <VStack gap={1}>
      <Heading level={1}>{loja.nome}</Heading>
      {loja.titulo ? (
        <Text type="large" color="secondary">
          {loja.titulo}
        </Text>
      ) : null}
    </VStack>
  );
}

/** "Sobre": só quando a loja escreveu algo. Quebras de linha preservadas como texto (sem HTML). */
export function SobreALoja({ loja }: { loja: Loja }) {
  if (!loja.sobre) return null;
  return (
    <VStack as="section" gap={2}>
      <Heading level={2}>Sobre</Heading>
      <Text as="p" color="secondary">
        {loja.sobre}
      </Text>
    </VStack>
  );
}
