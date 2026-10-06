# T12 — adapter Graph

PASS local: Quick root exit0, 4/4 arquivos, 86/86 testes, 1,51s, início
2026-10-02 23:55:41 America/Sao_Paulo. 18 T12 + 28 T11 + 28 T8 + 12 Cloud API.
Comando: `node node_modules/vitest/vitest.mjs run src/server/whatsapp/__tests__/analytics-query.test.ts src/server/whatsapp/__tests__/analytics-contract.test.ts src/server/whatsapp/__tests__/pricing-classification.test.ts src/server/whatsapp/__tests__/cloud-api.test.ts`.
ESLint direcionado exit0; tsc mantém exatamente 50 diagnósticos anteriores,
diff vazio contra phase-1-types.local.log. Nenhum teste anterior alterado.

Factory opaca exige prova servidor de versão/shape, filtro normalizado, mês
inteiro e paginação; default sem prova recusa antes da rede. Token vem somente
do processo servidor e segue no header. Decoder v25 exige o shape básico
observado e country string ISO alpha2 uppercase; null/alias não são traduzidos.
Timer/race e deadline monotônico cobrem guarda, fetch, JSON e decode: resultado
fora do orçamento não publica volume mesmo com bloqueio síncrono do event loop.
Não segue next, não repete consulta e não devolve erro bruto/segredo.

[analytics-account-observation.md](analytics-account-observation.md) registra
SDK primário e GETs somente leitura do root: filtro por número normalizado e
shape v25 confirmados nessa conta de teste; pontos DAILY/HALF_HOUR parciais,
MONTHLY vazio sem prova de zero. Nenhuma leitura prova tenant/IANA/produção,
mês integral, zero ou protocolo completo de paginação. Capacidade real continua
ausente e usageEnabled falso. Provas de sucesso desta suíte são sintéticas.

## Adequação forward e reverse

`test` significa `src/server/whatsapp/__tests__/analytics-query.test.ts`.
Cada linha também mapeia todos os asserts desse cenário de volta ao AC indicado;
todos são mantidos. Resultado/header/contador/abort adicionais verificam o mesmo
contrato, sem ampliar requisito. 401 e 403 são cenários distintos parametrizados.

| AC/cenário | file:line + expressão | Esperado da spec/Design | Forward / reverse |
| --- | --- | --- | --- |
| USO-01 AC1/2/3/8, request | test:25 `expect(await queryAnalytics(query, adapter, { fetch: fetcher })).toEqual({ ok: true, volume: 999n, remaining: 1, progress: 0.999 })`; test:29 `expect(url.origin + url.pathname).toBe("https://graph.facebook.com/v25.0/1000000000000000/pricing_analytics")`; test:30 filtros/start/end explícitos; test:33/34 URL sem ID de filtro errado/token; test:37 Authorization servidor | Uma consulta com filtros comprovados e número normalizado, não ID inferido; volume999 | Coberto / manter |
| USO-01 AC7/8, default/prova | test:43 `expect(await queryAnalytics(query, null, { fetch: fetcher })).toEqual({ ok: false, reason: "contract-unverified" })`; test:44 cópia do handle mesmo erro; test:45/46/47/48 factory default/prova inválida/versão26/ID recusados; test:49 `expect(fetcher).not.toHaveBeenCalled()` | Claim não concede capacidade; sem rede | Coberto / manter |
| L14B-01 AC2/4, sem credencial | test:55 `expect(await queryAnalytics(query, adapter, { fetch: fetcher })).toEqual({ ok: false, reason: "credential-missing" })`; test:56 `expect(fetcher).not.toHaveBeenCalled()` | Sem token não consulta nem publica zero | Coberto / manter |
| USO-02 AC6, HTTP401 | test:60 `expect(await queryAnalytics(query, adapter, { fetch: async () => response({ error: { message: `${token} conversa privada` } }, status) })).toEqual({ ok: false, reason: "permission-denied" })`, status 401 em test:59 | Permissão inválida vira código limitado | Coberto / manter |
| USO-02 AC6, HTTP403 | mesma expressão test:60, status 403 em test:59 | Permissão recusada vira código limitado | Coberto / manter |
| USO-02 AC6, HTTP429 | test:66 `expect(await queryAnalytics(query, adapter, { fetch: fetcher })).toEqual({ ok: false, reason: "rate-limited" })`; test:67 `expect(fetcher).toHaveBeenCalledTimes(1)` | Falha sem retry nem zero | Coberto / manter |
| L14B-01 AC2/4; USO-02 AC6, erro bruto | test:75 `expect(results).toEqual(Array(3).fill({ ok: false, reason: "transport-failed" }))`; test:76/77 JSON sem token/conversa; test:78 `expect(log).not.toHaveBeenCalled()` | Rede/HTTP500/JSON inválido retornam erro limitado, sem log bruto | Coberto / manter |
| USO-02 AC6, fetch 15s | test:88 `expect(settled).toBe(false)` após 14.999ms; test:89 signal não abortado; test:91 `expect(await pending).toEqual({ ok: false, reason: "timeout" })`; test:92 `expect(signal!.aborted).toBe(true)` aos 15.000ms | Prazo exato com abort do transporte pendente | Coberto / manter |
| USO-02 AC6, JSON compartilha orçamento | test:105 `expect(json).toHaveBeenCalledTimes(1)` após fetch 10s; test:107 não settled em 14.999ms; test:109 `expect(await pending).toEqual({ ok: false, reason: "timeout" })`; test:110 signal abortado | Corpo não reinicia prazo 15s | Coberto / manter |
| USO-01 AC7, paginação | test:115 `expect(await queryAnalytics(query, adapter, { fetch: fetcher })).toEqual({ ok: false, reason: "incomplete-response" })`; test:116 fetch uma vez | next não é seguido nem página parcial vira snapshot | Coberto / manter |
| USO-01 AC1/7, bucket/país | test:120 `expect(await queryAnalytics(query, adapter, { fetch: async () => response(payload({ start: 1790838000, end: 1790924400 })) })).toEqual({ ok: false, reason: "incomplete-response" })`; test:122 país Brazil recebe invalid-response | Lacunas reais e alias não são completados por inferência | Coberto / manter |
| USO-01 AC7/8, identidade/shape | test:127 `expect(await queryAnalytics(query, adapter, { fetch: async () => response(payload({ phone_number: "5511888880000" })) })).toEqual({ ok: false, reason: "identity-mismatch" })`; test:129 grupo unfamiliar recebe incomplete-response | Número/shape desconhecido não vira saldo | Coberto / manter |
| USO-01 AC2/7, zero explícito/vazio | test:134 `expect(await queryAnalytics(query, adapter, { fetch: async () => response(payload({ volume: 0 })) })).toEqual({ ok: true, volume: 0n, remaining: 1000, progress: 0 })`; test:136 data[] recebe zero-unverified | Zero de volume explícito válido; vazio não presume zero | Coberto / manter |
| USO-01 AC7, prova de vazio | test:142 `expect(await queryAnalytics(query, zeroAdapter, { fetch: async () => response({ data: [] }) })).toEqual({ ok: true, volume: 0n, remaining: 1000, progress: 0 })` | Só prova específica sintética permite essa representação | Coberto / manter |
| USO-02 AC2/8, guarda/cancelamento | test:148 `expect(await queryAnalytics(query, adapter, { fetch: fetcher, beforeFetch: async () => false })).toEqual({ ok: false, reason: "request-obsolete" })`; test:151 signal já abortado recebe request-obsolete; test:152 `expect(fetcher).not.toHaveBeenCalled()` | Trabalho obsoleto não inicia transporte | Coberto / manter |
| USO-01 AC7, country null | test:156 `expect(await queryAnalytics(query, adapter, { fetch: async () => response(payload({ country: null })) })).toEqual({ ok: false, reason: "invalid-response" })` | Forma observada string não comprova agregado null | Coberto / manter |
| USO-02 AC6, JSON síncrono | test:166 `expect(await queryAnalytics(query, adapter, { fetch: async (_url, init) => { signal = init!.signal!; return body; } })).toEqual({ ok: false, reason: "timeout" })`; test:168 signal abortado; relógio monotônico 15.000ms | Success recusado mesmo antes de executar callback do timer | Coberto / manter |
| USO-02 AC6, decode síncrono | test:179 mesma chamada recebe timeout; test:181 signal abortado; getter avança relógio 15.001ms durante decode | Volume não publicado depois do deadline | Coberto / manter |

Checks A/B/C/D: 18 cenários com resultados explícitos, timers sem custo real,
prova separada de caso sintético versus conta observada, erros sem conteúdo e
regressões preservadas. Snapshot anterior/lease/CAS são T13, não afirmados aqui.
