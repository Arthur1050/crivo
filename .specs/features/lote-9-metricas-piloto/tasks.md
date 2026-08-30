# Lote 9 — Instrumentação de Métricas do Piloto Tasks

## Execution Protocol (MANDATORY — do not skip)

Implemente estas tasks com a skill `tlc-spec-driven`: **ative-a pelo nome e siga o fluxo de Execute e as Critical Rules dela.** Não procure os arquivos da skill por caminho de sistema de arquivos. A skill é a fonte de verdade do fluxo completo (ciclo por task, delegação a sub-agentes, Verifier, sensor de discriminação).

**Se a skill não puder ser ativada, PARE e avise o usuário — não prossiga sem ela.**

---

**Spec**: `.specs/features/lote-9-metricas-piloto/spec.md`
**Context**: `.specs/features/lote-9-metricas-piloto/context.md`
**Design**: `.specs/features/lote-9-metricas-piloto/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Gerada a partir do código, das diretrizes do projeto e da spec. Diretrizes encontradas: `AGENTS.md` / `CLAUDE.md` (regras de UI e de descoberta de componentes), `vitest.config.ts` (ambiente node, `fileParallelism: false`, testes batem no Postgres de teste via `TEST_DATABASE_URL`), `package.json` (`test`, `lint`, `build`), e amostragem dos 74 arquivos de teste existentes.
>
> **Nota de proveniência importante**: o repositório não tem **nenhum** teste de componente React (zero `.test.tsx` em 74 arquivos). A camada de UI é `none` por convenção estabelecida do projeto, não por lacuna deste lote — a verificação de UI é visual, no Execute, com captura real de tela.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Lib pura (`src/lib/*.ts`) | unit | Todas as ramificações; 1:1 com as ACs da spec; todo edge case listado | `src/lib/__tests__/*.test.ts` | `npm test` |
| Validação (`src/server/validation.ts`) | unit | Todos os limites e formatos aceitos e recusados | `src/server/__tests__/validation.test.ts` | `npm test` |
| DAL (`src/server/data/index.ts`) | integration | Caminhos de query principais + isolamento por tenant **e por carteira** + caminhos de erro | `src/server/data/__tests__/*.test.ts` | `npm test` |
| Camada de integração (`src/server/integration/*`) | integration | Caminho feliz + toda recusa + preservação byte-a-byte da resposta de erro | `src/server/integration/__tests__/*.test.ts` | `npm test` |
| Route handlers (`app/api/**/route.ts`) | integration (rota) | Toda rota tocada: feliz + edge + erro | `src/server/integration/__tests__/routes/*.test.ts` | `npm test` |
| Server actions (`src/server/actions/*`) | integration | Sucesso + permissão negada + fora de escopo | `src/server/__tests__/*.test.ts` | `npm test` |
| Seed / db (`src/db/*.ts`) | integration | Invariantes do seed | `src/db/__tests__/*.test.ts` | `npm test` |
| Schema (`src/db/schema.ts`) | none | build gate apenas | — | build gate |
| Componentes e páginas React | none | build gate + verificação visual com captura real no Execute | — | build gate |

## Gate Check Commands

> Gerados a partir do código. Os testes batem no Postgres de teste (`TEST_DATABASE_URL`); o guard em `src/db/index.ts:9-11` impede que `vitest run` toque o banco real.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Depois de tasks com testes unitários apenas | `npx vitest run <arquivo(s) de teste da task>` |
| Full | Depois de tasks com testes de integração / rota / action | `npm test` |
| Build | Depois de tasks de schema, componente ou página | `npm run build; npm run lint; npm test` |

**Piso de testes**: 912 no fim do lote-8. O contador é monotônico — nenhum teste pode ser removido, enfraquecido ou ter expectativa reduzida. Confirme o piso real com um `npm test` antes da T1 e registre-o.

---

## Execution Plan

Fases são ordenadas e rodam em sequência; dentro de uma fase, as tasks rodam na ordem listada. As arestas de dependência real estão todas no **Phase Execution Map**, no fim do arquivo — a ordem sequencial é mais restritiva que o grafo.

| Phase | Tasks (em ordem) | Tema |
| ----- | ---------------- | ---- |
| 1 | T1 · T2 · T3 · T4 | Fundação de dados e regras puras |
| 2 | T5 · T6 · T7 | DAL das recusas |
| 3 | T8 · T9 · T10 | Peças de instrumentação |
| 4 | T11 · T12 · T13 · T14 · T15 · T16 · T17 | Wrapper aplicado ao contrato |
| 5 | T18 · T19 · T20 · T21 | Escopo de carteira e comparecimento |
| 6 | T22 · T23 · T24 · T25 · T26 | Baseline registrável |
| 7 | T27 · T28 · T29 · T30 · T31 | Comparação normalizada e saúde na tela |
| 8 | T32 · T33 | Ciclo de vida e relatório |
| 9 | T34 | Fechamento |

---

## Task Breakdown

### T1: Colunas de baseline de escalonamento e comparecimento

**Status**: ✅ Done

**What**: Adicionar `baselineEscalationPct` e `baselineAttendancePct` (integer, nullable) à tabela `tenants`.
**Where**: `src/db/schema.ts`
**Depends on**: None
**Reuses**: Padrão aditivo/nullable das três colunas `baseline_*` já existentes (AD-004)
**Requirement**: BASE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] As duas colunas existem no schema com comentário explicando por que são nullable
- [x] `npm run build` passa sem erro de tipo
- [x] Nenhuma coluna existente foi alterada

**Tests**: none
**Gate**: build
**Commit**: `feat(schema): adiciona baseline de escalonamento e comparecimento`

---

### T2: Tabela `integration_refusals`

**Status**: ✅ Done

**What**: Criar a tabela de recusas do contrato, com `tenantId` nullable e os dois índices do design.
**Where**: `src/db/schema.ts`
**Depends on**: T1
**Reuses**: Convenções do schema — `uuid` PK `defaultRandom()`, `timestamp withTimezone`, índices nomeados
**Requirement**: SAUDE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Tabela com `id`, `tenantId` (FK nullable → `tenants.id`), `route`, `method`, `status`, `code` (nullable), `occurredAt`
- [x] Índices `(tenant_id, occurred_at)` e `(occurred_at)` declarados
- [x] Comentário registra o que a tabela NUNCA guarda (corpo, headers, dado pessoal — SAUDE-01 AC4)
- [x] `npm run build` passa

**Tests**: none
**Gate**: build
**Commit**: `feat(schema): registra recusas do contrato de integracao`

---

### T3: Seed deixa os baselines nulos nos tenants-piloto

**Status**: ✅ Done

**What**: Remover os valores mockados de baseline do seed para que preenchê-los seja ato do usuário, e incluir os dois campos novos no tipo do seed.
**Where**: `src/db/seed.ts`
**Depends on**: T1
**Reuses**: Estrutura de tenants do seed
**Requirement**: BASE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Os cinco `baseline_*` saem nulos para todos os tenants semeados
- [x] O tipo do seed cobre as cinco colunas
- [x] `src/db/__tests__/seed.test.ts` cobre a invariante "seed não inventa baseline"
- [x] Gate full passa: `npm test`
- [x] Contagem de testes registrada, sem remoção silenciosa (915 passed, 75 arquivos — mesmo piso; teste da AC substituído por invariante mais ampla, contagem líquida inalterada)

**Tests**: integration
**Gate**: full
**Commit**: `feat(seed): deixa baseline do piloto para o usuario preencher`

---

### T4: Lib pura das regras do lote

**Status**: ✅ Done

**What**: Criar `pilot-metrics.ts` com `periodDays`, `normalizeMonthlyBaseline`, `attendanceWindow`, `isPendingAttendance` e `resolveIntegrationHealth`, com testes unitários.
**Where**: `src/lib/pilot-metrics.ts`
**Depends on**: None
**Reuses**: Disciplina de `src/lib/broker-assignment.ts` e `src/lib/permissions.ts` — função pura, sem I/O, sem `server-only`
**Requirement**: BASE-02, PRES-01, PRES-02, SAUDE-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] As cinco funções existem, puras, sem nenhuma importação de I/O
- [x] Testes cobrem: período < 1 dia sem arredondar para zero; baseline zero tratado como valor; reunião exatamente no instante de encerramento; reunião com 14 dias exatos; saúde com recusa mas com sucesso recente; saúde sem sucesso e sem recusa
- [x] Gate quick passa: `npx vitest run src/lib/__tests__/pilot-metrics.test.ts`
- [x] Contagem de testes do arquivo registrada (20 passed)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(metricas): adiciona regras puras do piloto`

---

### T5: Gravação de recusa na DAL

**Status**: ✅ Done

**What**: `recordIntegrationRefusal(input)` — insere uma linha em `integration_refusals`.
**Where**: `src/server/data/index.ts`
**Depends on**: T2
**Reuses**: Molde de escrita da DAL (insert com `db`), `src/server/data/__tests__/mutations.test.ts` como referência de teste
**Requirement**: SAUDE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Grava com e sem `tenantId`
- [x] Nunca grava campo além dos seis definidos no design
- [x] Testes cobrem recusa com tenant, recusa sem tenant e duas recusas idênticas gerando duas linhas (SAUDE-01 AC6)
- [x] Gate full passa: `npm test`
- [x] Contagem de testes registrada (940 passed, 77 arquivos — subiu de 915/75)

**Tests**: integration
**Gate**: full
**Commit**: `feat(dal): grava recusas do contrato de integracao`

---

### T6: Leitura das recusas para o painel

**Status**: ✅ Done

**What**: `getIntegrationRefusalsSince(tenantId, since)` — recusas do tenant **mais** as sem tenant, agrupadas por `code` e `route`.
**Where**: `src/server/data/index.ts`
**Depends on**: T5
**Reuses**: `src/server/data/__tests__/isolation.test.ts` como referência do teste de isolamento
**Requirement**: SAUDE-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Recusa de OUTRO tenant nunca aparece no resultado
- [x] Recusa sem tenant aparece para qualquer tenant consultado
- [x] Recusa mais antiga que `since` fica de fora
- [x] Gate full passa: `npm test`
- [x] Contagem de testes registrada (945 passed, 77 arquivos — subiu de 940)

**Tests**: integration
**Gate**: full
**Commit**: `feat(dal): le recusas recentes por imobiliaria`

---

### T7: Purga das recusas vencidas

**Status**: ✅ Done

**What**: `purgeIntegrationRefusals(now)` — apaga recusas com mais de 30 dias e devolve a contagem.
**Where**: `src/server/data/index.ts`
**Depends on**: T5
**Reuses**: `expireDocuments` como molde de purga com contagem de retorno
**Requirement**: SAUDE-03

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Recusa de 31 dias some; de 29 dias permanece (limite exato testado)
- [x] Execução sem nada vencido devolve zero, sem erro
- [x] Gate full passa: `npm test`
- [x] Contagem de testes registrada (948 passed, 77 arquivos — subiu de 945)

**Tests**: integration
**Gate**: full
**Commit**: `feat(dal): purga recusas com mais de 30 dias`

---

### T8: Wrapper de rota do contrato

**Status**: ✅ Done

**What**: Criar `withIntegrationRoute` — autentica, curto-circuita a recusa de autenticação, delega com o tenant resolvido e agenda o registro de qualquer resposta ≥ 400 com `after()`.
**Where**: `src/server/integration/route.ts`
**Depends on**: T5
**Reuses**: `authenticate()` (`src/server/integration/auth.ts`), `after` de `next/server`, `recordIntegrationRefusal`
**Requirement**: SAUDE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Handler devolvido carrega a marca `INSTRUMENTED`
- [x] O segundo argumento do Next (`{ params }`) é repassado intacto às rotas dinâmicas
- [x] `code` é extraído de `response.clone().json()` só quando o `Content-Type` é `application/problem+json`; qualquer outro corpo grava `code = null`
- [x] `route` é o `pathname`, nunca a URL com query string
- [x] `after()` chamado dentro de `try/catch`, com fallback para `await` direto da gravação quando não há request scope do Next — sem isso a suíte de rotas inteira quebra na T11 (ver Risks & Concerns do design)
- [x] Teste prova que corpo, status e headers da resposta de erro são idênticos aos de antes da instrumentação (SAUDE-01 AC7)
- [x] Teste prova que falha na gravação não altera a resposta (SAUDE-01 AC5)
- [x] Gate full passa: `npm test`
- [x] Contagem de testes registrada (956 passed, 78 arquivos — subiu de 948/77)

**Tests**: integration
**Gate**: full
**Commit**: `feat(contrato): adiciona wrapper de instrumentacao de recusas`

---

### T9: `methodNotAllowed` instrumentado

**Status**: ✅ Done

**What**: Fazer a fábrica de 405 registrar a recusa, mantendo assinatura e resposta inalteradas.
**Where**: `src/server/integration/problem.ts`
**Depends on**: T8
**Reuses**: `recordRefusalFor` do T8; `src/server/integration/__tests__/problem.test.ts`
**Requirement**: SAUDE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] 405 grava recusa com `tenantId = null`
- [x] Header `Allow` e corpo problem+json continuam idênticos
- [x] `problem()` continua pura e sem parâmetro novo
- [x] Gate full passa: `npm test`
- [x] Contagem de testes registrada (958 passed, 78 arquivos — subiu de 956)

**Desvio justificado**: a função devolvida por `methodNotAllowed` ganhou um
parâmetro `request?: Request` **opcional** (era `() => Response`). Precisa
dele para saber a rota chamada; opcional porque manter o handler síncrono
(sem virar `async`) era obrigatório para não quebrar os 6 testes de rota
legados que chamam `handler()` sem `Request` nem `await`
(`leads-post.test.ts` e os outros 5 arquivos de `routes/`) — todos
continuam passando sem nenhuma alteração de expectativa. Sem `request`, a
recusa simplesmente não é registrada (nada para registrar).

**Tests**: integration
**Gate**: full
**Commit**: `feat(contrato): registra recusa de metodo nao suportado`

---

### T10: Catch-all de rota inexistente instrumentado

**Status**: ✅ Done

**What**: Fazer a rota `[...unmatched]` registrar o 404 com a rota efetivamente chamada.
**Where**: `app/api/v1/[...unmatched]/route.ts`
**Depends on**: T8
**Reuses**: `recordRefusalFor`; padrão dos testes em `src/server/integration/__tests__/routes/`
**Requirement**: SAUDE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] 404 grava recusa com `code = "rota-inexistente"` e a rota chamada
- [x] Resposta ao chamador inalterada
- [x] Gate full passa: `npm test`
- [x] Contagem de testes registrada (961 passed, 79 arquivos — subiu de 958)

**Mesmo desvio justificado do T9**: `notFound()` ganhou `request?: Request`
opcional, permanece síncrono, e `unmatchedGet()` sem argumento
(`leads-post.test.ts`) continua funcionando sem gravar nada.

**Tests**: integration (rota)
**Gate**: full
**Commit**: `feat(contrato): registra recusa de rota inexistente`

---

### T11: `POST /api/v1/leads` sob o wrapper

**Status**: ✅ Done

**What**: Envolver os exports do route file com `withIntegrationRoute`, removendo a autenticação inline.
**Where**: `app/api/v1/leads/route.ts`
**Depends on**: T8, T9
**Reuses**: `src/server/integration/__tests__/routes/leads-post.test.ts`
**Requirement**: SAUDE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `if (auth instanceof Response) return auth;` some do handler
- [x] Todos os testes de rota existentes continuam verdes sem alteração de expectativa
- [x] Teste novo prova que uma recusa da rota grava linha com o tenant correto
- [x] Gate full passa: `npm test` (962 passed, 79 arquivos — subiu de 961)

**Achados/desvios**:
- `withIntegrationRoute<Ctx = never>` virou `Ctx = unknown` em `route.ts`
  (2 linhas, sem mudança de comportamento) — `never` obrigava todo chamador
  sem contexto dinâmico a um cast (`as never`) só para satisfazer o
  compilador; `unknown` aceita `undefined` de forma natural. Ajuste feito
  agora porque é a mesma assinatura genérica que as próximas 5 rotas (T12–T16)
  vão instanciar; `src/server/integration/__tests__/route.test.ts` (T8)
  re-executado e continua 8/8 depois do ajuste.
- `integration_refusals.tenant_id` referencia `tenants.id` sem `onDelete`: o
  `afterAll` deste arquivo de teste apagava o tenant fixture direto, e agora
  que a rota grava recusa de verdade, a FK bloqueia essa deleção enquanto a
  linha de recusa existir. `afterAll` ganhou um `delete(integrationRefusals)`
  antes do `delete(tenants)` — mesmo problema provavelmente aparece em
  T12–T16 (qualquer route test file cujo `afterAll` apaga um tenant próprio
  depois de exercitar uma resposta >= 400 pela rota instrumentada); resolvido
  arquivo a arquivo conforme aparece.

**Tests**: integration (rota)
**Gate**: full
**Commit**: `refactor(contrato): move leads para o wrapper instrumentado`

---

### T12: `GET/PATCH /api/v1/leads/{id}` sob o wrapper

**Status**: ✅ Done

**What**: Mesma troca no route file de lead individual.
**Where**: `app/api/v1/leads/[id]/route.ts`
**Depends on**: T11
**Reuses**: `routes/leads-patch.test.ts`, `routes/leads-patch-atribuicao.test.ts`
**Requirement**: SAUDE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `params` continua chegando ao handler corretamente
- [x] Testes de rota existentes verdes sem alteração de expectativa
- [x] Recusa `conflito-de-agenda` ou `sem-corretor-disponivel` grava linha com o código correto
- [x] Gate full passa: `npm test` (962 passed, 79 arquivos — mesmo total do T11; as duas provas novas são asserções adicionadas a `it()`s existentes, não `it()`s novos)

**Mesmo achado do T11**: `afterAll` de `leads-patch.test.ts` e
`leads-patch-atribuicao.test.ts` apagava os tenants fixture direto; ganharam
`delete(integrationRefusals)` antes do `delete(tenants)` pela mesma FK sem
`onDelete`.

**Tests**: integration (rota)
**Gate**: full
**Commit**: `refactor(contrato): move lead individual para o wrapper instrumentado`

---

### T13: Mensagens do lead sob o wrapper

**Status**: ✅ Done

**What**: Mesma troca no route file de mensagens.
**Where**: `app/api/v1/leads/[id]/messages/route.ts`
**Depends on**: T12
**Reuses**: `routes/leads-messages-get.test.ts`, `routes/leads-messages-post.test.ts`
**Requirement**: SAUDE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Testes de rota existentes verdes sem alteração de expectativa
- [x] Recusa de payload inválido grava linha com `code = "payload-invalido"`
- [x] Gate full passa: `npm test` (962 passed, 79 arquivos — mesmo total; a prova nova é asserção em `it()` existente)

**Mesmo achado do T11/T12**: `afterAll` de `leads-messages-get.test.ts` e
`leads-messages-post.test.ts` ganharam `delete(integrationRefusals)` antes
do `delete(tenants)`.

**Tests**: integration (rota)
**Gate**: full
**Commit**: `refactor(contrato): move mensagens para o wrapper instrumentado`

---

### T14: Opt-out sob o wrapper

**What**: Mesma troca no route file de opt-out.
**Where**: `app/api/v1/leads/[id]/opt-out/route.ts`
**Depends on**: T13
**Status**: ✅ Done

**Reuses**: `routes/leads-opt-out.test.ts`
**Requirement**: SAUDE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Testes de rota existentes verdes sem alteração de expectativa
- [x] Gate full passa: `npm test` (962 passed, 79 arquivos — mesmo total do T13)

**Mesmo achado do T11-T13**: `afterAll` de `leads-opt-out.test.ts` ganhou
`delete(integrationRefusals)` antes do `delete(tenants)`.

**Tests**: integration (rota)
**Gate**: full
**Commit**: `refactor(contrato): move opt-out para o wrapper instrumentado`

---

### T15: Contexto sob o wrapper

**Status**: ✅ Done

**What**: Mesma troca no route file de contexto.
**Where**: `app/api/v1/context/route.ts`
**Depends on**: T14
**Reuses**: `routes/context-get.test.ts`
**Requirement**: SAUDE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Testes de rota existentes verdes sem alteração de expectativa
- [x] Gate full passa: `npm test` (962 passed, 79 arquivos — mesmo total do T14)

**Mesmo achado do T11-T14**: `afterAll` de `context-get.test.ts` ganhou
`delete(integrationRefusals)` antes do `delete(tenants)`.

**Tests**: integration (rota)
**Gate**: full
**Commit**: `refactor(contrato): move contexto para o wrapper instrumentado`

---

### T16: Settings sob o wrapper

**Status**: ✅ Done

**What**: Mesma troca no route file de settings.
**Where**: `app/api/v1/settings/route.ts`
**Depends on**: T15
**Reuses**: `routes/settings-get.test.ts`
**Requirement**: SAUDE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Testes de rota existentes verdes sem alteração de expectativa
- [x] Gate full passa: `npm test` (962 passed, 79 arquivos — mesmo total do T15)

**Nota**: `settings-get.test.ts` só grava recusa com `tenantId = null` (401
pré-auth); o `delete(integrationRefusals)` no `afterAll` foi incluído por
consistência/segurança com os demais arquivos de T11-T15, não porque um
teste existente estivesse quebrando.

**Tests**: integration (rota)
**Gate**: full
**Commit**: `refactor(contrato): move settings para o wrapper instrumentado`

---

### T17: Varredura que exige instrumentação em todo route file

**Status**: ✅ Done

**What**: Teste que importa todo `route.ts` sob `app/api/v1` e exige a marca `INSTRUMENTED` em cada export de verbo HTTP.
**Where**: `src/server/integration/__tests__/route-instrumentation.test.ts`
**Depends on**: T16
**Reuses**: Padrão de varredura de `src/server/integration/__tests__/openapi.test.ts`
**Requirement**: SAUDE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] O teste descobre os route files por varredura de diretório, nunca por lista fixa
- [x] Falha com mensagem clara quando um export não está instrumentado
- [x] Gate full passa: `npm test` (964 passed, 80 arquivos — subiu de 962/79)
- [x] Contagem de testes registrada (2 testes no arquivo novo)

**Achado/desvio**: `INSTRUMENTED` originalmente só era aplicado por
`withIntegrationRoute`. `methodNotAllowed()` (T9) e o catch-all `notFound()`
(T10) gravam recusa por um caminho mais direto (`recordRefusalFor` sem
passar pelo wrapper inteiro, porque não há autenticação nem handler de
negócio a delegar) — sem marcá-los também, a varredura reprovaria 100% dos
verbos 405/404 de toda rota do lote, o que não é o que SAUDE-01 pede
("nenhum export sem instrumentação", não "nenhum export fora do wrapper").
`problem.ts` e `app/api/v1/[...unmatched]/route.ts` ganharam
`Object.assign(handler, { [INSTRUMENTED]: true })` nos dois handlers que já
chamavam `recordRefusalFor` — sem mudar nenhum comportamento observável,
só a marca. `npm run build` rodado como checagem extra (não é o gate desta
task) — compila limpo, incluindo os 7 route files sob `/api/v1`.

**Tests**: integration
**Gate**: full
**Commit**: `test(contrato): exige instrumentacao em todo route file de v1`

---

### T18: Escritas do Pipeline passam a exigir `LeadScope`

**Status**: ✅ Done

**What**: `updateLeadStatus`, `updateLeadBroker` e `setMeetingAttendance` trocam `tenantId` por `LeadScope` na assinatura e ganham `assignedTo(scope)` no WHERE; as três actions do Pipeline resolvem o escopo com `getLeadScope()`.
**Where**: `src/server/data/index.ts`, `src/server/actions/pipeline.ts`
**Depends on**: None
**Reuses**: `LeadScope` / `assignedTo()` (`src/server/data/index.ts:42-70`), `getLeadScope()` (`src/server/auth/session.ts:149`)
**Requirement**: SCOPE-02
**Nota de granularidade**: dois arquivos de propósito — trocar a assinatura sem atualizar os call sites deixaria o build quebrado, e a skill manda absorver a dependência de compilação em vez de deferir o teste.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] As três funções da DAL recusam lead fora do escopo, devolvendo `null`
- [x] As três actions devolvem "lead não encontrado" nesse caso, sem alterar dado
- [x] Teste prova que administrador e gestor seguem alcançando qualquer lead do tenant (SCOPE-02 AC5)
- [x] Nenhum call site remanescente passa `tenantId` cru para as três funções
- [x] Gate full passa: `npm test`
- [x] Contagem de testes registrada

**Achados/desvios**: `updateLeadBroker` também é chamado por `deactivateMemberAction`
(`src/server/actions/deactivate.ts`) na redistribuição de carteira de um membro
desativado — call site não listado no design, encontrado por busca no repo antes
da troca de assinatura (conforme instruído). Recebeu escopo de imobiliária
inteira (`{ tenantId: session.tenantId, assignedUserId: null }`), nunca o do
ator: a operação redistribui a carteira INTEIRA de quem está saindo, já
autorizada por `denyIfForbidden("usuarios", "escrever")`, não a carteira do
administrador/gestor que a executa. `src/server/__tests__/actions.test.ts` teve
o mock de `verifySession` estendido com `getLeadScope` explícito — a versão
sem mock chamaria a `verifySession` REAL do módulo original (binding interno,
não interceptado pelo spread `...actual`), quebrando qualquer action que
passasse a usar `getLeadScope()` fora de um request scope do Next.
**Contagem de testes**: 96 passed, 0 failed nos três arquivos de teste tocados
(`actions.test.ts`, `mutations.test.ts`, `lead-controls.test.ts`) — mais os
call sites em `leads.test.ts`, `leads-patch.test.ts`,
`leads-patch-atribuicao.test.ts`, sem alteração de expectativa. `npm test`
completo rodado uma vez cobrindo todo o batch T18–T26 (relatado no resumo
final deste worker para o orquestrador).

**Tests**: integration
**Gate**: full
**Commit**: `fix(pipeline): escopa escritas de lead pela carteira do corretor`

---

### T19: Leitura das reuniões pendentes de confirmação

**Status**: ✅ Done

**What**: `getPendingAttendanceMeetings(scope, now)` — reuniões encerradas, sem comparecimento registrado, dentro da janela de 14 dias, escopadas.
**Where**: `src/server/data/index.ts`
**Depends on**: T4, T18
**Reuses**: `attendanceWindow`/`isPendingAttendance` (T4), `MEETING_DURATION_MS`, `assignedTo(scope)`
**Requirement**: PRES-01, PRES-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Reunião que ainda não terminou não aparece
- [x] Reunião encerrada há 13 dias aparece; há 15 dias não aparece
- [x] Reunião com comparecimento já registrado não aparece
- [x] Corretor vê só as da própria carteira; gestor vê todas do tenant
- [x] Lead sem responsável aparece para gestor e administrador (edge case da spec)
- [x] Gate full passa: `npm test`
- [x] Contagem de testes registrada

**Achados/desvios**: implementado com uma query SQL de candidatos (tenant +
`assignedTo(scope)` + `meeting_at IS NOT NULL` + `meeting_attended IS NULL`)
seguida de um filtro em JS que chama `isPendingAttendance` diretamente — reusa
a MESMA função pura do T4 para a janela dos 30min/14 dias em vez de duplicar a
matemática de datas em SQL. Volume de dados de um piloto não justifica
pushdown do filtro temporal para o banco. Resultado ordenado por `meetingAt`
asc (mais urgente primeiro), id como desempate determinístico.
**Contagem de testes**: 4 passed, 0 failed em
`src/server/data/__tests__/pending-meetings.test.ts` (arquivo novo).

**Tests**: integration
**Gate**: full
**Commit**: `feat(dal): lista reunioes pendentes de confirmacao`

---

### T20: Componente de reuniões a confirmar

**Status**: ✅ Done

**What**: Componente que lista as reuniões pendentes e confirma comparecimento ou ausência em um clique.
**Where**: `src/components/dashboard/pending-meetings.tsx`
**Depends on**: T19
**Reuses**: Interação de `src/components/pipeline/lead-controls.tsx`, `setMeetingAttendanceAction`
**Requirement**: PRES-01

**Tools**: MCP: NONE · CLI: `npx astryx component <Nome>` antes de usar qualquer componente novo

**Done when**:

- [x] Sem `<div>`, sem `style={{}}`, sem valor cru — só componentes Astryx e utilities token-backed (AD-010, AD-012)
- [x] Estado vazio explícito quando não há pendência (PRES-01 AC7)
- [x] Erro da action é exibido, nunca engolido
- [x] `npm run build` e `npm run lint` passam

**Achados/desvios**: componentes consultados via `npx astryx component` antes
do uso: `Button` (prop `clickAction` para o handler assíncrono com loading
automático), `ButtonGroup` (as duas ações de confirmação lado a lado),
`Table`/`EmptyState` (mesmo molde de `recent-leads-table.tsx`). Verificação
visual pendente: a extensão Chrome real está disponível na sessão (2
navegadores conectados), mas a seleção exige confirmação interativa do
usuário via ferramenta dedicada não disponível para este subagente — deixado
como pendência explícita para o orquestrador (ver resumo final).

**Tests**: none
**Gate**: build
**Commit**: `feat(dashboard): adiciona bloco de reunioes a confirmar`

---

### T21: Bloco de reuniões composto no Dashboard

**Status**: ✅ Done

**What**: Buscar as pendências no RSC do Dashboard, serializar a fronteira e posicionar o bloco abaixo dos leads recentes.
**Where**: `app/(crm)/dashboard/page.tsx`
**Depends on**: T20
**Reuses**: `getLeadScope()` já chamado na página; padrão de serialização RSC→client já usado para `recentLeadRows`
**Requirement**: PRES-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Nenhum `Date` nem `bigint` atravessa cru a fronteira RSC→client (AD-007)
- [x] Bloco posicionado depois dos KPIs, gráficos e leads recentes (PRES-01 AC2)
- [x] `npm run build` e `npm run lint` passam

**Achados/desvios**: `now = new Date()` resolvido uma única vez no início do
render e reusado tanto na consulta (`getPendingAttendanceMeetings(scope,
now)`) quanto seria reusado por qualquer outro cálculo dependente de "agora"
na mesma página — evita que a janela de 14 dias mude entre a consulta e a
serialização. Verificação visual: mesma pendência do T20 (extensão Chrome
disponível mas seleção de navegador exige confirmação interativa
indisponível para este subagente).

**Tests**: none
**Gate**: build
**Commit**: `feat(dashboard): liga reunioes a confirmar ao periodo real`

---

### T22: Validação dos campos de baseline

**Status**: ✅ Done

**What**: `validateBaselineCount` (inteiro ≥ 0) e `validateBaselinePercent` (inteiro 0–100), com testes unitários.
**Where**: `src/server/validation.ts`
**Depends on**: None
**Reuses**: Molde de `validateName`/`ValidationResult`; `src/server/__tests__/validation.test.ts`
**Requirement**: BASE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Recusa negativo, fracionário e não numérico; recusa percentual 101 e −1
- [x] Aceita zero como valor válido (edge case da spec)
- [x] Aceita vazio como ausência de baseline, não como erro (BASE-01 AC5)
- [x] Gate quick passa: `npx vitest run src/server/__tests__/validation.test.ts`
- [x] Contagem de testes registrada

**Achados/desvios**: assinatura `(value: number | null | undefined, label:
string)` — "não numérico" é exercitado com `Number("abc")` (que resulta em
`NaN`, ainda tipado `number`): `Number.isInteger(NaN)` já é `false`, então a
mesma checagem cobre não-numérico, fracionário e fora de faixa sem uma
terceira regra. `undefined` (chave ausente) e `null` (campo limpo pelo
usuário) tratados como o mesmo "vazio válido" — ambos `ok: true`.
**Contagem de testes**: 67 passed, 0 failed em
`src/server/__tests__/validation.test.ts` (arquivo inteiro).

**Tests**: unit
**Gate**: quick
**Commit**: `feat(validacao): valida campos de baseline do piloto`

---

### T23: DAL grava os cinco baselines

**Status**: ✅ Done

**What**: Estender `TenantSettingsUpdate` e `updateTenantSettings` com os cinco campos de baseline, no padrão SPG-1.
**Where**: `src/server/data/index.ts`
**Depends on**: T1
**Reuses**: `optionalTenantText` como referência do padrão "chave ausente = coluna intocada"; `src/server/data/__tests__/tenant-settings.test.ts`
**Requirement**: BASE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Chave ausente não toca a coluna; `null` explícito limpa; valor grava
- [x] Salvar um baseline não altera os outros quatro
- [x] Gate full passa: `npm test`
- [x] Contagem de testes registrada

**Achados/desvios**: os cinco campos são `number | null | undefined` sem
normalização de texto (mesmo tratamento de `meetingDays` — são `integer`,
não texto), então não reusam `optionalTenantText` (que só normaliza string);
o padrão SPG-1 "chave ausente intocada / null limpa / valor grava" é o mesmo,
só o guard muda de `optionalTenantText(x) !== undefined` para
`x !== undefined` direto.
**Contagem de testes**: 23 passed, 0 failed em
`src/server/data/__tests__/tenant-settings.test.ts` (arquivo inteiro).

**Tests**: integration
**Gate**: full
**Commit**: `feat(dal): persiste baseline do piloto por imobiliaria`

---

### T24: Action de configurações aceita baseline

**Status**: ✅ Done

**What**: Estender `updateTenantSettingsAction` com os cinco campos, validando antes de qualquer escrita e recusando sem permissão.
**Where**: `src/server/actions/settings.ts`
**Depends on**: T22, T23
**Reuses**: `denyIfForbidden("configuracoes", "escrever")`, molde de curto-circuito de validação da própria action
**Requirement**: BASE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Um campo inválido impede a gravação dos cinco (BASE-01 AC3/AC4)
- [x] Corretor recebe recusa mesmo chamando a action direto (BASE-01 AC6)
- [x] Gate full passa: `npm test`
- [x] Contagem de testes registrada

**Achados/desvios**: as cinco checagens de validação (uma por campo) rodam
ANTES de qualquer chamada à DAL, mesmo molde de curto-circuito dos campos
existentes — um percentual fora de faixa barra a gravação dos cinco, mesmo
com os outros quatro válidos. A recusa por permissão (`denyIfForbidden`)
continua sendo a PRIMEIRA checagem da action, então AC6 já valia
estruturalmente; teste dedicado adicionado mesmo assim para deixar a prova
explícita com baseline no payload.
**Contagem de testes**: 62 passed, 0 failed em
`src/server/__tests__/actions.test.ts` (arquivo inteiro).

**Tests**: integration
**Gate**: full
**Commit**: `feat(configuracoes): aceita baseline do piloto na action`

---

### T25: Formulário de baseline

**Status**: ✅ Done

**What**: Componente de formulário com os cinco campos de baseline e feedback de erro por campo.
**Where**: `src/components/settings/baseline-form.tsx`
**Depends on**: T24
**Reuses**: Molde do formulário de configurações existente
**Requirement**: BASE-01

**Tools**: MCP: NONE · CLI: `npx astryx component <Nome>`

**Done when**:

- [x] Cinco campos rotulados com a unidade explícita (leads/mês, minutos, %)
- [x] Erro exibido no campo que falhou
- [x] Sem `<div>`, sem estilo inline, sem valor cru
- [x] `npm run build` e `npm run lint` passam

**Achados/desvios**: componente consultado via `npx astryx component
NumberInput` (`units`/`min`/`max`/`isIntegerOnly`/`hasClear` cobrem a unidade
explícita e os limites de faixa direto no controle, sem validação
client-side redundante além da cortesia). Como `name`/`agentName`/
`supportedModality` são obrigatórios em TODO save de `updateTenantSettingsAction`
e este formulário não tem estado sobre eles, o save reenvia os valores
ATUAIS do `tenant` (prop) sem alterá-los — mesmo princípio SPG-1 já usado por
`settings-form.tsx`, aplicado ao caso de um formulário que edita só um
subconjunto de campos. `SettingsSection` (o wrapper Card+Heading+Divider de
`settings-form.tsx`) não foi importado por ser função privada não exportada
daquele módulo, e T25 lista só `baseline-form.tsx` no `Where` — o mesmo
padrão visual foi duplicado localmente em vez de exportar de um arquivo fora
do escopo da task.

**Tests**: none
**Gate**: build
**Commit**: `feat(configuracoes): adiciona formulario de baseline`

---

### T26: Formulário composto na tela de Configurações

**Status**: ✅ Done

**What**: Posicionar o formulário de baseline na página, carregando os valores atuais do tenant.
**Where**: `app/(crm)/configuracoes/page.tsx`
**Depends on**: T25
**Reuses**: Carregamento de tenant já feito pela página
**Requirement**: BASE-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Valores atuais pré-carregados, inclusive quando nulos
- [x] `npm run build` e `npm run lint` passam

**Achados/desvios**: `<BaselineForm tenant={tenant} />` posicionado logo após
`<SettingsForm tenant={tenant} />` e antes do card "Documentos" — o mesmo
`tenant` já carregado pela página alimenta os dois formulários, nenhuma
consulta nova. Valores nulos chegam ao componente como `null` (não `undefined`)
e o `NumberInput` renderiza vazio nesse caso, sem erro. Verificação visual:
mesma pendência do T20/T21 (extensão Chrome disponível mas seleção de
navegador exige confirmação interativa indisponível para este subagente).

**Tests**: none
**Gate**: build
**Commit**: `feat(configuracoes): liga o formulario de baseline a tela`

---

### T27: Tiles com baseline normalizado

**What**: Estender `KpiTiles` para os cinco baselines, normalizando o baseline mensal ao período e exibindo o valor normalizado.
**Where**: `src/components/dashboard/kpi-tiles.tsx`
**Depends on**: T4, T23
**Reuses**: `normalizeMonthlyBaseline`/`periodDays` (T4), `format*Delta` (`src/lib/format.ts`)
**Requirement**: BASE-02

**Tools**: MCP: NONE · CLI: `npx astryx component <Nome>`

**Done when**:

- [x] Os cinco tiles comparam quando há baseline (BASE-02 AC3)
- [x] O valor normalizado aparece por extenso no tile (BASE-02 AC2)
- [x] KPI indisponível exibe o baseline sem delta (BASE-02 AC6)
- [x] Convite para registrar aparece só com permissão de escrita (BASE-02 AC4/AC5)
- [x] `npm run build` e `npm run lint` passam

**Tests**: none
**Gate**: build
**Commit**: `feat(dashboard): compara os cinco kpis com baseline normalizado`

**Status**: ✅ Done — build e lint verdes (0 erros; 3 warnings pré-existentes sem relação). `periodDays`/`canEditSettings` e os 2 baselines novos entraram como opcionais nesta task para o build permanecer verde antes do Dashboard (T28) passá-los; T28 os wireia.

---

### T28: Dashboard alimenta os tiles com período e permissão

**What**: Passar `periodDays` e `canEditSettings` ao `KpiTiles`, e os cinco baselines do tenant.
**Where**: `app/(crm)/dashboard/page.tsx`
**Depends on**: T27
**Reuses**: `resolveDashboardPeriod` já resolvido uma vez na página; `can()` de `src/lib/permissions.ts`
**Requirement**: BASE-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] O período usado na normalização é o MESMO objeto que alimenta tiles e gráficos (regra de definição única de P do lote-4)
- [x] `npm run build` e `npm run lint` passam

**Tests**: none
**Gate**: build
**Commit**: `feat(dashboard): passa periodo e permissao aos tiles`

**Status**: ✅ Done — build e lint verdes (0 erros; mesmos 3 warnings pré-existentes). `periodDays(period.from, period.to)` usa o mesmo `period` de `resolveDashboardPeriod` que já alimenta `PeriodFilter`, `getLeadVolumeSeries` e `getLeadDistributions` — nenhum recálculo paralelo.

---

### T29: Componente de saúde da integração

**What**: Bloco que exibe última atividade do agente, contagem de recusas de 24h e o estado resolvido.
**Where**: `src/components/dashboard/integration-health.tsx`
**Depends on**: T4, T6
**Reuses**: `resolveIntegrationHealth` (T4); `StatusDot`/`Token` da Astryx para estado (regra do CLAUDE.md)
**Requirement**: SAUDE-02

**Tools**: MCP: NONE · CLI: `npx astryx component <Nome>`

**Done when**:

- [x] Recusas identificadas por código e rota, sem nenhum dado de lead (SAUDE-02 AC7)
- [x] Estado de problema tem destaque visual sem mudar de posição (SAUDE-02 AC5)
- [x] Ausência total de atividade lê como problema, não como silêncio (edge case da spec)
- [x] `npm run build` e `npm run lint` passam

**Tests**: none
**Gate**: build
**Commit**: `feat(dashboard): adiciona bloco de saude da integracao`

**Status**: ✅ Done — build e lint verdes (0 erros; mesmos 3 warnings pré-existentes). Componente resolve o estado internamente via `resolveIntegrationHealth(lastSuccessAt, refusals.length, now)`, recebendo os ingredientes já buscados pelo chamador (T30). `StatusDot` (variant + `isPulsing`) fica sempre no mesmo lugar do card — só cor/pulso mudam com o estado. Recusas em `List`/`ListItem` com `Token` por código — sem `renderCell` de `Table`, o componente inteiro fica Server Component (nenhuma função cruza a fronteira RSC→client). Ainda não composto no Dashboard (T30).

---

### T30: Bloco de saúde composto no Dashboard

**What**: Buscar última atividade e recusas no RSC, aplicar a permissão e posicionar o bloco no rodapé da página.
**Where**: `app/(crm)/dashboard/page.tsx`
**Depends on**: T29
**Reuses**: `getLastAgentMessageAt` (já usado pelo shell), `getIntegrationRefusalsSince` (T6), `can()`
**Requirement**: SAUDE-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Sem `configuracoes:ler`, o bloco não é renderizado nem consultado (SAUDE-02 AC2)
- [x] Bloco posicionado abaixo do bloco de reuniões pendentes (SAUDE-02 AC1)
- [x] `npm run build` e `npm run lint` passam

**Tests**: none
**Gate**: build
**Commit**: `feat(dashboard): liga a saude da integracao a permissao`

**Status**: ✅ Done — build e lint verdes (0 erros; mesmos 3 warnings pré-existentes). `canReadSettings` guarda as duas queries (`getLastAgentMessageAt`, `getIntegrationRefusalsSince`) FORA do `Promise.all` principal, num bloco condicional próprio — sem `configuracoes:ler` nenhuma das duas roda. Card "Saúde da integração" é o último da página, logo abaixo de "Reuniões a confirmar".

---

### T31: Projeção explícita nas consultas de KPI

**What**: Trocar o `select()` sem projeção de `getDashboardKpis` por seleção explícita das colunas agregadas.
**Where**: `src/server/data/index.ts`
**Depends on**: None
**Reuses**: `src/server/data/__tests__/dashboard.test.ts`
**Requirement**: PERF-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Só as colunas usadas na agregação entram no `select`
- [x] Teste inspeciona o SQL gerado e prova a ausência das colunas de texto longo
- [x] Todos os valores de KPI apurados continuam idênticos, sem alteração de expectativa em nenhum teste existente
- [x] Gate full passa: `npm test`
- [x] Contagem de testes registrada

**Tests**: integration
**Gate**: full
**Commit**: `perf(dashboard): projeta so as colunas usadas nos kpis`

**Status**: ✅ Done — `npm test`: **1014 passed, 0 failed, 81 arquivos** (piso 1009 + 2 novos testes desta task + 3 de T32). `periodLeadsQuery` isolada de `getDashboardKpis`, exportada só para teste (`__testOnly_periodLeadsQuery`) inspecionar `.toSQL()` sem bater no banco — prova ausência de `executive_summary`/`escalation_reason`/`purchase_horizon`/`region` e presença das 4 colunas usadas. Nenhuma expectativa de teste existente foi alterada.

---

### T32: Cron purga as recusas vencidas

**What**: A execução diária que expira documentos passa a purgar recusas, reportando a contagem e sobrevivendo à falha da purga.
**Where**: `src/server/integration/lgpd.ts`, `app/api/cron/expire-documents/route.ts`
**Depends on**: T7
**Reuses**: `expireDocuments`, autenticação por `CRON_SECRET`, `routes/cron-expire-documents.test.ts`
**Requirement**: SAUDE-03
**Nota de granularidade**: dois arquivos porque o retorno da rota muda junto com a função — separar deixaria a rota devolvendo um contrato que a função não produz.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Resultado da rota inclui `refusalsDeleted`
- [x] Falha na purga não impede a expiração de documentos e é reportada no resultado (SAUDE-03 AC3)
- [x] Execução sem nada vencido devolve zero sem erro
- [x] Gate full passa: `npm test`
- [x] Contagem de testes registrada

**Tests**: integration (rota)
**Gate**: full
**Commit**: `feat(cron): purga recusas junto da expiracao de documentos`

**Status**: ✅ Done — `npm test`: **1014 passed, 0 failed, 81 arquivos** (piso 1009 + 2 de T31 + 3 desta task). `runDailyMaintenance` (novo, em `lgpd.ts`) roda `expireDocuments` primeiro e só então tenta `purgeIntegrationRefusals` num `try/catch` próprio — falha na purga vira `refusalsPurgeFailed: true` sem afetar o resultado da expiração já concluída. Rota troca `expireDocuments` por `runDailyMaintenance`. Teste de falha mocka só `purgeIntegrationRefusals` do módulo de dados (`vi.mock` com `importOriginal`, mesmo padrão de `route.test.ts`), preservando o resto do módulo real.

---

### T33: Rota de relatório imprimível

**What**: Criar o grupo de rotas do relatório, sem `AppShell`, com os cinco KPIs ao lado dos cinco baselines para o período pedido.
**Where**: `app/(relatorio)/relatorio/page.tsx`, `app/(relatorio)/layout.tsx`
**Depends on**: T27, T28
**Reuses**: `resolveDashboardPeriod`, `getDashboardKpis`, `getTenant`, `requirePermission("configuracoes", "ler")`
**Requirement**: REL-01
**Nota de granularidade**: dois arquivos porque a rota não existe sem o layout do grupo.

**Tools**: MCP: NONE · CLI: `npx astryx component <Nome>`

**Done when**:

- [x] Nenhuma dependência nova em `package.json` (REL-01 AC5)
- [x] Os cinco números batem com o Dashboard no mesmo período, calculados pelas mesmas funções (REL-01 AC2)
- [x] Sem `configuracoes:ler`, a rota recusa (REL-01 AC4)
- [x] Período sem lead renderiza sem erro
- [x] Imobiliária e intervalo de datas identificados na página
- [x] `npm run build` e `npm run lint` passam

**Tests**: none
**Gate**: build
**Commit**: `feat(relatorio): adiciona pagina imprimivel do piloto`

**Status**: ✅ Done — build e lint verdes (0 erros; mesmos 3 warnings pré-existentes); `package.json`/`package-lock.json` inalterados. `RelatorioPage` reusa `resolveDashboardPeriod` + `getDashboardKpis` + o mesmíssimo `KpiTiles` do Dashboard (`canEditSettings={false}`, sem link navegável) — nenhum recálculo paralelo. Sem `configuracoes:ler`, `requirePermission` lança `PermissionDeniedError` e a página responde 404 (mesmo padrão de `configuracoes/page.tsx`). Grupo `(relatorio)` nasce sem `AppShell`/`Sidebar` (layout próprio, só `VStack padding`); `proxy.ts` ainda exige cookie de sessão. Período sem lead usa o mesmo caminho `null`-safe que `KpiTiles` já trata desde T27.

---

### T34: Fechamento — decisões, rastreabilidade e handoff

**What**: Registrar AD-023 e AD-024 no `STATE.md`, atualizar o Handoff e fechar a rastreabilidade da spec.
**Where**: `.specs/STATE.md`
**Depends on**: T33
**Reuses**: Formato das ADs existentes (Decision / Reason / Trade-off / Scope / Date / Status)
**Requirement**: SAUDE-01, BASE-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] AD-023 (instrumentação do contrato) e AD-024 (baseline do piloto) registradas com trade-off explícito
- [ ] Handoff reflete o estado real do repositório, verificado contra `git log`/`git status`
- [ ] Tabela de rastreabilidade da spec atualizada para todos os 10 IDs
- [ ] Dívidas herdadas e não tocadas repetidas no Handoff (opt-out por linguagem natural; linhas inertes em `conversa_estado`; revogação de chave de serviço por label; `tenant_config` do Vale do Uberaba; L4 Fix 2 e L5 Fix 1; migração do modelo do agente; `n8n/README.md §4` obsoleto; `openapi.yaml` sem `assignedBroker` nem os 2 códigos novos)
- [ ] `npm run build` passa

**Tests**: none
**Gate**: build
**Commit**: `docs(lote-9): registra decisoes e fecha rastreabilidade`

---

## Phase Execution Map

Uma aresta por linha, exatamente as dependências declaradas no corpo de cada task. T4, T18, T22 e T31 não dependem de nada (entram pela ordem da fase).

```
T1 -> T2
T1 -> T3
T1 -> T23
T2 -> T5
T5 -> T6
T5 -> T7
T5 -> T8
T7 -> T32
T8 -> T9
T8 -> T10
T8 -> T11
T9 -> T11
T11 -> T12
T12 -> T13
T13 -> T14
T14 -> T15
T15 -> T16
T16 -> T17
T4 -> T19
T18 -> T19
T19 -> T20
T20 -> T21
T22 -> T24
T23 -> T24
T24 -> T25
T25 -> T26
T4 -> T27
T23 -> T27
T27 -> T28
T4 -> T29
T6 -> T29
T29 -> T30
T27 -> T33
T28 -> T33
T33 -> T34
```

Execução estritamente sequencial — não há paralelismo dentro de uma fase, e a ordem das fases é mais restritiva que este grafo.

**Empacotamento previsto (~7 tasks por worker, fases inteiras):**

| Batch | Fases | Tasks | Tier sugerido |
| ----- | ----- | ----- | ------------- |
| 1 | 1 + 2 | T1–T7 (7) | alto (schema + regras puras decidem o resto do lote) |
| 2 | 3 + 4 | T8–T17 (10) | alto na T8, mecânico da T11 à T16 |
| 3 | 5 + 6 | T18–T26 (9) | alto na T18 (isolamento), médio no resto |
| 4 | 7 + 8 | T27–T33 (7) | médio |
| 5 | 9 | T34 (1) | médio |

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1, T2 | 1 arquivo de schema, 1 conceito cada | ✅ Granular |
| T3 | 1 arquivo (seed) | ✅ Granular |
| T4 | 1 arquivo, 5 funções puras coesas do mesmo domínio | ✅ Granular |
| T5, T6, T7 | 1 função da DAL cada | ✅ Granular |
| T8, T9, T10 | 1 arquivo cada | ✅ Granular |
| T11–T16 | 1 route file cada | ✅ Granular |
| T17 | 1 arquivo de teste | ✅ Granular |
| T18 | 2 arquivos — trio de funções + call sites (dependência de compilação absorvida) | ⚠️ Justificado |
| T19 | 1 função da DAL | ✅ Granular |
| T20, T21 | 1 componente / 1 composição | ✅ Granular |
| T22, T23, T24 | 1 arquivo cada | ✅ Granular |
| T25, T26 | 1 componente / 1 composição | ✅ Granular |
| T27–T31 | 1 arquivo cada | ✅ Granular |
| T32 | 2 arquivos — função + rota que devolve o resultado dela | ⚠️ Justificado |
| T33 | 2 arquivos — rota + layout do grupo, que não existem separados | ⚠️ Justificado |
| T34 | 1 arquivo | ✅ Granular |

---

## Diagram-Definition Cross-Check

Paridade exata entre o campo `Depends on` de cada task e as arestas do **Phase Execution Map**, nas duas direções.

| Task | Depends On (corpo) | Aresta no mapa | Status |
| ---- | ------------------ | -------------- | ------ |
| T1 | None | — | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T1 | T1 → T3 | ✅ |
| T4 | None | — | ✅ |
| T5 | T2 | T2 → T5 | ✅ |
| T6 | T5 | T5 → T6 | ✅ |
| T7 | T5 | T5 → T7 | ✅ |
| T8 | T5 | T5 → T8 | ✅ |
| T9 | T8 | T8 → T9 | ✅ |
| T10 | T8 | T8 → T10 | ✅ |
| T11 | T8, T9 | T8 → T11, T9 → T11 | ✅ |
| T12 | T11 | T11 → T12 | ✅ |
| T13 | T12 | T12 → T13 | ✅ |
| T14 | T13 | T13 → T14 | ✅ |
| T15 | T14 | T14 → T15 | ✅ |
| T16 | T15 | T15 → T16 | ✅ |
| T17 | T16 | T16 → T17 | ✅ |
| T18 | None | — | ✅ |
| T19 | T4, T18 | T4 → T19, T18 → T19 | ✅ |
| T20 | T19 | T19 → T20 | ✅ |
| T21 | T20 | T20 → T21 | ✅ |
| T22 | None | — | ✅ |
| T23 | T1 | T1 → T23 | ✅ |
| T24 | T22, T23 | T22 → T24, T23 → T24 | ✅ |
| T25 | T24 | T24 → T25 | ✅ |
| T26 | T25 | T25 → T26 | ✅ |
| T27 | T4, T23 | T4 → T27, T23 → T27 | ✅ |
| T28 | T27 | T27 → T28 | ✅ |
| T29 | T4, T6 | T4 → T29, T6 → T29 | ✅ |
| T30 | T29 | T29 → T30 | ✅ |
| T31 | None | — | ✅ |
| T32 | T7 | T7 → T32 | ✅ |
| T33 | T27, T28 | T27 → T33, T28 → T33 | ✅ |
| T34 | T33 | T33 → T34 | ✅ |

Nenhuma dependência aponta para fase posterior. T4, T18, T22 e T31 não têm dependência declarada — entram pela ordem sequencial da fase, que é mais restritiva que o grafo.

---

## Test Co-location Validation

| Task | Camada criada/modificada | Matriz exige | Task diz | Status |
| ---- | ------------------------ | ------------ | -------- | ------ |
| T1, T2 | Schema | none | none | ✅ |
| T3 | Seed / db | integration | integration | ✅ |
| T4 | Lib pura | unit | unit | ✅ |
| T5, T6, T7 | DAL | integration | integration | ✅ |
| T8, T9 | Camada de integração | integration | integration | ✅ |
| T10–T16 | Route handler | integration (rota) | integration (rota) | ✅ |
| T17 | Camada de integração | integration | integration | ✅ |
| T18 | DAL + server action | integration | integration | ✅ |
| T19 | DAL | integration | integration | ✅ |
| T20, T21 | Componente / página React | none | none | ✅ |
| T22 | Validação | unit | unit | ✅ |
| T23 | DAL | integration | integration | ✅ |
| T24 | Server action | integration | integration | ✅ |
| T25, T26 | Componente / página React | none | none | ✅ |
| T27–T30 | Componente / página React | none | none | ✅ |
| T31 | DAL | integration | integration | ✅ |
| T32 | Camada de integração + route handler | integration (rota) | integration (rota) | ✅ |
| T33 | Página React | none | none | ✅ |
| T34 | Documentação | none | none | ✅ |

Nenhuma violação. Todo `Tests: none` corresponde a uma camada que a matriz marca como `none` — nunca a teste deferido para outra task.
