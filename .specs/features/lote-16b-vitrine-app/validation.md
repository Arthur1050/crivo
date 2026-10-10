# Lote 16b — Vitrine pública — Validation

Registro de execução. O relatório do Verifier entra aqui no fechamento (janela C).

## Gate T0 — viabilidade (F8–F13, F19)

**Data**: 2026-10-10. **Veredito**: **REPROVADO em F10**. A janela A parou na T0 (gatilho do `EXECUTE-PROMPT.md`).

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

### Medição complementar do F10 (não adotada)

Variante medida só para informar a decisão: o componente cliente do tema emite `<style>` com `generateThemeCSS(tema).component` (API exportada por `@astryxdesign/core/theme`, a mesma que o `<Theme>` usa no cliente). Resultado no HTML do servidor, sem JS: `--color-accent: light-dark(#C1004C, #FFB1BD)` para a loja `#d4145a`, `--font-family-body` da loja A e da loja B diferentes, 1 tag `<style>`. A cor não depende de JavaScript, mas o valor é **derivado** pela Astryx a partir do hex da loja, não o hex literal. Isso muda o mecanismo do design (tema runtime puro) e portanto é decisão do usuário.

### Achados que ajustam tasks (independem da decisão do F10)

1. **T10/T16 — tema só em componente cliente.** `defineTheme`/`neutralTheme` lançam num Server Component (`defineSyntaxTheme` é função de cliente). O `<Theme>` da loja tem de ser montado num componente `'use client'` que recebe `slug`, `cor` e `familia` como props serializáveis; o layout (servidor) só lê a loja e passa as props. O módulo puro `temaDaLoja` continua importável pelo Vitest.
2. **T10 — família de fonte.** Passar a string do `next/font` (`'Lora', 'Lora Fallback'`) em `typography.body.family` gera `--font-family-body: "'Lora', 'Lora Fallback'"`, uma família citada que não casa com a fonte. Usar a sobrescrita `tokens` (`--font-family-body` e `--font-family-heading`) ou passar só o nome da família.
3. **T10 — accent derivado.** `resolveThemeTokens` devolve `--color-accent` derivado (`#d4145a` → `#C1004C`; cor nula com o padrão do protótipo → `#0058D2`). O teste da T10 e a asserção do e2e (VTEMA AC7) não podem esperar o hex literal; comparam duas lojas e o padrão entre si.
4. **T10 — nome do tema.** O nome do tema entra no seletor `@scope` e na chave de injeção; o protótipo usou `loja-<slug>` para duas lojas não colidirem.
5. **T16 — status.** O registro da F8 vale: página de não encontrado de loja sai com HTTP 200.
6. **Cache.** Linhas com `bigint` e `Date` atravessam o `use cache` sem erro.

### Ações da janela

Nada em produção, nenhum push. A fixture foi removida da branch `test` ao fim de cada rodada. O protótipo permanece em `scratch/vitrine-prova/` (fora do git) até a decisão do usuário sobre o F10; ele é apagado quando a T0 fechar.
