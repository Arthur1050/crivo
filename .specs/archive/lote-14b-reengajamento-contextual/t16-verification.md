# T16 — publicar estado do agente com revisão

PASS pelo root: Full exit0, 6/6 arquivos e 130/130 testes, 77,32s, início
2026-10-03 08:14:50 America/Sao_Paulo. São 20 novos e 110 regressões. Comando:
`node node_modules/vitest/vitest.mjs run src/server/reengagement/__tests__/agent-state.test.ts src/db/__tests__/schema-agent-state.test.ts src/server/data/__tests__/conversation-conduction.test.ts n8n/src/__tests__/reengagement.test.ts n8n/src/__tests__/phase.test.ts n8n/src/__tests__/conduction.test.ts`.
ESLint direcionado exit0; tsc exit2/50 diagnósticos iguais ao baseline, delta
vazio. Spec/tasks strict: zero erros/avisos; whitespace exit0. Logs somente
locais: t16-tests.local.log e t16-types.local.log. Código/testes congelados.

publishAgentState recebe AuthResult autorizado e trava lead primeiro.
Primeira publicação expectedRevision0 cria revision1; mudanças exigem revisão
atual e incrementam uma vez. Replay idêntico aceita revisão atual ou atual−1
após conferir âncora/reset vivos, sem alterar revisão/updatedAt. Revisão999
recusa mesmo com conteúdo igual. Encerrada não reabre na mesma âncora/reset.
A âncora vem de sender=lead por sentAt/id decrescentes nas conversas da mesma
lead/tenant. Nenhuma escrita altera lead, thread, pipeline ou condução.
Unknown continua null e bloqueia a política. Invalidação automática de inbound
será T27; reset/opt-out/condução e consumidores continuam nas tarefas futuras.

## Adequação forward e reverse

`test` significa src/server/reengagement/__tests__/agent-state.test.ts. As 14
linhas não parametrizadas e seis inválidos totalizam 20 cenários. Cada linha
mapeia a asserção para o resultado aprovado e de volta ao requisito. Códigos
são internos; a fronteira HTTP será T35. Nenhum teste antigo foi alterado,
removido, pulado ou enfraquecido. Antes do gate, revisão acrescentou sucesso
inicial explícito do replay, revisão999 recusada e payload literal na disputa.

| AC / Done when / cenário | file:line + expressão | Esperado da spec/Design | Reverse |
| --- | --- | --- | --- |
| T16 estado válido; REEN-01 AC6; L14B-01 AC1 (1) | test:51 `expect(result).toEqual({ ok: true, replay: false, state: { tenantId: tenantA, leadId: row.lead.id, anchorMessageId: row.anchor.id, phase: "qualificando", askedFields: ["modality"], openingHistory: ["hmm"], resetObservedAt: null, revision: 1, updatedAt: now } })`; test:52 `expect(await state(row)).toEqual(result.ok ? [result.state] : [])`; test:53 lead `toEqual(beforeLead)`; test:54 mensagens `toEqual(beforeMessages)` | Projeção inteira com revisão1, sem pipeline/inbound sintético | Manter: payload e efeitos limitados |
| REEN-01 AC6, unknown (1) | test:59 `expect(result.ok && result.state.phase).toBeNull()`; test:60 `expect(evaluateReengagement({ lead: row.lead, anchor: { messageId: row.anchor.id, sentAt: row.anchor.sentAt }, phase: result.ok ? result.state.phase : undefined, channel: { phoneNumberId: "123456789" }, destination: "5534999990001", now })).toEqual({ action: null, reason: "unknown-data" })` | Unknown não vira qualificação por fallback | Manter: estado→política |
| T16 revisão errada (1) | test:65 `expect(await publish(row, { expectedRevision: 1 })).toEqual({ ok: false, reason: "revision-conflict" })`; test:66 `expect(await state(row)).toEqual([])`; test:68 revisão0/dados diferentes recusa; test:69 `expect(await state(row)).toEqual(before)` | Sem criação/alteração com revisão incompatível | Manter: CAS |
| T16 replay (1) | test:74 `expect(first).toMatchObject({ ok: true, replay: false, state: { revision: 1, anchorMessageId: row.anchor.id, phase: "qualificando", askedFields: ["modality"], openingHistory: ["hmm"], resetObservedAt: null } })`; test:75 `expect(await publish(row)).toEqual(first.ok ? { ...first, replay: true } : first)`; test:76 mesma expressão com expectedRevision1; test:77 `expect(await publish(row, { expectedRevision: 999 })).toEqual({ ok: false, reason: "revision-conflict" })`; test:78 estado igual | Retry0/1 não escreve; revisão arbitrária recusa | Manter: idempotência limitada |
| T16 atualização válida (1) | test:84 `expect(result).toMatchObject({ ok: true, replay: false, state: { revision: 2, phase: "agendando", askedFields: ["modality", "region", "propertyType"], openingHistory: ["hmm", "certo"], anchorMessageId: row.anchor.id, resetObservedAt: null } })`; test:85 lead `toEqual(before)` | Só projeção muda, com campos completos e revisão2 | Manter: publicação revisada |
| REEN-01 AC5; T16 execução antiga/encerramento (1) | test:90 `expect(await publish(row, { expectedRevision: 1 })).toEqual({ ok: false, reason: "phase-closed" })`; test:91 estado igual; test:92 `expect(await publish(row, { phase: "encerrada" })).toMatchObject({ ok: true, replay: true, state: { phase: "encerrada", revision: 1 } })` | Não reabre encerrada da mesma âncora/reset; fechamento idêntico é replay | Manter: fechamento |
| REEN-03 AC3; T16 âncora antiga (1) | test:98 `expect(await publish(row)).toEqual({ ok: false, reason: "context-changed" })`; test:99 mesma recusa com revisão1/agendando; test:100 estado igual; test:101 `expect(await publish(row, { anchorMessageId: latest.id, expectedRevision: 1 })).toMatchObject({ ok: true, replay: false, state: { anchorMessageId: latest.id, revision: 2 } })` | Turno antigo não substitui inbound novo | Manter: âncora corrente |
| T16 fora de ordem/saídas (1) | test:111 `expect(await publish(row, { anchorMessageId })).toEqual({ ok: false, reason: "context-changed" })` para late/agente/humano; test:112 estado vazio; test:114 âncora real aceita; test:115 `expect((await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]).toEqual(row.lead)`; test:116 `expect(await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id))).toEqual(beforeMessages)` | Saídas/late não fabricam inbound ou alteram pipeline/thread | Manter: autoridade cronológica |
| T16 empate sentAt (1) | test:123 `expect(await publish(row, { anchorMessageId: previous })).toEqual({ ok: false, reason: "context-changed" })`; test:124 `expect(await publish(row, { anchorMessageId: latest })).toMatchObject({ ok: true, state: { anchorMessageId: latest } })` | MaiorID é desempate determinístico | Manter: sentAt/id |
| L14B-01 AC1; T16 outra lead (1) | test:129 `expect(await publish(row, { anchorMessageId: other.anchor.id })).toEqual({ ok: false, reason: "context-changed" })`; test:130 `expect(await state(row)).toEqual([])` e mesmo assert other | FK tenant/message não concede outra lead | Manter: mesma lead |
| L14B-01 AC1; T16 tenant (1) | test:135 `expect(await publishAgentState({ tenantId: tenantB }, row.lead.id, input(row))).toEqual({ ok: false, reason: "lead-not-found" })`; test:138 âncora foreign `toEqual({ ok: false, reason: "context-changed" })`; test:136/139 estados vazios | Não publica no tenant alheio | Manter: escopo autorizado |
| REEN-03 AC3; REEN-04 AC6, reset (1) | test:145 `expect(await publish(row)).toEqual({ ok: false, reason: "context-changed" })`; test:146 fechamento com reset antigo recusa; test:147 estado igual; test:148 `expect(await publish(row, { expectedRevision: 1, resetObservedAt: new Date(now.getTime()) })).toMatchObject({ ok: true, replay: false, state: { resetObservedAt: now, revision: 2 } })` | Reset corrente obrigatório para replay/fechamento; observado exato permite atualização | Manter: contexto vivo |
| REEN-01 AC6; T16 inválidos (6) | test:157 `expect(await publish(row, patch)).toEqual({ ok: false, reason: "invalid-state" })`; test:158 `expect(await state(row)).toEqual([])` | Enum inventado, campo desconhecido/>8, abertura não-string, revisão negativa e reset inválido não escrevem | Manter: limites existentes |
| T16 falha não bloqueia humano (1) | test:164 `await expect(publish(row, {}, database)).rejects.toThrow("fixture-rollback")`; test:165 estado vazio; test:167 `expect(taken.outcome).toBe("assumido")`; test:169 `expect(persisted.humanTakeoverAt).toEqual(now)` e `expect(persisted.humanTakeoverBy).toBe(human)`; test:170 `expect(persisted.status).toBe("em_qualificacao")` e `expect(persisted.statusChangedBy).toBeNull()` | Rollback após insert desfaz projeção; takeover persiste sem mudar pipeline | Manter: atomicidade/independência |
| T16 concorrência real (1) | test:183 `expect(pids[0]).not.toBe(pids[1])`; test:189 `expect(waiting).toBe(2)` antes COMMIT; test:191 `expect(results.filter((result) => result.ok)).toHaveLength(1)`; test:192 `expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "revision-conflict" }])`; test:194 `expect(winner?.ok && winner.state).toEqual(persisted)` e `expect(persisted.revision).toBe(1)`; test:195 `expect(persisted).toEqual({ tenantId: tenantA, leadId: row.lead.id, anchorMessageId: row.anchor.id, phase: results[0].ok ? "qualificando" : "agendando", askedFields: ["modality"], openingHistory: ["hmm"], resetObservedAt: null, revision: 1, updatedAt: now })`; test:198 `expect(await state(row)).toHaveLength(1)` | BEGIN fixa dois PIDs, ambos aguardam lead; um vencedor/revisão e outro conflito, payload íntegro | Manter: lock/CAS sem banco mock |

Todos os 20 cenários têm valores/estados e resultado aprovado. Payload completo,
persistência, lock real e rollback foram afirmados; nenhuma lacuna de T16.
Diretrizes: AGENTS.md, vitest.config.ts, TEST_DATABASE_URL e matriz de serviço.
Fixtures/teardown restritos a IDs próprios. Sem migração/produção/efeito externo.
