# Lote 16b — Vitrine pública — Validation

Registro de execução. O relatório do Verifier entra aqui no fechamento (janela C).

## Gate T0 — viabilidade (F8–F13, F19)

**Data**: 2026-10-10. **Veredito**: F8, F9, F11 (build), F12, F13 e F19 passam; **F10 reprovou** e foi resolvido pela AD-046 (opção b), decidida em 2026-10-10 por um agente Opus 5.5 por delegação do usuário. A janela A parou na T0 até a decisão e retomou na T1.

**Como foi medido**: protótipo descartável em `scratch/vitrine-prova/` (fora do git): Next 16.2.11, React 19.2.4, Astryx 0.2.0, `drizzle-orm` 0.45.4 e `pg` 8.23.1 instalados na pasta do protótipo, com `package-lock.json` próprio, `cacheComponents`, perfil `vitrine` 60/60/300, rota `[slug]` sem `generateStaticParams`, `params` em `<Suspense>`, tema por loja, `opengraph-image`, `POST /api/revalidar`, e um contador de execuções das consultas. Lido da branch `test` como `crivo_vitrine`, com duas lojas de fixture (cor e fonte diferentes), removidas ao fim. `next build` + `next start` reais; asserções por HTTP (`fetch`, sem JS). Nenhuma credencial ou URL foi registrada; o log do servidor não contém segredo nem URL de conexão.

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
| F13 (i) teste dentro do protótipo | **PASSA** | `npx vitest run` da raiz, 1 teste: lê a loja como `crivo_vitrine` com o `drizzle-orm` e o `pg` locais |
| F13 (ii) teste da suíte raiz fora do protótipo | **PASSA** | Teste em `src/db/__tests__/` importando `criarDb` e a consulta do protótipo: `drizzle-orm` e `pg` resolvidos em `vitrine-prova/node_modules`, `current_user = crivo_vitrine`, loja lida. 2 testes. O arquivo temporário foi removido da suíte |
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

