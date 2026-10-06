# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

### L-001 - When a spec criterion asserts an entity is left untouched by an unrelated update, add a before/after count or field assertion for it, not just a structural argument from the code's shape.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `server/data` · harmful: 0
- features: lote-2-configuracoes-documentos
- evidence: CONF-01.5 — spec.md; src/server/data/index.ts:195-209 (updateTenantSettings) (server/data)
- last seen: 2026-08-02T06:03:05Z

### L-002 - For a spec criterion about partial-write/atomicity on insert failure, add a fault-injection test (mock/force the insert to throw) rather than relying only on the insert being a single statement.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `server/data` · harmful: 0
- features: lote-2-configuracoes-documentos
- evidence: DOC-02.4 — spec.md; src/server/data/index.ts:219-238 (createDocument) (server/data)
- last seen: 2026-08-02T06:03:11Z

### L-003 - Computed presentation logic (deltas, comparisons, conditional fallback text) in UI components needs its own unit test even when the layer's default policy is build-gate-only, because build gates don't exercise conditional branches or numeric correctness.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `dashboard,ui` · harmful: 0
- features: lote-4-dashboard
- evidence: src/components/dashboard/kpi-tiles.tsx:100-118 (DASH-05 AC1-3) (dashboard,ui)
- last seen: 2026-08-02T20:53:06Z

### L-004 - Structural correctness of independent state sources (URL period + cookie tenant) still needs an integration or manual-verification artifact logged in validation.md, since 'the code can't possibly couple them' is not the same as evidence the combination was exercised.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `dashboard,tenant-isolation` · harmful: 0
- features: lote-4-dashboard
- evidence: app/(crm)/dashboard/page.tsx:46-48 (DASH-06 AC2) (dashboard,tenant-isolation)
- last seen: 2026-08-02T20:53:10Z

### L-005 - Quando um AC define o caso 'campo vazio', defina explicitamente tambem o caso 'campo ausente no payload' — payload parcial e payload vazio nao sao o mesmo estado e a implementacao escolhe sozinha se a spec calar.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec/acceptance-criteria` · harmful: 0
- features: redesign-crm-astryx
- evidence: RD-07 AC3 (spec/acceptance-criteria)
- last seen: 2026-08-03T03:56:01Z

### L-006 - Se um AC depende de uma condicao que o seed nunca produz (ex.: conversa cruzando a virada do dia), o smoke nao consegue observa-lo — planeje o dado de seed junto com o AC ou aceite de antemao que a evidencia sera so de teste unitario.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `db/seed` · harmful: 0
- features: redesign-crm-astryx
- evidence: RD-06 AC3 (db/seed)
- last seen: 2026-08-03T03:56:06Z

### L-008 - Componente de lib de terceiro (Recharts) embutido numa design system nao herda o tema: sem props de estilo explicitas ele renderiza no default claro. Trate cada ponto de integracao como superficie a tematizar, nao como caixa-preta.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `src/components/dashboard` · harmful: 0
- features: polimento-visual-astryx
- evidence: src/components/dashboard/volume-chart.tsx (src/components/dashboard)
- last seen: 2026-08-03T06:15:03Z

### L-009 - Inspecao de DOM prova token aplicado, nao composicao correta: so a captura de tela mostrou timestamps em ingles, grid de KPI 4+1 orfao e filtros desalinhados. Em trabalho de UI, screenshot e o gate, nao o DOM.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `ui/verificacao` · harmful: 0
- features: passada-visual-screenshots
- evidence: src/components/pipeline/pipeline-board.tsx (ui/verificacao)
- last seen: 2026-08-03T14:35:36Z

### L-010 - Design system de terceiro pode ter texto de UI cravado num idioma sem prop de locale nem chave de catalogo; antes de adotar um componente da lib num ponto visivel, verificar se ele EMITE string propria.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `@astryxdesign/core` · harmful: 0
- features: passada-visual-screenshots
- evidence: dist/Timestamp/Timestamp.js:117 (@astryxdesign/core)
- last seen: 2026-08-03T14:35:36Z

### L-011 - Before citing an MCP execution ID as evidence in spec.md, call get_execution to confirm it exists and shows the claimed outcome — do not cite from memory of a live debugging session.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `n8n-evidence` · harmful: 0
- features: lote-6-agente-n8n-whatsapp
- evidence: spec.md Requirement Traceability, AGT-01 row — cited 'exec 379' (get_execution confirmed not found in any of the 5 workflows in the instance) (n8n-evidence)
- last seen: 2026-08-09T04:21:49Z

### L-012 - When an acceptance criterion lists multiple prohibited/allowed sub-clauses in one sentence, write a dedicated assertion citing each sub-clause's exact text, not just the first clause of the sentence.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `n8n/src/prompt.mjs` · harmful: 0
- features: lote-6b-persona-e-lapidacao
- evidence: n8n/src/__tests__/prompt.test.ts:115-131 vs PER-01 AC1/AC2 (n8n/src/prompt.mjs)
- last seen: 2026-08-10T23:26:31Z

### L-013 - When a spec promises an active fallback message on exhausted retries/iterations, verify a real send path exists for it, not just a silent-registration flag - degrade-to-silence is a common unannounced substitution for degrade-to-message.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `n8n-agent` · harmful: 0
- features: lote-6c-agente-ai-agent-memoria-tools
- evidence: VOZ-03 AC4 / spec.md Edge Cases (maxIterations) - validation.md Finding 1 (n8n-agent)
- last seen: 2026-08-15T03:27:16Z

### L-014 - When a design.md function signature omits a parameter the spec's word choice implies (e.g. 'perguntado' vs 'confirmado'), document explicitly which weaker semantic was implemented and why a stronger one was structurally unreachable.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `n8n-agent` · harmful: 0
- features: lote-6c-agente-ai-agent-memoria-tools
- evidence: QLF-02 AC2/3 - validation.md spec-anchored table (n8n-agent)
- last seen: 2026-08-15T03:27:20Z

### L-015 - Before removing a shared configuration column or field, grep every workflow and module that reads it and migrate them all in the same change.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `n8n` · harmful: 0
- features: lote-7-dado-real-ponta-a-ponta
- evidence: SEC-01 AC2 - n8n/workflows/scheduler.ts:158 (execucao n8n 897: 401 nao-autenticado apos remocao de tenant_config.apiKey) (n8n)
- last seen: 2026-08-23T01:08:03Z

### L-016 - Record the verification run's evidence (execution id, status and response payload) in the report before archiving or deleting the scratch artifact that produced it - an archived n8n workflow makes its own executions unreadable, so cleanup destroys the only live proof of the fix.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `n8n` · harmful: 0
- features: lote-7-dado-real-ponta-a-ponta
- evidence: SEC-01 AC2 - execucao n8n 1649 no workflow scratch MuJojnEv7X0emzPT (get_execution e search_executions recusam: workflow arquivado) (n8n)
- last seen: 2026-08-23T02:43:24Z

### L-018 - Em conta unica multi-tenant, escrever desativacao como perda de acesso ao vinculo, nunca como recusa de login global.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `auth` · harmful: 0
- features: lote-8-usuarios-papeis-atribuicao
- evidence: src/server/__tests__/deactivate-actions.test.ts:526 (auth)
- last seen: 2026-08-28T00:13:19Z

### L-019 - Usar como valor de spec o identificador ja gravado no seed, nos testes e no contrato publicado, nunca um valor suposto no planejamento.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: lote-8-usuarios-papeis-atribuicao
- evidence: src/db/seed.ts:211 (spec)
- last seen: 2026-08-28T00:13:19Z

### L-020 - Quando o design manda estender um modulo cujo teste de pureza proibe imports, criar modulo irmao em vez de enfraquecer a assercao existente.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `src/lib` · harmful: 0
- features: lote-8-usuarios-papeis-atribuicao
- evidence: src/lib/__tests__/broker-assignment.test.ts:49 (src/lib)
- last seen: 2026-08-28T00:13:20Z

### L-021 - Server action nova sem consumidor de producao nao e feature entregue: grepar consumidores antes de marcar a task done.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `server-actions` · harmful: 0
- features: lote-8-usuarios-papeis-atribuicao
- evidence: src/server/actions/work-window.ts:38 (server-actions)
- last seen: 2026-08-28T00:13:20Z

### L-023 - When testing a retention/expiry cutoff, assert a fixture aged exactly at the boundary itself, not only one unit inside and one unit outside — a fence-post regression that shortens the window can leave both off-boundary assertions unchanged.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: lote-9-metricas-piloto
- evidence: src/server/data/index.ts:2375 purgeIntegrationRefusals RETENTION_MS — validation.md Discrimination Sensor mutation 4 (testing)
- last seen: 2026-08-30T13:31:12Z

### L-024 - When an agent's turn can only end successfully via an external send (e.g. a WhatsApp reply), verify that send can actually succeed against the isolated/discard test target before relying on that target for a pass/fail measurement — otherwise every run dies the same way regardless of the thing under test.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `n8n-agent-testing` · harmful: 0
- features: lote-10-modelo-alvo-e-prova-conversacional
- evidence: n8n/smoke/evidencia.md §12.1 (T9 SPEC_DEVIATION) (n8n-agent-testing)
- last seen: 2026-09-09T20:13:02Z

### L-025 - When a deterministic compliance gate keys off one exact trigger word or phrase, plan for and test natural-language paraphrases of the same user intent before smoke/production — real users phrase intent naturally far more often than they know the exact keyword.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `compliance,gate` · harmful: 0
- features: lote-10-modelo-alvo-e-prova-conversacional
- evidence: n8n/smoke/evidencia.md §16.4 (T15 SPEC_DEVIATION) (compliance,gate)
- last seen: 2026-09-09T20:13:02Z

### L-026 - Para cada ligação entre peças testadas isoladamente — disparo entre etapas de um fluxo, cada gatilho de uma recomputação, o ponto de entrada que chama uma função extraída — escrever um teste que falhe se a chamada for removida; peças verdes não provam que uma chama a outra.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: lote-12-conteudo-de-documentos
- evidence: tasks.md T30 (5ba0fdf) (testing) (+3 more)
- last seen: 2026-09-25T01:16:14Z

### L-027 - Fixture criada direto no banco pula as linhas que o caminho de produção cria junto (ex.: a intenção que referencia o documento por FK); para testar remoção, criar a fixture pelo caminho real ou com todas as linhas dependentes.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: lote-12-conteudo-de-documentos
- evidence: tasks.md T32 (18e9eca) (testing)
- last seen: 2026-09-25T01:16:14Z

### L-028 - Fixtures de prova conectada precisam atravessar os limiares do transporte (compressão, chunking, tamanho): arquivos todos abaixo de 1 KB esconderam que o Blob devolve ETag fraco para texto comprimido.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `connected-e2e` · harmful: 0
- features: lote-12-conteudo-de-documentos
- evidence: tasks.md T35 (4879205) (connected-e2e)
- last seen: 2026-09-25T01:16:15Z

### L-029 - Quando a interface traduz códigos gravados pelo backend, tipar a tabela de tradução pelo tipo exportado do backend (Record<Codigo, string>), para que código novo ou renomeado quebre a compilação em vez de cair na mensagem genérica.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `ui-contract` · harmful: 0
- features: lote-12-conteudo-de-documentos
- evidence: tasks.md T32 (bd6bb8f) (ui-contract)
- last seen: 2026-09-25T01:16:15Z

### L-030 - Todo limite configurável precisa de teste para o caso sem configuração e para o caso desatualizado: um return antecipado quando o limite falta vira ausência total de limite (falha aberta).
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `limits` · harmful: 0
- features: lote-12-conteudo-de-documentos
- evidence: tasks.md T34 (90c4258) (limits)
- last seen: 2026-09-25T01:16:15Z

### L-031 - Antes de desenhar uma fórmula de capacidade sobre um provedor externo, levantar os limites compartilhados da conta (tokens por minuto, requisições por minuto) e tratá-los como componente da fórmula, não só a janela do modelo.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `capacity` · harmful: 0
- features: lote-12-conteudo-de-documentos
- evidence: tasks.md T34, AD-031 (capacity)
- last seen: 2026-09-25T01:16:16Z

### L-032 - update_workflow via MCP grava uma versão rascunho: publicar com publish_workflow e conferir que versionId e activeVersionId coincidem antes de declarar a mudança em produção.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `n8n` · harmful: 0
- features: lote-12-conteudo-de-documentos
- evidence: tasks.md T33 (n8n)
- last seen: 2026-09-25T01:16:16Z

### L-033 - Nunca rodar dois processos de teste contra o mesmo banco descartável ao mesmo tempo; falhas de uma suíte rodando em paralelo com testes isolados não são evidência de defeito.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: lote-12-conteudo-de-documentos
- evidence: tasks.md T32 (suíte com 3 falhas espúrias) (testing)
- last seen: 2026-09-25T01:16:16Z

### L-034 - Every durable job that throws a retryable error needs an explicit terminal state after retries are exhausted, written by the workflow itself, with a test that drives retries to exhaustion.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `workflow/processing` · harmful: 0
- features: lote-12-conteudo-de-documentos
- evidence: DOCTXT-01 AC4; workflows/process-document.ts:22 (workflow/processing)
- last seen: 2026-09-26T02:11:10Z

### L-035 - Route tests that inject a mocked finder cannot prove tenant, state or expiry filtering; every tenant-scoped finder needs its own database test with a foreign-tenant row.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `routes,tenant-isolation` · harmful: 0
- features: lote-12-conteudo-de-documentos
- evidence: M5/M6 src/server/documents/repository.ts:32,45 (routes,tenant-isolation)
- last seen: 2026-09-26T02:11:11Z

### L-037 - Assert the production default of a safety-relevant policy constant; tests that build their own policy copy leave the shipped value unguarded.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `config/policy` · harmful: 0
- features: lote-12-conteudo-de-documentos
- evidence: M3 src/server/documents/context-ceiling.ts:70 (config/policy)
- last seen: 2026-09-26T02:11:11Z

### L-041 - Quando um AC fixa a precedência entre duas regras de roteamento, teste a entrada que satisfaz as duas ao mesmo tempo; se a suíte existente estiver congelada por outro AC, crie o teste num arquivo novo.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `n8n/gate,compliance` · harmful: 0
- features: lote-13-opt-out-linguagem-natural
- evidence: M8 n8n/src/gate.mjs:69-70; OPTKEY-01 AC3 (n8n/gate,compliance)
- last seen: 2026-09-30T00:32:10Z

### L-043 - Quando uma trava determinística passa a alterar o desfecho de uma decisão do modelo, emende o AC que prometia o desfecho original na mesma decisão, não só o design.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec,llm` · harmful: 0
- features: lote-13-opt-out-linguagem-natural
- evidence: OPTSEG-01 AC2 x decisão D3 (trava refineOptOutCategory) (spec,llm)
- last seen: 2026-09-30T00:32:11Z

### L-044 - No @n8n/workflow-sdk, .onError() liga o handler à saída 1; em nó de várias saídas (textClassifier, switch) ligue o erro pelo índice real com .output(n) e afirme essa aresta no toJSON().
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `n8n/sdk` · harmful: 0
- features: lote-13-opt-out-linguagem-natural
- evidence: design.md Risks (T2, rascunho hsYF9VXAbGKLCkIc); mutante M7 (n8n/sdk)
- last seen: 2026-09-30T00:32:11Z

### L-045 - O transporte do MCP do n8n converte escapes \uXXXX em caracteres, então update_workflow não grava byte a byte um regex com esse escape; prefira classes sem escape unicode no código inlinado ou registre a diferença como equivalência conferida.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `n8n/mcp` · harmful: 0
- features: lote-13-opt-out-linguagem-natural
- evidence: T16 decisão D6; validation.md gap 3 (n8n/mcp)
- last seen: 2026-09-30T00:32:11Z

### L-046 - Um classificador LLM sozinho não garante zero falso positivo estável em near-misses: meça com frases de controle que não entraram na calibração e trave deterministicamente o padrão residual depois do modelo.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `llm,medicao` · harmful: 0
- features: lote-13-opt-out-linguagem-natural
- evidence: T12-T12e: medições 2685, 2686, 2687 reprovadas; 2688 aprovada com trava (D1-D3) (llm,medicao)
- last seen: 2026-09-30T00:32:12Z

### L-047 - No Windows deste projeto, o Edit tool, o heredoc do Git Bash e o transporte do MCP convertem escapes de barra invertida (unicode e quebra de linha): edite trechos com escapes por script que monte a barra com chr(92) e confira o byte depois.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `tooling,windows` · harmful: 0
- features: lote-13-opt-out-linguagem-natural
- evidence: T13 tasks.md duplicado; D6; T20 (system-message.mjs e STATE.md) (tooling,windows)
- last seen: 2026-10-01T02:14:41Z

### L-048 - Mudança de comportamento pedida durante a prova real não termina no código: republique o agente, republique o benchmark que inlina o mesmo módulo, remeça o teto de contexto e refaça só os casos afetados do roteiro.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `n8n,agente,medicao` · harmful: 0
- features: lote-13-opt-out-linguagem-natural
- evidence: T18/T20, decisão D11 (execuções 2738/2744) (n8n,agente,medicao)
- last seen: 2026-10-01T02:14:41Z

### L-049 - Ao emendar um comportamento, varra todo critério que aprova ou reprova (ACs irmãos de outros requisitos e a barra de aprovação do roteiro), não só o AC do requisito emendado.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: lote-13-opt-out-linguagem-natural
- evidence: Verifier ciclo 3, F1 (roteiro §7) e F2 (OPTPROVA-01 AC2) (specs)
- last seen: 2026-10-01T02:14:42Z

### L-050 - Ao pôr uma fonte nova de fatos no contexto do agente (nota da equipe, documento, tool), revise as regras do system message que restringem de onde um fato pode vir; senão o agente lê a fonte e se recusa a usá-la.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `n8n,agente,system-message` · harmful: 0
- features: lote-14-humano-no-laco
- evidence: T40 caso 6b, execuções 2819/2828; emenda D12 (0688deb) (n8n,agente,system-message)
- last seen: 2026-10-02T05:49:47Z

### L-051 - Antes de uma prova real, confira se todo workflow envolvido está publicado (activeVersionId) e se há fila pendente que ele dispararia ao ser reativado, como lembretes antigos.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `n8n,smoke,scheduler` · harmful: 0
- features: lote-14-humano-no-laco
- evidence: T39: scheduler com activeVersionId nulo desde 2026-08-23; agenda_envios pendente do número de teste (n8n,smoke,scheduler)
- last seen: 2026-10-02T05:49:47Z

### L-052 - Teste de concorrência com Promise.all no mesmo pool não cria disputa real; para provar um compare-and-set, trave a linha numa transação separada e confirme os dois esperando em pg_stat_activity antes de liberar.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `server/data,concorrencia` · harmful: 0
- features: lote-14-humano-no-laco
- evidence: M6a — src/server/data/__tests__/human-send.test.ts:259 (server/data,concorrencia)
- last seen: 2026-10-02T05:49:47Z

### L-053 - Um teste de que um campo ficou igual precisa partir de um valor que o defeito não produziria; partir do mesmo valor que a escrita errada gravaria deixa o mutante vivo.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `server/data,testes` · harmful: 0
- features: lote-14-humano-no-laco
- evidence: M10b — src/server/data/__tests__/conversation-conduction.test.ts:120 (server/data,testes)
- last seen: 2026-10-02T05:49:47Z

### L-054 - Salve as capturas da prova real como arquivo versionado no momento em que são feitas: a limpeza entre cenários torna impossível refazê-las depois.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `smoke,evidencia,ui` · harmful: 0
- features: lote-14-humano-no-laco
- evidence: HUMPROVA-01 AC2 — validation.md ciclo 2, Lacuna 4 (smoke,evidencia,ui)
- last seen: 2026-10-02T05:49:48Z

### L-055 - Ao receber o trabalho de um worker, confira no diff se alguma asserção de teste existente mudou antes de aceitar; a proibição no prompt não basta.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `sub-agentes,testes` · harmful: 0
- features: lote-14-humano-no-laco
- evidence: Worker D, principal-modelo.test.ts 70/90 -> 73/95 (5a00dd8) (sub-agentes,testes)
- last seen: 2026-10-02T05:49:48Z

### L-056 - No WhatsApp, comprove canal de produção, tenant, fuso IANA e cobertura mensal da conta real antes de habilitar Analytics; resposta DAILY parcial de conta de teste não concede essa capacidade.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `whatsapp/analytics` · harmful: 0
- features: lote-14b-reengajamento-contextual
- evidence: validation.md G1/G4; USO-01 AC1 (whatsapp/analytics) (+1 more)
- last seen: 2026-10-06T13:35:40Z

### L-057 - Em provas conversacionais do agente, avalie o texto produzido pelo modelo efetivo contra pendência e fatos conhecidos; instruções de prompt e respostas de generate fake não provam coerência nem ausência de repergunta.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `n8n/agent` · harmful: 0
- features: lote-14b-reengajamento-contextual
- evidence: validation.md G2; REEN-02 AC1/AC2 (n8n/agent) (+1 more)
- last seen: 2026-10-06T13:35:41Z

### L-060 - Para testar recusa por identidade de ferramenta, use uma observação válida; um envelope inválido pode mascarar a remoção da allowlist.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `n8n` · harmful: 0
- features: lote-14b-reengajamento-contextual
- evidence: M5 / n8n/workflows/__tests__/reengagement-contextual.test.ts:91 (n8n)
- last seen: 2026-10-06T13:35:41Z

### L-061 - Ativação em produção é atômica por fluxo: nunca publique um workflow que desliga o comportamento antigo antes de o substituto estar publicado e conferido, e salve antes o JSON da versão publicada, porque o histórico do n8n pode já ter descartado a anterior.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `n8n,producao,ativacao` · harmful: 0
- features: lote-14b-reengajamento-contextual
- evidence: Scheduler gmIWxiRrHGIdtPub publicado 57705ac5 em 2026-10-06: template B desligado sem o B contextual; escalonamento 48h parado; rollback f1c4ac52 (n8n,producao,ativacao)
- last seen: 2026-10-06T16:06:45Z

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-017 - Confirmar a chave do rate limit nativo da biblioteca antes de escrever a AC: better-auth conta por IP e rota, nunca por identidade.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `auth` · harmful: 0
- features: lote-8-usuarios-papeis-atribuicao
- evidence: src/server/auth/config.ts:86 (auth)
- last seen: 2026-08-28T00:13:19Z

### L-039 - When a spec requires a refusal to identify an existing resource, assert the identifier reaches the user-facing response, not only the service result.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `ui/errors` · harmful: 0
- features: lote-12-conteudo-de-documentos
- evidence: DOCBIN-01 AC4; src/server/actions/documents.ts:186 (ui/errors)
- last seen: 2026-09-26T02:11:12Z

### L-042 - Um AC que só reafirma comportamento preexistente ainda precisa de uma tarefa com asserção própria; 'já funciona' não é evidência.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `spec,tasks` · harmful: 0
- features: lote-13-opt-out-linguagem-natural
- evidence: OPTKEY-01 AC3 (sem file:line) (spec,tasks)
- last seen: 2026-09-30T00:32:11Z

### L-058 - Mantenha o consumidor de status WhatsApp fechado até um probe instalado comprovar HMAC sobre raw-body, credencial e activeVersionId do forwarder; proofs de fixture não concedem autenticação de origem.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `whatsapp/statuses` · harmful: 0
- features: lote-14b-reengajamento-contextual
- evidence: validation.md G3; PRECO-01 AC1/AC2/AC3/AC6/AC7 (whatsapp/statuses) (+1 more)
- last seen: 2026-10-06T13:35:41Z

### L-059 - Nas tools HTTP do n8n, teste o tipo e a serialização exigidos pelo nó instalado, além do conteúdo decodificado dos filtros.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `n8n` · harmful: 0
- features: lote-14b-reengajamento-contextual
- evidence: T70 / n8n/workflows/reengagement-contextual.ts:29 (n8n)
- last seen: 2026-10-06T13:35:41Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
