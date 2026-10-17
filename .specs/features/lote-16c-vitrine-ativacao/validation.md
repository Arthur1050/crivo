# Lote 16c — Validação

**Verdict:** pendente — a janela A está em execução (registro das ações externas, uma seção por task). O veredito do Verifier (janela C) entra aqui sem apagar as seções abaixo.

Regra de todas as seções: nenhum valor de variável, senha, token ou connection string é lido ou registrado.

## Gate de produção (T0, 2026-10-17)

Leitura da documentação da Vercel (`search_vercel_documentation` e `WebFetch` das páginas oficiais), consultada em 2026-10-17. Nenhuma escrita externa.

| Fato | Resultado | Fonte (campo `last_updated` da página) |
| --- | --- | --- |
| F14 — o Hobby aceita segundo projeto do mesmo repositório com Root Directory; limites de projetos, funções e logs | **Confirmado** | `vercel.com/docs/monorepos` (2026-08-11): "You'll create a new project for each directory in your monorepo", com o Root Directory escolhido na importação; o número de projetos ligados ao mesmo repositório é limitado por plano. `vercel.com/docs/limits` (2026-09-16), tabela de limites gerais, coluna Hobby: **Projects 200**, **Vercel Projects Connected per Git Repository 25**, **Deployments Created per Day 100**, **Concurrent Deployments 1**, **Cron Jobs 100 por projeto**; runtime logs retidos por **1 hora** no Hobby. Restrição do Hobby: não conecta repositório de organização Git; o remoto é `github.com/Arthur1050/crivo` (conta de usuário), então a condição vale. |
| F16 — `ignoreCommand` com `git diff HEAD^` funciona no clone da Vercel | **Confirmado, com ressalva de uso** | `vercel.com/docs/project-configuration/project-settings` (2026-09-21), § Ignored Build Step: o comando roda dentro do Root Directory; exit `0` aborta o build (deployment `CANCELED`) e exit `1` o mantém; exemplo da própria doc em `vercel.json`: `"ignoreCommand": "git diff --quiet HEAD^ HEAD ./"`. Guia `vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel`: o clone é raso com `--depth=10`, então `HEAD^` existe. |

**Consequências para a T7 (usuário, janela B), sem mudar AC:**

1. `git diff HEAD^ HEAD` olha só o último commit. Num push de vários commits em que a vitrine mudou num commit anterior ao último, o build da vitrine seria abortado. O primeiro deployment (feito na importação) também pode sair `CANCELED` se o último commit só tocar docs. Por isso o Ignored Build Step só deve ser ligado depois do primeiro deployment pronto, e um deployment abortado por engano se refaz com Redeploy desmarcando "Use project's Ignore Build Step".
2. Build abortado pelo Ignored Build Step conta como deployment completo: entra nos 100 deployments por dia e ocupa o único slot de build do Hobby. O CRM e a vitrine rebuildam a cada push (a vitrine só escapa com o `ignoreCommand`).
3. O recurso de pular projetos não afetados da Vercel exige workspaces npm/yarn/pnpm/Bun; este repositório não os usa, então o caminho para a vitrine é o Ignored Build Step.

**Decisão do gate:** F14 confirmada, nenhum gatilho de parada. F16 confirmada, então a T7 pode usar `ignoreCommand` (nota 1 acima). Rollback: não há ação externa a desfazer.

## Preparação da T1 (2026-10-17, local, sem produção)

Nada em produção foi tocado. Os scripts abaixo ficam em `scratch/` (fora do git, removidos ao fim da janela) e foram provados só no banco de teste descartável.

- **`pushSchema` do `drizzle-kit/api` não serve:** no `drizzle-kit` 0.31.10 o adaptador interno descarta os parâmetros das consultas de introspecção (`drizzleInstance.execute(sql.raw(query))` sem `params`), e o plano falha com `42P02 there is no parameter $1`. O plano vem do CLI.
- **Plano sem aplicar:** `npx drizzle-kit push --config scratch/drizzle-l16c-plano.config.ts --strict --verbose` imprime todas as instruções e aborta no prompt interativo, porque sem terminal não há como confirmar (`Interactive prompts require a TTY`). Segunda trava: a URL do script leva `options=-c default_transaction_read_only=on`; o teste `scratch/l16c-ro-check.ts` provou no banco de teste que a sessão fica somente leitura (`default_transaction_read_only = on`; escrita recusada com `25006`). Se o pooler de produção recusar o parâmetro `options`, o comando falha sem tocar em nada.
- **Estado antes:** `scratch/l16c-t1-estado.ts` (uma conexão `READ ONLY`, só `select`) lista contagem de tenants, existência de `tenant_storefronts`, `properties.featured`, enums, schema `vitrine`, papéis `krivo_vitrine` e `crivo_vitrine` e o índice `document_categories_tenant_id_lower_name_idx`.
- **Aviso para a T1:** no banco de teste, o plano do CLI traz só ruído antigo (9 `DROP`/`ADD CONSTRAINT` de FKs, 5 `CREATE UNIQUE INDEX` de índices que já existem, `DROP INDEX document_categories_tenant_id_lower_name_idx` e 4 trocas de `DEFAULT`). É o mesmo ruído que o L15 registrou (T11). Em produção o plano deve trazer esse ruído mais os objetos da vitrine; qualquer instrução fora de `tenant_storefronts`, dos dois enums e de `properties.featured` é gatilho de parada da T1.
