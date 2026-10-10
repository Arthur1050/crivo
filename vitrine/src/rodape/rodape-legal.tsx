import { Divider } from "@astryxdesign/core/Divider";
import { Link } from "@astryxdesign/core/Link";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import type { Loja } from "../db/views";
import { linkInstagram, linkTelefone, linkWhatsapp, mensagemCatalogo } from "../lib/contato";

/** Aviso fixo de todo rodapé (VLEGAL AC1). */
export const AVISO_LEGAL = "Preços e disponibilidade sujeitos a alteração sem aviso prévio.";

/** A lib emite este texto de leitor de tela em inglês por padrão (L-010). */
const ABRE_EM_NOVA_ABA = "(abre em nova aba)";

interface Props {
  loja: Pick<Loja, "nome" | "razaoSocial" | "creci" | "endereco" | "telefone" | "instagram" | "whatsapp">;
}

/**
 * Rodapé de toda página de loja, inclusive a de imóvel indisponível (VLEGAL
 * AC1): razão social, CRECI e o aviso fixo sempre; endereço, telefone, Instagram
 * e WhatsApp só quando a loja os tem (AC2). Os links vêm de `lib/contato` (AC3 e
 * AC4). Componente puro de props, montado e provado pelo e2e do layout da loja.
 */
export function RodapeLegal({ loja }: Props) {
  const telefone = loja.telefone ? linkTelefone(loja.telefone) : null;
  const instagram = loja.instagram ? linkInstagram(loja.instagram) : null;
  const whatsapp = linkWhatsapp(loja.whatsapp, mensagemCatalogo(loja.nome));

  return (
    <VStack as="footer" gap={3} paddingBlock={6} paddingInline={4}>
      <Divider />
      <VStack gap={1}>
        <Text type="label">{loja.razaoSocial}</Text>
        <Text type="supporting">CRECI {loja.creci}</Text>
        {loja.endereco ? <Text type="supporting">{loja.endereco}</Text> : null}
      </VStack>
      {telefone || instagram || whatsapp ? (
        <HStack gap={4} wrap="wrap">
          {telefone && loja.telefone ? (
            <Link href={telefone} isStandalone>
              Telefone {loja.telefone}
            </Link>
          ) : null}
          {whatsapp ? (
            <Link href={whatsapp} isStandalone isExternalLink newTabLabel={ABRE_EM_NOVA_ABA}>
              WhatsApp {loja.whatsapp}
            </Link>
          ) : null}
          {instagram && loja.instagram ? (
            <Link href={instagram} isStandalone isExternalLink newTabLabel={ABRE_EM_NOVA_ABA}>
              Instagram @{loja.instagram}
            </Link>
          ) : null}
        </HStack>
      ) : null}
      <Text type="supporting">{AVISO_LEGAL}</Text>
    </VStack>
  );
}
