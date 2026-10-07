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

## Schema em produção (T11, 2026-10-07)

Autorização do usuário no chat (2026-10-07): "aplicar à mão os dois ADD COLUMN e o check".

**Por que não `drizzle-kit push`:** o plano dele traz ruído antigo (derruba e recria 9 FKs, recria 5
índices únicos que já existem) e, sem terminal interativo, executa tudo sem pedir confirmação. Fora
do que o lote prometia (só 2 colunas e o check), então a regra da T11 mandava parar; o usuário
escolheu o caminho manual.

**Alvo:** banco de produção (host `ep-gentle-brook-…`, distinto dos hosts de teste; o script abortava
se coincidisse com `TEST_DATABASE_URL`). Estado antes: 3 tenants, nenhuma das colunas, nenhum check.

**DDL aplicado numa transação, com `lock_timeout` de 5 s:**

```sql
ALTER TABLE "tenants" ADD COLUMN "integration_health_state" text;
ALTER TABLE "tenants" ADD COLUMN "integration_health_changed_at" timestamp with time zone;
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_integration_health_state_check"
  CHECK ("tenants"."integration_health_state" in ('saudavel', 'problema'));
```

**Estado depois:** as duas colunas existem e aceitam nulo (`text` e `timestamptz`), o check
`tenants_integration_health_state_check` existe, os 3 tenants seguem lá. O código de produção atual
não lê as colunas (aditivas, nullable), então o deploy atual não é afetado.

**Rollback:**

```sql
ALTER TABLE tenants DROP COLUMN integration_health_state, DROP COLUMN integration_health_changed_at;
```

(derrubar a coluna derruba o check junto). O script foi temporário e removido; nada foi versionado.

## Variável do operador em produção (T12, 2026-10-07)

Ação do usuário. O usuário confirmou no chat (2026-10-07) que criou `CRIVO_OPERATOR_ALERT_EMAIL` no
ambiente Production da Vercel. O valor não foi lido, colado nem registrado; o executor não consultou
o painel. Confirmação satisfaz ALERTA-04 AC5 antes do push.

## Full e auditoria pré-push (2026-10-07)

**Full (`npm test`), duas execuções, antes do push:**

| Execução | Resultado |
| --- | --- |
| 1 | 3489 passaram, 3 falharam (207 arquivos): `actions.test.ts` e `mutations.test.ts`, nome duplicado de categoria de documento. Nenhuma das duas instabilidades conhecidas (`DOCLIM-01 AC8`, retenção). |
| 2 (após reparo do banco de teste) | **207 arquivos, 3492 testes, exit 0.** |

**Causa da falha 1:** o índice único `document_categories_tenant_id_lower_name_idx` não existia nos 5
bancos de teste, e os 3 testes deixaram 6 linhas de fixture duplicadas em 2 deles. Nenhum código do
lote toca categorias de documento. O momento em que o índice sumiu não foi estabelecido: o log do
primeiro `db:push:test` do lote não guardou os statements, e os logs seguintes não trazem `DROP INDEX`.
O `drizzle-kit push` não enxerga os índices únicos (propõe recriar 5 que existem), então não serve de
prova nem de reparo. **Reparo:** apagadas só as fixtures duplicadas por id/nome (`Categoria Duplicada…`,
`Categoria Case…`, sem documentos) e índice recriado nos 5 bancos com o DDL do `schema.ts`. Os dois
arquivos passaram sozinhos (106 testes) e a Full 2 passou inteira. Nenhum teste foi alterado.

**Gate de build:** `npm run lint` 0 erros (9 avisos antigos); `tsc` 50 erros, os mesmos de antes do lote.

**Auditoria de trailer (AD-014), HEAD `a55bb39`:** `origin/main..HEAD` (17 commits) e `origin/main`
inteiro (656 commits, `e82abe0`) sem `Co-Authored-By`, "Generated with" nem marca de atribuição.

**Pendente antes do push:** F2 segue parcial (leitura dos logs do cron agendada para 2026-10-08
03:22 UTC); autorização do usuário ao push com o hash e a lista de commits.

## Push e deploy (T13, 2026-10-07)

**Autorização do usuário no chat:** "Autorizo o push de e2565ee." Hash enviado e aprovado: `e2565ee`.
Antes do push: `origin/main` em `e82abe0`, 18 commits à frente e 0 atrás, trailers 0 no range e em
`origin/main` inteiro, build gate verde, Full verde (seção anterior).

**Push:** `git push origin main`, `e82abe0..e2565ee`.

**Deploy:** `dpl_HJ8PLH3yG4MDj4mjjGCV8VzypLC1`, `target: production`, commit `e2565ee`, estado
`READY`. Verificações de leitura depois do deploy: `GET /api/cron/expire-documents` sem secret
devolve **401** (a rota continua protegida e não executou a manutenção) e a home responde 307 (login).

**F2 (cron executa em produção): não comprovada, risco aceito pelo usuário.** O usuário decidiu
seguir sem esperar a leitura dos logs ("Considere validado a leitura de mais tarde até que ela
realmente ocorre. Quando ela ocorre, veremos o que fazer"). Este registro mantém F2 como **parcial**
até a leitura real: ela fica agendada para 2026-10-08 03:22 UTC. Se o cron não aparecer, o alerta não
dispara em produção, e nada mais quebra.

**Rollback:** reimplantar na Vercel o deployment anterior `dpl_Ea4kiPTtKtNGdCad58Qs6rKPe63n` (commit
`e82abe0`, `isRollbackCandidate: true`). As colunas novas são aditivas e nullable, então o código
antigo continua funcionando com elas.
