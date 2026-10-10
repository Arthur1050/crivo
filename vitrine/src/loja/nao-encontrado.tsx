import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Button } from "@astryxdesign/core/Button";

/**
 * Página de não encontrado neutra (VCAT AC9): sem marca, nome ou cor de
 * nenhuma loja, para não confirmar a existência de uma imobiliária por slug.
 */
export function NaoEncontradoNeutro() {
  return (
    <Center height="100vh">
      <EmptyState
        headingLevel={1}
        title="Página não encontrada"
        description="O endereço que você abriu não existe ou não está mais disponível."
      />
    </Center>
  );
}

/**
 * Imóvel que deixou de estar visível (VITEM AC5). Renderizado dentro do layout
 * da loja, então herda o tema, o cabeçalho e o rodapé legal. Links antigos
 * circulam no WhatsApp depois da venda, daí o caminho de volta ao catálogo.
 */
export function ImovelIndisponivel({ slug }: { slug: string }) {
  return (
    <EmptyState
      headingLevel={1}
      title="Este imóvel não está mais disponível."
      description="Veja os outros imóveis da vitrine."
      actions={<Button label="Ver todos os imóveis" variant="primary" href={`/c/${encodeURIComponent(slug)}`} />}
    />
  );
}
