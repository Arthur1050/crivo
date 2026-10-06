# T13 — lease e publicação corrente

PASS local pelo root: regate Full exit0, 5/5 arquivos, 93/93 testes, 122,64s,
início 2026-10-03 00:23:54 America/Sao_Paulo. Distribuição medida:
sync 20 + query 19 + contract 29 + schemaUsage 11 + channels 14;
22 adições (20 sync + 2 aliases) e 71 anteriores preservados.
Comando: `node node_modules/vitest/vitest.mjs run src/server/whatsapp/__tests__/analytics-sync.test.ts src/server/whatsapp/__tests__/analytics-query.test.ts src/server/whatsapp/__tests__/analytics-contract.test.ts src/db/__tests__/schema-whatsapp-usage.test.ts src/server/whatsapp/__tests__/channels.test.ts`.
ESLint direcionado dos cinco arquivos exit0; tsc mantém exatamente 50
diagnósticos anteriores, diff vazio contra fase1. Sem delta de schema.

Primeiro gate passou 92/92, 123,50s, início 00:15:11. Revisão final encontrou
guarda faltante de accountTimezone/monthEnd do snapshot, apesar de token/seq
compatíveis. Corrigida e regate acima confirmou todos os cenários anteriores
mais Amman/Atenas, oráculo SQL literal independente: mesmo início de outubro
2026-09-30T21Z, fim 21Z versus 22Z de 31/out. Sem Graph/publicação/conversão do
snapshot incompatível. Não é SPEC_DEVIATION nem falha do gate anterior.

Claim e tentativas persistem antes do Graph, sob lock do canal. Cadência de
15min pertence ao canal, inclusive falha, mês/revisão novos e lease vencida.
Token/revisão/mês/fuso/fim/identidade/provas/prazo/sequence são relidos antes do fetch e
da publicação. Relógio é função interna, lida após locks/round-trips. Falha
conserva volume/queryEnd/sucesso anteriores; worker obsoleto não publica nem
libera lease de outro token. Graph não mantém transação aberta.

Handler tem orçamento interno 80s, abaixo da lease 90s, por timer/race e deadline
monotônico; sinal segue ao orçamento Graph 15s. statement_timeout/lock_timeout
são LOCAL à transação, sem alterar Pool. Checks antes/depois de locks/escritas
fazem callback tardio lançar e rollback; driver sem resposta não prende retorno.
Integração do handler no tick ainda é T44; provas externas da conta permanecem
pendentes, default sem contrato registra indisponibilidade sem saldo.

Correção auxiliar USO-01 AC7: regex alpha2 uppercase ainda admitia aliases ISO.
Intl.Locale canônico recusa UK→GB e BU→MM, em predicate compartilhado T11/T12;
não converte aliases nem soma duas partições do mesmo país. Oráculo Node do root
confirmou essas canonizações; nenhum contrato externo foi ampliado.

## Adequação forward e reverse

`test` significa `src/server/whatsapp/__tests__/analytics-sync.test.ts`.
`contract` significa `src/server/whatsapp/__tests__/analytics-contract.test.ts`;
`query` significa `src/server/whatsapp/__tests__/analytics-query.test.ts`.
Cada linha também corresponde a todos os asserts do cenário de volta ao AC
indicado; todos são mantidos. Contadores/retornos complementares verificam o
mesmo resultado, sem criar requisito novo. Driver stall é teste do orçamento
com dependência sem resposta, não prova de lock; disputa usa Postgres real.

| AC/cenário | file:line + expressão | Esperado da spec/Design | Forward / reverse |
| --- | --- | --- | --- |
| USO-01 AC1/2; USO-02 AC3, inicial | test:51 `expect(lease.usageSyncToken).not.toBeNull()`; test:54 `expect(params.get("start")).toBe("1790812800")`; test:59 `expect(period.freeServiceVolume).toBe(999)`; test:60 `expect(period.queryEnd).toEqual(new Date("2026-10-02T12:00:00Z"))`; test:61 `expect(period.lastSuccessAt).toEqual(new Date("2026-10-02T12:00:07Z"))`; test:63 token null | Claim commitado antes HTTP; mês inteiro, corte distinto do sucesso, lease liberada | Coberto / manter |
| USO-01 AC4; USO-02 AC1, cadência | test:71 `expect(await run(row, () => clock, fetcher)).toEqual({ ok: false, reason: "cadence" })`; test:74 mesmo run oktrue aos15min; test:76 `expect(period.freeServiceVolume).toBe(1000)`; test:77 `expect(fetcher).toHaveBeenCalledTimes(2)` | 14:59.999 recusa;15min substitui999 por1000, sem somar | Coberto / manter |
| USO-02 AC1/6, 429 | test:84 `expect(await run(row, () => clock, async () => new Response("secret-error", { status: 429 }))).toEqual({ ok: false, reason: "rate-limited" })`; test:86 `expect(after.freeServiceVolume).toBe(999)` + queryEnd/sucesso iguais antes; test:88 cadence | Falha limitada preserva snapshot e intervalo | Coberto / manter |
| USO-02 AC6, timeout | test:99 `expect(after.freeServiceVolume).toBe(999)`; `expect(after.queryEnd).toEqual(before.queryEnd)`; `expect(after.lastSuccessAt).toEqual(before.lastSuccessAt)`; test:100 `expect(after.failureCode).toBe("timeout")` | Timeout não publica zero nem apaga valor conhecido | Coberto / manter |
| USO-02 AC1/2, interrupção | test:107 leaseactive em89.999s; test:108 `expect(await run(row, () => new Date("2026-10-02T12:01:30Z"), fetcher)).toEqual({ ok: false, reason: "cadence" })`; test:111 `expect((await periods(row.phoneNumberId))[0].responseToken).not.toBe(token)` | Expirar90s não reinicia15min; recuperação usa novo token | Coberto / manter |
| USO-02 AC2/8, antes do fetch | test:117 `expect(await run(row, () => ++calls === 1 ? base : new Date("2026-10-02T12:01:30Z"), fetcher)).toEqual({ ok: false, reason: "superseded" })`; test:118 `expect(fetcher).not.toHaveBeenCalled()`; test:120 volume/queryEnd/sucesso null | Worker no prazo exato vencido não consulta nem publica zero | Coberto / manter |
| USO-02 AC8, resposta invertida | test:132 `expect(await pending).toEqual({ ok: false, reason: "superseded" })`; test:133 `expect(await periods(row.phoneNumberId)).toEqual([newer])`; test:134 volume1000/sequence2 | Resposta antiga não muda linha completa mais recente | Coberto / manter |
| USO-02 AC2/8, lease estrangeira | test:147 `expect((await liveChannel(row.phoneNumberId)).usageSyncToken).toBe(lease.usageSyncToken)`; test:148 `expect((await liveChannel(row.phoneNumberId)).usageSyncDeadline).toEqual(lease.usageSyncDeadline)` | Worker antigo não limpa token/prazo do novo | Coberto / manter |
| USO-01 AC6; USO-02 AC1/8, mês | test:154 resposta antiga superseded; test:155 `expect(await run(row, () => clock)).toEqual({ ok: false, reason: "cadence" })`; test:160 `expect(rows.find((item) => item.monthStart.toISOString() === "2026-11-01T00:00:00.000Z")?.freeServiceVolume).toBe(0)` | Novo mês não reutiliza volume nem reinicia cadência; zero vem de consulta explícita nova | Coberto / manter |
| USO-02 AC1/8, revisão | test:168 cadence após revisão2; test:171 `expect(rows.find((item) => item.configurationRevision === 1)?.freeServiceVolume).toBeNull()`; test:172 `expect(rows.find((item) => item.configurationRevision === 2)?.freeServiceVolume).toBe(999)` | Revisão antiga não publica; nova só consulta após15min | Coberto / manter |
| USO-01 AC8; USO-02 AC8, número | test:180 `expect((await periods(row.phoneNumberId))[0].freeServiceVolume).toBeNull()` após mudança de analyticsPhoneNumber durante HTTP e resultado superseded | Identidade antiga não recebe volume | Coberto / manter |
| USO-01 AC8, capacidade viva | test:188 `expect((await periods(row.phoneNumberId))[0].lastSuccessAt).toBeNull()` após usageEnabledfalse durante HTTP | Capacidade revogada impede sucesso | Coberto / manter |
| USO-01 AC8; L14B-01 isolamento, desabilitado/ausente/tenant | test:194 `expect(await run(row, () => base, fetcher)).toEqual({ ok: false, reason: "usage-disabled" })`; test:196 `expect(fetcher).not.toHaveBeenCalled()`; test:197/198 lastAttemptnull | Sem canal habilitado autorizado não tenta nem consulta | Coberto / manter |
| USO-01 AC7/8, contrato real ausente | test:203 `expect(await syncUsage({ tenantId: tenantA }, { phoneNumberId: row.phoneNumberId }, { now: () => base, fetch: fetcher })).toEqual({ ok: false, reason: "contract-unverified" })`; test:205 volume null/falha contract-unverified; test:207 fetch não chamado | Default fechado persiste falha limitada sem saldo | Coberto / manter |
| USO-02 AC8, sequência/token | test:216 `expect(period.responseToken).toBe(token)`; `expect(period.querySequence).toBe(2)`; `expect(period.freeServiceVolume).toBeNull()` | ResponseToken/sequence divergentes impedem publicação | Coberto / manter |
| USO-02 AC2/8, guarda80s | test:227 `expect(await run(row, () => base, fetcher, database)).toEqual({ ok: false, reason: "timeout" })`; test:228 `expect(fetcher).not.toHaveBeenCalled()` | Guarda fora do orçamento não envia Graph | Coberto / manter |
| USO-02 AC6/8, publicação80s | test:240 run recebe timeout; test:242 `expect(after.freeServiceVolume).toBe(999)`; queryEnd/sucesso iguais antes | Callback tardio não grava resultado1000 | Coberto / manter |
| USO-02 orçamento, driver stall | test:251 `expect(settled).toBe(false)` aos79.999ms; test:252 `expect(await pending).toEqual({ ok: false, reason: "timeout" })` aos80.000ms; test:254 `expect(await periods(row.phoneNumberId)).toEqual([])` | Retorno abaixo da lease90s sem nova escrita | Coberto / manter |
| USO-02 AC2; T13 concorrência PG real | test:271 `expect(pids[0]).not.toBe(pids[1])`; test:277 `expect(waiting).toBe(2)`; test:279 `expect(await Promise.all(pending)).toEqual(expect.arrayContaining([{ ok: true }, { ok: false, reason: "lease-active" }]))`; test:280 `expect(fetcher).toHaveBeenCalledTimes(1)`; test:282/283 sequence 1/volume 999 | Dois backends medidos dentro BEGIN, dois locks, um claim/Graph/snapshot | Coberto / manter |
| USO-01 AC1/6; USO-02 AC8, mesmo início, fuso/fim distintos | test:296 `expect(await run(row, () => base, fetcher)).toEqual({ ok: false, reason: "superseded" })`; test:297 `expect(fetcher).not.toHaveBeenCalled()`; test:299 `expect(after.accountTimezone).toBe("Asia/Amman")`; test:301 `expect(after.monthEnd).toEqual(new Date("2026-10-31T21:00:00Z"))`; test:302 volume 999; test:303/304 queryEnd/sucesso iguais antes | Canal Atenas não converte ou publica snapshot Amman no mesmo PK; guarda verifica fuso/fim além de sequência/token | Coberto / manter |
| USO-01 AC7, correção alias ISO normalizador | contract:172 `expect(normalizeAnalytics(response([point({ country: "GB" }), point({ country: "UK" })]), query, contract)).toEqual({ ok: false, reason: "invalid-response" })`; contract:173 `expect(normalizeAnalytics(response([point({ country: "MM" }), point({ country: "BU" })]), query, contract)).toEqual({ ok: false, reason: "invalid-response" })` | País equivalente não é tratado como disjunto | Coberto / manter |
| USO-01 AC7, correção alias ISO decoder | query:185 `expect(await queryAnalytics(query, adapter, { fetch: async () => response(payload({ country: "UK" })) })).toEqual({ ok: false, reason: "invalid-response" })`; query:186 `expect(await queryAnalytics(query, adapter, { fetch: async () => response(payload({ country: "BU" })) })).toEqual({ ok: false, reason: "invalid-response" })` | Decoder recusa alias, sem conversão silenciosa | Coberto / manter |

Checks A/B/C/D: resultados e estado persistido, PIDs no tx real, fixtures/teardown
próprios e TEST_DATABASE_URL. Prova de lock não depende de mocks. Relógio falso
e dependência travada são somente testes discriminantes de prazo; não comprovam
transporte instalado, IANA/zero/fullmonth/produção. T14/T44 e verifier pendentes.
