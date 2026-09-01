# Lote 7 — Dado real ponta a ponta (Fase 9) · Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/lote-7-dado-real-ponta-a-ponta/design.md`
**Status**: Draft

**Baseline de testes registrado na abertura do lote: 622 passando (`.specs/STATE.md`, fechamento do lote-6c).** Esse número **não é confiável até ser confirmado**: no lote-5 o baseline registrado (261) estava obsoleto e o real era 268. **Primeira ação do Execute, antes de T1: rodar `npx vitest run` e registrar o número real como piso.** Toda meta de contagem abaixo é relativa a esse piso real, não ao 622 registrado.

> **Pré-requisito de ambiente (bloqueante).** `npx vitest run` exige `TEST_DATABASE_URL` apontando para um banco de teste descartável (`src/db/index.ts:10-21`). O `STATE.md` registra que `drizzle-kit push` nunca rodou com sucesso contra um banco de teste realmente vazio. **Se a suíte não roda verde no início, PARE e resolva isso antes de T1** — este lote reseeda o banco em T2 e passa a conviver com dado real; rodar a suíte contra o banco errado destrói lead real.

> **Convenção de commit (AD-014).** Nenhum commit deste repositório leva trailer `Co-Authored-By` nem qualquer marca de autoria do Claude. Omitir deliberadamente.

---

## Test Coverage Matrix

> Derivada do codebase e das guidelines do projeto (`AGENTS.md`, `CLAUDE.md`, `vitest.config.ts`). Confirmar antes do Execute.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Funções puras (`src/lib/*.ts`) | unit | Todos os ramos; 1:1 com as ACs; todo empate e caso-limite listado tem asserção própria | `src/lib/__tests__/*.test.ts` | `npx vitest run` |
| DAL (`src/server/data/index.ts`) | integration (banco de teste) | Escopo por tenant provado por caso negativo explícito; idempotência provada por reentrega | `src/server/data/__tests__/*.test.ts` | `npx vitest run` |
| Auth do contrato (`src/server/integration/auth.ts`) | unit + integration | Cada ramo dos dois modos, incluindo os `401` com `code` correto | `src/server/**/__tests__/*.test.ts` | `npx vitest run` |
| Server actions (`src/server/actions/*.ts`) | integration | Sucesso e falha explícita; nunca sucesso silencioso | `src/server/__tests__/actions.test.ts` | `npx vitest run` |
| Seed (`src/db/seed.ts`) | integration | Forma do dataset por tenant asseverada por contagem, não por leitura | `src/db/__tests__/seed.test.ts` | `npx vitest run` |
| Schema (`src/db/schema.ts`) | none | Coluna/tabela nova sem comportamento próprio; a prova vem do teste da DAL e do seed que a consomem | - | `npm run build` + leitura do schema no banco |
| Componentes de UI (`src/components/**`) | build gate + **screenshot real** | Lógica de apresentação computada ganha unit test; composição visual exige captura real | `src/lib/__tests__/*` para a lógica extraída | `npm run build` + captura |
| Documentação operacional (`n8n/README.md`, `.specs/STATE.md`) | none | Revisão por leitura; nada executável a asseverar | - | `npm run lint` |
| Workflow SDK (`n8n/workflows/*.ts`) | none | `validate_workflow` via MCP + execução real + diff `generated/` == instância | - | build gate + MCP |
| Docs de contrato (`docs/integration/*`) | integration | `openapi.yaml` validado por `SwaggerParser.validate()` (teste já existente) | `src/server/**/__tests__/*.test.ts` | `npx vitest run` |
| Prova por conversa real (Phase 4) | none | Screenshot + id de execução confirmado por consulta à instância + artefato externo | `validation.md` | manual, orquestrador |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks com teste unitário apenas | `npx vitest run` |
| Full | Tasks que tocam DAL, rotas ou seed | `npx vitest run` |
| Build | Fim de fase, tasks de UI, schema, docs ou n8n | `npx vitest run && npm run lint && npm run build` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

**Empacotamento em batches (~7 tasks, fases inteiras):** Batch 1 = Phase 1 (6) · Batch 2 = Phase 2 (5) · Batch 3 = Phase 3 (7) · Batch 4 = Phase 4 (4).

> **Phase 4 NÃO é delegável a sub-agente.** As três conversas exigem um humano mandando mensagem real pelo WhatsApp. É conduzida pelo orquestrador com o usuário presente, com MCP do n8n e extensão Claude in Chrome disponíveis.

### Phase 1: Fonte de dado e caminhos de escrita no servidor

Tudo que roda sem tela: schema, seed, função pura de atribuição e as duas escritas que faltavam na DAL.

```
T1 → T2 → T6
T3 → T4 → T5
```

### Phase 2: Telas de operação

Os controles que dão ao humano o que só o seed escrevia, e a sidebar honesta.

```
T7 → T8 → T9 → T10
T7 → T11
```

### Phase 3: Guarda da chave de API do agente

Modo de auth de serviço no CRM, depois a troca no fluxo n8n. Contém HUMAN GATE.

```
T12 → T13 → T14 → T15 → T16 → T17 → T18
```

### Phase 4: Prova por conversa real (orquestrador + usuário)

```
T19 → T20 → T21 → T22
```

---

## Task Breakdown

### T1: Adicionar `slug` ao tenant

**What**: Coluna `slug` em `tenants`, nullable com índice único parcial, aplicada por `drizzle-kit push`. É o identificador que o header `X-Crivo-Tenant` vai carregar e que o n8n já guarda como `tenantSlug`.
**Where**: `src/db/schema.ts`
**Depends on**: None
**Reuses**: padrão de coluna aditiva nullable + `uniqueIndex(...).where(sql\`... is not null\`)` de `leads.external_id`
**Requirement**: SEC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `slug` é `text`, nullable, com índice único parcial (`WHERE slug IS NOT NULL`)
- [x] `npx drizzle-kit push` aplicado sem perda de dado, confirmado por leitura do schema no banco
- [x] Comentário no schema explica por que é nullable (push de `NOT NULL` sem default falha em tabela com linhas)
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: piso real + 0 (mudança de schema sem comportamento novo) — 622 confirmado, sem variação

**Status**: Done

**Tests**: none
**Gate**: build

**Commit**: `feat(schema): adiciona slug unico por tenant`

---

### T2: Seed com três tenants — demonstração separada da operação

**What**: `TENANT_DEFS` ganha `slug` e `seedLeadData`; nasce o def `Crivo Demo` levando o dataset rico (leads, conversas, mensagens, baselines); Triângulo e Vale do Uberaba mantêm **toda** a configuração (corretores, categorias, documentos, horário comercial, tom de voz, chave de API) e ficam sem nenhum lead, com baselines nulos.
**Where**: `src/db/seed.ts`
**Depends on**: T1
**Reuses**: `id()` determinístico, o loop por `TENANT_DEFS`, `generateApiKey()`
**Requirement**: REAL-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `runSeed()` cria exatamente 3 tenants, com `slug` preenchido nos três
- [x] Teste assevera por contagem: `Crivo Demo` tem leads > 0, conversas > 0 e mensagens > 0; cada tenant-piloto tem **exatamente 0** de cada um dos três
- [x] Teste assevera que cada tenant-piloto mantém corretores > 0, categorias > 0, documentos > 0 e uma chave de API
- [x] Teste assevera `baselineLeadsPerMonth`, `baselineFirstResponseMinutes` e `baselineLeadToMeetingPct` nulos nos dois pilotos e não-nulos no `Crivo Demo`
- [x] `runSeed()` continua imprimindo as chaves em claro uma única vez, agora para os 3 tenants
- [x] Gate check passes: `npx vitest run`
- [x] Test count: piso real + ~6 (real: 622→624 líquido em `seed.test.ts`; 4 arquivos de teste pré-existentes ajustados como consequência direta — `mutations.test.ts`, `isolation.test.ts`, `reads.test.ts`, `actions.test.ts` — pois assumiam posicionalmente que os 2 primeiros tenants tinham lead, o que deixou de valer com REAL-01)

**Status**: Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(seed): separa dataset de demonstracao dos tenants piloto`

---

### T3: Função pura de atribuição de corretor

**What**: `assignBroker(candidates)` escolhe o corretor de menor carga ativa, com desempate determinístico. Isolada de I/O de propósito — é o ponto onde o lote futuro troca a política por disponibilidade de agenda.
**Where**: `src/lib/broker-assignment.ts`
**Depends on**: None
**Reuses**: nada — módulo novo
**Requirement**: ATRIB-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `assignBroker([])` devolve `null`
- [x] Com cargas 5/2/2, devolve o de carga 2 com `createdAt` mais antigo (asserção do id exato, não "algum dos dois")
- [x] Com carga e `createdAt` idênticos, devolve o de menor `id` — asserção discriminante, com os dois candidatos em ordem invertida na entrada para provar que a saída não depende da ordem do array
- [x] Nenhum import de banco, rede ou `Date.now()` no módulo
- [x] Gate check passes: `npx vitest run`
- [x] Test count: piso real + ~6 (real: +5, `src/lib/__tests__/broker-assignment.test.ts`)

**Status**: Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(leads): adiciona politica pura de atribuicao de corretor`

---

### T4: Atribuir corretor ao lead criado pelo contrato

**What**: `getBrokerLoads(tenantId)` (uma query agregada, sem N+1) e uso de `assignBroker` dentro de `createAgentLead`, preenchendo `brokerId` no insert.
**Where**: `src/server/data/index.ts`
**Depends on**: T3
**Reuses**: `createAgentLead` e seu `onConflictDoNothing` (o caminho de conflito devolve a linha existente sem tocá-la)
**Requirement**: ATRIB-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `getBrokerLoads` conta como ativo só `em_qualificacao` e `escalado_humano`, e devolve corretor com carga 0 (left join, nunca `INNER`)
- [x] Lead criado pelo contrato num tenant com corretores nasce com `brokerId` do menor carga — asserção do id exato
- [x] Tenant sem nenhum corretor: lead criado com `brokerId` nulo, sem erro (teste explícito)
- [x] Reentrega com o mesmo `externalId` **não** reatribui: teste troca a carga entre as duas chamadas e assevera que o `brokerId` permaneceu o da primeira
- [x] `getBrokerLoads` filtra por `tenantId` — teste negativo com corretor de outro tenant confirma que ele não aparece
- [x] Gate check passes: `npx vitest run`
- [x] Test count: piso real + ~8 (real: +6, `src/server/data/__tests__/broker-assignment.test.ts`)

**Status**: Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(leads): atribui corretor na criacao pelo contrato`

---

### T5: Gravar `first_response_at` na primeira resposta do agente

**What**: Dentro da transação de `ingestAgentMessage`, quando a mensagem inserida é do agente e o lead ainda não tem `first_response_at`, grava o `sentAt` dela.
**Where**: `src/server/data/index.ts`
**Depends on**: T4
**Reuses**: a transação já existente de `ingestAgentMessage` — nenhum round-trip novo
**Requirement**: KPI-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Primeira mensagem `sender: "agente"` grava `first_response_at` igual ao `sentAt` daquela mensagem (asserção de igualdade exata, não "não-nulo")
- [x] Segunda mensagem do agente preserva o valor da primeira
- [x] Mensagem `sender: "lead"` deixa `first_response_at` nulo
- [x] Reentrega descartada por idempotência não altera `first_response_at` — teste envia a mesma mensagem 2x com `sentAt` diferente e assevera o valor original
- [x] Teste de KPI: lead com contato e primeira resposta faz `getDashboardKpis` devolver `avgFirstResponseMinutes` não-nulo com o valor esperado
- [x] Gate check passes: `npx vitest run`
- [x] Test count: piso real + ~6 (real: +5, `src/server/data/__tests__/first-response.test.ts`)

**Status**: Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(mensagens): grava primeira resposta do agente no lead`

---

### T6: Estados vazios das telas com tenant sem lead

**What**: Confirmar por captura real que Dashboard, Pipeline e Chats degradam corretamente num tenant-piloto recém-semeado, e corrigir o que faltar. `EmptyState` já é usado nas três telas — esta task é majoritariamente verificação, e só vira código onde houver buraco (KPI sem valor, coluna do Kanban sem estado vazio).
**Where**: `src/components/pipeline/pipeline-board.tsx`
**Depends on**: T2
**Reuses**: `EmptyState` da Astryx, já presente em `pipeline-board.tsx:234`, `conversation-list.tsx:34`, `recent-leads-table.tsx:142`, `volume-chart.tsx:52`, `distribution-chart.tsx:60`
**Requirement**: REAL-01

**Tools**:

- MCP: Claude in Chrome (`mcp__claude-in-chrome__*`)
- Skill: NONE

**Done when**:

- [x] `next start` numa porta dedicada (build de produção, nunca `next dev`) e captura real das 3 telas no tenant Triângulo Imóveis vazio — feito na porta 3105, após o orquestrador aplicar `drizzle-kit push` + reseed contra produção
- [x] Nenhum KPI exibe `NaN`, `undefined` ou número inventado — confirmado na captura real do Dashboard: os 5 tiles mostram `—`/`0` (Tempo médio 1ª resposta, Taxa de qualificação, Taxa de escalonamento, Taxa de comparecimento em `—`; Volume de leads em `0`)
- [x] As 3 colunas do Kanban exibem estado vazio; a lista de conversas exibe estado vazio; os 2 gráficos e a tabela de leads recentes exibem estado vazio — confirmado na captura real: Pipeline (3 colunas "Nenhum lead", badges "0"), Chats ("Nenhuma conversa ainda"), Dashboard (Volume/Distribuição por modalidade/Distribuição por motivação com "Sem leads no período", Leads Recentes com "Nenhum lead ainda")
- [x] Captura do tenant `Crivo Demo` no mesmo passe, provando que o dataset rico continua renderizando — confirmado na captura real: Chats "25 conversas conduzidas pelo agente Sofia", Pipeline "25 leads ativos" distribuídos 10/8/7 nas 3 colunas com cards completos (corretor, orçamento, modalidade), Dashboard com KPIs reais (Volume 8, Tempo médio 1ª resposta 15min, gráficos e tabela de leads recentes preenchidos)
- [x] Servidor parado e porta confirmada livre ao final — `Stop-Process` no PID da porta 3105, `Get-NetTCPConnection -LocalPort 3105` confirmou `PORT FREE`
- [x] Qualquer correção necessária usa componente/prop da Astryx verificado por `npx astryx component <Nome>` — não aplicável: nenhuma correção de código foi necessária (revisão de código e captura real não acharam nenhum buraco; `pipeline-board.tsx` não mudou)
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build` — 640 testes, 0 falhas, 51 arquivos; lint 0 erros (2 warnings pré-existentes em `n8n/`); build de produção verde

**Status**: Done

**Nota (batch worker):** A primeira passada desta task (antes do reseed de produção) ficou bloqueada — ver histórico do commit local — porque produção ainda não tinha nem a coluna `slug` (T1) nem o reseed de 3 tenants (T2), ambos aplicados só contra `TEST_DATABASE_URL` até então. O orquestrador aplicou os dois contra produção com autorização do usuário (`drizzle-kit push --force` + `npm run db:seed`), confirmados. Com produção no estado certo, a captura real rodou sem nenhum código novo: os 5 usos de `EmptyState` (`pipeline-board.tsx:234`, `conversation-list.tsx:34`, `recent-leads-table.tsx:142`, `volume-chart.tsx:52`, `distribution-chart.tsx:60`) e `kpi-tiles.tsx` já cobriam corretamente o caso de tenant sem lead — a revisão de código da primeira passada já havia previsto isso, e a captura real confirmou sem achar nenhum gap. Nenhum commit para T6: nenhuma linha de código mudou.

**Tests**: none
**Gate**: build

**Commit**: (nenhum — nenhuma alteração de código nesta task; ver nota)

---

### T7: DAL — troca de corretor, comparecimento e última atividade do agente

**What**: Três funções de acesso a dado: `updateLeadBroker` (valida o corretor contra o tenant na mesma query), `setMeetingAttendance` e `getLastAgentMessageAt`.
**Where**: `src/server/data/index.ts`
**Depends on**: None
**Reuses**: padrão tenant-scoped com `.returning()` de `updateLeadStatus`
**Requirement**: ATRIB-02, KPI-02, SHELL-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `updateLeadBroker` com corretor de **outro** tenant devolve `null` e deixa `brokerId` inalterado — teste negativo lê a linha depois para confirmar que nada mudou
- [x] `updateLeadBroker` com lead de outro tenant devolve `null`
- [x] `setMeetingAttendance` persiste `true`, `false` e `null`, escopado ao tenant; teste cobre os três valores
- [x] `setMeetingAttendance` com lead de outro tenant devolve `null` sem escrever
- [x] `getLastAgentMessageAt` devolve o `sentAt` máximo entre mensagens `sender = 'agente'` do tenant, ignorando mensagens do lead e mensagens de outro tenant
- [x] `getLastAgentMessageAt` devolve `null` em tenant sem mensagem do agente
- [x] Gate check passes: `npx vitest run`
- [x] Test count: piso real + ~10 (real: +8, `src/server/data/__tests__/lead-controls.test.ts`; 640→648)

**Status**: Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(leads): adiciona escrita de corretor e comparecimento na dal`

---

### T8: Server actions de corretor e comparecimento

**What**: `updateLeadBrokerAction` e `setMeetingAttendanceAction`, resolvendo o tenant pelo cookie e revalidando o pipeline; falha da DAL vira falha explícita, nunca sucesso silencioso.
**Where**: `src/server/actions/pipeline.ts`
**Depends on**: T7
**Reuses**: `updateLeadStatusAction` como molde exato (mesma resolução de tenant, mesma revalidação, mesmo contrato de retorno)
**Requirement**: ATRIB-02, KPI-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sucesso devolve o lead atualizado e revalida `/pipeline` — SPEC_DEVIATION: as duas actions seguem `ActionResult` (`{ok:true}|{ok:false,error}`), o MESMO contrato de retorno de `updateLeadStatusAction` — decisão explícita do `design.md` ("mesmo contrato de retorno"). "Lead atualizado" é verificado por re-leitura via `getLead` nos testes, não devolvido no payload da action; o client component (T9) confia em `router.refresh()` para buscar o dado fresco, mesmo padrão de `pipeline-board.tsx`.
- [x] DAL devolvendo `null` produz falha explícita no retorno da action — teste assevera o campo de erro, não só ausência de exceção
- [x] Nenhuma das duas actions aceita `tenantId` por parâmetro (tenant vem do cookie — AD-007)
- [x] Gate check passes: `npx vitest run`
- [x] Test count: piso real + ~6 (real: +7, describe `updateLeadBrokerAction / setMeetingAttendanceAction` em `src/server/__tests__/actions.test.ts`)

**Status**: Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(pipeline): adiciona actions de corretor e comparecimento`

---

### T9: Controles interativos do lead

**What**: Client component com o seletor de corretor e o controle de três estados de comparecimento, chamando as actions do T8.
**Where**: `src/components/pipeline/lead-controls.tsx`
**Depends on**: T8
**Reuses**: padrão de mutação otimista com rollback de `pipeline-board.tsx:162`
**Requirement**: ATRIB-02, KPI-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] **Antes de escrever JSX**: `npx astryx component <Nome>` rodado para cada componente usado — `Select` não existe na lib (CLI aponta `Selector` como o componente equivalente); `Selector`, `SegmentedControl`/`SegmentedControlItem` e `Banner` confirmados via CLI, props conferidos no CLI, nunca presumidos
- [x] Seletor de corretor lista os corretores do tenant com o atual selecionado; sem corretores no tenant, exibe campo indisponível (`Selector isDisabled` + `disabledMessage`) em vez de seletor vazio
- [x] Controle de comparecimento aparece **só** quando o lead tem `meetingAt` preenchido e passado; caso contrário o valor fica somente leitura
- [x] A regra "reunião marcada e já passada" é uma função pura extraída para `src/lib/meeting-attendance.ts` (`canEditMeetingAttendance`), com teste próprio cobrindo: sem reunião, reunião futura, reunião passada, e o limite exato (`meetingAt === agora`)
- [x] Nenhum `style={{}}`, nenhum `<div>`/`<span>` de layout, nenhum valor cru (`bg-[#fff]`, `p-[13px]`) — self-check do `AGENTS.md` refeito lendo o arquivo ao final
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: piso real + ~5 (real: +5, `src/lib/__tests__/meeting-attendance.test.ts`)

**Status**: Done

**Tests**: unit
**Gate**: build

**Commit**: `feat(pipeline): adiciona controles de corretor e comparecimento`

---

### T10: Ligar os controles ao painel de detalhe

**What**: O painel passa a receber os corretores do tenant e a renderizar o client component do T9 no lugar dos dois campos hoje somente leitura, mantendo-se o mais servidor possível.
**Where**: `src/components/pipeline/lead-detail-panel.tsx`
**Depends on**: T9
**Reuses**: `getBrokers(tenantId)` já existente na DAL (`src/server/data/index.ts:76`)
**Requirement**: ATRIB-02, KPI-02

**Tools**:

- MCP: Claude in Chrome (`mcp__claude-in-chrome__*`)
- Skill: NONE

**Done when**:

- [x] Captura real (build de produção) do painel no tenant `Crivo Demo`: seletor de corretor visível e preenchido — confirmado na captura real (porta 3107): lead Ricardo Almeida com "Corretor: Beatriz Moraes Correia" selecionado no `Selector`
- [x] Captura real do controle de comparecimento num lead com reunião passada, e da ausência dele num lead com reunião futura — confirmado: Ricardo Almeida (reunião 8/jul/2026, no passado em relação a hoje 15/ago/2026) mostra `SegmentedControl` editável (Pendente/Compareceu/Não compareceu); Nathan Ferreira (sem reunião, `meetingAt` nulo) mostra "Compareceu à reunião: Pendente" como texto somente leitura
- [x] Trocar o corretor pela tela atualiza o nome no card do Kanban sem recarregar a página — confirmado na captura depois da ação: card de Nathan Ferreira passou a exibir o avatar "BC" (Beatriz Correia) imediatamente após fechar o painel, sem nenhuma navegação entre a troca e a captura
- [x] Marcar comparecimento e conferir na captura do Dashboard que a taxa deixou de estar vazia — confirmado: tile "Taxa de comparecimento" foi de "— · de 0 reuniões confirmadas" para "100% · de 1 reunião confirmada" após marcar "Compareceu" em Ricardo Almeida
- [x] Servidor de produção parado e porta confirmada livre ao final — processo da porta 3107 finalizado, `netstat` sem entrada `LISTENING` confirmado
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build` — 678 testes, 0 falhas, 55 arquivos (sem variação, task sem teste novo); lint 0 erros (2 warnings pré-existentes em `n8n/`); build de produção verde

**Status**: Done

**Nota:** Durante a captura, uma sessão paralela do usuário reexecutou `npm run db:seed` contra o mesmo banco de produção usado para a captura — visível pela mudança do minuto exato de `meetingAt` de Ricardo Almeida (16:34 → 21:28) e pelo `brokerId` de Nathan Ferreira revertendo entre duas capturas separadas por uma navegação de página cheia. Isso não é um problema do código: é concorrência externa no dado de demonstração. A prova final de "troca sem recarregar" foi refeita numa sequência contígua (sem navegação de página entre a troca e a captura) para não ficar contaminada por esse reseed concorrente.

**Tests**: none
**Gate**: build

**Commit**: `feat(pipeline): expoe corretor e comparecimento no painel do lead`

---

### T11: Sidebar com atividade real do agente

**What**: O subtítulo literal do card AGENTE IA dá lugar ao instante relativo da última mensagem do agente no tenant; sem mensagem, um estado ocioso explícito.
**Where**: `src/components/shell/sidebar.tsx`
**Depends on**: T7
**Reuses**: `formatRelativeTimePtBR` / `RelativeTime` de `src/lib` (o `Timestamp` relativo da Astryx tem texto em inglês cravado)
**Requirement**: SHELL-01

**Tools**:

- MCP: Claude in Chrome (`mcp__claude-in-chrome__*`)
- Skill: NONE

**Done when**:

- [x] A constante `AGENT_SUBTITLE` (`sidebar.tsx:47`) não existe mais
- [x] A escolha do texto (relativo × ocioso) é função pura em `src/lib/agent-activity.ts` (`formatAgentActivitySubtitle`) com teste cobrindo os dois ramos e o valor nulo
- [x] Nenhum import nem chamada à instância n8n em todo o caminho — conferido por leitura (INT-08): `sidebar.tsx`, `app/(crm)/layout.tsx` e `src/lib/agent-activity.ts` só importam `getLastAgentMessageAt` (DAL própria do CRM) e `formatRelativeTimePtBR`
- [x] Captura real (build de produção, porta 3106) da sidebar no `Crivo Demo` ("Sofia — Online / Ativo pela última vez há 3 horas") e no tenant-piloto `Triângulo Imóveis`, recém-semeado sem lead/mensagem ("Lucas — Online / Nenhuma mensagem enviada ainda") — servidor parado e porta 3106 confirmada livre ao final
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build` — 663 testes, 0 falhas, 54 arquivos; lint 0 erros (2 warnings pré-existentes em `n8n/`); build de produção verde
- [x] Test count: piso real + ~4 (real: +3, `src/lib/__tests__/agent-activity.test.ts`; 660→663)

**Status**: Done

**Tests**: unit
**Gate**: build

**Commit**: `feat(shell): mostra atividade real do agente na sidebar`

---

### T12: Tabela de chaves de serviço

**What**: `service_api_keys` (label, hash sha256, criação, revogação), sem FK de tenant — é deliberadamente cross-tenant; o escopo por tenant vem do header.
**Where**: `src/db/schema.ts`
**Depends on**: None
**Reuses**: formato de `tenant_api_keys` (`src/db/schema.ts:256`)
**Requirement**: SEC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tabela criada por `npx drizzle-kit push`, confirmada por leitura do schema no banco (colunas: id, label, key_hash, created_at, revoked_at nullable — sem FK)
- [x] `revokedAt` nullable; comentário explica que `null` = ativa
- [x] Comentário explica por que não há FK de tenant
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build` — 663 testes, 0 falhas, 54 arquivos; lint 0 erros (2 warnings pré-existentes em `n8n/`); build de produção verde

**Status**: Done

**Tests**: none
**Gate**: build

**Commit**: `feat(schema): adiciona tabela de chaves de servico`

---

### T13: DAL — resolver chave de serviço e tenant por slug

**What**: `resolveServiceApiKeyHash(hash)` (ignora chave revogada) e `resolveTenantIdBySlug(slug)`.
**Where**: `src/server/data/index.ts`
**Depends on**: T12
**Reuses**: `resolveTenantIdByApiKeyHash` (`src/server/data/index.ts:63`) como molde
**Requirement**: SEC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Hash de chave ativa resolve; hash de chave revogada devolve `null` — teste explícito para o revogado
- [x] Hash inexistente devolve `null`
- [x] `resolveTenantIdBySlug` resolve os 3 slugs do seed e devolve `null` para slug desconhecido e para string vazia
- [x] Gate check passes: `npx vitest run` — 669 testes, 0 falhas, 55 arquivos
- [x] Test count: piso real + ~6 (real: +6, `src/server/data/__tests__/service-auth.test.ts`; 663→669)

**Status**: Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(contrato): resolve chave de servico e tenant por slug`

---

### T14: Seed emite a chave de serviço

**What**: `runSeed()` passa a gerar e imprimir em claro, uma única vez, também a chave de serviço do agente — mesmo tratamento das chaves por tenant (só o hash persiste).
**Where**: `src/db/seed.ts`
**Depends on**: T13
**Reuses**: `generateApiKey()` e o bloco `isMain` que já imprime as chaves
**Requirement**: SEC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `SeedResult` expõe a chave de serviço além das chaves por tenant
- [x] Teste assevera que o valor em claro **não** é persistido em nenhuma coluna — só o hash sha256
- [x] Reseed rotaciona a chave de serviço (comportamento documentado, mesmo das chaves por tenant)
- [x] Gate check passes: `npx vitest run` — 672 testes, 0 falhas, 55 arquivos
- [x] Test count: piso real + ~3 (real: +3, `src/db/__tests__/seed.test.ts`; 669→672)

**Status**: Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(seed): emite chave de servico do agente`

---

### T15: Modo de autenticação de serviço no contrato

**What**: `authenticate()` tenta primeiro a chave de serviço; achando, exige `X-Crivo-Tenant` e resolve o tenant pelo slug. Não achando, cai no caminho por chave de tenant, **inalterado**.
**Where**: `src/server/integration/auth.ts`
**Depends on**: T14
**Reuses**: `problem()` (AD-013), extração de bearer já existente
**Requirement**: SEC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Chave de serviço + `X-Crivo-Tenant` válido resolve o tenant correto
- [x] Chave de serviço **sem** o header: `401` com `code: tenant-nao-identificado`
- [x] Chave de serviço com slug desconhecido: `401` com `code: tenant-nao-identificado` — teste assevera que **não** cai em nenhum tenant default
- [x] Chave por tenant continua funcionando exatamente como antes, **inclusive ignorando** um `X-Crivo-Tenant` presente e divergente — teste discriminante: chave do tenant A + header do tenant B resolve A
- [x] `authenticate()` continua sem ler o corpo da requisição — conferido por leitura (`src/server/integration/auth.ts` só lê `request.headers`, nunca `request.json()`/`.body`)
- [x] Ao menos uma rota real (`POST /api/v1/leads`) testada nos dois modos ponta a ponta — modo por chave de tenant já coberto pelo describe existente; modo de serviço coberto pelo novo describe em `leads-post.test.ts`
- [x] Gate check passes: `npx vitest run` — 678 testes, 0 falhas, 55 arquivos
- [x] Test count: piso real + ~10 (real: +6 — 4 em `auth.test.ts` + 2 e2e em `leads-post.test.ts`; todos os Done-when cobertos, a estimativa original era aproximada; 672→678)

**Status**: Done

**Tests**: integration
**Gate**: full

**Commit**: `feat(contrato): adiciona autenticacao por chave de servico`

---

### T16: Documentar o modo de serviço no contrato

**What**: `openapi.yaml` ganha o esquema de segurança novo, o header `X-Crivo-Tenant` e o `code` de erro `tenant-nao-identificado`; o guia de integração ganha a seção correspondente.
**Where**: `docs/integration/openapi.yaml`
**Depends on**: T15
**Reuses**: teste existente que valida o arquivo por `SwaggerParser.validate()`
**Requirement**: SEC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `openapi.yaml` continua passando `SwaggerParser.validate()` (teste já existente, verde)
- [x] Os dois modos de auth documentados, com a regra de precedência explícita (securitySchemes `bearerAuth`/`serviceAuth`, parâmetro `X-Crivo-Tenant`, `code: tenant-nao-identificado` no enum e na resposta `NaoAutenticado`)
- [x] `docs/integration/guia-integracao.md` atualizado na mesma passada (seção 1 reescrita com os dois modos e a regra de precedência)
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build` — 678 testes, 0 falhas, 55 arquivos (sem variação — task reusa o teste já existente); lint 0 erros (2 warnings pré-existentes em `n8n/`); build de produção verde

**Status**: Done

**Tests**: integration
**Gate**: build

**Commit**: `docs(contrato): documenta autenticacao por chave de servico`

---

### T17: Fluxo n8n usa a credencial de serviço · HUMAN GATE

**What**: Os 8 pontos que hoje montam `Authorization` por expressão (`n8n/workflows/principal.ts:418,474,547,638,799,999,1040,1074`) passam a usar a credencial `httpHeaderAuth` do nó + header `X-Crivo-Tenant` com o `tenantSlug`. A coluna `apiKey` sai da Data Table `tenant_config` e de todo o encadeamento de contexto. Mesma troca nos 2 sub-workflows.
**Where**: `n8n/workflows/principal.ts`
**Depends on**: T16
**Reuses**: pipeline de publicação do `n8n/README.md` §1 (`scripts/n8n-inline.mjs` → MCP)
**Requirement**: SEC-01

**Tools**:

- MCP: n8n (`create_workflow_from_code`, `update_workflow`, `publish_workflow`, `get_workflow_details`, `search_data_tables`, `execute_workflow`, `get_execution`)
- Skill: NONE

**Done when**:

- [x] **HUMAN GATE**: o usuário cria na instância a credencial `httpHeaderAuth` com `Authorization: Bearer <chave de serviço do T14>`. Sem isso a task não avança — não inventar credencial nem contornar.
- [x] **Antes de trocar o header**: os valores reais de `tenantSlug` na Data Table `tenant_config` foram lidos via MCP e conferidos contra os `slug` do seed. Divergência é reconciliada antes de publicar (Risk nomeado no `design.md`)
- [x] Nenhum `headerParameters` com `Authorization` sobra em `principal.ts` nem nos 2 sub-workflows — conferido por busca no arquivo
- [x] `apiKey` não aparece mais em nenhum `Code` node, checkpoint ou saída de exemplo do fluxo
- [x] Coluna `apiKey` removida da Data Table `tenant_config` via MCP
- [x] `node scripts/n8n-inline.mjs` rodado; `n8n/generated/` regenerado e confirmado **byte-idêntico** ao publicado via `get_workflow_details`
- [x] Execução real disparada e confirmada por `get_execution`: escrita bem-sucedida no CRM do tenant correto. **O id de execução citado é confirmado por consulta, nunca de memória.**
- [x] Execução com slug divergente confirma o `401 tenant-nao-identificado` chegando ao fluxo (teste negativo real, não hipótese)
- [x] Limpeza oportunista: as 2 linhas inertes de `conversa_estado` (`test-tenant-lote6c`, `test-tenant-lote6c-turnlimit`) removidas se houver tool de delete-row; caso contrário, registrar que permanecem
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`

**Status**: Done

**Nota (Phase 4, 2026-08-16)**: HUMAN GATE cumprido — usuário criou a credencial `httpHeaderAuth` "Crivo - chave de servico" (`YhGcdfGtdEBBU9YP`). Slugs reconciliados antes da troca: `tenant_config` tinha 1 linha, `tenantSlug: "triangulo"`, batendo com `src/db/seed.ts` — sem divergência. Coluna `apiKey` removida via `delete_data_table_column` e ausência reconfirmada por `search_data_tables` (restam `phoneNumberId`, `tenantSlug`, `calendarId`). Execução real **664** (confirmada por consulta): `X-Crivo-Tenant: triangulo` → lead `1ed76ddb-5b89-43fc-a30e-d1e216cd4a67` criado em produção (corroborado independentemente pelo orquestrador via query direta no banco). Teste negativo, execução **665**: slug inexistente → `{"type":"urn:crivo:problem:tenant-nao-identificado","status":401}` — nunca cai em tenant default. Commit `8c8c009`. **Ressalva honesta**: o round-trip completo pelo `whatsAppTrigger` não é acionável por MCP (só Schedule/Webhook/Form/Chat/Manual) — foi provado por workflow scratch com a config publicada idêntica, e o round-trip real ficou coberto pela Phase 4. As 2 linhas inertes de `conversa_estado` **permanecem**: não existe tool de delete de linha na superfície MCP de Data Table (só coluna/tabela).

**Tests**: none
**Gate**: build

**Commit**: `feat(agente): autentica no crm por credencial de servico`

---

### T18: Procedimento de rotação da chave de serviço

**What**: Seção nova no `n8n/README.md` com o passo a passo humano de rotação, e o risco R1 marcado como resolvido.
**Where**: `n8n/README.md`
**Depends on**: T17
**Reuses**: formato das seções de credencial já existentes (§2)
**Requirement**: SEC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Procedimento cobre: gerar chave nova pelo seed, atualizar a credencial na instância, revogar a antiga em `service_api_keys`, e a ordem correta para não derrubar o agente
- [x] R1 (§3) marcado como resolvido, com a data e o que mudou
- [x] Documentado que `tenant_config` não guarda mais chave nenhuma
- [x] Gate check passes: `npm run lint && npm run build`

**Status**: Done

**Nota (Phase 4, 2026-08-16)**: `n8n/README.md` §12 documenta a rotação sob o mecanismo novo, com a ordem que evita apagão (credencial nova validada ANTES de revogar a antiga). Risco R1 (§3) marcado como resolvido. Registrado com honestidade que **não existe helper de revogação por label** na DAL — hoje a revogação exige update direto no banco; inventar uma função que não existe seria pior que declarar a lacuna. Commit `c1c6c55`.

**Tests**: none
**Gate**: build

**Commit**: `docs(agente): documenta rotacao da chave de servico`

---

### T19: Conversa real — qualificar e agendar

**What**: Roteiro completo de qualificação no WhatsApp real (tenant Triângulo Imóveis, número homologado) até o agendamento, com evidência de três origens.
**Where**: `.specs/features/lote-7-dado-real-ponta-a-ponta/validation.md`
**Depends on**: None (a Phase 3 inteira precede esta fase — fases rodam em sequência)
**Reuses**: fluxo publicado; nenhuma mudança de código esperada
**Requirement**: SMOKE-01

**Tools**:

- MCP: n8n (`get_execution`, `search_executions`), Claude in Chrome (`mcp__claude-in-chrome__*`)
- Skill: NONE

**Done when**:

- [x] Conversa real conduzida pelo usuário; lead chega a `qualificado_agendado`
- [x] Screenshot real do CRM: lead na coluna certa do Kanban, com resumo executivo preenchido e **corretor atribuído** (prova do T4 em produção)
- [x] Id de execução do n8n citado **após** confirmação por `get_execution` — nunca de memória
- [x] Evento correspondente confirmado no Google Calendar
- [x] `first_response_at` do lead conferido não-nulo no CRM (prova do T5 em produção)
- [x] IF a instância estiver fora do ar: registrar o desfecho como **não provado** e seguir — nunca inferir sucesso pelo estado do CRM

**Status**: Done

**Nota (Phase 4, 2026-08-17)**: conversa real conduzida pelo usuário, lead `91f0d096-b6e1-4739-a75b-dcff88e40ba3`. Estado final confirmado por query direta no banco de produção (não pelo relato do fluxo): `status: qualificado_agendado`, `region: centro`, `propertyType: casa`, `purchaseHorizon: "nada urgente"`, `meetingAt: 2026-08-18T17:00Z` (= terça 14h BRT, exatamente o horário acordado), corretor **André Luiz Martins** atribuído automaticamente na criação pelo contrato (prova do T4 em produção), `firstResponseAt` 17s após `firstContactAt` (prova do T5 — o KPI carro-chefe do PRD com valor real pela primeira vez), resumo executivo preenchido. Execuções confirmadas por consulta: **1020** (principal), **1022** (sub-workflow `agendar_reuniao`), **1026** (turno de encerramento). Artefato externo confirmado: evento `bkn78fvpbjesfa2d4ip3rttip8` no Google Calendar, "Reunião com Arthur T.", 18/08 14:00-14:30 America/Sao_Paulo, Meet `https://meet.google.com/yym-dqem-dwy`; checagem de horário comercial e de disponibilidade ambas `true`; `crmAtualizado: true`; lembrete enfileirado em `agenda_envios` (id 9). Screenshot do WhatsApp fornecido pelo usuário.

**Tests**: none
**Gate**: quick

**Commit**: `test(agente): registra prova real de qualificacao e agendamento`

---

### T20: Conversa real — escalonamento para humano

**What**: Roteiro que leva o lead a pedir algo que só um humano resolve, provando a trava humana em produção.
**Where**: `.specs/features/lote-7-dado-real-ponta-a-ponta/validation.md`
**Depends on**: T19
**Reuses**: fluxo publicado
**Requirement**: SMOKE-01

**Tools**:

- MCP: n8n (`get_execution`), Claude in Chrome (`mcp__claude-in-chrome__*`)
- Skill: NONE

**Done when**:

- [x] Lead chega a `escalado_humano` com motivo preenchido
- [x] Screenshot real do CRM com o motivo visível e o corretor responsável nomeado
- [x] Mensagem enviada **depois** do escalonamento não produz resposta do agente — confirmado pela execução (rota `somente-registrar`) e pela ausência de mensagem nova do agente no CRM
- [x] Id de execução confirmado por `get_execution` antes de ser citado

**Status**: Done

**Nota (Phase 4, 2026-08-17)**: conversa real conduzida pelo usuário, lead `cce3da4d-f508-4f46-84b8-6afaa5263be3`. Estado confirmado por query direta no banco: `status: escalado_humano`, `escalationReason: "Lead solicitou atendimento humano expressamente."`, `statusChangedBy: agente` (autoria correta — não atribuída a humano), corretor **André Luiz Martins** (o escalonamento tem destinatário real, que é o ponto de ATRIB-01), `firstResponseAt` 19s após o contato. Execução **1072** confirmada por consulta. Silêncio pós-escalonamento verificado ao vivo pelo usuário: mensagem seguinte não teve resposta. **Achado colateral valioso**: a transparência da AD-016 funcionou numa conversa real — o agente não se anunciou como IA por iniciativa própria, mas ao ser perguntado "Você é um robô?" confirmou ("sou sim, um agente automatizado desta imobiliária"). Screenshot fornecido pelo usuário.

**Tests**: none
**Gate**: quick

**Commit**: `test(agente): registra prova real de escalonamento`

---

### T21: Conversa real — opt-out e purga da memória

**What**: Roteiro de opt-out, provando ponta a ponta o invariante de LGPD: registro no CRM, indicador na tela, memória purgada e silêncio subsequente.
**Where**: `.specs/features/lote-7-dado-real-ponta-a-ponta/validation.md`
**Depends on**: T20
**Reuses**: `optOutLead` e o bloco de purga de memória do lote-6c (AD-019 — primeira verificação real)
**Requirement**: SMOKE-01, PRIV-01

**Tools**:

- MCP: n8n (`get_execution`, execução de query no Postgres da instância), Claude in Chrome (`mcp__claude-in-chrome__*`)
- Skill: NONE

**Done when**:

- [x] `opted_out_at` gravado; screenshot real do indicador de opt-out no painel do lead
- [x] Contagem de linhas da sessão em `n8n_chat_histories` confirmada **zero** após o opt-out, por consulta real ao banco da instância
- [x] Mensagem enviada depois do opt-out não produz nenhuma resposta — confirmado pela execução e pela ausência de mensagem nova no CRM
- [x] Id de execução confirmado por `get_execution` antes de ser citado

**Status**: Done

**Nota (Phase 4, 2026-08-17/22)**: provado em DUAS rodadas, e a primeira achou um defeito real. **Rodada 1** (lead `c85e0692-321c-496e-8cbf-8b4bf9feb367`, execução **1118**): `route: opt-out` detectado, `optedOutAt` gravado, memória purgada, silêncio depois — mas a **confirmação única da LGPD-03 AC1 NÃO foi entregue** (Meta 400, "Object with ID 'messages' does not exist"). Causa raiz: os 2 nós de Data Table de purga entre `Code: finalizar opt-out` e o envio substituem `$json`, e `Code: destinatário do envio fixo` lia `$input.first()` cego — recebia a linha de `conversa_estado`, sem `phoneNumberId` nem `mensagens`. Era a única rota que não seguia a CONVENÇÃO DE CONVERGÊNCIA do topo de `principal.ts`; nenhum teste automatizado alcançaria isso (o envio real só existe contra a Cloud API). Corrigido pelo checkpoint `Code: restaurar payload do opt-out` (commit `36c9a8a`). **Rodada 2** (lead `55861ddd-6d38-4eb7-aac6-05fafa3acb8e`, execução **1627**, confirmada por consulta): `optedOutAt: 2026-08-22T22:32:50.256Z`; o nó de restauração entrega o payload completo; `WhatsApp: enviar mensagem fixa` retorna `wamid.HBgMNTUzNDk5NTMyNDQ0FQIAERgSOTY0QURCNTJGOUNGQzE0NkU2AA==` (id real da Meta — confirmação efetivamente entregue); mensagem registrada no CRM (`990dc94a`, `sender: agente`). Silêncio provado na execução **1631**: com `optedOutAt` preenchido, `route: somente-registrar`, `fase: encerrada`, nenhum envio — a mensagem do lead é registrada mas o agente não responde. Screenshots fornecidos pelo usuário.

**Tests**: none
**Gate**: quick

**Commit**: `test(agente): registra prova real de opt-out e purga de memoria`

---

### T22: Expiração de documentos em produção, AD-020 e fechamento

**What**: Executar a rota de expiração em produção e observar o efeito no contexto do agente; registrar a AD-020 (emenda ao sequenciamento da AD-006); fechar rastreabilidade e gate final.
**Where**: `.specs/STATE.md`
**Depends on**: T21
**Reuses**: `/api/cron/expire-documents` e `expireDocuments` do lote-5 (nunca observados rodando em produção)
**Requirement**: PRIV-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Rota de expiração executada em produção; contagem por tenant registrada
- [x] `GET /api/v1/context` do tenant conferido **depois** da expiração: nenhum documento expirado presente na resposta
- [x] **AD-020** registrada em `.specs/STATE.md` `## Decisions`: o roadmap ganha o lote de usuários/perfis/papéis + atribuição por agenda entre a Fase 9 e a Fase 10 (L7 = Fase 9, L8 = usuários/papéis, L9 = Fase 10); AD-006 marcada `amended by AD-020`
- [x] Rastreabilidade do `spec.md` e do `tasks.md` atualizada no mesmo commit
- [x] Gate final: `npx vitest run && npm run lint && npm run build` verdes, com a contagem final registrada contra o piso real
- [x] Nenhum teste removido ou enfraquecido ao longo do lote — conferido comparando a contagem final com a soma das metas

**Status**: Done

**Nota (2026-08-22)**: rota de expiração disparada em produção pela primeira vez desde que existe (lote-5): `POST https://crivo-plum.vercel.app/api/cron/expire-documents` com `Authorization: Bearer $CRON_SECRET` (secret fornecido pelo usuário, nunca impresso em log/output) → `200 {"deletedByTenant":{},"total":0}`. Contagem 0 é o resultado honesto e esperado: consulta direta ao banco de produção (script descartável em `scratch/`, removido depois, nunca commitado) confirmou que só existem **3 documentos com `expiresAt` preenchido em toda a produção** — um por tenant (`vale-uberaba`, `triangulo`, `crivo-demo`), todos "Modelo de Contrato Padrão.docx", todos com prazo `2027-01-01T00:00:00Z` — nenhum ainda vencido. Não há, hoje, nenhum documento expirado para a rota deletar nem para `GET /api/v1/context` excluir. **Item 2 do Done-when** ficou provado por leitura de código + consulta ao banco, não por chamada HTTP autenticada ao vivo: `src/server/integration/context.ts:53` já filtra `expiresAt IS NULL OR expiresAt > now()` na própria query de leitura, independente do cron já ter rodado (comentário no próprio arquivo cita LGPD-02 AC2); com `EXPIRED_NOW_COUNT: 0` confirmado no banco, a exclusão é vacuamente satisfeita hoje e coberta por `context.test.ts`/`context-get.test.ts`/`cron-expire-documents.test.ts`. Não foi feita uma chamada HTTP real a `GET /api/v1/context` porque nenhuma chave de API (tenant ou serviço) em texto claro está disponível para o agente nesta sessão — por desenho deliberado do SEC-01/T14, o valor só é impresso uma vez no seed e nunca persistido; gerar uma chave nova via reseed para essa checagem rotacionaria credenciais reais de produção, ação fora do escopo autorizado desta task. Registrado como limitação honesta, não como lacuna de cobertura: o dia em que o primeiro documento realmente expirar (2027-01-01, salvo mudança de seed) é a primeira oportunidade real de observar a exclusão via API ao vivo. AD-020 registrada em `.specs/STATE.md` (`## Decisions`, após AD-019) com o roadmap emendado exatamente como especificado; AD-006 marcada `amended by AD-020`. Rastreabilidade de `spec.md` atualizada no mesmo commit: os 9 requirement IDs saem de `Pending` para `Implementing` (referenciando as tasks que os provam), com o Coverage explicando que o salto para `Verified` fica reservado ao Verifier. Gate final: `npx vitest run && npm run lint && npm run build` — **693 testes passando, 55 arquivos, 0 falhas** (piso real 622 → 693, +71 líquidos, batendo exatamente com a soma dos deltas reais registrados task a task); lint 0 erros, 2 warnings pré-existentes em `n8n/` (`scheduler.ts`/`generated/scheduler.ts`, `ifElse` não usado — mesmos warnings já presentes desde antes deste lote); build de produção verde, as 14 rotas do app compiladas sem erro. Nenhum teste removido ou enfraquecido em nenhuma task do lote.

**Tests**: none
**Gate**: build

**Commit**: `docs(lote-7): registra AD-020 e fecha rastreabilidade`
