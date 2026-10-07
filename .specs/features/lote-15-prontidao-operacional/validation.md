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

## Envio de teste ao operador (T10, 2026-10-07)

Autorização: o usuário pediu a execução de `npm run alert:send-test` em 2026-10-07, com
`CRIVO_OPERATOR_ALERT_EMAIL` e `RESEND_FROM` no ambiente local. O endereço completo do operador não
é registrado aqui.

| Tentativa | Resultado |
| --- | --- |
| 1 | Resend recusou com 422: destinatário era um endereço de domínio de exemplo (valor de placeholder no ambiente local). Nada enviado. Corrigido pelo usuário. |
| 2 | Aceito e `delivered`, mas com remetente padrão `onboarding@resend.dev` (sem `RESEND_FROM` local), que só entrega ao dono da conta e não prova o domínio verificado. O comando saiu com 127 por um assert do libuv no Windows (`process.exit` com socket fechando); corrigido em `310445b` (`process.exitCode`). |
| 3 | Aceito, id do provedor `01a117b7-1556-77b9-b145-ae2467acb68c`, status `delivered` (MCP Resend `get-email`, leitura). Remetente `Crivo <support@usekrivo.online>`, domínio verificado na F3. Assunto `[teste] [crivo] Integração com problema em 1 imobiliária(s)`. Comando saiu com código 0. |

Confirmação do usuário (2026-10-07): o e-mail chegou na caixa de entrada, com remetente no domínio
`usekrivo.online`. T10 concluída. O gate F2 segue parcial: a leitura dos logs do cron está agendada
para 2026-10-08 03:22 UTC.
