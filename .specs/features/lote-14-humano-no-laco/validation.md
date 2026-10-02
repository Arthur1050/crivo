# Lote 14 — Humano no laço — Validação

**Result**: PASS ✅ (ciclo 2, 2026-10-01: os 2 mutantes sobreviventes do ciclo 1 morrem, gates sem regressão, Lacuna 4 aceita como ressalva declarada)

## Ciclo 2 — correção das lacunas do ciclo 1

**Data**: 2026-10-01
**Intervalo total**: `c2c7f34..0cc975f`. Delta do ciclo 2: `67818b5..0cc975f` = `295c23a` (JSON da remedição do teto de contexto), `770bed1` (Fix 1, Fix 2, Lacuna 5), `97d49a1` (erros de tipo), `0cc975f` (README §15 e limite das capturas).
**Verifier**: o mesmo sub-agente independente do ciclo 1. Não escreveu nada do lote nem das correções.

**Veredito: PASS** ✅. O delta só toca testes e documentação: `git diff --stat 67818b5..0cc975f` mostra 8 arquivos, nenhum de produção (`src/server/data/index.ts`, `leads.ts`, `n8n/src/*.mjs` e workflows intocados). Por isso os 13 mutantes mortos no ciclo 1 continuam válidos e só refiz os dois sobreviventes.

### Mutantes refeitos (mesmo protocolo)

Worktree descartável em `0cc975f`, `node_modules` por junction, vitest rodado do diretório do repositório com `--root <worktree>`. Baseline sem mutação: 4 arquivos / 66 testes verdes. Cada mutação foi confirmada por `git diff` e revertida com `git checkout --`, com o `git status --porcelain` do worktree vazio depois. No fim a junction foi removida antes (o `node_modules` real continuou intacto) e o worktree com `git worktree remove --force`.

| # | Mutação | Testes rodados | Resultado |
| --- | --- | --- | --- |
| 6a | `src/server/data/index.ts:1610-1616`: retomada sem compare-and-set (`WHERE id` só) | `src/server/data/__tests__/human-send`, `src/server/chats/__tests__/human-send` (36 testes, rodado 2×) | ✅ **Morto** nas 2 rodadas: falha `human-send.test.ts:259` ("dois retomadores que leram a mesma reserva falhou: o compare-and-set barra o segundo") |
| 10b | `src/server/data/index.ts:1387`: assumir grava `statusChangedBy: "humano"` | `conversation-conduction`, `chats-actions` (30 testes) | ✅ **Morto**: falha `conversation-conduction.test.ts:120` ("statusChangedBy nulo continua nulo depois de assumir (AC2)") |

Estabilidade do teste novo do compare-and-set sem mutação: 3 rodadas isoladas, 3 verdes. O desenho dele discrimina de fato: uma transação separada trava a linha com `FOR UPDATE`, as duas retomadas leem `falhou` e param no `UPDATE` (espera conferida em `pg_stat_activity`), e o `COMMIT` força a reavaliação do `WHERE` (EvalPlanQual em READ COMMITTED). Sem o compare-and-set, as duas devolvem `reservado`. O teste antigo (`:245`) ficou intacto.

**Sensor do lote, consolidado**: 15/15 mortos.

### Gates (árvore real em `0cc975f` + alteração não commitada do usuário)

| Gate | Resultado |
| --- | --- |
| `npm test` (= `npx vitest run` nas branches de worker) | **145 arquivos / 2.402 testes: 2.400 passam, 2 falham.** As 2 falhas são as conhecidas de `DOCLIM-01 AC8` (`actions.test.ts`, timeout). Em relação ao ciclo 1 (2.399) são +3 testes, os novos de `770bed1` |
| `npx tsc --noEmit` | **50 erros**, iguais na árvore real e no worktree limpo em `0cc975f`. Comparado arquivo a arquivo com `c2c7f34` (61): os 16 erros acrescentados pelo lote sumiram, e `leads-post.test.ts` perdeu também os 11 que já existiam antes. **Nenhum erro em arquivo do lote.** Os 50 restantes são pré-existentes e ficam fora de escopo |
| `npm run lint` | 0 erros, 5 warnings pré-existentes |
| `npm run build` | Verde |

O `npm test` regravou de novo os 4 arquivos de `n8n/generated/` só com fim de linha (`git diff --ignore-cr-at-eol` vazio). Restaurei com `git checkout --`. `git status --porcelain` da árvore real antes e depois do ciclo: ` M src/components/chats/message-thread.tsx` e `?? .specs/features/lote-14-humano-no-laco/validation.md`.

### Lacunas do ciclo 1

| Lacuna | Correção | Status |
| --- | --- | --- |
| Fix 1 (M6a) | Teste novo `src/server/data/__tests__/human-send.test.ts:259` | ✅ Resolvida (mutante morto) |
| Fix 2 (M10b) | Teste novo `src/server/data/__tests__/conversation-conduction.test.ts:120` | ✅ Resolvida (mutante morto) |
| 3 — README contradiz a D12 | `n8n/README.md:418` descreve a D12 (`TEAM_NOTES_INSTRUCTION`) e a remedição de 2026-10-01 com tetos iguais | ✅ Resolvida. A afirmação de que "os tetos ficaram iguais" vem do autor e do JSON de `295c23a`. Não reexecutei o `check` do benchmark, porque ele depende do n8n |
| 4 — capturas da T40 não versionadas | `n8n/smoke/evidencia.md:1793` declara o limite: as capturas foram feitas e conferidas na sessão, mas não foram salvas, e o estado foi limpo depois de cada caso | ⚠️ **Aceita como ressalva** (justificativa abaixo) |
| 5 — envios simultâneos sem teste | Teste novo `src/server/data/__tests__/human-send.test.ts:296`: duas reservas em paralelo para usuários diferentes, gravação fora de ordem e thread em ordem de `sentAt` com os dois autores | ✅ Resolvida no nível da DAL. O teste não passa por `sendHumanMessage` (a Meta não entra), e isso basta para o edge case, que trata de gravar e ordenar |
| 6 — erros de tipo novos | `97d49a1` (contexto da rota passado como `undefined`; `@ts-expect-error` no remetente inválido proposital) | ✅ Resolvida |

**Justificativa da Lacuna 4.** A HUMPROVA-01 AC5 manda aprovar ou reprovar cada cenário pelo estado final no CRM e no WhatsApp. Esse estado está registrado por caso, com ids de execução conferidos por `get_execution` (2805, 2814, 2815, 2875, 2881, 2837, 2838, 2859) e com os valores gravados (`optedOutAt`, linhas apagadas, `resetDue`). Também por isso os 4 cenários são verificáveis sem as imagens. A AC2 pede as capturas, então a ressalva fica registrada, e não como PASS limpo. Refazer as capturas exigiria repetir toda a prova real só para produzir imagens de um estado já comprovado por outras fontes. O limite está declarado na própria evidência, e não a deixo bloquear o lote. Sinal para lição: salvar as capturas como arquivo antes de limpar o estado do cenário.

### Requirement Traceability (proposta, ciclo 2; a spec não foi editada pelo Verifier)

| Requisito | Status proposto |
| --- | --- |
| ASSUMIR-01, SILENCIO-01, ENVIO-01, JANELA-01, THREAD-01, DEVOLVER-01, OPTHUM-01, CONTRATO-01, CONTRATO-02, HUMDOC-01 | ✅ Verified |
| HUMPROVA-01 | ✅ Verified com ressalva (Lacuna 4, capturas não versionadas) |

---

## Ciclo 1 (histórico)

**Result do ciclo 1**: FAIL ❌ (2 mutantes sobreviventes; nenhum defeito de comportamento encontrado, as lacunas eram de discriminação de teste e de documentação)

**Data**: 2026-10-01
**Spec**: `.specs/features/lote-14-humano-no-laco/spec.md`
**Intervalo**: `c2c7f34..67818b5` (41 commits, de `b797fe9` a `67818b5`; inclui a emenda D12 em `0688deb`, AD-034/assumptions da spec)
**Verifier**: sub-agente independente (autor ≠ verifier). Não escreveu nada deste lote.

Fora do escopo e desconsiderados: a alteração não commitada do usuário em `src/components/chats/message-thread.tsx` (não tocada) e o commit `295c23a` (`docs(specs): record lote 14 context ceiling remeasure`), que entrou em `main` depois de `67818b5` e só adiciona um JSON de benchmark.

---

## Veredito

**FAIL** pela regra do protocolo (mutante sobrevivente = tarefa de correção antes de fechar). Os requisitos têm evidência de código, teste e prova real; 12 de 14 mutantes morreram. As duas sobrevivências mostram testes que não discriminam o que afirmam proteger:

1. **M6a** — a retomada da reserva de envio humano sem compare-and-set passa em toda a suíte. O teste "dois retomadores concorrentes" (`src/server/data/__tests__/human-send.test.ts:230`) não exercita a corrida: as duas chamadas do `Promise.all` são serializadas pelo pool, a segunda já lê `enviando` com idade 0 e cai na checagem "em voo", não no CAS.
2. **M10b** — assumir gravando `statusChangedBy = 'humano'` passa. O único teste de antes/depois de AC2 (`conversation-conduction.test.ts:102`) cria o lead **já** com `statusChangedBy: "humano"`, então a mutação é invisível.

Os dois são correções de teste, sem mudança de produção esperada. Há também 2 lacunas documentais e 16 erros de tipo novos em arquivos de teste (detalhes em Lacunas).

---

## Task Completion

| Tasks | Status | Notas |
| --- | --- | --- |
| T1–T40 | ✅ 40/40 marcadas `[x]` em `tasks.md` | T28 antecipada (decisão do usuário registrada em `tasks.md:727`). T23 com aprovação retroativa da contagem do grafo (`tasks.md:622`). T40 com a 1ª rodada do 6b reprovada e a 2ª aprovada depois da D12 |

---

## Gates

Rodados na árvore real (`main` em `295c23a` + a alteração não commitada do usuário), exceto `tsc`, rodado também num worktree limpo em `67818b5` e em `c2c7f34` para separar o que é do lote.

| Gate | Comando | Resultado |
| --- | --- | --- |
| Suíte completa | `npm test` (= `npx vitest run` nas branches de worker, `scripts/test-suite.mjs`) | **145 arquivos / 2.399 testes: 2.397 passam, 2 falham.** As 2 falhas são as conhecidas de `DOCLIM-01 AC8` (`src/server/__tests__/actions.test.ts`, "exclusão reconcilia…" e "mudança de modalidade reconcilia…", timeout). Não contam como regressão. Duração 329 s |
| Contagem | baseline do lote (`tasks.md` T1) 126 / 2.107 → 145 / 2.399 | **+19 arquivos, +292 testes.** Nenhum teste removido em silêncio; a única troca de teste existente é o `GET` saindo da lista 405 em `leads-patch.test.ts` (rota passou a existir, emenda D4, `tasks.md:322`) |
| Tipos | `npx tsc --noEmit` | **Falha (exit 2), 77 erros, todos em arquivos de teste.** Em `c2c7f34` já eram 61 (pré-existentes). O lote **acrescenta 16**: `leads-post.test.ts` 11 → 25 (TS2554, handler chamado sem o 2º argumento), `memory-resets-get.test.ts:135` (TS2554) e `n8n/src/__tests__/session.test.ts:189` (TS2322, `"sistema"` fora do union `sender`). O mesmo número (77) em `67818b5` limpo e na árvore real: a alteração do usuário não acrescenta erro |
| Lint | `npm run lint` | **0 erros**, 5 warnings pré-existentes, nenhum em arquivo do lote |
| Build | `npm run build` | **Verde.** Rotas novas `/api/v1/leads/[id]` e `/api/v1/memory-resets` no manifesto. Os avisos de Better Auth (URL base/segredo) vêm do ambiente local de build |

Efeito colateral do `npm test`, já documentado em `tasks.md:21`: regravou 4 arquivos de `n8n/generated/` com diferença só de fim de linha (`git diff --ignore-cr-at-eol` vazio). Restaurados com `git checkout --` desses 4 arquivos. `git status --porcelain` antes e depois de todo o trabalho: só ` M src/components/chats/message-thread.tsx`.

---

## Spec-Anchored Acceptance Criteria

Legenda: ✅ PASS com `file:line`; ⚠️ PASS com ressalva; ❌ lacuna. "Real" = evidência de execução em `n8n/smoke/evidencia.md` § "Lote 14 — T40" (linhas 1784–1873), ids conferidos por `get_execution` segundo o autor. "Captura" = Evidence de UI da task em `tasks.md` (o projeto não tem camada de teste de UI; matriz em `tasks.md:59`).

### ASSUMIR-01 — Assumir a conversa

| AC | Outcome exigido | Evidência | Status |
| --- | --- | --- | --- |
| 1 | Marca com id do usuário e instante | `src/server/data/__tests__/conversation-conduction.test.ts:93` (`humanTakeoverAt` = NOW, `humanTakeoverBy` = managerId); ligação com a sessão `src/server/__tests__/chats-actions.test.ts:198`; real 6a turno 2 (`evidencia.md:1804`) | ✅ |
| 2 | `status`, `statusChangedBy`, `assignedUserId` inalterados | `conversation-conduction.test.ts:102` (antes/depois). Mutante M10a (status) morto. **M10b (`statusChangedBy`) sobrevive**: o lead do teste já nasce com `statusChangedBy: "humano"` | ⚠️ ver Fix 2 |
| 3 | Fora do escopo: recusa, sem marca | `conversation-conduction.test.ts:120` (outra carteira), `:129` (outro tenant); `chats-actions.test.ts:210` (escopo da sessão) | ✅ |
| 4 | Sem `chats:escrever`: recusa, sem marca | `chats-actions.test.ts:161` | ✅ |
| 5 | Com `optedOutAt`: recusa | `conversation-conduction.test.ts:138` | ✅ |
| 6 | Já marcado: preserva usuário e instante | `conversation-conduction.test.ts:147` | ✅ |
| 7 | `escalado_humano` = conduzido por humano sem marca | `n8n/src/__tests__/conduction.test.ts:17`; `conversation-conduction.test.ts:156` (`ja-humano` sem gravar); `src/server/chats/__tests__/human-send.test.ts:287` (envia sem marca) | ✅ |
| 8 | Controle "Assumir" só para agente, sem opt-out, com permissão | `src/lib/__tests__/conversation-control.test.ts:75`, `:138`, `:155`; captura T32 (`tasks.md:818`) | ✅ |

### SILENCIO-01 — Calar o agente

| AC | Outcome exigido | Evidência | Status |
| --- | --- | --- | --- |
| 1 | Com a marca: grava e o agente não envia | `n8n/src/__tests__/gate-conducao-humana.test.ts:19`; `n8n/workflows/__tests__/principal-conducao-humana.test.ts:112`, `:116` (gate executado com a marca → `somente-registrar`); real 2814/2815 (`evidencia.md:1806-1809`) | ✅ |
| 2 | `somente-registrar`, mesma precedência de `escalado_humano` | `gate-conducao-humana.test.ts:19`, `:23`, `:29` (mídia); M1 morto | ✅ |
| 3 | `sair`/`parar` com a marca → opt-out e confirmação única | `gate-conducao-humana.test.ts:33`, `:37`; M1b (inverter precedência) morto; real 2859 (`evidencia.md:1850`) | ✅ |
| 4 | Marca gravada no meio do turno → nenhum envio posterior | `n8n/workflows/__tests__/tool-responder-lead.test.ts:128`, `:132`, `:183`; contingência `principal-conducao-humana.test.ts:153`, `:157`, `:161`, `:175`; M2a morto | ✅ |
| 5 | Falha da consulta bloqueia o envio | `tool-responder-lead.test.ts:115`, `:177`; `principal-conducao-humana.test.ts:141` | ✅ |
| 6 | Scheduler não reengaja conduzido por humano | `n8n/workflows/__tests__/scheduler-conducao.test.ts:93`, `:99`, `:122`, `:127`; `conduction.test.ts:57`, `:63` | ✅ |
| 7 | Scheduler não escala por silêncio com a marca | `scheduler-conducao.test.ts:99` (template e PATCH só depois do filtro), `:104` (falha do GET sem efeito) | ✅ |
| 8 | Lembrete continua | `scheduler-conducao.test.ts:160`, `:164` | ✅ |
| 9 | `PATCH` com status/`meetingAt` e marca → `409 lead-conduzido-por-humano`, nada gravado | `src/server/integration/__tests__/routes/leads-patch-conducao.test.ts` (4 testes: status, `meetingAt`, `integration_refusals`, marca + trava); código `src/server/integration/leads.ts:184-189`; M8 morto (4 falhas) | ✅ |

### ENVIO-01 — Responder pelo CRM

| AC | Outcome exigido | Evidência | Status |
| --- | --- | --- | --- |
| 1 | Entrega pelo número do lead | `human-send.test.ts:253` (URL/`to` convertido por `toWhatsAppMsisdn`); `src/server/whatsapp/__tests__/cloud-api.test.ts:42`; real 6a turno 3 | ✅ |
| 2 | Grava `humano`, autor, instante, `externalId` = wamid | `human-send.test.ts:253`; `src/server/data/__tests__/human-send.test.ts:246` | ✅ |
| 3 | Texto aparado, sem prefixo/assinatura | `human-send.test.ts:253` (corpo exato, formatação intacta) | ✅ |
| 4 | Vazio ou > 4.096 → recusa sem Meta | `human-send.test.ts:185`, `:189`, `:193`, `:197` (4.096 aceito) | ✅ |
| 5 | Conduzido pelo agente → recusa | `human-send.test.ts:211` | ✅ |
| 6 | Opt-out → recusa | `human-send.test.ts:215` | ✅ |
| 7 | Fora do escopo / sem permissão → recusa | `human-send.test.ts:219`, `:225`; `chats-actions.test.ts:179` | ✅ |
| 8 | Número desconhecido → recusa com aviso | `human-send.test.ts:230` | ✅ |
| 9 | Meta recusa/timeout 15 s → nada gravado, motivo pt-BR, texto no campo | `human-send.test.ts:303`, `:339`; `cloud-api.test.ts:118`, `:136` (15.000 ms); texto no campo: captura T33 (`tasks.md:850-851`, defeito do `ChatComposer` corrigido na task) | ✅ |
| 10 | Meta aceita e gravação falha → log sem conteúdo, aviso | `human-send.test.ts:386` | ✅ |
| 11 | Mesma chave → uma chamada à Meta, uma mensagem | `human-send.test.ts:430`, `:449`; M6b morto. **M6a (sem CAS) sobrevive** — o caminho de retomada concorrente não é discriminado | ⚠️ ver Fix 1 |
| 12 | Sucesso limpa o campo e mostra sem esperar o refresh | `chats-actions.test.ts:233` (+ `revalidatePath("/chats")` em `:207`); composer limpa só no sucesso (`src/components/chats/human-composer.tsx:86`, `:95`); captura T33 | ✅ |
| 13 | Token ausente ou recusado → "não configurado", nada gravado | `human-send.test.ts:243`; `cloud-api.test.ts:87`, `:92`, `:97`, `:149`; `HUMAN_SEND_MESSAGES["credencial-invalida"]` = texto de não configurado (`human-send.test.ts:515-519`) | ✅ |

### JANELA-01 — Janela de 24h

| AC | Outcome exigido | Evidência | Status |
| --- | --- | --- | --- |
| 1 | Aberta < 24 h; fechada com 24 h exatas ou sem mensagem do lead | `conversation-control.test.ts:32`, `:40`, `:52`; `human-send.test.ts:234`, `:239`; M3 morto (3 testes em 3 arquivos) | ✅ |
| 2 | Tempo restante em h e min | `conversation-control.test.ts:58`, `:62`, `:203`; captura T33/T34 | ✅ |
| 3 | Campo desabilitado com aviso e instante | `conversation-control.test.ts:109`, `:207`; captura T33 (`tasks.md:849`) | ✅ |
| 4 | Envio com janela fechada → recusa sem Meta | `human-send.test.ts:234`; real: captura do campo bloqueado (`evidencia.md:1854-1857`) | ✅ |
| 5 | Mensagem nova reabre o campo no refresh | Evidence T31 (`tasks.md:793`); por construção (janela calculada no servidor a cada render) | ✅ |
| 6 | 131047 → mesmo aviso do AC3 | `human-send.test.ts:361`; `cloud-api.test.ts:72` | ✅ |

### THREAD-01 — Autoria e atualização

| AC | Outcome exigido | Evidência | Status |
| --- | --- | --- | --- |
| 1 | `humano` do lado da imobiliária, estilo distinto, nome do autor | `src/lib/__tests__/chat-thread.test.ts:139`, `:150`, `:166`, `:175`; `src/server/data/__tests__/conversation-reads.test.ts:193`; captura T29 (`tasks.md:748`) | ✅ |
| 2 | Refresh ≤ 10 s com aba visível | `conversation-control.test.ts:188` (5.000 ms ≤ 10.000), `:193`; T31 (`tasks.md:792-793`); real 5,9 s (`evidencia.md:1832`) | ✅ |
| 3 | Sem consulta com aba oculta | `conversation-control.test.ts:193`; T31 16 s sem requisição (`tasks.md:791`) | ✅ |
| 4 | Header mostra quem conduz | `conversation-control.test.ts:75`, `:92`, `:121`, `:174`; captura T32 (`tasks.md:818-820`) | ✅ |
| 5 | Lista marca conversas humanas | `conversation-reads.test.ts:115`, `:121`, `:127`; captura T30 | ✅ |
| 6 | Subtítulo sem "conduzidas pelo agente" | Captura T34 ("25 conversas no WhatsApp", `tasks.md:879`) | ✅ |
| 7 | Nome do autor sobrevive à perda de vínculo | `src/db/__tests__/schema-humano.test.ts:177`; `conversation-reads.test.ts:213` | ✅ |

### DEVOLVER-01 — Devolver ao agente

| AC | Outcome exigido | Evidência | Status |
| --- | --- | --- | --- |
| 1 | Remove a marca | `conversation-conduction.test.ts:178`; `chats-actions.test.ts:222` | ✅ |
| 2 | `escalado_humano` → `em_qualificacao` | `conversation-conduction.test.ts:189` | ✅ |
| 3 | Demais status mantidos | `conversation-conduction.test.ts:199`, `:205` | ✅ |
| 4 | `statusChangedBy` nulo | `conversation-conduction.test.ts:178`; M7 morto | ✅ |
| 5 | 1ª mensagem depois → memória reconstruída com todos os remetentes | `n8n/workflows/__tests__/principal-reset-memoria.test.ts:70`, `:78`, `:129-137`, `:154`; real 2875 (`evidencia.md:1829`) | ✅ |
| 6 | `humano` como fala da imobiliária atribuída ao corretor, nunca do lead | `n8n/src/__tests__/session.test.ts` (`toSeedMemoryItem`, byte a byte, e asserção "nunca `user`"); `principal-reset-memoria.test.ts:154`; M5 morto; D12: `n8n/src/__tests__/system-message.test.ts` (4 testes da nota da equipe), mutante extra M11 morto | ✅ |
| 7 | 2ª mensagem não reconstrói | `conduction.test.ts:102`, `:106`; `principal-reset-memoria.test.ts:83`; M9 morto; real 2881 | ✅ |
| 8 | Opt-out / fora do escopo → recusa, marca e status mantidos | `conversation-conduction.test.ts:213`, `:224`; `chats-actions.test.ts:170` (sem permissão) | ✅ |
| 9 | Controle "Devolver" só para conduzido por humano | `conversation-control.test.ts:92`, `:121`, `:138`, `:155`; captura T32 | ✅ |

### OPTHUM-01 — Opt-out pelo CRM

| AC | Outcome exigido | Evidência | Status |
| --- | --- | --- | --- |
| 1 | Grava `optedOutAt` pela mesma regra de domínio | `conversation-conduction.test.ts:248`, `:257` (COALESCE); `src/server/chats/__tests__/human-opt-out.test.ts:142`; `chats-actions.test.ts:265` | ✅ |
| 2 | Confirmação explícita com o texto exigido | Captura T32 (`tasks.md:821`) | ✅ |
| 3 | Janela aberta → exatamente uma mensagem com o texto OPTMSG-01, `humano` com autor | `human-opt-out.test.ts:160` (byte a byte); real 6c (`evidencia.md:1837-1839`) | ✅ |
| 4 | Janela fechada → sem envio | `human-opt-out.test.ts:183` (24 h exatas) | ✅ |
| 5 | Falha do envio mantém o opt-out e avisa | `human-opt-out.test.ts:202` | ✅ |
| 6 | Purga da sessão e de `conversa_estado` em até 20 min | Lado CRM `human-opt-out.test.ts:142`; varredura D `scheduler-conducao.test.ts:194-308`; real 2838, 4 min, 14 linhas apagadas (`evidencia.md:1844`) | ✅ |
| 7 | Somente leitura com a data, sem controles | `conversation-control.test.ts:138`, `:222`; captura T34 (`tasks.md:878`) | ✅ |
| 8 | Fora do escopo / sem permissão → recusa | `conversation-conduction.test.ts:267`, `:275`; `human-opt-out.test.ts:253`, `:274`; `chats-actions.test.ts:188` | ✅ |

### CONTRATO-01 / CONTRATO-02

| AC | Outcome exigido | Evidência | Status |
| --- | --- | --- | --- |
| C01-1 | `assignedBroker` no PATCH | `src/server/integration/__tests__/openapi.test.ts:244` | ✅ |
| C01-2 | Paridade `ProblemCode` | `openapi.test.ts:230` (conjunto igual às chaves de `TITLES`); discriminação registrada na T13 (`tasks.md:408`) | ✅ |
| C01-3 | Paridade `Sender` | `openapi.test.ts:237` | ✅ |
| C01-4 | Campos de condução no Lead | `openapi.test.ts:258`; `src/server/integration/__tests__/routes/leads-get.test.ts:81`, `:98` | ✅ |
| C01-5 | `sender: humano` → `400 payload-invalido`, sem gravar | `src/server/integration/__tests__/routes/leads-messages-post.test.ts:173`; M4 morto | ✅ |
| C01-6 | `humano` documentado em GET e recusado em POST | `openapi.test.ts:269`; `leads-messages-get.test.ts:164` | ✅ |
| C01-7 | `GET /leads/{id}`, `GET /memory-resets`, `whatsappPhoneNumberId` documentados | `openapi.test.ts:289`; rotas `leads-get.test.ts`, `memory-resets-get.test.ts:143-198`; `leads-post.test.ts:173-258` | ✅ |
| C02-1 | 413 `corpo-grande-demais` | `leads-post.test.ts:287` | ✅ |
| C02-2 | JSON inválido → 400 `payload-invalido` | `leads-post.test.ts:303` | ✅ |

### HUMPROVA-01 / HUMDOC-01

| AC | Outcome exigido | Evidência | Status |
| --- | --- | --- | --- |
| HP-1 | Cenários (a)–(d) no roteiro, formato AD-027 | `n8n/smoke/roteiro.md` §6.2 (T37) | ✅ |
| HP-2 | Estado final, ids conferidos, capturas | `evidencia.md:1797-1862`. As capturas são citadas ("(captura)") mas não estão versionadas no repositório (o lote-11 versionou em `evidencia/`) | ⚠️ ver Lacuna 4 |
| HP-3 | Zero mensagem do agente depois da marca no (a) | `evidencia.md:1806-1809` (2814, 2815) | ✅ |
| HP-4 | Captura do campo bloqueado | `evidencia.md:1854-1857` | ✅ |
| HP-5 | Aprovação pelo estado final; fala em seção separada | `evidencia.md:1864-1868` | ✅ |
| HD-1 | AD de condução + `amended by` em AD-018/AD-019 | `.specs/STATE.md:182`, `:190`, `:306` | ✅ |
| HD-2 | AD do caminho técnico | `.specs/STATE.md:315` (AD-035) | ✅ |
| HD-3 | L14b e item 3 entregue no roadmap | `.specs/ROADMAP-POS-PILOTO.md:173`, `:182`, `:192` | ✅ |
| HD-4 | README do n8n documenta gate, releitura e reconstrução | `n8n/README.md:397-427` (§15). **Mas `n8n/README.md:418` afirma que "o `system message` do agente não mudou, então o teto de contexto e o benchmark do §13 continuam valendo"**, o que a D12 (`0688deb`) tornou falso | ⚠️ ver Lacuna 3 |

**Status**: 11/11 requisitos com evidência; 4 ressalvas (2 mutantes sobreviventes, 2 documentais).

---

## Edge Cases

- [x] Lead escreve enquanto o humano digita: o rascunho é estado do cliente (`human-composer.tsx:57`), preservado no `router.refresh()`. Sem evidência dedicada (nem captura), aceito por construção.
- [ ] Dois usuários enviam quase ao mesmo tempo: **sem teste dedicado**. Pelo desenho, chaves diferentes geram reservas independentes e a thread ordena por `sentAt`; nenhuma prova executada. Lacuna menor (Lacuna 5).
- [x] Aba desatualizada depois da devolução: recusa por ENVIO-01 AC5 (`human-send.test.ts:211`).
- [x] Lead em `qualificado_agendado` assumido mantém a coluna e o lembrete: `conversation-conduction.test.ts:102`, `scheduler-conducao.test.ts:160`.
- [x] Devolução com intervalo > 12 h: `principal-reset-memoria.test.ts:96`.
- [x] Formatação do WhatsApp enviada intacta: `human-send.test.ts:253`.
- [x] Mídia sem texto com a marca: `gate-conducao-humana.test.ts:29`.
- [x] Assumir e devolver várias vezes: cada devolução grava um pedido mais novo (`conversation-conduction.test.ts:178`), e `memoryResetDue` dispara para pedido mais novo (`conduction.test.ts:98`).

---

## Discrimination Sensor

Worktree descartável `git worktree add <scratchpad>/wt-l14 67818b5`, `node_modules` por junction para o do repositório, vitest rodado a partir do diretório do repositório com `--root <worktree>` (o dotenv acha o `.env` sem ser lido nem copiado). Baseline no worktree sem mutação: 10 arquivos / 185 testes puros e estruturais e 7 arquivos / 89 testes de banco, todos verdes. Cada mutante aplicado isoladamente, confirmado por `git diff --stat`, revertido com `git checkout --` e `git status --porcelain` do worktree vazio antes do próximo. Os workflows lêem `n8n/src/*.mjs` do próprio worktree por `readInlinedModule`, então as mutações nos módulos puros chegam aos testes de workflow.

**Sensor depth**: P0 (integridade de dado, LGPD, envio a terceiros): 14 mutações manuais.

| # | Arquivo:linha | Mutação | Testes rodados | Resultado |
| --- | --- | --- | --- | --- |
| 1 | `n8n/src/gate.mjs:73` | Gate sem `humanTakeoverAt` (só `escalado_humano`) | `n8n/src/__tests__/gate*`, `principal-conducao-humana` | ✅ Morto (5 falhas, 2 arquivos) |
| 1b | `n8n/src/gate.mjs:72-73` | Marca checada antes da palavra exata de opt-out | idem | ✅ Morto (5 falhas) |
| 2a | `n8n/src/conduction.mjs:31` | `canAgentSendInTurn` ignora a marca (`!optedOutAt`) | `conduction`, `principal-conducao-humana`, `tool-responder-lead`, `scheduler-conducao` | ✅ Morto (4 falhas, 3 arquivos) |
| 2b | `n8n/src/conduction.mjs:30-31` | `canAgentSendInTurn` bloqueia `escalado_humano` | idem | ✅ Morto (1 falha: `conduction.test.ts:31`) |
| 3 | `src/lib/conversation-control.ts:36` | `remainingMs <= 0` → `< 0` (24 h exatas = aberta) | `conversation-control`, `src/server/chats/__tests__` | ✅ Morto (3 falhas, 3 arquivos) |
| 4 | `src/server/integration/parsers.ts:292` | `AGENT_WRITABLE_SENDERS` aceita `humano` | `leads-messages-post`, `parsers`, `openapi` | ✅ Morto (2 falhas) |
| 5 | `n8n/src/session.mjs:107` | `humano` semeado como `user` | `session`, `principal-reset-memoria` | ✅ Morto (4 falhas) |
| 6a | `src/server/data/index.ts:1610-1616` | Retomada da reserva sem compare-and-set (`WHERE id` só) | `src/server/data/__tests__/human-send`, `src/server/chats/__tests__/human-send` (34 testes; repetido 3×) | ❌ **Sobrevive** |
| 6b | `src/server/data/index.ts:1603` | Sem a checagem de envio em voo (`if (false)`) | idem | ✅ Morto (3 falhas) |
| 7 | `src/server/data/index.ts:1433` | Devolução sem `statusChangedBy: null` | `conversation-conduction`, `chats-actions` | ✅ Morto (2 falhas) |
| 8 | `src/server/integration/leads.ts:185` | 409 `lead-conduzido-por-humano` removido (`false &&`) | `routes/leads-patch*` | ✅ Morto (4 falhas) |
| 9 | `n8n/src/conduction.mjs:78` | `memoryResetDue` com `>=` (pedido igual = devido) | `conduction`, `principal-reset-memoria`, `scheduler-conducao` | ✅ Morto (4 falhas, 3 arquivos) |
| 10a | `src/server/data/index.ts:1387` | Assumir grava `status: "escalado_humano"` | `conversation-conduction`, `chats-actions` | ✅ Morto (1 falha: `:102`) |
| 10b | `src/server/data/index.ts:1387` | Assumir grava `statusChangedBy: "humano"` | idem | ❌ **Sobrevive** |
| 11 (extra, D12) | `n8n/src/system-message.mjs:383` | `TEAM_NOTES_INSTRUCTION` fora da composição | `system-message` | ✅ Morto (10 falhas, 2 arquivos) |

**Resultado no ciclo 1** (histórico): 13/15 mortos — **FAIL** ❌ (6a e 10b sobrevivem; mortos no ciclo 2).

Limpeza: junction removida antes (`rmdir`, `node_modules` real intacto), depois `git worktree remove --force`; `git worktree list` só com a árvore principal. `git status --porcelain` da árvore real antes e depois: ` M src/components/chats/message-thread.tsx`.

---

## Code Quality

| Princípio | Status |
| --- | --- |
| Mínimo de código / sem escopo extra | ✅ Os desvios do design estão declarados (`setLeadChannel`/`listMemoryResets` criados nas tarefas que os usam; `Code: pedidos de purga do tenant`; `nao-configurado` com `SPEC_DEVIATION` em `cloud-api.ts:16-18`) |
| Mudanças cirúrgicas | ✅ `opt-out-intent.mjs` intocado (AD-032); `gate.test.ts` existente sem alteração |
| Padrões do projeto | ✅ Escopo por `assignedTo(scope)`, `withIntegrationRoute`/`INSTRUMENTED`, `denyIfForbidden`, módulos puros inline no n8n |
| Outcome ancorado na spec | ✅ Fronteiras exatas testadas (24 h, 4.096, 2 min, 30 dias, `since` igual, pedido igual) |
| Cobertura por camada | ⚠️ Domínio 1:1 e rotas com feliz/borda/erro; o caminho concorrente da reserva não é exercitado (6a) |
| Todo teste mapeia um AC/edge/Done-when | ✅ Os títulos citam AC ou lição |
| Diretrizes: `AGENTS.md`, `CLAUDE.md`, `tasks.md` (matriz) | ⚠️ `tsc --noEmit` não está nos gates do projeto, mas o lote acrescenta 16 erros de tipo em testes (Lacuna 6) |

Observação sobre a D12: a spec registra a emenda (`spec.md:71`) e a STATE.md a AD-034. O design dizia que o `system message` não mudaria (`design.md` C8.4 e Tech Decisions) e por isso o benchmark não precisaria ser remedido (L-048). Com a D12 isso deixou de valer; a T39 já marcou os 9 tetos como `stale`, e o commit `295c23a` (fora do intervalo, não verificado aqui) registra uma remedição.

---

## Lacunas e tarefas de correção propostas

### Fix 1 — Teste da corrida de retomada da reserva não discrimina o compare-and-set (M6a) — **Major**

- **Causa**: `src/server/data/__tests__/human-send.test.ts:230-242` chama `reserveHumanSend` duas vezes em `Promise.all`, mas as duas leituras não se intercalam: a segunda vê `enviando` com idade 0 e sai pela checagem "em voo" (`index.ts:1603`). O CAS (`index.ts:1610-1616`) nunca decide nada no teste.
- **Tarefa**: testar o CAS de forma determinística. Por exemplo, chamar a retomada com uma reserva `falhou` cujo `updatedAt`/`state` muda entre a leitura e o `UPDATE` (injetando a alteração por uma segunda conexão, ou extraindo a etapa de CAS para uma função testável que recebe o `existing` lido), ou duas retomadas de uma reserva `enviando` com mais de 2 min usando o mesmo `existing` lido. Afirmar que só uma devolve `reservado`.
- **Done when**: o mutante "UPDATE só por `id`" faz o teste falhar; o código de produção não muda.

### Fix 2 — AC2 de ASSUMIR-01 não protege `statusChangedBy` (M10b) — **Major**

- **Causa**: `src/server/data/__tests__/conversation-conduction.test.ts:102` cria o lead já com `statusChangedBy: "humano"`.
- **Tarefa**: acrescentar um caso com `statusChangedBy` nulo (ou `agente`) e afirmar que continua nulo depois de assumir — é o caso que importa, porque gravar `humano` ao assumir travaria o agente depois da devolução (DEVOLVER-01 AC4).
- **Done when**: o mutante `statusChangedBy: "humano"` no `.set` de `takeOverConversation` faz o teste falhar.

### Lacuna 3 — `n8n/README.md:418` contradiz a D12 — **Minor (documental)**

- Diz que o `system message` não mudou e que o teto de contexto e o benchmark continuam valendo. A D12 (`0688deb`) mudou o `system message`.
- **Tarefa**: trocar a frase pela referência à D12 (`TEAM_NOTES_INSTRUCTION`) e à remedição do benchmark (o JSON de `295c23a`, se for o caso).

### Lacuna 4 — Capturas da T40 citadas e não versionadas — **Minor**

- HUMPROVA-01 AC2 pede "as capturas de tela do CRM" na evidência; `evidencia.md` só diz "(captura)". O lote-11 versionou capturas em `.specs/archive/lote-11-catalogo-de-imoveis/evidencia/`.
- **Tarefa**: versionar as capturas da T40 (sem PII) e citá-las por caminho, ou registrar na spec que a evidência de captura é a descrição textual (decisão do usuário).

### Lacuna 5 — Edge case de envios simultâneos sem teste — **Minor**

- **Tarefa**: em `src/server/chats/__tests__/human-send.test.ts`, dois `sendHumanMessage` com `requestId` diferentes e usuários diferentes em `Promise.all`; afirmar duas chamadas à Meta, duas mensagens e ordem por `sentAt`.

### Lacuna 6 — 16 erros de tipo novos em testes — **Minor**

- `leads-post.test.ts` (+14, TS2554), `memory-resets-get.test.ts:135` (TS2554), `n8n/src/__tests__/session.test.ts:189` (TS2322, `"sistema"`). O projeto já tinha 61; não quebram build nem testes.
- **Tarefa**: passar o 2º argumento (contexto da rota) nos novos chamados e tipar o remetente desconhecido do teste de `session` como `unknown`/cast explícito. Não corrigir os 61 antigos neste lote.

---

## Requirement Traceability (proposta; a spec não foi editada pelo Verifier)

| Requisito | Status proposto |
| --- | --- |
| ASSUMIR-01 | ❌ Needs Fix (Fix 2) |
| SILENCIO-01 | ✅ Verified |
| ENVIO-01 | ❌ Needs Fix (Fix 1) |
| JANELA-01 | ✅ Verified |
| THREAD-01 | ✅ Verified |
| DEVOLVER-01 | ✅ Verified |
| OPTHUM-01 | ✅ Verified |
| CONTRATO-01 | ✅ Verified |
| CONTRATO-02 | ✅ Verified |
| HUMPROVA-01 | ⚠️ Verified com ressalva (Lacuna 4) |
| HUMDOC-01 | ⚠️ Verified com ressalva (Lacuna 3) |

---

## Summary

**Overall**: ❌ Not Ready — só por discriminação de teste e documentação; nenhum defeito de comportamento encontrado.

**Spec-anchored check**: 78 ACs com evidência `file:line` ou execução real; 4 ressalvas.
**Sensor**: 13/15 mortos (sobrevivem 6a e 10b).
**Gate**: suíte 2.397/2.399 (só as 2 falhas conhecidas de `DOCLIM-01 AC8`); lint 0 erros; build verde; `tsc` falha (61 pré-existentes + 16 do lote, todos em testes).

**Próximos passos**: Fix 1 e Fix 2 (só testes), Lacuna 3 (uma frase do README); Lacunas 4–6 a critério do usuário. Depois, novo ciclo do Verifier sobre o delta, repetindo os mutantes 6a e 10b.

**Sinal para lições** (não registrado pelo Verifier, que só escreve este arquivo): teste de concorrência com `Promise.all` sobre o pool não garante intercalação, e fixture de antes/depois que já nasce com o valor que a mutação gravaria não prova nada.
