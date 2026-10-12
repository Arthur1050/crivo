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
- **Observação de ferramenta**: depois de o e2e construir, o servidor de desenvolvimento que já estava de pé respondeu 404 em rota nova; apagar `vitrine/.next` e reiniciar o `vitrine:dev` resolveu. A causa não está estabelecida (o Next 16 grava o dev em `.next/dev`; a revisão de lições manteve a L-079 como candidata).
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

## Validation — Verifier (janela C)

**Result**: PASS

**Histórico do veredito**: Rodada 1 (HEAD `f01b5d0`): reprovada por lacunas de prova (4 mutantes sobreviventes e 7 itens P1 sem prova; nenhum defeito de produto), corrigidas na rodada de correção F1 (`6b2d670`, registrada acima, em "Rodada de correção 1 (F1)"). Lacunas da rodada 1, na ordem: (1) Edge Case de loja desativada + aviso sem prova; (2) VTEMA AC6 no editorial sem prova (E11d); (3) VCAT AC6, atributos e cidade do card sem prova (E11a); (4) "Sobre" e título no corpo sem prova (E11b); (5) VOG AC5, nome no cartão sem prova (E1); (6) menores: teto de 6 destaques, "sem consultar o banco" do slug inválido, aviso legal fora do catálogo, PNG não varrido por PII, proporção só por captura. Rodada 2 (HEAD `6b2d670`): esta seção, reescrita pelo mesmo Verifier.

**Data**: 2026-10-12. **Verifier**: agente independente (não executou nenhuma task do lote). **Intervalo do diff**: `ddbf72d^..6b2d670` (T0–T26 e a F1; `677f29e`, renomeação para Krivo, fora do escopo). Foco: `vitrine/`, `scripts/vitrine-*.ts`, `scripts/__tests__/vitrine-*`, `src/lib/storefront-contract.ts`, `src/db/__tests__/vitrine-*`, `src/lib/__tests__/vitrine-*` e `storefront-*`. `git diff f01b5d0..6b2d670 --numstat`: só `scripts/vitrine-e2e.ts` (238 linhas acrescentadas, 0 removidas) e este arquivo; nenhum arquivo de `vitrine/` mudou desde a rodada 1.

**Motivo do veredito**: os 75 itens da spec (68 ACs e 7 Edge Cases) têm prova, 3 deles com precisão menor aceita; os 24 mutantes do sensor morrem no HEAD, inclusive os 8 alvos obrigatórios e os 5 que sobreviveram ou só morriam no unitário na rodada 1; nenhum defeito de produto.

**Linha de base medida pelo Verifier** (checkout limpo, um processo por vez): rodada 2, no `6b2d670`: `npm run vitrine:e2e` 55 de 55. Rodada 1, no `f01b5d0` (código de `vitrine/` idêntico ao do HEAD): `npx vitest run vitrine` + os 10 arquivos da raiz do lote (`vitrine-isolamento`, `vitrine-tipos-paridade`, `storefront-contract-parity`, `storefront-contract`, `vitrine-consultas`, `vitrine-views-paridade`, `vitrine-privilegios`, `vitrine-views`, `vitrine-dev`, `vitrine-fixture`): 22 arquivos, 180 testes verdes. Suíte completa, lint e `tsc` não foram rodados pelo Verifier (registro do executor: 238 arquivos/3813 testes; lint 0 erros; `tsc` com os 50 de linha de base). Linhas citadas como e2e:N são do `scripts/vitrine-e2e.ts` no `6b2d670`.
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
| VCAT-01 | AC1 | 200: e2e:234-237; imóveis: e2e:458-467; nome, título e "Sobre" no corpo: e2e:1045-1057 (V2) | `vitrine/src/templates/comum/secoes.tsx:36-60` | OK (F1; E11b morto por V2) |
| VCAT-01 | AC6 | foto, `alt` com tipo e bairro: e2e:545-552; link: e2e:458-465; preço: e2e:516, e2e:616; bairro, cidade, quartos, banheiros, vagas e área: e2e:1028-1043 (V1) | `vitrine/src/templates/grade/catalogo-grade.tsx:12-41`, `catalogo-editorial.tsx:18-47` | OK (F1; E11a morto por V1). Fraca: no editorial, `includes(imovel.cidade)` de e2e:1041 é satisfeito também pelo `og:description` do `<head>`; a cidade da linha de B não é provada, o resumo sim |
| VCAT-01 | AC7 | e2e:557-573 | `secoes.tsx:10-33` | OK |
| VCAT-01 | AC11 | `apresentacao.test.ts:13-29`; e2e:678 | `vitrine/src/lib/apresentacao.ts:10-13` | OK |
| VCAT-01 | AC12 | e2e:319-332 | `vitrine/app/c/[slug]/layout.tsx:67`, `:90-98` | OK |
| VCAT-02 | AC2 | e2e:458-467; `src/db/__tests__/vitrine-consultas.test.ts:152-165` | `vitrine/src/dados/consultas.ts:19-25` | OK |
| VCAT-02 | AC3 | e2e:458-471; `vitrine/src/lib/__tests__/catalogo.test.ts:21` | `vitrine/src/lib/catalogo.ts:7`, `:22-36`; `app/c/[slug]/page.tsx:84` | OK |
| VCAT-02 | AC4 | e2e:474-481; `catalogo.test.ts:27` | `catalogo.ts:24-28` | OK |
| VCAT-02 | AC5 | e2e:482-483; `catalogo.test.ts:33` | `catalogo.ts:27` | OK |
| VCAT-03 | AC8 | e2e:129-136, e2e:344-352; `catalogo.test.ts:52-67` | `layout.tsx:54`; `page.tsx:70` | OK (F1: e2e:1218-1233, V8 — com o banco inalcançável, slug inválido dá a página neutra e nenhum `[vitrine] erro` no log) |
| VCAT-03 | AC9 | e2e:222-232, e2e:344-352; `vitrine-consultas.test.ts:180-191` | `layout.tsx:65`; `vitrine/src/loja/nao-encontrado.tsx:9-19` | OK |
| VCAT-03 | AC10 | noindex: e2e:125, e2e:133, e2e:228; sem dado de imóvel: e2e:1250-1258 (sentinela do imóvel da loja inativa), e2e:743-747 | `app/layout.tsx:21` | OK |
| VITEM-01 | AC1 | e2e:667-688, e2e:690-701 | `vitrine/src/item/pagina-item.tsx:56-127` | OK |
| VITEM-01 | AC2 | e2e:703-718; `catalogo.test.ts:70-84`; `vitrine-consultas.test.ts:169-176` | `catalogo.ts:46-67`; `consultas.ts:28-44` | OK |
| VITEM-01 | AC6 | e2e:802-808, e2e:553-554 | `vitrine/src/templates/comum/foto-do-imovel.tsx:19-38` | **Parcial** — "mantendo a proporção" só por captura (`t23-03`, `t23-05`, `t21-01`) |
| VITEM-01 | AC7 | e2e:776-787 | `pagina-item.tsx:18-30` | OK |
| VITEM-01 | AC8 | e2e:789-800, e2e:545-552; `apresentacao.test.ts:57` | `vitrine/src/item/galeria-do-imovel.tsx:45`; `foto-do-imovel.tsx:27-32` | OK |
| VITEM-02 | AC3 | e2e:810-829; `vitrine/src/lib/__tests__/contato.test.ts:36` | `vitrine/src/lib/contato.ts:16-25`; `pagina-item.tsx:61` | OK |
| VITEM-02 | AC4 | `contato.test.ts:16`, `:21`; e2e:820 | `contato.ts:10-13` | OK |
| VITEM-02 | AC5 | e2e:354-374, e2e:720-741 | `app/c/[slug]/imovel/[ref]/page.tsx:83`, `:95`; `nao-encontrado.tsx:26-35` | OK |
| VSEG-01 | AC1 | `src/db/__tests__/vitrine-privilegios.test.ts:98-103`, `:166-185` | `views.ts:15-61` | OK |
| VSEG-01 | AC2 | `vitrine-consultas.test.ts:114-133`; e2e:754-774 | `consultas.ts:23`, `:38` | OK |
| VSEG-01 | AC3 | e2e:499-518, e2e:754-774 | idem | OK |
| VSEG-01 | AC4 | e2e:486-497, e2e:720-741; `vitrine-consultas.test.ts:135-148` | corte na view (L16a, AD-040) | OK |
| VSEG-01 | AC8 | `vitrine-consultas.test.ts:107`, `:114`, `:135` | `conexao.ts:12-14` | OK |
| VSEG-02 | AC5 | e2e:1250-1258 (HTML, `<head>` e log) | `opengraph-image.tsx:39-62` (só nome, cidade e UF) | **Parcial** — o PNG não é varrido (o harness guarda binário como texto vazio); a ausência de PII na imagem é só por código |
| VSEG-02 | AC6 | e2e:172-182 | `vitrine/app/api/revalidar/route.ts:19-49` | OK por inspeção: nenhum outro handler nem `use server` em `vitrine/` |
| VSEG-02 | AC7 | e2e:1244-1248; `vitrine/app/api/revalidar/__tests__/route.test.ts:110` | — | OK |
| VSEG-02 | Edge banco indisponível | e2e:378-407; `vitrine/src/dados/__tests__/erro-de-leitura.test.ts:17-60` | `vitrine/src/dados/erro-de-leitura.ts:10-38`; `vitrine/src/loja/indisponivel.tsx:11-32` | OK |
| VTEMA-01 | AC1 | `vitrine/src/tema/__tests__/tema-da-loja.test.ts:16`, `:24`, `:28` | `vitrine/src/tema/tema-da-loja.ts:30-46`; `tema-da-loja-provider.tsx:31` | OK |
| VTEMA-01 | AC2 | `tema-da-loja.test.ts:24`, `:33`; e2e:266-280 | `vitrine/src/tema/cor.ts:8-20` | OK |
| VTEMA-01 | AC3 | e2e:282-294; `tema-da-loja.test.ts:59`, `:68` | `tema-da-loja.ts:34-44`; `vitrine/src/tema/fontes.ts:15-30` | OK |
| VTEMA-01 | AC7 | e2e:234-280; `tema-da-loja.test.ts:75-108`, `:111` | `tema-da-loja.ts:60-66`; `tema-da-loja-provider.tsx:24-37` | OK |
| VTEMA-02 | AC4 | cards: e2e:520-529; faixa: e2e:466-467; teto de 6 com 8 destaques: e2e:1110-1123 (V4); paginação: e2e:575-584; "Sobre": e2e:1050-1051 (V2); rodapé: e2e:296-304 | `catalogo-grade.tsx:49-82`; `page.tsx:87-88` | OK (F1; E19 morto por V4, E11b por V2) |
| VTEMA-02 | AC5 | e2e:520-534; "Sobre": e2e:1050-1051 (V2) | `catalogo-editorial.tsx:56-90` | OK (F1) |
| VTEMA-02 | AC6 | grade: e2e:471, e2e:1103-1108 (V4, A sem destaque); editorial: e2e:1125-1133 (V4, B sem destaque: uma foto por linha, nenhuma no cabeçalho) | `catalogo-grade.tsx:54`; `catalogo-editorial.tsx:57`, `:63` | OK (F1; E11c e E11d mortos) |
| VTEMA-02 | AC8 | nenhum teste | inspeção: sem `style`, `className` arbitrário nem `<div>`/`<span>` em `vitrine/app` e `vitrine/src` fora de `opengraph-image.tsx:45-63` (Satori, exceção registrada na T24); `vitrine/app/globals.css:7-15` só imports e ordem de camadas | OK por inspeção |
| VTEMA-02 | AC9 | capturas `t16-02`, `t16-04`, `t17-02`, `t18-02`, `t21-06..08`, `t23-04..06`, `t25-02/04/06/08..14` | medições em `validation.md` (T16, T17, T18, T21, T23 e tabela da T25): `scrollWidth` = `clientWidth` ≤ 375 | OK (captura) |
| VLEGAL-01 | AC1 | catálogo A, B, D: e2e:296-304; item e imóvel indisponível, com o aviso: e2e:1059-1067 (V3) | `vitrine/src/rodape/rodape-legal.tsx:24-59` | OK |
| VLEGAL-01 | AC2 | e2e:306-317 | `rodape-legal.tsx:35-55` | OK |
| VLEGAL-01 | AC3 | e2e:309, e2e:314; `contato.test.ts:66` | `contato.ts:39-42` | OK |
| VLEGAL-01 | AC4 | e2e:310, e2e:315; `contato.test.ts:58` | `contato.ts:33-36` | OK |
| VOG-01 | AC1 | e2e:586-601, e2e:831-842, e2e:888-898 | `app/layout.tsx:8-19`; `page.tsx:26-44`; `imovel/[ref]/page.tsx:24-59` | OK |
| VOG-01 | AC2 | e2e:590-600; `apresentacao.test.ts:69-88` | `apresentacao.ts:81-89` | OK |
| VOG-01 | AC3 | e2e:835-836; `apresentacao.test.ts:89` | `apresentacao.ts:92-99` | OK |
| VOG-01 | AC4 | e2e:837, e2e:900-902 | `imovel/[ref]/page.tsx:32-35` | OK |
| VOG-01 | AC5 | PNG 1200×630 na cor da loja: e2e:905-924; sem saída: e2e:939-996 | `vitrine/app/c/[slug]/opengraph-image.tsx:25-68` | OK (F1: e2e:1198-1216, V7 — B com a cor, a cidade e a UF de A gera PNG diferente do de A, então o nome entra no cartão; E1 morto) |
| VOG-01 | AC6 | e2e:586-601, e2e:831-842 (UA do WhatsApp, `metaDoHead` lê só antes de `</head>`) | — | OK |
| VCACHE-01 | AC1 | `vitrine/src/dados/__tests__/cache.test.ts:52-61` | `vitrine/src/dados/cache.ts:21-43` | OK |
| VCACHE-01 | AC2 | `vitrine-isolamento.test.ts:173` | `next.config.ts:7-10` | OK |
| VCACHE-01 | AC8 | e2e:603-647 | `route.ts:36`; `cache.ts` | OK |
| VCACHE-01 | AC9 | e2e:629-635 (página antiga sem aviso) | `next.config.ts:9` | Parcial aceito — o teto de 300 s é provado só pela configuração |
| VCACHE-01 | Edge desativação + aviso | e2e:1170-1196 (V6: sem aviso segue do cache; com aviso, página neutra, cartão 404 e imóvel neutro; reativada volta) | `cache.ts:21-27`; corte da view (`src/db/__tests__/vitrine-views.test.ts:206`, L16a) | OK (F1; E13 morto por V6) |
| VCACHE-02 | AC3 | `route.test.ts:39`, `:46`; e2e:138-146, e2e:638-640 | `route.ts:36-38` | OK |
| VCACHE-02 | AC4 | e2e:148-161; `route.test.ts:52`, `:60`; `vitrine/src/__tests__/revalidacao.test.ts:39` | `revalidacao.ts:24-28`; `route.ts:21-28` | OK |
| VCACHE-02 | AC5 | e2e:163-170; `route.test.ts:72`; `revalidacao.test.ts:61-87` | `revalidacao.ts:36-50` | OK |
| VCACHE-02 | AC6 | e2e:172-182; `route.test.ts:80` | `route.ts:42-49` | OK |
| VCACHE-02 | AC7 | `revalidacao.test.ts:47` | `revalidacao.ts:28` | OK |
| VCACHE-02 | AC10 | e2e:184-189, e2e:1268-1273; `route.test.ts:89`, `:105` | `route.ts:26`, `:32`, `:37` | OK |
| VSEO-01 | AC1 | e2e:125, e2e:133, e2e:228, e2e:370, e2e:685, e2e:739 | `app/layout.tsx:21` | OK |
| VSEO-01 | AC2 | e2e:1237-1242 | `next.config.ts:14-24` | OK |
| VSEO-01 | AC3 | nenhum teste | inspeção: `git ls-files vitrine` sem `robots`, `sitemap` nem `public/` | OK por inspeção |

**Edge Cases**

| Edge Case | Teste (arquivo:linha) | Nota |
| --- | --- | --- |
| Exatamente 24 imóveis → uma página, sem paginação | e2e:1142-1168 (V5: A com 24 visíveis, sem paginação, `?pagina=2` com os mesmos 24); `catalogo.test.ts:13` | OK (F1; E20 morto por V5) |
| 25 imóveis → página 2 com 1 | e2e:469-470; `catalogo.test.ts:21` | OK |
| Foto quebrada mantém proporção e `alt` | captura `t21-01-grade-loja-a-desktop-foto-quebrada.jpg` | OK (captura) |
| `<script>` na descrição | e2e:776-787 | OK |
| `ap-0142` casa com `AP-0142` | `vitrine-consultas.test.ts:169-176`; e2e:703-713 | OK |
| Banco indisponível | e2e:378-407 | OK |
| Loja desativada + aviso → neutra | e2e:1170-1196 (V6) | OK (F1) |

Contagem: 75 itens (68 ACs + 7 Edge Cases). OK, inclusive por inspeção ou captura: 72. Parcial aceito (precisão menor, sem mutante sobrevivente, não bloqueia): 3 — VITEM AC6 (proporção só por captura), VSEG AC5 no PNG (o cartão só usa nome, cidade e UF, `opengraph-image.tsx:39-62`, e o papel não lê coluna de PII, `vitrine-privilegios.test.ts:98-103`) e VCACHE AC9 (teto de 300 s só pela configuração). Sem prova: 0.

**Revisão das asserções V1–V8** (rodada 2): todas usam valores da fixture ou do banco (fonte independente da implementação), não saídas da vitrine. V4 calcula a faixa esperada pela regra da spec (destaque → `updated_at` desc → referência) a partir das linhas do banco. As que mudam dado restauram em `finally` e avisam a vitrine de novo: V4 (`featured`, `published`, `updated_at` de A e B, e2e:1134-1139), V5 (`published` e `updated_at` de `AP-0001`, e2e:1161-1167), V6 (`active` de D, e2e:1191-1194; restaura para `true` fixo em vez do valor lido, que é o da fixture), V7 (cor de B, cidade e UF, e2e:1211-1215). Fracas, sem mudar o veredito: a cidade do editorial em V1 (ver VCAT AC6) e `>${nome}<` em V2 (e2e:1049), satisfeito também pelo link do cabeçalho do layout; o título e o "Sobre" em V2 são específicos. V7 prova que o nome altera o PNG, não que ele seja legível (a legibilidade está nas capturas `t24-01..03`).

### Sensor de discriminação

Método: cópia de cada arquivo em scratchpad, mutação no arquivo real, teste-alvo, restauração imediata e `git status --short` vazio conferido depois de cada rodada. E2E em rodadas (um processo por vez); os mutantes de uma mesma rodada caem em asserções distintas, citadas uma a uma. Nenhum teste foi editado. Rodada 1 no `f01b5d0` (M1 a E18); rodada 2 no `6b2d670`, em duas execuções do e2e: E1, E11a, E11b e E11d juntos (51 de 55; reprovaram só V1, V2, V4 e V7) e E13, E19 e E20 juntos (50 de 55; reprovaram só T21 de paginação, V4, V5, V6 e V7). Na segunda, V7 cai pelo E13 (a cor nova de B não chega ao cartão sem a tag da loja), não pelo E19 nem pelo E20.

| # | Arquivo | Mutação | Teste que matou | Desfecho |
| --- | --- | --- | --- | --- |
| M1 | `vitrine/src/dados/consultas.ts:23` | `imoveisDaLoja` sem `.where(eq(imoveis.lojaSlug, slug))` | `src/db/__tests__/vitrine-consultas.test.ts:114` (e mais 4 do arquivo) | morto |
| M2 | `vitrine/src/dados/cache.ts:24,32,40` | `cacheTag("tenant:vitrine:catalogo")` fixo | `vitrine/src/dados/__tests__/cache.test.ts:52` (as 3 funções) | morto |
| M3 | `vitrine/app/api/revalidar/route.ts:36` | `{ expire: 0 }` → `"max"` (stale-while-revalidate; a chamada de 1 argumento não compila no Next 16.2: o tipo exige o segundo) | `route.test.ts:39`; e por comportamento e2e:640 ("A depois do aviso: tem de refletir o banco") | morto |
| M4 | `vitrine/src/revalidacao.ts:28` | `===` no lugar de `timingSafeEqual` | `vitrine/src/__tests__/revalidacao.test.ts:47` | morto (só pelo espião: tempo constante não tem prova comportamental) |
| M5 | `vitrine/src/lib/contato.ts:12` | prefixo `55` também com 12 dígitos | `contato.test.ts:21`, `:58` | morto |
| M6 | `vitrine/src/lib/catalogo.ts:27` | sem `Math.min(pedida, totalPaginas)` | `catalogo.test.ts:33`, `:40`, `:46` | morto |
| M7a | `vitrine/next.config.ts:20` | sem o cabeçalho `X-Robots-Tag` | e2e:1237-1242 (Global X-Robots-Tag) | morto |
| M7b | `vitrine/app/layout.tsx:21` | sem `robots` no metadado do layout raiz | e2e:125, e2e:133, e2e:228, e2e:370, e2e:392, e2e:685, e2e:739 | morto |
| M8 | `vitrine/src/item/pagina-item.tsx:22-27` | descrição via `dangerouslySetInnerHTML` (com `<br/>`) | e2e:780 ("o `<script>` da descrição virou tag") | morto |
| E1 | `vitrine/app/c/[slug]/opengraph-image.tsx:59` | cartão sem o nome da loja | rodada 2: e2e:1210 (V7, "os PNGs saíram iguais") | sobreviveu na rodada 1; morto na rodada 2 |
| E2 | `vitrine/src/dados/consultas.ts:38` | `imovelPorReferencia` sem o filtro de slug | `vitrine-consultas.test.ts:114` (linha 131) | morto |
| E3 | `vitrine/app/c/[slug]/imovel/[ref]/page.tsx:32` | `og:image` = última foto | e2e:837 | morto |
| E5 | `vitrine/src/tema/tema-da-loja.ts:38` | nome do tema fixo `loja` | `tema-da-loja.test.ts:75`, `:86` | morto |
| E10 | `vitrine/src/lib/catalogo.ts:47` | link do imóvel sem `toLowerCase` | `catalogo.test.ts:71` | morto |
| E11a | `vitrine/src/templates/grade/catalogo-grade.tsx:36` | card sem quartos, banheiros, vagas e área | rodada 2: e2e:1035 (V1) | sobreviveu na rodada 1; morto na rodada 2 |
| E11b | `vitrine/src/templates/comum/secoes.tsx:51` | seção "Sobre" nunca renderizada | rodada 2: e2e:1050 (V2) | sobreviveu na rodada 1; morto na rodada 2 |
| E11c | `catalogo-grade.tsx:54` | faixa "Destaques" mesmo sem destaque | e2e:471 | morto |
| E11d | `vitrine/src/templates/editorial/catalogo-editorial.tsx:57` | cabeçalho editorial usa o primeiro imóvel quando não há destaque | rodada 2: e2e:1132 (V4, "5 !== 4" fotos de B) | sobreviveu na rodada 1; morto na rodada 2 |
| E13 | `vitrine/src/dados/cache.ts:24` | `lojaCacheada` sem `cacheTag` | `cache.test.ts:52`; rodada 2: e2e:1184 (V6, "depois do aviso: página neutra") e e2e:1209 (V7, preparo) | morto (na rodada 1, só no unitário) |
| E16 | `vitrine/src/lib/contato.ts:24` | mensagem do item sem `toUpperCase` | `contato.test.ts:36`, `:49` | morto |
| E17 | `vitrine/src/item/pagina-item.tsx:74` | `alt` de toda foto com posição 1 | e2e:798 | morto |
| E18 | `vitrine/app/c/[slug]/imovel/[ref]/page.tsx:42` | `og:url` do imóvel em maiúsculas | e2e:713, e2e:838 | morto |
| E19 | `vitrine/app/c/[slug]/page.tsx:88` | teto de 6 destaques removido (`slice(0, MAXIMO_DE_DESTAQUES + 100)`) | rodada 2: e2e:1123 (V4, faixa com os 8) | morto |
| E20 | `vitrine/app/c/[slug]/page.tsx:95` | paginação montada também com uma página só (`totalPaginas >= 1`) | rodada 2: e2e:1158 (V5, A com 24) e e2e:583 (T21, B com 4) | morto |

**Placar** (rodada 2): 24 mutantes, 24 mortos. Os 8 alvos obrigatórios (9 mutantes, M7 em dois) morreram já na rodada 1; os 4 sobreviventes da rodada 1 (E1, E11a, E11b, E11d) e o E13 morrem no e2e do HEAD, cada um por uma asserção própria. Corte de visibilidade pela URL direta: não há mutante útil dentro de `vitrine/`, porque o papel só lê as views (o corte é da view, L16a); a prova é `vitrine-consultas.test.ts:135` e e2e:720-741. Ausência de PII: idem, estrutural (views e grants), provada por `vitrine-privilegios.test.ts:98-103` e pela varredura de sentinelas e2e:1250-1258.

### Lacunas (ranqueadas)

Nenhuma bloqueante. As 5 lacunas da rodada 1 e as menores de prova foram fechadas pela F1 (V1 a V8), conferidas acima. Ficam, aceitas e sem mutante sobrevivente: a proporção do espaço sem foto e da foto quebrada provada só por captura; o PNG do cartão não varrido por PII (proteção estrutural); o teto de 300 s do perfil provado só pela configuração; e as duas asserções fracas apontadas na revisão de V1 e V2.

## Validation — Verifier independente (reverificação final, HEAD b2af87b)

**Result**: FAIL

**Data**: 2026-10-12. **Verifier**: agente novo e independente; não executou task do lote nem participou das rodadas anteriores. A avaliação abaixo foi formada a partir da spec, do código e de execuções próprias, antes de ler as seções anteriores deste arquivo; nenhuma conclusão delas foi usada como evidência.

**Intervalo do diff**: `ddbf72d^..b2af87b` (T0–T26 e a F1; `677f29e`, renomeação para Krivo, fora do escopo). Superfície: `vitrine/`, `scripts/vitrine-*.ts`, `scripts/__tests__/vitrine-*`, `src/lib/storefront-contract.ts`, `src/db/__tests__/vitrine-*`, `src/lib/__tests__/vitrine-*` e `storefront-*`. Os commits depois de `6b2d670` só mexem em `.specs/`.

**Motivo do veredito**: nenhum defeito de produto encontrado; o código cumpre os 75 itens por inspeção. Mas, pela regra evidence-or-zero, 3 ACs não têm teste que prove o valor da spec (VSEG AC6, VTEMA AC8, VSEO AC3) e 2 ACs P1 têm uma metade sem prova (VTEMA AC1 `mode="light"`, VTEMA AC3 fonte declarada no `<html>`). Cada uma dessas 5 lacunas foi confirmada por um mutante que SOBREVIVEU a toda a suíte do lote (unitários, banco e e2e). As rodadas anteriores aceitaram VSEG AC6, VTEMA AC8 e VSEO AC3 "por inspeção"; este Verifier não aceita inspeção como prova. Os 8 alvos obrigatórios do sensor morrem.

**Linha de base medida por este Verifier** (HEAD limpo, um processo de teste por vez): `npm run vitrine:e2e` 55 de 55 (antes de qualquer mutação, e de novo no fim, depois de restaurar tudo, para reconstruir `vitrine/.next` a partir do HEAD); `npx vitest run vitrine/` + `vitrine-isolamento`, `vitrine-tipos-paridade`, `storefront-contract-parity`, `vitrine-consultas`, `vitrine-views-paridade`, `vitrine-privilegios`, `scripts/__tests__/vitrine-dev`, `scripts/__tests__/vitrine-fixture`: 19 arquivos, 153 testes verdes. Suíte completa, lint e `tsc` não foram rodados (fora do escopo pedido). Linhas `e2e:N` são de `scripts/vitrine-e2e.ts` no HEAD.

### Cobertura por requisito e AC

Legenda: **OK** = teste cujo valor asserido é o da spec; **Parcial** = parte provada por teste, parte só por código ou captura; **Captura** = AC visual provado por captura real e medição registrada; **Sem prova** = nenhum teste prova o valor (nota zero).

| Req. | AC | Teste (arquivo:linha) | Código (arquivo:linha) | Nota |
| --- | --- | --- | --- | --- |
| VPROJ-01 | AC1 | `src/lib/__tests__/vitrine-isolamento.test.ts:164-171` | `vitrine/package.json:5-11`, `vitrine/next.config.ts`, `vitrine/tsconfig.json`, `vitrine/eslint.config.mjs` | OK |
| VPROJ-01 | AC2 | `vitrine-isolamento.test.ts:173-176` | `vitrine/next.config.ts:6` | OK |
| VPROJ-01 | AC3 | `vitrine-isolamento.test.ts:182-187` | ausência de `proxy.ts`/`middleware.ts` | OK |
| VPROJ-01 | AC4 | `vitrine-isolamento.test.ts:98-153` (a regra recusa), `:189-199` (varredura real) | — | OK |
| VPROJ-01 | AC5 | `vitrine-isolamento.test.ts:210-219`, `:221-225` | `tsconfig.json:33` e `eslint.config.mjs:18` da raiz | OK |
| VPROJ-01 | AC6 | `vitrine/src/db/__tests__/conexao.test.ts:9-23`, `:25-35`; e2e:381-383 (troca só `VITRINE_DATABASE_URL` e a app perde o banco) | `vitrine/src/db/conexao.ts:25-33` | OK |
| VPROJ-02 | AC7 | `src/lib/__tests__/storefront-contract-parity.test.ts:23-51` | `vitrine/src/contrato.ts:11-63` | OK |
| VPROJ-02 | AC8 | `storefront-contract-parity.test.ts:40-45`; `src/db/__tests__/vitrine-views-paridade.test.ts:37-47` | `vitrine/src/db/views.ts:17-58` | OK |
| VCAT-01 | AC1 | 200: e2e:237; imóveis: e2e:458-467; nome, título e Sobre: e2e:1045-1057 | `app/c/[slug]/page.tsx:66-101`; `vitrine/src/templates/comum/secoes.tsx:36-60` | OK |
| VCAT-01 | AC6 | foto e `alt`: e2e:545-552; link: e2e:458-465; preço: e2e:516-517; bairro, cidade e atributos: e2e:1028-1043 | `vitrine/src/templates/grade/catalogo-grade.tsx:12-41`; `editorial/catalogo-editorial.tsx:18-47` | Parcial — o tipo só é asserido dentro do `alt` da foto (e2e:552); o texto "Apartamento · Usado · AP-…" do card não é asserido; no editorial `includes(imovel.cidade)` (e2e:1041) também casa com o `og:description` do `<head>` |
| VCAT-01 | AC7 | e2e:557-573 | `secoes.tsx:10-33` | OK |
| VCAT-01 | AC11 | `vitrine/src/lib/__tests__/apresentacao.test.ts:14-28`; e2e:678 | `vitrine/src/lib/apresentacao.ts:10-13` | OK |
| VCAT-01 | AC12 | e2e:319-332 | `app/c/[slug]/layout.tsx:67`, `:90-98` | OK |
| VCAT-02 | AC2 | e2e:458-467; `src/db/__tests__/vitrine-consultas.test.ts:152-165` | `vitrine/src/dados/consultas.ts:19-25` | OK |
| VCAT-02 | AC3 | e2e:458-471; `vitrine/src/lib/__tests__/catalogo.test.ts:13-25` | `vitrine/src/lib/catalogo.ts:7`, `:22-36` | OK |
| VCAT-02 | AC4 | e2e:474-481; `catalogo.test.ts:27-31` | `catalogo.ts:24-28` | OK |
| VCAT-02 | AC5 | e2e:482-483; `catalogo.test.ts:33-38` | `catalogo.ts:27` | OK |
| VCAT-03 | AC8 | e2e:129-136, e2e:1218-1233 (banco inalcançável: página neutra, sem `[vitrine] erro`); `catalogo.test.ts:52-67` | `layout.tsx:54`; `page.tsx:70`; `imovel/[ref]/page.tsx:81` | OK |
| VCAT-03 | AC9 | e2e:222-232, e2e:344-352, e2e:926-937; `vitrine-consultas.test.ts:180-191` | `layout.tsx:65`; `vitrine/src/loja/nao-encontrado.tsx:9-19` | OK |
| VCAT-03 | AC10 | noindex: e2e:125, :133, :228; sem imóvel: sentinela do imóvel da loja inativa C na varredura global e2e:1250-1258 | `app/layout.tsx:21`; `nao-encontrado.tsx:9-19` | OK |
| VITEM-01 | AC1 | e2e:667-688, e2e:690-701 | `vitrine/src/item/pagina-item.tsx:56-127` | OK |
| VITEM-01 | AC2 | e2e:703-718; `catalogo.test.ts:70-79`; `vitrine-consultas.test.ts:169-176` | `catalogo.ts:46-67`; `consultas.ts:28-44` | OK |
| VITEM-01 | AC6 | e2e:802-808, e2e:553-554; captura `t23-05`, `t23-03` | `vitrine/src/templates/comum/foto-do-imovel.tsx:19-38` | Parcial — ícone e texto por teste; "mantendo a proporção" só por captura |
| VITEM-01 | AC7 | e2e:776-787 | `pagina-item.tsx:18-30` | OK |
| VITEM-01 | AC8 | e2e:789-800, e2e:545-552; `apresentacao.test.ts:57-66` | `vitrine/src/item/galeria-do-imovel.tsx:45`; `foto-do-imovel.tsx:27-32` | OK |
| VITEM-02 | AC3 | e2e:810-829; `vitrine/src/lib/__tests__/contato.test.ts:36-41` | `vitrine/src/lib/contato.ts:16-25`; `pagina-item.tsx:61` | OK |
| VITEM-02 | AC4 | `contato.test.ts:16-24`; e2e:820 | `contato.ts:10-13` | OK |
| VITEM-02 | AC5 | e2e:354-374, e2e:720-741 | `imovel/[ref]/page.tsx:83`, `:95`; `nao-encontrado.tsx:26-35` | OK |
| VSEG-01 | AC1 | `src/db/__tests__/vitrine-privilegios.test.ts:98-103`, `:166-183` | `views.ts:15-58`; `consultas.ts:13-44` | OK |
| VSEG-01 | AC2 | `vitrine-consultas.test.ts:114-133`; e2e:754-774 | `consultas.ts:23`, `:38` | OK |
| VSEG-01 | AC3 | e2e:499-518, e2e:754-774 | idem | OK |
| VSEG-01 | AC4 | e2e:486-497, e2e:720-741; `vitrine-consultas.test.ts:135-148` | corte na view (L16a, AD-040) | OK |
| VSEG-01 | AC8 | `vitrine-consultas.test.ts:107-111`, `:114-148` | `conexao.ts:12-14` | OK |
| VSEG-02 | AC5 | e2e:1250-1258 (sentinelas de logradouro, número, complemento, captador e lead no HTML, no `<head>` e no log) | `opengraph-image.tsx:39-63` | Parcial — o PNG não é varrido (o harness guarda binário como texto vazio, e2e:1444); proteção estrutural (o papel não lê PII, `vitrine-privilegios.test.ts:98-103`) |
| VSEG-02 | AC6 | só o subconjunto da própria rota: e2e:172-182, `vitrine/app/api/revalidar/__tests__/route.test.ts:80-87` | `vitrine/app/api/revalidar/route.ts:19-49` (único handler; nenhum `use server` em `vitrine/`) | **Sem prova** — nenhum teste afirma "não há outra rota que aceite escrita"; o mutante S2 (segunda rota com `POST` → 204) sobrevive a tudo |
| VSEG-02 | AC7 | e2e:1244-1248; `route.test.ts:110-118` | — | OK |
| VSEG-02 | Edge banco indisponível | e2e:378-407; `vitrine/src/dados/__tests__/erro-de-leitura.test.ts:17-42` | `vitrine/src/dados/erro-de-leitura.ts:10-38`; `vitrine/src/loja/indisponivel.tsx:11-32` | OK |
| VTEMA-01 | AC1 | `defineTheme` do neutro com a cor como accent: `vitrine/src/tema/__tests__/tema-da-loja.test.ts:16-31`; wrapper `data-astryx-theme`: e2e:250-254 | `vitrine/src/tema/tema-da-loja.ts:30-46`; `tema-da-loja-provider.tsx:31` | Parcial — `mode="light"` não é asserido: o mutante S4 (`mode="dark"`) sobrevive |
| VTEMA-01 | AC2 | `tema-da-loja.test.ts:24-26`, `:33-41`; e2e:266-280 (D sem cor) | `vitrine/src/tema/cor.ts:8-20` | OK |
| VTEMA-01 | AC3 | `--font-family-*` = `var(--font-<fonte>)` no HTML: e2e:282-294; `tema-da-loja.test.ts:59-71`; captura `t21-01` (serifa da Lora) | `tema-da-loja.ts:34-44`; `vitrine/src/tema/fontes.ts:15-30`; `app/layout.tsx:29` | Parcial — nenhum teste afirma que o `<html>` declara as variáveis `--font-*`: o mutante S5 (sem a classe das fontes no `<html>`) sobrevive; a fonte aplicada só aparece em captura |
| VTEMA-01 | AC7 | e2e:234-280; `tema-da-loja.test.ts:75-102` | `tema-da-loja.ts:60-66`; `tema-da-loja-provider.tsx:24-37` | OK |
| VTEMA-02 | AC4 | e2e:520-529, e2e:466-467, e2e:1110-1123 (teto de 6), e2e:575-584, e2e:1050-1051, e2e:296-304 | `catalogo-grade.tsx:49-82`; `page.tsx:87-88` | OK |
| VTEMA-02 | AC5 | e2e:520-534, e2e:1050-1051 | `catalogo-editorial.tsx:56-90` | OK |
| VTEMA-02 | AC6 | e2e:1103-1108 (grade), e2e:1125-1133 (editorial) | `catalogo-grade.tsx:54`; `catalogo-editorial.tsx:57`, `:63` | OK |
| VTEMA-02 | AC8 | nenhum teste | inspeção: `style` só em `opengraph-image.tsx:45-63` (Satori); `globals.css:7-15` só camadas e imports | **Sem prova** — o mutante S3 (`<h2 style={{…}}>` cru na página do imóvel) sobrevive a tudo |
| VTEMA-02 | AC9 | capturas `t16-02`, `t16-04`, `t17-02`, `t18-02`, `t21-06..08`, `t23-04..06`, `t25-02/04/06/08..14` (conferi `t25-02` e `t23-05`) | tabela de larguras da T25 neste arquivo: `scrollWidth` = `clientWidth` = 375 nas 7 páginas | Captura |
| VLEGAL-01 | AC1 | e2e:296-304, e2e:1059-1067, e2e:368-369 | `vitrine/src/rodape/rodape-legal.tsx:24-59` | OK |
| VLEGAL-01 | AC2 | e2e:306-317 | `rodape-legal.tsx:35-55` | OK |
| VLEGAL-01 | AC3 | e2e:309, e2e:314; `contato.test.ts:66-71` | `contato.ts:39-42` | OK |
| VLEGAL-01 | AC4 | e2e:310, e2e:315; `contato.test.ts:58-64` | `contato.ts:33-36` | OK |
| VOG-01 | AC1 | e2e:586-601, e2e:831-842, e2e:888-898 | `app/layout.tsx:8-19`; `page.tsx:26-44`; `imovel/[ref]/page.tsx:24-59` | OK |
| VOG-01 | AC2 | e2e:590-600; `apresentacao.test.ts:69-87` | `apresentacao.ts:81-89` | OK |
| VOG-01 | AC3 | e2e:835-836; `apresentacao.test.ts:89-103` | `apresentacao.ts:92-99` | OK |
| VOG-01 | AC4 | e2e:837, e2e:899-902 | `imovel/[ref]/page.tsx:32-35` | OK |
| VOG-01 | AC5 | e2e:905-924, e2e:939-996, e2e:1198-1216 | `vitrine/app/c/[slug]/opengraph-image.tsx:25-68` | OK |
| VOG-01 | AC6 | e2e:586-601, e2e:831-842 (`metaDoHead` lê só antes de `</head>`) | — | OK |
| VCACHE-01 | AC1 | `vitrine/src/dados/__tests__/cache.test.ts:52-66` | `vitrine/src/dados/cache.ts:21-43` | OK |
| VCACHE-01 | AC2 | `vitrine-isolamento.test.ts:173-176` | `next.config.ts:7-10` | OK |
| VCACHE-01 | AC8 | e2e:603-647 | `route.ts:36`; `cache.ts:24`, `:32`, `:40` | OK |
| VCACHE-01 | AC9 | e2e:629-635, e2e:1180 | `next.config.ts:9` | Parcial — "até o perfil expirar" (300 s) só pela configuração |
| VCACHE-01 | Edge desativação + aviso | e2e:1170-1196 | `cache.ts:21-27` | OK |
| VCACHE-02 | AC3 | `route.test.ts:39-50`; e2e:138-146, e2e:638-640 | `route.ts:36-38` | OK |
| VCACHE-02 | AC4 | `route.test.ts:52-70`; `vitrine/src/__tests__/revalidacao.test.ts:39-45`; e2e:148-161 | `vitrine/src/revalidacao.ts:20-29`; `route.ts:21-28` | OK |
| VCACHE-02 | AC5 | `route.test.ts:72-78`; `revalidacao.test.ts:61-87`; e2e:163-170 | `revalidacao.ts:36-50` | OK |
| VCACHE-02 | AC6 | `route.test.ts:80-87`; e2e:172-182 | `route.ts:42-49` | OK |
| VCACHE-02 | AC7 | `revalidacao.test.ts:47-53` | `revalidacao.ts:28` | OK |
| VCACHE-02 | AC10 | `route.test.ts:89-108`; e2e:184-189, e2e:1268-1273 | `route.ts:26`, `:32`, `:37` | OK |
| VSEO-01 | AC1 | e2e:125, :133, :228, :370, :392, :685, :739 | `app/layout.tsx:21` | OK |
| VSEO-01 | AC2 | e2e:1237-1242 | `next.config.ts:20` | OK |
| VSEO-01 | AC3 | nenhum teste (nenhum pedido a `/robots.txt` nem `/sitemap.xml`) | inspeção: sem `robots.*`, `sitemap.*` nem `public/` em `vitrine/` | **Sem prova** — o mutante S1 (`app/robots.ts` com `Disallow: /` e `sitemap`) sobrevive a tudo |

**Edge Cases**

| Edge Case | Teste (arquivo:linha) | Nota |
| --- | --- | --- |
| Exatamente 24 → uma página, sem paginação | e2e:1142-1168; `catalogo.test.ts:13-19` | OK |
| 25 → página 2 com 1 | e2e:469-470; `catalogo.test.ts:21-25` | OK |
| Foto quebrada mantém proporção e `alt` | captura `t21-01-grade-loja-a-desktop-foto-quebrada.jpg` (conferida: moldura 4:3 mantida, `alt` visível) | Captura |
| `<script>` na descrição | e2e:776-787 | OK |
| `ap-0142` casa com `AP-0142` | `vitrine-consultas.test.ts:169-176`; e2e:703-713 | OK |
| Banco indisponível | e2e:378-407; `erro-de-leitura.test.ts:17-32` | OK |
| Loja desativada + aviso → neutra | e2e:1170-1196 | OK |

**Contagem** (75 itens: 68 ACs e 7 Edge Cases): OK 64; Captura 2 (VTEMA AC9, foto quebrada); Parcial 6 (VCAT AC6, VITEM AC6, VSEG AC5, VTEMA AC1, VTEMA AC3, VCACHE AC9); **Sem prova 3** (VSEG AC6, VTEMA AC8, VSEO AC3).

### Sensor de discriminação

Método: para cada mutante, cópia do arquivo em `scratchpad/verifier2/`, mutação no arquivo real, teste-alvo, restauração imediata da cópia (ou remoção do arquivo criado) e `git status --short` vazio conferido antes do próximo. Um processo de teste por vez; um mutante por execução do e2e. Nenhum teste foi editado. M3 no Next 16.2: a forma sem o 2º argumento não compila; usado o perfil `"max"` (stale-while-revalidate), que compila (`tsc --noEmit` da vitrine sem erro) e é o comportamento equivalente a "sem expirar já".

| # | Arquivo | Mutação | Teste que matou | Desfecho |
| --- | --- | --- | --- | --- |
| M1 | `vitrine/src/dados/consultas.ts:23` | `imoveisDaLoja` sem `.where(eq(imoveis.lojaSlug, slug))` | `vitrine-consultas.test.ts:123` (e mais 4 do arquivo) | morto |
| M2 | `vitrine/src/dados/cache.ts:24,32,40` | `cacheTag("tenant:catalogo")` fixo, sem o slug | `cache.test.ts:57` (as 3 funções) | morto |
| M3 | `vitrine/app/api/revalidar/route.ts:36` | `{ expire: 0 }` → `"max"` | `route.test.ts:43`; e2e:640 (T21 cache, "A depois do aviso"), e V4, V5, V6 | morto |
| M4 | `vitrine/src/revalidacao.ts:28` | `===` no lugar de `timingSafeEqual` | `revalidacao.test.ts:49` (espião) | morto |
| M5 | `vitrine/src/lib/contato.ts:12` | prefixo `55` também com 12 dígitos | `contato.test.ts:22`, `:59` | morto |
| M6 | `vitrine/src/lib/catalogo.ts:27` | sem `Math.min(pedida, totalPaginas)` | `catalogo.test.ts:35`, `:43`, `:47` | morto |
| M7a | `vitrine/next.config.ts:20` | sem o cabeçalho `X-Robots-Tag` | e2e:1240 (Global X-Robots-Tag) | morto |
| M7b | `vitrine/app/layout.tsx:21` | sem `robots` no metadado do layout raiz | e2e:125, :133, :228, :370, :392, :685, :739 (7 asserções) | morto |
| M8 | `vitrine/src/item/pagina-item.tsx:122` | descrição via `dangerouslySetInnerHTML` com `<br/>` | e2e:780 ("o `<script>` da descrição virou tag") | morto |
| E1 | `consultas.ts:38` | `imovelPorReferencia` sem o filtro de slug (isolamento na página do imóvel) | `vitrine-consultas.test.ts:131` | morto |
| E2 | `vitrine/app/c/[slug]/imovel/[ref]/page.tsx:32` | `og:image` ignora a primeira foto (sempre o cartão herdado) | e2e:837 | morto |
| E3 | `vitrine/app/c/[slug]/opengraph-image.tsx:39` | cartão sempre na cor padrão | e2e:918 (T24), e2e:1209 (V7) | morto |
| E4 | `vitrine/src/tema/tema-da-loja.ts:35` | tema ignora a cor da loja | `tema-da-loja.test.ts:21` | morto |
| E5 | `vitrine/src/dados/erro-de-leitura.ts:36` | `lerDoBanco` relança o erro original do driver (SQL e host) | `erro-de-leitura.test.ts:20`, `:36`, `:51` | morto |
| E7 | `vitrine/app/c/[slug]/layout.tsx:54` | layout sem a validação do slug (consulta o banco) | e2e:1226 (V8) | morto |
| E8 | `vitrine/app/c/[slug]/page.tsx:95` | paginação com uma página só (`>= 1`) | e2e:583 (T21), e2e:1158 (V5) | morto |
| E9 | `page.tsx:88` | faixa com até 8 destaques | e2e:1123 (V4) | morto |
| E10 | `route.ts:25` | autenticação ignorada (`!autorizado && false`) | `route.test.ts:55`, `:64`, `:98` | morto |
| E12 | `consultas.ts:24` | ordem sem o destaque primeiro | `vitrine-consultas.test.ts:164` | morto |
| E14 | `catalogo.ts:65` | referência da URL sem `toLowerCase` | `catalogo.test.ts:77` | morto |
| E15 | `imovel/[ref]/page.tsx:42` | `og:url` com a referência em maiúsculas | e2e:713, e2e:838 | morto |
| E16 | `vitrine/src/tema/tema-da-loja-provider.tsx:33` | sem o `<style>` do tema no HTML do servidor | e2e:242, :271, :288, :540 | morto |
| S1 | `vitrine/app/robots.ts` (criado e removido) | `robots.txt` com `Disallow: /` e `sitemap` (VSEO AC3) | nenhum: unitários 98 de 98, e2e 55 de 55 | **SOBREVIVEU** |
| S2 | `vitrine/app/api/escrever/route.ts` (criado e removido) | segunda rota com `POST` que lê o corpo e responde 204 (VSEG AC6) | nenhum: unitários 98 de 98, e2e 55 de 55 | **SOBREVIVEU** |
| S3 | `pagina-item.tsx:121` | `<h2 style={{ color, padding }}>` cru no lugar do `Heading` (VTEMA AC8) | nenhum: unitários 98 de 98, e2e 55 de 55 | **SOBREVIVEU** |
| S4 | `tema-da-loja-provider.tsx:31` | `<Theme mode="dark">` (VTEMA AC1) | nenhum: tema 16 de 16, e2e 55 de 55 | **SOBREVIVEU** |
| S5 | `vitrine/app/layout.tsx:29` | `<html>` sem a classe que declara `--font-*` (VTEMA AC3) | nenhum: e2e 55 de 55 | **SOBREVIVEU** |

**Placar**: 27 mutantes, 22 mortos, 5 sobreviventes. Os 8 alvos obrigatórios (9 mutantes, M7 em dois) morrem; os 13 extras escolhidos em T22–T24 e no tema/cache/isolamento morrem. Os 5 sobreviventes foram desenhados para sondar ACs que este Verifier achou sem prova, e confirmam as lacunas. Corte de visibilidade pela URL direta: não há mutante útil dentro de `vitrine/` (o papel só lê as views; o corte é da view, L16a); a prova é `vitrine-consultas.test.ts:135-148` e e2e:720-741, e o isolamento por slug na página do imóvel foi sondado por E1.

### Lacunas (ranqueadas)

Todas são de prova; o código do HEAD cumpre cada item por inspeção. Nenhuma pede mudança em `vitrine/`, só testes.

1. **VSEG AC6 sem prova** (P1, segurança): nenhum teste afirma que `POST /api/revalidar` é a única rota que aceita escrita. Fechar com um teste estrutural na suíte raiz (todo `route.ts` sob `vitrine/app` é `api/revalidar/route.ts`, que só exporta `POST` como escrita; nenhum `"use server"` em `vitrine/`) e/ou e2e com `POST` em `/c/<slug>` e `/c/<slug>/imovel/<ref>` sem efeito. Mutante S2 sobrevive.
2. **VSEO AC3 sem prova** (P2): o e2e não pede `/robots.txt` nem `/sitemap.xml`. Fechar com asserção e2e: `/sitemap.xml` → 404 e `/robots.txt` → 404 ou sem `Disallow`. Mutante S1 sobrevive.
3. **VTEMA AC8 sem prova** (P1): nenhum teste varre `style=`, `<div>`/`<span>` de layout ou CSS próprio em `vitrine/app` e `vitrine/src` (fora de `opengraph-image.tsx`, a exceção do Satori registrada na T24). Fechar com um teste estrutural na suíte raiz. Mutante S3 sobrevive.
4. **VTEMA AC1 parcial**: `mode="light"` do `<Theme>` da loja não é asserido. Fechar com asserção sobre o atributo de modo que o `<Theme>` emite no wrapper (ou sobre `color-scheme`). Mutante S4 sobrevive.
5. **VTEMA AC3 parcial**: o tema aponta para `var(--font-<fonte>)`, mas nada prova que o `<html>` declara essas variáveis; sem a classe, a fonte da loja não se aplica e o e2e segue verde. Fechar com asserção e2e de que a classe do `<html>` declara `--font-<fonte da loja>` (o CSS do `next/font` no HTML define a variável). Mutante S5 sobrevive.
6. Menores, aceitáveis sem bloquear depois das 5 acima: tipo do card só pelo `alt` e cidade do editorial satisfeita também pelo `<head>` (VCAT AC6); proporção do espaço sem foto só por captura (VITEM AC6); PNG do cartão não varrido por PII (VSEG AC5, proteção estrutural); teto de 300 s só pela configuração (VCACHE AC9).

### Rodada de correção 2 (F2) — lacunas do Verifier independente

A reverificação por um agente novo (sem contexto anterior) reprovou o HEAD `b2af87b`, de novo por prova e não por produto: 5 itens sem teste (VSEG AC6, VTEMA AC8, VSEO AC3, VTEMA AC1, VTEMA AC3), cada um com um mutante que sobreviveu à suíte. As rodadas anteriores tinham aceitado três deles "por inspeção". Nenhum código de `vitrine/` mudou.

| Lacuna | Prova nova |
| --- | --- |
| VSEG AC6, só `POST /api/revalidar` aceita escrita | `src/lib/__tests__/vitrine-superficie.test.ts`: um único `route.ts` em `app/`, exportando só POST e os quatro métodos que respondem 405, e nenhuma server action; e2e V10: POST em rotas de API plausíveis → 404 e PUT, PATCH e DELETE em `/api/revalidar` → 405 |
| VTEMA AC8, sem `style`, `<div>` de layout nem CSS à mão | mesmo teste: nenhum `style=`, `<div>`, `<span>` ou `dangerouslySetInnerHTML` em `app/` e `src/`, fora o cartão de compartilhamento (Satori), `<style>` só no provedor do tema e `globals.css` só com `@layer` e `@import` |
| VSEO AC3, sem sitemap nem `Disallow` | mesmo teste (nenhum `robots`/`sitemap` em `app/` ou `public/`, nenhum `Disallow` no código); e2e V9: `/robots.txt`, `/sitemap.xml` e variantes → 404 sem `Disallow` nem `urlset` |
| VTEMA AC1, `mode="light"` | e2e V11: o wrapper de A, B e D traz `data-theme="light"`, o `<html>` também e nada fica em `dark`; o teste estático confere o `<Theme ... mode="light">` |
| VTEMA AC3, fonte no HTML | e2e V12: o `<html>` declara a classe `__variable` das 4 fontes e as folhas de estilo da página definem `--font-<fonte>` |

Sensor da correção (cópia dos arquivos, restaurados): `robots.ts` com `Disallow` (V9 e estático), segunda rota com POST (estático), `style` cru num título (estático), `mode="dark"` (V11 e estático) e o `<html>` sem a classe das fontes (V12) morrem. Com os cinco aplicados: 5 de 10 testes estáticos reprovam e 3 das 59 asserções do e2e reprovam. Sem mutante: 10 de 10 e 59 de 59.

## Validation — Terceira verificação independente (HEAD 06a9175)

**Result**: FAIL

Verifier novo, sem contexto das rodadas anteriores: avaliação formada a partir da spec, do código e da execução dos testes; só depois comparada com as duas verificações acima. Regra evidence-or-zero: cada item precisa de um teste cujo valor asserido seja o da spec (ou captura, onde só o olho prova).

- **Intervalo**: `git log --oneline ddbf72d^..06a9175` (38 commits; `677f29e`, renomeação de marca, ignorado). Código: `vitrine/`, `scripts/vitrine-*.ts`, `scripts/__tests__/vitrine-*`, `src/lib/storefront-contract.ts`, `src/db/__tests__/vitrine-*`, `src/lib/__tests__/vitrine-*` e `storefront-*`.
- **Execução no HEAD limpo**: `npm run vitrine:e2e` → 59 de 59; `npx vitest run vitrine src/lib/__tests__/vitrine-isolamento.test.ts src/lib/__tests__/vitrine-superficie.test.ts src/lib/__tests__/storefront-contract-parity.test.ts src/lib/__tests__/vitrine-tipos-paridade.test.ts src/db/__tests__/vitrine-consultas.test.ts src/db/__tests__/vitrine-views-paridade.test.ts src/db/__tests__/vitrine-privilegios.test.ts src/db/__tests__/vitrine-views.test.ts scripts/__tests__/vitrine-dev.test.ts scripts/__tests__/vitrine-fixture.test.ts` → 22 arquivos, 186 de 186.
- "e2e:N" = `scripts/vitrine-e2e.ts:N`. Os testes da vitrine estão em `vitrine/**/__tests__/`; os da raiz em `src/**/__tests__/`.

### Cobertura por requisito e AC

| Req. | AC | Teste (valor asserido) | Código | Veredito |
| --- | --- | --- | --- | --- |
| VPROJ-01 | AC1 | `vitrine-isolamento.test.ts:164-171` (4 arquivos e scripts) | `vitrine/package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` | OK |
| VPROJ-01 | AC2 | `vitrine-isolamento.test.ts:173-176` | `vitrine/next.config.ts:6` | OK |
| VPROJ-01 | AC3 | `vitrine-isolamento.test.ts:182-187` (estático) | — | OK |
| VPROJ-01 | AC4 | `vitrine-isolamento.test.ts:189-199`, regra provada em `:90-153` | todo `vitrine/` | OK |
| VPROJ-01 | AC5 | `vitrine-isolamento.test.ts:209-225` (tsc e ESLint da raiz) | `tsconfig.json`/`eslint.config` da raiz | OK |
| VPROJ-01 | AC6 | `vitrine/src/db/__tests__/conexao.test.ts:9-35` (lê `VITRINE_DATABASE_URL`) | `vitrine/src/db/conexao.ts:25-33` | **Parcial**: nada prova o "só" (mutante X14 com `DATABASE_URL` antes sobrevive) |
| VPROJ-02 | AC7 | `storefront-contract-parity.test.ts:23-51` | `vitrine/src/contrato.ts:11-64` | OK |
| VPROJ-02 | AC8 | `storefront-contract-parity.test.ts:23-51`; `vitrine-views-paridade.test.ts:37-47` (contra `information_schema`) | `vitrine/src/db/views.ts:17-58` | OK |
| VCAT-01 | AC1 | e2e:234-237 (200 em A, B, D); e2e:1045-1057 (nome, título, sobre); e2e:458-472 (imóveis da loja) | `app/c/[slug]/page.tsx:66-101`, `templates/comum/secoes.tsx:36-60` | OK |
| VCAT-02 | AC2 | e2e:458-467 (destaques mais antigos e empate 19/20 na fixture); `vitrine-consultas.test.ts:152-165` | `vitrine/src/dados/consultas.ts:19-25` | OK |
| VCAT-02 | AC3 | e2e:458-471; `vitrine/src/lib/__tests__/catalogo.test.ts:13-25` | `vitrine/src/lib/catalogo.ts:7`, `:22-36` | OK |
| VCAT-02 | AC4 | e2e:474-481; `catalogo.test.ts:27-31` | `catalogo.ts:25-28` | OK |
| VCAT-02 | AC5 | e2e:482-483; `catalogo.test.ts:33-44` | `catalogo.ts:27` | OK |
| VCAT-01 | AC6 | e2e:1028-1043 (bairro, cidade, quartos, banheiros, vagas, área), e2e:545-555 (foto principal), e2e:616/:516 (preço no card), e2e:465 (link do item) | `templates/grade/catalogo-grade.tsx:12-41`, `templates/editorial/catalogo-editorial.tsx:18-47` | **Parcial**: o tipo do card em grade só é visto pelo `alt` e pelo rótulo acessível (mutante X1 tira o tipo do texto do card e sobrevive) |
| VCAT-01 | AC7 | e2e:557-573 (mensagem, 2 botões `wa.me` com a mensagem de catálogo, 200) | `templates/comum/secoes.tsx:13-33` | OK |
| VCAT-03 | AC8 | e2e:1218-1233 (banco inalcançável, slug inválido → neutra sem erro de leitura); `catalogo.test.ts:51-67` | `app/c/[slug]/layout.tsx:54`, `catalogo.ts:39-43` | OK |
| VCAT-03 | AC9 | e2e:222-232, e2e:344-352 (C e slug sem loja: sem nome, razão, CRECI, cor nem tema) | `layout.tsx:65`, `src/loja/nao-encontrado.tsx:9-19` | OK |
| VCAT-03 | AC10 | e2e:125, :133, :228, :370 (`noindex`); e2e:720-741 e Global e2e:1320 (sem dado de imóvel) | `app/layout.tsx:21` | OK |
| VCAT-01 | AC11 | `vitrine/src/lib/__tests__/apresentacao.test.ts:14-28` (`R$ 520.000`); e2e:678 | `vitrine/src/lib/apresentacao.ts:10-13` | OK |
| VCAT-01 | AC12 | e2e:319-332 (A 11 dígitos, B 13, D 10) | `layout.tsx:67`, `:90-98` | OK |
| VITEM-01 | AC1 | e2e:667-688 e e2e:690-701 (cada atributo do próprio campo) | `src/item/pagina-item.tsx:56-127` | **Parcial**: a UF asserida (`Uberaba/MG`) coincide com uma constante; toda a fixture visível é `MG` (mutante X3 com `MG` fixo sobrevive) |
| VITEM-01 | AC2 | e2e:703-718 (`AP-0001` e `ap-0001`, `og:url` e links em minúsculas); `catalogo.test.ts:70-87` | `catalogo.ts:46-67` | OK |
| VITEM-02 | AC3 | e2e:810-829 (decodificado igual ao texto da spec); `contato.test.ts:36-41` | `src/lib/contato.ts:16-25`, `pagina-item.tsx:61` | OK |
| VITEM-02 | AC4 | e2e:820 (A 11 dígitos → `55`, B 13 sem prefixo), e2e:325 (D 10 dígitos); `contato.test.ts:16-24` (10/11 com, 12/13 sem) | `contato.ts:10-13` | OK |
| VITEM-02 | AC5 | e2e:354-374 (marca da A, CRECI, razão, link `/c/<slug>`, `noindex`); e2e:720-741 | `src/loja/nao-encontrado.tsx:26-35`, `imovel/[ref]/page.tsx:83`, `:95` | OK |
| VITEM-01 | AC6 | e2e:802-808 ("Sem foto", sem `<img>`); e2e:554 no card; ícone e proporção: captura `t23-03`, `t23-05` | `templates/comum/foto-do-imovel.tsx:19-38`, `espaco-sem-foto.tsx:25-34` | OK (proporção e ícone por captura) |
| VITEM-01 | AC7 | e2e:776-787; estático `vitrine-superficie.test.ts:92-97` (sem `dangerouslySetInnerHTML`) | `pagina-item.tsx:18-30` | OK |
| VITEM-01 | AC8 | e2e:789-800 (item, 2 fotos); e2e:545-552 (card) | `item/galeria-do-imovel.tsx:45`, `foto-do-imovel.tsx:27-32` | OK |
| VSEG-01 | AC1 | `vitrine-privilegios.test.ts:166` (só 2 grants, SELECT nas 2 views) e `:176`; `vitrine-consultas.test.ts:107-111` (`current_user` = `krivo_vitrine`) | `vitrine/src/db/views.ts` | OK |
| VSEG-01 | AC2 | `vitrine-consultas.test.ts:114-133`; e2e:754-774 | `consultas.ts:23`, `:38` | OK |
| VSEG-01 | AC3 | e2e:499-518, e2e:754-774; `vitrine-consultas.test.ts:114-133` | idem | OK |
| VSEG-01 | AC4 | e2e:486-497, e2e:720-741, Global e2e:1320; `vitrine-consultas.test.ts:135-148` | view (L16a) | OK |
| VSEG-02 | AC5 | Global e2e:1320-1328 (sentinelas de captador, logradouro, número, complemento e lead no HTML, nos metadados e no log); a imagem OG só recebe nome, cor, cidade e UF (`opengraph-image.tsx:39-63`), e as views não têm coluna de PII (`vitrine-views.test.ts:101`) | — | OK |
| VSEG-02 | AC6 | `vitrine-superficie.test.ts:57-74`; e2e:1247-1259 | `app/api/revalidar/route.ts:19-49` | OK |
| VSEG-02 | AC7 | Global e2e:1314-1318; `route.test.ts:110-118` | — | OK |
| VSEG-01 | AC8 | `vitrine-consultas.test.ts:107-148` (como `krivo_vitrine`, com linhas de outra loja e ocultas) | — | OK |
| VTEMA-01 | AC1 | e2e:1261-1275 (`data-theme="light"`); `vitrine-superficie.test.ts:134-138`; `tema-da-loja.test.ts:16-26` (sem cor = accent do neutro; cores diferentes = accents diferentes) | `src/tema/tema-da-loja.ts:30-46`, `tema-da-loja-provider.tsx:31` | OK |
| VTEMA-01 | AC2 | `tema-da-loja.test.ts:33-41`; `cor.test.ts:9-14`; e2e:266-280 (D sem cor) | `tema/cor.ts:8-20` | OK |
| VTEMA-01 | AC3 | e2e:282-294, e2e:1277-1303; `tema-da-loja.test.ts:58-71` | `tema-da-loja.ts:36-44`, `tema/fontes.ts`, `app/layout.tsx:29` | OK |
| VTEMA-02 | AC4 | e2e:458-471 (faixa e grade), e2e:1069-1123 (6 de 8 destaques), e2e:575-584 (paginação), e2e:1045-1057 (Sobre), e2e:296-317 (rodapé) | `catalogo-grade.tsx:49-82`, `page.tsx:87-98` | OK |
| VTEMA-02 | AC5 | e2e:520-534 (foto do 1º destaque no cabeçalho, linhas `astryx-list-item`), e2e:1045-1057 (Sobre), rodapé e2e:296 | `catalogo-editorial.tsx:56-90` | **Parcial**: a paginação do editorial não tem nenhuma prova (B tem 4 imóveis; nenhuma asserção nem captura do editorial com mais de 24); mutante X2 tira `{paginacao}` do editorial e sobrevive |
| VTEMA-02 | AC6 | e2e:1103-1133 | `catalogo-grade.tsx:54`, `catalogo-editorial.tsx:63` | OK |
| VTEMA-01 | AC7 | e2e:234-280; `tema-da-loja.test.ts:75-102` | `tema-da-loja.ts:60-66`, `tema-da-loja-provider.tsx:24-37` | OK |
| VTEMA-02 | AC8 | `vitrine-superficie.test.ts:78-109` (estático) | `vitrine/app`, `vitrine/src` | OK |
| VTEMA-02 | AC9 | capturas `t25-02/04/06/08..14`, `t23-04..06`, `t21-06..08` (conferi `t25-02`, `t25-06`); tabela de larguras da T25 neste arquivo | — | OK (captura) |
| VLEGAL-01 | AC1 | e2e:296-304 (catálogo A, B, D), e2e:1059-1067 (item e imóvel indisponível), e2e:368-369 | `src/rodape/rodape-legal.tsx:24-59` | OK |
| VLEGAL-01 | AC2 | e2e:306-316 (A com endereço, telefone e Instagram; B sem Instagram) | `rodape-legal.tsx:35-55` | OK |
| VLEGAL-01 | AC3 | e2e:309; `contato.test.ts:66-71` | `contato.ts:39-42` | OK |
| VLEGAL-01 | AC4 | e2e:310, :315 (10 e 11 dígitos); `contato.test.ts:58-64` | `contato.ts:33-36` | OK |
| VOG-01 | AC1 | e2e:586-601 (catálogo), e2e:831-842 (item), e2e:888-903 (`og:image` absoluto em A, B, D e no item sem foto) | `page.tsx:26-44`, `imovel/[ref]/page.tsx:24-59`, `app/layout.tsx:8-19` | OK para catálogo e item (ver observação 1 sobre a página de imóvel indisponível) |
| VOG-01 | AC2 | e2e:591-600; `apresentacao.test.ts:69-87` | `apresentacao.ts:81-89` | OK |
| VOG-01 | AC3 | e2e:835-836; `apresentacao.test.ts:89-103` | `apresentacao.ts:92-99` | OK |
| VOG-01 | AC4 | e2e:837, :840 (1ª foto); e2e:900-902 (sem foto → cartão da loja) | `imovel/[ref]/page.tsx:32-35` | OK |
| VOG-01 | AC5 | e2e:905-924 (PNG 1200×630, pixel = hex da loja), e2e:1198-1216 (nome muda o PNG), e2e:939-996 (sem saída de rede) | `opengraph-image.tsx:25-68` | OK |
| VOG-01 | AC6 | e2e:586-601, e2e:831-842 (UA do WhatsApp, `metaDoHead` corta em `</head>`) | — | OK |
| VCACHE-01 | AC1 | `vitrine/src/dados/__tests__/cache.test.ts:52-61` | `src/dados/cache.ts:21-43` | OK |
| VCACHE-01 | AC2 | `vitrine-isolamento.test.ts:173-176` | `next.config.ts:7-10` | OK |
| VCACHE-02 | AC3 | `route.test.ts:39-50`; e2e:138-146 | `route.ts:36-38` | OK |
| VCACHE-02 | AC4 | `route.test.ts:52-70`; e2e:148-161, e2e:633-635 | `route.ts:21-28`, `revalidacao.ts:24-25` | OK |
| VCACHE-02 | AC5 | `route.test.ts:72-78`; `revalidacao.test.ts:61-87`; e2e:163-170 | `revalidacao.ts:36-50` | OK |
| VCACHE-02 | AC6 | `route.test.ts:80-87`; e2e:172-182 | `route.ts:42-49` | OK |
| VCACHE-02 | AC7 | `vitrine/src/__tests__/revalidacao.test.ts:47-53` (espião de `timingSafeEqual`, buffers de 32 bytes) | `revalidacao.ts:20-29` | **Parcial**: o espião só é conferido no caminho do segredo certo; um retorno antecipado com `!==` antes do `timingSafeEqual` (mutante X4b) passa em toda a suíte |
| VCACHE-01 | AC8 | e2e:603-647 | `cache.ts`, `route.ts:36` | OK |
| VCACHE-01 | AC9 | e2e:629-635 (sem aviso segue do cache); teto de 300 s pela configuração (`vitrine-isolamento.test.ts:175`) | — | OK |
| VCACHE-02 | AC10 | `route.test.ts:89-108`; e2e:184-189; Global e2e:1338-1343 | `route.ts:26`, `:32`, `:37` | OK |
| VSEO-01 | AC1 | e2e:125, :133, :228 (`noindex, nofollow` completo nas neutras); e2e:370, :392, :685, :739 (só o prefixo `noindex` no item, indisponível e erro) | `app/layout.tsx:21` | **Parcial**: nenhuma asserção da meta no catálogo de uma loja (A, B, D), e nas páginas de item só o prefixo; mutante X5 (`robots: { index: false, follow: true }` no `generateMetadata` do catálogo) sobrevive |
| VSEO-01 | AC2 | Global e2e:1307-1312; e2e:1243 | `next.config.ts:20` | OK |
| VSEO-01 | AC3 | `vitrine-superficie.test.ts:113-130`; e2e:1237-1245 | — | OK |

| Edge Case | Teste | Veredito |
| --- | --- | --- |
| 24 imóveis → uma página, sem paginação | e2e:1142-1168 (V5); `catalogo.test.ts:13-19` | OK |
| 25 imóveis → página 2 com 1 | e2e:469-470; `catalogo.test.ts:21-25` | OK |
| Foto quebrada mantém proporção e `alt` | captura `t21-01-grade-loja-a-desktop-foto-quebrada` (conferida) | OK (captura) |
| `<script>` na descrição | e2e:776-787 | OK |
| `ap-0142` casa com `AP-0142` | e2e:703-714; `vitrine-consultas.test.ts:168-176` | OK |
| Banco indisponível | e2e:378-407 (T18); `erro-de-leitura.test.ts:17-32` | OK |
| Loja desativada + aviso → neutra | e2e:1170-1196 (V6) | OK |

**Contagem** (75 itens: 68 ACs e 7 Edge Cases): com prova 69 (dos quais 3 por captura: VTEMA AC9, foto quebrada e a proporção/ícone de VITEM AC6); **parcial 6** (VTEMA AC5, VCACHE AC7, VSEO AC1, VITEM AC1, VCAT AC6, VPROJ AC6); sem nenhuma prova 0. Em VTEMA AC5, o elemento "paginação" do editorial tem prova zero.

### Sensor de discriminação

Método: cópia do arquivo em `scratchpad/verifier3/`, mutação no arquivo real, teste-alvo, restauração imediata e `git status --short` vazio antes do próximo; um processo de teste por vez; nenhum teste editado. M3: a forma sem o 2º argumento não compila no Next 16.2; usado o perfil `"max"`, que compila (`tsc --noEmit` da vitrine com saída 0). Mutantes que só podem morrer no e2e e não interagem (páginas e asserções disjuntas) foram agrupados numa execução e atribuídos pelo nome da asserção que reprovou.

| # | Arquivo | Mutação | Teste que matou | Desfecho |
| --- | --- | --- | --- | --- |
| M1 | `vitrine/src/dados/consultas.ts:23` | `imoveisDaLoja` sem o filtro de slug | `vitrine-consultas.test.ts:122-123` (e mais 4 do arquivo) | morto |
| M2 | `vitrine/src/dados/cache.ts:24,32,40` | `cacheTag("tenant:catalogo")` fixo | `cache.test.ts:57` (as 3 funções) | morto |
| M3 | `vitrine/app/api/revalidar/route.ts:36` | `{ expire: 0 }` → `"max"` | `route.test.ts:43` | morto |
| M4 | `vitrine/src/revalidacao.ts:28` | `partes[1].trim() === segredo` no lugar de `timingSafeEqual` | `revalidacao.test.ts:49` | morto |
| M5 | `vitrine/src/lib/contato.ts:12` | prefixo `55` também com 12 dígitos | `contato.test.ts:22`, `:59` | morto |
| M6 | `vitrine/src/lib/catalogo.ts:27` | sem `Math.min(pedida, totalPaginas)` | `catalogo.test.ts:35`, `:43`, `:47` | morto |
| M7a | `vitrine/next.config.ts:20` | sem o cabeçalho `X-Robots-Tag` | e2e:1310 (Global) e e2e:1243 (V9) — 57 de 59 | morto |
| M7b | `vitrine/app/layout.tsx:21` | sem `robots` no metadado do layout raiz | e2e:125, :133, :228, :370, :392, :685, :739 — 52 de 59 | morto |
| M8 | `vitrine/src/item/pagina-item.tsx:122` | descrição num `<p dangerouslySetInnerHTML>` com `<br/>` | e2e:780 (T23 `<script>`) — 58 de 59; estático `vitrine-superficie.test.ts:95` | morto |
| X1 | `templates/grade/catalogo-grade.tsx:28` | card sem o tipo no texto (fica no `alt` e no rótulo) | nenhum (e2e 59 de 59, lote com X2, X3, X5) | **SOBREVIVEU** |
| X2 | `templates/editorial/catalogo-editorial.tsx:81` | editorial sem `{paginacao}` | nenhum (e2e 59 de 59) | **SOBREVIVEU** |
| X3 | `src/item/pagina-item.tsx:89` | UF do imóvel trocada por `MG` fixo | nenhum (e2e 59 de 59) | **SOBREVIVEU** |
| X4b | `src/revalidacao.ts:28` | `if (partes[1].trim() !== segredo) return false;` antes do `timingSafeEqual` | nenhum (`revalidacao.test.ts` e `route.test.ts` 19 de 19) | **SOBREVIVEU** |
| X5 | `app/c/[slug]/page.tsx:36` | `robots: { index: false, follow: true }` no catálogo | nenhum (e2e 59 de 59) | **SOBREVIVEU** |
| X6 | `app/c/[slug]/imovel/[ref]/page.tsx:40` | `openGraph` sem `title` | — | equivalente (o Next herda o `title` da página em `og:title`; saída igual), fora do placar |
| X6b | idem | `og:title` do item = a descrição | e2e:835 — 58 de 59 | morto |
| X7 | `src/lib/contato.ts:24` | referência da mensagem do WhatsApp sem maiúsculas | `contato.test.ts:38`, `:52` | morto |
| X8 | `src/lib/contato.ts:40` | Instagram sem tirar o `@` | `contato.test.ts:68` | morto |
| X9 | `src/lib/contato.ts:34` | `tel:` sem o `55` | `contato.test.ts:59` | morto |
| X10 | `src/dados/consultas.ts:24` | ordem sem o destaque primeiro | `vitrine-consultas.test.ts:164` | morto |
| X11 | `src/dados/consultas.ts:38` | `imovelPorReferencia` sem o filtro de slug | `vitrine-consultas.test.ts:131` | morto |
| X12 | `templates/comum/foto-do-imovel.tsx:31` | sem `referrerPolicy` | e2e:551 — lote 55 de 59 | morto |
| X13 | `templates/comum/secoes.tsx:21` | estado vazio sem o botão de WhatsApp | e2e:567 — lote 55 de 59 | morto |
| X15 | `src/rodape/rodape-legal.tsx:56` | rodapé sem o aviso legal | e2e:303 e e2e:1064 — lote 55 de 59 | morto |
| X14 | `src/db/conexao.ts:27` | `DATABASE_URL \|\| VITRINE_DATABASE_URL` | nenhum (`conexao.test.ts`, isolamento e superfície 25 de 25; no e2e o filho não recebe as variáveis do CRM) | **SOBREVIVEU** |

**Placar**: 24 mutantes não equivalentes, **18 mortos, 6 sobreviventes**. Os 8 alvos obrigatórios (9 mutantes, M7 em dois) morrem. Os 6 sobreviventes confirmam as 6 provas parciais da contagem. Corte por status (vendido, reservado, despublicado): não há mutante dentro de `vitrine/` (o corte é da view do L16a, que o papel só lê); provas em `vitrine-consultas.test.ts:135-148`, `vitrine-views.test.ts:153` e e2e:720-741.

### Lacunas (ranqueadas)

Todas são de prova: o código do HEAD cumpre cada item por inspeção. Nenhuma pede mudança de produto, só testes (exceto a observação 1, que pede decisão).

1. **VTEMA AC5, paginação do layout editorial sem prova** (P1): a fixture só põe o editorial na B, com 4 imóveis; nenhuma asserção nem captura mostra a paginação do editorial. Fechar no e2e trocando o layout da A para `editorial` (com restauração e aviso, como a V4) e conferindo `aria-label="Paginação"` na página 1 e o 25º imóvel em `?pagina=2`. Mutante X2 sobrevive.
2. **VCACHE AC7, tempo constante só no caminho de sucesso** (P1, segurança): `revalidacao.test.ts:47-53` chama `verificarSegredo` só com o segredo certo. Fechar conferindo o espião também com segredo errado do mesmo tamanho e de outro tamanho (uma chamada de `timingSafeEqual`, buffers de 32 bytes, em cada caso). Mutante X4b sobrevive.
3. **VSEO AC1, meta `robots` não asserida no catálogo** (P2): as asserções cobrem as páginas neutras, o item, o indisponível e o erro (estas só pelo prefixo `noindex`), nunca `/c/<slug>` de uma loja visível. Fechar com `<meta name="robots" content="noindex, nofollow">` completo em A, B, D e no item. Mutante X5 sobrevive.
4. **VITEM AC1, UF sem discriminação**: toda a fixture visível é `MG`, então `MG` fixo passa. Fechar com um imóvel visível de UF diferente da loja (ex.: um imóvel da A em `SP`) e asserção do texto `<cidade>/<UF>`. Mutante X3 sobrevive.
5. **VCAT AC6, tipo do card em grade só pelo `alt`/rótulo acessível**: fechar com asserção do texto visível do card (`Apartamento · Usado · AP-0025`). Mutante X1 sobrevive. (Apontado como menor pela verificação anterior, sem mutante.)
6. **VPROJ AC6, o "só" de `VITRINE_DATABASE_URL`**: fechar com teste de `conexao.ts` com `DATABASE_URL` definida e `VITRINE_DATABASE_URL` vazia (tem de falhar) ou estático (nenhuma outra variável de banco lida em `vitrine/`). Mutante X14 sobrevive.

Observação 1 (decisão, não prova): VOG AC1 pede `og:title`, `og:description`, `og:url` e `twitter:card` "em toda página de loja", e VLEGAL AC1 trata o imóvel indisponível como página de loja. Hoje essa página só herda `og:image` do segmento, e o e2e:738 afirma a ausência de `og:title`. Usar os metadados do catálogo da loja ali não vazaria dado do imóvel; ou registrar na spec que a página de imóvel indisponível fica fora de VOG AC1.

Comparação com as verificações anteriores (feita depois da avaliação acima): as 5 lacunas da segunda verificação estão fechadas pela F2 e reconfirmadas aqui (estático e e2e V9–V12 verdes; os mutantes M7a/M8 também morrem pelos testes novos). Os itens 1 a 4 e 6 acima são novos; o item 5 já constava como menor.

### Rodada de correção 3 (F3) — lacunas da terceira verificação

O HEAD `06a9175` foi reprovado por um terceiro agente novo, de novo por prova parcial e não por produto: 6 ACs com mutante sobrevivente (VTEMA AC5, VCACHE AC7, VSEO AC1, VITEM AC1, VCAT AC6, VPROJ AC6). Nenhum código de `vitrine/` mudou na F3.

| Lacuna | Prova nova |
| --- | --- |
| VTEMA AC5, paginação do editorial | e2e V13: A trocada para `editorial` no banco (25 imóveis): linhas e navegação em português, 24 na página 1, 1 na 2 e na `?pagina=99`; layout restaurado |
| VCACHE AC7, comparação em tempo constante sempre | `vitrine/src/__tests__/revalidacao.test.ts`: `timingSafeEqual` é chamado uma vez também com segredo errado, de outro tamanho ou de 500 caracteres |
| VSEO AC1, meta `robots` | e2e V14: exatamente uma `<meta name="robots" content="noindex, nofollow">` no catálogo (A, página 2, B, D), no imóvel, no sem foto, no indisponível, na loja inativa e no slug inválido |
| VITEM AC1, UF do imóvel | e2e V15: a UF de `AP-0001` vira `SP` no banco, avisa, a página mostra `Uberaba/SP` e não `Uberaba/MG`; restaura |
| VCAT AC6, tipo no card | e2e V16: a linha `Tipo · Usado · REF` de cada card de A e o título `Tipo em bairro` de cada linha de B |
| VPROJ AC6, só `VITRINE_DATABASE_URL` | `vitrine/src/db/__tests__/conexao.test.ts`: com a variável do CRM definida e a da vitrine vazia, a conexão da app falha; `vitrine-superficie.test.ts`: nenhum arquivo da vitrine lê outra variável de conexão |

Sensor da correção (cópia dos arquivos, restaurados): editorial sem paginação (V13), meta `noindex, follow` no imóvel (V14), UF fixa em `MG` (V15), card sem o tipo (V16), recusa por comparação direta antes do `timingSafeEqual` (teste de revalidação) e leitura da variável do CRM (teste de conexão e teste estático) morrem. Com os mutantes: 3 de 26 testes unitários e estáticos e 4 de 63 asserções do e2e reprovam. Sem mutante: 26 de 26 e 63 de 63.

### Ponto que depende de decisão do usuário (não resolvido)

A terceira verificação apontou que a página de imóvel indisponível (VITEM AC5) não traz `og:title`, `og:description`, `og:url` nem `twitter:card`, e o e2e T23 exige essa ausência de propósito (nenhum dado do imóvel pode vazar). A VOG AC1 diz "em toda página de loja", e a VLEGAL AC1 trata essa página como página de loja. As duas saídas mudam algo que não é só prova: (a) emitir ali os metadados do catálogo da loja (código novo e a asserção de ausência da T23 muda); ou (b) registrar na spec que a página de imóvel indisponível fica fora da VOG AC1 (emenda de AC). Nenhuma foi aplicada: é decisão do usuário. Depois dela, a verificação final precisa rodar de novo no HEAD resultante.

## Validation — Quarta verificação independente (HEAD d3cb0ba)

**Result**: FAIL

- **Verifier**: quarto agente novo, sem contato com as execuções nem com as verificações anteriores; avaliação formada a partir da spec e do código, e só depois comparada com as seções acima.
- **Intervalo**: `git log --oneline ddbf72d^..HEAD` (HEAD `d3cb0ba`; código igual ao de `be4d776`; `677f29e`, renomeação de marca, ignorado).
- **Rodadas no HEAD limpo**: `npm run vitrine:e2e` **63 de 63**; `npx vitest run vitrine` + isolamento, superfície, paridades, consultas, views, privilégios, `vitrine-dev` e `vitrine-fixture`: **22 arquivos, 189 testes verdes**.
- **Sonda própria** (script no scratchpad, fora do repositório; fixture criada e removida, `next start` na 3110, sem mutante): pediu catálogo, item, item sem foto, imóvel indisponível, vendido e loja inativa com o user-agent do WhatsApp e listou as metas do `<head>`.
- **Contagem**: 68 ACs e 7 Edge Cases. **64 ACs com prova** e **4 sem prova completa** (1 FAIL de produto: VOG AC1; 3 parciais com mutante sobrevivente: VCAT AC6, VCAT AC3, VITEM AC6). **7 de 7 Edge Cases com prova** (o de foto quebrada por captura, que é o que só a captura prova).

### Cobertura por requisito e AC

Código em `vitrine/` salvo indicação; "e2e" = `scripts/vitrine-e2e.ts`.

| Req | AC | Evidência (teste → código) | Situação |
| --- | --- | --- | --- |
| VPROJ-01 | AC1 | `src/lib/__tests__/vitrine-isolamento.test.ts:164-171` → `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` | provado |
| VPROJ-01 | AC2 | `vitrine-isolamento.test.ts:173-176` → `next.config.ts:6` | provado |
| VPROJ-01 | AC3 | `vitrine-isolamento.test.ts:182-187` (ausência por teste estático) | provado |
| VPROJ-01 | AC4 | `vitrine-isolamento.test.ts:98-153` (a regra recusa o que deve) e `:189-199` (varredura real) | provado |
| VPROJ-01 | AC5 | `vitrine-isolamento.test.ts:209-225` | provado |
| VPROJ-01 | AC6 | `vitrine/src/db/__tests__/conexao.test.ts:9-23,54-60`; `src/lib/__tests__/vitrine-superficie.test.ts:56-65` → `src/db/conexao.ts:27` | provado |
| VPROJ-02 | AC7 | `src/lib/__tests__/storefront-contract-parity.test.ts:23-51` → `src/contrato.ts:11-64` | provado |
| VPROJ-02 | AC8 | mesmo arquivo (contrato) e `src/db/__tests__/vitrine-views-paridade.test.ts:37-47` (colunas reais) → `src/db/views.ts` | provado |
| VCAT-01 | AC1 | e2e:234-237 (200), e2e:1045-1057 (V2 nome, título, sobre), e2e:458-467 (imóveis da loja) → `app/c/[slug]/page.tsx:66-101` | provado |
| VCAT-02 | AC2 | `src/db/__tests__/vitrine-consultas.test.ts:152-165`; e2e:458-467 → `src/dados/consultas.ts:24` | provado |
| VCAT-02 | AC3 | `vitrine/src/lib/__tests__/catalogo.test.ts:13-25`; e2e:458-472, 1307-1330 → `src/lib/catalogo.ts:22-36` | **parcial**: a seleção no servidor por `?pagina=` está provada; o controle de paginação que o visitante clica (`src/templates/comum/paginacao.tsx:27`) não tem teste. Mutante X2 (`?page=`) sobrevive |
| VCAT-02 | AC4 | `catalogo.test.ts:27-31`; e2e:474-481 | provado |
| VCAT-02 | AC5 | `catalogo.test.ts:33-44`; e2e:482-483, 1321-1325 | provado |
| VCAT-01 | AC6 | foto principal e2e:545-552; tipo e2e:1372-1386 (V16); bairro, cidade, quartos, banheiros, vagas e área e2e:1028-1043 (V1); link e2e:414-423, 465 → `src/templates/grade/catalogo-grade.tsx:12-41`, `editorial/catalogo-editorial.tsx:18-47` | **parcial**: o preço do card em grade não tem asserção sobre o texto visível; ele também está no `aria-label` do `ClickableCard` (`catalogo-grade.tsx:20`), e as asserções de preço (e2e:516, 616) casam com o atributo. Mutante X1 (remove `<Text>{preco}</Text>` do card) sobrevive |
| VCAT-01 | AC7 | e2e:557-573 → `src/templates/comum/secoes.tsx:13-33` | provado |
| VCAT-03 | AC8 | e2e:129-136, 1218-1233 (V8, banco inalcançável) → `app/c/[slug]/layout.tsx:54` | provado |
| VCAT-03 | AC9 | e2e:222-232, 344-352, 926-937 → `layout.tsx:65`, `src/loja/nao-encontrado.tsx:9-19` | provado |
| VCAT-03 | AC10 | e2e:112-136, 222-232, 720-741, 1332-1353 | provado |
| VCAT-01 | AC11 | `vitrine/src/lib/__tests__/apresentacao.test.ts:14-28`; e2e:678 → `src/lib/apresentacao.ts:10-13` | provado |
| VCAT-01 | AC12 | e2e:319-332 → `layout.tsx:67,90-98` | provado |
| VITEM-01 | AC1 | e2e:667-701, 1355-1370 (V15, UF) → `src/item/pagina-item.tsx:56-127` | provado |
| VITEM-01 | AC2 | `catalogo.test.ts:70-79`; e2e:703-718 | provado |
| VITEM-02 | AC3 | `vitrine/src/lib/__tests__/contato.test.ts:36-54`; e2e:810-829 | provado |
| VITEM-02 | AC4 | `contato.test.ts:16-24`; e2e:820 (A com 11 dígitos, B com 13) | provado |
| VITEM-02 | AC5 | e2e:354-374, 720-741, 1059-1067 → `app/c/[slug]/imovel/[ref]/page.tsx:95`, `nao-encontrado.tsx:26-35` | provado |
| VITEM-01 | AC6 | texto "Sem foto" e ausência de `<img>`: e2e:802-808, 553-554 → `src/templates/comum/foto-do-imovel.tsx:24-36`, `espaco-sem-foto.tsx:25-34` | **parcial**: o ícone e a moldura (`AspectRatio`) do espaço reservado só aparecem nas capturas `t23-03`, `t23-05`, `t25-10`; nenhum teste os discrimina. Mutantes X3 (espaço sem `AspectRatio`) e X4 (sem ícone) sobrevivem. O ícone é verificável no HTML (o `<svg>` sai no servidor), então não é caso de "só a captura prova" |
| VITEM-01 | AC7 | e2e:776-787; `vitrine-superficie.test.ts:103-108` → `pagina-item.tsx:18-30` | provado |
| VITEM-01 | AC8 | e2e:789-800, 545-552 → `src/item/galeria-do-imovel.tsx:45`, `foto-do-imovel.tsx:27-32` | provado |
| VSEG-01 | AC1 | `src/db/__tests__/vitrine-privilegios.test.ts:98-102,166-185` (o papel só lê as duas views) e o e2e inteiro rodando como `krivo_vitrine` → `src/db/views.ts:15-58` | provado |
| VSEG-01 | AC2 | `vitrine-consultas.test.ts:114-133`; e2e:754-774 → `consultas.ts:23,38` | provado |
| VSEG-01 | AC3 | e2e:499-518, 754-774 | provado |
| VSEG-01 | AC4 | `vitrine-consultas.test.ts:135-148`; e2e:486-497, 720-741, 1403-1411 | provado |
| VSEG-02 | AC5 | e2e:1403-1411 (sentinelas em todo HTML, metadado e log); `src/db/__tests__/vitrine-views.test.ts:101-110` (as views não têm as colunas; o cartão OG só lê a view) | provado |
| VSEG-02 | AC6 | `vitrine-superficie.test.ts:67-86`; e2e:1247-1259 | provado |
| VSEG-02 | AC7 | e2e:1397-1401 (global); `route.test.ts:110-118` | provado |
| VSEG-01 | AC8 | `vitrine-consultas.test.ts:107-133` | provado |
| VTEMA-01 | AC1 | `vitrine-superficie.test.ts:144-150`; e2e:1261-1275 (V11); `vitrine/src/tema/__tests__/tema-da-loja.test.ts:16-31` → `src/tema/tema-da-loja.ts:30-46`, `tema-da-loja-provider.tsx:31` | provado |
| VTEMA-01 | AC2 | `tema-da-loja.test.ts:24-41`; e2e:266-280 (D sem cor) | provado |
| VTEMA-01 | AC3 | e2e:282-294, 1277-1303; `tema-da-loja.test.ts:59-71` | provado |
| VTEMA-02 | AC4 | e2e:458-472, 520-528, 1069-1123 (V4), 1045-1057 (V2), 296-304 (rodapé) | provado |
| VTEMA-02 | AC5 | e2e:520-543, 1125-1133, 1307-1330 (V13) | provado |
| VTEMA-02 | AC6 | e2e:1103-1108, 1125-1133 (V4) | provado |
| VTEMA-01 | AC7 | e2e:234-280; `tema-da-loja.test.ts:75-102` | provado |
| VTEMA-02 | AC8 | `vitrine-superficie.test.ts:88-121` | provado |
| VTEMA-02 | AC9 | capturas `t16-02`, `t16-04`, `t21-06..08`, `t23-04..06`, `t25-02,04,06,08..12,14` (375 px; largura de rolagem registrada na T25) | provado por captura |
| VLEGAL-01 | AC1 | e2e:296-304, 1059-1067 (V3), 368-369, 687 → `src/rodape/rodape-legal.tsx:24-58` | provado |
| VLEGAL-01 | AC2 | e2e:306-316 | provado |
| VLEGAL-01 | AC3 | e2e:309; `contato.test.ts:66-71` | provado |
| VLEGAL-01 | AC4 | e2e:310, 315; `contato.test.ts:58-64` | provado |
| VOG-01 | AC1 | catálogo e2e:586-601, 888-898; item e2e:831-842; item sem foto e2e:900-902 | **FAIL**: a página de imóvel indisponível (página de não encontrado com a marca da loja) não emite `og:title`, `og:description` nem `og:url` (`app/c/[slug]/imovel/[ref]/page.tsx:30`: `return {}`). A sonda confirma que ela emite `og:image` (cartão da loja, herdado do segmento) e `twitter:card` = `summary_large_image`, mas nenhum teste assere essas duas ali; o e2e:738 assere a ausência de `og:title` |
| VOG-01 | AC2 | e2e:591-600; `apresentacao.test.ts:69-87` | provado |
| VOG-01 | AC3 | e2e:835-836; `apresentacao.test.ts:89-103` | provado |
| VOG-01 | AC4 | e2e:837, 900-902 | provado |
| VOG-01 | AC5 | e2e:905-924, 939-996, 1198-1216 → `app/c/[slug]/opengraph-image.tsx` | provado |
| VOG-01 | AC6 | e2e:586-601, 831-842 (user-agent do WhatsApp, `metaDoHead` só lê o `<head>`) | provado |
| VCACHE-01 | AC1 | `vitrine/src/dados/__tests__/cache.test.ts:51-67`; e2e:603-647 | provado |
| VCACHE-01 | AC2 | `vitrine-isolamento.test.ts:173-176` | provado |
| VCACHE-02 | AC3 | `vitrine/app/api/revalidar/__tests__/route.test.ts:39-50`; e2e:138-146 | provado |
| VCACHE-02 | AC4 | `route.test.ts:52-70`; `vitrine/src/__tests__/revalidacao.test.ts:25-45`; e2e:148-161 | provado |
| VCACHE-02 | AC5 | `route.test.ts:72-78`; `revalidacao.test.ts:61-88`; e2e:163-170 | provado |
| VCACHE-02 | AC6 | `route.test.ts:80-87`; e2e:172-182, 1254-1258 | provado |
| VCACHE-02 | AC7 | `revalidacao.test.ts:47-53, 90-103` | provado |
| VCACHE-01 | AC8 | e2e:603-647 | provado |
| VCACHE-01 | AC9 | e2e:629-635, 1178-1180 | provado |
| VCACHE-02 | AC10 | `route.test.ts:89-108`; e2e:184-189, 1421-1426 | provado |
| VSEO-01 | AC1 | e2e:1332-1353 (V14), 125, 133, 228 | provado |
| VSEO-01 | AC2 | e2e:1390-1395 (global), 1243 | provado |
| VSEO-01 | AC3 | `vitrine-superficie.test.ts:123-142`; e2e:1237-1245 | provado |

| Edge Case | Evidência | Situação |
| --- | --- | --- |
| 24 imóveis: uma página, sem paginação | e2e:1142-1168 (V5); `catalogo.test.ts:13-19` | provado |
| 25 imóveis: página 2 com 1 | e2e:458-472; `catalogo.test.ts:21-25` | provado |
| foto quebrada: proporção e `alt` | `alt` no HTML e2e:552; proporção na captura `t21-01` (as URLs da fixture não resolvem) | provado (captura) |
| `<script>` na descrição | e2e:776-787 | provado |
| `ap-0142` casa com `AP-0142` | `vitrine-consultas.test.ts:168-177`; e2e:703-718 | provado |
| banco indisponível | e2e:378-407; `vitrine/src/dados/__tests__/erro-de-leitura.test.ts:17-32` | provado |
| loja desativada + aviso → neutra | e2e:1170-1196 (V6) | provado |

### Sensor de discriminação

Cópia dos arquivos em `scratchpad/verifier4/orig/`, mutante aplicado no arquivo real e restaurado logo depois da rodada; `git status --short` vazio depois de cada uma. Mutantes de arquivos independentes foram agrupados numa rodada do e2e só quando cada um tinha asserção distinta; os que deviam sobreviver rodaram juntos (rodada inteira verde = todos sobreviveram).

| ID | Arquivo | Mudança | Teste que matou | Resultado |
| --- | --- | --- | --- | --- |
| M1 | `src/dados/consultas.ts:23` | `imoveisDaLoja` com `.where(sql\`true\`)` (sem filtro de slug) | `vitrine-consultas.test.ts` (5 testes, entre eles :114 isolamento e :152 ordem) | morto |
| M2 | `src/dados/cache.ts:24,32,40` | `cacheTag("tenant:catalogo")` fixo nas três | `cache.test.ts:52` (3 testes); no e2e (rodada R2): e2e:603 "A depois do aviso", V4, V5, V6, V7, V13, V15 | morto |
| M3 | `app/api/revalidar/route.ts:36` | `revalidateTag(tag, "max")` no lugar de `{ expire: 0 }` (a forma sem 2º argumento não compila no Next 16.2) | `route.test.ts:39` | morto |
| M4 | `src/revalidacao.ts:28` | `partes[1].trim() === segredo` no lugar de `timingSafeEqual` | `revalidacao.test.ts:47` e `:95` | morto |
| M5 | `src/lib/contato.ts:12` | prefixo `55` também com 12 dígitos | `contato.test.ts:21` e `:58` | morto |
| M6 | `src/lib/catalogo.ts:27` | `atual = pedida` (sem `Math.min` com a última página) | `catalogo.test.ts:33`, `:40`, `:46` | morto |
| M7a | `next.config.ts:20` | cabeçalho `X-Robots-Tag` removido | e2e global :1390 e V9 :1237 (R2) | morto |
| M7b | `app/layout.tsx:21` | `robots` removido dos metadados | e2e:112, 129, 222, 354, 378, 667, 720, 1332 (R3) | morto |
| M8 | `src/item/pagina-item.tsx:18-30` | descrição por `<p dangerouslySetInnerHTML>` com `<br/>` | `vitrine-superficie.test.ts:103`; e2e:776 (R4) | morto |
| X1 | `src/templates/grade/catalogo-grade.tsx:30-32` | remove o preço visível do card (fica só no `aria-label`) | nenhum (R1 63 de 63; vitest 184 de 184) | **SOBREVIVEU** |
| X2 | `src/templates/comum/paginacao.tsx:27` | navegação para `?page=` | nenhum (R1) | **SOBREVIVEU** |
| X3 | `src/templates/comum/foto-do-imovel.tsx:23` | sem foto, devolve o espaço reservado fora do `AspectRatio` | nenhum (R1) | **SOBREVIVEU** |
| X4 | `src/templates/comum/espaco-sem-foto.tsx:29` | espaço reservado sem o ícone | nenhum (R1) | **SOBREVIVEU** |
| X5 | `app/c/[slug]/imovel/[ref]/page.tsx:32` | `og:image` = segunda foto | e2e:831 (R2) | morto |
| X6 | `app/c/[slug]/page.tsx:37` | `twitter:card` = `summary` no catálogo | e2e:586 (R2) | morto |
| X8 | `app/c/[slug]/page.tsx:88` | faixa com até 7 destaques | e2e:1069 V4 (R3) | morto |
| X9 | `src/dados/consultas.ts:24` | ordem sem `desc(destaque)` | `vitrine-consultas.test.ts:152` | morto |
| X10 | `src/dados/consultas.ts:38` | `imovelPorReferencia` sem filtro de slug | `vitrine-consultas.test.ts:114` | morto |
| X11 | `src/lib/contato.ts:41` | `https://www.instagram.com/` | `contato.test.ts:66` | morto |
| X12 | `src/dados/cache.ts` | `"use cache"` removido das três leituras | e2e (R5): 40+ asserções, entre elas :603 cache | morto |
| X13 | `src/templates/comum/foto-do-imovel.tsx:21` | foto principal = última foto | e2e:545 e :520 (R4) | morto |
| X14 | `src/item/galeria-do-imovel.tsx:45` | sem `referrerPolicy` | e2e:789 (R4) | morto |
| X15 | `src/templates/comum/secoes.tsx:21` | catálogo vazio sem o botão de WhatsApp | e2e:557 (R2) | morto |
| X16 | `src/rodape/rodape-legal.tsx:33` | rodapé com o nome no lugar da razão social | e2e:296, 354, 667, 1059 (R4) | morto |
| X17 | `app/api/revalidar/route.ts:37` | log da revalidação com o cabeçalho `authorization` | `route.test.ts:89` | morto |
| X18 | `src/lib/apresentacao.ts:86` | descrição do catálogo ignora o título institucional | `apresentacao.test.ts:69` | morto |

**Placar**: 26 mutantes (9 dos 8 alvos obrigatórios, com M7 em dois, e 17 extras): **22 mortos, 4 sobreviventes** (X1–X4). Os 8 alvos obrigatórios morrem; M2, M7a, M7b e M8 também morrem pelo e2e. Os 4 sobreviventes correspondem às 3 provas parciais da tabela.

### Lacunas (ranqueadas)

1. **VOG AC1, imóvel indisponível sem `og:title`, `og:description` e `og:url`** (P1, produto). Julgamento da spec como escrita: "em toda página de loja" inclui a página de não encontrado com a marca da loja, porque a VLEGAL AC1 da mesma spec diz "em toda página de loja, inclusive na página de não encontrado da loja", ou seja, trata essa página como membro do conjunto. A leitura contrária (o "inclusive" seria uma extensão só da VLEGAL) é possível, mas mais fraca; a ambiguidade é pequena e a spec não precisa de emenda para ser lida assim. Nada na spec proíbe metadados nessa página: a VCAT AC10 só proíbe dado de imóvel, e os metadados do catálogo da loja (`"<nome> — imóveis"`, descrição da loja, `og:url` absoluta) não vazam nada do imóvel. Correção: emitir os metadados do catálogo na página indisponível e trocar a asserção do e2e:738 (ausência de `og:title`) por igualdade com os do catálogo, mais a ausência de dado do imóvel; ou o usuário emenda a VOG AC1 para excluir essa página. Fato da sonda que corrige o registro anterior: a página já emite `og:image` (cartão da loja) e `twitter:card` = `summary_large_image`; faltam só `og:title`, `og:description` e `og:url`. **Bloqueia o veredito.**
2. **VCAT AC6, preço do card em grade sem prova no texto visível** (P2, prova). O `aria-label` do `ClickableCard` repete o preço, e as asserções casam com o atributo. Fechar com asserção do texto do card (por exemplo `>R$ 400.000<` dentro do card de AP-0025, com `textoLimpo`). Mutante X1 sobrevive. **Bloqueia** pelo critério evidence-or-zero.
3. **VITEM AC6, ícone e moldura do espaço reservado sem teste** (P3, prova). Só as capturas mostram; o `<svg>` e o `AspectRatio` saem no HTML do servidor e podem ser asseridos (contar o `<svg>` e a classe do `AspectRatio` em volta de "Sem foto", no item AP-0005 e no card). Mutantes X3 e X4 sobrevivem.
4. **VCAT AC3, controle de paginação sem teste** (P3, prova). O `onChange` do `Pagination` (`paginacao.tsx:27`) monta a URL com `?pagina=`, mas a Astryx não gera `href` e nenhum teste clica nem confere o destino. Fechar com teste de componente (renderizar `PaginacaoDoCatalogo` com `useRouter`/`usePathname` simulados e conferir `push("/c/x?pagina=2")` e `push("/c/x")` para a página 1). Mutante X2 sobrevive.

Comparação com as verificações anteriores (feita depois da avaliação acima): as 6 lacunas da terceira verificação estão fechadas pela F3 e reconfirmadas aqui (V13–V16, espião do `timingSafeEqual` e teste da variável de conexão verdes; os mutantes correspondentes, como M4, X9 e o de `noindex`, morrem). A lacuna 1 é a mesma "observação 1" da terceira verificação, que ficou pendente de decisão; aqui é julgada como FAIL pelo texto da spec, com a correção do fato sobre `twitter:card` e `og:image`. As lacunas 2, 3 e 4 são novas.
