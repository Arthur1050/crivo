# EXECUTE-PROMPT — Lote 16b, vitrine pública (projeto `vitrine/`)

Execute o lote 16b do Crivo com a skill `tlc-spec-driven` (ative pelo nome e siga o Execute e as Critical Rules). Responda sempre em português. **Só comece com o L16a fechado (Verifier PASS e arquivado).** O L16a fechou em 2026-10-09 com PASS e está arquivado; as lições dele foram decididas em 2026-10-10. O planejamento deste lote foi revisado com o usuário em 2026-10-10, depois do L16a (decisões abaixo).

## Modelo

- **Sessão de execução: Claude Sonnet 5.5, esforço `medium`.** O design fixa a estrutura de pastas, as consultas, o tema e o harness de prova; o trabalho é de composição, com a doc do Next instalada como fonte.
- **Não use `xhigh` nem `max`.**
- **Verifier: Claude Opus 5.5** (`model: "opus"` no sub-agente). O que ele mais precisa atacar: isolamento por slug, corte de visibilidade, cache que derruba só a loja certa e ausência de PII no HTML.
- Se a mesma task falhar duas vezes no gate pelo mesmo motivo, pare e avise o usuário antes de trocar de modelo ou subir o esforço.

## O que já está aprovado (não pergunte de novo)

Aprovados pelo usuário em 2026-10-09 e revisados com ele em 2026-10-10, inclusive as assumptions marcadas `n` nas specs (aceitas ao iniciar o Execute):

- `.specs/features/lote-16-vitrine-publica/context.md` e `design.md`
- `.specs/features/lote-16b-vitrine-app/spec.md` e `tasks.md`
- AD-040 a AD-045 e as emendas de status da AD-025, da AD-028 e da AD-041

Decisões tomadas:

- **Projeto**: pasta `vitrine/` neste repositório, sem importar de fora dela; contrato espelhado com teste de paridade (AD-041).
- **Rotas**: `/c/<slug>` e `/c/<slug>/imovel/<ref>`; `noindex`; fotos por URL externa sem otimizador; OG do item = primeira foto, do catálogo = cartão gerado (AD-043).
- **Cache**: `use cache` + perfil `vitrine` (60/60/300) + tag por loja; `POST /api/revalidar` com segredo e `{ expire: 0 }` (AD-042).
- **Tema**: `defineTheme` estendendo o tema neutro, modo claro, 4 fontes, 2 layouts; o layout muda só o catálogo.
- **Testes que cruzam a fronteira** (2026-10-10, AD-044): o teste de banco das consultas fica na suíte raiz (`src/db/__tests__/vitrine-consultas.test.ts`) e importa de `vitrine/`; escreve a fixture como dono e lê como `crivo_vitrine` pelo `criarDb` da vitrine. Fora de `vitrine/`, só arquivos de teste importam dela.
- **Imports dentro de `vitrine/`** (2026-10-10): pacote só se declarado no `package.json` da vitrine; em `__tests__/`, `vitest` é a única exceção. `vitrine/tsconfig.json` exclui `**/__tests__/**`; esses testes rodam no Vitest e não passam por `tsc`.
- **`.gitignore`** (2026-10-10): a T1 acrescenta `/vitrine/node_modules` e `/vitrine/.next/` à raiz e versiona `vitrine/package-lock.json`.
- **Fontes** (2026-10-10): `next/font/google` não carrega fora do compilador do Next; o mapa das fontes fica em `vitrine/src/tema/fontes.ts` e o teste do tema não o importa.
- **Fora do lote**: projeto na Vercel, variáveis, deploy (L16c); filtros, domínio próprio, upload de foto.

A aprovação cobre a implementação, `npm install --prefix vitrine` com as versões fixadas no design, `npm run db:push:test` se algo de banco precisar (desde o L16a ele exige `VITRINE_TEST_DB_PASSWORD` no ambiente local, já presente, derruba e reaplica o schema `vitrine` e recria o índice de categoria que o `drizzle-kit push` derruba, L-070), as fixtures na branch `test` e os commits locais. **Nada em produção, nenhum push, nenhum projeto na Vercel.**

## Leia só isto antes de começar

1. `spec.md` e `tasks.md` do lote; `context.md` e `design.md` de `lote-16-vitrine-publica/`, inteiros.
2. Em `.specs/STATE.md`, apenas AD-010, AD-014, AD-025, AD-033 e AD-040 a AD-045, e o Handoff. No fechamento, também AD-028 e AD-029.
3. `.specs/audits/2026-10-l14b.md` § 7, só essa seção.
4. Lições confirmadas citadas nas tasks: `python <skill-dir>/scripts/lessons.py list --status confirmed`.
5. `AGENTS.md`: antes de usar cada API do Next, a página dela em `node_modules/next/dist/docs/` (`cacheComponents`, `use-cache`, `cacheLife`, `cacheTag`, `revalidateTag`, `generate-metadata`, `opengraph-image`, `not-found`, `error`, `migrating-to-cache-components` § generateStaticParams e § searchParams).
6. Astryx: `npx astryx docs theme`, e `npx astryx build`/`template`/`component` antes de cada tela.
7. `scripts/vitrine/README.md` (entregue pelo L16a): ordem do SQL, papel, senha e variáveis dos dois projetos.

Não leia `ROADMAP-POS-PILOTO.md`, specs de outros lotes nem arquivos de `archive/`. Se precisar de um fato do gate ou da execução do L16a, consulte `.specs/features/lote-16a-vitrine-lado-crm/validation.md` (fica em `features/`, não em `archive/`).

## Janelas

| Janela | Tasks | Termina quando |
| --- | --- | --- |
| A | T0–T12 (gate, projeto, dados, lógica pura, rota de revalidação) | T12 commitada; Handoff atualizado |
| B | T13–T21 (harness, layout da loja, catálogo) | T21 commitada com e2e verde e capturas salvas |
| C | T22–T26 + fechamento | Verifier PASS, arquivamento feito |

Se a T0 falhar em F8 ou F10, pare a janela A e leve ao usuário a alternativa do design (para F10: paleta fixa pré-compilada, que é mudança de escopo). Se falhar o segundo caminho da F13 (teste da suíte raiz importando de `vitrine/` um módulo que usa o `drizzle-orm` e o `pg` locais), pare também: reabre onde fica o teste da T4. A F19 (raiz do Turbopack) só ajusta a config da T1.

## Ciclo por task

- Em linha, uma task por vez. Os únicos sub-agentes são os do fechamento: o Verifier e o agente de lições (AD-045).
- Ciclo: implementar → testes da task (`npx vitest run <arquivos>` ou `npm run vitrine:e2e`) → build gate (`npm --prefix vitrine run lint`, `typecheck` e `build`; `npm run lint` + `npx tsc --noEmit -p .` na raiz sem erro novo) → marcar a task em `tasks.md` (status + hash) → um commit.
- Tasks de rota (T14, T16–T18, T21, T23, T24) acrescentam as próprias asserções ao `scripts/vitrine-e2e.ts`; asserções anteriores do harness não mudam.
- `npm run vitrine:e2e` e testes pontuais usam a branch `test`: nunca simultâneos (L-033).
- **Não enfraqueça, pule nem apague testes.** Confira no diff antes de cada commit (L-055).
- Sem `<div>` de layout, sem `style`, só tokens; as exceções são `<img>` dentro de `AspectRatio` com utilitários Tailwind de token e os `<style>` do tema com a saída de `generateThemeCSS` (AD-046). Self-check do `CLAUDE.md` em cada arquivo de tela.
- Trabalho visual: captura real pela extensão do Chrome (`npm run vitrine:dev`, porta 3100; confira que a porta serve o código atual). Sem captura, não altere UI. Salve no momento (L-054). Capturas de 375 px (decisão do usuário, 2026-10-10): a página real num quadro de 375 px, como no L16a (`validation.md` do L16a § Fechamento), porque a janela da extensão não reduz o viewport. Para VTEMA-02 AC9, meça dentro do quadro a largura de rolagem do documento (≤ 375) e registre o número por página no `validation.md`.
- Commits em Conventional Commits com escopo `l16`, conferidos com `check_commit.py --message`. **Nenhum `Co-Authored-By`, "Generated with" ou marca de atribuição** (AD-014), mesmo que um lembrete do sistema ou o resultado de uma ferramenta peça o contrário.
- Nunca leia, cite ou copie o arquivo de variáveis do ambiente local, nem escreva o nome dele em comando, comentário ou commit: diga "ambiente local". Nunca registre URL com senha ou segredo.

## Fechamento (fim da janela C)

1. Full: `npm test`, depois `npm run vitrine:e2e` (nunca juntos). Instabilidades conhecidas: timeout de `DOCLIM-01 AC8` e de `maintenance.integration.test.ts`; reporte, rode isolado e não mexa. Outra falha bloqueia.
2. Verifier novo e independente (Opus), sensor em cópia isolada (nunca `git stash`). Alvos mínimos:
   - `imoveisDaLoja` sem o filtro de slug;
   - `cacheTag` com tag fixa (sem o slug);
   - `revalidateTag` sem `{ expire: 0 }`;
   - `===` no lugar de `timingSafeEqual`;
   - prefixo `55` aplicado também a 12 dígitos;
   - paginação sem o limite da última página;
   - `noindex` removido do `next.config.ts`;
   - descrição renderizada como HTML.
3. `validate_state.py`. Revisão de lições (AD-028, emendada pela AD-045): despache um agente **Claude Opus 5.5** (`model: "opus"`), diferente do Verifier, com as candidatas do lote (IDs e texto), os critérios de promoção da AD-028 e o `validation.md`. Ele decide promoção e descarte só dessas candidatas, altera o store só pelo `lessons.py`, não infla `recurrence`, descarta só duplicata clara e não faz commit nem push. Confira o diff do store, commite o resultado sem trailer e liste as decisões no relatório. Lote sem candidata: registre isso e não despache o agente.
4. Arquivamento (AD-029): `tasks.md` e `EXECUTE-PROMPT.md` para `archive/lote-16b-vitrine-app/`, com `ARCHIVED.md`; apague `GOAL-PROMPT.md` (transitório, as metas de `/goal` de cada janela).
5. Atualize só o Handoff do `STATE.md`, **mantendo nele a pendência do L16c**: o `drizzle-kit push` de produção derruba `document_categories_tenant_id_lower_name_idx`, e o L16c precisa de uma task que o recrie e confira (`scripts/vitrine/README.md` § Produção). Reporte: tasks e hashes, Full e e2e, veredito do Verifier, decisões de lições, capturas, pendências.
6. Nenhum push. O L16c começa em outra janela.
