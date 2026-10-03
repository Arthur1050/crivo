# T11 — normalização e mês civil

PASS local pelo root: Quick analytics-contract + pricing-classification,
exit0, 2/2 arquivos, 56/56 testes, 548ms, início 2026-10-02 23:44:35
America/Sao_Paulo (28 T11 + 28 T8). Full auxiliar schema-whatsapp-usage,
exit0, 1/1 arquivo, 11/11 testes, 31,18s, início 2026-10-02 23:44:20
America/Sao_Paulo (3 novos + 8 T6 preservados). Comandos:
`node node_modules/vitest/vitest.mjs run src/server/whatsapp/__tests__/analytics-contract.test.ts src/server/whatsapp/__tests__/pricing-classification.test.ts`;
`node node_modules/vitest/vitest.mjs run src/db/__tests__/schema-whatsapp-usage.test.ts`.
ESLint direcionado dos quatro arquivos exit0; tsc mantém exatamente 50
diagnósticos anteriores, diff vazio contra phase-1-types.local.log.
Correção SQL/hash/alvos em [test-schema-activation.md](test-schema-activation.md).

Envelope é semântico interno, não uma alegação do JSON Meta real. Capacidade
server-only opaca exige prova configurada; default recusa. Prova sintética dos
testes não habilita conta real nem comprova zero vazio. QueryEnd captura segundos
inteiros documentados; monthEnd é metadado civil, nunca consulta futura. Volumes
inteiros seguros são somados com bigint e publicados somente após cobertura
integral e partições disjuntas. Nenhum estado de webhook ou inbound é fonte do total.

Oráculos SQL read-only independentes confirmaram UTC/LA/SP/Tóquio, overlap em
Havana e gap em Amman. Helper escolhe o primeiro instante do mês inteiro. T6
usava conversão ambígua no fim civil e recusava início após salto de meia-noite;
CHECK corrigido verifica o mês de cada fronteira e de1microsegundo antes.
O SQL histórico T6 permanece intacto. Isso corrige USO-01, sem mudar a spec.

## Adequação forward e reverse

`test` significa `src/server/whatsapp/__tests__/analytics-contract.test.ts`;
`schema` significa `src/db/__tests__/schema-whatsapp-usage.test.ts`.
Cada linha é também a correspondência reverse dos cenários/asserts indicados:
todos são mantidos para o AC indicado, sem requisitos novos. Asserts adicionais
na mesma fixture verificam o mesmo resultado (identidade/data/filtro/recusa).

| AC/cenário | file:line + expressão | Esperado da spec/Design | Forward / reverse |
| --- | --- | --- | --- |
| USO-01 AC1/6; USO-02 AC3, UTC | test:27 `expect(result.monthStart).toEqual(new Date("2026-10-01T00:00:00Z"))`; test:28 `expect(result.monthEnd).toEqual(new Date("2026-11-01T00:00:00Z"))`; test:29 `expect(result.queryEnd).toEqual(new Date("2026-10-02T12:34:56Z"))`; test:30/31 start/end1790812800/1790944496; test:32 filtros VOLUME/SERVICE/FREE_CUSTOMER_SERVICE/PHONE | Mês inteiro até corte capturado, fim civil separado | Coberto / manter |
| USO-01 AC6, DST LA | test:37 `expect(result.monthStart).toEqual(new Date("2026-03-01T08:00:00Z"))`; test:38 `expect(result.monthEnd).toEqual(new Date("2026-04-01T07:00:00Z"))` | Offset pode mudar no mesmo mês | Coberto / manter |
| USO-01 AC6, SP | test:43 `expect(result.monthStart).toEqual(new Date("2026-09-01T03:00:00Z"))`; test:44 `expect(result.monthEnd).toEqual(new Date("2026-10-01T03:00:00Z"))` | Mês civil do canal diverge de UTC | Coberto / manter |
| USO-01 AC6, Tóquio | test:49 `expect(result.monthStart).toEqual(new Date("2026-09-30T15:00:00Z"))`; test:50 `expect(result.monthEnd).toEqual(new Date("2026-10-31T15:00:00Z"))` | Novo mês começa antes de UTC | Coberto / manter |
| USO-01 AC1/6; PROVA-01 AC3, overlap | test:55 `expect(result.monthStart).toEqual(new Date("2026-11-01T04:00:00Z"))`; test:57 `expect(result.queryEnd).toEqual(new Date("2026-11-01T04:30:00Z"))` | Primeira hora de novembro incluída | Coberto / manter |
| USO-01 AC1/6, gap | test:62 `expect(result.monthStart).toEqual(new Date("2011-03-31T22:00:00Z"))`; test:63 `expect(result.monthEnd).toEqual(new Date("2011-04-30T21:00:00Z"))` | Primeiro instante após meia-noite inexistente | Coberto / manter |
| USO-01 AC8, fuso/identidade/data | test:67 `expect(civil(zone, "2026-10-02T12:00:00Z")).toBeNull()`; test:68 `expect(civil("UTC", "invalid-date")).toBeNull()`; test:69 query sem número null | Ausência/offset/fuso desconhecido não têm default | Coberto / manter |
| USO-01 AC2; PROVA-01 AC3, V0/999/1000/1001 | test:73 `expect(normalizeAnalytics(response([point({ volume })]), query, contract)).toEqual({ ok: true, volume: BigInt(volume), remaining, progress })`; test:72 valores explícitos 0→1000/0,999→1/.999,1000→0/1,1001→0/1 | max(0,1000−V); volume reportado intacto | Coberto / manter |
| USO-01 AC7/8, prova default/claim | test:77 `expect(normalizeAnalytics(response(), query)).toEqual({ ok: false, reason: "contract-unverified" })`; test:78 cópia evidence recebe mesmo erro; test:79/80 factory default/hash inválido null | Payload não concede comprovação | Coberto / manter |
| USO-01 AC7, contrato desconhecido | test:84 `expect(normalizeAnalytics(response(undefined, { contractId: "unknown-format" }), query, contract)).toEqual({ ok: false, reason: "invalid-response" })` | Shape/versão desconhecidos recusados | Coberto / manter |
| USO-01 AC3/5; PRECO-01 AC8, exclusões | test:91 `expect(normalizeAnalytics(raw, query, contract)).toEqual({ ok: true, volume: 999n, remaining: 1, progress: 0.999 })` | FEP400/template300/COST500/inbound600/failed700/webhook800 não somam | Coberto / manter |
| USO-01 AC2/7, países disjuntos | test:95 `expect(normalizeAnalytics(response([point({ country: "BR", volume: 600 }), point({ country: "PT", volume: 399 })]), query, contract)).toEqual({ ok: true, volume: 999n, remaining: 1, progress: 0.999 })` | 600+399 uma vez | Coberto / manter |
| USO-01 AC7, total+detalhe | test:100 `expect(normalizeAnalytics(response([point(), point({ country: "BR", volume: 999 })]), query, contract)).toEqual({ ok: false, reason: "overlapping-partitions" })` | Sem dupla contagem de agregado | Coberto / manter |
| USO-01 AC7, duplicata/overlap | test:104 `expect(normalizeAnalytics(response([point({ country: "BR" }), point({ country: "BR" })]), query, contract)).toEqual({ ok: false, reason: "overlapping-partitions" })`; test:105 intervalo sobreposto recebe mesmo erro | Mesmo país/intervalo não é disjunto | Coberto / manter |
| USO-01 AC1/2, contiguidade | test:109 `expect(normalizeAnalytics(response([point({ end: 1790877600, volume: 500 }), point({ start: 1790877600, volume: 499 })]), query, contract)).toEqual({ ok: true, volume: 999n, remaining: 1, progress: 0.999 })` | 500+499 cobre todo corte sem gap | Coberto / manter |
| USO-01 AC1/7, cobertura parcial | test:114 `expect(normalizeAnalytics(response([point({ start: 1790812801 })]), query, contract)).toEqual({ ok: false, reason: "incomplete-response" })`; test:115/116 fim/lacuna recebem mesmo erro | Ausência de um segundo já é cobertura insuficiente | Coberto / manter |
| USO-01 AC7, vazio não provado | test:120 `expect(normalizeAnalytics(response([]), query, contract)).toEqual({ ok: false, reason: "zero-unverified" })`; test:121 somenteFEP recebe mesmo erro | Sem inferir zero de ausência de ponto elegível | Coberto / manter |
| USO-01 AC7, vazio provado em fixture | test:125 `expect(normalizeAnalytics(response([]), query, zeroContract)).toEqual({ ok: true, volume: 0n, remaining: 1000, progress: 0 })` | Prova específica servidor permite essa representação; fato externo pendente | Coberto / manter |
| USO-01 AC7, integralidade/paginação | test:130 `expect(normalizeAnalytics(response(undefined, patch), query, contract)).toEqual({ ok: false, reason: "incomplete-response" })` | completefalse/hasMoretrue/flags ausentes recusados | Coberto / manter |
| USO-01 AC8, número/conta | test:135 `expect(normalizeAnalytics(response(undefined, { phoneNumber: "5511000000000" }), query, contract)).toEqual({ ok: false, reason: "identity-mismatch" })`; test:136/137 WABA/ponto estrangeiros mesmo erro | Identidade confirmada deve coincidir | Coberto / manter |
| USO-01 AC1/3/7, filtros | test:142 `expect(normalizeAnalytics(response(undefined, { filters: { ...query.filters, ...patch } }), query, contract)).toEqual({ ok: false, reason: "filters-mismatch" })` | COST/MARKETING/FEP/TIER não substituem filtros da franquia | Coberto / manter |
| USO-01 AC1/7, período | test:147 `expect(normalizeAnalytics(response(undefined, { start: 1790812801 }), query, contract)).toEqual({ ok: false, reason: "period-mismatch" })`; test:148/149/150 fim futuro/ponto fora/intervalo vazio mesmo erro | Start/queryEnd validados, sem futuro | Coberto / manter |
| USO-01 AC7, volume | test:155 `expect(normalizeAnalytics(response([point({ volume })]), query, contract)).toEqual({ ok: false, reason: "invalid-volume" })`; test:157 soma acima MAX_SAFE_INTEGER mesmo erro | Negativo/fração/string/NaN/Infinity/ausência/inseguro recusados | Coberto / manter |
| USO-01 AC7, dimensão/corpo | test:162 `expect(normalizeAnalytics(response([point({ country: undefined })]), query, contract)).toEqual({ ok: false, reason: "invalid-response" })`; test:163 partitionsnull mesmo erro | Não inferir discriminação ou zero | Coberto / manter |
| USO-01 AC7, país canônico | test:167 `expect(normalizeAnalytics(response([point({ country: "BR" }), point({ country: "br" })]), query, contract)).toEqual({ ok: false, reason: "invalid-response" })`; test:168 mesma recusa para BR+Brazil | ISO alpha2 uppercase obrigatório; aliases não se tornam partições disjuntas | Coberto / manter |
| USO-01 AC1/6, schema overlap | schema:100 `expect(october.monthEnd).toEqual(new Date("2026-11-01T04:00:00Z"))`; schema:101 `expect(november.monthStart).toEqual(new Date("2026-11-01T04:00:00Z"))`; schema:102/103 queryEnd04:30/volume999; schema:104/106 segunda meia-noite recusada23514 | Persistência inclui primeira hora e exclui mês novo do anterior | Coberto / manter |
| USO-01 AC1/6, schema gap | schema:113 `expect(row.monthStart).toEqual(new Date("2011-03-31T22:00:00Z"))`; schema:114 `expect(row.monthEnd).toEqual(new Date("2011-04-30T21:00:00Z"))`; schema:115 fronteira21Z recusada23514 | Persistência aceita local01 primeiro instante | Coberto / manter |
| USO-01 AC1/7, schema atraso | schema:120 `expect(await codeOf(db.insert(whatsappUsage).values({ ...await period(), monthStart: new Date("2026-10-01T00:00:00.001Z") }))).toBe("23514")`; schema:121 monthEnd+1ms mesmo erro | Fronteira atrasada não é mês integral | Coberto / manter |

Checks A/B/C/D: valores derivados de spec e oráculos independentes, nenhum
teste anterior excluído/alterado, partições e erro com resultados explícitos.
Capacidade real/fullmonth/zero da conta não são comprovados por fixtures.
