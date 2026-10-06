# L14b — evidência da fase 1 / lote A

Fase 1/lote A concluídos sob a ressalva autorizada dos dois timeouts anteriores.
T1–T7 implementadas e gates medidos pelo root. Todas as 70 adições passaram; a
suíte completa não é integralmente verde. T7 integra o commit deste registro.
T7 não publica configuração remota nem habilita a conta real por inferência.

| Task | Commit | Gate comprovado |
| --- | --- | --- |
| T1 — preflight readonly | `63f6dbc` | Quick, 15/15, exit0 |
| T2 — canais | `f281a2f` | Full, 2 arquivos, 13/13 (8 novos+5 regressões), exit0, 23,46s |
| T3 — fase mínima | `08f6fc6` | Full, 3 arquivos, 20/20 (7 novos+13 regressões), exit0, 42,78s |
| T4 — episódio durável | `6110042` | Full, 4 arquivos, 30/30 (10 novos+20 regressões), exit0, 98,13s |
| T5 — recibos/canal nullable | `e676509` | Full, 5 arquivos, 38/38 (8 novos+30 regressões), exit0, 116,46s |
| T6 — snapshot mensal | `d84e9ac` | Full, 6 arquivos, 46/46 (8 novos+38 regressões), exit0, 139,69s |
| T7 — resolvedor servidor | Commit deste registro | Full, 4 arquivos, 43/43 (14 novos + 29 regressões), exit0, 36,22s |

Testes de schema e resolvedor conectam Postgres real na branch test. T2–T6 foram
aplicadas pelo root como SQL exato em cinco transações por tarefa, uma por alvo,
todas isError=false. Alvos/hash/revisão/autorização registrados em
[test-schema-activation.md](test-schema-activation.md). Cinco aplicações não são
cinco execuções das suítes. Main/produção ficaram excluídas.

Adequação forward/reverse por task em [tasks.md](tasks.md), com file:line,
asserção e parcela dos ACs. Nenhum teste anterior foi alterado, removido ou
pulado. Nenhum subagente foi criado por este worker; autoria e verificação final
da feature permanecem distintas. O verifier global será executado após T68.

## Checks da fase

| Check | Resultado |
| --- | --- |
| Full T7 + cloud-api + canais + auth | Passou pelo root: 4 arquivos, 43/43, exit0, 36,22s |
| npm test completo | Exit1, 151/152 arquivos e 2470/2472 testes, 363,23s; só os dois timeouts históricos autorizados; todas as 70 adições passaram |
| npm run lint | Passou pelo root: exit0, 0 erros e os mesmos 5 avisos anteriores |
| npm run build | Passou pelo root: exit0, Next 16.2.11, geração de rotas concluída; mesmos avisos BetterAuth do baseline, sem valores de segredo |
| tsc --noEmit | Pós-build pelo root: exit1, exatamente 50 erros; Compare-Object das linhas error TS com baseline retornou vazio, nenhum erro novo |
| validate_spec/tasks --strict | 0 errors / 0 warnings no fechamento T7 |
| check_commit / whitespace | Passaram localmente no fechamento T7 |

Baseline anterior: 2400/2402, dois timeouts DOCLIM-01 AC8 em
actions.test.ts:1337/:1349. O usuário determinou registrar e resolver depois.
Continuam ativos e qualquer falha nova/diferente precisa ser resolvida. A
ressalva não equivale a suíte integralmente verde. Baseline lint/build passaram;
tsc mantém exatamente 50 erros anteriores. Resultado fresco de fase confirmou
somente as duas falhas actions.test.ts:1337/:1349, timeout 30s, DOCLIM-01 AC8; todos
os demais testes passaram. A autorização permite fechar esta fase, preservando
esses testes e suas assertions/timeouts. Não alterar contagem nem declarar a
suíte completa verde. Nenhuma falha nova ou diferente foi encontrada.

## Limites da entrega

Modelos/constraints provados não substituem CAS e imutabilidade transacional do
despacho T20/T21, reducer/autenticação/correlação T8–T10, Analytics/lease T11–T13,
leituras autorizadas T14 ou retenção T63/T64. O resolvedor recebe contexto já
autorizado, não amplia carteira; retorna configuração interna do servidor.
Transportes leem WHATSAPP_ACCESS_TOKEN no processo; token não entra no retorno.
Configuração Analytics indisponível não bloqueia identidade do canal confiável.

Fatos reais pendentes: vínculo número/tenant, tradução primária timezone_id→IANA,
acesso/contrato/zero Analytics, prova de produção e HMAC instalado. WABA conhecida
1000796702954808 é conta de teste. Fixtures não comprovam esses fatos. A tentativa
Graph T1 não concluiu fora do sandbox; não houve resposta/captura inventada.
Sem saldo zero presumido, backfill de fase/canal, contagem de webhook adicionada
a Analytics, publicação n8n, envio WhatsApp, push ou deploy deste lote A.

Sem SPEC_DEVIATION na fase 1. Logs e scripts *.local.* não entram nos commits;
Handoff e STATE são mantidos pelo orquestrador.
