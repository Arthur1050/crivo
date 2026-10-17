# Lote 16c — Vitrine, ativação em produção — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/lote-16c-vitrine-ativacao/spec.md`
**Design**: `.specs/features/lote-16-vitrine-publica/design.md` (comum ao L16)
**Status**: Approved (usuário, 2026-10-09; começa só com L16a e L16b fechados com PASS)

**Regras deste lote (auditoria do L14b § 7, item 7; AD-014, AD-040 a AD-043):**

- **Toda task de T1 a T13 é ação externa.** Cada uma pede autorização explícita do usuário no momento, com a ação exata e o rollback; autorização de uma task não vale para a seguinte. Autorização ampla não cobre DDL, deploy nem publicação.
- O executor nunca lê, digita, registra nem pede senha, segredo ou connection string. Tudo o que envolve valor secreto é do usuário.
- Nenhuma mudança de código de produto. Defeito encontrado é reportado e vira fix no lote de origem ou lote novo.
- Cada ação registra em `validation.md`: autorização (data e frase do usuário), comando ou passo, saída sem segredo, rollback.
- Nenhum commit com `Co-Authored-By`, "Generated with" ou marca de atribuição (AD-014).

---

## Test Coverage Matrix

> Guidelines found: `AGENTS.md`/`CLAUDE.md`. Lote sem código novo: a prova é registro de ação externa e a suíte completa antes do push.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Ações externas (banco, Vercel, push) | none | Autorização, saída e rollback registrados | `validation.md` | - |
| Código do L16a/L16b (inalterado) | integration + e2e | Suíte completa verde antes do push | existente | `npm test` e `npm run vitrine:e2e` |
| Docs | none | registro no commit | - | - |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Full | T6, antes do push | `npm test`, depois `npm run vitrine:e2e` (nunca simultâneos) |
| Registro | Todas as demais | Registro em `validation.md`, commitado |

---

## Execution Plan

### Phase 0: Gate

```
T0
```

### Phase 1: Banco de produção

```
T0 → T1 → T2 → T3 → T4 → T5
```

### Phase 2: Publicação e renomeação

```
T5 → T15 → T6 → T16 → T17 → T18 → T7 → T8 → T9
```

### Phase 3: Prova real

```
T9 → T10 → T11 → T12 → T13
```

### Phase 4: Documentação

```
T13 → T14
```

---

## Task Breakdown

### T0: Gate de produção (F14, F16)

**What**: Confirmar na doc da Vercel (leitura) que o Hobby aceita o segundo projeto do mesmo repositório com Root Directory, os limites aplicáveis e o comportamento do Ignored Build Step com `git diff HEAD^`.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: None
**Reuses**: design.md § Fatos operacionais
**Requirement**: ATIV-01

**Done when**:

- [x] F14 e F16 com fonte e data; IF F14 falhar THEN parar e avisar; IF F16 falhar THEN T7 sem Ignored Build Step (feita em 2026-10-17, ambas confirmadas; ver `validation.md` § Gate de produção)

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar o gate de produção da vitrine`

---

### T1: Schema em produção (executor)

**What**: Com autorização, mostrar o plano do `drizzle-kit` contra produção, aplicar só `tenant_storefronts`, os dois enums e `properties.featured`, e conferir os dois checks em `pg_constraint`.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T0
**Reuses**: procedimento do L15 (T11); `scripts/vitrine/README.md`
**Requirement**: ATIV-02

**Done when**:

- [x] IF o plano mostrar qualquer outra mudança THEN parar e reportar (o plano trouxe 28 instruções de ruído, a T1 parou e o usuário autorizou aplicar à mão só as 5 do escopo, 2026-10-17)
- [x] Checks presentes; se faltarem, aplicados pelo SQL da vitrine e conferidos (L-068) (os dois vieram no `CREATE TABLE`, conferidos em `pg_constraint`; índice de categoria conferido)
- [x] Rollback registrado: `DROP TABLE tenant_storefronts; ALTER TABLE properties DROP COLUMN featured; DROP TYPE storefront_layout; DROP TYPE storefront_font;`

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar o schema da vitrine em produção`

---

### T2: Views em produção (executor)

**What**: Com autorização, aplicar só a seção de schema e views do SQL da vitrine em produção.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T1
**Reuses**: `scripts/vitrine/apply.ts`
**Requirement**: ATIV-02

**Done when**:

- [ ] Colunas das duas views conferidas contra `STOREFRONT_VIEW_COLUMNS`; rollback `DROP SCHEMA vitrine CASCADE;` registrado

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar as views da vitrine em produção`

---

### T3: Papel e grants em produção (executor)

**What**: Com autorização, aplicar a seção de papel e grants **sem senha**.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T2
**Reuses**: `scripts/vitrine/apply.ts`
**Requirement**: ATIV-02

**Done when**:

- [ ] Saída sem erro; rollback `REVOKE ALL ON SCHEMA vitrine FROM krivo_vitrine; DROP OWNED BY krivo_vitrine; DROP ROLE krivo_vitrine;` registrado

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar o papel da vitrine em produção`

---

### T4: Senha do papel (usuário)

**What**: O usuário roda `ALTER ROLE krivo_vitrine PASSWORD '<senha>'` no editor SQL do Neon de produção e monta, para si, a URL pooler com esse usuário. O executor só entrega o comando sem a senha.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T3
**Reuses**: —
**Requirement**: ATIV-02

**Done when**:

- [ ] Usuário confirma; nenhum valor registrado; rollback `ALTER ROLE krivo_vitrine PASSWORD NULL;`

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar a senha do papel definida pelo usuário`

---

### T5: Conferência do papel em produção (executor, leitura)

**What**: Com autorização, consultas de catálogo: grants de `krivo_vitrine` (exatamente 2), `pg_has_role` em `neon_superuser` (falso), `rolconfig` com `default_transaction_read_only=on` e `statement_timeout=5s` (F18).
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T4
**Reuses**: consultas do teste `vitrine-privilegios.test.ts` (L16a T9)
**Requirement**: ATIV-02

**Done when**:

- [ ] Resultados registrados; IF qualquer um divergir THEN rollback da T3 e parar antes do push

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): conferir o papel da vitrine em produção`

---

### T15: Preparo da renomeação na Vercel (usuário)

**What**: No Production do CRM, o usuário cria `KRIVO_OPERATOR_ALERT_EMAIL` com o mesmo valor de `CRIVO_OPERATOR_ALERT_EMAIL` (a antiga fica até a T18) e ajusta o nome de exibição em `RESEND_FROM` para Krivo. O CRM atual ignora a variável nova, então nada muda até o push.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T5
**Reuses**: `docs/renomeacao-krivo.md` (passo 3)
**Requirement**: ATIV-07

**Done when**:

- [ ] Usuário confirma os dois nomes de variável e o `RESEND_FROM`; rollback = remover a variável nova e restaurar o `RESEND_FROM`

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar o preparo da renomeação na vercel`

---

### T6: Suíte, auditoria e push (executor)

**What**: `npm test`, depois `npm run vitrine:e2e`; auditar `origin/main..HEAD` e `origin/main` inteiro por trailer de atribuição; combinar com o usuário uma janela de baixa atividade (a T16 e a T17 rodam logo depois do deploy); pedir autorização com o hash e a lista de commits; `git push origin main` (deploy do CRM).
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T15
**Reuses**: procedimento do L15 (T13)
**Requirement**: ATIV-04

**Done when**:

- [ ] Falha fora das instabilidades conhecidas ou trailer encontrado → sem push
- [ ] Hash, commits e deployment do CRM registrados; rollback = redeploy do deployment anterior

**Tests**: integration
**Gate**: full

**Commit**: `docs(l16): registrar a publicação do código da vitrine`

---

### T16: Cabeçalho do contrato no n8n (executor, com autorização por workflow)

**What**: Logo que o deployment do CRM novo (T6) ficar pronto, em cada workflow publicado que chama o contrato (lista levantada por leitura antes da T6 e mostrada ao usuário): guardar o JSON da versão publicada em `scratch/` (fora do git, sem segredo), trocar `X-Crivo-*` por `X-Krivo-*` nos nós, publicar e conferir `versionId` = `activeVersionId` (L-032, L-061); uma execução real do agente depois deve chamar o CRM sem 401. Não publicar os gerados de `main` (L14b), não criar nem ativar workflow, subscription ou credencial.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T6
**Reuses**: `docs/renomeacao-krivo.md` (passo 4); ferramentas MCP do n8n
**Requirement**: ATIV-07

**Done when**:

- [ ] Autorização do usuário por workflow, com a ação exata e o rollback na mesma mensagem
- [ ] IF a versão publicada tiver diferença além da troca de marca THEN parar e reportar
- [ ] `versionId` = `activeVersionId` em cada workflow alterado; execução real do agente sem 401
- [ ] Janela entre o deployment pronto e o fim desta task registrada; rollback = republicar o JSON guardado e, se preciso, redeploy do deployment anterior do CRM

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar a troca do cabeçalho no n8n`

---

### T17: SQL da marca em produção (executor, com autorização)

**What**: Mostrar por leitura as linhas que `scripts/brand/rename-to-krivo.sql` alteraria (tenant `crivo-demo`, e-mails `@crivo.com.br` desse tenant, `logo` com `crivo_white_symbol` e a existência do papel `crivo_vitrine`), gravar os valores anteriores como rollback e aplicar o script logo depois da T16 (o CRM novo já não serve os assets `.png` antigos). Mesmo meio de acesso da T1.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T16
**Reuses**: `scripts/brand/rename-to-krivo.sql`; `docs/renomeacao-krivo.md` (passo 2)
**Requirement**: ATIV-07

**Done when**:

- [ ] IF o papel `crivo_vitrine` existir ou os dois tenants de demonstração coexistirem THEN parar (o script também aborta)
- [ ] Linhas afetadas conferidas por consulta depois; logos carregando no CRM (`curl -I` do asset ou captura do usuário)
- [ ] Rollback = UPDATE inverso com os valores anteriores registrados

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar o sql da marca em produção`

---

### T18: Conferência da renomeação e limpeza (usuário + executor)

**What**: O executor confere por leitura que os logs do CRM e do n8n depois da troca não têm 401 do contrato nem erro de leitura de imóveis e que uma execução real do agente terminou; o usuário remove `CRIVO_OPERATOR_ALERT_EMAIL` da Vercel quando a variável nova estiver em uso (a prova é o cron das 03:00 UTC; se ainda não rodou, a antiga fica e a pendência vai para o Handoff com a data).
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T17
**Reuses**: —
**Requirement**: ATIV-07

**Done when**:

- [ ] Logs sem 401 do contrato e uma execução real do agente concluída, registrados
- [ ] Variável antiga removida pelo usuário, ou pendência registrada com a data do próximo cron

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar a conferência da renomeação`

---

### T7: Projeto da vitrine na Vercel (usuário)

**What**: O usuário importa o repositório como novo projeto: Root Directory `vitrine`, Production com `VITRINE_DATABASE_URL` (T4), `VITRINE_REVALIDATE_SECRET` (gerado localmente com `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) e `VITRINE_PUBLIC_URL` (domínio `.vercel.app` do projeto); Ignored Build Step só se F16 confirmou.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T18
**Reuses**: —
**Requirement**: ATIV-03

**Done when**:

- [ ] Usuário confirma os nomes das 3 variáveis e o primeiro deployment pronto; rollback = pausar o projeto

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar o projeto da vitrine na vercel`

---

### T8: Variáveis do CRM (usuário)

**What**: O usuário cria `VITRINE_PUBLIC_URL` e `VITRINE_REVALIDATE_SECRET` (mesmo segredo da T7) no Production do CRM.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T7
**Reuses**: —
**Requirement**: ATIV-03

**Done when**:

- [ ] Usuário confirma os nomes; rollback = remover as duas variáveis (o CRM volta a `ignorado`)

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar as variáveis da vitrine no crm`

---

### T9: Redeploy do CRM (usuário)

**What**: O usuário faz Redeploy do deployment atual do CRM para carregar as variáveis.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T8
**Reuses**: —
**Requirement**: ATIV-03

**Done when**:

- [ ] Deployment pronto confirmado; rollback = redeploy do anterior

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar o redeploy do crm com a vitrine`

---

### T10: Vitrine da imobiliária piloto (usuário)

**What**: O usuário preenche a seção Vitrine (CRECI, razão social, cor, fonte, layout, textos), marca destaques e ativa.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T9
**Reuses**: tela do L16a
**Requirement**: ATIV-05

**Done when**:

- [ ] Usuário confirma a ativação; IF sem CRECI em mãos THEN Phase 3 fica pendente no Handoff (Edge Case)

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar a vitrine piloto configurada`

---

### T11: Prova visual (executor, leitura)

**What**: Com autorização, abrir catálogo e um item pela extensão do Chrome, desktop e 375 px; `curl -I` conferindo `X-Robots-Tag`.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/capturas/`
**Depends on**: T10
**Reuses**: —
**Requirement**: ATIV-05

**Done when**:

- [ ] Capturas versionadas na hora (L-054); cabeçalho conferido; nenhum dado de lead nas capturas

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): capturas da vitrine em produção`

---

### T12: Medição do frescor (usuário + executor)

**What**: O usuário marca um imóvel visível como reservado no CRM e depois volta a disponível; o executor mede em segundos até o item mostrar a página de não encontrado e até voltar; 3 rodadas (F15).
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T11
**Reuses**: —
**Requirement**: ATIV-05

**Done when**:

- [ ] 3 medições registradas; IF alguma > 300 s THEN F15 não confirmada e reportada

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): medir o frescor da vitrine`

---

### T13: Prévia no WhatsApp (usuário)

**What**: O usuário cola o link de um item num chat e captura a prévia (F17).
**Where**: `.specs/features/lote-16c-vitrine-ativacao/capturas/`
**Depends on**: T12
**Reuses**: —
**Requirement**: ATIV-05

**Done when**:

- [ ] Captura com título e imagem versionada; IF sem prévia THEN registrar e abrir fix no lote de origem

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): prévia da vitrine no whatsapp`

---

### T14: Roadmap e índice

**What**: L16 executado no `ROADMAP-POS-PILOTO.md`; linhas de L16a, L16b e L16c em `features/INDEX.md` (a do L16a já existe desde o fechamento dele, 2026-10-09: acrescentar o que a ativação mudou nela e as linhas de L16b e L16c).
**Where**: `.specs/features/INDEX.md`
**Depends on**: T13
**Reuses**: formato das linhas existentes
**Requirement**: ATIV-06

**Done when**:

- [ ] Diff dos dois arquivos revisado

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): roadmap e índice do lote 16`

---

## Phase Execution Map

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 0:  T0
Phase 1:  T1 → T2 → T3 → T4 → T5
Phase 2:  T15 → T6 → T16 → T17 → T18 → T7 → T8 → T9
Phase 3:  T10 → T11 → T12 → T13
Phase 4:  T14
```

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T0 | None | — | ✅ |
| T1–T5 | anterior | T0 → T1 → T2 → T3 → T4 → T5 | ✅ |
| T15, T6–T9 | anterior | T5 → T15 → T6 → T16 → T17 → T18 → T7 → T8 → T9 | ✅ |
| T10–T13 | anterior | T9 → T10 → T11 → T12 → T13 | ✅ |
| T14 | T13 | T13 → T14 | ✅ |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T0–T5, T15, T16–T18, T7–T14 | Ações externas e docs | none | none | ✅ |
| T6 | Suíte do código existente | integration + e2e | integration (full) | ✅ |

## Quem executa

| Task | Ação | Quem faz |
| --- | --- | --- |
| T0 | Leitura da doc da Vercel | executor |
| T1 | `drizzle-kit push` em produção | executor, com autorização |
| T2 | SQL das views em produção | executor, com autorização |
| T3 | SQL do papel e grants em produção, sem senha | executor, com autorização |
| T4 | Senha do papel | usuário |
| T5 | Consultas de catálogo em produção | executor, com autorização |
| T15 | Variável do alerta e `RESEND_FROM` na Vercel | usuário |
| T6 | `git push origin main` | executor, com autorização |
| T16 | Cabeçalho `X-Krivo-*` nos workflows publicados do n8n | executor, com autorização por workflow |
| T17 | SQL da marca em produção | executor, com autorização |
| T18 | Conferência por leitura e remoção da variável antiga | executor (leitura) / usuário |
| T7 | Projeto da vitrine e variáveis | usuário |
| T8 | Variáveis do CRM | usuário |
| T9 | Redeploy do CRM | usuário |
| T10 | Configurar e ativar a vitrine piloto | usuário |
| T11 | Capturas e `curl -I` | executor, com autorização |
| T12 | Mudar status do imóvel / medir | usuário / executor |
| T13 | Prévia no WhatsApp | usuário |
| T14 | Roadmap e índice | executor |
