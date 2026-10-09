# Lote 16a — Vitrine, lado CRM — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/lote-16a-vitrine-lado-crm/spec.md`
**Design**: `.specs/features/lote-16-vitrine-publica/design.md` (comum ao L16)
**Context**: `.specs/features/lote-16-vitrine-publica/context.md`
**Status**: Approved (usuário, 2026-10-09)

**Regras deste lote (auditoria do L14b § 7; AD-014, AD-033, AD-040, AD-042):**

- Execução em linha, uma task por vez; só o Verifier final é sub-agente.
- `tasks.md` recebe só status e hash. Evidência vai no commit e no `validation.md`; nada de tabela file:line por asserção fora do relatório do Verifier.
- Mudança de schema ou do SQL da vitrine → `npm run db:push:test` (base e branches de worker, AD-033). Testes pontuais com `npx vitest run <arquivos>`; Full (`npm test`) uma vez, no fechamento.
- **Nenhuma ação em produção.** Papel, views e colunas só nos bancos de teste. Produção é o L16c.
- Nenhum commit com `Co-Authored-By`, "Generated with" ou marca de atribuição (AD-014).
- Trabalho visual (T17–T19) só com captura real pela extensão do Chrome; sem captura, não altere UI.

---

## Test Coverage Matrix

> Guidelines found: `AGENTS.md`/`CLAUDE.md` (Astryx, sem limiar de cobertura), `vitest.config.ts` (Neon real, AD-033). Amostras: `src/db/__tests__/schema-integration-health.test.ts`, `src/lib/__tests__/format.test.ts`, `src/server/data/__tests__/integration-refusals.test.ts`, `src/server/__tests__/properties-actions.test.ts`, `src/server/integration/__tests__/properties.test.ts`, `src/db/__tests__/test-connection.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Schema e SQL da vitrine (`src/db/schema.ts`, `scripts/vitrine/*`) | integration | Colunas, padrões, checks e cascata no banco real; colunas exatas e corte de visibilidade das views; privilégios do papel conectando como ele | `src/db/__tests__/*vitrine*.test.ts` | `npx vitest run src/db/__tests__/<arquivo>` |
| Lib pura (`src/lib/*.ts`) | unit | 1:1 com os ACs de validação e ativação; todos os ramos; edge cases da spec | `src/lib/__tests__/*.test.ts` | `npx vitest run src/lib/__tests__/<arquivo>` |
| DAL (`src/server/data/*.ts`) | integration | Leitura com e sem linha; upsert; atomicidade por injeção (L-002); linha de outro tenant intocada (L-035); valor de partida diferente do defeito (L-053) | `src/server/data/__tests__/*.test.ts` | `npx vitest run src/server/data/__tests__/<arquivo>` |
| Cliente de revalidação (`src/server/storefront/*.ts`) | unit | `fetch` simulado: URL, cabeçalho, corpo, timeout, 3 desfechos, logs sem segredo | `src/server/storefront/__tests__/*.test.ts` | `npx vitest run src/server/storefront/__tests__/<arquivo>` |
| Server actions (`src/server/actions/*.ts`) | integration | Permissão, validação, sucesso; agendamento da revalidação no sucesso e ausência na recusa, com teste que falha se a chamada for removida (L-026) | `src/server/__tests__/*-actions.test.ts` | `npx vitest run src/server/__tests__/<arquivo>` |
| Scripts (`scripts/*.ts`, `src/db/test-connection.ts`) | unit / integration | Ordem drop → push → apply por alvo; parada no primeiro erro; derivação da URL do papel | `scripts/__tests__/*.test.ts`, `src/db/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| UI (`src/components/**`, `app/(crm)/**`) | none (build) + captura real | Lógica de apresentação fica na lib e tem unit (L-003); composição provada por captura (L-009) | - | build gate + captura |
| Docs | none | registro no commit | - | - |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Task com testes | `npx vitest run <arquivos da task>` |
| Full | Fechamento do lote | `npm test` |
| Build | Toda task de código, antes do commit | `npm run lint` + `npx tsc --noEmit -p .` (sem erro novo além da linha de base registrada na T0) |
| Registro | Gate e docs | Resultado registrado em `validation.md` ou no próprio doc, commitado |

---

## Execution Plan

### Phase 0: Gate de viabilidade

```
T0
```

### Phase 1: Dados

```
T0 → T1 → T2 → T3 → T4 → T5
T1 → T6
```

### Phase 2: Fronteira de banco

```
T0 → T7 → T9 → T10
T1 → T8 → T9
```

### Phase 3: Revalidação

```
T2 → T11 → T12 → T13 → T14
T5 → T12
T6 → T14
T12 → T15
T5 → T15
T12 → T16
T5 → T16
```

### Phase 4: Telas

```
T15 → T17 → T18
T14 → T19
```

### Phase 5: Seed e procedimento

```
T6 → T20
T10 → T21
```

---

## Task Breakdown

### T0: Gate de viabilidade (F1–F5, F7)

**What**: Comprovar F1–F5 e F7 do design na branch `test` (F6 é comprovada pela T1, no push real) e registrar a linha de base de erros do `tsc`.
**Where**: `.specs/features/lote-16a-vitrine-lado-crm/validation.md`
**Depends on**: None
**Reuses**: design.md § Fatos operacionais
**Requirement**: VBANCO-01, VBANCO-02, VBANCO-03
**Status**: Done 2c00ec2

**Done when**:

- [ ] F1–F5 e F7 registrados com fonte, comando (sem credencial) e resultado; papel de prova criado com nome `crivo_vitrine_gate` e removido no fim
- [ ] IF F1 falhar THEN parar o lote e avisar o usuário; F2–F5 ajustam as tasks T8–T10 conforme o design
- [ ] Linha de base de `npx tsc --noEmit -p .` registrada (contagem de erros)
- [ ] Nenhuma ação fora dos bancos de teste; nenhum valor de URL, senha ou chave registrado

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar o gate de viabilidade do lado CRM`

---

### T1: Schema da vitrine

**What**: Enums `storefront_layout` e `storefront_font`, tabela `tenant_storefronts` com os dois checks e cascata, coluna `properties.featured`; `npm run db:push:test`; conferir o estado final em `pg_constraint` em todos os alvos (L-068: o push já saiu com 0 deixando check sem aplicar).
**Where**: `src/db/schema.ts`
**Depends on**: T0
**Reuses**: check de `tenants` (`src/db/schema.ts:201`)
**Requirement**: VCFG-01, VDEST-01
**Status**: Done b74ee50

**Done when**:

- [ ] `src/db/__tests__/schema-vitrine.test.ts`: colunas e padrões (VCFG-01 AC2, AC3; VDEST-01 AC1); exclusão do tenant remove a linha (Edge Case); `active = true` com CRECI vazio, nulo e só espaços recusado pelo banco; cor `#ABC` e `vermelho` recusadas pelo banco (AC12)
- [ ] IF algum check faltar em algum alvo (esperado: o Handoff do L15 registra que o push não aplica o check de `tenants`) THEN aplicar os dois `ALTER TABLE ... ADD CONSTRAINT` à mão nos 5 alvos de teste, registrar o SQL no commit e seguir; a T8 os incorpora ao SQL da vitrine de forma idempotente e a T10 confere o estado final
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(l16): tabela da vitrine e destaque de imóvel`

---

### T2: Contrato espelhado do lado CRM

**What**: `storefrontCacheTag`, `STOREFRONT_LAYOUTS`, `STOREFRONT_FONTS`, tipo do payload e `STOREFRONT_VIEW_COLUMNS`.
**Where**: `src/lib/storefront-contract.ts`
**Depends on**: T1
**Reuses**: padrão de lib pura de `src/lib/permissions.ts`
**Requirement**: VCFG-01, VBANCO-01
**Status**: Done a60c705

**Done when**:

- [ ] `src/lib/__tests__/storefront-contract.test.ts`: tag de `imob-x` = `tenant:imob-x:catalogo`; layouts e fontes iguais a `enumValues` dos enums do schema; colunas iguais às listas de VBANCO-01 AC2 e AC3, na ordem
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(l16): contrato da vitrine no CRM`

---

### T3: Validação da configuração

**What**: `validateStorefrontInput` e os normalizadores de cor, Instagram, telefone e texto opcional.
**Where**: `src/lib/storefront.ts`
**Depends on**: T2
**Reuses**: formato de recusa por campo das validações de imóvel
**Requirement**: VCFG-02
**Status**: Done 8a48f32

**Done when**:

- [ ] `src/lib/__tests__/storefront.test.ts` cobre 1:1 VCFG-01 AC5–AC10 e os Edge Cases de cor e Instagram, um caso por limite: CRECI 40 aceito e 41 recusado; razão social e título 120/121; sobre 1500/1501; endereço 200/201; telefone 10 e 13 aceitos, 9 e 14 recusados; Instagram 30/31, `@Imobiliaria.X` → `imobiliaria.x`; cor `#AABBCC` → `#aabbcc`, vazia → nulo
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(l16): validação da configuração da vitrine`

---

### T4: Bloqueios de ativação

**What**: `activationBlockers({ storefront, agentWhatsapp })` com a lista ordenada CRECI → razão social → WhatsApp do agente, e os rótulos de cada bloqueio para a tela.
**Where**: `src/lib/storefront.ts` (modificar)
**Depends on**: T3
**Reuses**: T3
**Requirement**: VATIV-01
**Status**: Done c2c61a4

**Done when**:

- [ ] Testes no mesmo arquivo da T3: cada pré-condição sozinha; as três juntas na ordem (AC4); só espaços conta como vazio; nada faltando → lista vazia; rótulos tipados por `Record<Bloqueio, string>` (L-029)
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(l16): bloqueios de ativação da vitrine`

---

### T5: DAL da vitrine

**What**: `getStorefront`, `saveStorefront` (upsert atômico com `updated_at`) e `getTenantSlug`.
**Where**: `src/server/data/storefront.ts`
**Depends on**: T4
**Reuses**: filtro por tenant ativo (AD-002)
**Requirement**: VCFG-01, VCFG-02, VATIV-01
**Status**: Done 220bb2c

**Done when**:

- [ ] `src/server/data/__tests__/storefront.test.ts`: tenant sem linha → padrões e nenhuma linha criada (AC4); upsert grava e relê; linha de outro tenant partindo de valores diferentes fica intocada (L-035, L-053); falha injetada no upsert → nenhuma parte gravada (AC11, L-002); gravar CRECI vazio com ativa → recusa sem gravar (VATIV AC5)
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(l16): acesso a dados da vitrine`

---

### T6: DAL do destaque

**What**: `setPropertyFeatured(tenantId, id, featured)` e `featured` na listagem de imóveis do CRM.
**Where**: `src/server/data/index.ts` (modificar)
**Depends on**: T1
**Reuses**: `updateProperty` e o filtro por tenant
**Requirement**: VDEST-01
**Status**: Done 32dce79

**Done when**:

- [ ] `src/server/data/__tests__/properties-featured.test.ts`: marcar e desmarcar atualiza `updated_at` (AC2); id de outro tenant → inexistente e intocado (AC4); 7 destaques no mesmo tenant aceitos (AC5)
- [ ] `src/server/integration/__tests__/properties.test.ts` ganha asserção de que o item da rota de busca não tem chave de destaque (AC6); asserções existentes inalteradas
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(l16): destaque de imóvel no acesso a dados`

---

### T7: URL de teste do papel da vitrine

**What**: `resolveVitrineTestUrl({ baseUrl, password })` trocando usuário e senha da URL do worker, sem imprimir credencial.
**Where**: `src/db/test-connection.ts` (modificar)
**Depends on**: T0
**Reuses**: `resolveTestDatabaseUrl` (`src/db/test-connection.ts:22`)
**Requirement**: VBANCO-02
**Status**: Done 7c64cca

**Done when**:

- [ ] `src/db/__tests__/test-connection.test.ts` ganha casos: usuário vira `crivo_vitrine`, senha codificada, host e banco preservados; senha ausente → erro com mensagem sem a URL
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `test(l16): url de teste do papel da vitrine`

---

### T8: Views da vitrine

**What**: Seção idempotente dos dois checks de `tenant_storefronts` (só adiciona se ausente em `pg_constraint`), seção de schema e views em `scripts/vitrine/vitrine.sql` e o executor `applyVitrineSql`/`dropVitrineSchema` em `scripts/vitrine/apply.ts`.
**Where**: `scripts/vitrine/vitrine.sql`
**Depends on**: T1
**Reuses**: design.md § Views
**Requirement**: VBANCO-01
**Status**: Done 5d217a8

**Done when**:

- [ ] `src/db/__tests__/vitrine-views.test.ts`, como dono, com fixture de 3 tenants (ativo completo, ativo sem WhatsApp do agente, inativo) e imóveis em todas as combinações de status e publicação: colunas exatas e na ordem (AC2, AC3); corte de loja (AC4) e de imóvel (AC5); loja ativa com tudo vendido aparece sem imóveis; desativada some (Edge Cases); `security_barrier` em `pg_class.reloptions` (AC1)
- [ ] Aplicar duas vezes não duplica nem falha nos checks; com um check removido à mão, aplicar o recria
- [ ] Paridade com o contrato (AC14): para a loja com 3 imóveis visíveis, a busca sem filtros devolve as mesmas 3 referências e total igual ao número de linhas da view
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(l16): views públicas da vitrine`

---

### T9: Papel e grants da vitrine

**What**: Seção de papel e grants no SQL da vitrine (criação idempotente, `default_transaction_read_only`, `statement_timeout`, `USAGE`, `SELECT` nas duas views; senha só quando recebida como parâmetro).
**Where**: `scripts/vitrine/vitrine.sql` (modificar)
**Depends on**: T7, T8
**Reuses**: T7, T8
**Requirement**: VBANCO-02
**Status**: Done f629ad0

**Done when**:

- [ ] `src/db/__tests__/vitrine-privilegios.test.ts`, **conectando como `crivo_vitrine`**: lê as duas views (AC7); `SELECT` em cada uma das 10 tabelas de AC8 recusado com `42501`, uma asserção por tabela (L-012); `INSERT`, `UPDATE` e `DELETE` numa view recusados (AC9); como dono: `role_table_grants` com exatamente as 2 linhas (AC11), sem associação a papel nenhum (AC10), configurações do papel presentes (AC6)
- [ ] Sem `VITRINE_TEST_DB_PASSWORD` o teste falha com mensagem clara (não pula em silêncio)
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(l16): papel de banco somente leitura da vitrine`

---

### T10: `db:push:test` com o SQL da vitrine

**What**: Para cada alvo: derrubar o schema `vitrine` → `drizzle-kit push` → aplicar o SQL com a senha de teste → conferir o estado final (checks de `tenant_storefronts`, as duas views, o papel e os 2 grants) e sair com erro se faltar algo (L-068); parar no primeiro erro; rodar de verdade duas vezes.
**Where**: `scripts/test-db-push.ts` (modificar)
**Depends on**: T9
**Reuses**: laço de alvos existente
**Requirement**: VBANCO-03
**Status**: Done c4f71f5

**Done when**:

- [ ] Etapas extraídas numa função testável; `scripts/__tests__/test-db-push.test.ts` com executores simulados: ordem drop → push → apply → conferência em cada alvo (AC12); erro no push do alvo 2 → alvo 3 intocado e código de saída ≠ 0; push com saída 0 mas conferência faltando um check → código ≠ 0
- [ ] `npm run db:push:test` rodado duas vezes sem erro; depois, os testes da T8 e da T9 passam nos workers (AC13)
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(l16): aplicar o sql da vitrine no db:push:test`

---

### T11: Cliente de revalidação

**What**: `requestStorefrontRevalidation(slug, deps?)` com os 3 desfechos, timeout de 3 s e logs `[vitrine]`; `VITRINE_PUBLIC_URL` e `VITRINE_REVALIDATE_SECRET` vazios no bloco env da config do Vitest.
**Where**: `src/server/storefront/revalidation.ts`
**Depends on**: T2
**Reuses**: tipo do payload da T2; padrão do `CRIVO_OPERATOR_ALERT_EMAIL` vazio (`vitest.config.ts:41`)
**Requirement**: VREV-01
**Status**: Done 9229ba4

**Done when**:

- [ ] `src/server/storefront/__tests__/revalidation.test.ts`: URL, método, `Authorization` e corpo exatamente `{"slug":"imob-x"}` (AC1); URL vazia, segredo vazio e ausentes → `ignorado`, zero chamadas, um `info` (AC2); 500 → `falhou` + `warn` com status (AC3); rejeição e timeout (relógio falso) → `falhou` + `warn` com nome do erro (AC4); exatamente 1 chamada em toda falha (AC5); nenhum caso lança (AC6); nenhum log contém o segredo (AC7)
- [ ] Teste afirma os dois valores vazios no bloco env da config do Vitest (AC11, L-037)
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(l16): cliente de revalidação da vitrine`

---

### T12: Agendamento da revalidação

**What**: `scheduleStorefrontRevalidation(tenantId)`: registra `after()` que resolve o slug e chama a T11; slug ilegível → `warn` e nada enviado.
**Where**: `src/server/storefront/schedule.ts`
**Depends on**: T11, T5
**Reuses**: `getTenantSlug` (T5)
**Requirement**: VREV-02
**Status**: Done 172a213

**Done when**:

- [ ] `src/server/storefront/__tests__/schedule.test.ts` com `after` simulado: o callback roda depois do retorno e chama a T11 com o slug do tenant; falha ao ler o slug → `warn`, zero envios (Edge Case)
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(l16): agendar a revalidação depois da resposta`

---

### T13: Revalidação nas ações de imóvel

**What**: As 5 actions (criar, editar, excluir, publicar, status) agendam a revalidação só no sucesso.
**Where**: `src/server/actions/properties.ts` (modificar)
**Depends on**: T12
**Reuses**: pontos de `revalidatePath` (`:164`, `:307`, `:328`, `:355`, `:386`)
**Requirement**: VREV-02
**Status**: Done

**Done when**:

- [ ] `src/server/__tests__/properties-actions.test.ts` ganha, por action: sucesso → 1 agendamento com o tenant do imóvel (AC8); recusa por validação e por permissão → 0 agendamentos (AC10); cada teste falha se a chamada daquela action for removida (L-026); asserções existentes inalteradas (L-055)
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(l16): revalidar a vitrine nas ações de imóvel`

---

### T14: Action de destaque

**What**: `setPropertyFeaturedAction` com `imoveis:escrever`, DAL da T6 e agendamento da revalidação.
**Where**: `src/server/actions/properties.ts` (modificar)
**Depends on**: T13, T6
**Reuses**: guarda de permissão das demais actions de imóvel
**Requirement**: VDEST-01, VREV-02

**Done when**:

- [ ] Testes no mesmo arquivo da T13: gestor marca → gravado + 1 agendamento; corretor → recusa, nada gravado, 0 agendamentos (AC3); id de outro tenant → inexistente (AC4)
- [ ] Consumidor de produção existe (T19) antes do fechamento (L-021)
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(l16): action de destaque de imóvel`

---

### T15: Action da vitrine

**What**: `saveStorefrontAction` com `configuracoes:escrever`, validação (T3), bloqueios (T4) quando o resultado é ativo, gravação (T5) e agendamento.
**Where**: `src/server/actions/storefront.ts`
**Depends on**: T12, T5
**Reuses**: guarda de `src/server/actions/settings.ts`
**Requirement**: VCFG-02, VATIV-01, VREV-02

**Done when**:

- [ ] `src/server/__tests__/storefront-actions.test.ts`: corretor recusado; campo inválido → recusa por campo e banco inalterado; ativação com as três pré-condições faltando → três recusas na ordem e nada gravado; ativação completa → gravada + 1 agendamento; desativar sem outros campos (VATIV AC7); recusas → 0 agendamentos (VREV AC10)
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(l16): salvar a configuração da vitrine`

---

### T16: Configurações da imobiliária e a vitrine

**What**: A action de configurações agenda a revalidação no sucesso e recusa WhatsApp do agente vazio enquanto a vitrine estiver ativa.
**Where**: `src/server/actions/settings.ts` (modificar)
**Depends on**: T12, T5
**Reuses**: validação existente de configurações
**Requirement**: VATIV-01, VREV-02

**Done when**:

- [ ] `src/server/__tests__/actions.test.ts` (ou o arquivo de settings existente) ganha: vitrine ativa + WhatsApp vazio → recusa no campo, nenhuma parte gravada (VATIV AC6), 0 agendamentos; vitrine inativa + WhatsApp vazio → gravado; sucesso → 1 agendamento (VREV AC9); asserções existentes inalteradas
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(l16): configurações revalidam e protegem a vitrine ativa`

---

### T17: Formulário da vitrine

**What**: Card "Vitrine" com todos os campos, lista de bloqueios (rótulos da T4), recusa por campo mantendo valores, modo somente leitura e link "Abrir vitrine". Antes: `npx astryx build "formulário de configurações com switch, segmented control, selector e textarea"` e `npx astryx component` de cada componente usado.
**Where**: `src/components/settings/storefront-form.tsx`
**Depends on**: T15
**Reuses**: `src/components/settings/baseline-form.tsx`
**Requirement**: VUI-01

**Done when**:

- [ ] Sem `<div>` de layout, sem `style`, só tokens (VUI AC8); self-check do `CLAUDE.md` feito
- [ ] Build passa

**Tests**: none
**Gate**: build

**Commit**: `feat(l16): formulário da vitrine`

---

### T18: Seção Vitrine em Configurações

**What**: A página carrega a configuração, o slug e `VITRINE_PUBLIC_URL` e renderiza a T17, só leitura sem `configuracoes:escrever`.
**Where**: `app/(crm)/configuracoes/page.tsx` (modificar)
**Depends on**: T17
**Reuses**: carga de `getTenant` existente
**Requirement**: VUI-01

**Done when**:

- [ ] Capturas reais (extensão do Chrome, `npm run dev:test`) salvas em `.specs/features/lote-16a-vitrine-lado-crm/capturas/`: seção vazia com os 3 bloqueios; recusa por campo; ativa com o link; desktop e 375 px (L-054)
- [ ] Build passa

**Tests**: none
**Gate**: build

**Commit**: `feat(l16): seção vitrine em configurações`

---

### T19: Destaque na tela de Imóveis

**What**: Switch de destaque no formulário do imóvel (só com `imoveis:escrever`) e Token "Destaque" na lista.
**Where**: `src/components/properties/property-form-dialog.tsx` (modificar)
**Depends on**: T14
**Reuses**: padrão de campos do próprio diálogo
**Requirement**: VUI-02

**Done when**:

- [ ] Capturas reais: diálogo com o controle (gestor), lista com o marcador, lista do corretor sem controle (VUI AC6, AC7)
- [ ] Build passa

**Tests**: none
**Gate**: build

**Commit**: `feat(l16): destaque na tela de imóveis`

---

### T20: Seed da vitrine

**What**: Vitrine ativa e completa para a primeira imobiliária do seed, inativa para a segunda, e destaques visível e não visível.
**Where**: `src/db/seed.ts` (modificar)
**Depends on**: T6
**Reuses**: dados do seed do catálogo (L11)
**Requirement**: VSEED-01

**Done when**:

- [ ] `src/db/__tests__/seed.test.ts` ganha: as duas linhas de `tenant_storefronts` com os valores esperados (AC1); destaques (AC2); duas execuções idênticas (AC3); asserções existentes inalteradas
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(l16): vitrine no seed`

---

### T21: Procedimento do SQL da vitrine

**What**: README com a ordem obrigatória em qualquer banco (derrubar views → push → aplicar SQL), a regra de criar o papel só por SQL (nunca pelo console), a senha definida à parte, as variáveis dos dois projetos e o rollback (`DROP SCHEMA vitrine CASCADE; DROP ROLE crivo_vitrine;`).
**Where**: `scripts/vitrine/README.md`
**Depends on**: T10
**Reuses**: design.md § Papel `crivo_vitrine`
**Requirement**: VBANCO-03

**Done when**:

- [ ] Nenhuma credencial ou URL real no texto; cita AD-040 e AD-042

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): procedimento do sql da vitrine`

---

## Phase Execution Map

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 0:  T0
Phase 1:  T1 → T2 → T3 → T4 → T5
          T1 → T6
Phase 2:  T7 → T9 → T10
          T8 → T9
Phase 3:  T11 → T12 → T13 → T14
          T12 → T15
          T12 → T16
Phase 4:  T15 → T17 → T18
          T14 → T19
Phase 5:  T6 → T20
          T10 → T21
```

Execução estritamente sequencial, na ordem numérica.

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T0 | None | — | ✅ |
| T1 | T0 | T0 → T1 | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | T3 | T3 → T4 | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | T1 | T1 → T6 | ✅ |
| T7 | T0 | T0 → T7 | ✅ |
| T8 | T1 | T1 → T8 | ✅ |
| T9 | T7, T8 | T7 → T9, T8 → T9 | ✅ |
| T10 | T9 | T9 → T10 | ✅ |
| T11 | T2 | T2 → T11 | ✅ |
| T12 | T11, T5 | T11 → T12, T5 → T12 | ✅ |
| T13 | T12 | T12 → T13 | ✅ |
| T14 | T13, T6 | T13 → T14, T6 → T14 | ✅ |
| T15 | T12, T5 | T12 → T15, T5 → T15 | ✅ |
| T16 | T12, T5 | T12 → T16, T5 → T16 | ✅ |
| T17 | T15 | T15 → T17 | ✅ |
| T18 | T17 | T17 → T18 | ✅ |
| T19 | T14 | T14 → T19 | ✅ |
| T20 | T6 | T6 → T20 | ✅ |
| T21 | T10 | T10 → T21 | ✅ |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T0 | registro | none | none | ✅ |
| T1 | Schema | integration | integration | ✅ |
| T2–T4 | Lib pura | unit | unit | ✅ |
| T5, T6 | DAL | integration | integration | ✅ |
| T7 | Script de conexão | unit | unit | ✅ |
| T8, T9 | SQL da vitrine | integration | integration | ✅ |
| T10 | Script | unit | unit | ✅ |
| T11, T12 | Cliente de revalidação | unit | unit | ✅ |
| T13–T16 | Server actions | integration | integration | ✅ |
| T17–T19 | UI | none (build) + captura | none | ✅ |
| T20 | Seed | integration | integration | ✅ |
| T21 | Docs | none | none | ✅ |

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T8 | SQL das views + executor (`apply.ts`) | ⚠️ 2 arquivos coesos: o executor só existe para aplicar o SQL |
| T11 | Cliente + bloco env do Vitest | ⚠️ coeso: os dois valores vazios protegem exatamente este cliente |
| Demais | 1 arquivo / 1 função | ✅ |

## Requirement Coverage

| Requirement | Tasks |
| --- | --- |
| VCFG-01 | T1, T2, T5 |
| VCFG-02 | T3, T5, T15 |
| VATIV-01 | T4, T5, T15, T16 |
| VBANCO-01 | T0, T2, T8 |
| VBANCO-02 | T0, T7, T9 |
| VBANCO-03 | T0, T10, T21 |
| VREV-01 | T11 |
| VREV-02 | T12, T13, T14, T15, T16 |
| VDEST-01 | T1, T6, T14 |
| VUI-01 | T17, T18 |
| VUI-02 | T19 |
| VSEED-01 | T20 |
