import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";

// Neutra de propósito (VCAT AC9): sem marca, nome ou cor de nenhuma loja, para
// não confirmar a existência de uma imobiliária por slug.
export default function NotFound() {
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
