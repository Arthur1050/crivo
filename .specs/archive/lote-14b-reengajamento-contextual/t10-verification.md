# T10 — correlação de recibos

PASS local: Full pelo root, exit0, 5/5 arquivos, 70/70 testes, 85,52s,
início em 2026-10-02 23:22:02 America/Sao_Paulo. São 9 novos e 61 regressões
preservadas (T9/T8/schema-recibos/conversation-reads). Comando:
`node node_modules/vitest/vitest.mjs run src/server/whatsapp/__tests__/statuses-attach.test.ts src/server/whatsapp/__tests__/statuses-ingest.test.ts src/server/whatsapp/__tests__/pricing-classification.test.ts src/db/__tests__/schema-whatsapp-receipts.test.ts src/server/data/__tests__/conversation-reads.test.ts`.
ESLint direcionado exit0; tsc mantém exatamente as 50 linhas de erro anteriores,
sem diferenças contra phase-1-types.local.log. Sem delta de schema ou SPEC_DEVIATION.

Escopo interno vem da sessão ou serviceScope autorizado. Attach lê a saída pela
carteira/tenant, trava a lead antes do canal e exige ownership. O vínculo usa
tenant/número/wamid persistidos, remetente agente ou humano e a mesma conversa/lead.
Ingestão associa saídas já existentes em uma atualização bulk; attach compõe
com a transação de gravação quando recebe seu executor. Só messageId e expiração
do órfão mudam: classificação, timestamps e evidências permanecem intactos.
Transporte real continua dependente da prova instalada nas tarefas posteriores.

## Adequação forward

`test` significa `src/server/whatsapp/__tests__/statuses-attach.test.ts`.

| AC/cenário | file:line + expressão | Esperado da spec/Design | Coberto |
| --- | --- | --- | --- |
| PRECO-02 AC2/5/7, status anterior | test:66 `expect((await receipt(wamid))[0].messageId).toBeNull()`; test:67 `expect(await db.select().from(messages).where(eq(messages.tenantId, tenantA))).toEqual(beforeMessages)`; test:71 `expect(await receipt(wamid)).toEqual([{ ...beforeAttach[0], messageId: outgoing.id, orphanExpiresAt: null }])`; test:72 `expect(await db.select().from(leads).where(eq(leads.tenantId, tenantA))).toEqual(beforeLeads)` | Órfão anterior liga à saída exata; evidências intactas, sem bolha ou mudança de condução/inbound | Sim |
| PRECO-01 AC7; PRECO-02 AC2, status posterior | test:79 `expect((await receipt(first.externalId!))[0].messageId).toBe(first.id)`; test:80 `expect((await receipt(second.externalId!))[0].messageId).toBe(second.id)`; test:81 `expect((await receipt(first.externalId!))[0].orphanExpiresAt).toBeNull()`; test:82 idem para second | Saídas humana/agente já existentes recebem seus recibos, sem TTL de órfão | Sim |
| PRECO-02 AC3; L14B-01 AC5, replay | test:92 `expect(await receipt(outgoing.externalId!)).toEqual(first)`; test:93 `expect(first[0].classification).toBe("free_service")` | Attach/status repetidos preservam a linha completa, inclusive preço e timestamps | Sim |
| PRECO-02 AC2; L14B-01 isolamento, carteira/tenant | test:101 `expect(await attachReceipt(scopes.walletA, own.id)).toBe(false)`; test:102 `expect(await attachReceipt(scopes.all, foreign.id)).toBe(false)`; test:103 `expect(await receipt(own.externalId!)).toEqual([ownReceipt])`; test:104 `expect(await receipt(foreign.externalId!, phoneB, tenantB)).toEqual([foreignReceipt])`; test:106 `expect((await receipt(own.externalId!))[0].messageId).toBe(own.id)` | Carteira/tenant errados não alteram recibos; carteira proprietária vincula | Sim |
| PRECO-02 AC2/8, canal/wamid/ownership | test:113 `expect(await attachReceipt(scopes.all, outgoing.id)).toBe(false)`; test:114 `expect(await receipt(outgoing.externalId!, phoneA2)).toEqual([wrongChannel])`; test:115 `expect(await receipt(wrongWamid.wamid)).toEqual([wrongWamid])`; test:119 mesma recusa sem ownership; test:120 `expect(await receipt(outgoing.externalId!)).toEqual([own])` | Identidade composta e ownership vivos obrigatórios; nenhum vínculo inferido | Sim |
| PRECO-01 Independent Test; PRECO-02 AC7, inbound | test:129 `expect(await attachReceipt(scopes.all, inbound.id)).toBe(false)`; test:131 `expect(await receipt(inbound.externalId!)).toEqual([before])`; test:132 `expect((await db.select().from(messages).where(eq(messages.id, inbound.id)))[0]).toEqual(inbound)` | Inbound não recebe classificação de saída nem sofre alteração por status | Sim |
| PRECO-02 AC8, legado/identidade inválida | test:138 `expect(await attachReceipt(scopes.all, legacy.id)).toBe(false)`; test:139 `expect(await attachReceipt(scopes.all, "invalid-id")).toBe(false)`; test:140 `expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.tenantId, tenantA))).toEqual(before)` | Sem canal/wamid/ID válido, não infere telefone nem cria recibo | Sim |
| L14B-01 AC5; T10 ciclo, exclusão | test:152 `expect(await receipt(own.externalId!)).toEqual([])`; test:153 `expect(await receipt(foreign.externalId!, phoneB, tenantB)).toEqual(other)` | Exclusão remove recibo vinculado por cascade, sem órfão permanente ou efeito estrangeiro | Sim |
| PRECO-02 AC5; T10 composição transacional | test:159 `await expect(db.transaction(async (tx) => { ... })).rejects.toThrow("Fixture força rollback após vínculo")`; test:161 `expect(await attachReceipt(scopes.all, outgoing.id, tx)).toBe(true)`; test:164 `expect(await receipt(wamid)).toEqual([before])`; test:165 `expect(await db.select().from(messages).where(eq(messages.externalId, wamid))).toEqual([])` | Attach usa a mesma transação; rollback restaura órfão e remove saída não confirmada | Sim |

## Adequação reverse

Retornos booleanos e resultados ok/processed dentro de cada cenário verificam o
mesmo resultado da linha forward; nenhuma asserção acrescenta requisito ao produto.

| file:line + expressão principal | Mapeia para | Manter |
| --- | --- | --- |
| test:71 `expect(await receipt(wamid)).toEqual([{ ...beforeAttach[0], messageId: outgoing.id, orphanExpiresAt: null }])` | PRECO-02 AC2/5/7; sem perda de evidência | Sim |
| test:79 `expect((await receipt(first.externalId!))[0].messageId).toBe(first.id)`; test:80 `expect((await receipt(second.externalId!))[0].messageId).toBe(second.id)` | PRECO-01 AC7; PRECO-02 AC2, posterior humano/agente | Sim |
| test:92 `expect(await receipt(outgoing.externalId!)).toEqual(first)` | PRECO-02 AC3; L14B-01 AC5 | Sim |
| test:103 `expect(await receipt(own.externalId!)).toEqual([ownReceipt])`; test:104 `expect(await receipt(foreign.externalId!, phoneB, tenantB)).toEqual([foreignReceipt])` | PRECO-02 AC2; T10 carteira/tenant | Sim |
| test:114 `expect(await receipt(outgoing.externalId!, phoneA2)).toEqual([wrongChannel])`; test:115 `expect(await receipt(wrongWamid.wamid)).toEqual([wrongWamid])`; test:120 `expect(await receipt(outgoing.externalId!)).toEqual([own])` | PRECO-02 AC2/8 | Sim |
| test:131 `expect(await receipt(inbound.externalId!)).toEqual([before])`; test:132 `expect((await db.select().from(messages).where(eq(messages.id, inbound.id)))[0]).toEqual(inbound)` | PRECO-02 AC7; PRECO-01 inbound excluído | Sim |
| test:140 `expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.tenantId, tenantA))).toEqual(before)` | PRECO-02 AC8; legado sem inferência | Sim |
| test:152 `expect(await receipt(own.externalId!)).toEqual([])` | T10 exclusão; L14B-01 AC5 | Sim |
| test:164 `expect(await receipt(wamid)).toEqual([before])` | T10 transação; PRECO-02 AC5 | Sim |

Checks A/B/C/D: nove cenários com valores e comparação de linhas completas,
estado antes/depois e rollback real. Postgres de teste, fixtures/teardown próprios,
sem cleanup global. Gate/matriz aprovados e todos os testes anteriores preservados.
T10 não contém cenário de disputa entre conexões; essa prova já permanece na
regressão T9. Integrações de envio que chamarão attach continuam em T27/T30/T31/T41/T42.
