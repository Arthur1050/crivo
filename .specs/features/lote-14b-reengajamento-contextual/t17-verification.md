# T17 — listar candidatos por ação

PASS pelo root: regate Full exit0, 7/7 arquivos, 151/151 testes, 139,13s,
início 2026-10-03 08:42:42 America/Sao_Paulo. São 25 novos e 126 regressões.
Comando: `node node_modules/vitest/vitest.mjs run src/server/reengagement/__tests__/candidates.test.ts src/server/reengagement/__tests__/agent-state.test.ts src/db/__tests__/schema-reengagement.test.ts n8n/src/__tests__/reengagement.test.ts n8n/src/__tests__/conduction.test.ts n8n/src/__tests__/business-hours.test.ts n8n/src/__tests__/phone.test.ts`.
ESLint direcionado exit0; tsc exit2/50 diagnósticos anteriores iguais ao baseline,
delta vazio. Spec/tasks strict: zero erros/avisos; whitespace exit0. Logs locais
t17-tests.local.log, t17-regate.local.log e t17-types.local.log. Código/testes
congelados após PASS; nenhuma migração ou produção tocada.

Gate inicial exit1, 131/150 testes, 6/7 arquivos, 138,28s, início 08:35:45:
19 falhas novas em candidates, cinco guardas passaram e 126 regressões passaram.
Causa: `row.anchorSentAt.toISOString is not a function`. O driver instalado
em node_modules/drizzle-orm/node-postgres/session.js:26 e:64 preserva strings
para TIMESTAMPTZ/TIMESTAMP/DATE no raw execute; seu genérico só anota o tipo.
CandidateRow foi corrigido para string|null e decoder explícito valida nove
timestamps antes de usar Date. Os24 cenários/asserções anteriores foram mantidos.
Adicionou-se caso real com reset solicitado/observado infinity, instante especial
do PostgreSQL, para provar falha fechada em dado crítico inválido. A afirmação
inicial de que invalidez não seria representável no PostgreSQL foi corrigida;
o suporte está documentado em [valores especiais de data/hora](https://www.postgresql.org/docs/current/datatype-datetime.html#DATATYPE-DATETIME-SPECIAL-VALUES).

listCandidates recebe AuthResult previamente autorizado. limit padrão100,
inteiro1..100. Sucesso contém ok:true/candidates/cutoffAt/nextCursor; erros
internos são invalid-limit, invalid-cursor e tenant-not-found. Itens contêm
leadId/anchorMessageId/anchorSentAt ISO/phoneNumberId/action, somente. Cursor
base64url canônico guarda version1/tenant/corte/último ID EXAMINADO; páginas
vazias podem ter continuação. Settings mais consulta lateral limitada a limit+1
leads evitam varredura para preencher página. createdAt posterior aguarda novo
tick. Corte estabiliza relógio; não promete snapshot MVCC entre paginações.
Lead/âncora/canal/projeção/reset e episódio são lidos atuais; reserva/autorização
revalidarão fatos vivos. Âncora sem canal ou conflitante falha fechada.

## Adequação forward e reverse

`test` significa src/server/reengagement/__tests__/candidates.test.ts. Há 15 casos
não parametrizados e dez parametrizados: fase 2, proteção 4 e limit 4 = 25.
Cada expressão abaixo liga o resultado ao AC/Done when e de volta ao cenário.
Os ACs atribuídos diretamente pela matriz são REEN-01 AC1/3, REEN-03 AC9 e
L14B-01 AC1; os demais correspondem às proteções/ações do Done when T17,
com somente a parcela de seleção provada. Nenhuma afirmação de AC integral,
claim ou envio; nenhuma asserção antiga removida, pulada ou enfraquecida.

| AC / Done when / cenário | file:line + expressão | Esperado aprovado | Reverse |
| --- | --- | --- | --- |
| REEN-01 AC1; T17 limites22/24/48 (1) | test:50 `expect(rows.map((row) => row.leadId)).not.toContain(early.lead.id)`; test:52 `expect(rows).toContainEqual({ leadId: row.lead.id, anchorMessageId: row.anchor.id, anchorSentAt: row.anchor.sentAt.toISOString(), phoneNumberId: phoneA, action })` com prepare22h/24h−1, omit24h, escalate48h | 22h−1 excluída; IDs/ações exatos nas fronteiras | Manter: ações por relógio da âncora |
| REEN-01 AC3; REEN-05 AC2 (seleção); T17 horário (1) | test:63 prepare `not.toContain`; test:64 `expect(rows.find((row) => row.leadId === omit.lead.id)?.action).toBe("omit")`; test:65 mesma expressão escalate | Fora de horário adia prepare, mantém ações internas24/48h; ownership real com usageEnabled=false e token vazio não bloqueia | Manter: horário e independência |
| T17 unknown/encerrada; REEN-01 AC5/6 (seleção) (2) | test:70 `expect((await all()).map((item) => item.leadId)).not.toContain(row.lead.id)`; parâmetros literais null/encerrada em test:68 | Nenhuma fase presumida ou encerrada selecionada | Manter: fases |
| T17 fatos correntes; REEN-01 AC6/REEN-03 AC3 (seleção) (1) | test:79 `for (const row of [absent, old, reset]) expect(ids).not.toContain(row.lead.id)` | Estado ausente, âncora anterior a inbound novo e reset não observado excluem | Manter: projeção ligada aos fatos |
| T17 dado ilegível; REEN-01 AC6 (seleção) (1) | test:89 `expect((await all()).map((item) => item.leadId)).not.toContain(row.lead.id)` após CTE real test:84 com resetRequestedAt/resetObservedAt infinity | Decoder não converte invalidez em null/null elegível | Manter: falha fechada real |
| T17 canal desconhecido; REEN-01 AC6/L14B-01 AC1 (1) | test:99 `for (const row of [absent, foreign, untrusted]) expect(ids).not.toContain(row.lead.id)` | Canal ausente/alheio/sem ownership excluem | Manter: canal confiável por tenant |
| T17 canal da âncora; REEN-01 AC6 (1) | test:107 `expect(ids).not.toContain(legacy.lead.id); expect(ids).not.toContain(changed.lead.id)` | NULL histórico e canal conflitante não herdam lead atual | Manter: correlação factual |
| T17 episódio/lease (1) | test:114 active `not.toContain`; test:115 `expect(rows.find((row) => row.leadId === expired.lead.id)?.action).toBe("prepare")` | Lease viva+1ms aguarda; vencida exata seleciona preparação | Manter: prazo antes do claim |
| T17 episódio consumido; REEN-03 AC8 (seleção) (1) | test:124 `for (const row of [consumed, cancelled, alreadyOmitted, sentOmit]) expect(ids).not.toContain(row.lead.id)` | Marker uncertain/refused e terminal cancelled/omitted não selecionam prepare/omit; reset observado/revisão2 não rearma marker | Manter: consumo da chave |
| REEN-03 AC9; T17 nova âncora (1) | test:132 `expect(await all()).toContainEqual({ leadId: row.lead.id, anchorMessageId: latest.id, anchorSentAt: latest.sentAt.toISOString(), phoneNumberId: phoneA, action: "prepare" })`; test:133 episódio anterior `toEqual(episode)` | Nova âncora real com projeção corrente seleciona outra chave e conserva episódio consumido inteiro | Manter: novo silêncio sem apagar prova |
| T17 escalada; REEN-05 AC2/6 (seleção) (1) | test:140 `expect(rows.find((row) => row.leadId === consumed.lead.id)?.action).toBe("escalate")`; test:141 done/locked `not.toContain` | 48h seleciona mesmo despacho uncertain consumido; já escalado ou statusChangedBy humano excluem | Manter: eixo independente e trava |
| T17 opt-out/humano/pipeline; REEN-01 AC5 (seleção) (4) | test:148 `expect((await all()).map((item) => item.leadId)).not.toContain(row.lead.id)` para optedOutAt, humanTakeoverAt, escalado_humano, qualificado_agendado em test:144 | Todas as quatro proteções excluem mesmo48h | Manter: elegibilidade |
| L14B-01 AC1; T17 tenant/DTO (1) | test:153 tenantA `not.toContain`; test:155 tenantB `toEqual([{ leadId: row.lead.id, anchorMessageId: row.anchor.id, anchorSentAt: row.anchor.sentAt.toISOString(), phoneNumberId: phoneB, action: "prepare" }])`; test:156 keys `toEqual(["action", "anchorMessageId", "anchorSentAt", "leadId", "phoneNumberId"])`; test:157/158 JSON `not.toContain` destino/conteúdo | Só IDs do tenant autorizado; DTO sem conteúdo/destino/frame | Manter: limite de dados |
| T17 limit inválido (4) | test:162 `expect(await run({ limit })).toEqual({ ok: false, reason: "invalid-limit" })` para0/101/1.5/−1 em test:161 | Inteiro1..100 obrigatório | Manter: limite explícito |
| T17 cursor; L14B-01 AC1 (1) | test:166 inválido `toEqual({ ok: false, reason: "invalid-cursor" })`; test:168 primeira página ok:true; test:170 cursor alheio mesma recusa; test:173 corte futuro mesma recusa | Não reutiliza cursor inválido/alheio/futuro | Manter: escopo e relógio |
| T17 tenant ausente/erro sem escrita (1) | test:179 `expect(await run({}, now, missingTenant)).toEqual({ ok: false, reason: "tenant-not-found" })`; test:180 tenant `toEqual([])`; test:181 leads `toEqual(before)` | Recusa tenant inexistente sem criá-lo/alterar leads | Manter: ramo de erro |
| T17 página vazia/corte/createdAt (1) | test:194 `expect(first).toMatchObject({ ok: true, candidates: [], cutoffAt: now })`; test:199 `expect(second).toEqual({ ok: true, candidates: [{ leadId: visible.lead.id, anchorMessageId: visible.anchor.id, anchorSentAt: visible.anchor.sentAt.toISOString(), phoneNumberId: isolatedPhone, action: "prepare" }], cutoffAt: now, nextCursor: null })`; test:200 `expect(await run({}, nextClock, isolatedTenant)).toEqual({ ok: true, candidates: [{ leadId: visible.lead.id, anchorMessageId: visible.anchor.id, anchorSentAt: visible.anchor.sentAt.toISOString(), phoneNumberId: isolatedPhone, action: "omit" }, { leadId: added.lead.id, anchorMessageId: added.anchor.id, anchorSentAt: added.anchor.sentAt.toISOString(), phoneNumberId: isolatedPhone, action: "prepare" }], cutoffAt: nextClock, nextCursor: null })` | Página vazia avança pelo examinado; 24h−1 não vira omit na continuação+1ms; lead criada após corte só aparece no novo tick | Manter: paginação sem perda e corte fixo |
| T17 leitura limitada/100/inelegíveis (1) | test:223 `expect(query).toHaveBeenCalledTimes(2)`; test:224 `expect((await query.mock.results[1].value).rows).toHaveLength(101)`; test:226 `expect(first.candidates).toHaveLength(100)`; test:229 `expect(second.candidates).toHaveLength(2); expect(second.nextCursor).toBeNull()`; test:230 `expect([...first.candidates, ...second.candidates].map((row) => row.leadId).sort()).toEqual(bulkLeads.map((row) => row.id).sort())`; test:234 `expect(ineligible).toMatchObject({ ok: true, candidates: [] })`; test:236 `expect(ineligible.nextCursor).not.toBeNull()`; test:237 `expect(query).toHaveBeenCalledTimes(2)`; test:238 `expect((await query.mock.results[1].value).rows).toHaveLength(101)` | Com 102 leads, banco devolve 101 por primeira página, saída 100+2 sem perda. Com 102 inelegíveis não varre para preencher, preserva continuação | Manter: LIMIT SQL observável pelo resultado real |

Todos os 25 cenários e três razões de erro foram cobertos. Não há disputa de escrita
em T17, que apenas lê; os locks/CAS serão T18/T20/T23. Invalidação automática de
inbound será T27 e scheduler/rotas/workflows seguem pendentes. Fixtures sintéticas
e teardown restritos aos próprios tenants/IDs, episodes antes de mensagens/canais
em afterAll e try/finally; nunca DATABASE_URL fallback ou limpeza global.
