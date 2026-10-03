# T9 — ingestão de status

PASS local: Full de correção pelo root, exit0, 5/5 arquivos, 75/75 testes,
61,79s, início em 2026-10-02 20:51:52 America/Sao_Paulo. São 16 novos +
59 regressões (T8/canais/schema-recibos/auth). Comando:
`node node_modules/vitest/vitest.mjs run src/server/whatsapp/__tests__/statuses-ingest.test.ts src/server/whatsapp/__tests__/pricing-classification.test.ts src/server/whatsapp/__tests__/channels.test.ts src/db/__tests__/schema-whatsapp-receipts.test.ts src/server/integration/__tests__/auth.test.ts`.
ESLint direcionado exit0; tsc mantém as 50 linhas de erro anteriores, comparação
vazia contra phase-1-types.local.log. Sem delta de schema ou SPEC_DEVIATION.

Primeiro Full: exit1, 74/75 testes, 4/5 arquivos, 59,84s, em 2026-10-02
20:49:06 America/Sao_Paulo. Falha única na medição da fixture concorrente:
PIDs autocommit iguais a 1007, antes de iniciar as transações em disputa.
Corrigida a observação para SELECT pg_backend_pid dentro de cada transação
real, antes de chamar a ingestão; asserções de PIDs distintos, dois locks
observados e estado idempotente mantidas. Produção não alterada por essa falha.
[Neon transaction pooling](https://neon.com/blog/survive-thousands-connections)
e [pool_mode do PgBouncer](https://www.pgbouncer.org/config) explicam a liberação
do backend entre transações. A prova relevante é feita durante BEGIN..COMMIT.

Contexto de origem é opaque, registrado em WeakSet no servidor. A factory exige
autenticação existente, prova concreta da versão do forwarder e hash da sua
credencial autenticada; default sem prova recusa. Prova é configuração do
servidor, nunca campo do caller. Fixtures sintéticas não comprovam HMAC instalado;
T43/T49 devem preservar esse gate antes de ativar o encaminhamento real.

Validação integral antecede escrita. Canal é revalidado sob lock; órfãos entram
em bulk, evidências são lidas sob FOR UPDATE em ordem de wamid, e somente linhas
alteradas são atualizadas em bulk. Vínculo, firstSeen e expiração não são
rearmados por replay; lastSeen não regride. Recibo só guarda metadados limitados.
Nenhum agente, mensagem sintética, inbound, episódio ou volume é produzido.

## Adequação forward

`test` abaixo significa `src/server/whatsapp/__tests__/statuses-ingest.test.ts`.
Todos os critérios T9 têm expressão localizada e resultado derivado da spec/Design.

| AC/cenário | file:line + expressão | Esperado | Coberto |
| --- | --- | --- | --- |
| PRECO-02 AC1, origem/default | test:69 `expect(createStatusForwardingContext({ tenantId: tenantA }, requestA)).toBeNull()`; test:70 `expect(await ingestStatusBatch({ tenantId: tenantA, verified: true }, batch([item]))).toEqual({ ok: false, reason: "origin-unverified" })`; test:71 `expect(await receipt(item.wamid)).toEqual([])` | Default/claim bruto recusado, sem escrita | Sim |
| PRECO-02 AC1, prova concreta | test:79 `expect(createStatusForwardingContext({ tenantId: tenantA }, requestA, { ...proof, ...patch } as StatusForwarderProof)).toBeNull()`; test:81 `expect(createStatusForwardingContext({ tenantId: tenantA }, requestB, proof)).toBeNull()` | Versão/assinatura/credencial não provadas não concedem contexto | Sim |
| PRECO-02 AC3, replay | test:89 `expect(await receipt(item.wamid)).toEqual(first)`; test:90 `expect(first[0].classification).toBe("free_service")`; test:91 `expect(first[0].firstSeenAt).toEqual(now)`; test:92 `expect(first[0].lastSeenAt).toEqual(now)`; test:93 `expect(first[0].orphanExpiresAt!.getTime() - now.getTime()).toBe(30 * 24 * 60 * 60 * 1000)` | Uma linha idêntica, TTL30d inalterado | Sim |
| PRECO-02 AC2, canais/tenants | test:101 `expect((await receipt(item.wamid))[0].classification).toBe("free_service")`; test:102 `expect((await receipt(item.wamid, tenantA, phones[1]))[0].classification).toBe("paid_service")`; test:103 `expect((await receipt(item.wamid, tenantB, phones[2]))[0].classification).toBe("not_delivered")` | Mesmo wamid distingue tenant/número | Sim |
| PRECO-02 AC8; L14B-01 AC1 | test:109 `expect(await ingestStatusBatch(contextA, batch([item], phoneNumberId), { now })).toEqual({ ok: false, reason: "channel-untrusted" })`; test:111 `expect(await receipt(item.wamid)).toEqual([])` | Tenant errado/canal ausente/sem ownership recusados | Sim |
| Validação integral | test:116 `expect(await ingestStatusBatch(contextA, batch([item, status({ status: "unknown" })]), { now })).toEqual({ ok: false, reason: "invalid-batch" })`; test:117 `expect(await receipt(item.wamid)).toEqual([])` | Item inválido impede escrita parcial | Sim |
| Enum runtime | test:123 `expect(await ingestStatusBatch(contextA, batch([item, status({ status: invalid })]), { now })).toEqual({ ok: false, reason: "invalid-batch" })`; test:124 `expect(await receipt(item.wamid)).toEqual([])` | Array/object/número/null não são string de status | Sim |
| L14B-01 AC4, erro persistência | test:132 `expect(await ingestStatusBatch(contextA, batch([item]), { now, database: { transaction } })).toEqual({ ok: false, reason: "persistence-failed" })`; test:133 `expect(await receipt(item.wamid)).toEqual([])`; test:135 `expect(JSON.stringify(log.mock.calls)).not.toContain(keyA)`; test:136 `expect(JSON.stringify(log.mock.calls)).not.toContain("conversa privada")` | Falha limitada, sem erro bruto/segredo/conteúdo | Sim |
| Limite100/101 | test:141 `expect(await ingestStatusBatch(contextA, batch(hundred), { now })).toEqual({ ok: true, processed: 100 })`; test:142 `expect(await db.select().from(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.wamid, hundred.map((item) => item.wamid)))).toHaveLength(100)`; test:144 `expect(await ingestStatusBatch(contextA, batch(tooMany), { now })).toEqual({ ok: false, reason: "invalid-batch" })`; test:145 `expect(await receipt(tooMany[0].wamid)).toEqual([])` | 100 persistem; 101 não escreve | Sim |
| Limite bytes | test:150 `expect(Buffer.byteLength(JSON.stringify(batch(items)), "utf8")).toBeGreaterThan(100 * 1024)`; test:151 `expect(await ingestStatusBatch(contextA, batch(items), { now })).toEqual({ ok: false, reason: "body-too-large" })`; test:152 `expect(await receipt(items[0].wamid)).toEqual([])` | UTF8 acima100KiB recusado sem escrita | Sim |
| PRECO-02 AC5/7; USO-01 AC5 | test:177 `expect(orphan.messageId).toBeNull()`; test:178 `expect(orphan.orphanExpiresAt).toEqual(new Date("2026-11-01T12:00:00Z"))`; test:179 `expect(await db.select().from(messages).where(eq(messages.tenantId, tenantA))).toEqual(beforeMessages)`; test:180 `expect(await db.select().from(leads).where(eq(leads.tenantId, tenantA))).toEqual(beforeLeads)`; test:181 `expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantA))).toEqual(beforeEpisodes)`; test:182 `expect(await db.select().from(whatsappUsage).where(eq(whatsappUsage.tenantId, tenantA))).toEqual(beforeUsage)`; test:183 `expect(await db.select().from(leadAgentState).where(eq(leadAgentState.tenantId, tenantA))).toEqual(beforeAgent)`; test:184 `expect((await db.select().from(messages).where(eq(messages.id, inbound.id)))[0].sentAt).toEqual(new Date("2026-10-01T10:00:00Z"))` | Órfão sem bolha; lead/inbound/episódio consumido/estado4/volume937 intactos | Sim |
| PRECO-02 AC4/6, ordem/conflito | test:192 `expect(first.classification).toBe("free_service")`; test:193 `expect(first.deliveredAt).toEqual(new Date("2026-10-02T11:00:00Z"))`; test:194 `expect(first.readAt).toEqual(new Date("2026-10-02T11:00:00Z"))`; test:195 `expect(first.sentAt).toEqual(new Date("2026-10-02T10:00:00Z"))`; test:196 `expect(first.lastSeenAt).toEqual(later)`; test:199 `expect(conflict.lastSeenAt).toEqual(later)`; test:200 `expect(conflict.pricingConflict).toBe(true)`; test:201 `expect(conflict.classification).toBe("unavailable")`; test:203 `expect(await receipt(item.wamid)).toEqual([conflict])` | Sent conserva delivery/read; conflito persiste; lastSeen não regride | Sim |
| PRECO-01 AC5, runtime/raw | test:215 `expect(await ingestStatusBatch(contextA, batch([item]), { now })).toEqual({ ok: false, reason: "invalid-batch" })`; test:216 `expect(await receipt(item.wamid)).toEqual([])` | Datas inválidas/sem fuso/pricing inválido/código inválido/raw recusados | Sim |
| PRECO-01 AC5; L14B-01 AC5 | test:224 `expect(row.pricingModel).toBe("novo-contrato")`; test:225 `expect(row.category).toBe("service")`; test:226 `expect(row.pricingType).toBeNull()`; test:227 `expect(row.billable).toBeNull()`; test:228 `expect(row.classification).toBe("unavailable")`; test:229 `expect(Object.keys(row).sort()).toEqual([...].sort())` | Parcial/desconhecido indisponível, somente18campos normalizados | Sim |
| L14B-01 AC4, log recusa | test:236 `expect(result).toEqual({ ok: false, reason: "invalid-batch" })`; test:237 `expect(log).toHaveBeenCalledWith({ event: "whatsapp-status-refused", tenantId: tenantA, reason: "invalid-batch" })`; test:238 `expect(JSON.stringify([result, log.mock.calls])).not.toContain(keyA)`; test:239 `expect(JSON.stringify([result, log.mock.calls])).not.toContain("conversa privada")` | Motivo operacional, sem token/conversa | Sim |
| PRECO-02 AC3, disputa real | test:277 `expect(pidA).not.toBe(pidB)`; test:284 `expect(waiting).toBe(2)`; test:286 `expect(await Promise.all(pending)).toEqual([{ ok: true, processed: 2 }, { ok: true, processed: 2 }])`; test:287 `expect(await receipt(itemA.wamid)).toHaveLength(1)`; test:288 `expect(await receipt(itemB.wamid)).toHaveLength(1)`; test:289 `expect((await receipt(itemA.wamid))[0].classification).toBe("free_service")`; test:290 `expect((await receipt(itemB.wamid))[0].classification).toBe("free_service")` | Dois backends dentro tx, dois locks e um estado consistente por wamid | Sim |

## Adequação reverse

As expressões adicionais de payload/retorno de sucesso de cada cenário pertencem
ao mesmo resultado da linha forward. Nenhuma asserção/cenário amplia a spec.

| file:line + expressão principal | Mapeia para | Manter |
| --- | --- | --- |
| test:70 `expect(await ingestStatusBatch({ tenantId: tenantA, verified: true }, batch([item]))).toEqual({ ok: false, reason: "origin-unverified" })` | PRECO-02 AC1 | Sim |
| test:79 `expect(createStatusForwardingContext({ tenantId: tenantA }, requestA, { ...proof, ...patch } as StatusForwarderProof)).toBeNull()` | PRECO-02 AC1 | Sim |
| test:89 `expect(await receipt(item.wamid)).toEqual(first)` | PRECO-02 AC3, TTL A13 | Sim |
| test:101 `expect((await receipt(item.wamid))[0].classification).toBe("free_service")` | PRECO-02 AC2; PRECO-01 AC1/2/6 (três canais) | Sim |
| test:109 `expect(await ingestStatusBatch(contextA, batch([item], phoneNumberId), { now })).toEqual({ ok: false, reason: "channel-untrusted" })` | PRECO-02 AC8; L14B-01 AC1 | Sim |
| test:117 `expect(await receipt(item.wamid)).toEqual([])` | T9 lote inválido sem escrita parcial | Sim |
| test:124 `expect(await receipt(item.wamid)).toEqual([])` | T9 contrato runtime/validação integral | Sim |
| test:132 `expect(await ingestStatusBatch(contextA, batch([item]), { now, database: { transaction } })).toEqual({ ok: false, reason: "persistence-failed" })` | T9 ramo erro; L14B-01 AC4 | Sim |
| test:142 `expect(await db.select().from(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.wamid, hundred.map((item) => item.wamid)))).toHaveLength(100)` | T9 limite100/101 | Sim |
| test:151 `expect(await ingestStatusBatch(contextA, batch(items), { now })).toEqual({ ok: false, reason: "body-too-large" })` | T9 teto bytes; Design100KiB | Sim |
| test:181 `expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantA))).toEqual(beforeEpisodes)` | PRECO-02 AC5/7; USO-01 AC5, antes/depois completos | Sim |
| test:203 `expect(await receipt(item.wamid)).toEqual([conflict])` | PRECO-02 AC4/6; ordem/replay | Sim |
| test:216 `expect(await receipt(item.wamid)).toEqual([])` | T9 validação; PRECO-01 AC5 | Sim |
| test:228 `expect(row.classification).toBe("unavailable")` | PRECO-01 AC5; L14B-01 AC5 | Sim |
| test:238 `expect(JSON.stringify([result, log.mock.calls])).not.toContain(keyA)` | L14B-01 AC4 | Sim |
| test:284 `expect(waiting).toBe(2)`; test:287 `expect(await receipt(itemA.wamid)).toHaveLength(1)` | PRECO-02 AC3; T9 concorrência real | Sim |

Checks A/B/C/D: critérios locais cobertos com estado/valor, sem mocks como prova
de lock; 16 cenários necessários; fixtures/teardown próprios, TEST_DATABASE_URL,
Vitest e matriz de tasks.md seguidos. Transporte real/autenticidade instalada
permanecem não comprovados; isso não é declarado satisfeito pela fixture.
