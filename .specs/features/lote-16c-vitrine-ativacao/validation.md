# Lote 16c — Validação

**Verdict:** PASS com ressalvas — volta 2: G1 e G2 fechados com evidência própria (variáveis da `vitrine` recriadas, vitrine conectando como `krivo_vitrine`, agendador despublicado por decisão registrada do usuário); restam só correções de forma em `tasks.md` (T7), `spec.md` (ATIV-03) e `INDEX.md`, a fazer no arquivamento, e a prova real fica pendente pelo Edge Case "sem CRECI" (seção "Verificação independente, volta 2" no fim).

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

## Schema em produção, T1 parte 1: leitura do plano (2026-10-17)

**Autorização do usuário (2026-10-17, no chat):** "Autorizo a T1 parte 1 (2026-10-17): rodar em produção só os 3 comandos somente leitura descritos (ro-check, estado e plano do drizzle-kit com --strict), sem aplicar nada. Confirmo que o DATABASE_URL do ambiente local aponta para produção. Rollback: nenhum."

**Alvo:** banco de produção, host `ep-gentle-brook-…` (distinto dos hosts de teste, `ep-holy-rice-…`; os scripts abortam se coincidir).

| # | Comando | Saída (sem segredo) |
| --- | --- | --- |
| 1 | `npx tsx scratch/l16c-ro-check.ts --alvo=producao` | `default_transaction_read_only: on`; escrita recusada com `25006` (esperado) |
| 2 | `npx tsx scratch/l16c-t1-estado.ts --alvo=producao` | 3 tenants; `tenant_storefronts` **não existe**; `properties.featured` **não existe**; enums `storefront_*` **ausentes**; schema `vitrine` **ausente**; papéis `krivo_vitrine` e `crivo_vitrine` **ausentes**; índice `document_categories_tenant_id_lower_name_idx` **existe**; tenant de demonstração `crivo-demo` (nome antigo, T17 pendente) |
| 3 | `L16C_ALVO=producao npx drizzle-kit push --config scratch/drizzle-l16c-plano.config.ts --strict --verbose` | Plano de 33 instruções impresso, abortado no prompt (`Interactive prompts require a TTY`); nada aplicado |

**Plano do `drizzle-kit` em produção (33 instruções):**

- **Dentro do escopo (5):** `CREATE TYPE storefront_font`, `CREATE TYPE storefront_layout`, `CREATE TABLE tenant_storefronts` (com os dois checks `tenant_storefronts_accent_color_check` e `tenant_storefronts_active_requires_identity_check` dentro do `CREATE TABLE`), `ALTER TABLE properties ADD COLUMN featured boolean DEFAULT false NOT NULL` e `ALTER TABLE tenant_storefronts ADD CONSTRAINT tenant_storefronts_tenant_id_tenants_id_fk` (FK para `tenants`, `ON DELETE cascade`).
- **Fora do escopo (28), é o ruído antigo que o L15 já registrou:** 9 `DROP CONSTRAINT` e 9 `ADD CONSTRAINT` de FKs compostas (`reengagement_episodes_*` ×6, `lead_agent_state_*` ×2, `whatsapp_message_receipts_message_identity_fk`); `DROP INDEX document_categories_tenant_id_lower_name_idx` e `CREATE UNIQUE INDEX` dele; 4 `CREATE UNIQUE INDEX` de índices que já existem (`leads_tenant_id_id_idx`, `messages_tenant_id_id_idx`, `messages_receipt_identity_idx`, `whatsapp_channels_tenant_phone_idx`), que falhariam; 4 `ALTER COLUMN ... SET DEFAULT` (`lead_agent_state.asked_fields`, `lead_agent_state.opening_history`, `whatsapp_usage.expires_at`, `whatsapp_message_receipts.orphan_expires_at`).

**Resultado: gatilho de parada.** O plano tem mudança além de `tenant_storefronts`, dos dois enums e de `properties.featured`, então a T1 **não foi aplicada** (AC1 de ATIV-02). Nenhuma escrita em produção. Rollback desta parte: nenhum (somente leitura).

**Estado de produção depois:** idêntico ao anterior (nenhum objeto da vitrine criado; o índice de categoria continua existindo).

## Schema em produção, T1 parte 2: aplicação à mão (2026-10-17)

**Autorização do usuário (2026-10-17, no chat; o botão de resposta cortou a mensagem em "document_ca", o resto da frase é o rollback do pedido):** "Autorizo a T1 parte 2 (2026-10-17): aplicar em produção, à mão, só as 5 instruções do escopo (2 enums, tenant_storefronts com os dois checks, properties.featured e a FK de tenant_storefronts), numa transação com lock_timeout de 5 s, e conferir depois os checks em pg_constraint e o índice document_ca…". O pedido do executor, na mesma conversa, trazia o rollback abaixo.

**Por que à mão:** a parte 1 achou 28 instruções de ruído do `drizzle-kit` além das 5 do escopo (gatilho de parada); o usuário escolheu aplicar só as 5, o mesmo caminho do L15 (T11). O `drizzle-kit push` não foi executado em produção.

**Comando:** `npx tsx scratch/l16c-t1-aplicar.ts --alvo=producao` (script temporário em `scratch/`, fora do git). Uma transação com `set local lock_timeout = '5s'`; pré-condição: aborta sem escrever se algum objeto da vitrine já existir. As 5 instruções são as do plano, copiadas literalmente: `CREATE TYPE storefront_font`, `CREATE TYPE storefront_layout`, `CREATE TABLE tenant_storefronts` (com os dois checks dentro), `ALTER TABLE properties ADD COLUMN featured boolean DEFAULT false NOT NULL` e `ALTER TABLE tenant_storefronts ADD CONSTRAINT tenant_storefronts_tenant_id_tenants_id_fk` (FK para `tenants`, `ON DELETE cascade`).

**Saída (sem segredo), host `ep-gentle-brook-…`:**

```
antes: {"tabela":false,"coluna":false,"enums":0,"tenants":3,"properties":12}
instrução 1/5 ok … instrução 5/5 ok
COMMIT feito.
contagens depois: {"tenants":3,"properties":12,"storefronts":0}
```

**Conferências (ATIV-02 AC2):**

| Conferência | Resultado |
| --- | --- |
| Checks em `pg_constraint` de `tenant_storefronts` | `tenant_storefronts_accent_color_check` (c) e `tenant_storefronts_active_requires_identity_check` (c) presentes; também `tenant_storefronts_pkey` (p) e `tenant_storefronts_tenant_id_tenants_id_fk` (f). Nenhum check faltou, então não foi preciso aplicá-los pelo SQL da vitrine |
| `properties.featured` | `boolean`, `NOT NULL`, default `false` |
| Enums | `storefront_font = inter, montserrat, lora, playfair`; `storefront_layout = grade, editorial` |
| Índice `document_categories_tenant_id_lower_name_idx` | **existe** (nunca foi derrubado neste caminho, então não houve recriação; a pendência do L16b fica atendida por conferência) |
| Dados | 3 tenants e 12 imóveis, iguais a antes; `tenant_storefronts` vazia |

**Rollback (ordem importa: tabela antes dos tipos):**

```sql
DROP TABLE tenant_storefronts;
ALTER TABLE properties DROP COLUMN featured;
DROP TYPE storefront_layout;
DROP TYPE storefront_font;
```

O CRM em produção hoje não lê nada disso (objetos aditivos, com default), então o deploy atual não é afetado.

## Views em produção (T2, 2026-10-17)

**Autorização do usuário (2026-10-17, no chat):** "Autorizo a T2 (2026-10-17): aplicar em produção só a seção de schema e views do vitrine.sql (script l16c-t2-views, uma transação, conferência das colunas antes do COMMIT). Rollback: DROP SCHEMA vitrine CASCADE."

**Comando:** `npx tsx scratch/l16c-t2-views.ts --alvo=producao` (script temporário em `scratch/`, fora do git). Aplica só a seção 2 de `scripts/vitrine/vitrine.sql` (55 linhas, sha256 `4c6f81041c1e7aa1…`): `create schema if not exists vitrine;` e `create or replace view vitrine.lojas` e `vitrine.imoveis`, ambas `with (security_barrier = true)`. Sem papel, grant nem senha (o script aborta se a fatia tiver `role` ou `grant`). Uma transação com `lock_timeout` de 5 s; as colunas são conferidas antes do `COMMIT`. Antes de produção, o mesmo script foi provado no banco de teste em `--simular` (sempre `ROLLBACK`).

**Saída (sem segredo), host `ep-gentle-brook-…`:**

```
antes: {"tabela":true,"schema_vitrine":false,"tenants":3}
seção executada dentro da transação
vitrine.lojas: 17 colunas, iguais a STOREFRONT_VIEW_COLUMNS (mesma ordem): true
vitrine.imoveis: 16 colunas, iguais a STOREFRONT_VIEW_COLUMNS (mesma ordem): true
views e opções: [["imoveis",["security_barrier=true"]],["lojas",["security_barrier=true"]]]
linhas nas views (dono): {"lojas":0,"imoveis":0}
COMMIT feito.
```

**Resultado (ATIV-02):** colunas das duas views conferidas contra `STOREFRONT_VIEW_COLUMNS` (`src/lib/storefront-contract.ts`), `security_barrier` nas duas, views vazias porque nenhuma loja está ativa. O papel `krivo_vitrine` ainda não existe.

**Rollback:** `DROP SCHEMA vitrine CASCADE;` (remove as views e nada mais; a tabela e a coluna da T1 ficam).

## Papel e grants em produção (T3, 2026-10-17)

**Autorização do usuário (2026-10-17, no chat):** "Autorizo a T3 (2026-10-17): criar em produção, por SQL e sem senha, o papel krivo_vitrine e os dois grants (script l16c-t3-papel, uma transação, conferência antes do COMMIT). Rollback: REVOKE ALL ON SCHEMA vitrine FROM krivo_vitrine; DROP OWNED BY krivo_vitrine; DROP ROLE krivo_vitrine."

**Comando:** `npx tsx scratch/l16c-t3-papel.ts --alvo=producao` (script temporário em `scratch/`, fora do git). Aplica só a seção 3 de `scripts/vitrine/vitrine.sql` (14 linhas, sha256 `920959f316278fa9…`): `create role krivo_vitrine login` (só se não existir, por SQL, nunca pelo console do Neon), `alter role … set default_transaction_read_only = on`, `alter role … set statement_timeout = '5s'`, `grant usage on schema vitrine` e `grant select on vitrine.lojas, vitrine.imoveis`. **Sem senha** (o script aborta se a fatia contiver `password`). Uma transação com `lock_timeout` de 5 s; a conferência vem antes do `COMMIT` e qualquer divergência faz `ROLLBACK`. Antes de produção, o mesmo script foi provado no banco de teste em `--simular` (sempre `ROLLBACK`); a primeira simulação falhou por uma consulta minha a `pg_authid` (exige superusuário) e foi corrigida para `pg_roles` antes de qualquer execução em produção.

**Saída (sem segredo), host `ep-gentle-brook-…`:**

```
antes: {"papel":false,"schema_vitrine":true,"views":2}
seção executada dentro da transação
papel: {"login":true,"super":false,"createrole":false,"createdb":false,"replication":false,"bypassrls":false,
        "config":["default_transaction_read_only=on","statement_timeout=5s"]}
membro de: []
grants de tabela: ["vitrine.imoveis:SELECT","vitrine.lojas:SELECT"]
acessos: {"vitrine_usage":true,"public_create":false,"tenants_select":false,"properties_select":false,"storefronts_select":false}
COMMIT feito.
```

**Resultado (ATIV-02 AC3):** o papel foi criado sem senha, sem atributos de privilégio e sem associação a papel algum (inclui `neon_superuser`); tem exatamente os dois grants `SELECT` e `USAGE` no schema `vitrine`; sem `CREATE` em `public` e sem `SELECT` em `tenants`, `properties` e `tenant_storefronts`. A conferência de catálogo da T5 (F18), depois da senha, repete e completa isso em leitura separada.

**Rollback:**

```sql
REVOKE ALL ON SCHEMA vitrine FROM krivo_vitrine;
DROP OWNED BY krivo_vitrine;
DROP ROLE krivo_vitrine;
```

## Senha do papel (T4, 2026-10-17, ação do usuário)

**Confirmação do usuário (2026-10-17, no chat):** "T4 feita (2026-10-17): defini a senha do papel krivo_vitrine no editor SQL do Neon de produção e montei a URL pooler para mim. Nenhum valor foi compartilhado. Rollback: ALTER ROLE krivo_vitrine PASSWORD NULL."

O usuário rodou `ALTER ROLE krivo_vitrine PASSWORD '<senha>'` no editor SQL do Neon de produção e montou, para si, a URL pooler do papel (destino: `VITRINE_DATABASE_URL`, T7). O executor não viu, digitou nem registrou a senha nem a URL; o login do papel só será exercido no primeiro deployment da vitrine (T7), não por este lote.

**Rollback:** `ALTER ROLE krivo_vitrine PASSWORD NULL;`

## Conferência do papel em produção (T5, 2026-10-17, F18)

**Autorização do usuário (2026-10-17, no chat):** "Autorizo a T5 (2026-10-17): rodar em produção a conferência do papel krivo_vitrine por consulta de catálogo, só leitura (script l16c-t5-conferencia). Se algo divergir, mostre antes de aplicar o rollback da T3. Rollback da conferência: nenhum."

**Comando:** `npx tsx scratch/l16c-t5-conferencia.ts --alvo=producao` (script temporário em `scratch/`, fora do git). Uma conexão `READ ONLY`, só `select` em catálogo; não usa a senha do papel nem a URL dele. Antes de produção, o mesmo script foi validado no banco de teste.

**Saída (sem segredo), host `ep-gentle-brook-…`:**

```
objetos com algum privilégio (exatamente 2 esperados): ["vitrine.imoveis:SELECT","vitrine.lojas:SELECT"]
role_table_grants: ["vitrine.imoveis:SELECT","vitrine.lojas:SELECT"]
schemas (usage/create): ["neon_auth:--","public:U-","vitrine:U-"]
membro de (nenhum esperado): []
pg_has_role(krivo_vitrine, neon_superuser, member): {"e_membro":false,"existe":true}
papel: {"rolcanlogin":true,"rolsuper":false,"rolcreaterole":false,"rolcreatedb":false,"rolreplication":false,"rolbypassrls":false,
        "rolconfig":["default_transaction_read_only=on","statement_timeout=5s"],"rolconnlimit":-1,"rolvaliduntil":null}
donos das views: ["imoveis:outro","lojas:outro"]
RESULTADO: tudo conforme (F18 confirmada).
```

**Resultado (ATIV-02 AC4 e AC5):** o papel tem **exatamente os dois grants** (`SELECT` em `vitrine.imoveis` e `vitrine.lojas`) em todos os schemas do banco, `USAGE` só em `vitrine` (e `public`, de todos) e nenhum `CREATE`; **não é membro de `neon_superuser`** nem de papel algum; `default_transaction_read_only=on` e `statement_timeout=5s`; sem atributos de privilégio; não é dono de view. Nenhuma divergência, então o rollback da T3 **não** foi aplicado.

**Rollback:** nenhum (somente leitura). O rollback da T3 segue disponível, se necessário.

## Resumo da Phase 1 (T0 a T5)

Schema (T1), views (T2) e papel (T3) estão em produção, a senha foi definida pelo usuário (T4) e a conferência por catálogo passou (T5). O índice `document_categories_tenant_id_lower_name_idx` existe (conferido na T1; o `drizzle-kit push` nunca rodou em produção). Falta a Phase 2: T15 (usuário), T6 (Full e push), T16, T17 e T18.

## Preparo da renomeação na Vercel (T15, 2026-10-17, ação do usuário)

**Confirmação do usuário (2026-10-17, no chat):** "T15 feita (2026-10-17): criei KRIVO_OPERATOR_ALERT_EMAIL no Production do CRM com o mesmo valor da CRIVO_OPERATOR_ALERT_EMAIL (a antiga continua) e ajustei o nome de exibição do RESEND_FROM para Krivo. Nenhum valor foi compartilhado."

O usuário criou `KRIVO_OPERATOR_ALERT_EMAIL` no Production do CRM com o valor da variável antiga, que fica até a T18, e ajustou o nome de exibição de `RESEND_FROM` para Krivo (ATIV-07 AC1). O executor não leu nem registrou nenhum valor e não consultou o painel. O CRM atual ignora a variável nova, então nada muda até o push da T6.

**Rollback:** remover `KRIVO_OPERATOR_ALERT_EMAIL` e restaurar o nome de exibição anterior de `RESEND_FROM`.

## Suíte, auditoria e levantamento do n8n antes do push (T6, 2026-10-17)

**Nada foi enviado nem escrito em produção ou no n8n nesta seção.** O `git push` não foi pedido: a Full reprovou fora das instabilidades conhecidas (gatilho de parada da T6).

### Auditoria de trailers (AD-014)

| Recorte | Commits | Ocorrências de `Co-Authored-By`, `Generated with`, `Claude Code`, `noreply@anthropic` |
| --- | --- | --- |
| `origin/main..HEAD` (a publicar) | 93 | **0** |
| `origin/main` inteiro | 684 | **0** |

`origin/main` = `ee13d52`, HEAD = `dff7b80`; o push seria fast-forward (`origin/main` é ancestral de HEAD). Os 93 commits têm um só autor e committer.

### Levantamento por leitura dos workflows publicados do n8n (MCP, `get_workflow_details`)

Cinco workflows ativos chamam o contrato do CRM com o cabeçalho `X-Crivo-Tenant` (só esse nome; nenhum `X-Crivo-Anchor-Message-Id` nem `X-Crivo-Agent-State-Revision` nas versões publicadas). Em todos `versionId` = `activeVersionId`:

| Workflow | ID | `activeVersionId` | Nós com `X-Crivo-Tenant` |
| --- | --- | --- | --- |
| `crivo-agente-principal` | `0B1nqjODu7xuYYKF` | `ddb63ae8-f02f-4e6a-a1b6-3cb05d4b229b` (65 nós) | 11 |
| `crivo-agente-scheduler` | `gmIWxiRrHGIdtPub` | `f1c4ac52-0332-4330-a112-723d60cda738` (41 nós) | 8 |
| `crivo-tool-responder-lead` | `Li2hgCX943zKmDXf` | `d8e9931e-aced-4233-a019-f25b353ee614` | 2 |
| `crivo-tool-agendar-reuniao` | `2qCs6rPzmeOqan65` | `931b8a13-9bbc-431b-a198-0de8e4371d80` (14 nós) | 1 |
| `crivo-benchmark-contexto` | `xpsD2PZQ1KoE2sA5` | `22fe002c-dbda-4b0a-a068-4b69aa3998a3` (14 nós) | 1 |

Fora da T16: `crivo-agente-erros` (`73Yx70RMJrpLiYQn`, ativo; só o texto `[crivo]` no assunto do e-mail, sem contrato), `crivo-reengagement-contextual` (`q3GKsdptqp58Hq6O`, L14b, **inativo**, não deve ser tocado), `crivo-smoke-memoria` e `crivo-smoke-reset` (inativos). As URLs dos nós apontam para o endereço real da Vercel (`crivo-arthur1050s-projects.vercel.app`), que continua válido e não muda (AD-047). O código do CRM lê `X-Krivo-Tenant` (`src/server/integration/auth.ts`).

### Full (`npm test`), HEAD `dff7b80`, 2026-10-17 13:04 (1210 s)

`npm test`: **exit 1**, `Test Files 7 failed | 233 passed (240)`, `Tests 35 failed | 3797 passed (3832)`. Mesmos 240 arquivos e 3832 testes do fechamento do L16b (que passou com exit 0 no `dff1775`); nenhum teste foi alterado, pulado ou apagado. `npm run vitrine:e2e` **não foi rodado** (a sequência para na falha).

| Arquivo | Falhas | Causa vista no log |
| --- | --- | --- |
| `src/db/__tests__/seed.test.ts` | 19 | `delete from "conversations"`/`"messages"` no `runSeed` recusado por FK `23503` (`human_message_sends_message_id_messages_id_fk`, 8 vezes) |
| `src/server/integration/__tests__/maintenance.integration.test.ts` | 14 | instabilidade **conhecida** (asserções de contagem 0/1 e timeout) |
| `src/lib/__tests__/vitrine-isolamento.test.ts` | 2 | "o lint da raiz ignora vitrine/…": ESLint estourou 30 s (`Test timed out in 30000ms`) |
| `src/server/reengagement/__tests__/tick.test.ts` | 1 | `insert into "whatsapp_channels"` com `23505` (`whatsapp_channels_phone_number_id_idx`, chave duplicada) |
| `src/server/data/__tests__/integration-refusals.test.ts` | 1 | não detalhado |
| `src/server/data/__tests__/conversation-reads.test.ts` | 1 | não detalhado |
| `src/server/__tests__/actions.test.ts` | 1 | não detalhado |

**Leitura somente leitura do banco de teste depois da suíte** (`scratch/l16c-t6-sobra-teste.ts`): `human_message_sends` 0, `whatsapp_channels` 0, 3 tenants (`krivo-demo`, `triangulo`, `vale-uberaba`), 0 outras conexões. Não há sobra persistente que explique as falhas de FK e de chave duplicada. Esses erros (FK pendente de outra tabela, `phone_number_id` duplicado, estouro de 30 s do ESLint) têm cara de interferência entre arquivos ou de carga durante a execução, mas **a causa não está estabelecida** e não foi reproduzida; nenhum processo de teste estava ativo depois.

**Resultado:** gatilho de parada ("Full falhar fora das instabilidades conhecidas"), então a T6 **não** segue para o push. Rollback desta seção: nenhum (só leitura e testes locais).

## Levantamento dos workflows publicados do n8n (pré-T6, 2026-10-17, somente leitura)

Leitura pelo MCP do n8n (`search_workflows` e `get_workflow_details`), sem escrever. Os JSONs lidos ficaram só no cache local da ferramenta; o JSON de cada workflow será guardado em `scratch/` (fora do git) no momento da T16, logo antes de cada troca. Para cada um, `versionId` = `activeVersionId` e os nós publicados são idênticos aos do rascunho.

| Workflow | ID | Ativo | Versão publicada | Nós | Nós com `X-Crivo-Tenant` | Observação |
| --- | --- | --- | --- | --- | --- | --- |
| `crivo-agente-principal` | `0B1nqjODu7xuYYKF` | sim | `ddb63ae8…` | 65 | 11 | chama o contrato |
| `crivo-agente-scheduler` | `gmIWxiRrHGIdtPub` | sim | `f1c4ac52…` | 41 | 8 | chama o contrato |
| `crivo-tool-responder-lead` | `Li2hgCX943zKmDXf` | sim | `d8e9931e…` | 11 | 2 | chama o contrato |
| `crivo-tool-agendar-reuniao` | `2qCs6rPzmeOqan65` | sim | `931b8a13…` | 14 | 1 | chama o contrato |
| `crivo-benchmark-contexto` | `xpsD2PZQ1KoE2sA5` | sim (webhook manual) | `22fe002c…` | 14 | 1 | só `GET /settings`; é benchmark manual, decisão do usuário se entra na T16 |

**Fora da T16:** `crivo-agente-erros` (`73Yx70RMJrpLiYQn`, ativo): sem cabeçalho do contrato (só Error Trigger e Gmail). `crivo-reengagement-contextual` (`q3GKsdptqp58Hq6O`, inativo, L14b não ativado), `crivo-smoke-memoria` e `crivo-smoke-reset` (inativos): não são publicados e não serão tocados.

**Diferença de marca prevista:** só o `name` do cabeçalho `X-Crivo-Tenant` → `X-Krivo-Tenant` (23 nós no total). As demais ocorrências de "crivo" ficam: o endereço real da Vercel (`crivo-arthur1050s-projects.vercel.app`, continua válido, AD-047), comentários de código que citam nomes de workflow e o path do webhook do benchmark. Nenhum workflow interpreta a URN `urn:crivo:problem:*` do CRM.

**Método da T16 (a confirmar na autorização):** `update_workflow` com operações atômicas `setNodeParameter` apenas no nome do cabeçalho de cada nó, `publish_workflow` da versão nova e conferência de `versionId` = `activeVersionId`. Rollback: `restore_workflow_version` da versão anterior (ids acima) e `publish_workflow`.

## Preparo da renomeação na Vercel (T15): registro do usuário

O commit `dff7b80` (autor e committer `Arthur1050`, feito pelo usuário numa outra janela) registra a T15: `KRIVO_OPERATOR_ALERT_EMAIL` criada no Production do CRM com a antiga mantida, e o nome de exibição de `RESEND_FROM` ajustado. O executor não leu nem verificou valores. A confirmação da T15 nesta conversa será pedida junto com a autorização do push.

## Suíte completa da T6, primeira rodada (2026-10-17): FALHOU fora das instabilidades conhecidas

**Comando:** `npm test` no `HEAD` `dff7b80`, uma vez, em segundo plano (início 16:04:36 UTC, 1210 s). Nenhum push.

**Resultado:** `Test Files 7 failed | 233 passed (240)`, `Tests 35 failed | 3797 passed (3832)`, saída 1.

| Arquivo | Falhas | Causa vista no log |
| --- | --- | --- |
| `src/server/integration/__tests__/maintenance.integration.test.ts` | 9 | instabilidade conhecida (timeout) |
| `src/lib/__tests__/vitrine-isolamento.test.ts` | 1 | `Test timed out in 30000ms` (ESLint sob carga) |
| `src/db/__tests__/seed.test.ts` | 35 testes (suite) | `delete from "conversations"` falhou; o seed viu 5 tenants em vez de 3 |
| `src/server/__tests__/actions.test.ts` | 1 | 3 categorias em vez de 4 |
| `src/server/data/__tests__/conversation-reads.test.ts` | 1 | `duplicate key` em `messages_pkey` |
| `src/server/data/__tests__/integration-refusals.test.ts` | 1 | 0 linhas em vez de 1 |
| `src/server/reengagement/__tests__/tick.test.ts` | 1 | `23505` `phone_number_id` `430000000000011` já existe |

**Diagnóstico (não substitui o gate):** o padrão (tenants a mais, chave duplicada, linha ausente) é de dois processos escrevendo nas mesmas branches de teste. Depois da suíte, as 5 branches de teste estão limpas (3 tenants cada, só conexões `idle` do pool). Os 7 arquivos, rodados isolados na branch base (`npx vitest run <os 7 arquivos>`, 318 s), passam: `Test Files 7 passed (7)`, `Tests 183 passed (183)`, inclusive o `maintenance.integration`. Não há como provar a origem da interferência (a outra janela do usuário estava ativa no mesmo horário).

**Resultado da T6:** gatilho de parada (Full fora das instabilidades conhecidas). **Sem push.** `npm run vitrine:e2e` não foi rodado nesta rodada. Rollback: nenhum (só leitura e testes locais).

## Suíte completa da T6, segunda rodada (2026-10-17): FALHOU de novo; parada por "mesma task falhando duas vezes"

**Autorização do usuário (2026-10-17, no chat):** "Autorizo repetir o npm test uma vez (2026-10-17), depois o vitrine:e2e uma vez. Confirmo que nenhuma outra janela minha está usando os bancos de teste agora e que não vou rodar testes enquanto isso. Sem push: o push pedirei à parte."

**Comando:** `npm test` no `HEAD` `ce6321c`, uma vez, em segundo plano (início 15:38:31 local, 1220 s). Árvore limpa antes da rodada.

**Resultado:** `Test Files 2 failed | 238 passed (240)`, `Tests 3 failed | 3829 passed (3832)`, saída 1. Todas as 3 falhas são `Test timed out in 30000ms` (ou consequência de um):

| Teste | Falha |
| --- | --- |
| `vitrine-isolamento.test.ts` > o lint da raiz ignora `vitrine/`… | timeout de 30 s (também falhou na 1ª rodada) |
| `maintenance-alert.integration.test.ts` > alerta que lança… (AC3) | timeout de 30 s |
| `maintenance-alert.integration.test.ts` > com a dependência, o grupo roda… | `called 2 times` (chamada pendente do teste anterior que estourou o tempo) |

O `maintenance.integration.test.ts` (instabilidade conhecida) desta vez passou. Os 7 arquivos da 1ª rodada que não eram da lista conhecida (`seed`, `actions`, `conversation-reads`, `integration-refusals`, `tick`) passaram na 2ª.

**Diagnóstico (não substitui o gate):**

- Os dois arquivos rodados isolados (`npx vitest run` na branch base, 20 s): `Test Files 2 passed (2)`, `Tests 18 passed (18)`. O teste do ESLint leva **1,7 s** sozinho contra o timeout de 30 s dentro da suíte paralela, o que indica falta de CPU sob a carga de 4 workers e não defeito.
- **O código testado é idêntico ao da última suíte completa verde.** Entre `dff1775` (L16b, `npm test` 240 arquivos, 3832 testes, saída 0, sem timeout, 2026-10-13) e o `HEAD` há 16 commits, e `git diff --stat dff1775 HEAD -- . ':!.specs' ':!docs'` está vazio: só `.specs` mudou.
- Somando as duas rodadas, nenhum teste falhou de forma reproduzível: as falhas da 1ª rodada (contaminação) não se repetiram na 2ª, e as da 2ª (timeouts) passam isoladas.

**Resultado da T6:** gatilhos de parada (Full fora das instabilidades conhecidas, duas vezes; mesma task falhando duas vezes). **Sem push.** `npm run vitrine:e2e` **não** foi rodado (a parada veio antes dele). Rollback: nenhum (só testes locais).

## T6: exceção ao gate Full, vitrine:e2e e auditoria de trailers (2026-10-17)

**Decisão do usuário (2026-10-17, no chat), sobre o gate Full da T6:** "Decisão (2026-10-17): aceito a evidência como exceção registrada ao gate Full da T6. O código é idêntico ao da última suíte verde (dff1775) e as falhas de hoje são carga que passam isoladas. Rode o vitrine:e2e e a auditoria de trailers; depois peça o push."

**Instrução permanente do usuário (2026-10-17, no chat):** "Sempre que houver a necessidade de pedir permissão, apenas execute. Quando houver casos relevantes de escolhas entre duas opções, despache um agente opus 5.5 no alto para que ele tome a melhor escolha recomendada por ele. No final, apenas me informe de forma resumida o que foi feito. Não pare mais a execução, apenas em casos críticos e necessários." A partir daqui as ações externas restantes da janela A (push, T16, T17) seguem sem novo pedido, com os mesmos limites de segurança do prompt da janela (sem segredo, sem `--force`, sem `--no-verify`, sem publicar os gerados de `main`, sem criar nem ativar workflow, subscription ou credencial) e com as mesmas paradas críticas.

**Evidência que sustenta a exceção:** duas rodadas de `npm test` sem falha reproduzível (1ª: 7 arquivos por contaminação entre processos, todos passam isolados; 2ª: 3 timeouts de 30 s sob carga, passam isolados, o teste do ESLint leva 1,7 s sozinho); o código é idêntico ao da suíte verde do L16b (`dff1775`, 240 arquivos, 3832 testes, exit 0), pois os commits desde então mudaram só `.specs`. Outra janela do usuário também rodava a suíte no mesmo período (commit `48364f0`, 13:26), o que explica a interferência.

**`npm run vitrine:e2e` (uma vez, `HEAD` `d086af2`, árvore limpa, 59 s):** `vitrine:e2e -> 66 de 66 asserções passaram`, exit 0.

**Auditoria de trailers (AD-014), após `git fetch origin main`:** `origin/main` = `ee13d52` (684 commits). `origin/main..HEAD` = 96 commits, `HEAD` descendente de `origin/main` (o push é fast-forward). Busca por `co-authored-by`, `generated with`, `claude code`, `noreply@anthropic`, `generated by claude`, `🤖` nas mensagens completas: **0 ocorrências** em `origin/main..HEAD`, **0** em `origin/main` inteiro, **0** no `HEAD` inteiro. O único commit cujo assunto contém "claude" é `f9113d1` ("aponta CLAUDE.md para o historico de decisao do projeto"), sem atribuição.

## T6: push e deployment (2026-10-17)

**Autorização:** decisão do usuário sobre o gate e instrução permanente de executar sem novos pedidos (seção anterior). Os limites do prompt da janela continuaram valendo.

**Comando:** `git push origin main` (sem flags de força), às 20:14:44Z, depois de nova auditoria de trailers (`origin/main` = `ee13d52` inalterado, 97 commits a publicar, `HEAD` descendente de `origin/main`, 0 ocorrências em `origin/main..HEAD` e em `origin/main`, árvore limpa). Saída: `ee13d52..19fd8be  main -> main`.

**Hash e commits:** `origin/main` passou de `ee13d52` para `19fd8be`; 97 commits, todos com um só autor e committer, sem trailer de atribuição.

**Deployments (projeto Vercel `crivo`, `prj_O9vEsQZlWqMRRkaIn7llpoHh8dNx`):**

| | Deployment | Commit | Estado |
| --- | --- | --- | --- |
| Novo (produção) | `dpl_hzTEYjvfS6vRSBpKRXYWX5SGNjff` (`crivo-59uywc0c6-…vercel.app`) | `19fd8be` | READY às 20:16:51Z (criado 20:14:42Z) |
| Anterior (rollback) | `dpl_5fRN1TqZFC7iUWQt95iNhekgjYM8` | `ee13d52` | READY, `isRollbackCandidate: true` |

O deployment da vitrine não existe ainda (projeto separado, T7 do usuário). A branch de um bot (`sentinel-fix-cron-secret-timing-attack-…`) também tem um deployment de preview na Vercel; não é de produção e não foi tocado.

**Rollback do push:** redeploy do `dpl_5fRN1TqZFC7iUWQt95iNhekgjYM8` na Vercel (a coluna e as tabelas novas são aditivas e ficam).

## Cabeçalho do contrato no n8n (T16, 2026-10-17)

**Autorização:** instrução permanente do usuário ("apenas execute", seção anterior). Escopo: só o nome do cabeçalho `X-Crivo-Tenant` → `X-Krivo-Tenant`; os gerados de `main` **não** foram publicados, nenhum workflow, subscription ou credencial foi criado ou ativado, e o L14b (`crivo-reengagement-contextual`, inativo) não foi tocado.

**Janela:** o deployment do CRM novo ficou READY às **20:16:51Z**; a última publicação no n8n terminou às **20:18:51Z**. Janela de 2 minutos; nenhum tick do agendador (`:00`, `:15`, `:30`, `:45`) caiu dentro dela (20:15:00 antes, 20:30:00 depois).

**Método:** JSON publicado de cada workflow guardado antes em `scratch/n8n-antes/` (fora do git, sem segredo; as datas `updatedAt` conferidas iguais às da leitura inicial); `update_workflow` com `setNodeParameter` em `/headerParameters` de cada nó (objeto copiado do JSON publicado, mudando só o `name`), o que cria só um **rascunho** (a produção segue na versão ativa); comparação nó a nó do rascunho com o publicado de antes (`scratch/l16c-n8n-diff.py`, que só aceita a troca do nome do cabeçalho; qualquer outra diferença em nós, conexões ou settings pararia a ação); só então `publish_workflow`.

| Workflow | ID | Versão antes | Versão nova (ativa) | Nós trocados | Diferença além da marca |
| --- | --- | --- | --- | --- | --- |
| `crivo-agente-principal` | `0B1nqjODu7xuYYKF` | `ddb63ae8` | `9ef9ce9e` | 11 | nenhuma (65 nós, conexões e settings iguais) |
| `crivo-agente-scheduler` | `gmIWxiRrHGIdtPub` | `f1c4ac52` | `e31c635e` | 8 | nenhuma (41 nós) |
| `crivo-tool-responder-lead` | `Li2hgCX943zKmDXf` | `d8e9931e` | `f4f43c06` | 2 | nenhuma (expressões copiadas do JSON lido; sem comparador porque o JSON veio inline e não foi salvo) |
| `crivo-tool-agendar-reuniao` | `2qCs6rPzmeOqan65` | `931b8a13` | `c5291b3f` | 1 | nenhuma (14 nós; a sonda também provou que a versão ativa ficou intacta até o publish) |
| `crivo-benchmark-contexto` | `xpsD2PZQ1KoE2sA5` | `22fe002c` | `d316b342` | 1 | nenhuma (14 nós) |

`get_workflow_history` mostra, para os cinco, a versão nova como a mais recente e igual à devolvida por `publish_workflow` como `activeVersionId` (`versionId` = `activeVersionId`). Os avisos de validação do `update_workflow` (nós `Google Calendar`, `Chat Memory Manager` e `OpenAI Chat Model`) já existiam e não vêm das operações. O `crivo-tool-responder-lead` tem 14 nós (o levantamento anterior listou 11 por engano).

**Descoberta antes da T17:** o `tenantSlug` que o agente envia vem da Data Table `tenant_config` do n8n (`phoneNumberId` → `tenantSlug`), não do JSON dos workflows. A última execução real do principal (webhook, 2026-10-07, execução 3509) lê `triangulo`, não `crivo-demo`, então a renomeação do slug demo não afeta o agente. A tabela não é lida pelo MCP; o risco residual é uma linha `crivo-demo` na `tenant_config` (sem uso nas execuções vistas).

**Rollback da T16 (corrigido em 2026-10-17):** **não** é mais o `restore_workflow_version`. A retenção do histórico do n8n podou as versões anteriores logo depois da troca (`get_workflow_history` mostra só a versão nova nos 5 workflows, e `get_workflow_version` da versão antiga responde "not found ... pruned"). O rollback é reverter o nome do cabeçalho com `update_workflow` (`setNodeParameter` em `/headerParameters`, restaurando `X-Crivo-Tenant` com a mesma expressão) e `publish_workflow`. As operações inversas dos 5 workflows estão prontas em `scratch/n8n-antes/reverso-<id>.json` (fora do git; geradas dos JSONs publicados de antes, e, no `crivo-tool-responder-lead`, dos valores lidos no levantamento, porque o JSON dele veio inline e não foi salvo); se preciso, também o redeploy do `dpl_5fRN1TqZFC7iUWQt95iNhekgjYM8` do CRM. Os JSONs de antes de 4 dos 5 workflows continuam em `scratch/n8n-antes/` e são a cópia de segurança.

## SQL da marca em produção (T17, 2026-10-17)

**Autorização:** instrução permanente do usuário ("apenas execute"). Travas do prompt conferidas antes de aplicar: o papel `crivo_vitrine` **não** existe e os dois tenants de demonstração **não** coexistem.

**Leitura antes (somente leitura, `scratch/l16c-t17-marca.ts --ver`):** papéis presentes `["krivo_vitrine"]`; tenants de demonstração `["crivo-demo"]`; 5 usuários `@crivo.com.br` (todos do tenant `crivo-demo`, e os únicos do banco); tenant `crivo-demo` (`a0744420-585f-4c83-a096-2c348cb57511`, nome `Crivo Demo`, site `https://crivo.com.br`, apresentação do agente com "Crivo Demo", logo `null`); **nenhum** tenant com `logo` contendo `crivo_white_symbol`. Valores anteriores guardados em `scratch/l16c-t17-rollback.json` (fora do git).

**Comando:** `npx tsx scratch/l16c-t17-marca.ts --aplicar` (executa `scripts/brand/rename-to-krivo.sql` inteiro, com o `begin`/`commit` do próprio script), às 20:19:34Z.

**Linhas afetadas, conferidas por consulta depois:**

| Alvo | Linhas | Resultado |
| --- | --- | --- |
| `public.users` (`@crivo.com.br` → `@krivo.com.br`, tenant demo) | 5 | 5 com `@krivo.com.br`, 0 restantes com `@crivo.com.br` |
| `public.tenants` (slug, nome, site, apresentação do `crivo-demo`) | 1 | `krivo-demo` / `Krivo Demo` / `https://krivo.com.br`; os outros 2 tenants (`triangulo`, `vale-uberaba`) intactos |
| `public.tenants.logo` (assets antigos) | 0 | nada a trocar (todas as logos são `null`); 0 com nome antigo |
| Papel | 0 | `krivo_vitrine` único, sem `crivo_vitrine` |
| Contagens | — | 3 tenants, 17 usuários, 12 imóveis (iguais a antes) |

**Assets da marca no CRM novo (`curl -I`, produção):** `krivo_white_symbol.png` 200 `image/png`; `krivo_white_symbol_and_tipography_horizontal.svg` e `…_vertical.svg` 200 `image/svg+xml`; os antigos `crivo_white_symbol.png` e `crivo_white_symbol_and_tipography_horizontal.png` respondem 404 (o CRM novo já não os serve).

**Rollback (UPDATE inverso, valores anteriores acima):**

```sql
begin;
update public.users set email = replace(email, '@krivo.com.br', '@crivo.com.br')
 where id in ('7b04f4c2-3d0d-46c1-b527-9ed1813bb346', '0cef81ec-f5d4-47b5-a885-41c611464453',
              'f15256d2-b6ab-403b-84a2-862cb5a389f5', '69a59572-0454-4f57-8f6d-c408307315a7',
              'ef8ac13b-1ed5-4402-b9b1-3c76ec819498');
update public.tenants set slug = 'crivo-demo', name = 'Crivo Demo', website = 'https://crivo.com.br',
       agent_presentation_message = replace(agent_presentation_message, 'Krivo Demo', 'Crivo Demo')
 where id = 'a0744420-585f-4c83-a096-2c348cb57511';
commit;
```

## Conferência da renomeação (T18, 2026-10-17)

**Autorização:** instrução permanente do usuário ("apenas execute"). Somente leitura.

**Execução real do agente depois da troca:** `crivo-agente-scheduler`, execução **4499** (trigger de 15 min, 20:30:00Z, versão nova `e31c635e` ativa, `success`). O nó `HTTP: GET /memory-resets (purga pedida pelo CRM)` chamou o CRM com `X-Krivo-Tenant` e recebeu o corpo válido `{"resets":[]}` (`executionStatus: success`, 2472 ms); sem 401. A execução anterior (4498, 20:15:00Z) ainda foi atendida pelo CRM antigo, antes da troca.

**Logs do CRM em produção** (`get_runtime_logs` do `dpl_hzTEYjvfS6vRSBpKRXYWX5SGNjff`, últimos 20 min, e `get_runtime_errors`, últimos 30 min): a única entrada é o aviso `SECURITY WARNING` de SSL do `pg`, que a Vercel marca como `error` por sair em `stderr` e que existe desde 2026-08-05 (rota `/api/v1/memory-resets`); **nenhum 401 do contrato e nenhum erro de leitura de imóveis**. Logs do n8n: as execuções 4498 e 4499 do agendador terminaram em `success`.

**Limite da prova:** o fluxo do `crivo-agente-principal` (mensagem de WhatsApp recebida) não foi exercitado porque exige uma mensagem real; ele recebeu a mesma troca de cabeçalho, conferida nó a nó. A próxima mensagem real de lead é a confirmação; o agendador (a cada 15 min) segue provando o contrato.

**Variável antiga do alerta:** `CRIVO_OPERATOR_ALERT_EMAIL` **continua na Vercel**. Só o usuário a remove, e só depois de a nova estar em uso: a prova é o cron de manutenção das 03:00 UTC (Hobby, ±59 min) de **2026-10-18**, em que o log deve trazer `[manutencao] alerta` com o destinatário lido da `KRIVO_OPERATOR_ALERT_EMAIL`. Até lá a antiga fica.

**Rollback da renomeação:** T16 (restaurar a versão anterior de cada workflow) e T17 (UPDATE inverso) conforme as seções acima; redeploy do `dpl_5fRN1TqZFC7iUWQt95iNhekgjYM8` do CRM.

## Fim da janela A (2026-10-17)

T0 a T6 e T15 a T18 registradas. Em produção: schema da vitrine (T1), views (T2), papel `krivo_vitrine` sem senha própria do executor (T3, senha do usuário na T4), CRM novo com o código do L16a e do L16b (T6), cabeçalho `X-Krivo-Tenant` nos 5 workflows do n8n (T16) e SQL da marca (T17). **Pendente do usuário:** remover `CRIVO_OPERATOR_ALERT_EMAIL` depois do cron de 2026-10-18 03:00 UTC; janela B (T7 a T13: projeto da vitrine na Vercel, variáveis do CRM, redeploy, configurar a imobiliária piloto, capturas, frescor e prévia do WhatsApp). Nada da T7 em diante foi iniciado.

## T6: gate Full verde depois do push (2026-10-17, rodadas 3 e 4)

O push já tinha sido feito com a exceção do usuário ao gate Full (seção acima). Depois, para fechar o gate de forma legítima, rodei a suíte de novo no `HEAD` `29d6242`, cujo código é idêntico ao publicado em `19fd8be` (os 4 commits locais desde o push mudaram só `.specs`; `git diff --stat 19fd8be HEAD -- . ':!.specs'` vazio), com a máquina ociosa e nenhuma outra janela nos bancos de teste.

| Rodada | Resultado |
| --- | --- |
| 3ª `npm test` | `Test Files 1 failed | 239 passed (240)`, `Tests 3797 passed | 35 skipped (3832)`, saída 1. A única falha foi o `seed.test.ts`: `delete from "tenants"` recusado por FK `tenant_document_context_limits_tenant_id_tenants_id_fk` (23503), com 35 testes pulados. Nenhum timeout. Causa: 3 linhas de `tenant_document_context_limits` sobraram na branch do worker 3, deixadas por outro arquivo de teste (5 arquivos escrevem nessa tabela e o `seed.ts` não a limpa) |
| Limpeza | leitura somente leitura das 5 branches de teste achou `limites_doc = 3` só no worker 3; `delete from tenant_document_context_limits` nessa tabela de teste (3 linhas), com trava contra o host de produção. Nenhum teste foi alterado, pulado ou apagado. Produção não foi tocada |
| 4ª `npm test` | **`Test Files 240 passed (240)`, `Tests 3832 passed (3832)`, saída 0**, 1172 s, sem timeout |
| `npm run vitrine:e2e` (depois da suíte, nunca juntos) | **`66 de 66 asserções passaram`, saída 0** |

**Leitura do conjunto:** das 4 rodadas, as 2 primeiras falharam por interferência com outra janela do usuário e por carga (timeouts de 30 s que passam isolados), a 3ª por sobra de dado de um teste na branch do worker 3, e a 4ª, limpa, ficou verde. Os mesmos 240 arquivos e 3832 testes do fechamento do L16b (`dff1775`). **Ressalva de higiene (fix candidato no L16b, não feito aqui por ser código de teste):** o `seed.test.ts` falha se algum teste deixar linhas em `tenant_document_context_limits`; o `vitrine-isolamento.test.ts` (ESLint) estourou 30 s sob carga.

**Resultado da T6:** `npm test` verde e `vitrine:e2e` verde no código publicado, auditoria de trailers sem ocorrência e `git push origin main` sem flags de força, como a task descreve; a ordem foi invertida (push antes do verde) por decisão do usuário, registrada acima.

## T18: variável do alerta trocada pelo usuário e validação pelo WhatsApp (2026-10-18)

**Variável antiga (ação do usuário, 2026-10-18, no chat):** "Acabo de trocar o CRIVO_OPERATOR_ALERT_EMAIL pelo KRIVO_OPERATOR_ALERT_EMAIL na vercel." O executor não leu nem verificou valores nem consultou o painel. A prova pelo cron das 03:00 UTC **não é mais observável**: o plano Hobby guarda 1 hora de log do runtime (`get_runtime_logs` para a janela das 03:00 UTC respondeu 400 de retenção). A `KRIVO_OPERATOR_ALERT_EMAIL` existia no Production desde a T15 (antes do push), então o cron de 2026-10-18 03:00 UTC já rodou com o código novo, que só lê a nova; a confirmação direta fica para o cron de 2026-10-19 03:00 UTC (log `[manutencao] alerta` com destinatário presente, `skipped` diferente de `destinatario-ausente`).

**Validação do agente principal pelo WhatsApp (extensão do Chrome, 2026-10-18, pedido do usuário no chat):** o WhatsApp Web do usuário abriu na conta dele; só a conversa de teste "Test Number (Crivo)" (número comercial de teste, tenant `triangulo`) foi aberta, nenhuma outra conversa foi lida. Duas mensagens de teste foram enviadas, a pedido do usuário:

| Hora local | Mensagem enviada | Resposta do agente (WhatsApp) | Prova no n8n |
| --- | --- | --- | --- |
| 11:48 | "oi, vi o anúncio de um apartamento (teste do cabeçalho X-Krivo)" | "Oi, boa! Sou o Lucas, da Triângulo Imóveis…" (pede a referência do anúncio) | execução **4572** do `crivo-agente-principal` (`success`, 20 s): `HTTP: POST /leads (idempotente)` criou o lead de teste (`externalId` do número do usuário, `optedOutAt` nulo), `HTTP: GET /settings` devolveu as configurações da Triângulo Imóveis e `HTTP: POST /leads/{id}/messages (lead)` registrou a mensagem (`agentStateRevision` 1), todos `success` com dados reais, sem 401 |
| 11:49 | "Quais apartamentos vocês têm disponíveis para comprar, até uns 500 mil?" | lista `IM-0001` (Abadia, Uberlândia/MG, 2 quartos, 2 banheiros, 1 vaga, 72 m², R$ 380.000) e pergunta o bairro | execução **4577** do principal (`success`, 21 s) com a ferramenta `buscar_imoveis` (cabeçalho novo) e o sub-workflow `crivo-tool-responder-lead` execução **4579** (`success`, modo integrated, pai 4577): `HTTP: GET /leads/{id} (antes do envio)` leu o lead e `HTTP: registrar mensagem do agente` gravou a resposta do agente (`agentStateRevision` 2) |

**Resultado:** o fluxo real do agente (webhook do WhatsApp, principal, ferramenta de busca de imóveis e `responder-lead`) funciona de ponta a ponta com `X-Krivo-Tenant`, sem 401; o agendador (execução 4499) já tinha provado o contrato na T18. Fecha o "limite da prova" da seção T18 de 2026-10-17. Os workflows `crivo-tool-agendar-reuniao` e `crivo-benchmark-contexto` não foram exercitados nesta validação (a troca deles foi conferida nó a nó).

**Efeito colateral em produção, a pedido do usuário:** o lead de teste "Arthur T." (número do usuário, tenant `triangulo`, status `em_qualificacao`) foi criado no CRM de produção com 2 mensagens do lead e 2 respostas do agente. O usuário pode excluí-lo pelo CRM se não quiser mantê-lo. Aba do WhatsApp fechada ao fim.

## Projeto da vitrine na Vercel (T7, 2026-10-18, ação do usuário; conferência do executor por leitura)

**Quem fez:** o usuário criou o projeto `vitrine` (`prj_Y8y82Mr9zbiP4GGcoK8tq56GK8oB`, time `team_OhaWvx8glCwkSeNa2sSJqQIq`, Root Directory `vitrine`, Next 16.2.11) às 20:12Z. O executor só leu (MCP da Vercel, sem decrypt) e diagnosticou o build.

**Nomes das variáveis no projeto (só nomes; `filter_project_envs` sem decrypt):** `VITRINE_DATABASE_URL` e `VITRINE_REVALIDATE_SECRET` (production e preview, tipo sensitive) e `VITRINE_PUBLIC_URL` (production e preview, criada às 20:48Z). As três existem.

**Deployments e causa dos erros (dois builds falharam antes do primeiro READY):**

| Hora (Z) | Deployment | Resultado | Causa |
| --- | --- | --- | --- |
| 20:12 | `dpl_8tKmpPnzRkvyu6Ph3i2QxC6KiuhA` (49a82c0) | ERROR | Com "Include source files outside of the Root Directory" ligada, o builder da Vercel define `outputFileTracingRoot` como a raiz do repositório (`/vercel/path0`); isso diverge de `turbopack.root` e o Next passa a usar a raiz do repositório nas duas, e o Turbopack compila o `proxy.ts` do CRM (`Can't resolve 'better-auth/cookies'`) |
| 20:24 | `dpl_BUR7pzpipDoML16J3FWGUrtEs69C` (`08ffe88`, fix do agente) | ERROR | `outputFileTracingRoot` fixado em `vitrine/` compila, mas a Vercel resolve os arquivos das funções a partir de `/vercel/path0` e falha com `ENOENT lstat '/vercel/path0/.next/package.json'` |
| 20:36 | `dpl_Gf7kEKP4o1QLVu2oNzPghVu83u8p` (Redeploy do `08ffe88`, depois de o usuário desligar a opção) | ERROR | mesmo ENOENT: o `08ffe88` quebra o deploy com a opção ligada ou desligada |
| 20:46 | `dpl_5inpqLkWG4w1xDJ9MB9xfc2fk3yy` (`9ce477a`, git) | **READY** | reversão do override + opção desligada |
| 20:50 | `dpl_Hk4H7cdm1o3NNnPN9v2gXE1NYEyd` (`9ce477a`, redeploy do usuário, com `VITRINE_PUBLIC_URL`) | **READY** | — |

**Decisão delegada (CONDUÇÃO):** a análise da causa foi dada a um agente Opus 5.5 (esforço alto) em duas rodadas; as duas conclusões acima são dele, com simulação local do builder da Vercel (cópia exportada com `git archive`, `NEXT_PRIVATE_OUTPUT_TRACE_ROOT` na raiz e um adaptador de captura do `onBuildComplete`). Seguida a recomendação: commit `08ffe88` (`outputFileTracingRoot` na pasta da vitrine) e, depois que falhou, a reversão `9ce477a`; no lado da Vercel, o usuário desligou a opção (única mudança de configuração, dele). Os dois commits foram publicados com `git push origin main` sem força (auditoria de trailers: 0 em `origin/main..HEAD` e 0 em `origin/main`); cada push também reimplanta o CRM.

**Domínio público:** `vitrine-kappa-tawny.vercel.app` (é o valor de `og:image` que a própria vitrine emite, ou seja, o de `VITRINE_PUBLIC_URL`). O alias do projeto `vitrine-arthur1050s-projects.vercel.app` responde 302 para o login da Vercel (Vercel Authentication ligada nos aliases do projeto); só o domínio público atende o visitante e o crawler do WhatsApp.

**Ignored Build Step:** não conferido (o campo não aparece no MCP de leitura). Segundo o gate da T0, só se liga depois do primeiro deployment pronto; fica registrado como conferência do usuário.

**Observação de segurança:** o projeto do CRM também tem `VITRINE_DATABASE_URL` (production e preview), que a T8 não pede e que o CRM não lê (`src/` não a referencia fora de testes). É a connection string do papel `krivo_vitrine` num projeto que não precisa dela; recomenda-se removê-la do CRM (decisão do usuário).

**Rollback:** pausar o projeto `vitrine` (`pause_project`/painel); nada no CRM ou no banco depende dele. Para voltar ao código anterior: `git revert 9ce477a 08ffe88` (só `vitrine/next.config.ts`).

## Variáveis da vitrine no CRM (T8, 2026-10-18, ação do usuário; conferência por leitura)

**Nomes no projeto do CRM (`prj_O9vEsQZlWqMRRkaIn7llpoHh8dNx`, `filter_project_envs` sem decrypt):** `VITRINE_PUBLIC_URL` (production e preview, criada às 20:53:15Z) e `VITRINE_REVALIDATE_SECRET` (production e preview, criada às 20:52:50Z). As duas existem; o segredo é do tipo sensitive (valor inacessível ao executor). O executor não leu nem comparou valores; que o segredo do CRM seja igual ao da vitrine só se prova pelo aviso de revalidação (T12), que depende de uma loja ativa.

**Rollback:** remover as duas variáveis do CRM (o CRM volta a `ignorado` nos avisos de revalidação).

## Redeploy do CRM com a vitrine (T9, 2026-10-18, ação do usuário; conferência por leitura)

Deployment do CRM `dpl_2vo8WTZNgYtZyPPrRhXHGo6nTC9v` (commit `9ce477a`), criado às 20:53:24Z, **READY**, nove segundos depois da última variável da T8 (20:53:15Z). O deployment anterior `dpl_9qf7qZuha3JDmYYd2Z85B7w9ZcfS` (push do `9ce477a`, 20:46:12Z) também está READY, mas é anterior às variáveis.

**Rollback:** redeploy do `dpl_9qf7qZuha3JDmYYd2Z85B7w9ZcfS` ou, mais atrás, do `dpl_hzTEYjvfS6vRSBpKRXYWX5SGNjff`.

## Vitrine da imobiliária piloto (T10, 2026-10-18): NÃO configurada; prova real (T11 a T13) pendente

**Declaração do usuário (chat, 2026-10-18):** "Não tenho CRECI. Siga à T14 e ao fechamento com a prova real (T11 a T13) pendente, como previsto no prompt." É o Edge Case da T10 (sem CRECI em mãos, a Phase 3 fica pendente no Handoff). A ativação exige CRECI e razão social (check `tenant_storefronts_active_requires_identity_check`), então nenhuma loja pôde ser ativada.

**Conferência do executor (somente leitura, `scratch/l16c-b-lojas.ts`, uma conexão `READ ONLY`, host `ep-gentle-brook-…`, 2026-10-18):**

```
tenant_storefronts: []
vitrine.lojas (slug): []
```

Nenhuma linha em `tenant_storefronts` e nenhuma loja em `vitrine.lojas`. A consulta de contagem de `vitrine.imoveis` falhou por nome de coluna da minha consulta (`column "slug" does not exist`); como a view de lojas está vazia, não afeta a conclusão e não foi repetida.

**Conferência por HTTP (domínio público `vitrine-kappa-tawny.vercel.app`, `curl`, 2026-10-18):**

| URL | HTTP | `X-Robots-Tag` | Conteúdo |
| --- | --- | --- | --- |
| `/` | 404 | `noindex, nofollow` | não encontrado do Next |
| `/c/triangulo` | 200 | `noindex, nofollow` | corpo com "Página não encontrada" (a página sai em streaming com 200; a garantia é a interface de não encontrado, ver `vitrine/README.md`) |
| `/c/triangulo/imovel/IM-0001` | 200 | `noindex, nofollow` | idem |
| `/c/krivo-demo` | 200 | `noindex, nofollow` | idem |

Sem `Set-Cookie` em nenhuma resposta. Reconferido cinco minutos depois (o cache da loja expira em até 300 s): continua "Página não encontrada", então não é cache.

**O que isso prova e o que não prova:** a vitrine está de pé na produção, lê o banco com o papel `krivo_vitrine` sem erro (200, sem 5xx), trata loja inexistente com a página neutra e sai com `noindex, nofollow` em todas as rotas, sem cookie (ATIV-05, parte do cabeçalho da T11). **Não provados, por falta de loja ativa:** as capturas de catálogo e de item em desktop e 375 px (T11), a medição do frescor F15 (T12), a prévia do link no WhatsApp F17 (T13) e que o segredo de revalidação do CRM é igual ao da vitrine. Nenhuma escrita em produção foi feita nesta janela (o imóvel da T12 nunca foi tocado; não há nada a restaurar).

**Para fechar a prova depois (pendente no Handoff):**

1. No CRM, Configurações → Vitrine: CRECI, razão social, cor, fonte, layout, textos; marcar destaques; ativar. O slug da loja é o do tenant.
2. T11: capturar catálogo e um item em desktop e 375 px pela extensão do Chrome (`save_to_disk` na hora), sem dado de lead; `curl -I` do catálogo.
3. T12: marcar um imóvel visível como reservado e medir, em segundos a partir do clique em salvar, até `/c/<slug>/imovel/<ref>` mostrar "não encontrado" (`curl` a cada 5 s); voltar a disponível e medir; 3 rodadas; restaurar sempre o status original; acima de 300 s a F15 não se confirma.
4. T13: digitar (sem enviar) o link do item na conversa de teste do WhatsApp Web e capturar o cartão de prévia; sem prévia, abrir fix no lote de origem (L16b).

**Rollback:** nada a desfazer (nenhuma escrita).

## Verificação independente (Verifier Opus 5.5, 2026-10-18)

**Veredito: FAIL.** Autor ≠ verificador: não escrevi nada deste lote. Sem código de produto novo, o sensor de discriminação não se aplica. Diff verificado: `6c30603^..f69ab5b` (30 commits; código só em `vitrine/next.config.ts`, líquido de `08ffe88` + `9ce477a` = 3 linhas de comentário). `origin/main` = `9ce477a`; os 5 commits de registro de `00c6cb8` a `f69ab5b` estão só no local.

**O que conferi por conta própria (somente leitura, sem decrypt, sem escrita):**

| Conferência | Saída |
| --- | --- |
| Trailers (AD-014): `git log origin/main --format=%B \| grep -icE 'co-authored-by\|generated with'` e o mesmo em `6c30603^..HEAD` (com `noreply@anthropic` e 🤖) | **0** e **0**; um só autor e committer (`Arthur1050`) |
| Segredos: varredura do `git diff` e do `git log -p` do lote por `postgres(ql)://…@`, `npg_`, `sk_`, `re_`, JWT, `ghp_`, `Bearer`, `password=` | **0** no lote. Fora do lote, `git grep` só acha URLs de exemplo e de teste já existentes (placeholders). O prefixo do host de produção e os UUIDs do rollback da T17 não são segredo |
| `curl -I https://vitrine-kappa-tawny.vercel.app` em `/c/triangulo`, `/c/triangulo/imovel/IM-0001` e `/` (21:43Z) | 200, 200 e 404; `X-Robots-Tag: noindex, nofollow` nas três; **sem `Set-Cookie`**; corpo de `/c/triangulo` com "Página não encontrada" (não "indisponível") |
| `npx tsx scratch/l16c-b-lojas.ts` (`READ ONLY`, host `ep-gentle-brook-…`) | `tenant_storefronts: []`, `vitrine.lojas (slug): []`; a 3ª consulta falha com `column "slug" does not exist`, como o registro diz |
| Vercel, deployments da `vitrine` | `dpl_8tKm…` ERROR (`49a82c0`), `dpl_BUR7…` ERROR e `dpl_Gf7k…` ERROR (`08ffe88`), `dpl_5inp…` READY e `dpl_Hk4H…` READY (`9ce477a`), igual à tabela da T7; o repositório é `Arthur1050/crivo`. O log de runtime do `dpl_Hk4H…` (últimos 30 min) traz só o aviso SSL do `pg`, ou seja, a função conecta ao banco |
| Vercel, deployments do `crivo` | `dpl_hzTE…` (`19fd8be`) READY; `dpl_5fRN…` (`ee13d52`) READY; `dpl_2vo8…` (`9ce477a`, 20:53:24Z) READY; `dpl_9qf7…` READY. Confere com a T6 e a T9 |
| Vercel, variáveis do `crivo` (só nomes) | `VITRINE_PUBLIC_URL` (prod+preview, 20:53:15Z), `VITRINE_REVALIDATE_SECRET` (prod e preview, 20:52:50Z), `VITRINE_DATABASE_URL` (prod e preview, 20:52:34Z), `KRIVO_OPERATOR_ALERT_EMAIL`; **`CRIVO_OPERATOR_ALERT_EMAIL` ausente**. Confere com a T8 e a T18 |
| Vercel, variáveis da `vitrine` (só nomes; `filter_project_envs` por id e por nome, 2 vezes) | **lista vazia** (`envs: []`, `hiddenProductionEnvCount: 0`); `updatedAt` do projeto = 20:51:54Z, depois do último deployment (20:50:03Z). **Diverge da T7** |
| n8n, `search_workflows` e `get_workflow_details` | principal, responder-lead, agendar-reuniao e benchmark ativos, sem atualização depois de 2026-10-17 20:18Z; L14b (`q3GKsdptqp58Hq6O`) inativo e intocado desde 2026-10-06. **`crivo-agente-scheduler` (`gmIWxiRrHGIdtPub`): `active: false`, `activeVersionId: null`**, `versionId` `e31c635e` (a da T16). A última execução é a **4571, 2026-10-18 14:30:00Z**; nada depois disso |

### Tabela AC → evidência → situação

| Req. / AC | Evidência | Situação |
| --- | --- | --- |
| ATIV-01 AC1–AC3 | § Gate de produção (T0): F14 e F16 com URL, `last_updated` e data | **OK** |
| ATIV-02 AC1 | § T1 parte 1: plano de 33 instruções, 28 de ruído, parada e nada aplicado | **OK** |
| ATIV-02 AC2 | § T1 parte 2: as 5 instruções à mão, com a autorização citada; checks conferidos em `pg_constraint` | **OK** (desvio de método autorizado pelo usuário) |
| ATIV-02 AC3 | § T3: fatia sem `password`; papel sem senha | **OK** |
| ATIV-02 AC4–AC5 | § T5: 2 grants, fora de `neon_superuser`, `default_transaction_read_only=on`, nenhuma divergência | **OK** (não reexecutei a consulta de catálogo; aceita pelo registro com saída) |
| ATIV-02 AC6 | § T1 a T5: autorização citada, comando, saída e rollback | **OK** |
| ATIV-03 AC1 | § T7; deployments da `vitrine` no mesmo repositório que compilam a pasta `vitrine/` | **OK** |
| ATIV-03 AC2 | § T7 afirma as 3 variáveis no projeto; a releitura de hoje dá lista vazia | **FAIL**: não se reproduz (G1) |
| ATIV-03 AC3 | § T8: os dois nomes no CRM, conferidos por mim; "mesmo segredo" não provado (o registro reconhece) | **Parcial** (G4) |
| ATIV-03 AC4 | § T4, T7, T8: nenhum valor lido; consultas sem decrypt | **OK** |
| ATIV-04 AC1–AC3 | § T6: duas Full vermelhas, exceção do usuário citada, push `ee13d52..19fd8be`, 97 commits, deployments; Full 4 verde e e2e 66/66 depois | **OK com ressalva R1** |
| ATIV-05 AC1–AC4 | § T10: sem CRECI, nenhuma loja; capturas, F15 e F17 não feitas | **Pendente**, autorizado pelo Edge Case "sem CRECI" (spec.md:185, tasks.md:365) |
| ATIV-05 AC5 | § T10 (curl) e minha releitura | **OK** |
| ATIV-05 AC6 | § T10: nenhuma escrita; § T18 (2026-10-18): lead de teste criado em produção pelas mensagens de WhatsApp, a pedido do usuário | **OK com ressalva R3** |
| ATIV-06 AC1 | diff do `ROADMAP-POS-PILOTO.md` e do `INDEX.md` (`f69ab5b`) | **OK com ressalva** (o gatilho "a prova real terminar" não ocorreu; os dois textos dizem que a prova está pendente). Defeitos de forma em G7 |
| ATIV-07 AC1 | § T15: confirmação do usuário citada | **OK** |
| ATIV-07 AC2–AC5 | § T16: JSON guardado, comparador nó a nó, `versionId` = `activeVersionId` nos 5 em 2026-10-17; execuções 4499, 4572, 4577 e 4579 sem 401 | **OK em 2026-10-17; hoje o scheduler está despublicado** (G2) |
| ATIV-07 AC6 | § T17: travas, linhas afetadas, valores anteriores e UPDATE inverso | **OK** |
| ATIV-07 AC7 | § T18 (2026-10-18): a remoção da variável antiga é do usuário (confirmei a ausência dela); a prova pelo cron fica para 2026-10-19 03:00 UTC | **OK com ressalva R2** |
| ATIV-07 AC8 | § T16: janela de 20:16:51Z a 20:18:51Z | **OK** |
| Edge Case "deploy da vitrine falhar" (spec.md:183) | § T7: erros registrados, mas o executor corrigiu código (`08ffe88`, `9ce477a`) | **Desvio sem frase do usuário registrada** (G5) |
| Edge Case "sem CRECI" (spec.md:185) | § T10 e a linha do `INDEX.md`; **o Handoff do `STATE.md` ainda não registra** | **Parcial** (G6) |

### Gaps

| # | Gravidade | Gap | O que o executor deve fazer |
| --- | --- | --- | --- |
| G1 | **Alta** | O projeto `vitrine` não lista nenhuma variável (`filter_project_envs`, 2026-10-18 ~21:44Z), embora a T7 registre as três. O deployment no ar funciona porque foi construído às 20:50Z, antes da mudança no projeto (20:51:54Z). As três aparecem no CRM criadas entre 20:52:34Z e 20:53:15Z. **Qualquer push de `main` (inclusive o dos commits de fechamento) reimplanta a vitrine**, que subiria sem `VITRINE_DATABASE_URL` e ficaria indisponível | Não fazer push antes de resolver isto. Pedir ao usuário que confira no painel da `vitrine` (Settings → Environment Variables, e as Shared Environment Variables do time) se as três estão em Production. Se faltarem, o usuário as recria (`VITRINE_REVALIDATE_SECRET` igual ao do CRM) e faz Redeploy. Depois, registrar na § T7 a releitura só de nomes (`filter_project_envs`, sem decrypt), com a hora, e o novo deployment READY |
| G2 | **Alta** | `crivo-agente-scheduler` está despublicado (`active: false`, `activeVersionId: null`). A última execução é a 4571 (2026-10-18 14:30Z). Nenhuma seção registra isso, e a § T18 (linha "o agendador (a cada 15 min) segue provando o contrato") ficou falsa. Lembretes, reengajamento e purga não rodam em produção | Descobrir com o usuário quem despublicou e por quê (o horário coincide com a validação por WhatsApp, por volta de 14:48Z). Registrar o fato com a hora. Se não foi intencional, o usuário decide republicar a `e31c635e`; o executor só publica com ordem explícita para isso. Corrigir a frase da § T18 com uma nota datada, sem apagar o registro |
| G3 | Média | `tasks.md` deixou T7, T8, T9 e T14 com `[ ]`, mas a spec as dá como Done. T10 a T13 estão `[ ]` sem nota de pendência | Marcar T7, T8 e T9 `[x]` com a evidência (nomes lidos por MCP, deployments) depois de fechar o G1. Marcar T14 `[x]`. Anotar em T10 a T13 "pendente: sem CRECI (Edge Case), 2026-10-18" |
| G4 | Média | ATIV-03 aparece como "Done" na rastreabilidade (`spec.md:197`), mas o AC2 não se reproduz (G1) e o AC3 ("mesmo segredo") e o "papel `krivo_vitrine`" do AC2 não estão provados. A § T10 afirma que a vitrine "lê o banco com o papel `krivo_vitrine`", o que a evidência não mostra: o HTTP prova a leitura das views com a credencial configurada, não qual papel a usa | Trocar o status de ATIV-03 para "Partial (AC3: igualdade do segredo só se prova pela revalidação da T12; AC2 reconferido em <data>)". Emendar a frase da § T10 com uma nota datada |
| G5 | Média | `08ffe88` e `9ce477a` mudaram `vitrine/next.config.ts` e foram publicados (o que também reimplantou o CRM), contra o Edge Case de `spec.md:183` ("SHALL NOT tentar corrigir código neste lote") e o Out of Scope. A § T7 traz só a "Decisão delegada (CONDUÇÃO)", sem a frase do usuário que pediu a correção | Acrescentar à § T7 um bloco `SPEC_DEVIATION` com a frase literal do usuário (data e hora) que autorizou corrigir o código e publicar os dois commits, e o efeito líquido (comentário). Ou registrar que a autorização foi só a instrução permanente, se for o caso |
| G6 | Média | O Edge Case "sem CRECI" pede a prova real pendente **no Handoff**; o Handoff do `STATE.md` ainda descreve a janela B como "próximo passo" | No fechamento, atualizar o Handoff com T7 a T9 e T14 feitas, T10 a T13 pendentes (passos 1 a 4 da § T10), G1 e G2 resolvidos ou pendentes, cron de 2026-10-19 03:00 UTC, `VITRINE_DATABASE_URL` no CRM e Ignored Build Step |
| G7 | Baixa | Forma: (a) `INDEX.md:58`, a linha do L16a gruda "…L-071 confirmadas**Ativação (L16c, 10-17):**" sem separador; (b) a § "Conferência da renomeação (T18)", linha "Rollback da renomeação", ainda cita "restaurar a versão anterior de cada workflow", que a § T16 corrigiu (as versões foram podadas); (c) a 1ª rodada da Full está descrita duas vezes com detalhamento divergente por arquivo (seed 19 × suite de 35; maintenance 14 × 9; isolamento 2 × 1); (d) `vitrine/README.md` § deploy ainda diz "Ainda não feito" e não registra que "Include source files outside of the Root Directory" precisa ficar desligada | (a) inserir o separador; (b) e (c) acrescentar uma nota datada que aponte a versão correta, sem apagar; (d) atualizar o README da vitrine (só doc) |

### Ressalvas aceitas (não bloqueiam)

- **R1**: push da T6 antes do gate verde, por decisão do usuário citada na § "T6: exceção ao gate Full". O verde veio depois, no código idêntico (`git diff --stat 19fd8be HEAD -- . ':!.specs'` vazio, segundo o registro).
- **R2**: a T16 e a T17 usaram a instrução permanente do usuário ("apenas execute") no lugar da autorização por workflow. A frase está citada; o escopo e os limites foram mantidos.
- **R3**: a variável antiga do alerta foi removida antes da prova pelo cron. A inferência (a `KRIVO_OPERATOR_ALERT_EMAIL` existia antes do push) é razoável; a confirmação fica para 2026-10-19 03:00 UTC.
- **R4**: lead de teste "Arthur T." criado em produção pela validação por WhatsApp, a pedido do usuário e registrado. O usuário decide se exclui.
- **R5**: a prova real (capturas, F15, F17) fica pendente pelo Edge Case "sem CRECI". O registro é honesto sobre o que não foi provado, e a linha do `INDEX.md` e o `ROADMAP` dizem "prova real pendente".
- **R6**: o Ignored Build Step não foi conferido, e há `VITRINE_DATABASE_URL` no CRM sem uso. Os dois estão registrados como decisão do usuário.
- **R7**: o rollback do n8n depende de `scratch/n8n-antes/` (fora do git), porque o histórico foi podado; confirmei `get_workflow_history` do scheduler com uma só versão. O `scratch/` não pode ser apagado no arquivamento enquanto a renomeação não estiver estável.

**Para reverificar:** fechar G1 a G6 (G7 pode ir junto), e então um Verifier novo relê a Vercel (nomes de variáveis da `vitrine`) e o n8n (`activeVersionId` dos 5 workflows) antes de qualquer push.

## Correções depois da 1ª verificação (executor, 2026-10-18)

Resposta aos gaps do Verifier (seção anterior, veredito FAIL). Só notas datadas; nenhum registro acima foi apagado.

**SPEC_DEVIATION (G5):** os commits `08ffe88` e `9ce477a` mudaram `vitrine/next.config.ts` neste lote, contra o Edge Case "SHALL NOT tentar corrigir código neste lote" (`spec.md:183`). Motivo: o deploy da vitrine falhou duas vezes (T7). Autorização: frase literal do usuário, no chat, em 2026-10-18: "Despache um agente opus 5.5 alto para que ele analise a causa do erro e corrija. Assim que estiver corrigido, eu rodo outro deploy". Efeito líquido do par de commits: um bloco de comentário em `next.config.ts` (o `outputFileTracingRoot` adicionado no primeiro foi removido no segundo); o `README` da vitrine passou a documentar a configuração exigida na Vercel.

**G1, projeto `vitrine` sem variáveis:** confirmado pelo executor em 2026-10-18 (~21:50Z): `filter_project_envs` do projeto `vitrine` devolve lista vazia; o CRM tem `VITRINE_PUBLIC_URL`, `VITRINE_REVALIDATE_SECRET` e `VITRINE_DATABASE_URL`, criadas entre 20:52:34Z e 20:53:15Z, ou seja, depois do último deployment da vitrine. Leitura mais provável (não confirmada com o usuário): as variáveis foram movidas para o CRM em vez de copiadas. O deployment no ar (`dpl_Hk4H…`) continua funcionando porque guarda as variáveis de quando foi construído; qualquer deployment novo da vitrine, inclusive o disparado por `git push origin main`, sai sem `VITRINE_DATABASE_URL`. **O push de fechamento fica retido até o usuário recriar as três no projeto `vitrine` e fazer Redeploy**; depois o executor relê os nomes e registra aqui.

**G2, agendador do n8n despublicado:** confirmado em 2026-10-18 (~21:50Z): `crivo-agente-scheduler` (`gmIWxiRrHGIdtPub`) com `active: false`; execuções de 15 em 15 minutos até a 4571 (14:30:00Z), nenhuma depois. A versão `e31c635e` da T16 é a única do histórico. Quem despublicou e por quê não está nos dados que o executor lê (o horário fica entre 14:30Z e 14:45Z, perto da validação pelo WhatsApp). Efeito: lembretes, reengajamento e purga de memória do piloto não estão rodando. Republicar exige ordem explícita do usuário (`publish_workflow` do `gmIWxiRrHGIdtPub`; rollback = `unpublish_workflow`). **Correção da frase da § T18:** "o agendador segue provando o contrato" valeu em 2026-10-17 e em 2026-10-18 até 14:30Z; hoje o agendador está despublicado.

**G4:** a frase da § T10 de que a vitrine lê o banco com o papel `krivo_vitrine` é inferência: o `200` sem 5xx e a página de não encontrado mostram que a rota responde, mas com `vitrine.lojas` vazia o resultado seria o mesmo se a conexão falhasse e a página tratasse a falha como loja inexistente. A leitura real do banco pela vitrine só se prova com uma loja ativa. ATIV-03 passou a Partial na `spec.md`.

**G7:** o rollback da § T18 ("restaurar a versão anterior de cada workflow") vale só como `update_workflow` com as operações inversas de `scratch/n8n-antes/reverso-<id>.json` (o histórico de versões foi podado; ver o aviso do Handoff); a 1ª rodada da Full aparece em duas seções com contagens por arquivo diferentes, e a seção `Suíte completa da T6, primeira rodada` é a que vale. Formato do `INDEX.md` e a seção Deploy do `vitrine/README.md` corrigidos.

## G1 e G2 fechados (executor, 2026-10-19)

**G1, variáveis da vitrine (ação do usuário, no chat, 2026-10-19):** "Recriei as 3 variáveis no projeto vitrine e fiz Redeploy." Conferência do executor por leitura (`filter_project_envs`, sem decrypt, 2026-10-19 ~03:25Z): o projeto `vitrine` lista `VITRINE_DATABASE_URL` (production e preview, criada 03:19:54Z), `VITRINE_REVALIDATE_SECRET` (production e preview, 03:20:16Z) e `VITRINE_PUBLIC_URL` (production e preview, 03:20:35Z). Redeploy `dpl_14WVAGz1UCe8HBDcja2LGxdiFbTW` (commit `9ce477a`, criado 03:20:47Z, `source: redeploy`) **READY**, com o domínio `vitrine-kappa-tawny.vercel.app` como alias. `curl` depois do redeploy: `/c/triangulo` responde 200 com `X-Robots-Tag: noindex, nofollow` e a interface de não encontrado (sem loja ativa, esperado). Os segredos recriados têm ids novos; que o `VITRINE_REVALIDATE_SECRET` da vitrine seja igual ao do CRM só se prova pelo aviso de revalidação da T12 (pendente). O CRM continua com `VITRINE_DATABASE_URL` (production e preview), que ele não lê; a remoção é decisão do usuário (ressalva R6, aberta). **Rollback:** pausar o projeto `vitrine`.

**G2, agendador do n8n (decisão do usuário, no chat, 2026-10-19):** "Não republique o agendador (eu o despubliquei de propósito)." O `crivo-agente-scheduler` (`gmIWxiRrHGIdtPub`) segue `active: false` (relido em 2026-10-19), e o executor não o republica. Efeito conhecido e aceito pelo usuário: lembretes, reengajamento e purga de memória do piloto não rodam enquanto estiver despublicado. Republicar é decisão do usuário (`publish_workflow` do `gmIWxiRrHGIdtPub`; rollback = `unpublish_workflow`). A ressalva fica no Handoff.

**Push:** retido até o fim do fechamento (ver abaixo); com as variáveis de volta, um deployment novo da vitrine disparado por `git push origin main` sai com as três.

## Verificação independente, volta 2 (Verifier Opus 5.5, 2026-10-19)

**Veredito: PASS com ressalvas.** Verifier novo: não participei do lote nem da volta 1. Sem código de produto novo (o diff fora de `.specs` em `6c30603^..HEAD` é só `vitrine/next.config.ts`, 3 linhas de comentário, e `vitrine/README.md`), então o sensor de discriminação não se aplica. `HEAD` = `5d151e1`; `origin/main` = `9ce477a` (8 commits locais de registro, `00c6cb8`…`5d151e1`, sem push). Todas as conferências abaixo são minhas, feitas entre 03:23Z e 03:27Z de 2026-10-19, somente leitura, sem decrypt e sem registrar valor algum.

### Conferências próprias

| Conferência | Saída |
| --- | --- |
| Vercel, `filter_project_envs` do `vitrine` (`prj_Y8y82…`, sem decrypt; só nomes e datas) | `VITRINE_DATABASE_URL` (production e preview, sensitive, criada 03:19:54Z), `VITRINE_REVALIDATE_SECRET` (production e preview, sensitive, 03:20:16Z), `VITRINE_PUBLIC_URL` (production e preview, 03:20:35Z); `hiddenProductionEnvCount: 0` |
| Vercel, deployments do `vitrine` | `dpl_14WVAGz1UCe8HBDcja2LGxdiFbTW`: commit `9ce477a`, `source: redeploy`, criado 03:20:47Z (depois das 3 variáveis), READY às 03:21:27Z, aliases `vitrine-kappa-tawny.vercel.app` e `vitrine-arthur1050s-projects.vercel.app`, `isRollbackCandidate: true`. Os 5 anteriores conferem com a tabela da T7 (3 ERROR, 2 READY) |
| Vercel, `filter_project_envs` do `crivo` (só nomes) | `VITRINE_PUBLIC_URL`, `VITRINE_REVALIDATE_SECRET`, `VITRINE_DATABASE_URL` (prod e preview), `KRIVO_OPERATOR_ALERT_EMAIL`; `CRIVO_OPERATOR_ALERT_EMAIL` ausente |
| `curl -I` / `curl` no domínio público (com `?v=<aleatório>`) | `/c/triangulo` 200, `/c/triangulo/imovel/IM-0001` 200 (`X-Vercel-Cache: PRERENDER`, `Age: 0`), `/` 404; `X-Robots-Tag: noindex, nofollow` nas três; **nenhum `Set-Cookie`**; corpo com "Página não encontrada" e **sem** "Vitrine temporariamente indisponível." |
| Código da vitrine (`vitrine/app/c/[slug]/layout.tsx:56-64`) | erro de leitura do banco cai no `catch` e renderiza `VitrineIndisponivel` ("Vitrine temporariamente indisponível."); "não encontrado" só sai quando a consulta **responde** sem loja. Logo, o corpo acima já indica leitura bem-sucedida |
| Produção, `pg_stat_activity` (script temporário em `scratch/`, sessão `READ ONLY`, só `select`, host `ep-gentle-brook-…`; removido em seguida), logo depois de pedir `/c/vale-uberaba`, `/c/krivo-demo` e `/c/inexistente-v2` | 2 sessões com `usename = krivo_vitrine`, `backend_start` 03:22:26Z (depois do redeploy), `query_start` 03:25:36Z, consultas `select "slug", "nome", …` (lojas) e `select "loja_slug", "referencia", …` (imóveis). **A vitrine em produção conecta e lê como `krivo_vitrine`** |
| Produção, `npx tsx scratch/l16c-b-lojas.ts` (`READ ONLY`) | `tenant_storefronts: []`, `vitrine.lojas (slug): []`; 3ª consulta `column "slug" does not exist`, como o registro diz |
| Vercel, `get_runtime_logs` do `crivo` (`since 55m`, busca `manutencao`) | `2026-10-19T03:01:32Z GET /api/cron/expire-documents` no `dpl_2vo8…`: `[manutencao] alerta { evaluated: 3, sent: 0, skipped: null, sendFailed: false, failed: false }`. `skipped` não é `destinatario-ausente`: o cron rodou com o destinatário lido da `KRIVO_OPERATOR_ALERT_EMAIL` (critério da § T18 de 2026-10-18) |
| n8n, `search_workflows` e `get_workflow_details` (5 workflows da T16) | principal `9ef9ce9e`, responder-lead `f4f43c06`, agendar-reuniao `c5291b3f`, benchmark `d316b342`: `active: true`, `versionId` = `activeVersionId`, `updatedAt` 2026-10-17 20:17–20:18Z; versão ativa com 11, 2, 1 e 1 `X-Krivo-Tenant` e 0 `X-Crivo-*` (65, 14, 14, 14 nós). Scheduler `gmIWxiRrHGIdtPub`: `active: false`, `activeVersionId: null`, `versionId` `e31c635e` com 8 `X-Krivo-Tenant` e 0 `X-Crivo-*` (41 nós); última execução 4571 (2026-10-18 14:30:00Z, `success`), nenhuma depois. L14b `q3GKsdptqp58Hq6O` inativo, `updatedAt` 2026-10-06 |
| Trailers (AD-014) | `git log origin/main --format=%B \| grep -icE 'co-authored-by\|generated with'` = **0**; o mesmo em `origin/main..HEAD` (com `noreply@anthropic`) = **0**; em `6c30603^..HEAD` (com 🤖) = **0**; 32 commits, todos autor e committer `Arthur1050` |
| Segredos | `git log -p 6c30603^..HEAD` por `postgres(ql)://…:…@`, `npg_`, `sk_`, `re_`, JWT, `ghp_`, `Bearer`, `password=`: 1 ocorrência, falso positivo (a linha da volta 1 que descreve a própria varredura); `git grep` nos arquivos do lote, `vitrine/README.md`, `vitrine/next.config.ts`, `INDEX.md` e `STATE.md`: 0 |
| `git status --short` | só ` M .env.example` (edição do usuário, fora do lote) |

### Gaps da volta 1

| # | Situação | Evidência |
| --- | --- | --- |
| G1 (alta) | **Fechado** | as 3 variáveis no projeto `vitrine` desde 03:19:54Z–03:20:35Z, `dpl_14WV…` READY depois delas, `curl` 200 com `noindex` e sem cookie, e sessões `krivo_vitrine` abertas pelo deployment novo (tabela acima) |
| G2 (alta) | **Fechado como ressalva aceita (R9)** | scheduler despublicado confirmado no n8n; a § "G1 e G2 fechados" cita a frase do usuário ("Não republique o agendador (eu o despubliquei de propósito)"), diz o efeito (lembretes, reengajamento e purga parados) e corrige a frase da § T18 por nota datada. A troca de cabeçalho dele está no rascunho `e31c635e` (8 nós), pronta se o usuário republicar. Não é gap: o estado de produção é decisão do dono, registrada com o efeito |
| G3 (média) | **Parcial → N1** | T8, T9 e T14 `[x]`; T10 a T13 com nota "PENDENTE"; mas a T7 continua `[ ]` com a nota "REABERTA … pendente: o usuário recriar as 3 … e fazer Redeploy", que ficou falsa depois do fechamento do G1 |
| G4 (média) | **Fechado no mérito; texto desatualizado → N2** | a leitura com o papel `krivo_vitrine` agora está provada (`pg_stat_activity`); o AC3 "mesmo segredo" segue só provável pela T12 (R8). A linha de ATIV-03 em `spec.md:197` ainda diz "T7 reaberta: o projeto `vitrine` está sem variáveis, G1". A nota G4 da § "Correções depois da 1ª verificação" afirma que o resultado "seria o mesmo se a conexão falhasse"; pelo código isso não vale (falha mostra "indisponível"), mas a nota é conservadora e fica superada pela evidência acima, sem ação |
| G5 (média) | **Fechado** | `SPEC_DEVIATION` com a frase literal do usuário (2026-10-18) e o efeito líquido; o diff confirma: `vitrine/next.config.ts` só ganhou comentário |
| G6 (média) | **Fora do gap bloqueante, como combinado** | o Edge Case "sem CRECI" (`spec.md:185`) manda a prova real para o Handoff; o Handoff do `STATE.md` ainda não foi atualizado e será no arquivamento (o executor deve incluir os itens de N4) |
| G7 (baixa) | **Fechado** | (a) `INDEX.md:58` agora tem ". **Ativação"; (b) e (c) nota datada na § "Correções…"; (d) `vitrine/README.md` § Deploy atualizado com a opção que precisa ficar desligada e sem "Ainda não feito" |

### Tabela AC → evidência → situação

| Req. / AC | Evidência | Situação |
| --- | --- | --- |
| ATIV-01 AC1–AC3 | § Gate (T0): F14 e F16 com URL, `last_updated` e data; nenhuma ação externa | **OK** |
| ATIV-02 AC1 | § T1 parte 1: autorização citada, plano de 33 instruções, parada, nada aplicado | **OK** |
| ATIV-02 AC2 | § T1 parte 2: autorização citada, 5 instruções à mão, checks em `pg_constraint`, rollback | **OK** |
| ATIV-02 AC3 | § T3: autorização, fatia sem `password`, conferência antes do COMMIT, rollback | **OK** |
| ATIV-02 AC4–AC5 | § T5: autorização, 2 grants, fora de `neon_superuser`, read-only e 5 s | **OK** (aceita pelo registro com saída; o uso real do papel agora visto em `pg_stat_activity`) |
| ATIV-02 AC6 | § T1–T5 com autorização, comando, data, saída e rollback | **OK** |
| ATIV-03 AC1 | deployments do `vitrine` do repositório `Arthur1050/crivo`, Root Directory `vitrine` | **OK** |
| ATIV-03 AC2 | 3 nomes no projeto `vitrine` (Production), deployment READY depois deles, sessões `krivo_vitrine` | **OK** (G1 fechado) |
| ATIV-03 AC3 | 2 nomes no Production do CRM; igualdade do segredo não provada | **Parcial, ressalva R8** |
| ATIV-03 AC4 | nenhum valor lido; consultas sem decrypt (inclusive esta volta) | **OK** |
| ATIV-04 AC1–AC3 | § T6: Full, exceção do usuário citada, push `ee13d52..19fd8be` (97 commits), deployments; Full 4 verde e e2e 66/66 depois | **OK com R1** |
| ATIV-05 AC1–AC4 | § T10: sem CRECI; `tenant_storefronts` vazia (reconferido) | **Pendente, autorizado pelo Edge Case "sem CRECI" (R5)** |
| ATIV-05 AC5 | `X-Robots-Tag: noindex, nofollow` em 3 rotas, sem cookie (reconferido) | **OK** |
| ATIV-05 AC6 | nenhuma escrita do executor em imóvel ou configuração; lead de teste a pedido do usuário | **OK com R4** |
| ATIV-06 AC1 | `f69ab5b`; `ROADMAP` e `INDEX` dizem "prova real pendente" | **OK com ressalva** (gatilho "prova real terminar" não ocorreu; N3) |
| ATIV-07 AC1 | § T15 com a confirmação do usuário | **OK** |
| ATIV-07 AC2–AC5 | § T16 e T18; releitura: 4 workflows ativos com `versionId` = `activeVersionId` e só `X-Krivo-Tenant`; execuções 4499, 4572, 4577, 4579 sem 401 | **OK com R9** (scheduler despublicado pelo usuário depois da prova) |
| ATIV-07 AC6 | § T17: travas, linhas afetadas, valores anteriores, UPDATE inverso | **OK** |
| ATIV-07 AC7 | variável antiga ausente no CRM; cron de 2026-10-19 03:01Z com `skipped: null` | **OK** (R3 da volta 1 fechada) |
| ATIV-07 AC8 | § T16: janela 20:16:51Z–20:18:51Z | **OK** |
| Edge Case "deploy da vitrine falhar" | § T7 + `SPEC_DEVIATION` com a frase do usuário | **OK (desvio autorizado)** |
| Edge Case "sem CRECI" | § T10; previsto em `spec.md:185`; Handoff a atualizar no arquivamento | **OK, pendência no Handoff (N4)** |
| Edge Case "cron do alerta" | cron de 2026-10-19 03:01Z observado | **OK** |

### Gaps novos (nenhum bloqueante; correções de forma para o arquivamento, sem nova verificação)

| # | Gravidade | Gap | O que o executor deve fazer |
| --- | --- | --- | --- |
| N1 | Baixa | `tasks.md`, T7: `[ ]` com a nota "REABERTA … pendente: o usuário recriar as 3 …", desmentida pela § "G1 e G2 fechados" | Marcar `[x]` e acrescentar à nota, sem apagá-la: "fechada em 2026-10-19: as 3 recriadas no projeto `vitrine` (03:19:54Z–03:20:35Z), `dpl_14WVAGz1UCe8HBDcja2LGxdiFbTW` READY às 03:21:27Z; Verifier volta 2 viu sessões `krivo_vitrine`" |
| N2 | Baixa | `spec.md:197`, ATIV-03: "Partial (… T7 reaberta: o projeto `vitrine` está sem variáveis, G1; …)" | Trocar por "Partial (T7, T8 e T9 feitas; AC2 reconferido em 2026-10-19 com sessões `krivo_vitrine`; AC3 "mesmo segredo" só se prova pela revalidação da T12, pendente)" |
| N3 | Baixa | `INDEX.md:60`, linha do L16c: não registra que o `crivo-agente-scheduler` está despublicado por decisão do usuário nem a recriação das variáveis da `vitrine`; a coluna de pendências é onde o backlog deferido aparece | Acrescentar na coluna de pendências: "agendador do n8n despublicado pelo usuário em 2026-10-18 (~14:30–14:45Z), lembretes, reengajamento e purga parados; republicar é decisão dele". Substituir o `VERIFIER_PLACEHOLDER` pelo veredito desta volta |
| N4 | Baixa | Handoff (G6) ainda por fazer; a § "G1 e G2 fechados" diz "conferência … ~03:25Z", mas o commit `5d151e1` é de 03:22:39Z, e termina com "ver abaixo" sem seção abaixo | No Handoff do `STATE.md`: prova real pendente (passos 1 a 4 da § T10), scheduler despublicado (R9), R6, R7, R8 e o lead de teste (R4). As duas imprecisões de forma não exigem ação (esta seção registra a hora real da releitura) |

### Ressalvas aceitas

- **R1, R2, R4, R5, R6, R7** da volta 1 continuam valendo como estão. **R3 fechada**: o cron de 2026-10-19 03:01Z rodou com o destinatário presente (`skipped: null`).
- **R8**: a igualdade de `VITRINE_REVALIDATE_SECRET` entre CRM e `vitrine` (ATIV-03 AC3) não é verificável sem ler valores; o segredo da `vitrine` foi recriado em 2026-10-19 com id novo. Só a revalidação da T12 prova. Se o aviso do CRM der 401 na T12, o usuário recria um dos dois.
- **R9**: `crivo-agente-scheduler` despublicado pelo usuário de propósito, com a frase registrada e o efeito dito. A T16 nele está feita (rascunho `e31c635e` com `X-Krivo-Tenant`) e provada pela execução 4499; republicar (`publish_workflow`) é decisão dele. Enquanto estiver despublicado, ATIV-07 AC5 vale para os 4 ativos.
- **R10**: o rollback da T7 (`pause_project`) e da T16 (operações inversas em `scratch/n8n-antes/`) seguem disponíveis; o `scratch/` não pode ser apagado no arquivamento.

**Push:** nada impede o push dos commits de fechamento pelo lado da vitrine (o próximo deployment sai com as 3 variáveis); continua exigindo ordem explícita do usuário e nova auditoria de trailer.

## Validation — resultado final do lote 16c (2026-10-19)

**Result:** PASS com ressalvas (2ª verificação independente, HEAD `1008ecf`; achados N1 a N3 fechados em `45d51f1`, lições decididas em `e052dc7`). Evidência: a configuração do build da vitrine em `vitrine/next.config.ts:1` e os registros por task neste arquivo (§ T7 em `validation.md:441`, § T10 no bloco "Vitrine da imobiliária piloto"). A prova real (T10 a T13) fica pendente pelo Edge Case "sem CRECI" (`spec.md:185`) e está no Handoff do `STATE.md`.
