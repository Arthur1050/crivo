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

### Phase 2: Publicação

```
T5 → T6 → T7 → T8 → T9
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

- [ ] F14 e F16 com fonte e data; IF F14 falhar THEN parar e avisar; IF F16 falhar THEN T7 sem Ignored Build Step

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

- [ ] IF o plano mostrar qualquer outra mudança THEN parar e reportar
- [ ] Checks presentes; se faltarem, aplicados pelo SQL da vitrine e conferidos (L-068)
- [ ] Rollback registrado: `DROP TABLE tenant_storefronts; ALTER TABLE properties DROP COLUMN featured; DROP TYPE storefront_layout; DROP TYPE storefront_font;`

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

- [ ] Saída sem erro; rollback `REVOKE ALL ON SCHEMA vitrine FROM crivo_vitrine; DROP OWNED BY crivo_vitrine; DROP ROLE crivo_vitrine;` registrado

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar o papel da vitrine em produção`

---

### T4: Senha do papel (usuário)

**What**: O usuário roda `ALTER ROLE crivo_vitrine PASSWORD '<senha>'` no editor SQL do Neon de produção e monta, para si, a URL pooler com esse usuário. O executor só entrega o comando sem a senha.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T3
**Reuses**: —
**Requirement**: ATIV-02

**Done when**:

- [ ] Usuário confirma; nenhum valor registrado; rollback `ALTER ROLE crivo_vitrine PASSWORD NULL;`

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar a senha do papel definida pelo usuário`

---

### T5: Conferência do papel em produção (executor, leitura)

**What**: Com autorização, consultas de catálogo: grants de `crivo_vitrine` (exatamente 2), `pg_has_role` em `neon_superuser` (falso), `rolconfig` com `default_transaction_read_only=on` e `statement_timeout=5s` (F18).
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

### T6: Suíte, auditoria e push (executor)

**What**: `npm test`, depois `npm run vitrine:e2e`; auditar `origin/main..HEAD` e `origin/main` inteiro por trailer de atribuição; pedir autorização com o hash e a lista de commits; `git push origin main` (deploy do CRM).
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T5
**Reuses**: procedimento do L15 (T13)
**Requirement**: ATIV-04

**Done when**:

- [ ] Falha fora das instabilidades conhecidas ou trailer encontrado → sem push
- [ ] Hash, commits e deployment do CRM registrados; rollback = redeploy do deployment anterior

**Tests**: integration
**Gate**: full

**Commit**: `docs(l16): registrar a publicação do código da vitrine`

---

### T7: Projeto da vitrine na Vercel (usuário)

**What**: O usuário importa o repositório como novo projeto: Root Directory `vitrine`, Production com `VITRINE_DATABASE_URL` (T4), `VITRINE_REVALIDATE_SECRET` (gerado localmente com `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) e `VITRINE_PUBLIC_URL` (domínio `.vercel.app` do projeto); Ignored Build Step só se F16 confirmou.
**Where**: `.specs/features/lote-16c-vitrine-ativacao/validation.md`
**Depends on**: T6
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

**What**: L16 executado no `ROADMAP-POS-PILOTO.md`; linhas de L16a, L16b e L16c em `features/INDEX.md`.
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
Phase 2:  T6 → T7 → T8 → T9
Phase 3:  T10 → T11 → T12 → T13
Phase 4:  T14
```

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T0 | None | — | ✅ |
| T1–T5 | anterior | T0 → T1 → T2 → T3 → T4 → T5 | ✅ |
| T6–T9 | anterior | T5 → T6 → T7 → T8 → T9 | ✅ |
| T10–T13 | anterior | T9 → T10 → T11 → T12 → T13 | ✅ |
| T14 | T13 | T13 → T14 | ✅ |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T0–T5, T7–T14 | Ações externas e docs | none | none | ✅ |
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
| T6 | `git push origin main` | executor, com autorização |
| T7 | Projeto da vitrine e variáveis | usuário |
| T8 | Variáveis do CRM | usuário |
| T9 | Redeploy do CRM | usuário |
| T10 | Configurar e ativar a vitrine piloto | usuário |
| T11 | Capturas e `curl -I` | executor, com autorização |
| T12 | Mudar status do imóvel / medir | usuário / executor |
| T13 | Prévia no WhatsApp | usuário |
| T14 | Roadmap e índice | executor |
