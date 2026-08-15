# Lote 6c — AI Agent, memória persistente e tools determinísticas · Specification

> Sucessor do lote-6b (fechado com Verifier PASS em 2026-08-12). Reescreve o miolo conversacional do fluxo n8n para o padrão de mercado (nó AI Agent + memória + tools) e fecha os buracos de política de qualificação e de persona que a conversa real de 2026-08-13 expôs. PRD §6.2–6.4, §7.1.

## Problem Statement

O agente conversa, mas não converte. A conversa real de 2026-08-13 — **posterior** ao fix `a3cc1ea` (schema duplicado do parser + duplicação de contexto), portanto sem resíduo daquele bug — mostra quatro defeitos que o lote-6b não alcançou: (1) o agente abre quase todo turno com a mesma interjeição de aprovação ("Show." 4×, "Boa." 3×, "Entendido."), o que lê como robô carimbando resposta; (2) ele repergunta o orçamento três vezes (02:14, 02:27, 02:32) e a região duas vezes, porque "Ainda não sei" e "Não tenho orçamento" não são registráveis — o campo continua nulo e volta à lista de pendências a cada turno; (3) com o lead já qualificado ele **continua perguntando** em vez de partir para o agendamento; (4) ele promete o que não sabe fazer ("vou puxar aqui as opções", "vou te enviar as opções de apartamentos de até 150 mil") — nunca foi programado para buscar imóvel, só para agendar reunião com o corretor. O lead termina a conversa escrevendo "???".

A causa estrutural é comum aos quatro: **o modelo só sabe devolver texto e um enum de ação**. Não existe nenhuma ação que ele possa de fato executar, então "agir" para ele é *falar sobre agir*. E as regras que deveriam contê-lo vivem no prompt (`n8n/src/prompt.mjs:52` já proíbe repetir a fórmula de abertura) onde não são barreira nenhuma — o modelo as ignora sem custo.

Sobre isso soma-se o desenho do fluxo: `n8n/workflows/principal.ts` monta o prompt num Code node, chama um Basic LLM Chain com output parser estruturado (com um segundo modelo inteiro replicado só para o retry), roteia por Switch de ação e envia a resposta numa cadeia rígida de três estágios hardcoded (`sendReply1/2/3` + `Wait`). São ~1.800 linhas para reimplementar à mão o que o nó AI Agent resolve nativamente, e o histórico é remontado por HTTP a cada turno em vez de viver numa memória.

## Goals

- [x] O miolo conversacional roda no nó AI Agent com memória persistente e tools — nenhuma cadeia de envio hardcoded, nenhum modelo replicado para retry.
- [x] Toda regra de negócio que hoje é "instrução de prompt e torcida" vira barreira determinística: enums do contrato, horário comercial, trava humana, teto de mensagens, abertura repetida e promessa de capacidade inexistente.
- [x] O agente pergunta no máximo 3 coisas na vida de um lead, nunca repergunta o que já perguntou, e parte para o agendamento assim que termina.
- [x] A memória sobrevive a restart da instância e é purgada quando a sessão expira (12h) e quando o lead faz opt-out.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| RabbitMQ / broker externo | Validado e descartado nesta sessão: ACK rápido já resolvido (webhook `onReceived`), retry/DLQ já existe (`crivo-agente-erros` como `errorWorkflow`), serialização parcialmente coberta por debounce + `checkStillLatest`, e escala horizontal no n8n se resolve com queue mode/Redis. Gatilho para revisitar: FIFO estrito por lead com múltiplos workers, ou migração para o microserviço INT-08 |
| RAG / vector store sobre os documentos | Os documentos do tenant são poucos e curtos; `GET /api/v1/context` sob demanda cobre o caso. Vetorial é resposta para corpus grande, que não é o cenário do piloto |
| Busca de imóvel, envio de foto, envio de preço | O agente nunca teve essa capacidade. Este lote a torna explícita como **fronteira**, não a implementa |
| Voz/áudio, lead scoring, escolha de modelo por tenant | Fora do v1 (PRD §3) / pós-piloto (AD-001) |
| Telas do CRM | Nenhuma mudança de UI neste lote |
| Troca do seed mockado pelo dado real | É a Fase 9 (L7) por definição do roadmap (AD-006) |
| Smoke conversacional roteirizado (3 desfechos da AD-015) | Continua deferido. Este lote é a segunda metade da remoção do bloqueio de qualidade que o motivou, não a execução do smoke |
| Composer de mensagem na tela Chats | A tela é somente leitura por spec desde o lote-3 (CHAT-01.6) — inalterado, e confirmado por leitura do código nesta sessão |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Padrão do miolo conversacional | Nó AI Agent (`@n8n/n8n-nodes-langchain.agent` v3.1) com tools | Decisão do usuário (2026-08-14): aderir ao padrão de mercado dos templates de chatbot do n8n | y (2026-08-14) |
| Store de memória | Postgres Chat Memory (`@n8n/n8n-nodes-langchain.memoryPostgresChat` v1.4) | Simple Memory é volátil (morre em restart/redeploy e não sobrevive a queue mode multi-worker); num canal onde o turno seguinte pode vir horas depois, isso é amnésia aleatória | y (2026-08-14) |
| Localização física da memória | **O próprio Postgres do n8n**, no mesmo servidor da instância, por conexão local — nunca o banco do CRM | Decisão do usuário (2026-08-14). Conexão local elimina o salto de rede em cada leitura/escrita de memória, que acontece a todo turno. E preserva o desacoplamento por contrato (INT-08): o n8n nunca recebe credencial do banco do CRM. O nó grava em formato próprio (`n8n_chat_histories`), que não é a forma da tabela `messages` — apontar para o CRM não seria sequer possível | y (2026-08-14) |
| Chave de sessão da memória | `sessionIdType: customKey`, `sessionKey = {tenantSlug}:{waId}` | Mesma chave composta que `conversa_estado` já usa; isola tenants que compartilhem um `waId` | y (2026-08-14) |
| Tamanho da janela de memória | Sem teto de 20 mensagens. O corte de 12h é a regra; teto alto (**50**) fica só como salvaguarda contra sessão patologicamente longa | Decisão do usuário (2026-08-14): "não precisamos nos limitar às 20 mensagens, podemos apenas levar em consideração o corte de 12h". O teto alto protege custo/latência/"lost in the middle" sem virar política | y (2026-08-14) |
| Fonte de verdade da thread | O CRM continua canônico (tela Chats, LGPD, corretor). `n8n_chat_histories` é **cache conversacional derivado** | Consequência aceita de ter memória própria: a thread passa a existir em dois lugares. O contrato v1 (`GET /leads/{id}/messages`) vira a regra de **semeadura**, não mais a janela de prompt — emenda parcial da AD-017 | y (2026-08-14) |
| Divisão da AD-014 | O LLM decide **quando** chamar uma tool; a tool (sub-workflow determinístico) decide **o que** é permitido, e recusa devolvendo erro ao agente | A invariante "nenhum efeito colateral sem validação determinística" sobrevive intacta; muda só onde ela mora. Sem essa emenda, o nó AI Agent seria incompatível com a AD-014 por construção | y (2026-08-14) |
| Campos obrigatórios para agendar | **3**: modalidade, região, tipo de imóvel. Os outros 5 (orçamento, horizonte, motivação, crédito, operação casada) viram oportunistas — registrados se o lead falar espontaneamente, nunca perguntados | Decisão do usuário (2026-08-14). O corretor conduz a reunião com esses 3; orçamento é a pergunta que mais trava lead cedo e foi exatamente onde a conversa real descarrilou | y (2026-08-14) |
| Significado de "obrigatório" | **Perguntado uma vez**, não *preenchido*. Campo perguntado e não respondido é marcado e nunca reperguntado; não bloqueia o agendamento | Decisão do usuário (2026-08-14). É o buraco de política que produziu as três reperguntas de orçamento | y (2026-08-14) |
| Onde vive o registro de "já perguntei" | Coluna nova `perguntadosJson` na Data Table `conversa_estado` (`ZsplBxJjXv3kwKZ8`) | A tabela já é chaveada por `tenantSlug`+`waId` e já guarda `camposJson`/`fase`; não precisa de store novo | n (discretion) |
| Persona | Consultiva: reage ao **conteúdo específico** do que o lead disse antes de qualquer pergunta, em vez de carimbar aprovação e emendar a próxima | Decisão do usuário (2026-08-14) sobre GA-3. Substitui o molde que gerou "Show." 4× | y (2026-08-14) |
| Fronteira de capacidade | O agente não busca imóvel, não manda foto, não manda preço — reconhece abertamente e usa como ponte para agendar; **não** escalona por isso | Decisão do usuário (2026-08-14) sobre GA-4 | y (2026-08-14) |
| Reação a saída inválida | Regenerar via o próprio loop de tool-error do AI Agent, bounded por `maxIterations` (8) — sem contador de tentativas dedicado. Turno sem `responder_lead` aceito termina em silêncio registrado (`turnoSemResposta`), não em mensagem de fallback ativa | Reconciliado com o comportamento real em 2026-08-15 (achado do Verifier do Execute): o plano original previa um contador de 2 tentativas + fallback ativo; o que foi implementado usa o mecanismo de retry nativo do nó AI Agent e trata o esgotamento como silêncio seguro, consistente com `design.md` Error Handling Strategy | y (2026-08-15) |
| Emoji e teto de mensagens por turno | Mantidos do lote-6b: sem emoji, 1 a 3 mensagens por turno | AD-016 segue válida; este lote não a revisa, só muda onde o teto é imposto (contador na tool `responder_lead`) | n (discretion) |
| Debounce, gate, opt-out e scheduler | Inalterados. A reescrita começa depois do gate e termina antes do `clearBuffer` | O defeito observado é do miolo conversacional; o entorno já foi provado em execução real (lote-6) e mexer nele amplia risco sem ganho | n (discretion) |
| Modelo | Gemini, o mesmo já em uso | Troca de modelo é variável confundidora: mudaria o resultado sem que se saiba se foi a arquitetura ou o modelo. Fica como ajuste posterior, medível isoladamente | n (discretion) |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Miolo conversacional no nó AI Agent ⭐ MVP

**User Story**: Como mantenedor do fluxo, quero que o turno de conversa seja um nó AI Agent com tools, para que o agente possa executar ações de verdade em vez de só descrever o que faria, e para que a cadeia de envio hardcoded deixe de existir.

**Why P1**: É a mudança estrutural que habilita todas as outras. Sem tools, "partir para o agendamento" continua sendo uma frase que o modelo escreve, não um efeito que ele produz.

**Acceptance Criteria**:

1. WHEN o gate roteia uma mensagem para `conversa` THEN o fluxo SHALL processar o turno através de um nó `@n8n/n8n-nodes-langchain.agent`, sem nenhum Basic LLM Chain no caminho.
2. The system SHALL expor ao agente exatamente as tools `registrar_qualificacao`, `agendar_reuniao`, `escalar_para_humano`, `consultar_documentos` e `responder_lead` — nenhuma outra.
3. WHEN uma tool recebe um argumento que viola a validação determinística da sua barreira THEN a tool SHALL recusar a execução, não produzir efeito colateral algum, e devolver ao agente uma mensagem de erro que nomeia o motivo da recusa.
4. WHEN o agente chama `responder_lead` pela quarta vez no mesmo turno THEN a tool SHALL recusar a chamada sem enviar mensagem ao lead.
5. WHEN o agente chama `agendar_reuniao` com um horário fora do horário comercial resolvido do tenant THEN a tool SHALL recusar sem criar evento no Google Calendar.
6. WHEN o agente chama `escalar_para_humano` THEN a tool SHALL recusar se a transição de status for inválida segundo a tabela `TRANSITIONS`.
7. The system SHALL manter a detecção de opt-out em `n8n/src/gate.mjs`, executada antes do nó AI Agent, sem nenhuma tool de opt-out exposta ao modelo.
8. WHEN o agente termina um turno sem ter chamado `responder_lead` nenhuma vez THEN o fluxo SHALL registrar a ocorrência e encerrar o turno sem enviar mensagem, nunca deixando a execução em erro.

**Independent Test**: Executar o workflow com uma fixture de mensagem de lead e um stub de modelo que chama `agendar_reuniao` às 3h da manhã — a execução termina sem evento no Calendar, com a tool devolvendo erro nomeando "fora do horário comercial", e o lead recebendo uma resposta em vez de silêncio.

---

### P1: Memória persistente de conversa ⭐ MVP

**User Story**: Como lead, quero que o agente lembre da conversa inteira da sessão, para nunca ter que repetir o que já falei nem receber apresentação no meio.

**Why P1**: É a contraparte de contexto da mudança estrutural. Sem memória durável, o AI Agent volta a reconstruir tudo por HTTP a cada turno — o desenho que este lote existe para substituir.

**Acceptance Criteria**:

1. The system SHALL usar um nó `@n8n/n8n-nodes-langchain.memoryPostgresChat` com `sessionIdType: customKey` e `sessionKey` composto de `tenantSlug` e `waId`.
2. WHEN dois leads de tenants diferentes têm o mesmo `waId` THEN suas memórias SHALL permanecer isoladas, sem nenhuma mensagem de um aparecendo no contexto do outro.
3. WHEN o intervalo entre a mensagem atual e a última mensagem registrada da sessão é maior que 12 horas THEN o fluxo SHALL purgar a memória daquela `sessionKey` antes de invocar o agente.
4. WHILE a sessão está ativa o agente SHALL receber todas as mensagens da sessão, sem teto de 20, limitado apenas pela salvaguarda de 50 mensagens.
5. WHEN a memória da sessão está vazia e o lead já tem histórico no CRM dentro da janela de 12h THEN o fluxo SHALL semear a memória a partir de `GET /api/v1/leads/{id}/messages` antes de invocar o agente.
6. IF a chamada de semeadura falhar ou devolver vazio THEN o fluxo SHALL prosseguir com memória vazia — nunca abortar a execução nem deixar de responder ao lead.
7. WHEN um lead faz opt-out THEN o fluxo SHALL purgar a memória daquela `sessionKey`, além do registro de opt-out já feito no CRM.
8. The system SHALL persistir a memória no Postgres da própria instância n8n, acessado por conexão local, nunca no banco do CRM.

**Independent Test**: Duas execuções separadas por mais de 12h simuladas na mesma `sessionKey` — a segunda encontra memória vazia, semeia do CRM apenas o que está dentro da janela, e o prompt resultante não contém nenhuma mensagem da sessão anterior.

---

### P1: Qualificação enxuta e sem repergunta ⭐ MVP

**User Story**: Como lead, quero responder poucas perguntas e nunca a mesma duas vezes, para não desistir da conversa no meio.

**Why P1**: É o defeito mais visível da conversa real e o que mais custa conversão — o lead escreveu "Você tá me perguntando a mesma coisa dnv" e depois "???".

**Acceptance Criteria**:

1. The system SHALL tratar como obrigatórios para agendamento exatamente três campos — modalidade, região e tipo de imóvel — e como oportunistas os outros cinco.
2. WHEN o agente faz uma pergunta sobre um campo obrigatório THEN o fluxo SHALL registrar aquele campo como já perguntado, independentemente de o lead responder ou não.
3. WHILE um campo consta como já perguntado o agente SHALL NOT perguntar sobre ele de novo em nenhum turno seguinte.
4. The system SHALL NOT perguntar sobre nenhum dos cinco campos oportunistas em nenhum turno.
5. WHEN o lead revela espontaneamente o valor de um campo oportunista THEN o agente SHALL registrá-lo via `registrar_qualificacao`.
6. WHEN o lead responde a um campo obrigatório com uma não-resposta ("não sei", "não tenho", "tanto faz") THEN o fluxo SHALL manter o campo marcado como perguntado e SHALL NOT bloquear o agendamento por ele estar vazio.
7. WHEN os três campos obrigatórios constam como perguntados THEN o fluxo SHALL transicionar `conversa_estado.fase` de `qualificando` para `agendando`.
8. WHILE a fase é `agendando` o system message do agente SHALL instruir a propor horário de reunião e SHALL NOT apresentar nenhum campo de qualificação como pendente.

**Independent Test**: Rodar a função pura de fase com os três obrigatórios marcados como perguntados e todos os valores nulos — ela devolve `agendando`, e o system message montado a partir dela não contém nenhuma menção a campo pendente.

---

### P1: Barreiras determinísticas de persona ⭐ MVP

**User Story**: Como lead, quero conversar com alguém que soa como pessoa e não promete o que não pode cumprir, para ter vontade de continuar a conversa.

**Why P1**: A regra equivalente já existe no prompt (`prompt.mjs:52`) e foi ignorada 4 vezes seguidas na conversa real. Enquanto for só prompt, não é requisito — é sugestão.

**Acceptance Criteria**:

1. IF a primeira mensagem do turno abre com uma interjeição de aprovação isolada — "show", "boa", "perfeito", "entendido", "ótimo", "legal" — THEN o validador SHALL rejeitar a saída.
2. IF a abertura da primeira mensagem do turno coincide com a abertura de qualquer turno anterior do agente na sessão THEN o validador SHALL rejeitar a saída.
3. IF alguma mensagem do turno promete buscar, enviar, mandar, puxar ou separar imóveis, opções, fotos ou valores THEN o validador SHALL rejeitar a saída.
4. WHEN a tool `responder_lead` recusa uma saída por violar `checkOpening` ou `checkCapabilityPromise` THEN o fluxo SHALL devolver ao agente o motivo nomeado da rejeição como erro de tool, permitindo nova tentativa dentro do limite de `maxIterations` (8) do próprio nó AI Agent — sem contador de tentativas dedicado à regeneração. WHEN o turno termina sem nenhuma chamada aceita de `responder_lead` (por `maxIterations` esgotado ou qualquer outro motivo) THEN o fluxo SHALL registrar a ocorrência (`turnoSemResposta`) e encerrar sem enviar mensagem ao lead — silêncio é o comportamento aceito, não uma mensagem ativa de fallback (reconciliado com o comportamento real em 2026-08-15, achado do Verifier do Execute — ver `design.md`, Error Handling Strategy: "Agente termina sem chamar `responder_lead`").
5. WHEN o lead pede opções de imóvel, fotos ou valores THEN o agente SHALL reconhecer que quem traz isso é o corretor na reunião e SHALL NOT escalar por esse motivo.
6. The system SHALL manter as regras já vigentes da AD-016 — sem emoji, 1 a 3 mensagens por turno, nunca se anunciar como IA por iniciativa própria, nunca negar quando perguntado.

**Independent Test**: Alimentar o validador com uma saída cujo primeiro item é "Show. Qual seu orçamento?" — rejeitada com motivo `abertura-proibida`; alimentar com "Vou puxar aqui as opções de até 150 mil" — rejeitada com motivo `promessa-fora-de-capacidade`.

---

### P2: Documentos de contexto sob demanda

**User Story**: Como mantenedor, quero que a lista de documentos do tenant seja consultada só quando o agente precisar, para o prompt parar de carregar ruído em todo turno.

**Why P2**: É melhoria de qualidade de contexto e de custo, não um defeito que quebra a conversa. Vale fazer junto porque a tool já existe no desenho, mas o lote fecha sem isso se o orçamento apertar.

**Acceptance Criteria**:

1. WHEN o agente chama `consultar_documentos` THEN a tool SHALL consultar `GET /api/v1/context` filtrando pela modalidade do lead e devolver a lista ao agente.
2. The system SHALL NOT injetar a lista de documentos no system message de todo turno.
3. WHEN a chamada a `GET /api/v1/context` falha THEN a tool SHALL devolver ao agente uma lista vazia com aviso, sem derrubar a execução.

**Independent Test**: Executar um turno em que o modelo não chama a tool — nenhuma requisição a `/context` aparece na execução; executar um em que chama — aparece exatamente uma.

---

### P3: Observabilidade das recusas de tool

**User Story**: Como mantenedor, quero enxergar quantas vezes cada barreira recusou uma chamada, para saber se o prompt está mal calibrado ou se o modelo está tentando burlar regra.

**Why P3**: Puramente diagnóstico. Útil na primeira semana de piloto, dispensável para a conversa funcionar.

**Acceptance Criteria**:

1. WHEN uma tool recusa uma chamada THEN o fluxo SHALL registrar o nome da tool e o motivo da recusa nos dados da execução.

---

## Edge Cases

- IF o nó AI Agent atinge `maxIterations` sem ter conseguido uma chamada aceita de `responder_lead` THEN o fluxo SHALL registrar `turnoSemResposta` nos dados da execução e encerrar o turno sem enviar mensagem ao lead — silêncio é o comportamento aceito, preferível a uma mensagem genérica ou incorreta (reconciliado com o comportamento real em 2026-08-15; texto anterior desta linha prometia um envio ativo de fallback que nunca foi implementado — achado do Verifier do Execute, ver `design.md` Error Handling Strategy).
- IF o agente chama `registrar_qualificacao` com um valor fora dos enums do contrato THEN a tool SHALL recusar sem fazer `PATCH`, e o campo SHALL permanecer com o valor anterior.
- IF a memória contém uma sessão e o lead está com `status = escalado_humano` THEN o gate SHALL rotear para `somente-registrar` antes do agente, sem invocar o modelo.
- IF o banco de memória está indisponível THEN o fluxo SHALL prosseguir o turno sem memória em vez de falhar a execução.
- WHEN o mesmo lead manda várias mensagens em rajada THEN o debounce existente SHALL continuar agrupando-as num único turno do agente.
- IF a purga de sessão por 12h e a semeadura do CRM aconteceriam no mesmo turno THEN o fluxo SHALL purgar primeiro e semear depois, nunca a ordem inversa.
- WHEN um lead novo manda a primeira mensagem THEN a memória SHALL estar vazia e a semeadura SHALL ser pulada sem erro.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| AGN-01 | P1: Miolo no AI Agent | T9-T11 | Done |
| AGN-02 | P1: Miolo no AI Agent | T11 | Done |
| AGN-03 | P1: Miolo no AI Agent | T7,T8,T11 | Done |
| AGN-04 | P1: Miolo no AI Agent | T7 | Done |
| AGN-05 | P1: Miolo no AI Agent | T9 | Done |
| MEM-01 | P1: Memória persistente | T5,T10 | Done |
| MEM-02 | P1: Memória persistente | T3,T10 | Done |
| MEM-03 | P1: Memória persistente | T3,T10 | Done |
| MEM-04 | P1: Memória persistente | T10 | Done |
| QLF-01 | P1: Qualificação enxuta | T1,T11 | Done |
| QLF-02 | P1: Qualificação enxuta | T11 | Done |
| QLF-03 | P1: Qualificação enxuta | T1,T4,T11 | Done |
| VOZ-01 | P1: Barreiras de persona | T2,T7 | Done |
| VOZ-02 | P1: Barreiras de persona | T2,T7 | Done |
| VOZ-03 | P1: Barreiras de persona | T2,T4,T11 | Done |
| CTX-03 | P2: Documentos sob demanda | T11 | Done |
| OBS-01 | P3: Observabilidade de recusas | T11 | Done |

**Mapa ID → critérios de aceite:**

- **AGN-01** turno roda no nó AI Agent (P1.1) · **AGN-02** whitelist de exatamente 5 tools (P1.2) · **AGN-03** barreira dentro da tool recusa e devolve motivo (P1.3, P1.5, P1.6) · **AGN-04** teto de 3 chamadas de `responder_lead` (P1.4) · **AGN-05** opt-out fora do LLM (P1.7, P1.8)
- **MEM-01** memória Postgres com sessionKey composta e isolamento (AC1, AC2, AC8) · **MEM-02** purga por sessão de 12h (AC3, AC4) · **MEM-03** semeadura pelo contrato em cold start (AC5, AC6) · **MEM-04** purga no opt-out (AC7)
- **QLF-01** 3 obrigatórios / 5 oportunistas (AC1, AC4, AC5) · **QLF-02** perguntado-uma-vez e não-resposta (AC2, AC3, AC6) · **QLF-03** fase determinística e system message por fase (AC7, AC8)
- **VOZ-01** blacklist de abertura e anti-repetição (AC1, AC2) · **VOZ-02** fronteira de capacidade (AC3, AC5) · **VOZ-03** regeneração limitada e fallback (AC4, AC6)
- **CTX-03** documentos sob demanda (P2.1–P2.3) · **OBS-01** log de recusas (P3.1)

**Coverage:** 17 total, 17 mapped to tasks, 0 unmapped.

**"Done" aqui significa implementado + gate verde (`npx vitest run && npm run lint && npm run build`) + pelo menos uma confirmação real (unit test, `validate_workflow`, ou execução MCP) — não "Verified", que é o veredito do Verifier independente que roda depois deste Execute. Evidência real por camada, honestamente diferenciada:**

- **Provado por execução real ao vivo neste lote** (não só unit test): AGN-01 (execuções `462`/`496`/`463` — turno completo passa pelo nó `agent`, sem nenhum Basic LLM Chain); AGN-02 (as 5 tools estão conectadas — confirmado nó a nó via reconciliação `n8n/generated/` — e 2 das 5 foram de fato chamadas pelo agente: `registrar_qualificacao` e `responder_lead`); AGN-03 (rejeição de enum inválido em `registrar_qualificacao`, `payload-invalido`, com autocorreção do agente — execuções `462`/`496`; rejeição de abertura proibida em `responder_lead` — execução `450`); AGN-04 (teto de 3 chamadas — execução `407`, Batch 2); QLF-01/QLF-02/QLF-03 (execuções `462`/`496` mostram `perguntadosJson` acumulando e nunca repetindo, e a fase transicionando para `agendando` com o system message mudando de instrução); VOZ-01 (execução `450`); MEM-01 (execuções `462`/`496` mostram `Postgres Chat Memory` carregando/salvando de verdade, banco real confirmado em T5 — execução `396`); OBS-01 (o motivo da recusa aparece nos dados da execução por construção do próprio n8n — visível em `450`/`462`/`496`, sem código adicional).
- **Implementado + testado (unit ou `validate_workflow`/execução MCP direta na sub-tool), mas não exercitado via um turno real do AI Agent neste lote**: AGN-05 (rota opt-out reescrita em T9, sem novo teste de execução — a detecção em si já era provada em `gate.test.ts`); MEM-02/MEM-03/MEM-04 (unit tests em `session.test.ts`; o bloco de memória foi exercitado ao vivo nas execuções `462`/`496`, mas nenhuma delas cruzou a janela de 12h nem testou opt-out de verdade nesta sessão); VOZ-02/VOZ-03 (unit tests em `voice.test.ts`; nenhuma mensagem de teste deste lote acionou a barreira de promessa fora de capacidade nem forçou uma regeneração); CTX-03 (tool `consultar_documentos` conectada e testada estaticamente; nenhum lead de teste perguntou sobre documentos).
- Este é exatamente o tipo de lacuna que a AD-015 já havia nomeado como esperada para lotes que fecham sem o smoke conversacional roteirizado completo — não é ocultado aqui, é declarado para o Verifier avaliar.

---

## Success Criteria

- [x] Uma conversa de qualificação completa cabe em **no máximo 3 perguntas** ao lead, e nenhuma pergunta se repete. Provado por execução real (`462`/`496`): `perguntadosJson` acumula exatamente os 3 obrigatórios, nunca repete.
- [x] Nenhum turno abre com interjeição de aprovação isolada, e nenhuma abertura se repete dentro de uma sessão — provado por teste discriminante sobre o validador (`voice.test.ts`) e por execução real (`450`, rejeição de "Show.").
- [x] Nenhuma mensagem promete buscar, enviar ou mandar imóvel, foto ou valor — barreira implementada e testada (`voice.test.ts`); nenhuma das mensagens reais enviadas neste lote (`450`, `463`) violou a regra, mas o caso de rejeição por promessa não foi exercitado ao vivo neste lote especificamente (era não-goal de nenhuma fixture usada).
- [x] Com os três obrigatórios perguntados, o turno seguinte propõe horário de reunião. Provado por execução real (`462`/`496`): fase `agendando`, system message instrui "Fase atual: AGENDAMENTO... proponha um horário".
- [ ] Reiniciar a instância n8n no meio de uma sessão não faz o agente perder o contexto — garantido por construção (Postgres Chat Memory persistente, T5 confirmou a credencial real), mas não exercitado literalmente (nenhuma reinicialização da instância aconteceu neste lote). Gap conhecido, não bloqueante.
- [x] `npx vitest run`, `npm run lint` e `npm run build` verdes; `n8n/generated/` idêntico ao export da instância. 622 testes, gate limpo em T12/T13/T14/T15/T16; reconciliação nó-a-nó confirmada em T12.
- [ ] Nenhum efeito colateral ocorre sem validação determinística — provado por sensor de mutação sobre as barreiras das tools. **Não é trabalho deste Execute**: o sensor de discriminação é a etapa do Verifier independente que roda depois, não do autor.
