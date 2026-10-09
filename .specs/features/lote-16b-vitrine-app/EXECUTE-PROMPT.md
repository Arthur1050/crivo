# EXECUTE-PROMPT — Lote 16b, vitrine pública (projeto `vitrine/`)

Execute o lote 16b do Crivo com a skill `tlc-spec-driven` (ative pelo nome e siga o Execute e as Critical Rules). Responda sempre em português. **Só comece com o L16a fechado (Verifier PASS e arquivado).**

## Modelo

- **Sessão de execução: Claude Sonnet 5.5, esforço `medium`.** O design fixa a estrutura de pastas, as consultas, o tema e o harness de prova; o trabalho é de composição, com a doc do Next instalada como fonte.
- **Não use `xhigh` nem `max`.**
- **Verifier: Claude Opus 5.5** (`model: "opus"` no sub-agente). O que ele mais precisa atacar: isolamento por slug, corte de visibilidade, cache que derruba só a loja certa e ausência de PII no HTML.
- Se a mesma task falhar duas vezes no gate pelo mesmo motivo, pare e avise o usuário antes de trocar de modelo ou subir o esforço.

## O que já está aprovado (não pergunte de novo)

Aprovados pelo usuário em 2026-10-09, inclusive as assumptions marcadas `n` nas specs (aceitas ao iniciar o Execute):

- `.specs/features/lote-16-vitrine-publica/context.md` e `design.md`
- `.specs/features/lote-16b-vitrine-app/spec.md` e `tasks.md`
- AD-040 a AD-043 e a emenda de status da AD-025

Decisões tomadas:

- **Projeto**: pasta `vitrine/` neste repositório, sem importar de fora dela; contrato espelhado com teste de paridade (AD-041).
- **Rotas**: `/c/<slug>` e `/c/<slug>/imovel/<ref>`; `noindex`; fotos por URL externa sem otimizador; OG do item = primeira foto, do catálogo = cartão gerado (AD-043).
- **Cache**: `use cache` + perfil `vitrine` (60/60/300) + tag por loja; `POST /api/revalidar` com segredo e `{ expire: 0 }` (AD-042).
- **Tema**: `defineTheme` estendendo o tema neutro, modo claro, 4 fontes, 2 layouts; o layout muda só o catálogo.
- **Fora do lote**: projeto na Vercel, variáveis, deploy (L16c); filtros, domínio próprio, upload de foto.

A aprovação cobre a implementação, `npm install --prefix vitrine` com as versões fixadas no design, `npm run db:push:test` se algo de banco precisar, as fixtures na branch `test` e os commits locais. **Nada em produção, nenhum push, nenhum projeto na Vercel.**

## Leia só isto antes de começar

1. `spec.md` e `tasks.md` do lote; `context.md` e `design.md` de `lote-16-vitrine-publica/`, inteiros.
2. Em `.specs/STATE.md`, apenas AD-010, AD-014, AD-025, AD-033 e AD-040 a AD-043, e o Handoff.
3. `.specs/audits/2026-10-l14b.md` § 7, só essa seção.
4. Lições confirmadas citadas nas tasks: `python <skill-dir>/scripts/lessons.py list --status confirmed`.
5. `AGENTS.md`: antes de usar cada API do Next, a página dela em `node_modules/next/dist/docs/` (`cacheComponents`, `use-cache`, `cacheLife`, `cacheTag`, `revalidateTag`, `generate-metadata`, `opengraph-image`, `not-found`, `error`, `migrating-to-cache-components` § generateStaticParams e § searchParams).
6. Astryx: `npx astryx docs theme`, e `npx astryx build`/`template`/`component` antes de cada tela.

Não leia `ROADMAP-POS-PILOTO.md`, specs de outros lotes nem arquivos de `archive/` (exceto o `validation.md` do L16a, se precisar de um fato do gate dele).

## Janelas

| Janela | Tasks | Termina quando |
| --- | --- | --- |
| A | T0–T12 (gate, projeto, dados, lógica pura, rota de revalidação) | T12 commitada; Handoff atualizado |
| B | T13–T21 (harness, layout da loja, catálogo) | T21 commitada com e2e verde e capturas salvas |
| C | T22–T26 + fechamento | Verifier PASS, arquivamento feito |

Se a T0 falhar em F8 ou F10, pare a janela A e leve ao usuário a alternativa do design (para F10: paleta fixa pré-compilada, que é mudança de escopo).

## Ciclo por task

- Em linha, uma task por vez. O único sub-agente é o Verifier final.
- Ciclo: implementar → testes da task (`npx vitest run <arquivos>` ou `npm run vitrine:e2e`) → build gate (`npm --prefix vitrine run lint`, `typecheck` e `build`; `npm run lint` + `npx tsc --noEmit -p .` na raiz sem erro novo) → marcar a task em `tasks.md` (status + hash) → um commit.
- Tasks de rota (T14, T16–T18, T21, T23, T24) acrescentam as próprias asserções ao `scripts/vitrine-e2e.ts`; asserções anteriores do harness não mudam.
- `npm run vitrine:e2e` e testes pontuais usam a branch `test`: nunca simultâneos (L-033).
- **Não enfraqueça, pule nem apague testes.** Confira no diff antes de cada commit (L-055).
- Sem `<div>` de layout, sem `style`, só tokens; a única exceção é `<img>` dentro de `AspectRatio` com utilitários Tailwind de token. Self-check do `CLAUDE.md` em cada arquivo de tela.
- Trabalho visual: captura real pela extensão do Chrome (`npm run vitrine:dev`, porta 3100; confira que a porta serve o código atual). Sem captura, não altere UI. Salve no momento (L-054).
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
3. `validate_state.py`. Revisão de lições (AD-028): apresente as candidatas e não promova nenhuma.
4. Arquivamento (AD-029): `tasks.md` e `EXECUTE-PROMPT.md` para `archive/lote-16b-vitrine-app/`, com `ARCHIVED.md`.
5. Atualize só o Handoff do `STATE.md`. Reporte: tasks e hashes, Full e e2e, veredito do Verifier, capturas, pendências.
6. Nenhum push. O L16c começa em outra janela.
