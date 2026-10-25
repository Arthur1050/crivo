import { StoreIcon } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import { Heading, Text } from "@astryxdesign/core/Text";

/**
 * Card "Vitrine" de Configurações enquanto a vitrine está pausada (AD-050):
 * a opção aparece, desabilitada e marcada "Em breve". O formulário completo
 * (`StorefrontForm`, lote-16a — VUI-01) continua no código para quando a
 * vitrine voltar a ser oferecida.
 */
export function StorefrontComingSoon() {
  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={1}>
          <HStack gap={2} vAlign="center">
            <StoreIcon size={20} />
            <Heading level={3}>Vitrine</Heading>
            <Badge label="Em breve" />
          </HStack>
          <Text type="supporting" color="secondary">
            Página pública com o catálogo de imóveis disponíveis da imobiliária.
          </Text>
        </VStack>
        <Divider />
        <Switch
          label="Vitrine publicada"
          description="Em breve você poderá publicar o catálogo da imobiliária."
          value={false}
          isDisabled
          disabledMessage="Em breve"
        />
      </VStack>
    </Card>
  );
}
