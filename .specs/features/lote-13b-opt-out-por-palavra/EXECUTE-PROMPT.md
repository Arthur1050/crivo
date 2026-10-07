# EXECUTE-PROMPT — Lote 13b, opt-out só pela palavra "sair"

Execute o lote 13b do Crivo com a skill `tlc-spec-driven` (ative pelo nome e siga o Execute e as Critical Rules). Responda sempre em português.

## O que já está aprovado (não pergunte de novo)

Spec e tasks aprovadas pelo usuário em 2026-10-07:

- `.specs/features/lote-13b-opt-out-por-palavra/spec.md`
- `.specs/features/lote-13b-opt-out-por-palavra/tasks.md`

Decisões: remover o classificador LLM de opt-out; opt-out só pela mensagem exata "sair" (sem "parar"), com a confirmação fixa atual; texto do system message intacto; testes do classificador e da medição removidos junto com o código; hotfix sobre o principal do L14 publicado (`e3e25681`, fonte `0688deb`) sem ativar o L14b; arquivar `crivo-medicao-opt-out`.

Aprovação cobre implementação e commits locais. **Cada ação externa exige autorização explícita do usuário no momento**, task a task: publicar/arquivar no n8n (T8), push do branch de hotfix e do main, envio de WhatsApp na prova (T9). Leitura pelo MCP do n8n é livre (T1, T9).

## Leia só isto antes de começar

1. `spec.md` e `tasks.md` do lote (inteiros).
2. Em `.specs/STATE.md`, apenas AD-014, AD-018, AD-026, AD-027, AD-032 e AD-033 (busque por `### AD-0NN`; não leia o arquivo inteiro).
3. `.specs/audits/2026-10-l14b.md` § 7 (regras de processo), só essa seção.

Não leia `ROADMAP`, specs de outros lotes nem arquivos de `archive/`.

## Como executar

- **Em linha, uma task por vez, sem sub-agentes de task.** O único sub-agente é o Verifier final.
- Ciclo por task: implementar → testes da task (`npx vitest run <arquivos>`) → `node scripts/n8n-inline.mjs` quando mudar fonte do n8n → marcar a task em `tasks.md` (status + hash, uma linha) → um commit.
- Depois do inliner, restaure arquivos de `n8n/generated` que mudaram só fim de linha (`git diff --ignore-cr-at-eol` vazio).
- Não enfraqueça, pule ou apague testes, exceto os do classificador e da medição listados nas T3–T5, que saem por decisão do usuário. Asserções de testes que ficam não mudam.
- Commits em Conventional Commits, conferidos com `check_commit.py`. **Nenhum `Co-Authored-By`, "Generated with" ou marca de atribuição.** Audite `git log` antes de qualquer push.
- Não há mudança de schema. `npm test` (Full) roda uma vez, no fechamento.
- Nunca leia, cite ou copie `.env`; nunca digite, registre ou peça token, chave ou senha. Evidência sem texto de lead real nem telefone completo.

## Hotfix (T7–T8)

- Worktree: `git worktree add ../crivo-hotfix-l13b -b hotfix/opt-out-so-sair 0688deb`. Aplique ali só o equivalente de T2 e T3. Rode os testes de grafo do principal e do gate nesse worktree.
- Antes de publicar: salve o JSON da versão `e3e25681` (rollback) e confirme com o usuário. Depois: `publish_workflow` e confira `versionId` = `activeVersionId` (L-032).
- O main não recebe merge do branch de hotfix; ele já tem a mesma mudança pelas T2–T4.

## Fechamento

1. `npm test` uma vez. As 2 falhas por timeout do DOCLIM-01 AC8 e o timeout de `maintenance.integration.test.ts` ligado à retenção global (m2 da auditoria) são instabilidades conhecidas: reporte, recheque o arquivo isolado e não mexa nelas aqui.
2. Verifier novo e independente: spec-anchored + sensor de discriminação em cópia isolada (nunca `git stash`); grava `validation.md`.
3. `validate_state.py`; revisão de lições (AD-028): apresente candidatas, não promova.
4. Atualize só o Handoff do `STATE.md`. Reporte ao usuário: tasks e hashes, resultado da Full, veredito do Verifier, o que ficou publicado e pendências.
