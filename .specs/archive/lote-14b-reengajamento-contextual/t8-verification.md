# T8 — classificação determinística

PASS local: Quick executado pelo root em 2026-10-02 20:29:50 America/Sao_Paulo,
exit 0, 1 arquivo, 28/28 testes, 225ms. Comando:
`node node_modules/vitest/vitest.mjs run src/server/whatsapp/__tests__/pricing-classification.test.ts`.
ESLint dos dois arquivos exit 0. Tsc exit 2 com as mesmas 50 linhas de erro
do baseline phase-1-types.local.log; comparação vazia. Nenhum teste anterior
alterado, excluído ou pulado. Nenhum delta de schema.

Reducer server-only puro em `src/server/whatsapp/statuses.ts`. Confirmação depende
de uma tupla completa realmente observada em delivered/read, ou de confirmação
persistida anterior. Campos de sent/failed não completam pricing. União de
parciais conserva evidências, sem promover classificação; tupla completa
compatível posterior pode confirmar. Conflito permanece absorvente.
FEP é isenção separada em categoria conhecida, inclusive utility/marketing;
a restrição service governa paid_service/free_service. Instantes mínimos por
tipo e escolha canônica dos campos conflitantes tornam a redução independente
da ordem. Essa escolha guarda evidência, sem afirmar uma versão autoritativa.

Autenticidade, persistência e transporte instalado pertencem às tarefas seguintes.
Fixtures documentais não comprovam pricing real da conta de teste descoberta.
999/1000/1001 são identidades dos casos de contrato, sem contador local usado
para inferir preço. Webhooks não entram no volume mensal.

## Adequação forward

Todos os caminhos abaixo usam o arquivo
`src/server/whatsapp/__tests__/pricing-classification.test.ts` (abreviado `test`).
As expressões reproduzem as asserções; objetos descritos após `toEqual` são os
valores explícitos do teste, com fixture e defaults também guardados em test:16.

| Critério/AC | file:line + expressão | Esperado da spec/Design | Coberto |
| --- | --- | --- | --- |
| PRECO-01 AC4, defaults sem inferência | test:16 `expect(emptyReceipt()).toEqual({...})`; test:24 `expect(classifyReceipt(emptyReceipt())).toBe("pending")` | Todos timestamps/pricing/failureCode null, conflito false, pending | Sim |
| PRECO-01 AC4, sent | test:28 `expect(reduceReceipt(emptyReceipt(), event("sent", paid))).toEqual({...emptyReceipt(), sentAt: at})` | Sent não confirma cobrança | Sim |
| PRECO-01 AC1 | test:34 `expect(reduceReceipt(emptyReceipt(), event("delivered", paid))).toEqual({...})` | deliveredAt=at; PMP/service/regular/true; paid_service | Sim |
| PRECO-01 AC2 | test:40 `expect(reduceReceipt(emptyReceipt(), event("delivered", free))).toEqual({...})` | deliveredAt=at; PMP/service/free_customer_service/false; free_service | Sim |
| PRECO-01 AC3, FEP distinto | test:46 `expect(reduceReceipt(emptyReceipt(), event("delivered", fep))).toEqual({...})`; test:52 `expect(reduceReceipt(emptyReceipt(), event("delivered", { ...fep, category })).classification).toBe("free_entry_point")` | FEP service/utility/marketing gratuito separado | Sim |
| PRECO-01 AC5, desconhecido | test:56 `expect(reduceReceipt(emptyReceipt(), event("delivered", { ...fep, category: "unknown" })).classification).toBe("unavailable")`; test:141 `expect(reduceReceipt(emptyReceipt(), event("delivered", pricing)).classification).toBe("unavailable")` | Modelo/type/category/billable desconhecido ou contraditório indisponível | Sim |
| PRECO-01 AC5, ausência | test:62 `expect(result.classification).toBe("unavailable")`; test:63 `expect(result.billable).toBeNull()`; test:64 `expect(result.pricingType).toBeNull()` | Delivered sem pricing indisponível, sent não fornece preço | Sim |
| PRECO-01 AC8 | test:68 `expect(reduceReceipt(emptyReceipt(), event("delivered", { ...free, category: "utility" })).classification).toBe("unavailable")` | Template não consome franquia de serviço | Sim |
| Read sem pricing; entrega posterior | test:72 `expect(reduceReceipt(emptyReceipt(), event("read"))).toEqual({...})`; test:79 `expect(reduceReceipt(confirmed, event("read"))).toEqual({ ...confirmed, readAt: at })`; test:81 `expect(reduceReceipt(read, event("delivered", free, earlier))).toEqual({ ...confirmed, readAt: at })` | Read preserva entrega/preço; readAt separado e não fabrica deliveredAt/pricing; posterior completa | Sim |
| Read com pricing real, conflito posterior | test:86 `expect(read).toEqual({ ...emptyReceipt(), readAt: at, ...paid, classification: "paid_service" })`; test:88 `expect(conflict.pricingConflict).toBe(true)`; test:89 `expect(conflict.classification).toBe("unavailable")` | Leitura comprova entrega; conflito posterior indisponível | Sim |
| PRECO-02 AC4 | test:94 `expect(reduceReceipt(read, event("sent", free, earlier))).toEqual({ ...read, sentAt: earlier })` | Sent atrasado conserva delivered/read/classificação | Sim |
| PRECO-01 AC6 | test:98 `expect(reduceReceipt(emptyReceipt(), { ...event("failed", paid), failureCode: 131047 })).toEqual({...})` | Failed sem entrega: not_delivered; preço null | Sim |
| Failed depois/antes de entrega | test:105 `expect(reduceReceipt(delivered, { ...event("failed"), failureCode: 131026 })).toEqual({...})`; test:112 `expect(reduceReceipt(failed, event("delivered", free))).toEqual({...})` | Entrega comprovada permanece; delivered posterior confirma free_service | Sim |
| PRECO-02 AC3, USO-01 AC5 | test:119 `expect(reduceReceipt(first, event("delivered", free))).toEqual(first)`; test:120 `expect(Object.keys(first).sort()).toEqual([...].sort())` | Replay igual, sem volume/inbound na evidência individual | Sim |
| PRECO-02 AC6 | test:129 `expect(conflict.pricingConflict).toBe(true)`; test:130 `expect(conflict.classification).toBe("unavailable")`; test:131 `expect(reduceReceipt(conflict, event("delivered", paid)).classification).toBe("unavailable")`; test:132 `expect(reduceReceipt(conflict, event("read")).pricingConflict).toBe(true)` | Conflito persistente, sem último evento vencer | Sim |
| Ordem determinística, entrega preservada | test:149 `expect(forward).toEqual(reverse)`; test:150 `expect(forward.classification).toBe("unavailable")`; test:151 `expect(forward.deliveredAt).toEqual(earlier)` | Mesmo estado e conflito, timestamps por tipo conservados | Sim |
| Pricing parcial não inventa confirmação | test:158 `expect(result.classification).toBe("unavailable")`; test:159 `expect(reduceReceipt(result, event("delivered", free)).classification).toBe("free_service")`; test:165 `expect([a, b].reduce(reduceReceipt, emptyReceipt())).toEqual([b, a].reduce(reduceReceipt, emptyReceipt()))`; test:166 `expect([a, b].reduce(reduceReceipt, emptyReceipt()).classification).toBe("unavailable")`; test:170 `expect(order.reduce(reduceReceipt, emptyReceipt())).toEqual(expected)` | União indisponível; completo compatível confirma; seis ordens dão mesmo estado | Sim |
| Contrato incompleto em runtime | test:179 `expect(reduceReceipt(partial, event("delivered", pricing as ReceiptPricing))).toEqual(partial)` | Vazio/ausência não é prova de preço completo | Sim |
| PROVA-01 AC3, contrato 999/1000/1001 | test:186 `expect(reduceReceipt(emptyReceipt(), event("delivered", pricing)).classification).toBe(classification)` | 999/1000 free_service; 1001 paid_service conforme pricing da fixture | Sim |

## Adequação reverse

| file:line + expressão | Requisito/resultado | Manter |
| --- | --- | --- |
| test:16 `expect(emptyReceipt()).toEqual({...})`; test:24 `expect(classifyReceipt(emptyReceipt())).toBe("pending")` | PRECO-01 AC4; padrão de produção sem classificação presumida | Sim |
| test:28 `expect(reduceReceipt(emptyReceipt(), event("sent", paid))).toEqual({...})` | PRECO-01 AC4 | Sim |
| test:34 `expect(reduceReceipt(emptyReceipt(), event("delivered", paid))).toEqual({...})` | PRECO-01 AC1 | Sim |
| test:40 `expect(reduceReceipt(emptyReceipt(), event("delivered", free))).toEqual({...})` | PRECO-01 AC2 | Sim |
| test:46 `expect(reduceReceipt(emptyReceipt(), event("delivered", fep))).toEqual({...})`; test:52 `expect(reduceReceipt(emptyReceipt(), event("delivered", { ...fep, category })).classification).toBe("free_entry_point")` | PRECO-01 AC3; dois casos paramétricos utility/marketing | Sim |
| test:56 `expect(reduceReceipt(emptyReceipt(), event("delivered", { ...fep, category: "unknown" })).classification).toBe("unavailable")` | PRECO-01 AC5 | Sim |
| test:62 `expect(result.classification).toBe("unavailable")`; test:63 `expect(result.billable).toBeNull()`; test:64 `expect(result.pricingType).toBeNull()` | PRECO-01 AC5/4 | Sim |
| test:68 `expect(reduceReceipt(emptyReceipt(), event("delivered", { ...free, category: "utility" })).classification).toBe("unavailable")` | PRECO-01 AC8 | Sim |
| test:72 `expect(reduceReceipt(emptyReceipt(), event("read"))).toEqual({...})`; test:79 `expect(reduceReceipt(confirmed, event("read"))).toEqual({ ...confirmed, readAt: at })`; test:81 `expect(reduceReceipt(read, event("delivered", free, earlier))).toEqual({ ...confirmed, readAt: at })` | T8 read; PRECO-01 AC5/2 | Sim |
| test:86 `expect(read).toEqual({...})`; test:88 `expect(conflict.pricingConflict).toBe(true)`; test:89 `expect(conflict.classification).toBe("unavailable")` | T8 read; PRECO-01 AC1; PRECO-02 AC6 | Sim |
| test:94 `expect(reduceReceipt(read, event("sent", free, earlier))).toEqual({ ...read, sentAt: earlier })` | PRECO-02 AC4 | Sim |
| test:98 `expect(reduceReceipt(emptyReceipt(), { ...event("failed", paid), failureCode: 131047 })).toEqual({...})` | PRECO-01 AC6 | Sim |
| test:105 `expect(reduceReceipt(delivered, { ...event("failed"), failureCode: 131026 })).toEqual({...})`; test:112 `expect(reduceReceipt(failed, event("delivered", free))).toEqual({...})` | T8 failed antes/depois de entrega | Sim |
| test:119 `expect(reduceReceipt(first, event("delivered", free))).toEqual(first)`; test:120 `expect(Object.keys(first).sort()).toEqual([...].sort())` | PRECO-02 AC3; USO-01 AC5 | Sim |
| test:129 `expect(conflict.pricingConflict).toBe(true)`; test:130 `expect(conflict.classification).toBe("unavailable")`; test:131 `expect(reduceReceipt(conflict, event("delivered", paid)).classification).toBe("unavailable")`; test:132 `expect(reduceReceipt(conflict, event("read")).pricingConflict).toBe(true)` | PRECO-02 AC6 | Sim |
| test:141 `expect(reduceReceipt(emptyReceipt(), event("delivered", pricing)).classification).toBe("unavailable")` | PRECO-01 AC5; T8 contrato desconhecido | Sim |
| test:149 `expect(forward).toEqual(reverse)`; test:150 `expect(forward.classification).toBe("unavailable")`; test:151 `expect(forward.deliveredAt).toEqual(earlier)` | PRECO-02 AC3/4/6; ordem determinística | Sim |
| test:158 `expect(result.classification).toBe("unavailable")`; test:159 `expect(reduceReceipt(result, event("delivered", free)).classification).toBe("free_service")`; test:165 `expect([a, b].reduce(reduceReceipt, emptyReceipt())).toEqual([b, a].reduce(reduceReceipt, emptyReceipt()))`; test:166 `expect([a, b].reduce(reduceReceipt, emptyReceipt()).classification).toBe("unavailable")`; test:170 `expect(order.reduce(reduceReceipt, emptyReceipt())).toEqual(expected)` | PRECO-01 AC5/2; PRECO-02 AC3/6; ausência não fabrica campos | Sim |
| test:179 `expect(reduceReceipt(partial, event("delivered", pricing as ReceiptPricing))).toEqual(partial)` | PRECO-01 AC5; contrato parcial | Sim |
| test:186 `expect(reduceReceipt(emptyReceipt(), event("delivered", pricing)).classification).toBe(classification)` | PROVA-01 AC3, três casos paramétricos | Sim |

Checks A/B/C/D: todos os critérios T8 cobertos com resultados da spec/Design;
objetos/timestamps/pricing/classificação testados por valor; nenhum mock como
substituto do estado; todos os 28 cenários necessários. Vitest/configuração e
matriz tasks.md seguidos. Sem SPEC_DEVIATION. Não antecipa conclusão integral
dos ACs de persistência/transporte/UI nem PROVA-01.
