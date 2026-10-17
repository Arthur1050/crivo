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
