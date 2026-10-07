# Lote 15 — Validação

**Verdict:** PENDING (gate T0 registrado; Verifier ainda não rodou)

## Gate de viabilidade (T0, 2026-10-07)

Nenhum valor de variável, token ou chave foi lido ou registrado.

| Fato | Resultado | Fonte |
| --- | --- | --- |
| F1 — Hobby limita o cron a 1×/dia, ±59 min | Confirmado | Docs Vercel "Usage & Pricing for Cron Jobs", consultadas em 2026-10-07 (planejamento) |
| F2 — `/api/cron/expire-documents` executou em produção nos últimos 3 dias | **Parcial: não comprovado** | Leitura de logs recusada pela API: o plano Hobby retém 1 h de log (`get_runtime_logs`, 400 `bad_request`, janela de 3 d). O usuário confirmou no painel (Settings > Cron Jobs) que o cron está **ativo**, mas não consegue ver execução recente |
| F3 — domínio de `RESEND_FROM` verificado no Resend | Confirmado | MCP Resend `list-domains` (leitura autorizada pelo usuário): único domínio `usekrivo.online`, status `verified`, envio habilitado, região `sa-east-1`. O usuário confirmou que `RESEND_FROM` de produção usa `usekrivo.online` (o executor não lê o valor) |
| F4 — `RESEND_FROM` existe no ambiente Production da Vercel | Confirmado | Conferência do usuário no painel, 2026-10-07 |

**Consequência:** F2 não se confirma por evidência de execução. A Phase 3 (T10–T15) fica
**bloqueada** até haver prova de que o cron roda em produção; as Phases 1–2 (T1–T9) seguem. Caminho
para destravar: o usuário abre os logs do cron no painel da Vercel logo depois das 03:00 UTC (±59
min) e confirma uma execução 200, ou autoriza a leitura pelo MCP dentro da janela de 1 h seguinte à
execução. Produção hoje está no commit `e82abe0` (deployment `dpl_Ea4kiPTtKtNGdCad58Qs6rKPe63n`,
READY), rollback candidate.
