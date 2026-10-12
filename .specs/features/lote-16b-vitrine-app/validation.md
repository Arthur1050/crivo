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

## Validation — Verifier (janela C)

**Result**: FAIL

**Data**: 2026-10-12. **Verifier**: agente independente (não executou nenhuma task do lote). **Intervalo do diff**: `ddbf72d^..f01b5d0` (T0–T26; `677f29e`, renomeação para Krivo, fora do escopo). Foco: `vitrine/`, `scripts/vitrine-*.ts`, `scripts/__tests__/vitrine-*`, `src/lib/storefront-contract.ts`, `src/db/__tests__/vitrine-*`, `src/lib/__tests__/vitrine-*` e `storefront-*`.

**Motivo do veredito**: nenhum defeito de produto foi achado e os 8 mutantes obrigatórios morreram, mas 4 mutantes extras sobreviveram e 5 itens da spec (P1) não têm prova automatizada do valor que a spec define (lacunas 1–5 abaixo). Pela regra evidence-or-zero e "mutante que sobrevive vira lacuna", o lote não fecha até essas asserções existirem.

**Linha de base medida pelo Verifier** (no HEAD, checkout limpo, um processo por vez): `npm run vitrine:e2e` 47 de 47; `npx vitest run vitrine` + os 10 arquivos da raiz do lote (`vitrine-isolamento`, `vitrine-tipos-paridade`, `storefront-contract-parity`, `storefront-contract`, `vitrine-consultas`, `vitrine-views-paridade`, `vitrine-privilegios`, `vitrine-views`, `vitrine-dev`, `vitrine-fixture`): 22 arquivos, 180 testes verdes. Suíte completa, lint e `tsc` não foram rodados de novo (registro do executor: 238 arquivos/3813 testes; lint 0 erros; `tsc` com os 50 de linha de base).

### Cobertura por requisito e AC

Legenda: **OK** = teste cujo valor asserido é o da spec; **Parcial** = parte do AC provada, parte só por código ou captura; **Sem prova** = nenhum teste prova o valor (nota zero). `e2e` = `scripts/vitrine-e2e.ts`.

| Req. | AC | Teste (arquivo:linha) | Código (arquivo:linha) | Nota |
| --- | --- | --- | --- | --- |
| VPROJ-01 | AC1 | `src/lib/__tests__/vitrine-isolamento.test.ts:164` | `vitrine/package.json`, `vitrine/next.config.ts`, `vitrine/tsconfig.json`, `vitrine/eslint.config.mjs` | OK |
| VPROJ-01 | AC2 | `vitrine-isolamento.test.ts:173` | `vitrine/next.config.ts:6` | OK |
| VPROJ-01 | AC3 | `vitrine-isolamento.test.ts:182` | (ausência de `proxy.ts`/`middleware.ts`) | OK |
| VPROJ-01 | AC4 | `vitrine-isolamento.test.ts:98-131`, `:189` | regra em `vitrine-isolamento.test.ts` | OK |
| VPROJ-01 | AC5 | `vitrine-isolamento.test.ts:210`, `:221` | `tsconfig.json`/`eslint.config.mjs` da raiz | OK |
| VPROJ-01 | AC6 | `vitrine/src/db/__tests__/conexao.test.ts:9`, `:25`, `:37` | `vitrine/src/db/conexao.ts:25-33` | OK |
| VPROJ-02 | AC7 | `src/lib/__tests__/storefront-contract-parity.test.ts:23-47` | `vitrine/src/contrato.ts:11-26` | OK |
| VPROJ-02 | AC8 | `storefront-contract-parity.test.ts:40`; `src/db/__tests__/vitrine-views-paridade.test.ts:37`, `:43` | `vitrine/src/db/views.ts:15-61` | OK |
| VCAT-01 | AC1 | 200: e2e:233-236; imóveis: e2e:457-466; nome: e2e:590, e2e:327; título só no metadado (e2e:591) | `vitrine/src/templates/comum/secoes.tsx:36-60` | **Parcial** — "sobre" e o título no corpo da página sem asserção (mutante E11b sobreviveu) |
| VCAT-01 | AC6 | foto, `alt` com tipo e bairro: e2e:544-551; link: e2e:457-464; preço: e2e:515, e2e:615 | `vitrine/src/templates/grade/catalogo-grade.tsx:12-41`, `catalogo-editorial.tsx:18-47` | **Parcial** — cidade, quartos, banheiros, vagas e área do card sem asserção por HTTP (E11a sobreviveu); `resumoDosAtributos` só tem teste unitário da função (`vitrine/src/lib/__tests__/apresentacao.test.ts:106-118`) |
| VCAT-01 | AC7 | e2e:556-572 | `secoes.tsx:10-33` | OK |
| VCAT-01 | AC11 | `apresentacao.test.ts:13-29`; e2e:677 | `vitrine/src/lib/apresentacao.ts:10-13` | OK |
| VCAT-01 | AC12 | e2e:318-331 | `vitrine/app/c/[slug]/layout.tsx:67`, `:90-98` | OK |
| VCAT-02 | AC2 | e2e:457-466; `src/db/__tests__/vitrine-consultas.test.ts:152-165` | `vitrine/src/dados/consultas.ts:19-25` | OK |
| VCAT-02 | AC3 | e2e:457-470; `vitrine/src/lib/__tests__/catalogo.test.ts:21` | `vitrine/src/lib/catalogo.ts:7`, `:22-36`; `app/c/[slug]/page.tsx:84` | OK |
| VCAT-02 | AC4 | e2e:473-480; `catalogo.test.ts:27` | `catalogo.ts:24-28` | OK |
| VCAT-02 | AC5 | e2e:481-482; `catalogo.test.ts:33` | `catalogo.ts:27` | OK |
| VCAT-03 | AC8 | e2e:128-135, e2e:343-351; `catalogo.test.ts:52-67` | `layout.tsx:54`; `page.tsx:70` | **Parcial** — "sem consultar o banco" só por código; nenhum teste prova a ausência de consulta |
| VCAT-03 | AC9 | e2e:221-231, e2e:343-351; `vitrine-consultas.test.ts:180-191` | `layout.tsx:65`; `vitrine/src/loja/nao-encontrado.tsx:9-19` | OK |
| VCAT-03 | AC10 | noindex: e2e:124, e2e:132, e2e:227; sem dado de imóvel: e2e:1012-1020 (sentinela do imóvel da loja inativa), e2e:742-746 | `app/layout.tsx:21` | OK |
| VITEM-01 | AC1 | e2e:666-687, e2e:689-700 | `vitrine/src/item/pagina-item.tsx:56-127` | OK |
| VITEM-01 | AC2 | e2e:702-717; `catalogo.test.ts:70-84`; `vitrine-consultas.test.ts:169-176` | `catalogo.ts:46-67`; `consultas.ts:28-44` | OK |
| VITEM-01 | AC6 | e2e:801-807, e2e:552-553 | `vitrine/src/templates/comum/foto-do-imovel.tsx:19-38` | **Parcial** — "mantendo a proporção" só por captura (`t23-03`, `t23-05`, `t21-01`) |
| VITEM-01 | AC7 | e2e:775-786 | `pagina-item.tsx:18-30` | OK |
| VITEM-01 | AC8 | e2e:788-799, e2e:544-551; `apresentacao.test.ts:57` | `vitrine/src/item/galeria-do-imovel.tsx:45`; `foto-do-imovel.tsx:27-32` | OK |
| VITEM-02 | AC3 | e2e:809-828; `vitrine/src/lib/__tests__/contato.test.ts:36` | `vitrine/src/lib/contato.ts:16-25`; `pagina-item.tsx:61` | OK |
| VITEM-02 | AC4 | `contato.test.ts:16`, `:21`; e2e:819 | `contato.ts:10-13` | OK |
| VITEM-02 | AC5 | e2e:353-373, e2e:719-740 | `app/c/[slug]/imovel/[ref]/page.tsx:83`, `:95`; `nao-encontrado.tsx:26-35` | OK |
| VSEG-01 | AC1 | `src/db/__tests__/vitrine-privilegios.test.ts:98-103`, `:166-185` | `views.ts:15-61` | OK |
| VSEG-01 | AC2 | `vitrine-consultas.test.ts:114-133`; e2e:753-773 | `consultas.ts:23`, `:38` | OK |
| VSEG-01 | AC3 | e2e:498-517, e2e:753-773 | idem | OK |
| VSEG-01 | AC4 | e2e:485-496, e2e:719-740; `vitrine-consultas.test.ts:135-148` | corte na view (L16a, AD-040) | OK |
| VSEG-01 | AC8 | `vitrine-consultas.test.ts:107`, `:114`, `:135` | `conexao.ts:12-14` | OK |
| VSEG-02 | AC5 | e2e:1012-1020 (HTML, `<head>` e log) | `opengraph-image.tsx:39-62` (só nome, cidade e UF) | **Parcial** — o PNG não é varrido (o harness guarda binário como texto vazio); a ausência de PII na imagem é só por código |
| VSEG-02 | AC6 | e2e:171-181 | `vitrine/app/api/revalidar/route.ts:19-49` | OK por inspeção: nenhum outro handler nem `use server` em `vitrine/` |
| VSEG-02 | AC7 | e2e:1006-1010; `vitrine/app/api/revalidar/__tests__/route.test.ts:110` | — | OK |
| VSEG-02 | Edge banco indisponível | e2e:377-406; `vitrine/src/dados/__tests__/erro-de-leitura.test.ts:17-60` | `vitrine/src/dados/erro-de-leitura.ts:10-38`; `vitrine/src/loja/indisponivel.tsx:11-32` | OK |
| VTEMA-01 | AC1 | `vitrine/src/tema/__tests__/tema-da-loja.test.ts:16`, `:24`, `:28` | `vitrine/src/tema/tema-da-loja.ts:30-46`; `tema-da-loja-provider.tsx:31` | OK |
| VTEMA-01 | AC2 | `tema-da-loja.test.ts:24`, `:33`; e2e:265-279 | `vitrine/src/tema/cor.ts:8-20` | OK |
| VTEMA-01 | AC3 | e2e:281-293; `tema-da-loja.test.ts:59`, `:68` | `tema-da-loja.ts:34-44`; `vitrine/src/tema/fontes.ts:15-30` | OK |
| VTEMA-01 | AC7 | e2e:233-279; `tema-da-loja.test.ts:75-108`, `:111` | `tema-da-loja.ts:60-66`; `tema-da-loja-provider.tsx:24-37` | OK |
| VTEMA-02 | AC4 | cards: e2e:519-528; faixa: e2e:465-466; paginação: e2e:574-583; rodapé: e2e:295-303 | `catalogo-grade.tsx:49-82`; `page.tsx:87-88` | **Parcial** — "Sobre" sem asserção (E11b); teto de 6 destaques não exercitado (fixture com 3, `scripts/vitrine-fixture.ts:126`; `MAXIMO_DE_DESTAQUES` sem teste) |
| VTEMA-02 | AC5 | e2e:519-533 | `catalogo-editorial.tsx:56-90` | **Parcial** — "Sobre" sem asserção (E11b) |
| VTEMA-02 | AC6 | grade: e2e:470 (página 2, destaques vazios; E11c morto) | `catalogo-grade.tsx:54`; `catalogo-editorial.tsx:57`, `:63` | **Parcial** — editorial sem destaque mantendo a foto do cabeçalho passa no e2e (E11d sobreviveu); a fixture não tem loja com imóveis e sem destaque |
| VTEMA-02 | AC8 | nenhum teste | inspeção: sem `style`, `className` arbitrário nem `<div>`/`<span>` em `vitrine/app` e `vitrine/src` fora de `opengraph-image.tsx:45-63` (Satori, exceção registrada na T24); `vitrine/app/globals.css:7-15` só imports e ordem de camadas | OK por inspeção |
| VTEMA-02 | AC9 | capturas `t16-02`, `t16-04`, `t17-02`, `t18-02`, `t21-06..08`, `t23-04..06`, `t25-02/04/06/08..14` | medições em `validation.md` (T16, T17, T18, T21, T23 e tabela da T25): `scrollWidth` = `clientWidth` ≤ 375 | OK (captura) |
| VLEGAL-01 | AC1 | catálogo A, B, D: e2e:295-303; item: e2e:686; imóvel indisponível: e2e:367-368 | `vitrine/src/rodape/rodape-legal.tsx:24-59` | OK (o aviso só é asserido no catálogo; item e indisponível usam o mesmo componente do layout) |
| VLEGAL-01 | AC2 | e2e:305-316 | `rodape-legal.tsx:35-55` | OK |
| VLEGAL-01 | AC3 | e2e:308, e2e:313; `contato.test.ts:66` | `contato.ts:39-42` | OK |
| VLEGAL-01 | AC4 | e2e:309, e2e:314; `contato.test.ts:58` | `contato.ts:33-36` | OK |
| VOG-01 | AC1 | e2e:585-600, e2e:830-841, e2e:887-897 | `app/layout.tsx:8-19`; `page.tsx:26-44`; `imovel/[ref]/page.tsx:24-59` | OK |
| VOG-01 | AC2 | e2e:589-599; `apresentacao.test.ts:69-88` | `apresentacao.ts:81-89` | OK |
| VOG-01 | AC3 | e2e:834-835; `apresentacao.test.ts:89` | `apresentacao.ts:92-99` | OK |
| VOG-01 | AC4 | e2e:836, e2e:899-901 | `imovel/[ref]/page.tsx:32-35` | OK |
| VOG-01 | AC5 | PNG 1200×630 na cor da loja: e2e:904-923; sem saída: e2e:938-995 | `vitrine/app/c/[slug]/opengraph-image.tsx:25-68` | **Parcial** — "com o nome da loja" sem asserção (E1 sobreviveu); só as capturas `t24-01..03` |
| VOG-01 | AC6 | e2e:585-600, e2e:830-841 (UA do WhatsApp, `metaDoHead` lê só antes de `</head>`) | — | OK |
| VCACHE-01 | AC1 | `vitrine/src/dados/__tests__/cache.test.ts:52-61` | `vitrine/src/dados/cache.ts:21-43` | OK |
| VCACHE-01 | AC2 | `vitrine-isolamento.test.ts:173` | `next.config.ts:7-10` | OK |
| VCACHE-01 | AC8 | e2e:602-646 | `route.ts:36`; `cache.ts` | OK |
| VCACHE-01 | AC9 | e2e:628-634 (página antiga sem aviso) | `next.config.ts:9` | Parcial aceito — o teto de 300 s é provado só pela configuração |
| VCACHE-01 | Edge desativação + aviso | **nenhum** | `cache.ts:21-27`; corte da view (`src/db/__tests__/vitrine-views.test.ts:206`, L16a) | **Sem prova** — nenhum teste desativa a loja, avisa e confere a página neutra; a `lojaCacheada` sem tag (E13) passa no e2e e só morre no teste unitário da tag |
| VCACHE-02 | AC3 | `route.test.ts:39`, `:46`; e2e:137-145, e2e:637-639 | `route.ts:36-38` | OK |
| VCACHE-02 | AC4 | e2e:147-160; `route.test.ts:52`, `:60`; `vitrine/src/__tests__/revalidacao.test.ts:39` | `revalidacao.ts:24-28`; `route.ts:21-28` | OK |
| VCACHE-02 | AC5 | e2e:162-169; `route.test.ts:72`; `revalidacao.test.ts:61-87` | `revalidacao.ts:36-50` | OK |
| VCACHE-02 | AC6 | e2e:171-181; `route.test.ts:80` | `route.ts:42-49` | OK |
| VCACHE-02 | AC7 | `revalidacao.test.ts:47` | `revalidacao.ts:28` | OK |
| VCACHE-02 | AC10 | e2e:183-188, e2e:1030-1035; `route.test.ts:89`, `:105` | `route.ts:26`, `:32`, `:37` | OK |
| VSEO-01 | AC1 | e2e:124, e2e:132, e2e:227, e2e:369, e2e:684, e2e:738 | `app/layout.tsx:21` | OK |
| VSEO-01 | AC2 | e2e:999-1004 | `next.config.ts:14-24` | OK |
| VSEO-01 | AC3 | nenhum teste | inspeção: `git ls-files vitrine` sem `robots`, `sitemap` nem `public/` | OK por inspeção |

**Edge Cases**

| Edge Case | Teste (arquivo:linha) | Nota |
| --- | --- | --- |
| Exatamente 24 imóveis → uma página, sem paginação | `catalogo.test.ts:13`; `page.tsx:95` só monta a paginação com mais de uma página; e2e:581-582 (B, 4 imóveis) | Parcial aceito (limite exato só no unitário) |
| 25 imóveis → página 2 com 1 | e2e:468-469; `catalogo.test.ts:21` | OK |
| Foto quebrada mantém proporção e `alt` | captura `t21-01-grade-loja-a-desktop-foto-quebrada.jpg` | OK (captura) |
| `<script>` na descrição | e2e:775-786 | OK |
| `ap-0142` casa com `AP-0142` | `vitrine-consultas.test.ts:169-176`; e2e:702-712 | OK |
| Banco indisponível | e2e:377-406 | OK |
| Loja desativada + aviso → neutra | — | **Sem prova** (lacuna 1) |

Contagem: 75 itens (68 ACs + 7 Edge Cases). OK, inclusive por inspeção ou captura: 63. Parcial aceito (lacuna de precisão menor, sem mutante sobrevivente): 5 (VCAT AC8, VITEM AC6, VSEG AC5 no PNG, VCACHE AC9, Edge de 24). Parcial com mutante sobrevivente ou sem prova: 7 (VCAT AC1, VCAT AC6, VTEMA AC4, VTEMA AC5, VTEMA AC6, VOG AC5, Edge de desativação).

### Sensor de discriminação

Método: cópia de cada arquivo em scratchpad, mutação no arquivo real, teste-alvo, restauração imediata e `git status --short` vazio conferido depois de cada rodada. E2E em rodadas (um processo por vez); os mutantes de uma mesma rodada caem em asserções distintas, citadas uma a uma. Nenhum teste foi editado.

| # | Arquivo | Mutação | Teste que matou | Desfecho |
| --- | --- | --- | --- | --- |
| M1 | `vitrine/src/dados/consultas.ts:23` | `imoveisDaLoja` sem `.where(eq(imoveis.lojaSlug, slug))` | `src/db/__tests__/vitrine-consultas.test.ts:114` (e mais 4 do arquivo) | morto |
| M2 | `vitrine/src/dados/cache.ts:24,32,40` | `cacheTag("tenant:vitrine:catalogo")` fixo | `vitrine/src/dados/__tests__/cache.test.ts:52` (as 3 funções) | morto |
| M3 | `vitrine/app/api/revalidar/route.ts:36` | `{ expire: 0 }` → `"max"` (stale-while-revalidate; a chamada de 1 argumento não compila no Next 16.2: o tipo exige o segundo) | `route.test.ts:39`; e por comportamento e2e:639 ("A depois do aviso: tem de refletir o banco") | morto |
| M4 | `vitrine/src/revalidacao.ts:28` | `===` no lugar de `timingSafeEqual` | `vitrine/src/__tests__/revalidacao.test.ts:47` | morto (só pelo espião: tempo constante não tem prova comportamental) |
| M5 | `vitrine/src/lib/contato.ts:12` | prefixo `55` também com 12 dígitos | `contato.test.ts:21`, `:58` | morto |
| M6 | `vitrine/src/lib/catalogo.ts:27` | sem `Math.min(pedida, totalPaginas)` | `catalogo.test.ts:33`, `:40`, `:46` | morto |
| M7a | `vitrine/next.config.ts:20` | sem o cabeçalho `X-Robots-Tag` | e2e:999-1004 (Global X-Robots-Tag) | morto |
| M7b | `vitrine/app/layout.tsx:21` | sem `robots` no metadado do layout raiz | e2e:124, e2e:132, e2e:227, e2e:369, e2e:391, e2e:684, e2e:738 | morto |
| M8 | `vitrine/src/item/pagina-item.tsx:22-27` | descrição via `dangerouslySetInnerHTML` (com `<br/>`) | e2e:779 ("o `<script>` da descrição virou tag") | morto |
| E1 | `vitrine/app/c/[slug]/opengraph-image.tsx:59` | cartão sem o nome da loja | — | **SOBREVIVEU** |
| E2 | `vitrine/src/dados/consultas.ts:38` | `imovelPorReferencia` sem o filtro de slug | `vitrine-consultas.test.ts:114` (linha 131) | morto |
| E3 | `vitrine/app/c/[slug]/imovel/[ref]/page.tsx:32` | `og:image` = última foto | e2e:836 | morto |
| E5 | `vitrine/src/tema/tema-da-loja.ts:38` | nome do tema fixo `loja` | `tema-da-loja.test.ts:75`, `:86` | morto |
| E10 | `vitrine/src/lib/catalogo.ts:47` | link do imóvel sem `toLowerCase` | `catalogo.test.ts:71` | morto |
| E11a | `vitrine/src/templates/grade/catalogo-grade.tsx:36` | card sem quartos, banheiros, vagas e área | — | **SOBREVIVEU** |
| E11b | `vitrine/src/templates/comum/secoes.tsx:51` | seção "Sobre" nunca renderizada | — | **SOBREVIVEU** |
| E11c | `catalogo-grade.tsx:54` | faixa "Destaques" mesmo sem destaque | e2e:470 | morto |
| E11d | `vitrine/src/templates/editorial/catalogo-editorial.tsx:57` | cabeçalho editorial usa o primeiro imóvel quando não há destaque | — | **SOBREVIVEU** |
| E13 | `vitrine/src/dados/cache.ts:24` | `lojaCacheada` sem `cacheTag` | `cache.test.ts:52` (passa no e2e: 47 de 47) | morto só no unitário |
| E16 | `vitrine/src/lib/contato.ts:24` | mensagem do item sem `toUpperCase` | `contato.test.ts:36`, `:49` | morto |
| E17 | `vitrine/src/item/pagina-item.tsx:74` | `alt` de toda foto com posição 1 | e2e:797 | morto |
| E18 | `vitrine/app/c/[slug]/imovel/[ref]/page.tsx:42` | `og:url` do imóvel em maiúsculas | e2e:712, e2e:837 | morto |

**Placar**: 22 mutantes, 18 mortos, 4 sobreviventes (E1, E11a, E11b, E11d). Os 8 alvos obrigatórios (9 mutantes, M7 em dois) morreram. Corte de visibilidade pela URL direta: não há mutante útil dentro de `vitrine/`, porque o papel só lê as views (o corte é da view, L16a); a prova é `vitrine-consultas.test.ts:135` e e2e:719-740. Ausência de PII: idem, estrutural (views e grants), provada por `vitrine-privilegios.test.ts:98-103` e pela varredura de sentinelas e2e:1012-1020.

### Lacunas (ranqueadas)

1. **Edge Case "loja desativada no CRM + aviso → página neutra" sem prova** (VCACHE-01). Nenhum teste faz a transição; `lojaCacheada` sem tag (E13) passa no e2e. Correção: asserção no e2e que, com `ctx.db`, desativa a vitrine de B, chama `POST /api/revalidar` para B, confere a página neutra em `/c/<B>` e restaura.
2. **VTEMA AC6 (editorial) sem prova**: E11d sobreviveu; a fixture não tem loja com imóveis e sem destaque. Correção: no e2e, tirar o destaque de B pelo banco, avisar, conferir que o cabeçalho não traz foto (e que a grade de A, com o mesmo truque, não traz a faixa) e restaurar.
3. **VCAT AC6 sem prova no card**: cidade, quartos, banheiros, vagas e área não são asseridos por HTTP (E11a sobreviveu). Correção: asserção no e2e do texto do card de um imóvel com valores distintos (como `CA-0006`) na grade e no editorial.
4. **"Sobre" sem prova** (VCAT AC1, VTEMA AC4, VTEMA AC5): E11b sobreviveu; o título institucional também não é asserido no corpo. Correção: asserção do `sobre` e do `titulo` da fixture no HTML visível de A e B.
5. **VOG AC5 "com o nome da loja" sem prova automatizada**: E1 sobreviveu (A ≠ B só pela cor). Correção: comparar o cartão de A com o de uma instância/loja de mesma cor e nome diferente, ou conferir que o nome entra no PNG (por exemplo, pixels de texto na área central diferentes do fundo).
6. Menores (precisão): teto de 6 destaques não exercitado (fixture com 3); "sem consultar o banco" do slug inválido só por código (a instância de banco inalcançável da T18 pode provar: slug inválido ali deve dar a página neutra, não "indisponível"); PNG não varrido por PII; aviso legal asserido só no catálogo; proporção do espaço sem foto e da foto quebrada só por captura.

### Rodada de correção 1 (F1) — lacunas do Verifier

As lacunas 1 a 5 e a maior parte das menores eram de prova, não de produto. Nenhum código de `vitrine/` mudou na correção: o `scripts/vitrine-e2e.ts` ganhou 8 asserções (V1 a V8), só com acréscimos, e passou de 47 para 55.

| Lacuna | Asserção nova |
| --- | --- |
| 1 loja desativada + aviso | V6: desativa a D no banco, confere que sem aviso a página segue do cache, avisa, confere a página neutra, o 404 do cartão e do imóvel, reativa, avisa e confere a volta |
| 2 VTEMA AC6 no editorial e grade | V4: A sem nenhum destaque (faixa omitida), A com 8 destaques (faixa com os 6 primeiros na ordem do catálogo), B sem destaque (nenhuma foto de cabeçalho, nenhum marcador) |
| 3 VCAT AC6 | V1: bairro, cidade, quartos, banheiros, vagas e área de cada imóvel da página 1 de A, e o resumo (com o singular) das linhas de B |
| 4 "Sobre" e título | V2: nome, título institucional e texto do Sobre de A e B; D (sem sobre) sem a seção |
| 5 VOG AC5, nome no cartão | V7: B recebe a cor e a cidade de A no banco; com tudo igual menos o nome, os dois PNGs têm de diferir |
| 6 menores | V3 (aviso legal no item e no imóvel indisponível), V5 (exatamente 24 → uma página, sem paginação, e `?pagina=2` mostra os mesmos 24), V8 (slug inválido com o banco inalcançável dá a página neutra, não "indisponível") |

Cada asserção que muda dado restaura o que mudou (`featured`, `published`, `updated_at`, `active`, cor e cidade) e avisa a vitrine de novo, em `finally`. Não corrigidas, por decisão: o PNG não é varrido por PII (a view não traz PII e o cartão só usa nome, cidade e UF) e a proporção do espaço sem foto e da foto quebrada seguem provadas só por captura.

**Sensor da correção** (cópia dos arquivos, restaurados): os cinco mutantes que sobreviveram na rodada 1 morrem, cada um por uma asserção própria. Cartão sem o nome da loja (V7); card sem quartos, banheiros, vagas e área (V1); "Sobre" nunca exibido (V2); editorial com foto no cabeçalho sem destaque (V4); `lojaCacheada` sem tag (V6). Com os cinco aplicados: 50 de 55 asserções, as 5 reprovadas são V1, V2, V4, V6 e V7. Sem mutante: 55 de 55.
