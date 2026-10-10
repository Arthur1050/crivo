# Lote 16b — Vitrine pública (projeto `vitrine/`) — Specification

**Context**: `.specs/features/lote-16-vitrine-publica/context.md`
**Design**: `.specs/features/lote-16-vitrine-publica/design.md`
**Depende de**: L16a fechado (tabela, views, papel e aviso de revalidação) — fechado em 2026-10-09 com Verifier PASS; papel, views e colunas existem só nos bancos de teste

## Problem Statement

A imobiliária não tem onde mostrar o catálogo fora da conversa com o agente, e o link que circula em
grupo de WhatsApp é o canal mais barato de captação que ela tem. O CRM não pode servir isso (AD-025:
`cacheComponents` desligado, `proxy.ts` pega-tudo, tráfego anônimo no mesmo processo dos corretores).
Este lote cria a vitrine: um projeto Next separado, somente leitura, que lê só as views do L16a.

## Goals

- [ ] Um visitante abre `/c/<slug>`, vê os imóveis publicados e disponíveis na identidade da
      imobiliária, abre um imóvel e chega ao WhatsApp do agente com a referência na mensagem.
- [ ] Nenhuma página serve imóvel vendido, reservado ou despublicado, nem endereço, captador ou
      dado de lead, provado por HTTP contra a app rodando e pelo papel de banco.
- [ ] Um aviso do CRM faz a página seguinte refletir a mudança; sem aviso, a mudança aparece em até
      5 minutos.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Qualquer formulário, escrita, cookie de sessão ou login | Leitura pura (AD-025) |
| Domínio próprio, sitemap, indexação | `noindex` no início (usuário, 2026-10-09) |
| Filtros de busca na vitrine | Fora do escopo funcional do roadmap |
| Personalizar componentes, blocos arrastáveis, mais de dois layouts | Roadmap: dois templates pré-montados |
| Modo escuro | Agent's discretion (context.md) |
| Projeto na Vercel, variáveis, deploy | L16c |
| Otimização de imagem e upload de foto | L12 item 1, adiado |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| URL do item | `/c/<slug>/imovel/<referência em minúsculas>` | Decisão do usuário (2026-10-09) | y |
| Mensagem do `wa.me` no item | "Olá! Vi o imóvel <REF> na vitrine da <nome> e tenho interesse." | Decisão do usuário (2026-10-09) | y |
| Mensagem do `wa.me` no catálogo | "Olá! Vi a vitrine da <nome> e gostaria de atendimento." | Mesmo padrão, sem referência | n |
| Número do `wa.me` | Dígitos do WhatsApp do agente; com 10 ou 11 dígitos recebe o prefixo `55` | Formato exigido pelo `wa.me` | n |
| SEO | `noindex, nofollow` em toda página e no cabeçalho `X-Robots-Tag`; sem sitemap; sem `Disallow` | Decisão do usuário (2026-10-09) | y |
| Fotos | URL externa direta, `loading="lazy"`, `referrerPolicy="no-referrer"`, sem otimizador | Decisão do usuário (2026-10-09) | y |
| OG do item | Primeira foto; sem foto, o cartão gerado da loja | Decisão do usuário (2026-10-09) | y |
| Layout | Muda só a página de catálogo; a página de item é uma só | Agent's discretion | n |
| Paginação | 24 por página em `?pagina=`; inválida → 1; acima da última → última | Catálogos do piloto cabem em poucas páginas | n |
| Ordem do catálogo | Destaque primeiro, depois `atualizado_em` desc, depois referência asc | Determinística e testável | n |
| Faixa "Destaques" do layout `grade` | Até 6 destaques, na mesma ordem | Faixa de uma ou duas linhas | n |
| Imóvel indisponível com loja ativa | Página de não encontrado com a marca da loja e link para o catálogo | Links antigos circulam no WhatsApp depois da venda | n |
| Status HTTP do "não encontrado" | 200 com a UI de não encontrado e `noindex`; só rota sem correspondência (fora de `/c/<slug>`) sai com 404 | As páginas de loja leem `params` dentro de `<Suspense>` e saem em streaming; a doc instalada diz que resposta em streaming devolve 200 e injeta `noindex` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md:105-113`). Status 404 exigiria checar o banco num `proxy`, que a AD-025 exclui | n |
| Loja inexistente ou inativa | Página de não encontrado neutra, sem marca | Não confirma a existência da imobiliária | n |
| Perfil de cache | `vitrine`: stale 60 s, revalidate 60 s, expire 300 s | Pior caso de 5 min quando o aviso falha (AD-042) | y |
| Cor padrão | Accent do tema neutro da Astryx | Loja sem cor escolhida | n |
| Modalidade `ambos` no imóvel | Não exibida | Não descreve o imóvel | n |

**Open questions:** none — todas resolvidas com o usuário ou registradas acima.

---

## User Stories

### P1: Projeto separado ⭐ MVP

**User Story**: Como responsável pelo produto, quero a vitrine num projeto Next próprio, para que o
tráfego anônimo nunca passe pelo CRM.

**Why P1**: AD-025.

**Acceptance Criteria**:

1. The system SHALL ter a vitrine em `vitrine/`, com `package.json`, `next.config.ts`, `tsconfig.json` e lint próprios.
2. The system SHALL habilitar `cacheComponents` no `next.config.ts` da vitrine.
3. The system SHALL NOT ter `proxy.ts` nem `middleware.ts` na vitrine.
4. The system SHALL NOT importar, em nenhum arquivo de `vitrine/`, caminho fora de `vitrine/`.
5. The system SHALL excluir `vitrine/` do `tsconfig.json` e do lint da raiz.
6. The system SHALL conectar ao banco só por `VITRINE_DATABASE_URL`.
7. The system SHALL espelhar em `vitrine/src/contrato.ts` o formato da tag, os layouts, as fontes, o payload da revalidação e as colunas das views.
8. WHEN a suíte do CRM rodar THEN um teste de paridade SHALL falhar se o contrato da vitrine divergir de `src/lib/storefront-contract.ts` ou se as colunas declaradas da vitrine divergirem das colunas reais das views no banco.

**Independent Test**: `npm --prefix vitrine run build` passa; `grep` não acha import para fora;
o teste de paridade quebra quando uma coluna é renomeada só de um lado.

---

### P1: Página de catálogo ⭐ MVP

**User Story**: Como visitante, quero ver os imóveis disponíveis da imobiliária numa página só.

**Why P1**: Item 1 do escopo funcional.

**Acceptance Criteria**:

1. WHEN `/c/<slug>` for pedido para uma loja presente em `vitrine.lojas` THEN o sistema SHALL responder 200 com nome, título, sobre e os imóveis de `vitrine.imoveis` daquela loja.
2. The system SHALL ordenar os imóveis por destaque primeiro, depois `atualizado_em` decrescente, depois referência crescente.
3. The system SHALL mostrar 24 imóveis por página, selecionada por `?pagina=<n>`.
4. IF `pagina` não for inteiro maior que zero THEN o sistema SHALL mostrar a página 1.
5. IF `pagina` for maior que a última página THEN o sistema SHALL mostrar a última página.
6. The system SHALL mostrar por imóvel: foto principal, tipo, bairro, cidade, preço em reais, quartos, banheiros, vagas e área, com link para a página do item.
7. WHEN a loja não tiver nenhum imóvel visível THEN o sistema SHALL mostrar o estado vazio "Nenhum imóvel disponível no momento." com o botão de WhatsApp da loja, e SHALL responder 200.
8. IF o slug não casar com `^[a-z0-9-]{1,63}$` THEN o sistema SHALL mostrar a página de não encontrado neutra sem consultar o banco.
9. IF o slug não estiver em `vitrine.lojas` THEN o sistema SHALL mostrar a página de não encontrado neutra, sem nome nem cor de nenhuma loja.
10. The system SHALL marcar toda página de não encontrado com `noindex` e SHALL NOT incluir nela dado de nenhum imóvel.
11. The system SHALL formatar o preço como moeda brasileira sem centavos (`R$ 520.000`).
12. The system SHALL mostrar o botão de WhatsApp da loja no cabeçalho, com a mensagem de catálogo.

**Independent Test**: abrir a loja da fixture e conferir ordem, paginação e campos; abrir loja
inativa e slug inválido e receber a página de não encontrado neutra.

---

### P1: Página de imóvel ⭐ MVP

**User Story**: Como visitante, quero ver um imóvel e falar com a imobiliária sobre ele.

**Why P1**: É a página que circula no WhatsApp.

**Acceptance Criteria**:

1. WHEN `/c/<slug>/imovel/<ref>` for pedido para um imóvel presente em `vitrine.imoveis` daquela loja THEN o sistema SHALL responder 200 com fotos, tipo, modalidade, bairro, cidade, UF, referência, preço, quartos, banheiros, vagas, área e descrição.
2. The system SHALL aceitar a referência em minúsculas ou maiúsculas na URL e SHALL usar minúsculas nos links que gera.
3. The system SHALL mostrar o botão de interesse com link `https://wa.me/<dígitos>?text=<mensagem>`, onde a mensagem cita a referência em maiúsculas e o nome da loja.
4. IF o WhatsApp do agente tiver 10 ou 11 dígitos THEN o link SHALL usar o prefixo `55`.
5. IF a referência não existir em `vitrine.imoveis` para aquela loja THEN o sistema SHALL mostrar a página de não encontrado com a marca da loja, a mensagem "Este imóvel não está mais disponível." e o link para o catálogo.
6. IF o imóvel não tiver foto THEN o sistema SHALL mostrar um espaço reservado com ícone e texto alternativo, mantendo a proporção.
7. The system SHALL renderizar a descrição como texto, preservando quebras de linha, e SHALL NOT interpretar HTML contido nela.
8. The system SHALL exibir as fotos como `<img>` com a URL cadastrada, `loading="lazy"`, `referrerPolicy="no-referrer"` e `alt` com tipo, bairro e posição da foto.

**Independent Test**: abrir um imóvel visível, conferir o link do WhatsApp decodificado; abrir um
vendido e ver a página de não encontrado com a marca da loja.

---

### P1: Leitura pura e isolamento ⭐ MVP

**User Story**: Como responsável pelo produto, quero que a vitrine nunca exponha o que não é público.

**Why P1**: É a razão da AD-025 e da AD-040.

**Acceptance Criteria**:

1. The system SHALL ler dados só de `vitrine.lojas` e `vitrine.imoveis`.
2. The system SHALL filtrar toda consulta de imóvel pelo slug da loja pedida.
3. WHEN a loja A for pedida THEN nenhuma página SHALL conter referência, preço ou texto de imóvel da loja B.
4. The system SHALL NOT servir imóvel com status `vendido` ou `reservado`, nem imóvel despublicado, em nenhuma página, inclusive pela URL direta do item.
5. The system SHALL NOT incluir no HTML, nos metadados, na imagem OG nem no log do servidor: logradouro, número, complemento, nome, e-mail ou telefone do captador, nem nome ou telefone de lead.
6. The system SHALL NOT ter rota que aceite escrita além de `POST /api/revalidar`.
7. The system SHALL NOT definir cookie em nenhuma resposta.
8. WHEN as consultas da vitrine rodarem como `crivo_vitrine` contra o banco de teste THEN o isolamento por slug e o corte de visibilidade SHALL valer com linhas de outra loja na fixture.

**Independent Test**: rodar `npm run vitrine:e2e` com a fixture de sentinelas e ver todas as
asserções passarem.

---

### P1: Identidade da loja ⭐ MVP

**User Story**: Como gestor, quero a vitrine com a cor, a fonte e o layout que escolhi.

**Why P1**: Item 3 do escopo funcional.

**Acceptance Criteria**:

1. The system SHALL envolver as páginas da loja num `<Theme mode="light">` gerado por `defineTheme` a partir do tema neutro, com a cor da loja como `color.accent`.
2. WHERE a loja não tiver cor THEN o sistema SHALL usar a cor padrão da vitrine.
3. The system SHALL aplicar a fonte da loja ao corpo e aos títulos, entre `inter`, `montserrat`, `lora` e `playfair`.
4. WHERE o layout for `grade`, o catálogo SHALL mostrar cabeçalho, a faixa "Destaques" com até 6 destaques, a grade de cards, a paginação, "Sobre" e o rodapé.
5. WHERE o layout for `editorial`, o catálogo SHALL mostrar o cabeçalho com a foto do primeiro destaque, a lista de linhas edge-to-edge, a paginação, "Sobre" e o rodapé.
6. WHERE a loja não tiver nenhum destaque, o layout `grade` SHALL omitir a faixa "Destaques" e o layout `editorial` SHALL omitir a foto do cabeçalho.
7. The system SHALL entregar a cor da loja no HTML da primeira resposta, sem depender de JavaScript.
8. The system SHALL compor as páginas só com componentes e tokens da Astryx, com a única exceção do `<img>` dentro de `AspectRatio`, sem `style` inline.
9. The system SHALL ser utilizável em 375 px de largura, sem rolagem horizontal.

**Independent Test**: capturas reais dos dois layouts, desktop e celular, com duas lojas de cores e
fontes diferentes; HTML sem JS contém a cor.

---

### P1: Rodapé legal e contato ⭐ MVP

**User Story**: Como imobiliária, quero o CRECI e meus contatos em toda página.

**Why P1**: CRECI é obrigatório em anúncio imobiliário.

**Acceptance Criteria**:

1. The system SHALL mostrar em toda página de loja, inclusive na página de não encontrado da loja: razão social, CRECI e o aviso "Preços e disponibilidade sujeitos a alteração sem aviso prévio."
2. WHERE a loja tiver endereço, telefone ou Instagram, o rodapé SHALL mostrá-los.
3. The system SHALL montar o link do Instagram como `https://instagram.com/<handle>`.
4. The system SHALL montar o link do telefone como `tel:+<dígitos>`, com o prefixo `55` quando houver 10 ou 11 dígitos.

**Independent Test**: conferir o rodapé no catálogo, no item e na página de não encontrado da loja; loja sem Instagram
não mostra o link.

---

### P1: Compartilhamento ⭐ MVP

**User Story**: Como corretor, quero que o link colado no WhatsApp mostre título e imagem.

**Why P1**: Item 5 do escopo funcional; a página nasce para circular em grupo.

**Acceptance Criteria**:

1. The system SHALL definir `og:title`, `og:description`, `og:image`, `og:url` e `twitter:card` em toda página de loja, com URLs absolutas a partir de `VITRINE_PUBLIC_URL`.
2. The system SHALL usar no catálogo o título "<nome> — imóveis" e a descrição igual ao título institucional da loja ou, sem ele, "Imóveis disponíveis em <cidade>/<uf>".
3. The system SHALL usar no item o título "<Tipo> em <bairro> — <REF>" e a descrição "<quartos> quartos · <área> m² · <preço>".
4. WHERE o imóvel tiver foto, `og:image` SHALL ser a primeira foto; caso contrário SHALL ser a imagem gerada da loja.
5. WHEN a imagem gerada da loja for pedida THEN o sistema SHALL responder um PNG de 1200×630 com o nome da loja sobre a cor da loja, sem buscar recurso externo.
6. WHEN a página for pedida com o user-agent do WhatsApp THEN os metadados OG SHALL estar no `<head>` da resposta.

**Independent Test**: `curl` com o user-agent do WhatsApp nas duas páginas e conferir as tags; abrir
a imagem gerada.

---

### P1: Cache e revalidação ⭐ MVP

**User Story**: Como gestor, quero que a vitrine reflita o CRM sem eu fazer nada.

**Why P1**: Frescor quase real (AD-025, AD-042).

**Acceptance Criteria**:

1. The system SHALL cachear toda leitura de uma loja com `use cache`, o perfil `vitrine` e a tag `tenant:<slug>:catalogo`.
2. The system SHALL definir o perfil `vitrine` com `stale` 60, `revalidate` 60 e `expire` 300 segundos.
3. WHEN `POST /api/revalidar` receber `Authorization: Bearer <segredo>` igual a `VITRINE_REVALIDATE_SECRET` e corpo `{"slug": "<slug válido>"}` THEN o sistema SHALL chamar `revalidateTag("tenant:<slug>:catalogo", { expire: 0 })` e responder 204.
4. IF o segredo estiver ausente, diferente ou se `VITRINE_REVALIDATE_SECRET` estiver vazio na vitrine THEN o sistema SHALL responder 401 e SHALL NOT revalidar nada.
5. IF o corpo não for JSON, não tiver `slug` ou o slug não casar com `^[a-z0-9-]{1,63}$` THEN o sistema SHALL responder 400 e SHALL NOT revalidar nada.
6. WHEN a rota receber método diferente de POST THEN o sistema SHALL responder 405.
7. The system SHALL comparar o segredo em tempo constante.
8. WHEN a loja A for revalidada THEN a próxima página da loja A SHALL refletir o banco, e a página da loja B SHALL continuar servida do cache.
9. WHEN o banco mudar sem aviso THEN a página SHALL continuar servida do cache até o perfil expirar.
10. The system SHALL registrar cada revalidação com o prefixo `[vitrine]`, o slug e o desfecho, e SHALL NOT registrar o segredo nem o cabeçalho recebido.

**Independent Test**: no e2e, mudar um imóvel no banco, ver a página antiga; chamar a rota com o
segredo e ver a nova; conferir que a loja B não foi reconsultada.

---

### P2: SEO desligado

**User Story**: Como responsável pelo produto, quero a vitrine fora dos buscadores por enquanto.

**Why P2**: Decisão do usuário; não bloqueia o uso.

**Acceptance Criteria**:

1. The system SHALL emitir `<meta name="robots" content="noindex, nofollow">` em toda página.
2. The system SHALL responder com o cabeçalho `X-Robots-Tag: noindex, nofollow` em toda rota.
3. The system SHALL NOT publicar sitemap nem `Disallow` em `robots.txt`.

**Independent Test**: `curl -I` e conferir o cabeçalho; HTML com a meta.

---

## Edge Cases

- WHEN a loja tiver exatamente 24 imóveis THEN o sistema SHALL mostrar uma página só e SHALL NOT mostrar paginação.
- WHEN a loja tiver 25 imóveis THEN a página 2 SHALL ter exatamente 1 imóvel.
- IF uma URL de foto estiver quebrada THEN o card SHALL manter a proporção e o texto alternativo.
- WHEN a descrição contiver `<script>` THEN a página SHALL mostrar o texto literal escapado.
- WHEN a referência tiver hífen e dígitos (`ap-0142`) THEN a busca SHALL casar com `AP-0142`.
- IF o banco estiver indisponível THEN o sistema SHALL mostrar "Vitrine temporariamente indisponível." sem detalhe técnico e SHALL registrar o erro sem dado de linha.
- WHEN a loja for desativada no CRM e o aviso chegar THEN a próxima visita a `/c/<slug>` SHALL mostrar a página de não encontrado neutra.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| VPROJ-01 | P1: Projeto separado — AC1–AC6 | Tasks | In Tasks |
| VPROJ-02 | P1: Projeto separado — AC7, AC8 | Tasks | In Tasks |
| VCAT-01 | P1: Página de catálogo — AC1, AC6, AC7, AC11, AC12 | Tasks | In Tasks |
| VCAT-02 | P1: Página de catálogo — AC2–AC5 e Edge Cases de 24/25 | Tasks | In Tasks |
| VCAT-03 | P1: Página de catálogo — AC8–AC10 | Tasks | In Tasks |
| VITEM-01 | P1: Página de imóvel — AC1, AC2, AC6–AC8 e Edge Cases de referência e `<script>` | Tasks | In Tasks |
| VITEM-02 | P1: Página de imóvel — AC3–AC5 | Tasks | In Tasks |
| VSEG-01 | P1: Leitura pura e isolamento — AC1–AC4, AC8 | Tasks | In Tasks |
| VSEG-02 | P1: Leitura pura e isolamento — AC5–AC7 e Edge Case de banco indisponível | Tasks | In Tasks |
| VTEMA-01 | P1: Identidade da loja — AC1–AC3, AC7 | Tasks | In Tasks |
| VTEMA-02 | P1: Identidade da loja — AC4–AC6, AC8, AC9 | Tasks | In Tasks |
| VLEGAL-01 | P1: Rodapé legal e contato — AC1–AC4 | Tasks | In Tasks |
| VOG-01 | P1: Compartilhamento — AC1–AC6 | Tasks | In Tasks |
| VCACHE-01 | P1: Cache e revalidação — AC1, AC2, AC8, AC9 e Edge Case de desativação | Tasks | In Tasks |
| VCACHE-02 | P1: Cache e revalidação — AC3–AC7, AC10 | Tasks | In Tasks |
| VSEO-01 | P2: SEO desligado — AC1–AC3 | Tasks | In Tasks |

**Coverage:** 16 total, 16 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] `npm run vitrine:e2e` passa com a fixture de sentinelas: nenhum PII, nenhum vendido, nenhuma
      linha de outra loja, revalidação derrubando só a loja certa.
- [ ] Capturas reais dos dois layouts, desktop e celular, com duas lojas de tema diferente, e das
      páginas de item, de imóvel indisponível e de catálogo vazio.
- [ ] `npm --prefix vitrine run build` passa com banco vazio.
