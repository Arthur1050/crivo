# Lote 6 — Agente de Qualificação n8n + WhatsApp · Specification

> Fase 8 do roadmap (AD-006: L6=[F8]). Contraparte externa do CRM: o consumidor real do contrato v1 (lote-5). PRD §6, §7.1, §7.3, §7.4, §7.5.

## Problem Statement

O CRM está completo e o contrato de integração está vivo em produção, mas nenhum consumidor real existe: as telas rodam sobre seed mockado (AD-004). Sem o fluxo do agente (n8n + WhatsApp), a Fase 9 (troca do mock pelo dado real) não pode começar e o produto não tem a sua função central — qualificar leads conversacionalmente no WhatsApp. Este lote constrói essa contraparte externa, de ponta a ponta, contra o número de teste da Meta.

## Goals

- [ ] Um lead (número de teste verificado) conversa com o agente no WhatsApp e o resultado — lead, mensagens, campos de qualificação, status, escalonamento, opt-out — aparece no CRM de produção sem nenhuma alteração de tela.
- [ ] Qualificação completa termina em reunião real: evento no Google Calendar com link do Meet + `meetingAt`/`status` no CRM.
- [ ] O fluxo é um artefato versionado e verificável: JSON no repo, sincronizado com a instância n8n, com testes/fixtures de contrato como evidência.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Números reais das imobiliárias / publicação do app Meta | Fase 9/piloto real; modo dev + número de teste cobre a Fase 8 |
| Embedded Signup (vincular número pelo CRM) | Productização SaaS pós-piloto (deferred, context.md) |
| Escolha de modelo LLM por tenant + créditos | Pós-piloto (AD-001); deferred |
| Substituição do seed mockado das telas do CRM | É a Fase 9 (L7), por definição do roadmap |
| Persistência de mídia recebida (comprovante de renda etc.) | Sem endpoint no contrato v1; comprovante é bônus nunca-bloqueante (PRD §6.4); deferred |
| RAG/banco vetorial, áudio/voz, lead scoring | Fora do v1 (PRD §3) |
| Rate limiting na API do CRM | Registrado no guia de integração §6 como evolução futura |
| Novas telas no CRM | Nenhuma tela nova; as únicas mudanças no repo do CRM são a extensão INT-09 e os campos de horário comercial na tela de Configurações existente (CONF-05) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Debounce de mensagens consecutivas do lead | Agrupar mensagens por ~10s antes de chamar o LLM (valor exato a critério do design) | Leads mandam várias mensagens curtas; 1 chamada LLM por rajada reduz custo e respostas trocadas | n (discretion) |
| Mídia recebida (imagem/áudio/doc) | Não persistir; agente agradece e redireciona para texto | Contrato v1 não tem upload de documento de lead; comprovante é bônus opcional (PRD §6.4) | y (context.md) |
| Conta Google do Calendar | Conta única do usuário para os 2 tenants na Fase 8 | Tenants são fictícios nesta fase; credencial por tenant fica para o piloto | y (context.md) |
| Timing do lembrete | 1h antes do `meetingAt` (config no fluxo) | "Próximo do dia e da hora" (usuário); 1h equilibra antecedência e proximidade | y (2026-08-05) |
| Lembrete fora da janela de 24h | Template message utility pré-aprovada no app Meta (`lembrete_reuniao`), com link do Meet | Regra da Meta: mensagem proativa >24h após a última mensagem do lead exige template | y (context.md) |
| Escolha do horário da reunião | Agente negocia dentro do **horário comercial configurado pelo tenant em Configurações** (CONF-05: dias de atendimento + janela início/fim; fallback seg–sex 9h–18h quando não configurado) e checa conflito no Calendar antes de confirmar | Decisão do usuário (2026-08-05): horário comercial é configuração da imobiliária no CRM, não constante do fluxo | y (2026-08-05) |
| Identificação do lead | `externalId` do lead = `wa_id` do contato; `externalId` da mensagem = id da mensagem WhatsApp | Recomendação explícita do guia de integração §2 | y (guia) |
| Mapeamento número→tenant | Tabela de config no fluxo: `phone_number_id` → tenant/API key (2 entradas de teste na Fase 8) | Webhook da Meta entrega `phone_number_id` por evento; é a chave natural de tenancy | y (discussão) |
| Idioma da conversa | pt-BR sempre | Clientes-piloto brasileiros | y (implícito PRD) |
| Fluxo ignora eventos de status da Meta (delivered/read) | Processa só `messages` recebidas; statuses são descartados sem erro | Contrato v1 não modela recibos; reduz ruído | y (2026-08-05) |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Lead entra em contato e aparece no CRM ⭐ MVP

**User Story**: Como gestor da imobiliária, quero que toda mensagem de WhatsApp de um lead vire lead + conversa no CRM automaticamente, para nunca perder um contato.

**Why P1**: É a ingestão — sem ela nenhuma outra história existe. Prova o caminho Meta → n8n → contrato v1.

**Acceptance Criteria**:

1. WHEN a Meta envia o GET de verificação do webhook (`hub.verify_token` correto) THEN o fluxo SHALL responder o `hub.challenge` e a Meta SHALL marcar o webhook como verificado.
2. WHEN chega um evento `messages` de um `phone_number_id` mapeado THEN o fluxo SHALL criar/recuperar o lead via `POST /api/v1/leads` com `externalId = wa_id` usando a API key do tenant correspondente, e registrar a mensagem via `POST /api/v1/leads/{id}/messages` com `externalId = id da mensagem` e `sender = "lead"`.
3. WHEN a Meta reentrega o mesmo evento (retry/duplicado) THEN o fluxo SHALL terminar sem erro e sem duplicar lead nem mensagem (idempotência do contrato, `200` na reentrega).
4. WHEN chega um evento de um `phone_number_id` NÃO mapeado THEN o fluxo SHALL descartar o evento sem chamar o CRM e sem falhar a execução.
5. WHEN o agente responde ao lead THEN a resposta enviada SHALL também ser registrada via `POST /leads/{id}/messages` com `sender = "agente"` — a thread no CRM espelha a conversa inteira.

**Independent Test**: Enviar mensagem do número de teste verificado → lead e mensagens visíveis no Kanban/Chats do CRM de produção; reenviar o mesmo payload via fixture → contagem inalterada.

---

### P1: Qualificação conversacional por modalidade ⭐ MVP

**User Story**: Como lead, quero conversar naturalmente (não preencher formulário) e, como gestor, quero os campos de qualificação preenchidos no CRM conforme a conversa avança.

**Why P1**: É o coração do produto (PRD §6.2–6.4, §7.1).

**Acceptance Criteria**:

1. WHEN a conversa inicia THEN o agente SHALL usar persona/nome e mensagem de apresentação do tenant (via `GET /api/v1/settings` — INT-09) e o contexto de documentos de `GET /api/v1/context` filtrado pela modalidade corrente da conversa.
2. WHEN o lead revela a modalidade de interesse (novo/usado/ambos) THEN o fluxo SHALL registrá-la via `PATCH /leads/{id}` e as perguntas seguintes SHALL seguir a lógica da modalidade (novo: financiamento com construtora/horizonte de obra; usado: financiamento bancário/FGTS/urgência de visita — PRD §6.3).
3. WHEN o lead fornece qualquer campo de qualificação (região, orçamento, tipo, horizonte, motivação, status de crédito, operação casada) THEN o fluxo SHALL persisti-lo via `PATCH /leads/{id}` em upsert parcial — somente as chaves recebidas, nunca sobrescrevendo o resto com null.
4. WHEN o agente decide a próxima pergunta THEN ela SHALL mirar somente campos ainda não preenchidos na memória/CRM — nunca reperguntar o que o lead já respondeu.
5. WHEN perguntado diretamente se é uma IA/robô THEN o agente SHALL não negar ser uma IA (instrução presente no system prompt — PRD §7.1/§7.5).
6. WHEN o lead envia várias mensagens em sequência rápida THEN o fluxo SHALL agrupá-las (debounce) e produzir uma única resposta.

**Independent Test**: Conversa roteirizada no número de teste cobrindo os 8 campos → colunas correspondentes preenchidas no banco/CRM; transcript sem pergunta repetida; pergunta "você é um robô?" → resposta não nega.

---

### P1: Agendamento com Calendar + Meet ⭐ MVP

**User Story**: Como corretor, quero que leads com qualificação completa virem reunião agendada no meu calendário com link do Meet, e como lead quero poder receber o convite no meu e-mail se eu quiser.

**Why P1**: É o desfecho de sucesso do funil (PRD §6.5); decisão explícita do usuário (Alternativa B detalhada).

**Acceptance Criteria**:

1. WHEN todos os campos obrigatórios de qualificação estão preenchidos THEN o agente SHALL propor agendamento dentro do horário comercial configurado do tenant (CONF-05, via `GET /api/v1/settings`; fallback seg–sex 9h–18h), checando conflito no Google Calendar antes de confirmar.
2. WHEN o lead confirma um horário THEN o fluxo SHALL criar evento no Calendar da conta configurada com link do Meet, e gravar via `PATCH /leads/{id}`: `meetingAt`, `executiveSummary` (resumo estruturado da conversa) e `status = "qualificado_agendado"` na mesma requisição.
3. WHEN o agente confirma o agendamento THEN ele SHALL perguntar se o lead quer o evento no calendário dele; IF sim THEN SHALL coletar o e-mail e adicioná-lo como convidado do evento; IF não THEN SHALL apenas confirmar dia/hora pelo WhatsApp — o e-mail nunca é obrigatório.
4. WHEN o comprovante de renda não foi enviado THEN o agendamento SHALL acontecer normalmente (bônus, nunca bloqueante — PRD §6.4).

**Independent Test**: Conversa completa no número de teste → evento verificável no Calendar (com `conferenceData`/Meet), lead na coluna "Qualificado e agendado" do Kanban com resumo executivo e `meetingAt` corretos.

---

### P1: Escalonamento para humano ⭐ MVP

**User Story**: Como gestor, quero que conversas que o agente não consegue qualificar cheguem ao CRM como "escalado para humano" com motivo e resumo — nunca um transcript bruto.

**Why P1**: Rede de segurança do funil (PRD §6.6–6.7); o CRM já exibe motivo/resumo desde o L3.

**Acceptance Criteria**:

1. WHEN o agente detecta condição de escalonamento (respostas incoerentes reiteradas, lead fora do perfil, hostilidade, pedido explícito de humano) THEN o fluxo SHALL executar `PATCH /leads/{id}` com `status = "escalado_humano"`, `escalationReason` específico e `executiveSummary` na mesma requisição.
2. WHEN o lead para de responder por 24h com qualificação incompleta THEN o fluxo SHALL enviar 1 única mensagem de reengajamento; IF sem resposta por mais 24h THEN SHALL escalar com motivo "ausência de resposta".
3. WHEN um lead já está `escalado_humano` e manda nova mensagem THEN o fluxo SHALL registrar a mensagem no CRM e SHALL NOT responder automaticamente nem tentar mudar status (humano assumiu a conversa).

**Independent Test**: Roteiro hostil/incoerente no número de teste → lead na coluna "Escalado" com motivo específico; nova mensagem depois → aparece no Chats sem resposta do agente.

---

### P1: Opt-out ponta a ponta no consumidor (LGPD) ⭐ MVP

**User Story**: Como lead, quando digo "SAIR"/"PARAR" quero nunca mais receber mensagem automática — e como Operadora, preciso registrar isso no CRM.

**Why P1**: Obrigação LGPD (PRD §7.4); o contrato coloca o dever de bloqueio explicitamente no consumidor (guia §4).

**Acceptance Criteria**:

1. WHEN o lead envia mensagem cujo conteúdo normalizado é opt-out ("SAIR", "PARAR", variações case/acento) THEN o fluxo SHALL chamar `POST /leads/{id}/opt-out`, registrar a mensagem recebida, enviar 1 única confirmação de descadastro e encerrar.
2. WHEN qualquer envio proativo for disparado (reengajamento, lembrete de reunião) THEN o fluxo SHALL consultar o estado do lead antes e SHALL NOT enviar se `optedOutAt` estiver preenchido.
3. WHEN um lead com opt-out manda nova mensagem espontânea THEN o fluxo SHALL registrá-la no CRM e SHALL NOT retomar a conversa automaticamente.

**Independent Test**: "SAIR" no número de teste → `optedOutAt` preenchido + indicador vermelho no CRM (já existente do L5) + confirmação única recebida; lembrete agendado para esse lead não dispara.

---

### P1: Workflow como código + extensão do contrato ⭐ MVP

**User Story**: Como desenvolvedor do produto, quero o fluxo versionado no repo e o contrato estendido com a leitura de settings (incluindo o horário comercial configurável pela imobiliária), para que a entrega seja reproduzível e verificável — não um artefato clicado numa UI.

**Why P1**: Decisão do usuário (área 6, Alternativa A); é o que torna o Verifier possível e a Fase 9 estável.

**Acceptance Criteria**:

1. WHEN o lote termina THEN o(s) workflow(s) SHALL existir como JSON em `n8n/` no repo, e o workflow publicado na instância SHALL ser gerado a partir desse artefato (sync documentado e reproduzível).
2. WHEN `GET /api/v1/settings` é chamado com API key válida THEN o CRM SHALL responder nome da imobiliária, `agentName`, `supportedModality`, `agentPresentationMessage` e o horário comercial (dias de atendimento + janela início/fim, `null` quando não configurado) do tenant da chave — e SHALL seguir todas as regras transversais do contrato (401 sem chave, problem+json, isolamento por chave) [INT-09].
3. WHEN o gestor edita o horário comercial na tela de Configurações (dias de atendimento + hora início/fim) THEN o CRM SHALL validar (início < fim, ≥1 dia selecionado quando janela preenchida), persistir no tenant e refletir o valor no `GET /api/v1/settings` [CONF-05].
4. WHEN o horário comercial não foi configurado pelo tenant THEN `GET /api/v1/settings` SHALL responder `null` nesses campos e o fluxo SHALL usar o fallback seg–sex 9h–18h [CONF-05].
5. WHEN `openapi.yaml` é validado THEN ele SHALL incluir o novo path `/settings` e continuar passando `SwaggerParser.validate()`.
6. WHEN os testes do repo rodam THEN fixtures de payloads da Meta (mensagem, duplicado, número desconhecido, opt-out) SHALL ter testes cobrindo o comportamento esperado da camada de decisão do fluxo.

**Independent Test**: `npx vitest run` verde incluindo testes de INT-09 e das fixtures; diff entre JSON do repo e workflow exportado da instância = vazio (ou script de sync acusa igualdade).

---

### P2: Lembrete de reunião com link do Meet

**User Story**: Como lead, quero receber uma mensagem próxima ao horário confirmando a reunião com o link do Meet.

**Why P2**: Aumenta comparecimento (KPI do piloto), mas o funil funciona sem ele.

**Acceptance Criteria**:

1. WHEN faltar ~1h para `meetingAt` de um lead `qualificado_agendado` THEN o fluxo SHALL enviar mensagem de confirmação com o link do Meet — via texto livre se dentro da janela de 24h da Meta, senão via template `lembrete_reuniao` aprovada.
2. WHEN o lead tem `optedOutAt` preenchido THEN o lembrete SHALL NOT ser enviado (reforço do LGPD-03 AC2).
3. WHEN o lembrete é enviado THEN ele SHALL ser registrado como mensagem do agente no CRM.

**Independent Test**: Agendar reunião de teste com `meetingAt` próximo → lembrete chega no número de teste com link; mensagem aparece no Chats.

---

### P2: Robustez do consumidor (409, falhas do CRM, erro operacional)

**User Story**: Como operador da plataforma, quero que o fluxo degrade com segurança quando o CRM rejeitar uma operação ou estiver fora, sem perder mensagens nem travar conversas.

**Why P2**: O contrato define as rejeições estruturadas (guia §3); o consumidor precisa honrá-las.

**Acceptance Criteria**:

1. WHEN um `PATCH` de status responde `409` (`transicao-invalida` ou `lead-travado-por-humano`) THEN o fluxo SHALL continuar a conversa sem repetir a transição e sem quebrar a execução — campos de qualificação e mensagens continuam sincronizando.
2. WHEN uma chamada ao CRM falha com `5xx`/timeout THEN o fluxo SHALL fazer retry com backoff (≥2 tentativas) antes de acionar o workflow de erro.
3. WHEN uma execução falha de forma não recuperável THEN um workflow de erro (Error Trigger) SHALL notificar por e-mail (credencial Gmail existente) com identificação da execução.

**Independent Test**: Fixture com lead travado por humano (movido no Kanban) → PATCH 409 → conversa segue e execução termina sem erro; simulação de CRM fora → e-mail de erro recebido.

---

## Edge Cases

- WHEN a Meta entrega eventos fora de ordem THEN as mensagens SHALL ser registradas com `sentAt` = timestamp do evento WhatsApp (a thread do CRM ordena por `sentAt`, guia §2).
- WHEN o lead envia mídia (áudio/imagem/documento) THEN o agente SHALL responder que segue por texto, sem persistir a mídia e sem falhar (assumption).
- WHEN chegam eventos `statuses` (delivered/read) THEN o fluxo SHALL descartá-los sem erro.
- WHEN o mesmo lead escreve para o mesmo número por dois tenants diferentes de teste THEN cada tenant SHALL ter seu próprio lead (isolamento por API key; `externalId` tem escopo por tenant).
- WHEN o opt-out chega no meio da negociação de agendamento THEN o opt-out SHALL vencer: nada mais é enviado, evento de Calendar não é criado.
- WHEN a memória do n8n está vazia mas o lead já existe no CRM (cold start) THEN o fluxo SHALL reconstruir o estado essencial pela resposta `200` do `POST /leads` idempotente antes de responder.
- WHEN a resposta do LLM não contém extração válida/parseável THEN o fluxo SHALL responder com pergunta de esclarecimento sem gravar campo nenhum no CRM (nunca gravar alucinação).

---

## Requirement Traceability

> Atualizado 2026-08-09 ao fechar o lote (AD-015 reduziu o escopo do smoke conversacional — ver `STATE.md`). "Verified" exige evidência citável (teste unitário, execução MCP, ou execução real); onde só existe evidência parcial/estrutural, isso está dito explicitamente — nunca "Verified" sem citação.

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| AGT-01 | P1: Ingestão (webhook→CRM) | T5,T6,T10,T12 | ✅ Verified — unit (`normalize-event.test.ts`, `gate.test.ts`) + MCP (exec 54 unmapped, exec 66 duplicado) + execução real (exec 404, round-trip completo, incl. AC5: registro da resposta do agente confirmado nesta mesma execução) |
| AGT-02 | P1: Qualificação por modalidade | T8 | ⚠️ Verified (nível unitário) — `prompt.test.ts`/`validate-llm.test.ts` cobrem ACs 2–4 (registro por `PATCH`, upsert parcial, nunca repergunta); persona/primeira pergunta confirmada na exec 404 real. **Sem prova de multi-turno ao vivo** cobrindo os 8 campos — deferido (AD-015) |
| AGT-03 | P1: Qualificação (memória/cold start) | T5,T10 | ✅ Verified — cold start via `POST /leads` idempotente é o mesmo contrato testado exaustivamente no lote-5 (INT-01); reconstrução de estado exercitada em execuções MCP |
| AGT-04 | P1: Agendamento Calendar+Meet | T10 | ❌ **Gap — deferido (AD-015)**. Bug de referência quebrada na rota `agendar` corrigido hoje (checkpoint node, commit `006e789`), mas **nenhuma execução real ou simulada da rota completa existe** — sem prova de evento no Calendar com Meet. Fix task natural do lote futuro que assumir o smoke |
| AGT-05 | P1: Escalonamento | T10 | ❌ **Gap — deferido (AD-015)**. Mesmo bug/mesmo fix (`006e789`) na rota `escalar` (`escalationReason`+`executiveSummary`); sem execução real ou simulada confirmando o desfecho no Kanban. Deferido junto com AGT-04 |
| AGT-06 | P2: Lembrete de reunião | T11 | ✅ Verified (nível MCP) — exec 61 confirma marcação de envio dentro da janela e discriminador de opt-out no nível de nó. Sem execução real (depende de AGT-04 estar provado ao vivo primeiro) |
| AGT-07 | P2: Robustez do consumidor | T10,T12 | ⚠️ Parcial — retry/backoff (≥2, `waitBetweenTries`) confirmado presente nos 9 HTTP nodes do CRM (T12); Error Trigger→Gmail provado com evidência **orgânica real** (exec 71/73, falha genuína da Graph API). Tratamento de `409` em PATCH é lógica inline não exercitada por um 409 real nesta sessão |
| AGT-08 | P1: Transparência + persona | T8 | ✅ Verified — teste de conteúdo do prompt (não nega ser IA, AC5) + nunca lista campo já preenchido (AC4); persona real confirmada na exec 404 ("Sou o Lucas, assistente virtual da Triângulo Imóveis...") |
| AGT-09 | P1: Workflow como código + fixtures | T9,T10,T11,T12 | ✅ Verified — 3 workflows em `n8n/workflows/*.ts` → `generated/` → publicados via MCP, diff nó-a-nó confirmado repetidamente ao longo da sessão (última confirmação formal: fechamento do T13) |
| INT-09 | P1: `GET /api/v1/settings` | T3,T4 | ✅ Verified — testes de integração (401/405/isolamento/nulls) + `SwaggerParser.validate()` + consumido de verdade pelo fluxo real (exec 404) |
| CONF-05 | P1: Horário comercial configurável | T1,T2 | ✅ Verified — testes de DAL/action + screenshot real (Claude in Chrome) + consumido pela camada `resolveBusinessHours` (testada) |
| LGPD-03 | P1: Opt-out ponta a ponta | T6,T11 | ⚠️ Verified por evidência em camadas (unit `detectOptOut`/`gate` + MCP exec 57/61 + sensor de discriminação estrutural provando "nenhum envio a opted-out"), **mas sem um "SAIR" real enviado pelo WhatsApp nesta sessão** — desfecho ponta-a-ponta ao vivo deferido (AD-015) |

**Coverage:** 12 total, 12 mapped to tasks (T1–T13), 0 unmapped. **9 Verified, 1 Verified-parcial-camada-única (AGT-02), 1 Parcial (AGT-07), 2 Gap-deferido (AGT-04, AGT-05)** — ver AD-015 para o porquê e o caminho de fechamento.

---

## Success Criteria

- [ ] ~~Smoke fim-a-fim real...~~ **Deferido (AD-015)** — não tentado nesta sessão; único desfecho real obtido foi 1 mensagem avulsa (exec 404), sem roteiro completo de qualificação/agendamento/escalonamento/opt-out
- [x] Reentrega de qualquer payload (fixture) não duplica nada no banco — idempotência do contrato provada no lote-5 (INT-01) + exec 66 (MCP, duplicado) confirma o comportamento na camada de decisão do fluxo
- [x] `npx vitest run` verde, `npm run lint` e `npm run build` verdes — confirmado no fechamento do T13 (ver commit de fechamento)
- [x] Workflow JSON no repo == workflow publicado na instância n8n — confirmado no fechamento do T13 (diff final dos 3 workflows)
- [x] Nenhum envio proativo a lead com `optedOutAt` preenchido — provado por teste discriminante estrutural (T11, exec 61); sem envio proativo real testado por não ter havido agendamento real (AGT-04 deferido)
