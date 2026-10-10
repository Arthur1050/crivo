import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Button } from "@astryxdesign/core/Button";
import { Center } from "@astryxdesign/core/Center";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Spinner } from "@astryxdesign/core/Spinner";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { lojaCacheada } from "../../../src/dados/cache";
import { linkWhatsapp, mensagemCatalogo } from "../../../src/lib/contato";
import { slugValido } from "../../../src/lib/catalogo";
import { RodapeLegal } from "../../../src/rodape/rodape-legal";
import { TemaDaLoja } from "../../../src/tema/tema-da-loja-provider";

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

/**
 * Layout de toda página de uma loja (lote-16b — VCAT-01, VCAT-03, VTEMA-01,
 * VLEGAL-01): tema da loja (AD-046), cabeçalho com logo, nome e WhatsApp, e o
 * rodapé legal.
 *
 * Com `cacheComponents`, `params` só pode ser lido dentro de `<Suspense>`; por
 * isso a resposta sai em streaming e o "não encontrado" de loja sai com HTTP 200
 * e `noindex` (assumption da spec, F8; doc `loading.md`). Slug fora do formato
 * não consulta o banco; slug sem loja visível (inexistente, inativa, sem
 * CRECI/WhatsApp) cai na página neutra de `app/not-found.tsx`, sem marca.
 */
export default function LojaLayout({ children, params }: Props) {
  return (
    <Suspense
      fallback={
        <Center height="100vh">
          <Spinner label="Carregando a vitrine" />
        </Center>
      }
    >
      <LojaComTema params={params}>{children}</LojaComTema>
    </Suspense>
  );
}

async function LojaComTema({ children, params }: Props) {
  const { slug } = await params;
  if (!slugValido(slug)) notFound();
  const loja = await lojaCacheada(slug);
  if (!loja) notFound();

  const whatsapp = linkWhatsapp(loja.whatsapp, mensagemCatalogo(loja.nome));

  return (
    <TemaDaLoja slug={loja.slug} cor={loja.cor} fonte={loja.fonte}>
      <Layout
        height="auto"
        header={
          <LayoutHeader hasDivider label={`Cabeçalho de ${loja.nome}`}>
            <HStack gap={3} hAlign="between" vAlign="center" paddingInline={4} paddingBlock={3}>
              <HStack gap={3} vAlign="center">
                {loja.logo ? (
                  <VStack width={40}>
                    <AspectRatio ratio={1} fit="contain">
                      {/* Sem otimizador de imagem (AD-043): a URL cadastrada vai direto ao navegador. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={loja.logo} alt={`Logo de ${loja.nome}`} referrerPolicy="no-referrer" />
                    </AspectRatio>
                  </VStack>
                ) : null}
                <Link href={`/c/${loja.slug}`} isStandalone>
                  {loja.nome}
                </Link>
              </HStack>
              {whatsapp ? (
                <Button
                  label="Falar no WhatsApp"
                  variant="primary"
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ) : null}
            </HStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={4} isScrollable={false}>
            {children}
          </LayoutContent>
        }
        footer={<RodapeLegal loja={loja} />}
      />
    </TemaDaLoja>
  );
}
