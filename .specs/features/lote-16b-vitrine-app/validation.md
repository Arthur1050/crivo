# Lote 16b — Vitrine pública — Validation

Registro de execução. O relatório do Verifier entra aqui no fechamento (janela C).

## Gate T0 — viabilidade (F8–F13, F19)

**Data**: 2026-10-10. **Veredito**: F8, F9, F11 (build), F12, F13 e F19 passam; **F10 reprovou** e foi resolvido pela AD-046 (opção b), decidida em 2026-10-10 por um agente Opus 5.5 por delegação do usuário. A janela A parou na T0 até a decisão e retomou na T1.

**Como foi medido**: protótipo descartável em `scratch/vitrine-prova/` (fora do git): Next 16.2.11, React 19.2.4, Astryx 0.2.0, `drizzle-orm` 0.45.4 e `pg` 8.23.1 instalados na pasta do protótipo, com `package-lock.json` próprio, `cacheComponents`, perfil `vitrine` 60/60/300, rota `[slug]` sem `generateStaticParams`, `params` em `<Suspense>`, tema por loja, `opengraph-image`, `POST /api/revalidar`, e um contador de execuções das consultas. Lido da branch `test` como `krivo_vitrine`, com duas lojas de fixture (cor e fonte diferentes), removidas ao fim. `next build` + `next start` reais; asserções por HTTP (`fetch`, sem JS). Nenhuma credencial ou URL foi registrada; o log do servidor não contém segredo nem URL de conexão.

| Fato | Resultado | Evidência |
| --- | --- | --- |
| F8 build com banco vazio | **PASSA** | `next build` sai 0 sem fixture na branch e também com `VITRINE_DATABASE_URL` inalcançável: o build não consulta o banco. Rotas: `◐ /c/[slug]`, `ƒ /api/revalidar`, `ƒ /c/-/opengraph-image` |
| F8 segundo GET sem consulta | **PASSA** | Contador de execuções (loja, imóveis) `0/0 → 1/1` no 1º GET e `1/1` no 2º |
| F8 revalidação com `{ expire: 0 }` | **PASSA** | Preço alterado no banco: GET sem aviso continua `10000000`; POST com segredo errado → 401 e página igual; POST certo → 204 e o GET seguinte mostra `111111100`; contador `3/3`; a loja B, pedida depois, não foi reconsultada (`3/3`) |
| F8 status do `notFound()` em `<Suspense>` | **200, como a doc** | Slug inexistente e slug inválido: HTTP 200, UI neutra, `<meta name="robots" content="noindex">` e `X-Robots-Tag`. Só rota fora de `/c` devolve 404 |
| F9 `og:title` no `<head>` | **PASSA** | UA `WhatsApp/2.23.20.0`, `facebookexternalhit/1.1` e os dois juntos: `og:title` antes de `</head>`. UA de navegador: a tag vem no corpo (metadados em streaming), como a doc descreve |
| F10 cor da loja no HTML sem JS | **FALHA** | HTML da loja A: 0 tags `<style>`, nenhuma ocorrência de `--color-accent`, só `data-astryx-theme="loja-<slug>"`. O hex aparece apenas como prop serializada no payload RSC (`"cor":"#d4145a"`). A Astryx injeta os tokens num `<style>` em `useInsertionEffect`, que não roda no servidor (`dist/Theme/Theme.js`, `useThemeStyleInjection`); a fonte da loja cai na mesma regra |
| F11 4 fontes no build | **PASSA no build** | `next build` emite 23 arquivos de fonte e as 4 famílias (Inter, Montserrat, Lora, Playfair) no CSS. A composição com o tema depende do F10 (ver achados) e a captura não foi feita |
| F12 `opengraph-image` | **PASSA** | GET na URL do `og:image` → 200, `image/png`, assinatura PNG, 1200×630, 26.591 bytes, sob `cacheComponents` |
| F13 (i) teste dentro do protótipo | **PASSA** | `npx vitest run` da raiz, 1 teste: lê a loja como `krivo_vitrine` com o `drizzle-orm` e o `pg` locais |
| F13 (ii) teste da suíte raiz fora do protótipo | **PASSA** | Teste em `src/db/__tests__/` importando `criarDb` e a consulta do protótipo: `drizzle-orm` e `pg` resolvidos em `vitrine-prova/node_modules`, `current_user = krivo_vitrine`, loja lida. 2 testes. O arquivo temporário foi removido da suíte |
| F19 raiz do Turbopack | **Definido** | Sem `turbopack.root`: o Next escolhe a raiz do repositório (`package-lock.json` externo) e avisa "multiple lockfiles"; o build passa. Com `turbopack.root` na pasta do protótipo: sem aviso, build passa e o app roda. A config da T1 fixa `turbopack.root` na pasta `vitrine/` |

### Decisão do F10 (AD-046, opção b)

**Opção escolhida**: emitir no servidor, dentro do `<Theme>`, o CSS que a própria Astryx gera (`generateThemeCSS`: `prose` em `@layer reset` e `component` em `@layer astryx-theme`, como `<style>` simples). `<Theme>` e `defineTheme` continuam em runtime; o accent é o derivado pela lib. A paleta fixa pré-compilada (opção a) foi descartada: desfaria o campo de cor livre do L16a (`accent_color` aparece em 16 arquivos) e não entregaria "a cor da loja".

**Medições do agente decisor**, por `next build` + `next start` no protótipo (fixture A `#d4145a` / Lora, B `#12a150` / Playfair; removida ao fim):

| Modo | HTML sem JS |
| --- | --- |
| Runtime puro | 0 `<style>`, sem `--color-accent` |
| Só `component`, inline | 1 `<style>` de 17.145 bytes; `@scope ([data-astryx-theme="loja-prova-f8-a"])` literal, sem escape |
| `prose` + `component`, inline (escolhido) | 2 `<style>` (1.556 + 17.145 bytes); accent A `light-dark(#C1004C, #FFB1BD)`, B `light-dark(#007028, #63DE87)`; `:where(h1…h6)` presente |
| `href` + `precedence` (hoisting do React 19) | **descartado**: o React emite `<style media="not all" data-precedence…>`, inativo até o runtime inline do React agir (depende de JS) |

No Chrome, depois da hidratação: o runtime injeta 2 tags no `<head>` com conteúdo idêntico ao do servidor; nenhuma mensagem de console; wrapper hidratado; `color-scheme: light`; o `h1` usa a família da loja. `generateThemeCSS` custa 0,51 ms por tema (média de 200). A ordem de camadas independe da posição do `<style>` (o CSS declara `@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;` antes de qualquer import).

**Fonte do mecanismo**: `generateThemeCSS` é o gerador único do runtime e do `astryx theme build` (`@astryxdesign/cli/api/theme/build/build.mjs:837-840`); as camadas são as de `dist/Theme/Theme.js:123-139`.

**Limitações aceitas (AD-046)**: o accent é derivado (tom HCT 40): cinzas `#1a1a1a`, `#333`, `#555` e `#808080` viram verde `#006F3F`; preto `#000000` vira rosa `#A23760`; dourado `#d4af37` vira `#755B00`; laranja `#ff6600` vira `#B62600`. A amostra do CRM mostra o hex digitado. ~18,7 KB de CSS inline por página, duplicado no cliente. O React 19.2 revela o Suspense por `requestAnimationFrame`: em aba oculta o conteúdo fica no fallback; capturas com a aba visível, e2e por HTTP não é afetado.

**Reversão**: versão da Astryx que emita o tema no servidor por API pública; alarme da T10 quebrando sem como reproduzir a saída do runtime; erro de hidratação ou diferença de cascata medida; loja do piloto com cor sem croma reclamando (então só a política do accent muda, em `temaDaLoja` e na AC7, com nova AD).

### Achados que ajustam tasks (independem da decisão do F10)

1. **T10/T16 — tema só em componente cliente.** `defineTheme`/`neutralTheme` lançam num Server Component (`defineSyntaxTheme` é função de cliente). O `<Theme>` da loja tem de ser montado num componente `'use client'` que recebe `slug`, `cor` e `familia` como props serializáveis; o layout (servidor) só lê a loja e passa as props. O módulo puro `temaDaLoja` continua importável pelo Vitest.
2. **T10 — família de fonte.** Passar a string do `next/font` (`'Lora', 'Lora Fallback'`) em `typography.body.family` gera `--font-family-body: "'Lora', 'Lora Fallback'"`, uma família citada que não casa com a fonte. Usar a sobrescrita `tokens` (`--font-family-body` e `--font-family-heading`) ou passar só o nome da família.
3. **T10 — accent derivado.** `resolveThemeTokens` devolve `--color-accent` derivado (`#d4145a` → `#C1004C`; cor nula com o padrão do protótipo → `#0058D2`). O teste da T10 e a asserção do e2e (VTEMA AC7) não podem esperar o hex literal; comparam duas lojas e o padrão entre si.
4. **T10 — nome do tema.** O nome do tema entra no seletor `@scope` e na chave de injeção; o protótipo usou `loja-<slug>` para duas lojas não colidirem.
5. **T16 — status.** O registro da F8 vale: página de não encontrado de loja sai com HTTP 200.
6. **Cache.** Linhas com `bigint` e `Date` atravessam o `use cache` sem erro.

### Ações da janela

Nada em produção, nenhum push. A fixture foi removida da branch `test` ao fim de cada rodada. O protótipo em `scratch/vitrine-prova/` (fora do git) foi apagado depois do registro, com o teste temporário da suíte raiz.

## Janela B — registro de execução (T13–T21)

### T16 — layout e tema da loja

- **Status HTTP do "não encontrado" de loja (F8, registrado pelo e2e)**: loja inativa (C) e slug sem loja → **200**, como a doc prevê para resposta em streaming; página neutra (`Página não encontrada`), `noindex`, sem nome, razão social, CRECI nem cor de nenhuma loja, sem bloco de tema.
- **Tema no HTML sem JS (AD-046)**: A, B e D trazem exatamente um bloco `@layer astryx-theme {` com `@scope ([data-astryx-theme="loja-<slug>"])` e um `@layer reset {` com o mesmo escopo e `:where(h1, h2, h3, h4, h5, h6)`; o HTML de A não cita `loja-vt-e2e-b`; `--color-accent` de A, B e D diferem entre si; `--font-family-body` e `--font-family-heading` = `var(--font-<fonte da loja>)`.
- **Rotas**: `◐ /c/[slug]` (Partial Prerender) no `next build`. A página da loja é um placeholder vazio até a T21 (o layout precisa de uma rota para ser servido).
- **Sensor do e2e (4 mutantes no layout, todos mortos)**: `cor={null}` e `fonte="inter"` fixos matam as asserções de accent e de fonte; sem rodapé mata a do rodapé; `mensagemCatalogo(loja.slug)` mata a do `wa.me`. As outras 14 seguiram verdes.
- **Capturas reais** (extensão do Chrome, aba visível, `npm run vitrine:dev` na porta 3100, fixture de sentinelas na branch `test`), em `capturas/`:
  `t16-01-cabecalho-rodape-loja-a-desktop.jpg`, `t16-02-cabecalho-rodape-loja-a-375.jpg`, `t16-03-cabecalho-rodape-loja-b-desktop.jpg`, `t16-04-cabecalho-rodape-loja-b-375.jpg`. As de 375 px carregam a página real num quadro de 375 px (a janela da extensão não reduz o viewport).
- **Largura de rolagem do documento no quadro de 375 px (VTEMA AC9)**: `/c/vt-e2e-a` = 375; `/c/vt-e2e-b` = 375 (`scrollWidth` = `clientWidth` = 375).
- **Observações**: o rodapé mostra o CRECI como o gestor digitou, com o prefixo "CRECI " (na fixture o valor já traz "CRECI-MG", então a captura lê "CRECI CRECI-MG 11111-J"); o telefone aparece como está gravado (só dígitos, sem máscara). Nenhum dos dois muda AC.

### T17 — imóvel indisponível (e correção do mecanismo do "não encontrado" da T16)

- **Achado**: `notFound()` lançado dentro do `<Suspense>` do layout (ou da página) faz o servidor entregar o limite como `<!--$!-->` + `<template data-dgst="NEXT_HTTP_ERROR_FALLBACK;404">`, para render no cliente. O HTML sem JS sai sem a UI de não encontrado (a loja inativa mostrava só o fallback de carregamento) e o texto só aparecia no payload RSC (`<script>`). As asserções da T16 (`includes` no corpo inteiro) não distinguem os dois casos; ficam como estão e a T17 acrescenta a prova sobre o HTML fora de `<script>`.
- **Decisão (sem mudar AC nem AD)**: o layout da loja e a página do imóvel **renderizam** o estado (`NaoEncontradoNeutro`, `ImovelIndisponivel`, em `vitrine/src/loja/nao-encontrado.tsx`) em vez de lançar `notFound()`. Status segue 200, `noindex` segue por meta do layout raiz e `X-Robots-Tag`, e a marca da loja vem do layout. `app/c/[slug]/not-found.tsx` existe como rede de segurança do segmento (usa `useParams`). `app/not-found.tsx` passa a usar o mesmo componente neutro. A T16 recebeu o ajuste no layout (commit da T17).
- **Rotas**: `◐ /c/[slug]/imovel/[ref]` no build. A página do imóvel é um placeholder até a T23 (decide entre existente e indisponível, sem composição).
- **e2e**: 20 de 20. Sensor: página do item devolvendo `null` e layout devolvendo `null` para loja ausente matam as duas asserções novas da T17 (as outras 18 seguem verdes).
- **Capturas** (`capturas/`): `t17-01` e `t17-02` (imóvel indisponível na marca da loja A, desktop e 375 px, com o botão "Ver todos os imóveis", CRECI e rodapé) e `t17-03` (página neutra de loja inativa, sem marca). Em escala 0,6.
- **Largura de rolagem no quadro de 375 px**: `/c/vt-e2e-a/imovel/ap-9999` = 375.
- **Lição de processo**: um `` num heredoc Python virou backspace no regex do helper `htmlVisivel` e o helper não removia nenhum `<script>`; o teste passava por engano. Corrigido montando a barra com `chr(92)` (L-047) e conferindo os bytes do arquivo.

### T18 — vitrine indisponível

- **Mecanismo**: a falha do banco é tratada onde acontece. O layout da loja (`lojaCacheada`) e a página do imóvel (`imovelCacheado`) capturam o erro (repassando os internos do Next com `unstable_rethrow`), registram `[vitrine] erro (<onde>): <nome> <código>` e **renderizam** "Vitrine temporariamente indisponível." no servidor. Pela mesma razão do achado da T17, um erro lançado dentro de `<Suspense>` só chegaria ao `error.tsx` no cliente e o HTML sem JS sairia sem a mensagem. `app/c/[slug]/error.tsx` fica como rede de segurança (loga só o digest).
- **Achado: o Next imprime o erro das funções com `use cache`** (SQL, parâmetros e host) antes de qualquer `catch`. A regra de log do design é "prefixo, slug, status e nome de erro". A camada de cache passa a lançar `ErroDeLeitura` (só o código `ENOTFOUND`, `28P01`...), sem a mensagem nem a causa do driver (`vitrine/src/dados/erro-de-leitura.ts`, 4 testes unitários; `cache.ts` chama `lerDoBanco` em cada consulta; a conexão da app é obtida fora dele para a mensagem de variável ausente seguir legível). A spec só exigia "sem dado de linha" no log; a regra do design é mais estrita e foi seguida.
- **e2e** (21 de 21): o harness ganhou `iniciarInstancia`, que sobe outra instância já construída com variáveis trocadas; a rodada usa `VITRINE_DATABASE_URL` com host `.invalid`. Em `/c/<loja>` e `/c/<loja>/imovel/<ref>`: HTTP 200, mensagem no HTML visível, sem render no cliente, `noindex`, sem host, senha, `ENOTFOUND`, `getaddrinfo`, `node_modules`, SQL nem pilha; o log da instância tem o prefixo e não tem host, senha nem SQL.
- **Sensor**: mensagem removida do layout mata a asserção; `lerDoBanco` removido da camada de cache mata a asserção pelo log ("o log contém" o host). As outras 20 seguiram verdes em cada rodada.
- **Capturas** (`capturas/`, `next dev` com banco inalcançável, escala 0,6): `t18-01-vitrine-indisponivel-desktop.jpg` e `t18-02-vitrine-indisponivel-375.jpg`. O indicador "1 Issue" do Next em desenvolvimento aparece na captura de desktop (é do modo dev; o log do servidor dev não contém o host).
- **Largura de rolagem no quadro de 375 px**: `/c/vt-e2e-a` com o banco indisponível = 375.

### T19, T20 e T21 — templates e página de catálogo

- **Rotas**: `◐ /c/[slug]` (catálogo). `generateMetadata` do catálogo: `title` "<nome> — imóveis", `description` = título institucional ou "Imóveis disponíveis em <cidade>/<uf>", `og:*` e `twitter:card`; `metadataBase` vem de `VITRINE_PUBLIC_URL` (sem a variável, as URLs ficam relativas). **`og:image` fica para a T24** (o `opengraph-image` da loja); a T21 prova título, descrição, URL absoluta e `twitter:card` no `<head>` para o user-agent do WhatsApp.
- **Decisões de execução (sem mudar AC)**: a faixa "Destaques" só aparece na página 1 (na página 2 repetiria imóveis e quebraria "25 imóveis → a página 2 tem 1"); a paginação é um wrapper de cliente (`Pagination` da Astryx só dispara `onChange`) que navega para `?pagina=<n>`; `?pagina=` repetido vale o primeiro valor; o `Token "Destaque"` do editorial fica junto do preço (no `endContent` truncava o título a 375 px).
- **Português da lib (L-010)**: `src/i18n/mensagens.ts` traz o catálogo pt-BR das chaves de paginação, carrossel, visualizador de fotos e link em nova aba, aplicado por `InternationalizationProvider` no layout raiz. Teste (3): toda chave existe em `locales/en.json` da lib instalada e os marcadores `{...}` são os mesmos. O e2e confere `aria-label="Paginação"` e `"Ir para a próxima página"` e a ausência de "Go to" no HTML.
- **Achado (bug real)**: `Icon icon={IconeDeFoto}` num Server Component passa uma função a um Client Component; o RSC lança "Functions cannot be passed directly to Client Components" e o catálogo com um imóvel sem foto caía no `error.tsx`. O sintoma no e2e foi o preço da A ausente depois do aviso de revalidação; a causa estava no log do servidor. Corrigido movendo o espaço reservado para um componente de cliente (`espaco-sem-foto.tsx`) e acrescentada a asserção global "o servidor principal não registrou erro de render nem de leitura" (qualquer `⨯` ou `[vitrine] erro` no log reprova).
- **Cache provado por HTTP**: aviso para A e B (estado de partida) → preço de um imóvel mudado no banco em A (AP-0025, R$ 400.000 → R$ 777.000) e em B (CA-0004, R$ 530.000 → R$ 888.000) sem aviso → as duas páginas seguem antigas; aviso com segredo errado → 401 e A segue antiga; aviso certo para A → A mostra R$ 777.000 e B segue R$ 530.000 (do cache, sem reconsulta); aviso para B → B mostra R$ 888.000. A primeira leitura depois de `revalidateTag(tag, { expire: 0 })` traz o conteúdo no HTML (o teste lê o HTML sem scripts).
- **e2e**: 32 de 32 asserções; 163 → 168 testes unitários da vitrine e do isolamento verdes na rodada única.
- **Sensor (mutantes mortos)**: paginação ignorada, templates trocados e faixa de destaques em toda página (rodada 1: 4 asserções reprovam); tag fixa na lista de imóveis (rodada 2: a do cache reprova). Mais os 4 da T16, 2 da T17 e 2 da T18.
- **Capturas** (`capturas/`, extensão do Chrome, aba visível, `next dev` na porta 3100, fixture na branch `test`; as de composição com fotos locais temporárias):
  `t21-01-grade-loja-a-desktop-foto-quebrada` (URL de foto fictícia: `alt` visível e proporção mantida, Edge Case "foto quebrada"), `t21-02-grade-loja-a-desktop-topo`, `t21-03-grade-loja-a-desktop-fim` (paginação, Sobre, rodapé), `t21-04-editorial-loja-b-desktop`, `t21-05-vazio-loja-d-desktop`, `t21-06-grade-loja-a-375`, `t21-07-editorial-loja-b-375`, `t21-08-vazio-loja-d-375`.
- **Largura de rolagem do documento no quadro de 375 px (VTEMA AC9)**: grade A `scrollWidth` 360 = `clientWidth` 360 (375 menos 15 px da barra vertical do quadro); grade A `?pagina=2` 375 = 375; editorial B 360 = 360; vazio D 375 = 375. Nenhuma rolagem horizontal.
- **Observação visual**: no editorial a 375 px o título de uma linha com bairro longo ("Apartamento em Bairro Beta Exclusivo") é truncado com reticências (rótulo de uma linha do `ListItem`); o bairro segue na descrição.


## Janela C — registro de execução (T22–T26)

### T22 e T23 — composição e página de imóvel

- **Rotas**: `◐ /c/[slug]/imovel/[ref]` no build. `generateMetadata` do imóvel: título "<Tipo> em <bairro> — <REF>", descrição "<quartos> quartos · <área> m² · <preço>", `og:*` e `twitter:*`, `og:url` canônica em minúsculas e `og:image` = primeira foto cadastrada. Sem foto, `images` fica de fora e o segmento herda o cartão gerado da loja: a prova dessa metade fica na T24, que cria o `opengraph-image` (a T23 não tem o arquivo para herdar).
- **Decisões de execução (sem mudar AC)**: a descrição é partida nas quebras de linha e emitida com `<br>` entre as linhas (a `Text` da Astryx não tem prop de espaço em branco e não aceita `className`); a galeria é componente de cliente (`useLightbox`) e recebe só texto; cada slide do carrossel tem largura própria (320) porque o scroller tem largura indefinida; tipo, bairro, cidade e UF saem num único nó de texto para o HTML não ganhar `<!-- -->` no meio.
- **Isolamento, na direção possível com a fixture**: as cinco referências da B (`AP-0001`, `CA-0002`, `AP-0003`, `CA-0004`, `AP-0005`) também existem na A, então "referência da B sob o slug da A" devolveria a própria da A. O e2e prova as duas pontas: `AP-0007` (só da A) sob o slug da B → indisponível, e `CA-0002` (nas duas) mostra em cada loja o preço, o bairro e o texto da própria, sem nenhum marcador da outra. É a mesma propriedade (VSEG AC2, AC3) sem mexer na fixture.
- **e2e**: 43 de 43 (11 asserções novas da T23; as anteriores não mudaram e o diff de `scripts/vitrine-e2e.ts` é só de acréscimos). Cobrem: campos de VITEM AC1; `AP-0001` e `ap-0001` na mesma página; vendido, reservado e despublicado da A, o vendido da B e os três da D por URL direta; loja inativa e referência fora do formato; isolamento; `<script>` escapado com as quebras; `<img>` com URL, `lazy`, `no-referrer` e `alt`; imóvel sem foto; `wa.me` decodificado; `og:*` com a primeira foto.
- **Sensor** (cópia dos arquivos, restaurados e conferidos): 6 mutantes, todos mortos, cada um por uma asserção própria. `og:image` sempre vazio, quebras de linha trocadas por espaço, mensagem do `wa.me` com o slug no lugar do nome, `loading="lazy"` removido da foto, e quartos mostrando o valor de banheiros. O quinto sobreviveu na primeira rodada: o `AP-0001` da fixture tem 2 quartos e 2 banheiros, então a troca não aparecia; a asserção nova usa `CA-0006` (3, 1, 0, 58) e o mata.
- **Achado da captura (defeito que o e2e não vê)**: com `width="100%"` no slide do carrossel, a foto saiu com largura zero (o HTML estava certo e o e2e passava). Corrigido com largura própria e conferido no navegador: foto de 318 × 239 dentro do slide de 320.
- **Observação de ferramenta**: `next dev` e `next build` dividem `vitrine/.next`; depois de o e2e construir, o servidor de desenvolvimento que já estava de pé respondeu 404 em rota nova. Apagar `vitrine/.next` e reiniciar o `vitrine:dev` resolve.
- **Capturas** (`capturas/`, extensão do Chrome, aba visível, `npm run vitrine:dev` na porta 3100, fixture na branch `test`, fotos locais temporárias; as de 375 px no quadro de 375 px, em escala 0,6): `t23-01-imovel-com-fotos-loja-a-desktop`, `t23-02-imovel-galeria-aberta-loja-a-desktop`, `t23-03-imovel-sem-foto-loja-a-desktop`, `t23-04-imovel-com-fotos-loja-a-375`, `t23-05-imovel-sem-foto-loja-a-375`, `t23-06-imovel-galeria-aberta-loja-a-375`.
- **Largura de rolagem do documento no quadro de 375 px (VTEMA AC9)**: `/c/vt-e2e-a/imovel/ap-0001` = 375 (`scrollWidth` = `clientWidth` = 375); `/c/vt-e2e-a/imovel/ap-0005` (sem foto) = 375.
- **Gate**: lint, typecheck e build da vitrine sem erro; lint da raiz 0 erros (9 avisos de linha de base); `tsc` da raiz com os mesmos 50 erros.

### T24 — imagem de compartilhamento da loja

- **Rota**: `ƒ /c/[slug]/opengraph-image` no build (PNG 1200×630, `ImageResponse` de `next/og`, sem fonte, foto nem logo remotos). Fundo = hex literal da loja ou, sem cor, `COR_PADRAO`; texto branco ou quase preto pelo contraste WCAG (`corDoTextoSobre`, 3 testes unitários, 1 mutante morto). Loja que a vitrine não mostra (inativa, sem loja, slug inválido) → 404 sem PNG nem marca.
- **Achado**: o `openGraph` do `generateMetadata` do imóvel substitui o do segmento da loja por inteiro, então o imóvel sem foto saía sem `og:image` mesmo com o `opengraph-image` no segmento pai. A página do imóvel passou a repassar as imagens do `parent` (`ResolvingMetadata`) quando não há foto. É a metade da T23 que ficou para esta task.
- **Cartão e `style`**: o Satori só renderiza `div` com `style` inline. O cartão não é página e não passa pela Astryx, então a regra de "sem `style`" (VTEMA AC8) não se aplica a ele; o comentário do arquivo registra isso.
- **e2e**: 47 de 47 (4 asserções novas; diff do `scripts/vitrine-e2e.ts` só com acréscimos). `og:image` absoluto, `og:image:width` 1200 e `height` 630 e `twitter:image` no catálogo de A, B e D; PNG de A, B e D com 1200×630 e o primeiro pixel igual ao hex literal da loja (A `#d4145a`, B `#12a150`), D diferente das duas e A ≠ B; C, loja inexistente e slug inválido → 404 sem PNG; imóvel sem foto (`AP-0005` da A) com `og:image` igual ao do catálogo; nenhuma requisição de saída ao gerar o cartão.
- **"Nenhuma requisição de saída"**: o e2e sobe uma instância com um módulo pré-carregado (`NODE_OPTIONS=--require`, escrito em diretório temporário) que anota todo `fetch` e toda chamada a `http(s).request/get`; depois de gerar os dois cartões, só podem existir anotações de `data:` (o módulo WASM do renderizador, lido em memória) ou de `localhost`. A conexão do banco usa `net`/`tls` e não entra na anotação.
- **Sensor** (cópia dos arquivos, restaurados): 5 mutantes, todos mortos. Fundo sempre na cor padrão (assertion do hex literal, rodado isolado: `#262626` no lugar de `#d4145a`); `fetch` de uma URL externa dentro do cartão (assertion de saída); altura 600 (assertion de 1200×630); imóvel sem herança das imagens do pai (assertion do imóvel sem foto); limiar do contraste invertido (teste unitário).
- **Capturas** (`capturas/`, extensão do Chrome, aba visível, `next dev` na porta 3100, escala 0,6): `t24-01-cartao-loja-a`, `t24-02-cartao-loja-b`, `t24-03-cartao-loja-d-cor-padrao`. A fixture não tem loja de cor sem croma; a limitação do accent derivado (AD-046) não se aplica ao cartão, que usa o hex literal.
- **Gate**: lint, typecheck e build da vitrine sem erro; 16 testes do tema verdes; lint da raiz 0 erros (9 avisos de linha de base); `tsc` da raiz com os mesmos 50 erros.

### T25 — capturas de fechamento

- **Como**: extensão do Chrome com a aba visível, `npm run vitrine:dev` (porta 3100), fixture de sentinelas na branch `test` e fotos locais temporárias; as de 375 px carregam a página real num quadro de 375 px (a janela da extensão não reduz o viewport), em escala 0,6. O quadro e as fotos ficaram em `vitrine/public/` só durante a captura e foram apagados; a fixture foi removida da branch `test` ao fim. Para ter os dois layouts nas duas lojas, o layout de A e de B foi trocado no banco entre as rodadas (A editorial e B grade) e a fixture, removida depois.
- **Arquivos** (`capturas/`):
  - layouts × desktop e 375 px × lojas: `t25-01-grade-loja-a-desktop`, `t25-02-grade-loja-a-375`, `t25-03-editorial-loja-b-desktop`, `t25-04-editorial-loja-b-375`, `t25-05-editorial-loja-a-desktop`, `t25-06-editorial-loja-a-375`, `t25-07-grade-loja-b-desktop`, `t25-08-grade-loja-b-375`;
  - item, indisponível, vazio e erro: `t25-09-item-com-foto-loja-a-375`, `t25-10-item-sem-foto-loja-a-375`, `t25-11-imovel-indisponivel-loja-a-375`, `t25-12-catalogo-vazio-loja-d-375`, `t25-13-erro-vitrine-indisponivel-desktop`, `t25-14-erro-vitrine-indisponivel-375`.
  - Os desktops do item com e sem foto, do imóvel indisponível e do catálogo vazio são os de `t23-01`, `t23-03`, `t17-01` e `t21-05`: o código dessas páginas não mudou depois deles.
- **Largura de rolagem do documento no quadro de 375 px (VTEMA AC9)**, `scrollWidth` = `clientWidth` = 375 em todas:

  | Página | Rota | Largura |
  | --- | --- | --- |
  | catálogo em grade (A e, com o layout trocado, B) | `/c/vt-e2e-a`, `/c/vt-e2e-b` | 375 e 375 |
  | catálogo editorial (B e, com o layout trocado, A) | `/c/vt-e2e-b`, `/c/vt-e2e-a` | 375 e 375 |
  | item com foto | `/c/vt-e2e-a/imovel/ap-0001` | 375 |
  | item sem foto | `/c/vt-e2e-a/imovel/ap-0005` | 375 |
  | imóvel indisponível | `/c/vt-e2e-a/imovel/ap-9999` | 375 |
  | catálogo vazio | `/c/vt-e2e-d` | 375 |
  | vitrine indisponível (banco inalcançável) | `/c/vt-e2e-a` | 375 |

- **Loja de cor sem croma**: a fixture não tem (A `#d4145a` e B `#12a150`; D sem cor, que usa o accent do próprio tema neutro, sem derivação). A limitação do accent derivado (cinza vira verde, preto vira rosa; AD-046) segue registrada no gate T0 e não foi reexercitada.
- **Observações**: o indicador do Next em desenvolvimento ("3 Issues") aparece nas capturas de erro; é do modo dev, e o log do servidor dev não contém o host (provado por HTTP no e2e da T18). No editorial a 375 px o título de uma linha com bairro longo é truncado com reticências (registro da T21, sem mudança).
