# Lote 10 — Modelo alvo e prova conversacional: Specification

## Problem Statement

O agente conversacional roda hoje em `models/gemini-3.5-flash-lite`, e nenhum dos três desfechos que
justificam o produto — qualificar→agendar, escalar para humano, opt-out — tem prova de execução real
ponta a ponta. A AD-015 deferiu essa prova em 2026-08-09 até que a qualidade das respostas estivesse
madura; a decisão de trocar o modelo pela variante nano da OpenAI (motivada por qualidade percebida, não por
custo) chegou depois. Rodar o smoke no modelo antigo produziria uma prova que a própria troca
invalidaria — por isso o modelo vem primeiro e a prova vem depois, no mesmo lote.

## Goals

- [ ] Agente rodando `gpt-5.4-nano-2026-03-17` em produção, com tool calling reverificado nas 5 tools e a troca
      confinada a um único nó do workflow.
- [ ] Três conversas reais no WhatsApp registradas com evidência verificável (id de execução,
      captura do CRM, evento no Calendar), fechando AGT-04, AGT-05 e LGPD-03.
- [ ] AD-015 encerrada em `STATE.md` com veredito honesto sobre o que ficou provado e o que não.

## Out of Scope

Explicitamente excluído. Documentado para impedir scope creep.

| Feature | Reason |
| --- | --- |
| Tool nova (`buscar_imoveis`, `registrar_opt_out`) | Isolamento deliberado do lote: qualquer diferença observada no smoke tem que ser atribuível ao modelo. L11 e L13 |
| Mudança no gate determinístico (`n8n/src/gate.mjs`) | Mesmo isolamento; os 2 invariantes duros da AD-018 ficam intocados |
| Opt-out por linguagem natural | L13 — este lote prova só o caminho por palavra-chave exata |
| Redesenho da persona (AD-016) | Ajuste de prompt é permitido só como fix task pós-smoke reprovado, nunca redesenho de estilo |
| Composer humano no Chats | L14 — o cenário "escalar" prova a trava, não a resposta humana |
| Publicação do app Meta / números e destinatários reais | L15 — este lote opera só com números de teste homologados |
| Envio ativo de fallback de esclarecimento no estouro de `maxIterations` | Decisão: reconciliar a documentação com o comportamento real (silêncio), não construir o envio |
| Bateria de tool calling como suíte de regressão em CI | Este lote a roda uma vez, como gate de rollback |
| Automação da limpeza entre cenários (script no CRM + workflow n8n de reset) | Decisão do usuário (2026-09-05): a limpeza dos três alvos é feita à mão por ele. O lote entrega o checklist que nomeia os alvos, não o código que os apaga |

---

## Assumptions & Open Questions

Toda ambiguidade está resolvida ou registrada aqui — nada ficou silenciosamente indefinido.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Qual variante do modelo alvo | `gpt-5.4-nano-2026-03-17` — geração atual em vez do `gpt-5-nano` de 2025-08 que o roadmap nomeava, e snapshot datado em vez de alias flutuante | Decisão do usuário (2026-09-05) depois de a listagem real da conta OpenAI mostrar as duas gerações; alias flutuante destruiria a reprodutibilidade da prova conversacional | y |
| A troca de modelo é incondicional ou comparativa | Incondicional, com rollback nomeado: a bateria de tool calling roda antes do smoke; reprovou, volta para `models/gemini-3.5-flash-lite` e o smoke roda no Gemini com o motivo registrado | Evita fechar o lote com um agente pior e um smoke bonito, sem pagar o custo de um A/B conversacional cujo julgamento seria subjetivo | y |
| Barra de aprovação de cada cenário do smoke | O estado final no CRM, nunca o estilo da conversa; estilo vira observação e, se ruim, fix task | A AD-015 pede prova de desfecho; qualidade de fala não é critério binário e travaria o lote em julgamento subjetivo | y |
| O 2º número homologado é bloqueante | Não: fase condicional. Roda se o número estiver homologado na janela de Execute; se não, vira pendência nomeada sem segurar AGT-04/05/LGPD-03 | O prazo do painel Meta não é controlável, e o L15 já detém a publicação do app Meta | y |
| Como separar os 3 cenários, dado que `optedOutAt` e `escalado_humano` são terminais no gate | Checklist de limpeza no roteiro nomeando os três alvos (lead no CRM, linha de `conversa_estado`, sessão em `n8n_chat_histories`), executado à mão pelo usuário e confirmado antes do cenário seguinte | `gate.mjs:67-72` torna os dois estados terminais para o mesmo `waId`, e o lead é idempotente por `externalId` — sem reset, o 3º cenário nunca alcança o agente | y |
| Ajuste de prompt está no escopo | Sim, limitado: só como fix task depois de uma rodada de smoke reprovada, com desvio registrado, sem redesenhar a persona da AD-016 | O isolamento pedido pelo roadmap é sobre tool nova e gate, não sobre a redação do prompt; sem essa válvula o lote pode terminar com um agente que acerta o desfecho e fala pior | y |
| Item 2 do roadmap (divergência fonte × instância) | Absorvido pelo item 1: vira a checagem de paridade publicado == `n8n/generated/` antes de tocar o nó | Verificado: `principal.ts:1269` já declara `flash-lite`, alinhado no lote-8 T30 — a divergência descrita no roadmap não existe mais, e com a migração o nó Gemini desaparece | y |
| Item 5 do roadmap (VOZ-03 AC4) | Reconciliação documental: registrar o silêncio como comportamento aceito, sem construir o envio de fallback | O próprio roadmap decide "doc, não código"; o comportamento real é a degradação mais segura e já está coerente com o `design.md` do lote-6c | y |
| Tenant e alvo da bateria de tool calling | `triangulo` (único com `tenant_config` populada), sobre um lead de descarte com `waId` fictício — nunca o número do smoke | Mesmo tenant do smoke elimina uma variável entre bateria e prova; o lead de descarte impede que a bateria trave o lead do roteiro | n |
| Cobertura de modalidade (novo/usado, AD-003) no roteiro | Os 3 cenários não precisam cobrir as duas modalidades | O caminho de qualificação é o mesmo; modalidade muda o contexto injetado, não o desfecho que este lote prova | n |
| Parâmetros do nó `lmChatOpenAi` (temperature, reasoning) | Resolvidos no Design contra o schema real do nó via MCP: `model` como resource locator, sem `temperature`, `reasoningEffort: "low"`, `timeout: 120000` | A família GPT-5 pode não aceitar temperatura arbitrária — é lookup, não decisão de produto, e inventar campo quebraria a publicação | n |
| Onde vive o roteiro do smoke | `n8n/smoke/roteiro.md`, versionado no repositório | Artefato reusável na próxima troca de modelo, coerente com a disciplina workflow-as-code da AD-014 | n |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Modelo alvo em produção ⭐ MVP

**User Story**: Como dono do produto, quero o agente rodando `gpt-5.4-nano-2026-03-17` com tool calling
reverificado, para que a prova conversacional valha para o modelo que de fato vai ao piloto.

**Why P1**: O smoke é o artefato de evidência da qualidade do agente. Rodá-lo antes da troca
produziria uma prova que a troca invalida — a ordem é a razão de ser do lote.

**Acceptance Criteria**:

1. WHEN `n8n/workflows/principal.ts` for publicado THEN o nó de modelo do AI Agent SHALL ser `@n8n/n8n-nodes-langchain.lmChatOpenAi` apontando para `gpt-5.4-nano-2026-03-17` com a credencial `OpenAI account`, e nenhum nó `lmChatGoogleGemini` SHALL permanecer no workflow.
2. The system SHALL confinar a troca a esse único nó — as 5 tools, o gate `n8n/src/gate.mjs` e a memória `memoryPostgresChat` SHALL permanecer sem alteração funcional.
3. WHEN a bateria de tool calling rodar sobre um lead de descarte THEN cada uma das 5 tools (`registrar_qualificacao`, `escalar_para_humano`, `consultar_documentos`, `responder_lead`, `agendar_reuniao`) SHALL registrar pelo menos uma chamada bem-sucedida, com o id da execução anotado.
4. IF `registrar_qualificacao` receber `400 payload-invalido` por enum inválido durante a bateria THEN o agente SHALL prosseguir o turno sem travar, repetindo o comportamento observado na execução 462.
5. IF a bateria não satisfizer os critérios 3 ou 4 THEN o nó de modelo SHALL ser revertido para `models/gemini-3.5-flash-lite` e o motivo SHALL ser registrado antes de qualquer cenário do smoke começar.
6. WHEN o workflow publicado for comparado a `n8n/generated/principal.ts` antes da troca THEN a paridade SHALL ser confirmada nó a nó, ou a divergência SHALL ser registrada antes de qualquer publicação nova.

**Independent Test**: publicar a troca e rodar a bateria via MCP sobre o lead de descarte — as 5
tools aparecem com chamada bem-sucedida nos dados de execução, sem tocar o lead do roteiro.

---

### P1: Prova conversacional dos três desfechos ⭐ MVP

**User Story**: Como dono do produto, quero três conversas reais no WhatsApp com evidência
registrada, para que AGT-04, AGT-05 e LGPD-03 deixem de ser promessa e a AD-015 possa ser encerrada.

**Why P1**: São os três desfechos que sustentam o piloto. Sem eles, o produto está pronto no papel e
nunca foi exercitado por uma conversa de verdade.

**Acceptance Criteria**:

1. The system SHALL ter um roteiro versionado em `n8n/smoke/roteiro.md` descrevendo os três cenários, os turnos esperados de cada um e o estado final exigido.
2. WHEN o cenário "qualificar→agendar" for executado por conversa real THEN o lead SHALL terminar com `status = reuniao_agendada` no CRM e um evento com link do Google Meet SHALL existir no calendário do tenant.
3. WHEN o cenário "escalar" for executado por conversa real THEN o lead SHALL terminar com `status = escalado_humano` e responsável atribuído, e a mensagem seguinte do lead SHALL ser registrada sem nenhuma resposta do agente.
4. WHEN o cenário "opt-out por palavra-chave" for executado por conversa real THEN o lead SHALL terminar com `optedOutAt` preenchido, a sessão correspondente em `n8n_chat_histories` SHALL estar purgada, e nenhuma mensagem SHALL ser enviada ao lead depois disso.
5. The system SHALL registrar, para cada cenário, o id da execução n8n e a captura da tela do CRM, e — no cenário de agendamento — o link do evento no Google Calendar.
6. WHEN um cenário terminar THEN o roteiro SHALL apresentar um checklist de limpeza nomeando os três alvos (o lead do smoke no CRM, a linha correspondente de `conversa_estado` e a sessão em `n8n_chat_histories`), e as três limpezas SHALL ser confirmadas antes de o cenário seguinte começar.
7. The system SHALL avaliar cada cenário pelo estado final exigido, nunca pelo estilo da conversa; observações de estilo SHALL ser registradas sem reprovar o cenário.
8. IF o estado final exigido de um cenário não for atingido THEN o cenário SHALL ser registrado como reprovado com o motivo, e uma fix task SHALL ser aberta antes de o requisito correspondente ser marcado Verified.

**Independent Test**: enviar as mensagens do roteiro pelo número de teste e conferir, no CRM, os
três estados finais — cada um com id de execução e captura correspondentes.

---

### P2: Rastreabilidade honesta do que o agente faz

**User Story**: Como quem vai manter este produto, quero que a documentação descreva o comportamento
real do agente, para que a próxima pessoa não persiga um fallback que nunca existiu.

**Why P2**: Não muda comportamento em produção, mas fecha o Finding 1 do Verifier do lote-6c e uma
dívida de README já confirmada obsoleta.

**Acceptance Criteria**:

1. WHEN o estouro de `maxIterations` sem chamada de `responder_lead` for documentado THEN o `spec.md` do lote-6c SHALL declarar o silêncio como comportamento aceito, em VOZ-03 AC4 e na seção Edge Cases, e o Finding 1 do `validation.md` SHALL ser marcado como resolvido por reconciliação documental.
2. The system SHALL NOT introduzir nenhum envio de fallback de esclarecimento — a reconciliação é exclusivamente documental.
3. WHEN o `n8n/README.md` §4 for corrigido THEN o texto SHALL registrar que o guard de `src/db/index.ts` (`process.env.VITEST` → `TEST_DATABASE_URL`) já neutraliza a rotação de chaves por `vitest run`, sem apagar o histórico do incidente original.

**Independent Test**: reler os três documentos e confirmar que nenhum promete comportamento que o
código não tem.

---

### P3: Multi-tenancy real exercitada no smoke

**User Story**: Como dono do produto, quero um segundo número homologado apontando para o Vale do
Uberaba, para que o isolamento entre imobiliárias seja provado por conversa real, e não só por teste.

**Why P3**: Depende de homologação no painel da Meta, cujo prazo não controlamos. Vale muito, mas não
pode segurar os três desfechos.

**Acceptance Criteria**:

1. WHERE um segundo número estiver homologado no app Meta dentro da janela de Execute, o sistema SHALL ter uma linha de `tenant_config` mapeando esse `phoneNumberId` para `vale-uberaba`.
2. WHERE essa linha existir, o cenário "qualificar→agendar" SHALL ser repetido no segundo número e o lead resultante SHALL nascer no tenant `vale-uberaba`, sem tocar nenhum lead de `triangulo`.
3. IF o segundo número não estiver homologado até o fechamento do lote THEN MTN-01 SHALL ser registrado como pendência nomeada e SHALL NOT bloquear o fechamento de AGT-04, AGT-05 ou LGPD-03.

**Independent Test**: mandar a primeira mensagem no segundo número e confirmar que o lead aparece
sob `vale-uberaba` no CRM, com o lead de `triangulo` intocado.

---

## Edge Cases

- IF a credencial `OpenAI account` falhar por chave inválida ou quota durante a bateria THEN o lote SHALL parar antes de publicar a troca e SHALL reportar a falha, nunca seguir para o smoke com o modelo pela metade.
- IF o nó `lmChatOpenAi` não aceitar algum parâmetro herdado do nó Gemini THEN o Design SHALL fixar apenas os campos suportados pelo schema real do nó, e nenhum campo SHALL ser inventado.
- IF a limpeza entre cenários for parcial (por exemplo, lead apagado mas memória não purgada) THEN o cenário seguinte SHALL NOT começar até os três alvos estarem confirmados como limpos.
- WHEN o lead do smoke for apagado THEN nenhum outro dado dos tenants-piloto SHALL ser afetado, e o cenário seguinte SHALL partir de memória vazia.
- IF o agente estourar `maxIterations` durante um cenário do smoke THEN o turno SHALL terminar em silêncio, comportamento aceito por DOC-01, e isso SHALL NOT reprovar o cenário desde que o estado final exigido seja atingido.
- IF `npx vitest run` for executado depois da sincronização das chaves THEN as chaves usadas pelo fluxo SHALL ser reconferidas antes do smoke, conforme o procedimento do `n8n/README.md` §4.
- WHEN o cenário de opt-out terminar THEN o lead SHALL permanecer com `optedOutAt` preenchido até o reset, e nenhum reenvio SHALL ser disparado pelo scheduler nesse intervalo.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| MOD-01 | P1: Modelo alvo em produção | Design | Pending |
| MOD-02 | P1: Modelo alvo em produção | Design | Pending |
| MOD-03 | P1: Modelo alvo em produção | Design | Pending |
| SMK-01 | P1: Prova conversacional dos três desfechos | Design | Pending |
| SMK-02 | P1: Prova conversacional dos três desfechos | Design | Pending |
| SMK-03 | P1: Prova conversacional dos três desfechos | Design | Pending |
| SMK-04 | P1: Prova conversacional dos três desfechos | Design | Pending |
| SMK-05 | P1: Prova conversacional dos três desfechos | Design | Pending |
| SMK-06 | P1: Prova conversacional dos três desfechos | Design | Pending |
| DOC-01 | P2: Rastreabilidade honesta do que o agente faz | Design | Pending |
| DOC-02 | P2: Rastreabilidade honesta do que o agente faz | Design | Pending |
| MTN-01 | P3: Multi-tenancy real exercitada no smoke | Design | Pending |

**Coverage:** 12 total, 12 mapeados a critérios, 0 sem mapeamento.

### Mapa de cobertura — requisito, critérios e dívida que fecha

| Requisito | Cobre | Fecha |
| --- | --- | --- |
| MOD-01 | P1-modelo AC1, AC2 | Roadmap L10 item 1 (troca do nó) |
| MOD-02 | P1-modelo AC3, AC4, AC5 | Roadmap L10 item 1 (reverificação de tool calling) e o critério de rollback |
| MOD-03 | P1-modelo AC6 | Roadmap L10 item 2 (paridade fonte ↔ instância) |
| SMK-01 | P1-smoke AC1 | Roteiro exigido pela AD-015 |
| SMK-02 | P1-smoke AC2 | AGT-04 (lote-6) |
| SMK-03 | P1-smoke AC3 | AGT-05 (lote-6) |
| SMK-04 | P1-smoke AC4 | LGPD-03 ponta a ponta (lote-6) |
| SMK-05 | P1-smoke AC5, AC6 | Evidência e checklist de limpeza — condição para os três cenários coexistirem |
| SMK-06 | P1-smoke AC7, AC8 | Barra de aprovação por desfecho |
| DOC-01 | P2 AC1, AC2 | Roadmap L10 item 5 / lote-6c `validation.md` Finding 1 |
| DOC-02 | P2 AC3 | Roadmap L10 item 6 |
| MTN-01 | P3 AC1, AC2, AC3 | Roadmap L10 item 4 (condicional) |

---

## Success Criteria

- [ ] Uma mensagem real no WhatsApp produz resposta do agente rodando `gpt-5.4-nano-2026-03-17`, com id de execução registrado.
- [ ] Os três desfechos existem no CRM, cada um com captura de tela e id de execução.
- [ ] Um evento com link do Google Meet foi criado no Calendar por uma conversa real, não por fixture.
- [ ] AD-015 encerrada em `STATE.md`, com registro honesto do que ficou provado e do que não.
- [ ] AGT-04, AGT-05 e LGPD-03 com veredito atualizado na rastreabilidade do lote-6.
- [ ] Nenhuma tool nova e nenhuma linha de `n8n/src/gate.mjs` alterada ao fim do lote.
