# L14b — Tarefas de reengajamento contextual e consumo

## Execution Protocol

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

**Design:** [design.md](design.md), aprovado em 2026-10-02: “Aprovo. Vá para as tarefas”.

**Status:** Approved — usuário em 2026-10-02: “Aprovo. Gere o prompt de execução para que a fase de execução seja iniciado em outra janela de contexto”. 68 tarefas em 9 fases; T1–T16 concluídas localmente (16/68), fases 1/2 e lotes A/B fechados com a ressalva autorizada dos dois timeouts históricos, conforme evidências individuais e phase-2-verification.md. Fase3/loteC em andamento; T15/T16 provadas em seus relatórios individuais.

**Escopo:** 13 requisitos e 95 ACs aprovados. Uma retomada >=22h/<24h, continuidade restrita, desfecho >=48h, classificação após entrega e saldo mensal estimado. Sem modal/bloqueio financeiro.

Um commit atômico por tarefa, com testes e atualização de tasks/traceabilidade no mesmo commit. `Where` é o único artefato principal; testes, geração pelo inliner e documentação diretamente afetada acompanham a tarefa. Contagens abaixo são **mínimos planejados de cenários discriminantes**, não testes já executados. Preservar toda a cobertura anterior; capturar contagens frescas antes de Execute. Não excluir, enfraquecer ou pular testes para passar gate.

Tasks, matriz/gates, perfis de ferramentas S/R/N/U e execução por lotes sequenciais de agentes aprovados. Implementação/commits locais autorizados conforme a skill; Execute será iniciado em outra janela pelo [EXECUTE-PROMPT.md](EXECUTE-PROMPT.md). Push, deploy, mudanças estruturais em banco externo, publicação n8n e WhatsApp real continuam ações posteriores com autorização específica quando o resultado estiver concreto. Nenhum worker despachado. A oferta de subagentes foi aceita; não repetir a pergunta. Antes de Execute, ler implement.md integralmente; Verifier independente e sensor obrigatórios após a última tarefa.

## Fatos e gates que acompanham o plano

- Extensão Chrome retornou a aba Meta Business Suite com `selected_asset_type=whatsapp-business-account` e `selected_asset_id=1000796702954808`. Leitura Graph v25.0 confirmou HTTP200, ID **1000796702954808**, nome **Test WhatsApp Business Account**, `timezone_id=1`. Abertura da página pela extensão falhou; não há captura de pixels comprobatória.
- Business ID `402905505501945` não é WABA nem phoneNumberId. O ID descoberto é de **conta de teste**; não o cadastrar como conta de produção por inferência. Não foi gravado em env nem alterada configuração remota.
- Número/tenant, tradução primária do fuso para IANA, permissões, contrato mensal/zero de Analytics e transporte HMAC instalado continuam pendentes. `timezone_id=1` não autoriza usar America/Sao_Paulo para consumo.
- T1/T7/T12/T49/T65/T67 carregam esses gates. Resultado não comprovado permanece indisponível/desabilitado, nunca zero. Se o contrato real inviabilizar a fonte aprovada, revisar spec/design com evidência antes de substituir solução. Provas de serviço tarifável não são satisfeitas apenas por uma WABA de teste.
- As tarefas locais continuam testáveis por contratos documentados e fixtures; a ativação depende da evidência externa. Sem backfill presumido de fase/canal nem contagem webhook somada ao Analytics.

## Test Coverage Matrix

> Gerada do código, diretrizes e spec; confirmada na aprovação de Tasks em 2026-10-02. Diretrizes: AGENTS.md (Next instalado/Astryx), vitest.config.ts e src/db/index.ts/src/db/test-connection.ts (isolamento). README não define profundidade de cobertura; não há CONTRIBUTING/CI ou threshold percentual encontrado. Aplicados padrões fortes da skill: todos os ACs/arestas/erros, com amostras existentes como piso.

Amostras lidas: human-send.test.ts; conversation-conduction.test.ts; routes/leads-messages-post.test.ts; scheduler-conducao.test.ts; session.test.ts; schema-humano.test.ts; context-budget.test.ts; benchmark-notice.test.ts. Estilo: Vitest, fixtures próprias por tenant, fetch injetado, grafo SDK+execução dos Code nodes e DTOs puros de apresentação. Sem biblioteca DOM/E2E nova presumida.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Esquema/constraints | integration | Unicidade, FKs/propriedade tenant, limites e ciclo de exclusão comportamentais | `src/db/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| Domínio puro e adapters | unit | Todos os ramos/limites; 1:1 com ACs atribuídos e casos listados | `n8n/src/__tests__/*.test.ts`, `src/server/**/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| Serviço/repositório e DAL/mutação | integration | Sucesso, erro, isolamento, ordem/concorrência real/CAS; sem banco simulado para lock | `src/server/**/__tests__/*.test.ts` | `npx vitest run <arquivos>` |
| Handlers e contrato OpenAPI | integration | Cada endpoint: sucesso, replay, auth/tenant, limites, estados e falhas; comparação contrato/handler | `src/server/integration/__tests__/routes/*.test.ts`, `openapi.test.ts` | `npx vitest run <arquivos>` |
| Workflow/Code nodes | unit | Grafo gerado + execução dos nós; remover aresta crítica deve falhar; sem teste só por substring | `n8n/workflows/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| Apresentação | unit | DTO e renderização estática de todos os estados/autoria/acessibilidade; inspeção no navegador acompanha cada tarefa UI | `src/components/**/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| RSC/DAL | integration | Sessão/carteira/tenant, dados agregados, falhas e recomposição sem reenvio; verificação visual do fluxo | `src/server/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| Scripts operacionais | unit | Contrato das entradas/saídas, dry run, timeout, guardas de aplicação, logs sanitizados; dados não comprovados falham fechados | `scripts/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| Prova integrada | integration + prova de navegador/real autorizada | Desfechos completos; duas conexões Postgres; tempo controlado; versões e evidência capturada antes da limpeza | `scripts/__tests__/reengagement-proof.test.ts` + evidência versionada | `npx vitest run <arquivo>` + execução do roteiro autorizado |

Não criar teste frágil para prosa da documentação; asserções de OpenAPI verificam contrato executável. Não adiar testes para T68: ele acrescenta prova de ligação e roteiro reproduzível; todos os componentes já devem passar seus próprios testes.

## Gate Check Commands

**Decisão de execução (2026-10-02):** usuário determinou registrar e adiar os dois
timeouts anteriores de DOCLIM-01 AC8 (`actions.test.ts:1337` e `:1349`) e finalizar
as tarefas deste lote. Continuam sendo executados, com resultado real reportado;
essa ressalva não equivale a suíte integralmente verde nem dispensa qualquer
teste/gate do L14b. Falhas novas ou diferentes continuam exigindo resolução.
Registro durável em [baseline.md](baseline.md) e Deferred Ideas de [context.md](context.md).

> Comandos descobertos em package.json, vitest.config.ts, scripts/test-suite.mjs, scripts/test-db-push.ts e n8n/README.md; confirmados na aprovação das tarefas.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Tarefa com unit | `npx vitest run <Tests.path da tarefa>` e regressões diretamente afetadas |
| Full | Tarefa integration | `npx vitest run <Tests.path da tarefa> <regressões afetadas>`, Postgres real exclusivo de teste |
| Build | Fim de cada fase | `npm test`, `npm run lint`, `npm run build` |
| Wiring | Tarefa de workflow | `node scripts/n8n-inline.mjs`, testes Quick do SDK/Code nodes e comparação fonte→generated |
| Tipos | Diagnóstico adicional de fase | `npx tsc --noEmit`, comparar erros novos com baseline; não há script npm typecheck |
| Planning | Antes de revisar artefatos | `python <skill-dir>/scripts/validate_tasks.py <feature>/tasks.md --strict`, `validate_spec.py <feature>/spec.md --strict`, whitespace |
| UI | Cada tarefa de UI | `npm run dev:test` e extensão/browser para fluxo local isolado; render estático não prova draft/refresh |

No Windows, se npx.ps1 continuar quebrado, usar a instalação existente: `& 'C:/Program Files/nodejs/node.exe' 'C:/Program Files/nodejs/node_modules/npm/bin/npx-cli.js' --no-install vitest run <arquivo>`. Não instalar pacotes por reflexo. Python da sessão: `C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`.

Preparar esquema somente nos branches TEST_DATABASE_URL/worker autorizados (`npm run db:push:test` modifica banco externo). Suites usam branch de teste e fixtures próprias; nenhuma limpeza global/seed/rotação de chaves. Full usa branch-base; `npm test` ativa workers configurados. Não rodar duas suítes completas ao mesmo tempo. Último resultado histórico L14:2400/2402, duas falhas DOCLIM conhecidas; tsc50 erros históricos. São contexto, não baseline medido deste lote; registrar uma execução fresca e tratar qualquer falha nova antes de concluir tarefas.

## Ferramentas aprovadas

| Perfil | Ferramentas | Skills/guias |
| --- | --- | --- |
| S | exec_command/apply_patch, rg, Vitest/Postgres de teste | tlc-spec-driven; docs do Next instalado antes de código Next |
| R | S + Graph somente leitura com segredo servidor; extensão Chrome para identificação; MCP n8n readonly se necessário | tlc-spec-driven; contratos primários Meta; computer-use quando aplicável ao navegador |
| N | S + MCP n8n para descobrir schema/config/versão; código SDK/inliner locais | tlc-spec-driven; padrão workflow-as-code; nenhuma publicação implícita |
| U | S + npx astryx build/template/component; extensão/browser de teste para UI | tlc-spec-driven; Next instalado, AGENTS/Astryx; vercel:react-best-practices ao editar múltiplos TSX |

Manter os perfis definidos em cada tarefa. O usuário aprovou o conjunto recomendado, atendendo à escolha exigida por references/tasks.md; não repetir a pergunta. O preflight da extensão deve ser curto; timeout não deve levar a repetir ligações que travaram. Há caminhos alternativos de leitura autorizados, sem presumir captura visual.

## Execution Plan

Fases e tarefas sequenciais; uma tarefa por vez. Dependências incluem o gate anterior e, quando necessário, entregas de fases precedentes. Sem paralelismo dentro da fase. Nenhuma fase excede dez tarefas; as fases3/4/7 têm nove por coesão de estado/integração.

### Phase 1: Conta e modelos aditivos

7 tarefas: T1, T2, T3, T4, T5, T6, T7.

```text
T1 → T2 → T3 → T4 → T5 → T6 → T7
```

### Phase 2: Recibos, Analytics e leituras

7 tarefas: T8, T9, T10, T11, T12, T13, T14.

```text
T8 → T9 → T10 → T11 → T12 → T13 → T14
```

### Phase 3: Elegibilidade e episódio durável

9 tarefas: T15, T16, T17, T18, T19, T20, T21, T22, T23.

```text
T15 → T16 → T17 → T18 → T19 → T20 → T21 → T22 → T23
```

### Phase 4: Continuidade e escritores existentes

9 tarefas: T24, T25, T26, T27, T28, T29, T30, T31, T32.

```text
T24 → T25 → T26 → T27 → T28 → T29 → T30 → T31 → T32
```

### Phase 5: Transporte e endpoints de despacho

8 tarefas: T33, T34, T35, T36, T37, T38, T39, T40.

```text
T33 → T34 → T35 → T36 → T37 → T38 → T39 → T40
```

### Phase 6: Contratos e agente de leitura

7 tarefas: T41, T42, T43, T44, T45, T46, T47.

```text
T41 → T42 → T43 → T44 → T45 → T46 → T47
```

### Phase 7: Integração nos workflows

9 tarefas: T48, T49, T50, T51, T52, T53, T54, T55, T56.

```text
T48 → T49 → T50 → T51 → T52 → T53 → T54 → T55 → T56
```

### Phase 8: Superfícies existentes

6 tarefas: T57, T58, T59, T60, T61, T62.

```text
T57 → T58 → T59 → T60 → T61 → T62
```

### Phase 9: Retenção, ativação e prova

6 tarefas: T63, T64, T65, T66, T67, T68.

```text
T63 → T64 → T65 → T66 → T67 → T68
```

### Dependências adicionais e entre fases

O diagrama abaixo inclui **todas** as dependências, inclusive as já mostradas na ordem de cada fase. A tabela de cross-check usa o mesmo conjunto completo.

```text
T1 → T2
T2 → T3
T3 → T4
T4 → T5
T5 → T6
T6 → T7
T1 → T7
T7 → T8
T8 → T9
T5 → T9
T7 → T9
T9 → T10
T10 → T11
T1 → T11
T11 → T12
T7 → T12
T1 → T12
T12 → T13
T6 → T13
T13 → T14
T10 → T14
T14 → T15
T15 → T16
T3 → T16
T16 → T17
T4 → T17
T17 → T18
T18 → T19
T19 → T20
T16 → T20
T20 → T21
T10 → T21
T21 → T22
T22 → T23
T17 → T23
T23 → T24
T24 → T25
T16 → T25
T25 → T26
T21 → T26
T26 → T27
T10 → T27
T27 → T28
T28 → T29
T29 → T30
T30 → T31
T10 → T31
T31 → T32
T10 → T32
T32 → T33
T33 → T34
T20 → T34
T21 → T34
T34 → T35
T16 → T35
T35 → T36
T17 → T36
T36 → T37
T18 → T37
T25 → T37
T37 → T38
T19 → T38
T38 → T39
T34 → T39
T39 → T40
T21 → T40
T40 → T41
T23 → T41
T41 → T42
T26 → T42
T42 → T43
T9 → T43
T43 → T44
T13 → T44
T44 → T45
T30 → T45
T45 → T46
T25 → T46
T46 → T47
T47 → T48
T48 → T49
T43 → T49
T49 → T50
T35 → T50
T30 → T50
T50 → T51
T42 → T51
T24 → T51
T51 → T52
T30 → T52
T52 → T53
T30 → T53
T53 → T54
T47 → T54
T36 → T54
T37 → T54
T38 → T54
T39 → T54
T40 → T54
T54 → T55
T41 → T55
T55 → T56
T44 → T56
T40 → T56
T56 → T57
T14 → T57
T57 → T58
T8 → T58
T14 → T58
T58 → T59
T59 → T60
T14 → T60
T60 → T61
T57 → T61
T61 → T62
T59 → T62
T32 → T62
T62 → T63
T23 → T63
T10 → T63
T13 → T63
T63 → T64
T64 → T65
T7 → T65
T16 → T65
T50 → T65
T65 → T66
T46 → T66
T66 → T67
T49 → T67
T54 → T67
T55 → T67
T56 → T67
T67 → T68
T62 → T68
```

## Task Breakdown

### Phase 1: Conta e modelos aditivos

### T1: Preflight de conta e contrato Analytics

**What**: Criar diagnóstico somente leitura, com saída sanitizada de vínculo WABA/número, timezone_id→IANA por fonte primária e contrato mensal/zero.

**Where**: `scripts/whatsapp-account-preflight.ts`

**Depends on**: None

**Reuses**: scripts existentes, dotenv e fetch com timeout.

**Requirement**: USO-01, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil R — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: 200/401/403/429/timeout; conta de teste identificada; número divergente; fuso ou zero não comprovado deixam gate pendente, sem habilitar saldo.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Quick passou: `npx vitest run scripts/__tests__/whatsapp-account-preflight.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [x] Evidência sanitizada diferencia confirmado/pendente; dry run/relatório não altera conta, workflow, banco de produção ou env. Aplicação externa é gate posterior.

**Tests**: unit — `scripts/__tests__/whatsapp-account-preflight.test.ts`; matriz: Scripts operacionais.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): preflight de conta e contrato analytics` (docs para mudança exclusivamente contratual).

**Execução T1 (2026-10-02): concluída localmente.** Quick: `node node_modules/vitest/vitest.mjs run scripts/__tests__/whatsapp-account-preflight.test.ts`, exit0, 1 arquivo, 15/15 testes, 271ms. Sem alteração/exclusão/skip de teste existente. Diagnóstico sempre dryRun, sem aplicação nem saldo. `monthlyContract` é evidência documental revisada pelo operador; `analytics` permanece pendente da resposta integral real do mês, e `zero` da representação observada. A fixture de fuso é somente teste, não prova da conta real.

A leitura Graph dentro do sandbox resultou em `transport-failure`; não é resposta da Meta. A repetição fora do sandbox ficou aguardando aprovação e foi cancelada, sem resposta/captura. Fatos prévios de conta de teste permanecem; número/tenant/IANA/Analytics/zero reais não foram confirmados nesta execução. Nenhum requisito completo do produto é dado por realizado somente por este preflight.

**Adequação A/B/D:** valores e campos do relatório distinguem confirmado/pendente, não apenas chamadas; tests derivam de USO-01 AC1/6/7/8 e L14B-01 AC2/4, mais Done when T1. Convenções: scripts/__tests__, Vitest e fetch injetado conforme matriz. Evidência abaixo usa o arquivo `scripts/__tests__/whatsapp-account-preflight.test.ts`.

| Critério / AC atribuído (parcela T1) | file:line + asserção | Resultado exigido |
| --- | --- | --- |
| Done when 200/vínculo | `scripts/__tests__/whatsapp-account-preflight.test.ts:24` — `expect(result.account).toEqual({ state: "confirmed", code: "account-read", wabaId: "123", testAccount: false, timezoneId: 1 })`; `:25` — `expect(result.ownership).toEqual({ state: "confirmed", code: "waba-membership", tenantId: input.tenantId, phoneNumberId: "456" })` | Identidade/vínculo explícitos |
| Done when 401/403/429 | `scripts/__tests__/whatsapp-account-preflight.test.ts:45` — `expect(result.account).toEqual({ state: "pending", code })` | unauthorized/forbidden/rate-limited, pendentes |
| Done when timeout | `scripts/__tests__/whatsapp-account-preflight.test.ts:54` — `expect(result.account).toEqual({ state: "pending", code: "timeout" })` | Pendência, sem presumir resposta |
| Conta de teste | `scripts/__tests__/whatsapp-account-preflight.test.ts:61` — `expect(result.account.testAccount).toBe(true)`; `:62` — `expect(result.analytics).toEqual({ state: "pending", code: "test-account-production-unproven" })` | Não comprova produção |
| USO-01 AC8 / número divergente | `scripts/__tests__/whatsapp-account-preflight.test.ts:71` — `expect(result.ownership).toEqual({ state: "pending", code: "number-mismatch" })`; `:124` — `expect(result.ownership).toEqual({ state: "pending", code: "incomplete-number-pagination" })` | Não vincular parcial/divergente |
| USO-01 AC6/8, IANA da conta | `scripts/__tests__/whatsapp-account-preflight.test.ts:77` — `expect(result.timezone).toEqual({ state: "confirmed", code: "primary-timezone-reviewed", iana: "America/Los_Angeles", source })`; `:92` — `expect(result.analytics.state).toBe("pending")` | Revisão primária de fixture, sem assumir SP/ID divergente/fonte secundária/IANA inválido |
| USO-01 AC1/7, zero/consulta inicial | `scripts/__tests__/whatsapp-account-preflight.test.ts:79` — `expect(result.analytics).toEqual({ state: "pending", code: "account-access-full-month-response-pending" })`; `:80` — `expect(result.zero).toEqual({ state: "pending", code: "documented-zero-account-response-pending" })`; `:82` — `expect(result).not.toHaveProperty("used")` | Documento não substitui consulta/zero observados |
| L14B-01 AC2, segredo servidor | `scripts/__tests__/whatsapp-account-preflight.test.ts:34` — `expect(new URL(String(url)).searchParams.has("access_token")).toBe(false)`; `:101` — `expect(result.account).toEqual({ state: "pending", code: "credential-missing" })` | Token só header/processo, ausente impede rede |
| L14B-01 AC4, sanitização | `scripts/__tests__/whatsapp-account-preflight.test.ts:48` — `expect(JSON.stringify(result)).not.toMatch(/test-server-credential|conversa completa/)`; `:56` — `expect(JSON.stringify(result)).not.toContain("test-server-credential")`; `:114` — `expect(JSON.stringify(result)).not.toMatch(/test-server-credential|access_token|conversa-completa/)` | Erro/payload/locator sensível descartados |
| Done when readonly | `scripts/__tests__/whatsapp-account-preflight.test.ts:35` — `expect(request?.method).toBe("GET")`; `:36` — `expect(request?.body).toBeUndefined()`; `:29` — `expect(result.usageEnabled).toBe(false)`; `:30` — `expect(result.dryRun).toBe(true)` | Nenhuma aplicação/habilitação |

**Mapa reverso C (cada cenário necessário):**

| Teste + file:line da asserção | Origem / manter |
| --- | --- |
| 200, `scripts/__tests__/whatsapp-account-preflight.test.ts:24` / `:25` / `:29` / `:35` | Done when 200, readonly; USO-01 AC1/8; L14B-01 AC2 — manter |
| 401,403,429, `scripts/__tests__/whatsapp-account-preflight.test.ts:45` / `:48` | Done when erros; L14B-01 AC4 — manter os 3 cenários |
| timeout, `scripts/__tests__/whatsapp-account-preflight.test.ts:54` / `:56` | Done when timeout; L14B-01 AC4 — manter |
| teste, `scripts/__tests__/whatsapp-account-preflight.test.ts:61` / `:62` | Done when conta de teste / USO-01 AC8 — manter |
| divergente, `scripts/__tests__/whatsapp-account-preflight.test.ts:71` | Done when número divergente / USO-01 AC8 — manter |
| fixture IANA/documento, `scripts/__tests__/whatsapp-account-preflight.test.ts:77` / `:78` / `:79` / `:80` | USO-01 AC1/6/7/8, Done when fuso/zero — manter |
| ID divergente,fonte secundária,IANA inválido,zero não documentado, `scripts/__tests__/whatsapp-account-preflight.test.ts:92` / `:93` | Done when prova insuficiente, USO-01 AC7/8 — manter os 4 cenários |
| credencial ausente, `scripts/__tests__/whatsapp-account-preflight.test.ts:101` / `:102` | L14B-01 AC2 / Independent Test — manter |
| locator sensível, `scripts/__tests__/whatsapp-account-preflight.test.ts:112` / `:114` | L14B-01 AC4 — manter |
| página parcial, `scripts/__tests__/whatsapp-account-preflight.test.ts:124` / `:125` | Done when vínculo/número; USO-01 AC8; L14B-01 AC4 — manter |

**Veredito:** adequação T1 aprovada; 15 cenários necessários, resultados sanitizados, nenhum saldo fictício. Gates factuais de ativação seguem pendentes. Sem SPEC_DEVIATION. Build fica para T7; ressalva baseline dos 2 timeouts históricos continua documentada.

---

### T2: Modelo dos canais WhatsApp

**What**: Adicionar whatsapp_channels e coordenação de sincronização por número, sem persistir credenciais.

**Where**: `src/db/schema.ts`

**Depends on**: T1

**Reuses**: schema Drizzle e schema-humano.test.ts.

**Requirement**: USO-01, USO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: unicidade global do número; tenant/FK; configuração não verificada; revisão; lease; exclusão sem cruzar tenant.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **6 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Full passou: `npx vitest run src/db/__tests__/schema-whatsapp-channels.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/db/__tests__/schema-whatsapp-channels.test.ts`; matriz: Esquema/constraints.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): modelo dos canais whatsapp` (docs para mudança exclusivamente contratual).

**Execução T2 (2026-10-02): concluída.** Full executado pelo orquestrador em Postgres real isolado: `node node_modules/vitest/vitest.mjs run src/db/__tests__/schema-whatsapp-channels.test.ts src/db/__tests__/schema-humano.test.ts`, exit0, 2 arquivos, 13/13 testes (T2=8, regressão=5), 23,46s. Nenhuma asserção, timeout ou teste anterior mudou. Schema aplicado pelo root com autorização específica, SQL/branches em test-schema-activation.md; produção excluída. Check local tsc preservou 50 erros anteriores, sem novos. A tabela é infraestrutura; USO-02 AC2 só ganha metadados de coordenação, sem alegação prematura de lease/CAS implementado.

**Adequação A/B/D:** resultados persistidos e violações reais de constraints; nenhum mock de banco. Diretrizes AGENTS/vitest.config/src/db/index, fixtures próprias, limpeza somente seus tenants. Fuso real ainda exige T7; a fixture IANA não prova a conta externa.

| Critério / AC (parcela T2) | file:line + asserção | Resultado exigido |
| --- | --- | --- |
| Configuração não verificada / USO-01 AC8 | `src/db/__tests__/schema-whatsapp-channels.test.ts:39` — `expect(row.usageEnabled).toBe(false)`; `:40` — `expect(row.accountKind).toBe("unverified")`; `:41` — `expect(row.wabaId).toBeNull()`; `:42` — `expect(row.accountTimezone).toBeNull()`; `:43` — `expect(row.analyticsPhoneNumber).toBeNull()`; `:44` — `expect(row.ownershipVerifiedAt).toBeNull()`; `:45` — `expect(row.analyticsVerifiedAt).toBeNull()` | Sem saldo/prova fabricada |
| Unicidade global / propriedade tenant | `src/db/__tests__/schema-whatsapp-channels.test.ts:55` — `expect(await codeOf(db.insert(whatsappChannels).values({ ...input, tenantId: tenantB }))).toBe("23505")`; `:57` — `expect(rows.map((row) => row.tenantId)).toEqual([tenantA])` | Número continua exclusivamente de A |
| FK/tenant inexistente | `src/db/__tests__/schema-whatsapp-channels.test.ts:62` — `expect(await codeOf(db.insert(whatsappChannels).values(input))).toBe("23503")`; `:63` — `expect(await db.select().from(whatsappChannels).where(eq(whatsappChannels.phoneNumberId, input.phoneNumberId))).toHaveLength(0)` | Nenhum canal parcial |
| Provas/conta test ou unverified | `src/db/__tests__/schema-whatsapp-channels.test.ts:67` — `expect(await codeOf(db.insert(whatsappChannels).values({ ...channel(), usageEnabled: true }))).toBe("23514")`; `:69` — `expect(await codeOf(db.insert(whatsappChannels).values({ ...verified(), accountKind, usageEnabled: true }))).toBe("23514")`; `:73` — `expect(await codeOf(db.insert(whatsappChannels).values(input))).toBe("23514")` | Bloqueia mesmo com demais metadados completos, ou sem qualquer uma das cinco provas/campos |
| Habilitação explícita documentada | `src/db/__tests__/schema-whatsapp-channels.test.ts:80` — `expect(row.usageEnabled).toBe(true)`; `:81` — `expect(row.accountKind).toBe("production")`; `:82` — `expect(row.accountTimezone).toBe("America/Los_Angeles")`; `:83` — `expect(row.ownershipVerifiedAt).toEqual(input.ownershipVerifiedAt)`; `:84` — `expect(row.analyticsVerifiedAt).toEqual(input.analyticsVerifiedAt)` | Preserva provas/fuso da fixture |
| Revisão | `src/db/__tests__/schema-whatsapp-channels.test.ts:46` — `expect(row.configurationRevision).toBe(1)`; `:89` — `expect(await codeOf(db.insert(whatsappChannels).values({ ...channel(), configurationRevision }))).toBe("23514")`; `:92` — `expect(row.configurationRevision).toBe(2)` | Padrão1, positivo; zero/negativo recusados |
| Lease / USO-02 AC2 modelo | `src/db/__tests__/schema-whatsapp-channels.test.ts:48` — `expect(row.usageSyncToken).toBeNull()`; `:49` — `expect(row.usageSyncDeadline).toBeNull()`; `:99` — `expect(await codeOf(db.insert(whatsappChannels).values({ ...channel(), usageSyncToken }))).toBe("23514")`; `:100` — `expect(await codeOf(db.insert(whatsappChannels).values({ ...channel(), usageSyncDeadline }))).toBe("23514")`; `:102` — `expect(row.usageSyncToken).toBe(usageSyncToken)`; `:103` — `expect(row.usageSyncDeadline).toEqual(usageSyncDeadline)`; `:104` — `expect(row.lastUsageAttemptAt).toEqual(lastUsageAttemptAt)` | UUID/prazo pareados, tentativa separada |
| Exclusão isolada | `src/db/__tests__/schema-whatsapp-channels.test.ts:113` — `expect(await db.select().from(whatsappChannels).where(eq(whatsappChannels.id, own.id))).toHaveLength(0)`; `:114` — `expect(await db.select().from(whatsappChannels).where(eq(whatsappChannels.id, foreign.id))).toEqual([foreign])` | Cascade somente do dono; outro tenant intacto |

**Mapa reverso C:**

| Cenário + file:line da asserção | Origem / manter |
| --- | --- |
| `src/db/__tests__/schema-whatsapp-channels.test.ts:39` — `expect(row.usageEnabled).toBe(false)`; demais campos individualmente citados na matriz A | Done when configuração/revisão/lease; USO-01 AC8 — manter |
| `src/db/__tests__/schema-whatsapp-channels.test.ts:57` — `expect(rows.map((row) => row.tenantId)).toEqual([tenantA])` | Done when unicidade/tenant — manter |
| `src/db/__tests__/schema-whatsapp-channels.test.ts:62` — `expect(await codeOf(db.insert(whatsappChannels).values(input))).toBe("23503")` | Done when tenant/FK — manter |
| `src/db/__tests__/schema-whatsapp-channels.test.ts:73` — `expect(await codeOf(db.insert(whatsappChannels).values(input))).toBe("23514")`; subcasos `:67` e `:69` citados na matriz A | Done when configuração não verificada; gate factual USO-01 AC8 — manter |
| `src/db/__tests__/schema-whatsapp-channels.test.ts:80` — `expect(row.usageEnabled).toBe(true)`; campos `:81`/`:82`/`:83`/`:84` citados na matriz A | Done when modelo/provas, USO-01 AC8 — manter |
| `src/db/__tests__/schema-whatsapp-channels.test.ts:92` — `expect(row.configurationRevision).toBe(2)` | Done when revisão — manter |
| `src/db/__tests__/schema-whatsapp-channels.test.ts:102` — `expect(row.usageSyncToken).toBe(usageSyncToken)`; `:103` — `expect(row.usageSyncDeadline).toEqual(usageSyncDeadline)`; demais checks citados na matriz A | Done when lease; USO-02 AC2 infraestrutura — manter |
| `src/db/__tests__/schema-whatsapp-channels.test.ts:114` — `expect(await db.select().from(whatsappChannels).where(eq(whatsappChannels.id, foreign.id))).toEqual([foreign])` | Done when exclusão/tenant — manter |

**Veredito:** 8 cenários necessários e suficientes para T2, constraints e estados discriminados, regressão anterior preservada; sem SPEC_DEVIATION. accountKind é campo aditivo de evidência do gate já aprovado, justificado no Design. Build de fase permanece T7.

---

### T3: Projeção mínima de fase

**What**: Adicionar lead_agent_state com âncora, reset, revisão e limites da fase/perguntados.

**Where**: `src/db/schema.ts`

**Depends on**: T2

**Reuses**: fase/persona atuais.

**Requirement**: REEN-01, REEN-03, REEN-04; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: um estado por tenant/lead; propriedade do lead; fase nullable; enum inválido; campos perguntados <=8; FK da âncora.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **6 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Full passou: `npx vitest run src/db/__tests__/schema-agent-state.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/db/__tests__/schema-agent-state.test.ts`; matriz: Esquema/constraints.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): projeção mínima de fase` (docs para mudança exclusivamente contratual).

**Execução T3 (2026-10-02): concluída.** Full real pelo orquestrador: `node node_modules/vitest/vitest.mjs run src/db/__tests__/schema-agent-state.test.ts src/db/__tests__/schema-whatsapp-channels.test.ts src/db/__tests__/schema-humano.test.ts`, exit0, 3 arquivos, 20/20 testes, 42,78s (T3=7, canais=8, humano=5). Lint dos dois arquivos T3 passou. Tsc mantém 50 erros herdados, nenhum novo. SQL/hash/seis statements e cinco aplicações MCP autorizadas em test-schema-activation.md. A aprovação posterior ampla está em EXECUTE-PROMPT; nenhum pedido adicional é necessário.

**Adequação A/B/D:** constraints reais e campos persistidos, sem mocks de banco. Defaults não fabricam fase; os oito nomes esperados são explícitos no teste, separados da expressão do schema. Diretrizes AGENTS/Vitest/src/db/index; fixtures próprias; nenhuma mudança/exclusão/skip dos testes anteriores. FKs garantem tenant, não alegam vínculo entre âncora e lead dentro do mesmo tenant: esse gate corrente pertence à consulta T16.

| Critério / parcela do requisito | file:line + asserção | Resultado da spec/Done when |
| --- | --- | --- |
| Estado único tenant/lead | `src/db/__tests__/schema-agent-state.test.ts:47` — `expect(await codeOf(db.insert(leadAgentState).values(input))).toBe("23505")`; `:48` — `expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, input.leadId))).toHaveLength(1)` | Uma linha, sem duplicar |
| Propriedade da lead | `src/db/__tests__/schema-agent-state.test.ts:53` — `expect(await codeOf(db.insert(leadAgentState).values(input))).toBe("23503")`; `:54` — `expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, leadB))).toHaveLength(0)` | Lead do outro tenant não gera projeção |
| Fase nullable / REEN-01 AC6 infraestrutura | `src/db/__tests__/schema-agent-state.test.ts:60` — `expect(row.phase).toBeNull()`; `:61` — `expect(row.askedFields).toEqual([])`; `:62` — `expect(row.openingHistory).toEqual([])`; `:63` — `expect(row.resetObservedAt).toBeNull()`; `:64` — `expect(row.revision).toBe(1)` | Desconhecida; nenhum qualificando/reset/contexto presumido |
| Enum inválido e três fases | `src/db/__tests__/schema-agent-state.test.ts:68` — `expect(await codeOf(db.insert(leadAgentState).values({ ...await createAnchor(), phase: "inventada" as never }))).toBe("22P02")`; `:71` — `expect(row.phase).toBe(phase)` | Rejeita inventada; preserva qualificando/agendando/encerrada |
| Perguntados até oito nomes atuais | `src/db/__tests__/schema-agent-state.test.ts:81` — `expect(row.askedFields).toEqual(fields)`; `:82` — `expect(row.askedFields).toHaveLength(8)`; `:83` — `expect(await codeOf(db.insert(leadAgentState).values({ ...await createAnchor(), askedFields: [...fields, fields[0]] }))).toBe("23514")`; `:84` — `expect(await codeOf(db.insert(leadAgentState).values({ ...await createAnchor(), askedFields: ["campoInventado"] }))).toBe("23514")` | fields explícitos: modality/region/propertyType/budgetCents/purchaseHorizon/motivation/creditStatus/chainedOperation; 9 ou desconhecido recusados |
| FK âncora existente do tenant | `src/db/__tests__/schema-agent-state.test.ts:90` — `expect(await codeOf(db.insert(leadAgentState).values(input))).toBe("23503")`; `:91` — `expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, input.leadId))).toHaveLength(0)` | Ausente/estrangeira rejeitada, sem projeção parcial |
| Revisão/reset/aberturas mínimos | `src/db/__tests__/schema-agent-state.test.ts:98` — `expect(row.revision).toBe(2)`; `:99` — `expect(row.resetObservedAt).toEqual(resetObservedAt)`; `:100` — `expect(row.openingHistory).toEqual(["hmm", "certo"])`; `:101` — `expect(await codeOf(db.insert(leadAgentState).values({ ...await createAnchor(), revision: 0 }))).toBe("23514")` | Preserva metadados; revisão positiva; nenhum histórico paralelo |

**Mapa reverso C:**

| Cenário / file:line + asserção | Origem / manter |
| --- | --- |
| `src/db/__tests__/schema-agent-state.test.ts:48` — `expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, input.leadId))).toHaveLength(1)` | Done when estado único — manter |
| `src/db/__tests__/schema-agent-state.test.ts:53` — `expect(await codeOf(db.insert(leadAgentState).values(input))).toBe("23503")` | Done when propriedade da lead — manter |
| `src/db/__tests__/schema-agent-state.test.ts:60` — `expect(row.phase).toBeNull()`; demais defaults individualmente na matriz A | Done when fase nullable, REEN-01 AC6 preparação — manter |
| `src/db/__tests__/schema-agent-state.test.ts:68` — `expect(await codeOf(db.insert(leadAgentState).values({ ...await createAnchor(), phase: "inventada" as never }))).toBe("22P02")`; `:71` — `expect(row.phase).toBe(phase)` | Done when enum inválido/modelo — manter |
| `src/db/__tests__/schema-agent-state.test.ts:81` — `expect(row.askedFields).toEqual(fields)`; limite/recusas individualmente na matriz A | Done when nomes/perguntados<=8 — manter |
| `src/db/__tests__/schema-agent-state.test.ts:90` — `expect(await codeOf(db.insert(leadAgentState).values(input))).toBe("23503")`; sem estado em `:91` | Done when FK da âncora — manter |
| `src/db/__tests__/schema-agent-state.test.ts:99` — `expect(row.resetObservedAt).toEqual(resetObservedAt)`; `:100` — `expect(row.openingHistory).toEqual(["hmm", "certo"])`; revisão na matriz A | What T3/Design reset/revisão/persona — manter |

**Veredito:** 7 cenários necessários e suficientes para o modelo T3, campos e limites discriminados. REEN-01/03/04 têm somente infraestrutura de projeção neste ponto; suas transições/ponte continuam pendentes. Sem SPEC_DEVIATION; Build de fase em T7.

---

### T4: Modelo do episódio durável

**What**: Adicionar reengagement_episodes com chave do episódio, consumo permanente de despacho e referências de ponte.

**Where**: `src/db/schema.ts`

**Depends on**: T3

**Reuses**: reservas humanas como padrão de CAS, sem recuperação de envio.

**Requirement**: REEN-03, REEN-04, REEN-05, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: chave tenant/lead/canal/âncora única; FK composta; claims; estados de despacho; reset não duplica; escalada independente; exclusão; referência sem cópia de histórico.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Full passou: `npx vitest run src/db/__tests__/schema-reengagement.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/db/__tests__/schema-reengagement.test.ts`; matriz: Esquema/constraints.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): modelo do episódio durável` (docs para mudança exclusivamente contratual).

**Execução T4 (2026-10-02): concluída.** Full real pelo root: quatro arquivos, 30/30 testes, exit0, 98,13s (T4=10 + regressões=20). Comando: `node node_modules/vitest/vitest.mjs run src/db/__tests__/schema-reengagement.test.ts src/db/__tests__/schema-agent-state.test.ts src/db/__tests__/schema-whatsapp-channels.test.ts src/db/__tests__/schema-humano.test.ts`. Delta offline contra
HEAD `08f6fc6`, treze statements em t4-schema.sql. ESLint dos dois arquivos passou;
tsc mantém os 50 erros herdados, sem novos; whitespace passou. Root revisou e aplicou o hash autorizado em cinco transações MCP, todas isError=false, exclusivamente nos alvos de teste documentados. Nenhum teste anterior mudou. Build de fase permanece T7.

**Adequação A/B/D:** dez cenários de constraints e resultados persistidos em
Postgres, sem mocks; valores de estado explícitos do Design, sem importar lista
esperada da implementação. Fixtures próprias, limpeza começa pelos episódios
dos dois tenants próprios. Testes anteriores intactos. T4 prova o modelo, não
CAS/imutabilidade de UPDATE arbitrário nem uma chamada externa; T20/T21 provarão
essa parcela. FKs compostas provam tenant; mesma lead é consultada nos serviços.

| Critério / parcela do requisito | file:line + asserção | Resultado da spec/Done when |
| --- | --- | --- |
| Chave única / REEN-03 AC8 modelo | `src/db/__tests__/schema-reengagement.test.ts:55` — `expect(await codeOf(db.insert(reengagementEpisodes).values({ ...input, resetObservedAt: new Date() }))).toBe("23505")`; `:56` — `expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.leadId, input.leadId))).toHaveLength(1)` | Reset fora da chave; uma tentativa |
| Propriedade lead/canal/âncora | `src/db/__tests__/schema-reengagement.test.ts:62` — `expect(await codeOf(db.insert(reengagementEpisodes).values(input))).toBe("23503")`; `:63` — `expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.anchorMessageId, input.anchorMessageId))).toHaveLength(0)` | Três FKs recusam outro tenant, sem linha parcial |
| Claim e preparação | `src/db/__tests__/schema-reengagement.test.ts:71` e `:72` — `expect(await codeOf(...)).toBe("23514")` para token/prazo isolados; `:74` — `expect(row.state).toBe("preparing")`; `:75` — `expect(row.claimToken).toBe(claimToken)`; `:76` — `expect(row.claimExpiresAt).toEqual(claimExpiresAt)`; `:77` — `expect(row.dispatchAuthorizedAt).toBeNull()`; `:78` — `expect(row.submittedText).toBeNull()` | Claim pareada, sem despacho/texto fabricado |
| Resultado e identidade / L14B-01 AC3 modelo | `src/db/__tests__/schema-reengagement.test.ts:82` — enum queued recusado `22P02`; `:87` — `expect(row.state).toBe(state)` para oito estados explícitos; `:88` — `expect(row.reasonCode).toBe(\`fixture-${state}\`)`; `:89` — `expect(row.dispatchAuthorizedAt).toEqual(sent ? dispatchAuthorizedAt : null)`; `:91`/`:92`/`:93`/`:94`/`:95` — formatos incompatíveis/aceite sem identidade recusados `23514` | Estados aprovados; marcador após autorização, wamid/aceite obrigatórios no aceite |
| Reset após resultado / REEN-03 AC8 modelo | `src/db/__tests__/schema-reengagement.test.ts:104` — `expect(row.state).toBe(state)`; `:105` — `expect(row.dispatchAuthorizedAt).toEqual(dispatchAuthorizedAt)`; `:106` — `expect(row.reasonCode).toBe("fixture-result")`; `:107` — `expect(row.resetObservedAt).toEqual(resetObservedAt)`; `:108` — tentativa com novo reset/revisão recusa `23505` | Evidência de refused/uncertain preservada sem duplicar chave |
| Escalonamento independente / REEN-05 infraestrutura | `src/db/__tests__/schema-reengagement.test.ts:116` — `expect(row.state).toBe(state)`; `:117` — `expect(row.escalatedAt).toEqual(escalatedAt)`; `:118` — `expect(row.escalationResult).toBe("escalado_humano")`; `:119` — `expect(row.escalationReasonCode).toBe(\`no-response-${state}\`)`; `:120` — `expect(row.bridgeInvalidatedAt).toBeNull()` | Aceita/recusada/incerta/omitida mantêm resultado ao registrar eixo humano |
| Referências/tenant / REEN-04 infraestrutura | `src/db/__tests__/schema-reengagement.test.ts:127` — quatro refs estrangeiras recusadas `23503`; `:128` — `expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.leadId, input.leadId))).toHaveLength(0)` | Nenhuma ponte/saída de outro tenant |
| Limpeza sem rearmar / REEN-03 AC8; L14B-01 AC6 infraestrutura | `src/db/__tests__/schema-reengagement.test.ts:137` — exclusão de quatro mensagens referenciadas recusada `23503`; `:143` — `expect(row.tenantId).toBe(tenantA)`; `:144` — `expect(row.anchorMessageId).toBe(input.anchorMessageId)`; `:145` — `expect(row.state).toBe("accepted")`; `:146` — `expect(row.dispatchAuthorizedAt).toEqual(dispatchAuthorizedAt)`; `:147` — `expect(row.wamid).toBe("wamid.fixture.retained")`; `:148` — refs limpas `[null,null,null,null]`; `:149` — `expect(JSON.stringify(row)).not.toContain("Conteúdo só no CRM")`; `:150` — chave continua recusando `23505` | Limpar referências antes da exclusão preserva tenant/chave/consumo/identidade, sem copiar histórico |
| Exclusão isolada da âncora/canal | `src/db/__tests__/schema-reengagement.test.ts:157` e `:158` — exclusões recusadas `23503`; `:159` — `expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, own.id))).toEqual([own])`; `:160` — `expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, other.id))).toEqual([other])` | Não perde proteção silenciosamente; outro tenant intacto |
| Revisões positivas | `src/db/__tests__/schema-reengagement.test.ts:165` — quatro zeros/negativos recusados `23514`; `:168` — `expect(row.agentStateRevision).toBe(2)`; `:169` — `expect(row.bridgeRevision).toBe(3)` | Revisões observada/ponte positivas e distintas |

**Mapa reverso C:**

| Cenário + file:line da asserção | Origem / manter |
| --- | --- |
| `src/db/__tests__/schema-reengagement.test.ts:55`/`:56`, unicidade/reset | Done when chave única; REEN-03 AC8 modelo — manter |
| `src/db/__tests__/schema-reengagement.test.ts:62`/`:63`, lead/canal/âncora estrangeiros | Done when FK composta — manter |
| `src/db/__tests__/schema-reengagement.test.ts:71`/`:72`/`:74`/`:75`/`:76`/`:77`/`:78`, claim | Done when claims — manter |
| `src/db/__tests__/schema-reengagement.test.ts:82`/`:87`/`:88`/`:89`/`:91`/`:92`/`:93`/`:94`/`:95`, oito estados/erros | Done when estados; L14B-01 AC3 modelo — manter |
| `src/db/__tests__/schema-reengagement.test.ts:104`/`:105`/`:106`/`:107`/`:108`, reset pós-resultado | Done when reset; REEN-03 AC8 modelo — manter |
| `src/db/__tests__/schema-reengagement.test.ts:116`/`:117`/`:118`/`:119`/`:120`, eixo humano | Done when escalada independente; REEN-05 infraestrutura — manter |
| `src/db/__tests__/schema-reengagement.test.ts:127`/`:128`, quatro refs estrangeiras | Done when FK composta/referências; REEN-04 infraestrutura — manter |
| `src/db/__tests__/schema-reengagement.test.ts:137`/`:143`/`:144`/`:145`/`:146`/`:147`/`:148`/`:149`/`:150`, limpeza | Done when exclusão/referência sem cópia; REEN-03 AC8/L14B-01 AC6 infraestrutura — manter |
| `src/db/__tests__/schema-reengagement.test.ts:157`/`:158`/`:159`/`:160`, âncora/canal preservados | Done when exclusão; REEN-03 AC8 modelo — manter |
| `src/db/__tests__/schema-reengagement.test.ts:165`/`:168`/`:169`, revisões | Done when modelo durável, revisões observadas do Design — manter |

**Veredito:** dez cenários necessários para os contratos T4, Full30/30 passou e regressões preservadas.
Sem SPEC_DEVIATION. Não declarar os ACs completos do serviço com este gate de schema.

---

### T5: Modelo de recibos e canal da mensagem

**What**: Adicionar whatsapp_message_receipts e canal nullable por mensagem para correlação histórica confiável.

**Where**: `src/db/schema.ts`

**Depends on**: T4

**Reuses**: messages e padrão de identidade externa.

**Requirement**: PRECO-01, PRECO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: unicidade tenant/canal/wamid; mensagem de outro tenant; órfão; ciclo de exclusão; legado sem canal; evidência de conflito; ausência de payload bruto.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **7 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Full passou: `npx vitest run src/db/__tests__/schema-whatsapp-receipts.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/db/__tests__/schema-whatsapp-receipts.test.ts`; matriz: Esquema/constraints.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): modelo de recibos e canal da mensagem` (docs para mudança exclusivamente contratual).

**Execução T5 (2026-10-02): concluída.** Full real pelo root: cinco arquivos, 38/38 testes, exit0, 116,46s (T5=8 + regressões=30). Comando: `node node_modules/vitest/vitest.mjs run src/db/__tests__/schema-whatsapp-receipts.test.ts src/db/__tests__/schema-reengagement.test.ts src/db/__tests__/schema-agent-state.test.ts src/db/__tests__/schema-whatsapp-channels.test.ts src/db/__tests__/schema-humano.test.ts`. SQL de oito statements
aditivos contra HEAD `6110042`; hash/alvos em test-schema-activation.md. ESLint
dos dois arquivos passou, tsc mantém 50 erros herdados sem novos, whitespace
passou. Root revisou e aplicou exatamente o hash autorizado nos cinco alvos em cinco transações MCP, todas isError=false. Nenhum teste anterior mudou. Build de fase permanece T7.

**Adequação A/B/D:** oito cenários reais de constraints/valores persistidos,
fixtures próprias de dois tenants; limpeza apenas seus recibos e dependentes.
Nenhum mock de banco ou alteração de teste anterior. PRECO-02 AC2 e L14B-01 AC5
provam somente modelo/FKs/ciclo de exclusão. Redução, sender de saída, replay e
autenticidade continuam T8/T9/T10. Lista explícita dos campos normalizados no
teste distingue acréscimo indevido de payload, sem compartilhar nomes esperados
com a implementação.

| Critério / parcela do requisito | file:line + asserção | Resultado exigido |
| --- | --- | --- |
| Unicidade/canal / PRECO-02 AC2 modelo | `src/db/__tests__/schema-whatsapp-receipts.test.ts:62` — chave duplicada `23505`; `:65` — `expect(rows).toHaveLength(3)`; `:66` — pares esperados tenant/canal A1,A2,B | Mesmo wamid em canais distintos não mistura recibos |
| Correlação composta / PRECO-02 AC2 modelo | `src/db/__tests__/schema-whatsapp-receipts.test.ts:77` — mensagem estrangeira/canal errado/wamid errado `23503`; `:78` — nenhuma linha parcial; `:80` — canal de B sob tenant A recusado `23503` | Tenant/canal/identidade precisam corresponder |
| Órfão / PRECO-02 AC5 infraestrutura | `src/db/__tests__/schema-whatsapp-receipts.test.ts:87` — `expect(row.messageId).toBeNull()`; `:88` — `expect(row.classification).toBe("pending")`; `:89` — expiração menos firstSeen igual30dias; `:90` — lista de messages continua igual; `:91` — órfão sem expiração `23514`; `:94` — `expect(attached.messageId).toBe(message.id)`; `:95` — `expect(attached.orphanExpiresAt).toBeNull()` | Sem bolha sintética; vínculo posterior retira prazo temporário |
| Exclusão / L14B-01 AC5 | `src/db/__tests__/schema-whatsapp-receipts.test.ts:104` — recibo da mensagem excluída tem0linhas; `:105` — recibo de outro tenant igual `[other]` | Recibo acompanha ciclo da mensagem, sem órfão permanente |
| Legado/canal humano | `src/db/__tests__/schema-whatsapp-receipts.test.ts:110` — `expect(legacy.whatsappPhoneNumberId).toBeNull()`; `:111` — `expect(legacy.externalId).toBeNull()`; `:113` — `expect(human.whatsappPhoneNumberId).toBe("fixture-canal-sem-analytics")`; `:114` — `expect(human.authorName).toBe("Equipe fixture")` | Nullable sem backfill; Analytics desconhecido não bloqueia escrita humana |
| Conflito / PRECO-02 AC6 infraestrutura | `src/db/__tests__/schema-whatsapp-receipts.test.ts:119` — `expect(row.pricingConflict).toBe(true)`; `:120` — `expect(row.classification).toBe("unavailable")`; `:121`/`:122` — formato observado desconhecido preservado; `:123` — `expect(row.billable).toBeNull()`; `:124` — conflito+free_service `23514`; `:125` — enum inventado `22P02` | Modela indisponibilidade sem inferir gratuidade |
| Dados normalizados / L14B-01 AC5 | `src/db/__tests__/schema-whatsapp-receipts.test.ts:130` — `expect(row.failureCode).toBe(131026)`; `:131` — `expect(row.classification).toBe("not_delivered")`; `:132`/`:133` — instantes sent/failed exatos; `:134` — keys igual lista explícita de18campos; `:139` — serialização não contém conteúdo privado | Sem campo de payload bruto/conteúdo/telefone pessoal |
| Metadados/identidade | `src/db/__tests__/schema-whatsapp-receipts.test.ts:143`/`:144`/`:146` — ordem invertida/wamid vazio/vinculado expirável `23514`; `:150` — `expect(row.firstSeenAt).toEqual(firstSeenAt)`; `:151` — `expect(row.lastSeenAt).toEqual(lastSeenAt)` | Ordem first/lastSeen e política órfão/vínculo preservadas |

**Mapa reverso C:**

| Cenário + file:line da asserção | Origem / manter |
| --- | --- |
| `src/db/__tests__/schema-whatsapp-receipts.test.ts:62`/`:65`/`:66`, chave/canais | Done when unicidade; PRECO-02 AC2 modelo — manter |
| `src/db/__tests__/schema-whatsapp-receipts.test.ts:77`/`:78`/`:80`, FKs/identidade | Done when mensagem estrangeira; PRECO-02 AC2 modelo — manter |
| `src/db/__tests__/schema-whatsapp-receipts.test.ts:87`/`:88`/`:89`/`:90`/`:91`/`:94`/`:95`, órfão/vínculo | Done when órfão; PRECO-02 AC5 infraestrutura — manter |
| `src/db/__tests__/schema-whatsapp-receipts.test.ts:104`/`:105`, exclusão | Done when ciclo; L14B-01 AC5 — manter |
| `src/db/__tests__/schema-whatsapp-receipts.test.ts:110`/`:111`/`:113`/`:114`, legado/humano | Done when legado sem canal — manter |
| `src/db/__tests__/schema-whatsapp-receipts.test.ts:119`/`:120`/`:121`/`:122`/`:123`/`:124`/`:125`, conflito | Done when evidência de conflito; PRECO-02 AC6 infraestrutura — manter |
| `src/db/__tests__/schema-whatsapp-receipts.test.ts:130`/`:131`/`:132`/`:133`/`:134`/`:139`, campos normalizados | Done when ausência de payload; L14B-01 AC5 — manter |
| `src/db/__tests__/schema-whatsapp-receipts.test.ts:143`/`:144`/`:146`/`:150`/`:151`, first/lastSeen/expiração | Done when modelo; lifecycle do Design — manter |

**Veredito:** oito cenários discriminantes necessários e Full38/38 passou, sem mudar regressões.
Sem SPEC_DEVIATION; nenhum AC integral de ingestão/classificação declarado completo.

---

### T6: Modelo do snapshot mensal

**What**: Adicionar whatsapp_usage por número, mês e revisão, separando queryEnd, sucesso e falha.

**Where**: `src/db/schema.ts`

**Depends on**: T5

**Reuses**: timestamps/índices Drizzle.

**Requirement**: USO-01, USO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: unicidade por período/revisão; volume inteiro não negativo; fuso; tenant/canal; sucesso versus tentativa; retenção sem relatório histórico.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **6 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Full passou: `npx vitest run src/db/__tests__/schema-whatsapp-usage.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/db/__tests__/schema-whatsapp-usage.test.ts`; matriz: Esquema/constraints.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): modelo do snapshot mensal` (docs para mudança exclusivamente contratual).

**Execução T6 (2026-10-02): concluída.** Full real pelo root: seis arquivos, 46/46 testes, exit0, 139,69s (T6=8 + regressões=38). Comando: `node node_modules/vitest/vitest.mjs run src/db/__tests__/schema-whatsapp-usage.test.ts src/db/__tests__/schema-whatsapp-receipts.test.ts src/db/__tests__/schema-reengagement.test.ts src/db/__tests__/schema-agent-state.test.ts src/db/__tests__/schema-whatsapp-channels.test.ts src/db/__tests__/schema-humano.test.ts`. SQL offline de três
statements contra HEAD `e676509`; hash/alvos em test-schema-activation.md. ESLint
dos dois arquivos passou; tsc mantém os 50 erros herdados sem novos; whitespace
passou. Root revisou e aplicou o hash autorizado em cinco transações MCP, todas isError=false, exclusivamente nos cinco alvos de teste documentados. Nenhum teste anterior mudou. Build de fase permanece T7.

**Adequação A/B/D:** oito cenários de constraints e valores persistidos, fixtures
próprias por canal em dois tenants; sem mocks ou alterações nos testes anteriores.
UTC/SP/LA e offsets DST são fixtures explícitas, sem cálculo compartilhado com o
schema. T6 não prova acesso Analytics/fuso externo, CAS ou rotina de retenção.
expiresAt é infraestrutura; T63 preservará snapshot corrente ainda necessário.
USO-01/02 têm somente a parcela de modelo descrita abaixo.

| Critério / parcela do requisito | file:line + asserção | Resultado exigido |
| --- | --- | --- |
| Chave período/revisão / USO-01 AC4/6 modelo | `src/db/__tests__/schema-whatsapp-usage.test.ts:49` — `expect(await codeOf(db.insert(whatsappUsage).values(input))).toBe("23505")`; `:55` — `expect(rows).toHaveLength(3)`; `:56` — duas linhas desconhecidas; `:57` — volume999 só mês/revisão anterior | Uma linha por chave; novo mês/revisão não herda volume |
| Volume / USO-01 AC2/7 modelo | `src/db/__tests__/schema-whatsapp-usage.test.ts:62` — negativo `23514`; `:63` — fracionário `22P02`; `:66` — `expect(zero.freeServiceVolume).toBe(0)`; `:67` — `expect(above.freeServiceVolume).toBe(1001)` | Inteiro não negativo; zero somente explícito, sem cap arbitrário1000 |
| Fuso/período / USO-01 AC6/8 modelo | `src/db/__tests__/schema-whatsapp-usage.test.ts:78` — `expect(row.accountTimezone).toBe(expected.accountTimezone)`; `:79`/`:80` — fronteiras exatas UTC/SP/LA; `:82` — períodoUTC sobSP `23514`; `:83` — fuso desconhecido `22023`; `:84` — null `23502` | Sem fuso presumido; fronteiras civis inclusive DST |
| Tenant/canal | `src/db/__tests__/schema-whatsapp-usage.test.ts:89` — canal estranho/ausente `23503`; `:90` — `expect(await db.select().from(whatsappUsage).where(eq(whatsappUsage.phoneNumberId, phoneNumberId))).toHaveLength(0)` | Nenhum snapshot parcial ou mistura |
| Ausência/falha / USO-01 AC7 e USO-02 AC3/4 modelo | `src/db/__tests__/schema-whatsapp-usage.test.ts:97` — `expect(unknown.freeServiceVolume).toBeNull()`; `:98`/`:99`/`:100` — queryEnd/sucesso/tentativa null; `:104` — `expect(failed.freeServiceVolume).toBe(999)`; `:105` — `expect(failed.queryEnd).toEqual(queryEnd)`; `:106` — sucesso anterior preservado; `:107`/`:108` — tentativa nova e http429 persistidos | Falha não publica zero nem substitui corte/volume anterior |
| Corte de consulta / USO-01 AC1/7 infraestrutura | `src/db/__tests__/schema-whatsapp-usage.test.ts:113` — corte fora do mês `23514`; `:116` — cada campo de sucesso ausente `23514`; `:119` — `expect(row.queryEnd).toEqual(queryEnd)`; `:120` — `expect(row.lastSuccessAt).toEqual(lastSuccessAt)`; `:121` — `expect(row.queryEnd).not.toEqual(row.lastSuccessAt)` | Período completo modelado; consulta e sucesso distintos |
| Retenção/mês / L14B-01 AC6 infraestrutura | `src/db/__tests__/schema-whatsapp-usage.test.ts:131` — vencido removido pela operação de fixture; `:132` — atual igual `[current]`; `:133` — `expect(current.freeServiceVolume).toBeNull()`; `:134` — estrangeiro igual `[foreign]` | Modelo suporta limpeza isolada e novo mês sem carry; não prova rotinaT63 |
| Revisão/resposta / USO-02 AC2 infraestrutura | `src/db/__tests__/schema-whatsapp-usage.test.ts:139` — zero/negativo revisão e sequência negativa `23514`; `:143` — `expect(row.configurationRevision).toBe(2)`; `:144` — `expect(row.querySequence).toBe(3)`; `:145` — `expect(row.responseToken).toBe(responseToken)`; `:147`/`:148` — padrão sequência0/tokennull; `:149` — expiração30dias da fixture | Identidade de resposta separada; coordenação/CAS continuam serviços |

**Mapa reverso C:**

| Cenário + file:line da asserção | Origem / manter |
| --- | --- |
| `src/db/__tests__/schema-whatsapp-usage.test.ts:49`/`:55`/`:56`/`:57`, chave/revisão/mês | Done when unicidade; USO-01 AC4/6 modelo — manter |
| `src/db/__tests__/schema-whatsapp-usage.test.ts:62`/`:63`/`:66`/`:67`, volume | Done when inteiro não negativo; USO-01 AC2/7 modelo — manter |
| `src/db/__tests__/schema-whatsapp-usage.test.ts:78`/`:79`/`:80`/`:82`/`:83`/`:84`, fuso | Done when fuso; USO-01 AC6/8 modelo — manter |
| `src/db/__tests__/schema-whatsapp-usage.test.ts:89`/`:90`, FK | Done when tenant/canal — manter |
| `src/db/__tests__/schema-whatsapp-usage.test.ts:97`/`:98`/`:99`/`:100`/`:104`/`:105`/`:106`/`:107`/`:108`, falha/sucesso | Done when sucesso versus tentativa; USO-01 AC7/USO-02 AC3/4 modelo — manter |
| `src/db/__tests__/schema-whatsapp-usage.test.ts:113`/`:116`/`:119`/`:120`/`:121`, queryEnd | Done when modelo; queryEnd do Design; USO-01 AC1/7 infraestrutura — manter |
| `src/db/__tests__/schema-whatsapp-usage.test.ts:131`/`:132`/`:133`/`:134`, retenção/mês | Done when retenção sem relatório; L14B-01 AC6 infraestrutura — manter |
| `src/db/__tests__/schema-whatsapp-usage.test.ts:139`/`:143`/`:144`/`:145`/`:147`/`:148`/`:149`, identidade de resposta | Done when modelo; sequência/token do Design; USO-02 AC2 infraestrutura — manter |

**Veredito:** oito cenários discriminantes necessários; Full46/46 passou e regressões intactas. Sem
SPEC_DEVIATION; nenhum AC integral de Analytics/lease/retention concluído.

---

### T7: Resolver canal verificado no servidor

**What**: Implementar resolução de canal por tenant/número e credencial servidor, com usage_enabled condicionado às provas registradas.

**Where**: `src/server/whatsapp/channels.ts`

**Depends on**: T6, T1

**Reuses**: resolução de tenant e env atuais.

**Requirement**: PRECO-02, USO-01, L14B-01, REEN-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: canal desconhecido; tenant errado; número duplicado; WABA de teste; fuso ausente; permissão não provada; configuração mudou; nenhum token em DTO/log; legado não inferido.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **9 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Full passou: `npx vitest run src/server/whatsapp/__tests__/channels.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/whatsapp/__tests__/channels.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): resolver canal verificado no servidor` (docs para mudança exclusivamente contratual).

**Execução T7 (2026-10-02): concluída, fase 1 fechada com ressalva autorizada.** Full real
pelo root: quatro arquivos, 43/43 testes, exit0, 36,22s (T7=14 + regressões=29).
Comando: `node node_modules/vitest/vitest.mjs run src/server/whatsapp/__tests__/channels.test.ts src/server/whatsapp/__tests__/cloud-api.test.ts src/db/__tests__/schema-whatsapp-channels.test.ts src/server/integration/__tests__/auth.test.ts`. Arquivos
channels.ts/server-only e channels.test.ts com14cenários. Guia Next instalado de
Server/Client Components lido integralmente antes da escrita. ESLint dos dois
arquivos passou; tsc mantém50erros herdados sem novos; whitespace passou.
Nenhuma suíte/Graph/env real alterada por este worker. Root executou os gates de fase: npm test exit1, 151/152 arquivos e 2470/2472 testes, 363,23s; apenas os dois timeouts DOCLIM-01 AC8 actions.test.ts:1337/:1349 já adiados pelo usuário. Todas as 70 adições passaram. Lint exit0 com os cinco avisos anteriores; build exit0; tsc exit1 com exatamente as 50 linhas de erro do baseline (Compare-Object vazio). Nenhum teste pulado/alterado; a suíte completa não é integralmente verde. Evidência e escopo da ressalva em phase-1-verification.md.

**Adequação A/B/D:** integração com Postgres real, fixtures próprias de tenants,
chave Bearer hasheada e autenticação existente; sem mocks do banco. Tokens são
sintéticos via stubEnv restaurado; fetch é bloqueado. Teste de segredo compara
retorno inteiro com valores/chaves explícitos, não com shape importado da
implementação. Nenhuma mudança de testes anteriores, carteira ou auth. Contexto
é autorizado antes do resolvedor; handlers/leituras posteriores mantêm essas
guardas. Habilitação do consumo em fixture não comprova os fatos externos T1.

| Critério / parcela do requisito | file:line + asserção | Resultado exigido |
| --- | --- | --- |
| Canal desconhecido / REEN-01 AC6 infraestrutura | `src/server/whatsapp/__tests__/channels.test.ts:63` — `expect(await resolveChannel(ctxA, { phoneNumberId })).toEqual({ ok: false, reason: "unknown-channel" })`; `:65` — fetch sem chamadas | Null/vazio/ausente não escolhe canal por inferência |
| Autorização/isolamento / L14B-01 AC1 e PRECO-02 AC2/8 parcela T7 | `src/server/whatsapp/__tests__/channels.test.ts:72` — `expect(auth).toEqual(ctxA)` mesmo header de B; `:74` — número de B retorna unknown-channel; `:78` — `expect(result.channel.tenantId).toBe(tenantA)` | Usa tenant da chave existente e consulta escopada |
| Número duplicado | `src/server/whatsapp/__tests__/channels.test.ts:83` — cadastro B duplicado recusa23505; `:87` — `expect(result.channel.id).toBe(own.id)`; `:88` — B continua unknown-channel | Sem troca de dono ou associação ambígua |
| Ownership / REEN-01 AC6 e PRECO-02 AC8 parcela | `src/server/whatsapp/__tests__/channels.test.ts:93` — `expect(await resolveChannel(ctxA, { phoneNumberId: row.phoneNumberId })).toEqual({ ok: false, reason: "ownership-unverified" })` | Cadastro sem prova não vira identidade confiável |
| Conta test/unverified / USO-01 AC8 | `src/server/whatsapp/__tests__/channels.test.ts:100` — identidade ok; `:102` — `expect(result.usage).toEqual({ enabled: false, reason: "account-not-production" })` para ambos kinds | Demais provas não fabricam produção |
| Fuso / USO-01 AC8 | `src/server/whatsapp/__tests__/channels.test.ts:110` — identidade ok; `:112` — `expect(result.usage).toEqual({ enabled: false, reason: "timezone-unverified" })` para null/Mars/PST/GMT/+03 | IANA ausente ou inválido mantém consumo indisponível |
| Permissão/número Analytics / USO-01 AC1/8 parcela | `src/server/whatsapp/__tests__/channels.test.ts:120` — identidade ok; `:122` — `expect(result.usage).toEqual({ enabled: false, reason: "analytics-unverified" })` em três casos | Sem prova/número normalizado não habilita saldo |
| WABA / USO-01 AC8 | `src/server/whatsapp/__tests__/channels.test.ts:129` — identidade ok; `:131` — `expect(result.usage).toEqual({ enabled: false, reason: "waba-unverified" })` | Consumo separado da identidade; sem conta inferida |
| Configuração mudou | `src/server/whatsapp/__tests__/channels.test.ts:138` — revisão1 retorna configuration-changed mesmo semtoken; `:143` — `expect(result.channel.configurationRevision).toBe(2)` | Snapshot de configuração antigo falha antes da credencial |
| Credencial servidor / L14B-01 AC2 | `src/server/whatsapp/__tests__/channels.test.ts:149` — `expect(await resolveChannel(ctxA, { phoneNumberId: row.phoneNumberId })).toEqual({ ok: false, reason: "credential-missing" })`; `:150` — fetch0calls | Segredo ausente no processo não chama rede |
| Segredo/retorno / L14B-01 AC2 | `src/server/whatsapp/__tests__/channels.test.ts:159` — retorno inteiro igual chaves/valores explícitos; `:164` — `expect(JSON.stringify(result)).not.toContain(SYNTHETIC_TOKEN)`; `:165`/`:166`/`:167`/`:168` — log/warn/error/fetch0calls | Nenhuma propriedade extra/token/erro sensível; configuração interna não é DTO cliente |
| Legado não inferido / PRECO-02 AC8 | `src/server/whatsapp/__tests__/channels.test.ts:175` — `expect(lead.whatsappPhoneNumberId).toBeNull()`; `:176`/`:177` — canalnull/displayphone retornam unknown-channel | Sem usar agentWhatsapp/telefone de exibição |
| Provas completas / USO-01 AC1/8 parcela | `src/server/whatsapp/__tests__/channels.test.ts:183` — identidade ok; `:185` — revisão3; `:186` — usageenabledtrue com WABA/númeroAnalytics/UTC explícitos | Habilita somente configuração fixture completa, sem consulta ou prova externa fabricada |
| Flag explícita | `src/server/whatsapp/__tests__/channels.test.ts:192` — identidade ok; `:194` — `expect(result.usage).toEqual({ enabled: false, reason: "usage-disabled" })` | Provas completas não substituem ativação explícita |

**Mapa reverso C:**

| Cenário + file:line da asserção | Origem / manter |
| --- | --- |
| `src/server/whatsapp/__tests__/channels.test.ts:63`/`:65`, desconhecido | Done when canal desconhecido; REEN-01 AC6 parcela — manter |
| `src/server/whatsapp/__tests__/channels.test.ts:72`/`:74`/`:78`, auth/tenant | Done when tenant errado; L14B-01 AC1/PRECO-02 AC2/8 parcela — manter |
| `src/server/whatsapp/__tests__/channels.test.ts:83`/`:87`/`:88`, duplicado | Done when número duplicado — manter |
| `src/server/whatsapp/__tests__/channels.test.ts:93`, ownership | Done when canal verificado; REEN-01 AC6/PRECO-02 AC8 parcela — manter |
| `src/server/whatsapp/__tests__/channels.test.ts:100`/`:102`, test/unverified | Done when conta teste; USO-01 AC8 — manter |
| `src/server/whatsapp/__tests__/channels.test.ts:110`/`:112`, fuso | Done when fuso ausente; USO-01 AC8 — manter |
| `src/server/whatsapp/__tests__/channels.test.ts:120`/`:122`, Analytics | Done when permissão não provada; USO-01 AC1/8 parcela — manter |
| `src/server/whatsapp/__tests__/channels.test.ts:129`/`:131`, WABA | Done when provas; USO-01 AC8 — manter |
| `src/server/whatsapp/__tests__/channels.test.ts:138`/`:143`, revisão | Done when configuração mudou — manter |
| `src/server/whatsapp/__tests__/channels.test.ts:149`/`:150`, credencial | Done when servidor; L14B-01 AC2 — manter |
| `src/server/whatsapp/__tests__/channels.test.ts:159`/`:164`/`:165`/`:166`/`:167`/`:168`, segredo | Done when nenhum token; L14B-01 AC2 — manter |
| `src/server/whatsapp/__tests__/channels.test.ts:175`/`:176`/`:177`, legado | Done when legado não inferido; PRECO-02 AC8 — manter |
| `src/server/whatsapp/__tests__/channels.test.ts:183`/`:185`/`:186`, completo | Done when gate do canal; USO-01 AC1/8 parcela — manter |
| `src/server/whatsapp/__tests__/channels.test.ts:192`/`:194`, desligado | Done when gate explícito, Designusageenabled — manter |

**Veredito:** 14 cenários discriminantes necessários passaram em Full43/43. Fase fechada sob a ressalva expressamente autorizada dos dois timeouts anteriores, mantendo-os ativos. Sem SPEC_DEVIATION; Analytics/fuso/produção externos continuam pendentes e demais tarefas T8–T68 não concluídas.

---

### Phase 2: Recibos, Analytics e leituras

### T8: Classificar evidências de entrega

**What**: Implementar reducer determinístico de status e pricing, conservando entrega e conflito.

**Where**: `src/server/whatsapp/statuses.ts`

**Depends on**: T7

**Reuses**: contratos Meta documentados.

**Requirement**: PRECO-01, PRECO-02, PROVA-01, USO-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: regular pago; free_customer_service; FEP; aceite/sent pendente; delivered sem pricing; categoria incompatível; read; sent atrasado; failed antes/depois de entrega; replay; conflito persistente; contrato desconhecido; 999/1000/1001.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **15 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Quick passou: `npx vitest run src/server/whatsapp/__tests__/pricing-classification.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.

**Tests**: unit — `src/server/whatsapp/__tests__/pricing-classification.test.ts`; matriz: Domínio/adapter puro.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): classificar evidências de entrega` (docs para mudança exclusivamente contratual).

**Resultado T8:** Quick root exit0, 28/28 testes, 225ms em 2026-10-02 20:29:50
America/Sao_Paulo. ESLint direcionado exit0; tsc mantém as 50 linhas de erro
anteriores, sem diferença. Reducer puro/server-only, timestamps separados,
confirmação completa de delivered/read e conflito persistente. FEP separado
da restrição service; união de pricing parcial não fabrica confirmação.
Todos os testes anteriores preservados. Adequação forward/reverse com
file:line/expressão/esperado em [t8-verification.md](t8-verification.md).
Sem delta schema/SPEC_DEVIATION; autenticação/persistência/UI continuam pendentes.

---

### T9: Persistir lotes de status autenticados

**What**: Implementar ingestStatusBatch com validação integral, canal confiável, upsert de recibos e logs limitados.

**Where**: `src/server/whatsapp/statuses.ts`

**Depends on**: T8, T5, T7

**Reuses**: auth/parser e reducer.

**Requirement**: PRECO-02, L14B-01, PRECO-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: replay; múltiplos canais; tenant errado; origem sem garantia; lote inválido sem escrita parcial; 100/101; limite de bytes; órfão; evento fora de ordem; log sem segredo/conteúdo.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Full passou: `npx vitest run src/server/whatsapp/__tests__/statuses-ingest.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/whatsapp/__tests__/statuses-ingest.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): persistir lotes de status autenticados` (docs para mudança exclusivamente contratual).

**Resultado T9:** Full root exit0, 75/75 testes, 5/5 arquivos, 61,79s, início
2026-10-02 20:51:52 America/Sao_Paulo. 16 novos+59 regressões preservadas.
Primeira execução 74/75: medição autocommit de PIDs sob PgBouncer foi corrigida
para captura dentro das transações reais, mantendo PIDs distintos/dois locks/
estado idempotente. ESLint exit0; tsc mantém50linhas anteriores. Contexto opaque
de origem, prova servidor/credencial do forwarder; default recusa. Validação
integral, locks/bulk e metadados limitados, sem efeito em inbound/episódio/uso.
Adequação forward/reverse e gate em [t9-verification.md](t9-verification.md).
Sem SPEC_DEVIATION/schema novo; HMAC instalado/ativação real continuam pendentes.

---

### T10: Correlacionar recibo após mensagem

**What**: Implementar attachReceipt por tenant/canal/wamid sem criar mensagem nem alterar inbound.

**Where**: `src/server/whatsapp/statuses.ts`

**Depends on**: T9

**Reuses**: messages e recibos normalizados.

**Requirement**: PRECO-01, PRECO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: status antes/depois da mensagem; replay; outra carteira/tenant; outro canal; inbound excluído; legado sem identidade; exclusão da mensagem sem órfão permanente.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Full passou: `npx vitest run src/server/whatsapp/__tests__/statuses-attach.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/whatsapp/__tests__/statuses-attach.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): correlacionar recibo após mensagem` (docs para mudança exclusivamente contratual).

**Resultado T10:** Full root exit0, 70/70 testes, 5/5 arquivos, 85,52s, início
2026-10-02 23:22:02 America/Sao_Paulo. 9 novos e 61 regressões preservadas.
Attach autorizado por carteira/tenant e identidade composta; ingest associa
saídas existentes em bulk, sem criar bolha/inbound. Replay conserva evidências;
executor permite rollback conjunto; exclusão cascade não deixa órfão permanente.
ESLint exit0; tsc mantém as 50 linhas anteriores, sem diferenças. Sem schema
novo/SPEC_DEVIATION. Adequação e gate em [t10-verification.md](t10-verification.md).

---

### T11: Normalizar Analytics e mês civil

**What**: Criar normalizador de período/filtros/partições e cálculo da franquia, recusando resposta sem comprovação suficiente.

**Where**: `src/server/whatsapp/analytics-contract.ts`; inclui correção auxiliar do CHECK civil descrita abaixo, fundamentada em USO-01 mês inteiro.

**Correção auxiliar**: `src/db/schema.ts` e delta revisado `t11-schema.sql`; bug factual nas fronteiras overlap/gap revelado pelos oráculos de T11, sem mudança do SQL T6 histórico.

**Depends on**: T10, T1

**Reuses**: fronteiras civis verificadas no Postgres ou biblioteca já disponível.

**Requirement**: USO-01, USO-02, PROVA-01, PRECO-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: V=0/999/1000/1001; fuso com virada civil/DST; início do mês até queryEnd; FEP/template/inbound fora; países disjuntos; total+detalhe; vazio não provado; parcial/paginação; número divergente; volume inválido; sem somar webhook.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **14 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Quick passou: `npx vitest run src/server/whatsapp/__tests__/analytics-contract.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [x] Gate Full auxiliar schema-whatsapp-usage passou após aplicação do CHECK revisado nos cinco alvos de teste; todos os oito cenários T6 preservados, mais overlap/gap/atraso.

**Tests**: unit — `src/server/whatsapp/__tests__/analytics-contract.test.ts`; matriz: Domínio/adapter puro. Integração auxiliar da correção: `src/db/__tests__/schema-whatsapp-usage.test.ts`.

**Gate**: Quick; Full auxiliar da correção de schema; Build no fechamento da fase.

**Commit**: `feat(l14b): normalizar analytics e mês civil` (docs para mudança exclusivamente contratual).

**Resultado T11:** Quick root exit0, 56/56 testes, 2/2 arquivos, 548ms,
início 2026-10-02 23:44:35 America/Sao_Paulo (28 novos + 28 T8). Full auxiliar
exit0, 11/11 testes, 31,18s, início 23:44:20 (3 novos + 8 T6 preservados).
Período civil inteiro verificado por oráculos SQL independentes, incluindo
overlap Havana/gap Amman. Delta do mesmo CHECK revisado e aplicado em cinco
transações de teste; SQL T6 histórico preservado, main excluída. Normalizador
recusa contrato ausente, vazio não provado, cobertura insuficiente, alias de
país e dupla contagem; max(0,1000−V), sem webhook. ESLint exit0; tsc mantém 50 erros iguais.
Sem SPEC_DEVIATION. Adequação/gates em [t11-verification.md](t11-verification.md);
hash/alvos em [test-schema-activation.md](test-schema-activation.md). Prova
externa de fullmonth/zero/identidade da conta permanece pendente.

---

### T12: Consultar Analytics pelo adapter Graph

**What**: Implementar consulta servidor com contrato versionado comprovado e orçamento de 15s, sem fallback local.

**Where**: `src/server/whatsapp/analytics.ts`

**Depends on**: T11, T7, T1

**Reuses**: fetch/timeout atuais, fonte primária da Meta.

**Requirement**: USO-01, USO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: filtros/identidade/período confirmados; contrato não confirmado recusa; 401/403/429; timeout; paginação incompleta; erro sem token; zero somente com prova.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Quick passou: `npx vitest run src/server/whatsapp/__tests__/analytics-query.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.

**Tests**: unit — `src/server/whatsapp/__tests__/analytics-query.test.ts`; matriz: Domínio/adapter puro.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): consultar analytics pelo adapter graph` (docs para mudança exclusivamente contratual).

**Resultado T12:** Quick root exit0, 86/86 testes, 4/4 arquivos, 1,51s,
início 2026-10-02 23:55:41 America/Sao_Paulo (18 T12 + 28 T11 + 28 T8 + 12 Cloud).
Factory opaca exige provas servidor, default recusa; uma consulta v25 com
filtro normalizado comprovado. Decoder estrito recusa country null/alias,
shape desconhecido/paginação/bucket parcial e vazio sem prova. Orçamento total
15s monotônico inclui guarda/fetch/JSON/decode, inclusive bloqueio síncrono;
401/403/429/rede/JSON retornam motivos limitados sem token/erro bruto.
ESLint exit0; tsc mantém os 50 erros anteriores sem diferenças. Sem schema
novo/SPEC_DEVIATION. Adequação em [t12-verification.md](t12-verification.md).
[Observação real sanitizada](analytics-account-observation.md) confirma somente
filtro/shape dessa conta de teste; fullmonth/zero/paginação/IANA/tenant/produção
permanecem não comprovados, nenhuma capacidade real habilitada.

---

### T13: Sincronizar snapshot sob lease

**What**: Implementar syncUsage com CAS por canal, cadência de 15min, lease 90s e publicação somente da resposta corrente.

**Where**: `src/server/whatsapp/analytics.ts`; inclui correção auxiliar de país canônico descrita abaixo, fundamentada em USO-01 AC7.

**Correção auxiliar**: predicate compartilhado em `src/server/whatsapp/analytics-contract.ts`; normalizador e decoder recusam aliases ISO uppercase UK/GB e BU/MM sem somar partições equivalentes. Bug encontrado na revisão factual T13, sem alterar contrato aprovado.

**Depends on**: T12, T6

**Reuses**: locks Drizzle/Postgres e adapter.

**Requirement**: USO-01, USO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: dois workers reais; 14:59.999/15min; falha mantém snapshot; interrupção/lease; worker vencido antes de fetch; resposta invertida; troca de mês/número/revisão; 429; timeout; queryEnd distinto; primeira consulta integral; sem número habilitado.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **12 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Full passou: `npx vitest run src/server/whatsapp/__tests__/analytics-sync.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa. Regate incluiu guarda auxiliar de fuso/fim do snapshot.

**Tests**: integration — `src/server/whatsapp/__tests__/analytics-sync.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): sincronizar snapshot sob lease` (docs para mudança exclusivamente contratual).

**Resultado T13:** regate Full root exit0, 93/93 testes, 5/5 arquivos, 122,64s,
início 2026-10-03 00:23:54 America/Sao_Paulo. 20 sync + 2 aliases novos e
71 testes anteriores preservados. Claim commitado antes HTTP; cadência por canal
15min, lease 90s e orçamento interno 80s; deadline monotônico/sinal Graph 15s e
timeouts LOCAL à transação, sem mudar Pool. CAS vivo de token/revisão/mês/número/
sequência/fuso/fim do snapshot antes do fetch e publicação; falha preserva sucesso anterior.
Concorrência comprovada com dois PIDs dentro BEGIN, dois locks e um Graph.
Correção auxiliar de aliases ISO evita dupla contagem, sem converter países.
Primeiro gate 92/92 passou; revisão final acrescentou guarda/caso Amman/Atenas
com mesmo início e fuso/fim distintos. Regate preservou todos os anteriores.
ESLint exit0; tsc mantém 50 erros anteriores/diff vazio; sem schema novo ou
SPEC_DEVIATION. Adequação/gate em [t13-verification.md](t13-verification.md).
Conta real/fullmonth/zero e integração tick T44 continuam pendentes.

---

### T14: Leituras autorizadas de consumo e classificação

**What**: Criar projeções getSettingsUsage/getConversationUsage/getMessageClassifications em lote para as superfícies autorizadas.

**Where**: `src/server/data/whatsapp.ts`

**Depends on**: T13, T10

**Reuses**: AuthContext/LeadScope reais (SessionScope conceitual no Design), can, escopo de getConversations/getMessages.

**Requirement**: USO-02, USO-03, USO-04, L14B-01, USO-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: admin/gestor; corretor na carteira; conversa alheia; tenant trocado; dois números; unknown; mês novo; 60min/60min+1ms; falha recente; sem snapshot; DTO sem segredo; leitura sem Graph/N+1.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **12 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Full passou: `npx vitest run src/server/data/__tests__/whatsapp.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/data/__tests__/whatsapp.test.ts`; matriz: DAL/mutação.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): leituras autorizadas de consumo e classificação` (docs para mudança exclusivamente contratual).

**Verificação T14**: Regate Full pelo root exit0, 5/5 arquivos, 79/79 testes,
67,57s, início 2026-10-03 07:38:11 America/Sao_Paulo; 18 novos e 61 anteriores
preservados. Adequação forward/reverse e primeira falha de fixture/cleanup em
[t14-verification.md](t14-verification.md). Pool.query real mede Settings1,
conversa2 e thread50saídas1; Graph0. Snapshot confere fuso/fim/revisão, DTO
queriedAt vem de queryEnd e stale usa lastSuccessAt >60min. Rótulos históricos
independem de Analytics atual. Lint de fase exit0 com cinco avisos anteriores,
build exit0, tsc pós-build exit2 com 50 erros anteriores e delta vazio.
Fase2 fechada sob a ressalva autorizada: npm test fresco exit1, 158/159 arquivos,
2612/2614 testes, 399,96s; só actions.test.ts:1337/:1349 DOCLIM-01 AC8 timeout
30s, sem falhas novas. Todas as 142 adições da fase2 passaram. Evidência em
[phase-2-verification.md](phase-2-verification.md); Whole não é verde integral.

---

### Phase 3: Elegibilidade e episódio durável

### T15: Política pura de elegibilidade

**What**: Definir regras compartilhadas de silêncio, condução, fase e horário sem decidir por prompt.

**Where**: `n8n/src/reengagement.mjs`

**Depends on**: T14

**Reuses**: conduction.mjs e business-hours.mjs.

**Requirement**: REEN-01, REEN-03, REEN-05; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: 21:59:59.999/22h/23:59:59.999/24h; início incluso/fim exclusivo; fim de semana/fallback; agendado/escalado/encerrada/opt-out/takeover; ausência de âncora/canal/fase; 48h independente de horário.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, **44 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Quick passou pelo root: 88/88 testes, 3/3 arquivos, 44 novos+44 regressões, 677ms em 2026-10-03 08:03:29 São Paulo. Resultados e adequação forward/reverse em [t15-verification.md](t15-verification.md). ESLint exit0; tsc exit2/50 erros anteriores, delta vazio; strict/whitespace exit0.

**Tests**: unit — `n8n/src/__tests__/reengagement.test.ts`; matriz: Domínio puro.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): política pura de elegibilidade` (docs para mudança exclusivamente contratual).

---

### T16: Publicar estado do agente com revisão

**What**: Implementar publishAgentState com lock do lead, âncora/reset correntes, expectedRevision e replay idêntico.

**Where**: `src/server/reengagement/agent-state.ts`

**Depends on**: T15, T3

**Reuses**: projeção versionada e parser existente.

**Requirement**: REEN-01, REEN-03, REEN-04, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [x] Entrega implementada no artefato principal e contrato do Design preservado.
- [x] Casos de resultado cobertos: fase válida; unknown não qualifica; execução antiga; inbound fora de ordem; reset; encerramento; expectedRevision errado; replay; tenant; falha não bloqueia humano.
- [x] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, **20 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [x] Gate Full pelo root: 130/130 testes, 6/6 arquivos, 20 novos+110 regressões, 77,32s em 2026-10-03 08:14:50 São Paulo. Dois PIDs medidos dentro BEGIN, dois esperando lock, uma revisão e um conflito persistidos. Adequação em [t16-verification.md](t16-verification.md); ESLint0, tsc2/50 erros anteriores sem delta, strict/whitespace0.

**Tests**: integration — `src/server/reengagement/__tests__/agent-state.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): publicar estado do agente com revisão` (docs para mudança exclusivamente contratual).

---

### T17: Listar candidatos por ação

**What**: Implementar listCandidates com cursor/corte fixo do tick, ações prepare/omit/escalate e limite <=100.

**Where**: `src/server/reengagement/repository.ts`

**Depends on**: T16, T4

**Reuses**: regras puras e paginação existente.

**Requirement**: REEN-01, REEN-05, L14B-01, REEN-03; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: 22h/24h/48h; fora de horário; fase unknown; canal desconhecido; opt-out/humano; paginação sem perda; tenant; somente IDs/âncora; sem varredura ilimitada.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/reengagement/__tests__/candidates.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/reengagement/__tests__/candidates.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): listar candidatos por ação` (docs para mudança exclusivamente contratual).

---

### T18: Reservar preparação de episódio

**What**: Implementar claimPreparation com ordem lead→episódio, lease de 5min e aquisição somente sem despacho consumido.

**Where**: `src/server/reengagement/repository.ts`

**Depends on**: T17

**Reuses**: padrão CAS humano, chave do episódio.

**Requirement**: REEN-01, REEN-03, L14B-01, PROVA-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: dois workers; token substituído; 5min exatas/vencida; contexto mudou; fora de janela/horário; fase unknown; reset não cria outro envio; nova âncora; replay; tenant.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/reengagement/__tests__/preparation-claim.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/reengagement/__tests__/preparation-claim.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): reservar preparação de episódio` (docs para mudança exclusivamente contratual).

---

### T19: Encerrar falha anterior ao despacho

**What**: Implementar releasePreparationFailure limitado à claim atual ainda não autorizada.

**Where**: `src/server/reengagement/repository.ts`

**Depends on**: T18

**Reuses**: claims de preparação.

**Requirement**: REEN-02, REEN-03; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: falha de geração; texto inválido; token velho; claim expirada; despacho já consumido; próximo tick elegível; replay/tenant sem envio.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **7 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/reengagement/__tests__/preparation-failure.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/reengagement/__tests__/preparation-failure.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): encerrar falha anterior ao despacho` (docs para mudança exclusivamente contratual).

---

### T20: Autorizar uma chamada externa

**What**: Implementar authorizeDispatch gravando texto e marcador permanente depois da revalidação atômica.

**Where**: `src/server/reengagement/repository.ts`

**Depends on**: T19, T16

**Reuses**: regras puras e transações de episódios.

**Requirement**: REEN-01, REEN-02, REEN-03, L14B-01, PROVA-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: disputa real; inbound/reset/opt-out/takeover/fase antes do commit; 24h durante geração; horário encerrou; texto trim vazio/4096/4097 UTF-16; token/canal/revisão; crash depois do commit não libera; lock lead antes de episódio; âncora autoritativa.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **14 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/reengagement/__tests__/dispatch-authorize.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/reengagement/__tests__/dispatch-authorize.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): autorizar uma chamada externa` (docs para mudança exclusivamente contratual).

---

### T21: Registrar aceite sem reenviar

**What**: Implementar reconcileAcceptance com mensagem, autoria, texto real, wamid, recibo e ponte na mesma transação.

**Where**: `src/server/reengagement/repository.ts`

**Depends on**: T20, T10

**Reuses**: ingestão, attachReceipt e chave do episódio.

**Requirement**: REEN-02, REEN-03, REEN-04, PRECO-01, PRECO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: aceite; falha de persistência e ack repetido; status órfão; inbound concorrente antes/depois do despacho; mesmo segundo da Meta; wamid perdido continua incerto; replay; tenant; lastInboundAt inalterado; tentativa consumida.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/reengagement/__tests__/acceptance.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/reengagement/__tests__/acceptance.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): registrar aceite sem reenviar` (docs para mudança exclusivamente contratual).

---

### T22: Atribuição com executor transacional

**What**: Adaptar assignBrokerForEscalation para executar sob a transação do episódio sem abrir transação aninhada.

**Where**: `src/server/data/index.ts`

**Depends on**: T21

**Reuses**: broker-assignment e broker-availability.

**Requirement**: REEN-05, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: responsável existente; corretor elegível; sem corretor; concorrência; erro desfaz transição; seleção tenant-scoped.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **6 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/data/__tests__/escalation-executor.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/data/__tests__/escalation-executor.test.ts`; matriz: DAL/mutação.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): atribuição com executor transacional` (docs para mudança exclusivamente contratual).

---

### T23: Omitir ou escalar episódio por silêncio

**What**: Implementar expireEpisode com omissão >=24h e escalonamento >=48h independente do resultado do envio.

**Where**: `src/server/reengagement/repository.ts`

**Depends on**: T22, T17

**Reuses**: executor de atribuição e lock lead→episódio.

**Requirement**: REEN-01, REEN-03, REEN-05, L14B-01, PROVA-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: 47:59:59.999/48h/+1ms; aceita/recusada/incerta/omitida; sem episódio; fora de horário; inbound/takeover/agendamento antes do commit; trava statusChangedBy humano; concorrência; responsável; motivo real sem enviar ao lead.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **12 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/reengagement/__tests__/expire.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/reengagement/__tests__/expire.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): omitir ou escalar episódio por silêncio` (docs para mudança exclusivamente contratual).

---

### Phase 4: Continuidade e escritores existentes

### T24: Sessão pura com ponte restrita

**What**: Estender seleção/semeadura/expiração com dois gaps especiais identificados, mantendo a regra normal.

**Where**: `n8n/src/session.mjs`

**Depends on**: T23

**Reuses**: session.mjs, AD-019/034/036.

**Requirement**: REEN-04, PROVA-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: memória warm/cold equivalente; 50/51; ordem sentAt/id; equipe→system; 12h/12h+1ms; <48h/48h; gaps de outros episódios; reset; buffer excluído; histórico apagado; sessão retomada ativa após 48h.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **14 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run n8n/src/__tests__/session.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.

**Tests**: unit — `n8n/src/__tests__/session.test.ts`; matriz: Domínio puro.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): sessão pura com ponte restrita` (docs para mudança exclusivamente contratual).

---

### T25: Preparar frame contextual

**What**: Implementar prepareFrame da sessão que contém a âncora com fatos atuais e projeção mínima, sem cópia paralela.

**Where**: `src/server/reengagement/context.ts`

**Depends on**: T24, T16

**Reuses**: contexto CRM e módulo de sessão.

**Requirement**: REEN-02, REEN-04, L14B-01, REEN-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: pendência atual; informação confirmada; nota humana; sessão antiga distinta; 50 mensagens; reset; contexto ilegível; tenant; nenhum inbound sintético/alteração de fatos.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **9 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/reengagement/__tests__/prepare-frame.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/reengagement/__tests__/prepare-frame.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): preparar frame contextual` (docs para mudança exclusivamente contratual).

---

### T26: Ler contexto e revisão da ponte

**What**: Implementar getSessionFrame com exclusão dos até 50 inbounds do buffer e sinalização de aceite pendente até 2min.

**Where**: `src/server/reengagement/context.ts`

**Depends on**: T25, T21

**Reuses**: frame CRM e estado do episódio.

**Requirement**: REEN-03, REEN-04, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: ponte aceita; resposta <48h/=48h; pending antes/depois 2min; resultado incerto não presume aceite; cold start; reset; exclusão de buffer; histórico apagado; tenant; leitura falha sem semeadura presumida.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/reengagement/__tests__/session-frame.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/reengagement/__tests__/session-frame.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): ler contexto e revisão da ponte` (docs para mudança exclusivamente contratual).

---

### T27: Ingestão atômica de mensagens e âncora

**What**: Estender ingestAgentMessage com canal, lock do lead, cancelamento da preparação, revisão da fase e consumo da ponte.

**Where**: `src/server/data/index.ts`

**Depends on**: T26, T10

**Reuses**: ingestAgentMessage e unicidade existente.

**Requirement**: REEN-02, REEN-03, REEN-04, PRECO-02, REEN-05, PRECO-01, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: inbound novo/replay/atrasado; âncora sentAt/id; novo episódio; resposta antes/depois de autorização; mesmo segundo; <48h/48h; reset/canal errado; status não é inbound; saída com órfão; opt-out; concorrência real; texto efetivo.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **14 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/data/__tests__/messages-reengagement.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/data/__tests__/messages-reengagement.test.ts`; matriz: DAL/mutação.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): ingestão atômica de mensagens e âncora` (docs para mudança exclusivamente contratual).

---

### T28: Invalidar episódio nos escritores de condução

**What**: Aplicar a mesma ordem de locks e invalidação nas mutações de status, takeover, devolução/reset e opt-out humano.

**Where**: `src/server/data/index.ts`

**Depends on**: T27

**Reuses**: mutadores atuais de condução e AD-034.

**Requirement**: REEN-03, REEN-04, REEN-05, L14B-01, REEN-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: tomada antes/depois da autorização; devolução não rearma; reset invalida ponte/fase; opt-out idempotente; status encerrado/agendado; humano trava pipeline; replay; tenant; histórico não reaparece; writer concorrente; mensagens humanas sem inbound.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **12 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/data/__tests__/conduction-reengagement.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/data/__tests__/conduction-reengagement.test.ts`; matriz: DAL/mutação.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): invalidar episódio nos escritores de condução` (docs para mudança exclusivamente contratual).

---

### T29: Invalidar ponte no opt-out da integração

**What**: Estender optOutLead para lock/invalidação atômicos, preservando timestamp original e contrato existente.

**Where**: `src/server/integration/lgpd.ts`

**Depends on**: T28

**Reuses**: optOutLead e transação do CRM.

**Requirement**: REEN-03, REEN-04, L14B-01, REEN-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: keyword/natural usam mesmo serviço; replay conserva timestamp; preparação cancelada; ponte invalidada; corrida com authorizeDispatch; tenant; nenhum histórico restaurado.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **7 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/integration/__tests__/lgpd-reengagement.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/integration/__tests__/lgpd-reengagement.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): invalidar ponte no opt-out da integração` (docs para mudança exclusivamente contratual).

---

### T30: Contrato aditivo de ingestão

**What**: Acrescentar whatsappPhoneNumberId e identidade/revisão da âncora às projeções de ingestão/leitura, mantendo o legado.

**Where**: `src/server/integration/messages.ts`

**Depends on**: T29

**Reuses**: messages.ts e testes routes/leads-messages.

**Requirement**: REEN-03, PRECO-01, PRECO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: canal válido; sem canal legado; número sem vínculo; wamid duplicado; leitura de outra carteira; autor; status órfão correlacionado; âncora corrente independente do turno antigo.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/integration/__tests__/messages.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/integration/__tests__/messages.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): contrato aditivo de ingestão` (docs para mudança exclusivamente contratual).

---

### T31: Canal e recibo no registro humano

**What**: Estender recordHumanMessage com canal efetivamente usado e attachReceipt na transação, preservando reserva/idempotência humanas.

**Where**: `src/server/data/index.ts`

**Depends on**: T30, T10

**Reuses**: recordHumanMessage e reservas de envio.

**Requirement**: PRECO-01, PRECO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: número real versus atual; legado nullable; status órfão antes do registro; replay de reserva; outro tenant/canal; falha de registro; autoria humana; não atualizar lastInboundAt.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/data/__tests__/human-record-channel.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/data/__tests__/human-record-channel.test.ts`; matriz: DAL/mutação.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): canal e recibo no registro humano` (docs para mudança exclusivamente contratual).

---

### T32: Persistir canal usado no envio humano

**What**: Transportar o canal efetivamente usado ao registro da mensagem/recibo sem vincular envio a Analytics.

**Where**: `src/server/chats/human-send.ts`

**Depends on**: T31, T10

**Reuses**: human-send e Cloud API atuais.

**Requirement**: PRECO-01, PRECO-02, USO-04, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: saldo positivo/zero/unknown/stale; n8n/Analytics falha; status antes do registro; canal mudou; replay; rótulo pendente sem segredo; composer mantém proteções.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/chats/__tests__/human-send.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/chats/__tests__/human-send.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): persistir canal usado no envio humano` (docs para mudança exclusivamente contratual).

---

### Phase 5: Transporte e endpoints de despacho

### T33: Resultado tipado do transporte proativo

**What**: Acrescentar evidências de aceite/recusa/incerteza e validação anterior ao fetch, preservando os códigos humanos.

**Where**: `src/server/whatsapp/cloud-api.ts`

**Depends on**: T32

**Reuses**: Cloud API existente.

**Requirement**: REEN-02, REEN-03, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: preflight sem fetch; wamid aceito; recusa explícita; timeout; 5xx ambíguo; resposta sem identidade; crash/interrupção; uma invocação sem retry; UTF-16; códigos humanos preservados.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run src/server/whatsapp/__tests__/cloud-api.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.

**Tests**: unit — `src/server/whatsapp/__tests__/cloud-api.test.ts`; matriz: Domínio/adapter puro.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): resultado tipado do transporte proativo` (docs para mudança exclusivamente contratual).

---

### T34: Orquestrar envio protegido

**What**: Implementar sendPreparedEpisode com validação, autorização, uma chamada e persistência/ack sem reenvio.

**Where**: `src/server/reengagement/send.ts`

**Depends on**: T33, T20, T21

**Reuses**: repositório e transporte.

**Requirement**: REEN-01, REEN-02, REEN-03, PRECO-01, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: replay retorna estado; falha pré-fetch permite preparação; corrida; recusa; timeout/crash; wamid e registro falho devolve accepted_pending_record; ack só persiste; identidade perdida incerta; deadline 2min; humano/opt-out/janela; logs sem texto; lastInboundAt preservado.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **12 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/reengagement/__tests__/send.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/reengagement/__tests__/send.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): orquestrar envio protegido` (docs para mudança exclusivamente contratual).

---

### T35: Endpoint de estado do agente

**What**: Expor POST agent-state autenticado com schema limitado e códigos de revisão/replay.

**Where**: `app/api/v1/leads/[id]/agent-state/route.ts`

**Depends on**: T34, T16

**Reuses**: withIntegrationRoute/parsers/problem.

**Requirement**: REEN-01, REEN-03, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: 200; replay; revisão 409; tenant/401/404; corpo inválido; >100KiB; âncora antiga; reset/fase incompatível.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/integration/__tests__/routes/agent-state-post.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/integration/__tests__/routes/agent-state-post.test.ts`; matriz: Handlers.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): endpoint de estado do agente` (docs para mudança exclusivamente contratual).

---

### T36: Endpoint de candidatos

**What**: Expor GET paginado de candidatos sem texto de conversa ou credenciais.

**Where**: `app/api/v1/whatsapp/automation/candidates/route.ts`

**Depends on**: T35, T17

**Reuses**: withIntegrationRoute/parsers.

**Requirement**: REEN-01, REEN-05, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: prepare/omit/escalate; cursor válido/inválido; limit 100/101; tenant; sem canal/fase; nenhum conteúdo pessoal; autenticação; corte estável.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/integration/__tests__/routes/automation-candidates-get.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/integration/__tests__/routes/automation-candidates-get.test.ts`; matriz: Handlers.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): endpoint de candidatos` (docs para mudança exclusivamente contratual).

---

### T37: Endpoint de preparação e frame

**What**: Expor POST prepare devolvendo claim/frame após validação da âncora e elegibilidade.

**Where**: `app/api/v1/leads/[id]/reengagement/prepare/route.ts`

**Depends on**: T36, T18, T25

**Reuses**: wrapper/parser, claim e prepareFrame.

**Requirement**: REEN-01, REEN-02, REEN-03, REEN-04, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: 201/200 replay; disputa 409; tenant/ID; âncora/reset; 22h/24h; horário; frame falho libera só preparação; >100KiB; token próprio; nenhum efeito do modelo.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/integration/__tests__/routes/reengagement-prepare-post.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/integration/__tests__/routes/reengagement-prepare-post.test.ts`; matriz: Handlers.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): endpoint de preparação e frame` (docs para mudança exclusivamente contratual).

---

### T38: Endpoint de falha de preparação

**What**: Expor POST limitado ao token atual e aos códigos de falha anteriores à autorização.

**Where**: `app/api/v1/leads/[id]/reengagement/[episodeId]/preparation-failure/route.ts`

**Depends on**: T37, T19

**Reuses**: wrapper/parser e releasePreparationFailure.

**Requirement**: REEN-02, REEN-03, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: release; replay; token errado; episódio/lead/tenant divergente; código inválido; autorização já consumida; autenticação/corpo.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **7 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/integration/__tests__/routes/reengagement-preparation-failure-post.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/integration/__tests__/routes/reengagement-preparation-failure-post.test.ts`; matriz: Handlers.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): endpoint de falha de preparação` (docs para mudança exclusivamente contratual).

---

### T39: Endpoint de envio protegido

**What**: Expor POST send com texto limitado, token e resultado persistido; replay nunca invoca Meta.

**Where**: `app/api/v1/leads/[id]/reengagement/[episodeId]/send/route.ts`

**Depends on**: T38, T34

**Reuses**: wrapper/parser e sendPreparedEpisode.

**Requirement**: REEN-02, REEN-03, L14B-01, REEN-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: aceite; replay; refused/uncertain; preparação expirada; tenant/IDs; trim/4096/4097; janela fechou; opted-out/takeover; resposta perdida; log limitado; accepted_pending_record; autenticação/corpo.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **12 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/integration/__tests__/routes/reengagement-send-post.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/integration/__tests__/routes/reengagement-send-post.test.ts`; matriz: Handlers.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): endpoint de envio protegido` (docs para mudança exclusivamente contratual).

---

### T40: Endpoint de acknowledgement

**What**: Expor POST de persistência idempotente do aceite conhecido, sem acesso ao transporte.

**Where**: `app/api/v1/leads/[id]/reengagement/[episodeId]/acknowledgement/route.ts`

**Depends on**: T39, T21

**Reuses**: wrapper e reconcileAcceptance.

**Requirement**: REEN-02, REEN-03, REEN-04, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: aceite pendente; replay; wamid incorreto/conflito; token/tenant/episódio; corpo limitado; zero fetch; primeiro inbound preservado; sem identidade não fabrica ponte.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/integration/__tests__/routes/reengagement-acknowledgement-post.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/integration/__tests__/routes/reengagement-acknowledgement-post.test.ts`; matriz: Handlers.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): endpoint de acknowledgement` (docs para mudança exclusivamente contratual).

---

### Phase 6: Contratos e agente de leitura

### T41: Endpoint de omissão/escalonamento

**What**: Expor POST expire por âncora com omissão/escalada/replay e proteção da condução.

**Where**: `app/api/v1/leads/[id]/reengagement/expire/route.ts`

**Depends on**: T40, T23

**Reuses**: wrapper e expireEpisode.

**Requirement**: REEN-01, REEN-05, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: 24h/48h; resultado do envio independente; novo inbound; humano trava; opt-out/agendado; replay; tenant; autenticação/corpo.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/integration/__tests__/routes/reengagement-expire-post.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/integration/__tests__/routes/reengagement-expire-post.test.ts`; matriz: Handlers.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): endpoint de omissão/escalonamento` (docs para mudança exclusivamente contratual).

---

### T42: Endpoint de contexto da sessão

**What**: Expor POST somente leitura do frame/ponte/reset com até 50 IDs do buffer.

**Where**: `app/api/v1/leads/[id]/session-context/route.ts`

**Depends on**: T41, T26

**Reuses**: wrapper e getSessionFrame.

**Requirement**: REEN-03, REEN-04, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: 50/51; IDs inválidos; pending; cold/warm; reset; outro tenant; fase/ponte desconhecida; autenticação/corpo; nenhum efeito de pipeline/inbound.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **9 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/integration/__tests__/routes/session-context-post.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/integration/__tests__/routes/session-context-post.test.ts`; matriz: Handlers.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): endpoint de contexto da sessão` (docs para mudança exclusivamente contratual).

---

### T43: Endpoint de status normalizados

**What**: Expor POST de lote vindo do trigger verificado, autenticando integração e vínculo de canal.

**Where**: `app/api/v1/whatsapp/statuses/route.ts`

**Depends on**: T42, T9

**Reuses**: wrapper/parser e ingestStatusBatch.

**Requirement**: PRECO-01, PRECO-02, L14B-01, PROVA-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: 200/replay; origem inválida; número/tenant divergente; 100/101; >100KiB; lote misto normalizado; órfão; pricing desconhecido; falha sem escrita parcial; nenhum agente.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/integration/__tests__/routes/whatsapp-statuses-post.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/integration/__tests__/routes/whatsapp-statuses-post.test.ts`; matriz: Handlers.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): endpoint de status normalizados` (docs para mudança exclusivamente contratual).

---

### T44: Endpoint de sincronização mensal

**What**: Expor POST sync servidor por número autorizado com skip/indisponível/snapshot e erros limitados.

**Where**: `app/api/v1/whatsapp/usage/sync/route.ts`

**Depends on**: T43, T13

**Reuses**: wrapper e syncUsage.

**Requirement**: USO-01, USO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: primeira consulta; skip 15min; canal não habilitado; tenant; 429/timeout; snapshot preservado; troca de mês; parâmetros Graph não controlados pelo body; auth/corpo.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **9 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/integration/__tests__/routes/whatsapp-usage-sync-post.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/integration/__tests__/routes/whatsapp-usage-sync-post.test.ts`; matriz: Handlers.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): endpoint de sincronização mensal` (docs para mudança exclusivamente contratual).

---

### T45: Contrato OpenAPI do lote

**What**: Documentar os dez endpoints e extensões de mensagem/âncora, enums, limites e códigos sem segredo.

**Where**: `docs/integration/openapi.yaml`

**Depends on**: T44, T30

**Reuses**: openapi.test.ts e guia de integração.

**Requirement**: L14B-01, PROVA-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: cada endpoint compara handler/schema/método; limite texto UTF-16; corpos <=100KiB; IDs/100status/50buffer; replay; recusas; indeterminado; legado; autorização; DTO sem token.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/integration/__tests__/openapi.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/integration/__tests__/openapi.test.ts`; matriz: Contrato OpenAPI.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): contrato openapi do lote` (docs para mudança exclusivamente contratual).

---

### T46: Adapter do prompt proativo

**What**: Enquadrar a retomada como tarefa de sistema, com fato atual/pendência/autoria e reserva de orçamento documental.

**Where**: `n8n/src/reengagement-prompt.mjs`

**Depends on**: T45, T25

**Reuses**: system-message.mjs, phase.mjs e contexto documental.

**Requirement**: REEN-02, REEN-04, PROVA-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: já informado não repergunta; nota da equipe; sem pendência inventada; vazio/4096/4097; sem inbound sintético; sem mutação de perguntados/abertura; identidade do system message; overhead antes de documentos; fonte de prompt compartilhada; sem texto substituto.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run n8n/src/__tests__/reengagement-prompt.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.

**Tests**: unit — `n8n/src/__tests__/reengagement-prompt.test.ts`; matriz: Domínio puro.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): adapter do prompt proativo` (docs para mudança exclusivamente contratual).

---

### T47: Workflow interno de geração somente leitura

**What**: Criar workflow frame→texto com modelo datado, tools de leitura fixadas ao tenant/lead e limite TOTAL de 120s.

**Where**: `n8n/workflows/reengagement-contextual.ts`

**Depends on**: T46

**Reuses**: SDK, tools readonly e inliner.

**Requirement**: REEN-02, REEN-03, PROVA-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil N — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: somente tools permitidas; sem responder/agenda/qualificação/escalada; sem Chat Memory; texto inválido; timeout total; orçamento; tenant/lead imutáveis; contexto falhou; prompt injection não adiciona efeitos; workflow gerado equivalente.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run n8n/workflows/__tests__/reengagement-contextual.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Inliner executado, generated equivalente, wiring/nós exercitados e README/guia afetado atualizado no mesmo commit. Publicação remota depende de autorização posterior.

**Tests**: unit — `n8n/workflows/__tests__/reengagement-contextual.test.ts`; matriz: Workflow/Code nodes.

**Gate**: Quick + Wiring; Build no fechamento da fase.

**Commit**: `feat(l14b): workflow interno de geração somente leitura` (docs para mudança exclusivamente contratual).

---

### Phase 7: Integração nos workflows

### T48: Splitter de envelopes WhatsApp

**What**: Separar todos os messages/statuses por número, preservando envelopes mistos e limites de quantidade/bytes.

**Where**: `n8n/src/whatsapp-events.mjs`

**Depends on**: T47

**Reuses**: shape real do WhatsApp Trigger.

**Requirement**: PRECO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: inbound só; status só; misto; múltiplos números; delivered/failed; sent/read em replay; >100; >100KiB com divisão; campos desconhecidos; nenhum inbound sintético; sem WABA inventada; erro de status não descarta inbound.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **12 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run n8n/src/__tests__/whatsapp-events.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.

**Tests**: unit — `n8n/src/__tests__/whatsapp-events.test.ts`; matriz: Domínio puro.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): splitter de envelopes whatsapp` (docs para mudança exclusivamente contratual).

---

### T49: Ramo de status no principal

**What**: Ligar splitter antes do filtro, selecionar delivered/failed e encaminhar status ao CRM sem caminho para o agente.

**Where**: `n8n/workflows/principal.ts`

**Depends on**: T48, T43

**Reuses**: trigger nativo, wrapper HTTP e SDK.

**Requirement**: PRECO-01, PRECO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil N — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: grafo impede buffer/memória/classifier/agente; mixed preserva inbound; batching; retry somente POST idempotente; vínculo errado; falha de status isolada; serializer gerado; assinatura na versão instalada como gate; configuração não comprovada impede publicação; replay; sent/read; segredo fora de logs.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **12 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run n8n/workflows/__tests__/principal-whatsapp-statuses.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Inliner executado, generated equivalente, wiring/nós exercitados e README/guia afetado atualizado no mesmo commit. Publicação remota depende de autorização posterior.

**Tests**: unit — `n8n/workflows/__tests__/principal-whatsapp-statuses.test.ts`; matriz: Workflow/Code nodes.

**Gate**: Quick + Wiring; Build no fechamento da fase.

**Commit**: `feat(l14b): ramo de status no principal` (docs para mudança exclusivamente contratual).

---

### T50: Publicação da fase pelo principal

**What**: Publicar projeção CRM de todos os escritores de fase antes do cache, usando âncora/revisão/reset do CRM.

**Where**: `n8n/workflows/principal.ts`

**Depends on**: T49, T35, T30

**Reuses**: phase.mjs/conversa_estado e agent-state.

**Requirement**: REEN-01, REEN-03, REEN-04, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil N — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: após buffer; fase mudou; encerramento; opt-out; execução antiga 409; replay; erro deixa unknown proativo; principal não presume último turno como âncora; cache não reabre; bootstrap observado.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run n8n/workflows/__tests__/principal-agent-state.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Inliner executado, generated equivalente, wiring/nós exercitados e README/guia afetado atualizado no mesmo commit. Publicação remota depende de autorização posterior.

**Tests**: unit — `n8n/workflows/__tests__/principal-agent-state.test.ts`; matriz: Workflow/Code nodes.

**Gate**: Quick + Wiring; Build no fechamento da fase.

**Commit**: `feat(l14b): publicação da fase pelo principal` (docs para mudança exclusivamente contratual).

---

### T51: Ponte na expiração e semeadura do principal

**What**: Usar session-context na expiração e semeadura, forçando reconstrução warm na primeira resposta vinculada.

**Where**: `n8n/workflows/principal.ts`

**Depends on**: T50, T42, T24

**Reuses**: blocos atuais de memória e session.mjs.

**Requirement**: REEN-04, PROVA-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil N — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: warm/cold; pending até 2min; incerto sem ponte; 48h exatas; gaps posteriores 12h/+1ms; exclusão do buffer; reset/purga D; equipe system; teto50; falha de leitura não inventa contexto; ausência de ponte mantém normal; memória apagada.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **12 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run n8n/workflows/__tests__/principal-reengagement-bridge.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Inliner executado, generated equivalente, wiring/nós exercitados e README/guia afetado atualizado no mesmo commit. Publicação remota depende de autorização posterior.

**Tests**: unit — `n8n/workflows/__tests__/principal-reengagement-bridge.test.ts`; matriz: Workflow/Code nodes.

**Gate**: Quick + Wiring; Build no fechamento da fase.

**Commit**: `feat(l14b): ponte na expiração e semeadura do principal` (docs para mudança exclusivamente contratual).

---

### T52: Canal no responder_lead

**What**: Persistir número realmente usado e wamid da resposta normal em todos os resultados aceitos.

**Where**: `n8n/workflows/tool-responder-lead.ts`

**Depends on**: T51, T30

**Reuses**: tool-responder-lead e ingestão.

**Requirement**: PRECO-01, PRECO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil N — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: aceite; status antes do CRM; falha de registro; canal trocado; legado; identidade do transporte não do modelo; replay; sem efeito em lastInboundAt/consumo.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run n8n/workflows/__tests__/tool-responder-channel.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Inliner executado, generated equivalente, wiring/nós exercitados e README/guia afetado atualizado no mesmo commit. Publicação remota depende de autorização posterior.

**Tests**: unit — `n8n/workflows/__tests__/tool-responder-channel.test.ts`; matriz: Workflow/Code nodes.

**Gate**: Quick + Wiring; Build no fechamento da fase.

**Commit**: `feat(l14b): canal no responder_lead` (docs para mudança exclusivamente contratual).

---

### T53: Canal nas saídas fixas do principal

**What**: Informar canal/wamid nos registros das saídas fixas e contingências existentes.

**Where**: `n8n/workflows/principal.ts`

**Depends on**: T52, T30

**Reuses**: ramos atuais comprovados.

**Requirement**: PRECO-01, PRECO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil N — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: opt-out confirmação; contingência; aceite; falha de registro; número correto; não inferir histórico antigo; mesmas regras de receipt/autoria sem alterar exclusividade de confirmação.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **7 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run n8n/workflows/__tests__/principal-outgoing-channel.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Inliner executado, generated equivalente, wiring/nós exercitados e README/guia afetado atualizado no mesmo commit. Publicação remota depende de autorização posterior.

**Tests**: unit — `n8n/workflows/__tests__/principal-outgoing-channel.test.ts`; matriz: Workflow/Code nodes.

**Gate**: Quick + Wiring; Build no fechamento da fase.

**Commit**: `feat(l14b): canal nas saídas fixas do principal` (docs para mudança exclusivamente contratual).

---

### T54: Scheduler B com geração e envio protegidos

**What**: Substituir template B por candidates→prepare→workflow readonly→send/ack, retirando qualquer retry de chamada Meta.

**Where**: `n8n/workflows/scheduler.ts`

**Depends on**: T53, T47, T36, T37, T38, T39, T40

**Reuses**: scheduler/SDK/inliner e contratos CRM.

**Requirement**: REEN-01, REEN-02, REEN-03, PROVA-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil N — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: 22h/24h e horário; candidato omitido; claim disputa; geração falha; 120s total; trim/4096/4097; inbound durante geração; replay send; ack só registro; versão gerada; template desativado; ausência de tools de escrita; remover cada aresta crítica faz prova falhar; lembrete A/reset D preservados.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **14 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run n8n/workflows/__tests__/scheduler-reengagement.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Inliner executado, generated equivalente, wiring/nós exercitados e README/guia afetado atualizado no mesmo commit. Publicação remota depende de autorização posterior.

**Tests**: unit — `n8n/workflows/__tests__/scheduler-reengagement.test.ts`; matriz: Workflow/Code nodes.

**Gate**: Quick + Wiring; Build no fechamento da fase.

**Commit**: `feat(l14b): scheduler b com geração e envio protegidos` (docs para mudança exclusivamente contratual).

---

### T55: Scheduler C com escalada independente

**What**: Trocar dependência de reengaged por expire de âncora, preservando trava humana e espelhando fechamento só após commit.

**Where**: `n8n/workflows/scheduler.ts`

**Depends on**: T54, T41

**Reuses**: scheduler C e expire protegido.

**Requirement**: REEN-05, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil N — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: >=48h mesmo aceita/omitida/recusada/incerta; fora de horário; replay; 409 contexto mudou; responsável; statusChangedBy humano; cache após commit; nenhum envio ao lead; A/D preservados.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run n8n/workflows/__tests__/scheduler-silence-expire.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Inliner executado, generated equivalente, wiring/nós exercitados e README/guia afetado atualizado no mesmo commit. Publicação remota depende de autorização posterior.

**Tests**: unit — `n8n/workflows/__tests__/scheduler-silence-expire.test.ts`; matriz: Workflow/Code nodes.

**Gate**: Quick + Wiring; Build no fechamento da fase.

**Commit**: `feat(l14b): scheduler c com escalada independente` (docs para mudança exclusivamente contratual).

---

### T56: Tick de consumo e reconciliação

**What**: Sincronizar canais habilitados mesmo sem candidatos e reconciliar somente persistência/autorizações abandonadas.

**Where**: `n8n/workflows/scheduler.ts`

**Depends on**: T55, T44, T40

**Reuses**: tick atual sem novo cron Vercel.

**Requirement**: REEN-03, USO-01, USO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil N — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: cadência15min; números sem leads; falha isolada; ack conhecido; >2min vira incerto sem reenvio; canal desabilitado; sem Graph por poll; troca de mês; ramos A/D preservados.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **9 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run n8n/workflows/__tests__/scheduler-whatsapp-usage.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Inliner executado, generated equivalente, wiring/nós exercitados e README/guia afetado atualizado no mesmo commit. Publicação remota depende de autorização posterior.

**Tests**: unit — `n8n/workflows/__tests__/scheduler-whatsapp-usage.test.ts`; matriz: Workflow/Code nodes.

**Gate**: Quick + Wiring; Build no fechamento da fase.

**Commit**: `feat(l14b): tick de consumo e reconciliação` (docs para mudança exclusivamente contratual).

---

### Phase 8: Superfícies existentes

### T57: Componente de consumo estimado

**What**: Renderizar UsageView acessível com ProgressBar/Text/Banner e aviso persistente, sem estado financeiro de bloqueio.

**Where**: `src/components/whatsapp/usage-summary.tsx`

**Depends on**: T56, T14

**Reuses**: Astryx ProgressBar/Banner/Text e RSC.

**Requirement**: USO-02, USO-03, USO-04, USO-01, L14B-01, PROVA-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil U — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: positivo; zero; >1000 mantém texto real; unknown; unavailable; stale; falha recente; mês/consulta; texto acessível; render sem segredo/estilo arbitrário.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run src/components/whatsapp/__tests__/usage-summary.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Astryx discover/frame/props e guias Next aplicáveis conferidos; self-check sem novo div/span de layout, style, CSS ou valores arbitrários; fluxo local inspecionado com evidência, sem remount do composer.

**Tests**: unit — `src/components/whatsapp/__tests__/usage-summary.test.ts`; matriz: Apresentação.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): componente de consumo estimado` (docs para mudança exclusivamente contratual).

---

### T58: Componente de classificação da mensagem

**What**: Renderizar cada MessagePricingView como metadata legível com as seis classificações aprovadas.

**Where**: `src/components/chats/message-pricing.tsx`

**Depends on**: T57, T8, T14

**Reuses**: ChatMessageMetadata/Text/Token Astryx.

**Requirement**: PRECO-01, USO-04, PRECO-02, USO-03; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil U — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: pago; franquia; FEP; pendente; indisponível; não entregue; inbound sem rótulo; texto sem valor de fatura/promessa de gratuidade.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run src/components/chats/__tests__/message-pricing.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Astryx discover/frame/props e guias Next aplicáveis conferidos; self-check sem novo div/span de layout, style, CSS ou valores arbitrários; fluxo local inspecionado com evidência, sem remount do composer.

**Tests**: unit — `src/components/chats/__tests__/message-pricing.test.ts`; matriz: Apresentação.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): componente de classificação da mensagem` (docs para mudança exclusivamente contratual).

---

### T59: Metadata em cada saída da thread

**What**: Acrescentar classificação por bolha sem perder autoria, timestamp ou agrupamento.

**Where**: `src/components/chats/message-thread.tsx`

**Depends on**: T58

**Reuses**: thread e chat-refresh existentes.

**Requirement**: PRECO-01, USO-03, USO-04, REEN-02, PRECO-02; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil U — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: primeira e última saída do grupo; humano/agente/retomada; inbound; autor existente; receipt atualizado pelo refresh; FEP depois de aviso de custo; classificação desconhecida.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run src/components/chats/__tests__/message-thread.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Astryx discover/frame/props e guias Next aplicáveis conferidos; self-check sem novo div/span de layout, style, CSS ou valores arbitrários; fluxo local inspecionado com evidência, sem remount do composer.

**Tests**: unit — `src/components/chats/__tests__/message-thread.test.ts`; matriz: Apresentação.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): metadata em cada saída da thread` (docs para mudança exclusivamente contratual).

---

### T60: Consumo no RSC de Configurações

**What**: Carregar agregado autorizado por número para admin/gestor sem Graph no render.

**Where**: `app/(crm)/configuracoes/page.tsx`

**Depends on**: T59, T14

**Reuses**: sessão/RSC e DAL existentes.

**Requirement**: USO-03, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil U — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: admin; gestor; corretor negado; tenant alterado; dois números; falha de Analytics não quebra página; sem segredo/Graph no DTO.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **7 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/__tests__/settings-whatsapp-usage.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.
- [ ] Astryx discover/frame/props e guias Next aplicáveis conferidos; self-check sem novo div/span de layout, style, CSS ou valores arbitrários; fluxo local inspecionado com evidência, sem remount do composer.

**Tests**: integration — `src/server/__tests__/settings-whatsapp-usage.test.ts`; matriz: RSC/DAL.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): consumo no rsc de configurações` (docs para mudança exclusivamente contratual).

---

### T61: Grupo de consumo em Configurações

**What**: Inserir UsageSummary junto do WhatsApp fora dos campos editáveis e sem nova navegação.

**Where**: `src/components/settings/settings-form.tsx`

**Depends on**: T60, T57

**Reuses**: FormLayout/Stack e formulário atual.

**Requirement**: USO-01, USO-03, USO-04, USO-02; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil U — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: cada número; unknown/indisponível; texto acessível; input editável não altera saldo; mudança de tenant; layout estreito; grupo sem style/div/rawCSS.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **7 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run src/components/settings/__tests__/settings-form.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Astryx discover/frame/props e guias Next aplicáveis conferidos; self-check sem novo div/span de layout, style, CSS ou valores arbitrários; fluxo local inspecionado com evidência, sem remount do composer.

**Tests**: unit — `src/components/settings/__tests__/settings-form.test.ts`; matriz: Apresentação.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): grupo de consumo em configurações` (docs para mudança exclusivamente contratual).

---

### T62: Resumo persistente no Chats autorizado

**What**: Carregar consumo/classificações em lote e inserir resumo irmão do HumanComposer também na condução pelo agente.

**Where**: `app/(crm)/chats/page.tsx`

**Depends on**: T61, T59, T32

**Reuses**: RSC, HumanComposer, refresh e DAL.

**Requirement**: USO-02, USO-03, USO-04, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil U — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: carteira autorizada/alheia; corretor só agregado pertinente; dois números; tenant/conversa trocado; canal unknown; automático sem composer; zero durante envio/espera; FEP posterior; stale/unknown; draft/requestId preservados no refresh; falha Analytics não bloqueia humano; acessibilidade/largura estreita.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **12 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/__tests__/chats-whatsapp-usage.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.
- [ ] Astryx discover/frame/props e guias Next aplicáveis conferidos; self-check sem novo div/span de layout, style, CSS ou valores arbitrários; fluxo local inspecionado com evidência, sem remount do composer.

**Tests**: integration — `src/server/__tests__/chats-whatsapp-usage.test.ts`; matriz: RSC/DAL.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): resumo persistente no chats autorizado` (docs para mudança exclusivamente contratual).

---

### Phase 9: Retenção, ativação e prova

### T63: Retenção operacional sem rearmar envio

**What**: Implementar purga >=30 dias dos órfãos/metadados mantendo classificação vinculada, despacho consumido e ponte ainda ativa.

**Where**: `src/server/reengagement/retention.ts`

**Depends on**: T62, T23, T10, T13

**Reuses**: retenção diária existente.

**Requirement**: REEN-03, REEN-04, PRECO-02, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: 30d-1ms/30d/30d+1ms; receipt vinculado; órfão expira; histórico excluído; tombstone protege âncora; sessão ativa >30d; reset; texto transitório removido; snapshot antigo; tenant sem cruzamento.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **10 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/reengagement/__tests__/retention.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/reengagement/__tests__/retention.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): retenção operacional sem rearmar envio` (docs para mudança exclusivamente contratual).

---

### T64: Integrar manutenção diária existente

**What**: Chamar retenção do L14b em runDailyMaintenance, sem criar agendamento ou afetar envios humanos/documentos.

**Where**: `src/server/integration/lgpd.ts`

**Depends on**: T63

**Reuses**: runDailyMaintenance e cron expire-documents.

**Requirement**: L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil S — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: cron autentica; resultado inclui contagens; replay; falha isolada/observável; retenção humana preservada; documentos preservados; nenhum dispatch/Graph de manutenção.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **7 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run src/server/integration/__tests__/maintenance.integration.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.

**Tests**: integration — `src/server/integration/__tests__/maintenance.integration.test.ts`; matriz: Serviço/repositório.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): integrar manutenção diária existente` (docs para mudança exclusivamente contratual).

---

### T65: Bootstrap explícito de canal e fase observada

**What**: Criar diagnóstico/dry run de canais e projeções existentes com aplicação condicionada a autorização e revisões verificadas.

**Where**: `scripts/reengagement-bootstrap.ts`

**Depends on**: T64, T7, T16, T50

**Reuses**: preflight e estado readonly do n8n.

**Requirement**: REEN-01, REEN-03, USO-01, L14B-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil R — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: fase real versus ausente; âncora/reset/revisão antiga; WABA de teste marcada; canal/fuso/Analytics sem prova permanecem desabilitados; dry run não escreve; tenant explícito; replay não reabre; credencial fora da saída; sem seed/rotação de chaves.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **9 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run scripts/__tests__/reengagement-bootstrap.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Evidência sanitizada diferencia confirmado/pendente; dry run/relatório não altera conta, workflow, banco de produção ou env. Aplicação externa é gate posterior.

**Tests**: unit — `scripts/__tests__/reengagement-bootstrap.test.ts`; matriz: Scripts operacionais.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): bootstrap explícito de canal e fase observada` (docs para mudança exclusivamente contratual).

---

### T66: Identidade e orçamento do benchmark

**What**: Incluir verificação da identidade/paridade compartilhada e orçamento do frame proativo, exigindo remedição quando houver mudança.

**Where**: `scripts/document-context-benchmark.ts`

**Depends on**: T65, T46

**Reuses**: benchmark AD-031 e locks atuais.

**Requirement**: REEN-02, PROVA-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil N — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: hash anterior/novo; prompt efetivo principal/proativo; teto existente não expandido; overhead deduzido; estado stale; sem resultado medido não habilita; check sem chamadas pagas e medição somente autorizada.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **7 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run scripts/__tests__/document-context-benchmark.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Se identidade compartilhada mudar, remedição autorizada concluída e anexada antes de habilitar; se não mudar, evidência de igualdade e orçamento do proativo registrada, sem fingir nova medição.

**Tests**: unit — `scripts/__tests__/document-context-benchmark.test.ts`; matriz: Scripts operacionais.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): identidade e orçamento do benchmark` (docs para mudança exclusivamente contratual).

---

### T67: Protocolo reproduzível de publicação

**What**: Criar relatório somente leitura de versões, serializer/assinatura efetivos, filas e plano de ativação/rollback que conserva tombstones.

**Where**: `scripts/reengagement-publication-check.ts`

**Depends on**: T66, T49, T54, T55, T56

**Reuses**: MCP n8n readonly e padrão get_workflow details.

**Requirement**: PRECO-02, L14B-01, PROVA-01, REEN-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil N — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: fonte/gerado/publicado diferentes; status selection real; garantia HMAC instalada; execução antiga/template pendente; handlers/schema compatíveis; gate de conta pendente; rollback sem template; nenhuma publicação/alteração do relatório.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **8 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Quick passou: `npx vitest run scripts/__tests__/reengagement-publication-check.test.ts` + regressões diretamente afetadas. Resultados derivam da spec; não apenas da implementação.
- [ ] Evidência sanitizada diferencia confirmado/pendente; dry run/relatório não altera conta, workflow, banco de produção ou env. Aplicação externa é gate posterior.

**Tests**: unit — `scripts/__tests__/reengagement-publication-check.test.ts`; matriz: Scripts operacionais.

**Gate**: Quick; Build no fechamento da fase.

**Commit**: `feat(l14b): protocolo reproduzível de publicação` (docs para mudança exclusivamente contratual).

---

### T68: Runner de prova integrada e evidência

**What**: Criar roteiro por resultados com tempo controlado, evidência versionada e modo real somente após autorização explícita.

**Where**: `scripts/reengagement-proof.ts`

**Depends on**: T67, T62

**Reuses**: fixtures por intenção, DB de teste e captura autorizada.

**Requirement**: REEN-01, REEN-02, REEN-03, REEN-04, REEN-05, PRECO-01, PRECO-02, USO-01, USO-02, USO-03, USO-04, L14B-01, PROVA-01; ACs individuais na matriz de rastreabilidade abaixo.

**Tools**: Perfil U — ferramentas e skills na tabela de perfis; confirmado pelo usuário antes de Execute.

**Done when**:

- [ ] Entrega implementada no artefato principal e contrato do Design preservado.
- [ ] Casos de resultado cobertos: scheduler→frame→texto→send→CRM→receipt→UI; duas conexões Postgres reais; remover ligação quebra prova; 999/1000/1001/FEP/replay/mês; warm/cold; opt-out/humano; janela 22h/24h/48h; takeover/inbound antes do commit; versões/filas; falha aceita sem registro; modo real captura entrada/resultado/tela antes da limpeza; benchmark condicionado e nenhuma rajada de 1001 envios.
- [ ] Testes co-localizados escritos/atualizados nesta tarefa; todos os ACs atribuídos e ramos de erro cobertos, pelo menos **12 cenários discriminantes passando**, mais toda a cobertura existente preservada (sem exclusões silenciosas).
- [ ] Gate Full passou: `npx vitest run scripts/__tests__/reengagement-proof.test.ts` + regressões diretamente afetadas. Integração usa Postgres real de teste, fixtures próprias e conexões independentes nos casos de disputa.
- [ ] Prova real somente após autorização: guardar versões/filas, entrada, resultado e captura em arquivo versionado antes da limpeza; conta de teste não prova tarifa real. Uma entrega autorizada basta para transporte; casos999/1000/1001 usam fixtures documentadas.

**Tests**: integration — `scripts/__tests__/reengagement-proof.test.ts`; matriz: Prova integrada.

**Gate**: Full; Build no fechamento da fase.

**Commit**: `feat(l14b): runner de prova integrada e evidência` (docs para mudança exclusivamente contratual).

---

## Rastreabilidade individual dos critérios

Cada um dos **95 ACs** tem tarefa(s) responsável(is), testes na própria tarefa e prova de resultado. A coluna resultado é um resumo; a spec aprovada governa a redação. T68 integra o fluxo e não substitui a cobertura co-localizada. Não marcar AC realizado antes de evidência de execução.

| Critério | Resultado a distinguir | Tarefas responsáveis |
| --- | --- | --- |
| REEN-01 AC1 | Primeiro tick >=22h/<24h dentro do horário | T15, T17, T18, T37, T54 |
| REEN-01 AC2 | Impedir contato fora dos limites22h/24h | T15, T20, T37, T39, T54 |
| REEN-01 AC3 | Fora do horário aguarda tick ainda elegível | T15, T17, T54 |
| REEN-01 AC4 | Janela perdida registra omissão | T23, T41, T54 |
| REEN-01 AC5 | Excluir status/fase/opt-out/humano | T15, T16, T20, T28, T29, T54 |
| REEN-01 AC6 | Dado crítico ausente/ilegível impede contato | T3, T7, T15, T16, T18, T25 |
| REEN-01 AC7 | Não enviar template nesse caminho | T54, T67 |
| REEN-02 AC1 | Texto contextual por histórico/fatos atuais | T25, T46, T47 |
| REEN-02 AC2 | Retomar pendência sem repetir informação | T25, T46, T47, T68 |
| REEN-02 AC3 | Só leitura e única resposta | T47, T54 |
| REEN-02 AC4 | Sem preferências, agenda ou pipeline proativo | T47, T54 |
| REEN-02 AC5 | Falha/vazio/>4096 encerra preparação | T19, T33, T34, T38, T46, T47, T54 |
| REEN-02 AC6 | Texto real/autor agente/wamid na thread | T21, T34, T40, T59, T68 |
| REEN-02 AC7 | Turno proativo conserva lastInboundAt | T21, T27, T34, T54 |
| REEN-03 AC1 | Dois ticks produzem <=uma chamada | T18, T20, T34, T39, T54, T68 |
| REEN-03 AC2 | Revalidar todos os gates antes da chamada | T20, T34, T39 |
| REEN-03 AC3 | Inbound/reset/opt-out/humano anterior cancela | T16, T20, T27, T28, T29, T34 |
| REEN-03 AC4 | Resultado inconclusivo não reenvia | T33, T34, T39, T56, T68 |
| REEN-03 AC5 | Recusa explícita encerra episódio | T33, T34, T39 |
| REEN-03 AC6 | Falha pré-chamada retenta só preparação elegível | T18, T19, T34, T38, T54 |
| REEN-03 AC7 | Aceite sem registro repete só persistência | T21, T34, T40, T56, T68 |
| REEN-03 AC8 | Turno termina com episódio consumido | T4, T20, T21, T54, T56 |
| REEN-03 AC9 | Inbound real permite novo episódio | T17, T27, T30, T50 |
| REEN-04 AC1 | Sessão da âncora ignora apenas gap proativo | T24, T25, T26, T51 |
| REEN-04 AC2 | Teto50 e ordem cronológica | T24, T25, T26, T42, T51 |
| REEN-04 AC3 | Aceite e primeiro inbound <48h vinculam ponte | T21, T26, T27, T51 |
| REEN-04 AC4 | Cold start mantém sessão retomada ativa12h | T24, T26, T51, T68 |
| REEN-04 AC5 | Resposta >=48h não ganha ponte | T24, T26, T27, T51 |
| REEN-04 AC6 | Opt-out/reset invalidam ponte/memória | T24, T28, T29, T51, T63 |
| REEN-04 AC7 | Humanos atribuídos à equipe | T24, T25, T46, T51 |
| REEN-04 AC8 | Sem ponte corte >12h preservado | T24, T26, T51 |
| REEN-05 AC1 | Escalar >=48h pela atribuição existente | T22, T23, T41, T55 |
| REEN-05 AC2 | 48h desde inbound independe envio/horário | T15, T23, T55 |
| REEN-05 AC3 | Contexto mudou cancela escalada | T23, T27, T28, T41, T55 |
| REEN-05 AC4 | Motivo inclui resultado real | T23, T41, T55 |
| REEN-05 AC5 | Escalada concorrente única | T22, T23, T41, T68 |
| REEN-05 AC6 | Trava statusChangedBy humano | T23, T28, T41, T55 |
| PRECO-01 AC1 | Delivered regular/service/billable tarifável | T8, T9, T43, T58, T59, T68 |
| PRECO-01 AC2 | Delivered free_customer_service gratuito | T8, T9, T43, T58, T59, T68 |
| PRECO-01 AC3 | Delivered FEP gratuito separado | T8, T9, T43, T58, T59, T68 |
| PRECO-01 AC4 | Aceite/sent sem entrega pendente | T8, T10, T30, T31, T32, T58, T59 |
| PRECO-01 AC5 | Ausente/desconhecido/conflito indisponível | T8, T9, T58, T59 |
| PRECO-01 AC6 | Failed sem entrega não entregue | T8, T9, T58, T59 |
| PRECO-01 AC7 | Humano/agente/retomada mesmas regras | T10, T21, T27, T30, T31, T32, T52, T53, T59 |
| PRECO-01 AC8 | Outra categoria não consome franquia | T8, T11, T58 |
| PRECO-02 AC1 | Origem não autenticada não altera dados | T9, T43, T49, T67 |
| PRECO-02 AC2 | Correlação tenant/canal/wamid | T5, T7, T9, T10, T30, T31, T32, T52, T53 |
| PRECO-02 AC3 | Replay idempotente sem somar/duplicar | T8, T9, T10, T43, T49 |
| PRECO-02 AC4 | Sent atrasado preserva delivered/read | T8, T9, T43 |
| PRECO-02 AC5 | Status anterior correlaciona depois sem bolha | T9, T10, T21, T27, T30, T31, T32, T43 |
| PRECO-02 AC6 | Contradição persiste indisponível | T8, T9, T58, T59 |
| PRECO-02 AC7 | Status nunca passa por agente/inbound | T9, T48, T49, T68 |
| PRECO-02 AC8 | Vínculo desconhecido impede associação | T7, T9, T10, T43, T49 |
| USO-01 AC1 | Inicializa por consulta integral mês atual | T1, T7, T11, T12, T13, T44, T65 |
| USO-01 AC2 | Restante max(0,1000-V) | T11, T14, T57 |
| USO-01 AC3 | Excluir inbound/failed/template/FEP | T11, T12 |
| USO-01 AC4 | Snapshot substitui e não acumula | T6, T13, T44 |
| USO-01 AC5 | Webhook separado do agregado | T8, T11, T13 |
| USO-01 AC6 | Novo mês no fuso da conta | T1, T11, T13, T14, T57 |
| USO-01 AC7 | Vazio/parcial/inválido não publica saldo | T1, T11, T12, T13, T57 |
| USO-01 AC8 | Número/conta/fuso não confirmados indisponível | T1, T7, T11, T14, T57, T65 |
| USO-02 AC1 | Cadência máxima de uma consulta15min | T13, T44, T56 |
| USO-02 AC2 | Sem consulta concorrente mesmo canal/período | T2, T13, T44 |
| USO-02 AC3 | Período/queryEnd e horário sucesso separados | T6, T13, T14, T57 |
| USO-02 AC4 | >60min desatualizado e valor conhecido | T14, T57, T62 |
| USO-02 AC5 | Sem sucesso do mês indisponível sem barra | T13, T14, T57, T61, T62 |
| USO-02 AC6 | Timeout/429/permissão conserva snapshot válido | T12, T13, T14, T57 |
| USO-02 AC7 | Sempre estimado | T14, T57, T61, T62 |
| USO-02 AC8 | Resposta antiga não sobrescreve atual | T6, T13, T14, T44 |
| USO-03 AC1 | Admin/gestor consumo junto WhatsApp | T14, T57, T60, T61 |
| USO-03 AC2 | Resumo próximo composer para autorizado | T14, T57, T62 |
| USO-03 AC3 | Corretor só agregado da conversa autorizada | T14, T60, T62 |
| USO-03 AC4 | Conversa sem canal não usa outro número | T14, T57, T62 |
| USO-03 AC5 | Troca tenant/número atualiza contexto | T14, T60, T61, T62 |
| USO-03 AC6 | Texto acessível sem depender de cor | T57, T58, T61, T62 |
| USO-03 AC7 | Refresh reflete classificação da thread | T14, T59, T62 |
| USO-04 AC1 | Zero mostra aviso persistente | T57, T62 |
| USO-04 AC2 | Positivo mostra estimativa sem promessa | T57, T61, T62 |
| USO-04 AC3 | Unknown/stale explicita previsão indisponível | T14, T57, T62 |
| USO-04 AC4 | Zero mantém aviso durante envio/espera | T32, T57, T62, T68 |
| USO-04 AC5 | Sem modal/bloqueio por consumo | T32, T57, T62, T68 |
| USO-04 AC6 | Confirmação na mensagem independe previsão | T58, T59, T62, T68 |
| L14B-01 AC1 | Autorização em todas as fronteiras | T7, T9, T13, T14, T16, T17, T18, T20, T21, T23, T25, T26, T27, T28, T29, T30, T31, T32, T35, T36, T37, T38, T39, T40, T41, T42, T43, T44, T45, T60, T62 |
| L14B-01 AC2 | Resolver segredo/WABA/número no servidor | T1, T7, T12, T14, T43, T44, T60, T62 |
| L14B-01 AC3 | Persistir âncora/resultado/motivo/identidade | T4, T18, T20, T21, T23, T34 |
| L14B-01 AC4 | Falhas registradas sem tokens/conversa | T1, T9, T12, T13, T34, T56, T65, T67 |
| L14B-01 AC5 | Classificação segue mensagem sem raw permanente | T5, T9, T10, T27, T30, T31, T32, T63 |
| L14B-01 AC6 | Retenção >=30d sem apagar proteção/classificação | T63, T64 |
| L14B-01 AC7 | Analytics falha sem bloquear conversa/humano | T13, T14, T32, T57, T60, T62 |
| PROVA-01 AC1 | Remover ligação scheduler→geração→send quebra prova | T47, T54, T68 |
| PROVA-01 AC2 | Concorrência real no armazenamento | T18, T20, T23, T68 |
| PROVA-01 AC3 | 999/1000/1001/FEP/replay/mês | T8, T11, T43, T57, T68 |
| PROVA-01 AC4 | Prova conversacional22h/warm/cold/opt-out/humano | T47, T51, T54, T68 |
| PROVA-01 AC5 | Real autorizada evidencia antes de limpar | T67, T68 |
| PROVA-01 AC6 | Mudança compartilhada exige paridade/remedição | T46, T47, T66, T67, T68 |

## Task Granularity Check

Where contém um único artefato principal em cada tarefa; testes e generated são entregas auxiliares do mesmo resultado. Alterações de arquivo com mais de uma função permanecem coesas: projeção autorizada (T14), mutação/invalidação (T28) e modelo de correlação (T5).

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 arquivo: `scripts/whatsapp-account-preflight.ts` | ✅ Granular |
| T2 | 1 alteração de arquivo: `src/db/schema.ts` | ✅ Granular |
| T3 | 1 alteração de arquivo: `src/db/schema.ts` | ✅ Granular |
| T4 | 1 alteração de arquivo: `src/db/schema.ts` | ✅ Granular |
| T5 | 1 alteração de arquivo: `src/db/schema.ts` | ✅ Granular |
| T6 | 1 alteração de arquivo: `src/db/schema.ts` | ✅ Granular |
| T7 | 1 função: `src/server/whatsapp/channels.ts` | ✅ Granular |
| T8 | 1 função: `src/server/whatsapp/statuses.ts` | ✅ Granular |
| T9 | 1 função: `src/server/whatsapp/statuses.ts` | ✅ Granular |
| T10 | 1 função: `src/server/whatsapp/statuses.ts` | ✅ Granular |
| T11 | 1 arquivo: `src/server/whatsapp/analytics-contract.ts` | ✅ Granular |
| T12 | 1 função: `src/server/whatsapp/analytics.ts` | ✅ Granular |
| T13 | 1 função: `src/server/whatsapp/analytics.ts` | ✅ Granular |
| T14 | 1 arquivo: `src/server/data/whatsapp.ts` | ✅ Granular |
| T15 | 1 arquivo: `n8n/src/reengagement.mjs` | ✅ Granular |
| T16 | 1 função: `src/server/reengagement/agent-state.ts` | ✅ Granular |
| T17 | 1 função: `src/server/reengagement/repository.ts` | ✅ Granular |
| T18 | 1 função: `src/server/reengagement/repository.ts` | ✅ Granular |
| T19 | 1 função: `src/server/reengagement/repository.ts` | ✅ Granular |
| T20 | 1 função: `src/server/reengagement/repository.ts` | ✅ Granular |
| T21 | 1 função: `src/server/reengagement/repository.ts` | ✅ Granular |
| T22 | 1 função: `src/server/data/index.ts` | ✅ Granular |
| T23 | 1 função: `src/server/reengagement/repository.ts` | ✅ Granular |
| T24 | 1 alteração de arquivo: `n8n/src/session.mjs` | ✅ Granular |
| T25 | 1 função: `src/server/reengagement/context.ts` | ✅ Granular |
| T26 | 1 função: `src/server/reengagement/context.ts` | ✅ Granular |
| T27 | 1 função: `src/server/data/index.ts` | ✅ Granular |
| T28 | 1 alteração de arquivo: `src/server/data/index.ts` | ✅ Granular |
| T29 | 1 função: `src/server/integration/lgpd.ts` | ✅ Granular |
| T30 | 1 função: `src/server/integration/messages.ts` | ✅ Granular |
| T31 | 1 função: `src/server/data/index.ts` | ✅ Granular |
| T32 | 1 função: `src/server/chats/human-send.ts` | ✅ Granular |
| T33 | 1 alteração de arquivo: `src/server/whatsapp/cloud-api.ts` | ✅ Granular |
| T34 | 1 função: `src/server/reengagement/send.ts` | ✅ Granular |
| T35 | 1 endpoint: `app/api/v1/leads/[id]/agent-state/route.ts` | ✅ Granular |
| T36 | 1 endpoint: `app/api/v1/whatsapp/automation/candidates/route.ts` | ✅ Granular |
| T37 | 1 endpoint: `app/api/v1/leads/[id]/reengagement/prepare/route.ts` | ✅ Granular |
| T38 | 1 endpoint: `app/api/v1/leads/[id]/reengagement/[episodeId]/preparation-failure/route.ts` | ✅ Granular |
| T39 | 1 endpoint: `app/api/v1/leads/[id]/reengagement/[episodeId]/send/route.ts` | ✅ Granular |
| T40 | 1 endpoint: `app/api/v1/leads/[id]/reengagement/[episodeId]/acknowledgement/route.ts` | ✅ Granular |
| T41 | 1 endpoint: `app/api/v1/leads/[id]/reengagement/expire/route.ts` | ✅ Granular |
| T42 | 1 endpoint: `app/api/v1/leads/[id]/session-context/route.ts` | ✅ Granular |
| T43 | 1 endpoint: `app/api/v1/whatsapp/statuses/route.ts` | ✅ Granular |
| T44 | 1 endpoint: `app/api/v1/whatsapp/usage/sync/route.ts` | ✅ Granular |
| T45 | 1 arquivo: `docs/integration/openapi.yaml` | ✅ Granular |
| T46 | 1 arquivo: `n8n/src/reengagement-prompt.mjs` | ✅ Granular |
| T47 | 1 workflow: `n8n/workflows/reengagement-contextual.ts` | ✅ Granular |
| T48 | 1 arquivo: `n8n/src/whatsapp-events.mjs` | ✅ Granular |
| T49 | 1 alteração de workflow: `n8n/workflows/principal.ts` | ✅ Granular |
| T50 | 1 alteração de workflow: `n8n/workflows/principal.ts` | ✅ Granular |
| T51 | 1 alteração de workflow: `n8n/workflows/principal.ts` | ✅ Granular |
| T52 | 1 alteração de workflow: `n8n/workflows/tool-responder-lead.ts` | ✅ Granular |
| T53 | 1 alteração de workflow: `n8n/workflows/principal.ts` | ✅ Granular |
| T54 | 1 ramo de workflow: `n8n/workflows/scheduler.ts` | ✅ Granular |
| T55 | 1 ramo de workflow: `n8n/workflows/scheduler.ts` | ✅ Granular |
| T56 | 1 ramo de workflow: `n8n/workflows/scheduler.ts` | ✅ Granular |
| T57 | 1 componente: `src/components/whatsapp/usage-summary.tsx` | ✅ Granular |
| T58 | 1 componente: `src/components/chats/message-pricing.tsx` | ✅ Granular |
| T59 | 1 alteração de componente: `src/components/chats/message-thread.tsx` | ✅ Granular |
| T60 | 1 alteração de arquivo: `app/(crm)/configuracoes/page.tsx` | ✅ Granular |
| T61 | 1 alteração de componente: `src/components/settings/settings-form.tsx` | ✅ Granular |
| T62 | 1 alteração de arquivo: `app/(crm)/chats/page.tsx` | ✅ Granular |
| T63 | 1 função: `src/server/reengagement/retention.ts` | ✅ Granular |
| T64 | 1 função: `src/server/integration/lgpd.ts` | ✅ Granular |
| T65 | 1 arquivo: `scripts/reengagement-bootstrap.ts` | ✅ Granular |
| T66 | 1 alteração de arquivo: `scripts/document-context-benchmark.ts` | ✅ Granular |
| T67 | 1 arquivo: `scripts/reengagement-publication-check.ts` | ✅ Granular |
| T68 | 1 arquivo: `scripts/reengagement-proof.ts` | ✅ Granular |

## Diagram-Definition Cross-Check

Todas as dependências do corpo estão no diagrama completo, sem dependência futura nem ciclo. A ordem da fase também é um gate de execução.

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | None | ✅ Match |
| T2 | T1 | T1 | ✅ Match |
| T3 | T2 | T2 | ✅ Match |
| T4 | T3 | T3 | ✅ Match |
| T5 | T4 | T4 | ✅ Match |
| T6 | T5 | T5 | ✅ Match |
| T7 | T6, T1 | T6, T1 | ✅ Match |
| T8 | T7 | T7 | ✅ Match |
| T9 | T8, T5, T7 | T8, T5, T7 | ✅ Match |
| T10 | T9 | T9 | ✅ Match |
| T11 | T10, T1 | T10, T1 | ✅ Match |
| T12 | T11, T7, T1 | T11, T7, T1 | ✅ Match |
| T13 | T12, T6 | T12, T6 | ✅ Match |
| T14 | T13, T10 | T13, T10 | ✅ Match |
| T15 | T14 | T14 | ✅ Match |
| T16 | T15, T3 | T15, T3 | ✅ Match |
| T17 | T16, T4 | T16, T4 | ✅ Match |
| T18 | T17 | T17 | ✅ Match |
| T19 | T18 | T18 | ✅ Match |
| T20 | T19, T16 | T19, T16 | ✅ Match |
| T21 | T20, T10 | T20, T10 | ✅ Match |
| T22 | T21 | T21 | ✅ Match |
| T23 | T22, T17 | T22, T17 | ✅ Match |
| T24 | T23 | T23 | ✅ Match |
| T25 | T24, T16 | T24, T16 | ✅ Match |
| T26 | T25, T21 | T25, T21 | ✅ Match |
| T27 | T26, T10 | T26, T10 | ✅ Match |
| T28 | T27 | T27 | ✅ Match |
| T29 | T28 | T28 | ✅ Match |
| T30 | T29 | T29 | ✅ Match |
| T31 | T30, T10 | T30, T10 | ✅ Match |
| T32 | T31, T10 | T31, T10 | ✅ Match |
| T33 | T32 | T32 | ✅ Match |
| T34 | T33, T20, T21 | T33, T20, T21 | ✅ Match |
| T35 | T34, T16 | T34, T16 | ✅ Match |
| T36 | T35, T17 | T35, T17 | ✅ Match |
| T37 | T36, T18, T25 | T36, T18, T25 | ✅ Match |
| T38 | T37, T19 | T37, T19 | ✅ Match |
| T39 | T38, T34 | T38, T34 | ✅ Match |
| T40 | T39, T21 | T39, T21 | ✅ Match |
| T41 | T40, T23 | T40, T23 | ✅ Match |
| T42 | T41, T26 | T41, T26 | ✅ Match |
| T43 | T42, T9 | T42, T9 | ✅ Match |
| T44 | T43, T13 | T43, T13 | ✅ Match |
| T45 | T44, T30 | T44, T30 | ✅ Match |
| T46 | T45, T25 | T45, T25 | ✅ Match |
| T47 | T46 | T46 | ✅ Match |
| T48 | T47 | T47 | ✅ Match |
| T49 | T48, T43 | T48, T43 | ✅ Match |
| T50 | T49, T35, T30 | T49, T35, T30 | ✅ Match |
| T51 | T50, T42, T24 | T50, T42, T24 | ✅ Match |
| T52 | T51, T30 | T51, T30 | ✅ Match |
| T53 | T52, T30 | T52, T30 | ✅ Match |
| T54 | T53, T47, T36, T37, T38, T39, T40 | T53, T47, T36, T37, T38, T39, T40 | ✅ Match |
| T55 | T54, T41 | T54, T41 | ✅ Match |
| T56 | T55, T44, T40 | T55, T44, T40 | ✅ Match |
| T57 | T56, T14 | T56, T14 | ✅ Match |
| T58 | T57, T8, T14 | T57, T8, T14 | ✅ Match |
| T59 | T58 | T58 | ✅ Match |
| T60 | T59, T14 | T59, T14 | ✅ Match |
| T61 | T60, T57 | T60, T57 | ✅ Match |
| T62 | T61, T59, T32 | T61, T59, T32 | ✅ Match |
| T63 | T62, T23, T10, T13 | T62, T23, T10, T13 | ✅ Match |
| T64 | T63 | T63 | ✅ Match |
| T65 | T64, T7, T16, T50 | T64, T7, T16, T50 | ✅ Match |
| T66 | T65, T46 | T65, T46 | ✅ Match |
| T67 | T66, T49, T54, T55, T56 | T66, T49, T54, T55, T56 | ✅ Match |
| T68 | T67, T62 | T67, T62 | ✅ Match |

## Test Co-location Validation

Matriz aplicada por camada; testes não foram deslocados para outra tarefa. Testes de grafo/Code nodes são unit; locks/CAS/handlers de dados e RSC são integration com DB real, conforme as amostras e a spec.

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Scripts operacionais | unit | unit (8 cenários mínimos) | ✅ OK |
| T2 | Esquema/constraints | integration | integration (6 cenários mínimos) | ✅ OK |
| T3 | Esquema/constraints | integration | integration (6 cenários mínimos) | ✅ OK |
| T4 | Esquema/constraints | integration | integration (8 cenários mínimos) | ✅ OK |
| T5 | Esquema/constraints | integration | integration (7 cenários mínimos) | ✅ OK |
| T6 | Esquema/constraints | integration | integration (6 cenários mínimos) | ✅ OK |
| T7 | Serviço/repositório | integration | integration (9 cenários mínimos) | ✅ OK |
| T8 | Domínio/adapter puro | unit | unit (15 cenários mínimos) | ✅ OK |
| T9 | Serviço/repositório | integration | integration (10 cenários mínimos) | ✅ OK |
| T10 | Serviço/repositório | integration | integration (8 cenários mínimos) | ✅ OK |
| T11 | Domínio/adapter puro | unit | unit (14 cenários mínimos) | ✅ OK |
| T12 | Domínio/adapter puro | unit | unit (8 cenários mínimos) | ✅ OK |
| T13 | Serviço/repositório | integration | integration (12 cenários mínimos) | ✅ OK |
| T14 | DAL/mutação | integration | integration (12 cenários mínimos) | ✅ OK |
| T15 | Domínio puro | unit | unit (14 cenários mínimos) | ✅ OK |
| T16 | Serviço/repositório | integration | integration (10 cenários mínimos) | ✅ OK |
| T17 | Serviço/repositório | integration | integration (10 cenários mínimos) | ✅ OK |
| T18 | Serviço/repositório | integration | integration (10 cenários mínimos) | ✅ OK |
| T19 | Serviço/repositório | integration | integration (7 cenários mínimos) | ✅ OK |
| T20 | Serviço/repositório | integration | integration (14 cenários mínimos) | ✅ OK |
| T21 | Serviço/repositório | integration | integration (10 cenários mínimos) | ✅ OK |
| T22 | DAL/mutação | integration | integration (6 cenários mínimos) | ✅ OK |
| T23 | Serviço/repositório | integration | integration (12 cenários mínimos) | ✅ OK |
| T24 | Domínio puro | unit | unit (14 cenários mínimos) | ✅ OK |
| T25 | Serviço/repositório | integration | integration (9 cenários mínimos) | ✅ OK |
| T26 | Serviço/repositório | integration | integration (10 cenários mínimos) | ✅ OK |
| T27 | DAL/mutação | integration | integration (14 cenários mínimos) | ✅ OK |
| T28 | DAL/mutação | integration | integration (12 cenários mínimos) | ✅ OK |
| T29 | Serviço/repositório | integration | integration (7 cenários mínimos) | ✅ OK |
| T30 | Serviço/repositório | integration | integration (8 cenários mínimos) | ✅ OK |
| T31 | DAL/mutação | integration | integration (8 cenários mínimos) | ✅ OK |
| T32 | Serviço/repositório | integration | integration (8 cenários mínimos) | ✅ OK |
| T33 | Domínio/adapter puro | unit | unit (10 cenários mínimos) | ✅ OK |
| T34 | Serviço/repositório | integration | integration (12 cenários mínimos) | ✅ OK |
| T35 | Handlers | integration | integration (8 cenários mínimos) | ✅ OK |
| T36 | Handlers | integration | integration (8 cenários mínimos) | ✅ OK |
| T37 | Handlers | integration | integration (10 cenários mínimos) | ✅ OK |
| T38 | Handlers | integration | integration (7 cenários mínimos) | ✅ OK |
| T39 | Handlers | integration | integration (12 cenários mínimos) | ✅ OK |
| T40 | Handlers | integration | integration (8 cenários mínimos) | ✅ OK |
| T41 | Handlers | integration | integration (8 cenários mínimos) | ✅ OK |
| T42 | Handlers | integration | integration (9 cenários mínimos) | ✅ OK |
| T43 | Handlers | integration | integration (10 cenários mínimos) | ✅ OK |
| T44 | Handlers | integration | integration (9 cenários mínimos) | ✅ OK |
| T45 | Contrato OpenAPI | integration | integration (10 cenários mínimos) | ✅ OK |
| T46 | Domínio puro | unit | unit (10 cenários mínimos) | ✅ OK |
| T47 | Workflow/Code nodes | unit | unit (10 cenários mínimos) | ✅ OK |
| T48 | Domínio puro | unit | unit (12 cenários mínimos) | ✅ OK |
| T49 | Workflow/Code nodes | unit | unit (12 cenários mínimos) | ✅ OK |
| T50 | Workflow/Code nodes | unit | unit (10 cenários mínimos) | ✅ OK |
| T51 | Workflow/Code nodes | unit | unit (12 cenários mínimos) | ✅ OK |
| T52 | Workflow/Code nodes | unit | unit (8 cenários mínimos) | ✅ OK |
| T53 | Workflow/Code nodes | unit | unit (7 cenários mínimos) | ✅ OK |
| T54 | Workflow/Code nodes | unit | unit (14 cenários mínimos) | ✅ OK |
| T55 | Workflow/Code nodes | unit | unit (10 cenários mínimos) | ✅ OK |
| T56 | Workflow/Code nodes | unit | unit (9 cenários mínimos) | ✅ OK |
| T57 | Apresentação | unit | unit (10 cenários mínimos) | ✅ OK |
| T58 | Apresentação | unit | unit (8 cenários mínimos) | ✅ OK |
| T59 | Apresentação | unit | unit (8 cenários mínimos) | ✅ OK |
| T60 | RSC/DAL | integration | integration (7 cenários mínimos) | ✅ OK |
| T61 | Apresentação | unit | unit (7 cenários mínimos) | ✅ OK |
| T62 | RSC/DAL | integration | integration (12 cenários mínimos) | ✅ OK |
| T63 | Serviço/repositório | integration | integration (10 cenários mínimos) | ✅ OK |
| T64 | Serviço/repositório | integration | integration (7 cenários mínimos) | ✅ OK |
| T65 | Scripts operacionais | unit | unit (9 cenários mínimos) | ✅ OK |
| T66 | Scripts operacionais | unit | unit (7 cenários mínimos) | ✅ OK |
| T67 | Scripts operacionais | unit | unit (8 cenários mínimos) | ✅ OK |
| T68 | Prova integrada | integration | integration (12 cenários mínimos) | ✅ OK |

## Gates de encerramento e operação

1. Fechar cada fase com Build; gate reprovado impede conclusão. Registrar baseline/contagens, resultado do lint/build e erros de tipo anteriores separados. Falha anterior reconfirmada também exige resolução ou orientação explícita antes de concluir a fase; não declarar PASS nem pular o caso.
2. Depois de T68, Verifier novo independente (autor diferente), com spec/95ACs, evidências file:line, sensor discriminante e validação determinística. Não declarar PROVA-01 completo por fixture se faltar a evidência real aplicável.
3. Ativação posterior e específica: schema/handlers compatíveis antes dos callers; drenar execuções antigas; template B desativado; bootstrap com fase observada; status assinado e conta/canal/fuso/Analytics provados antes de saldo numérico.
4. Rollback conserva marcadores/tombstones e não restaura o template antigo. Limpeza não reabre episódio; banco/token/WhatsApp não são modificados pelo planejamento.
5. Higiene documental e handoff conforme AD-029 apenas ao encerrar o lote; atualizar todas as referências antes de arquivar tasks/evidências.

## Aprovação registrada

O usuário respondeu “Aprovo” à proposta de tarefas, ferramentas e agentes em lotes sequenciais, e solicitou o prompt para outra janela de contexto. Isso confirma a matriz/gates e permite os workers previstos, sem nova confirmação. Ações externas continuam sujeitas à autorização específica, com resultado concreto para revisão. Prompt e estratégia de retomada em [EXECUTE-PROMPT.md](EXECUTE-PROMPT.md).
