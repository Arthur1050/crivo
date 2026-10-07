# Lote 15 — Validação

**Verdict:** PASS com ressalvas — na reverificação (iteração 1) os 6 sobreviventes não equivalentes e os 2 mutantes novos da soma morreram, e 121/121 testes passam. Ficam pendentes a ALERTA-04 AC6 (T14) e a F2, que dependem da leitura dos logs do cron depois das 03:00 UTC, por decisão do usuário. Detalhe em "Reverificação (iteração 1)".

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

## Linhas inertes de `conversa_estado` (T15, 2026-10-07)

**Autorização do usuário no chat:** pediu para tentar pelo MCP e, se impossível, usar a extensão do
navegador, e informou a URL da instância. Isso substitui a divisão do EXECUTE-PROMPT (T15 como ação do
usuário) para esta task, só para estas duas linhas.

**MCP do n8n:** impossível. Não há ferramenta para ler nem remover linha de Data Table (só criar
tabela, adicionar linhas e mexer em colunas). A tabela existe (`conversa_estado`, id `ZsplBxJjXv3kwKZ8`).

**Extensão do Chrome (sessão logada do usuário):** a Data Table tinha exatamente 2 linhas (Total 2):
id 2 `test-tenant-lote6c` e id 3 `test-tenant-lote6c-turnlimit`, as duas alvo. Ambas selecionadas e
apagadas pela interface, com a caixa de confirmação "delete 2 rows". Depois: "No rows", Total 0. Nenhuma
outra linha existia nem foi tocada, nenhum workflow foi alterado, nenhum valor de credencial foi lido.
A aba aberta foi fechada.

## Verificação independente (Verifier Opus)

**Data:** 2026-10-07 · **Verifier:** sub-agente independente (autor ≠ verificador) · **Diff:**
`git diff e82abe0..HEAD -- src app scripts vitest.config.ts package.json n8n/README.md docs` (21
arquivos, +1894/−11; commits de código `83418d7`, `5624094`, `e49b3b1`, `7fe4a74`, `1a8f6eb`,
`d030e4b`, `1c97d36`, `de3f618`, `14c9970`, `310445b`).

### Veredito

**FAIL.** Nenhum defeito de produto bloqueante: as transições, o compare-and-set, a liberação na
falha, o isolamento do grupo e a revogação fazem o que a spec pede, e os testes matam 30 dos 39
mutantes. O FAIL vem de uma lacuna de teste num AC explícito. A ALERTA-01 AC1 manda contar as
recusas com `occurredAt ≥ agora − 24h`, e nenhum teste prova que `runIntegrationAlert` passa esse
`since`. Trocar a janela por 23h (mutante 5d) ou por `since = now` (5e, o alerta nunca mais vê
recusa nenhuma) não derruba nenhum teste. Esse é justamente o sinal que motivou o alerta (recusa do
contrato). A correção é um teste, sem mudar o código. A ALERTA-04 AC6 (T14, primeira manutenção de
produção) segue pendente por depender do cron.

### Testes (rodados uma vez, banco base, sem Full)

`npx vitest run` nos 10 arquivos (os 8 do lote + `maintenance.integration.test.ts` +
`routes/cron-expire-documents.test.ts`): **10 arquivos, 117 testes, 117 passaram**, 217,8 s.

**L-055 (asserções pré-existentes):** `git diff e82abe0..HEAD` não toca
`maintenance.integration.test.ts` nem `routes/cron-expire-documents.test.ts`. Em `email.test.ts` o
diff só amplia o import (`src/server/auth/__tests__/email.test.ts:28-32`) e acrescenta o bloco novo
`:151-208`. Nenhuma asserção existente mudou.

### Checagem ancorada na spec

| AC | Desfecho da spec | Evidência (`file:line` + asserção) | Resultado |
| --- | --- | --- | --- |
| ALERTA-01 AC1 | `resolveIntegrationHealth` com a última msg `agente` e recusas do tenant + sem tenant, `occurredAt ≥ agora − 24h` | Filtros do DAL: `src/server/data/__tests__/integration-health.test.ts:106` `expect(snapshot?.lastAgentMessageAt?.toISOString()).toBe(agentAt.toISOString())` (ignora lead/humano), `:127-134` recusas próprias + sem tenant, sem a alheia, `:153-154` recusa em `since` conta e em `since − 1 ms` não. **A ligação `since = now − 24h` em `src/server/integration/integration-alert.ts:37` não tem teste** (mutantes 5d e 5e sobreviveram) | ❌ parcial |
| ALERTA-01 AC2 | `saudavel` gravado + `problema` avaliado → no alerta | `src/lib/__tests__/integration-alert.test.ts:43` `expect(plan.alert).toEqual([quiet])`; `src/server/integration/__tests__/integration-alert.integration.test.ts:104` `expect(emails).toHaveLength(1)`, `:110` estado `"problema"` | ✅ |
| ALERTA-01 AC3 | Gravado nulo → grava estado e instante, sem alerta | `integration-alert.test.ts:32-36` `initialize` com os dois estados, `alert` vazio; `integration-alert.integration.test.ts:141-147` `mentioning(broken)` 0, estado `"problema"`/`"saudavel"`, `changedAt` = `NOW` | ✅ |
| ALERTA-01 AC4 | `problema` → `saudavel` grava `saudavel`, sem e-mail | `integration-alert.test.ts:51-52`; `integration-alert.integration.test.ts:159-162` 0 e-mails, `"saudavel"`, `changedAt` = `NOW` | ✅ |
| ALERTA-01 AC5 | Igual → estado e instante intactos, sem alerta | `integration-alert.test.ts:60` plano vazio; `integration-alert.integration.test.ts:171-174` `changedAt` preservado partindo de valor distinto (L-053) | ✅ |
| ALERTA-01 AC6 | No máximo 1 e-mail por queda | `integration-alert.integration.test.ts:115` `expect(mentioning(tenant)).toHaveLength(0)` na 2ª execução, `:117-118` estado e instante inalterados | ✅ |
| ALERTA-01 AC7 | Execuções simultâneas → no máximo 1 e-mail | `integration-health.test.ts:231` `expect(waiting).toBeGreaterThanOrEqual(2)` (disputa real, L-052) e `:235` `expect(a.length + b.length).toBe(1)`; `integration-alert.integration.test.ts:187-188` 0 e-mails, `sent` 0. A reivindicação **parcial** (outra execução leva só parte dos tenants) não é testada: mutantes x1 e x2 | ⚠️ |
| ALERTA-02 AC1 | Exatamente 1 e-mail ao `CRIVO_OPERATOR_ALERT_EMAIL`, remetente `RESEND_FROM` ou o padrão | `integration-alert.integration.test.ts:127` `expect(sendOk).toHaveBeenCalledTimes(1)`, `:105` `expect(emails[0].to).toBe(OPERATOR)`; `src/server/auth/__tests__/email.test.ts:176` `expect(payload.from).toBe("Crivo <alertas@fixture.test>")`, `:185` padrão `"Crivo <onboarding@resend.dev>"` | ✅ |
| ALERTA-02 AC2 | Assunto `[crivo] Integração com problema em N imobiliária(s)` com N exato | `integration-alert.test.ts:94-99` `toBe(...1...)` e `toBe(...3...)`; `integration-alert.integration.test.ts:203` `expect(result.sent).toBe(listed)` | ✅ |
| ALERTA-02 AC3 | Nome, slug, contagem por `(code, rota)`, ISO UTC ou `nunca` | `integration-alert.test.ts:104-108` `toContain("invalid_token /api/v1/leads: 3")`, `"2026-10-05T14:30:00.000Z"`; `:114` `toContain("nunca")`. Ver achado D1: a mesma `(code, rota)` pode sair em duas linhas | ⚠️ precisão |
| ALERTA-02 AC4 | Sem conteúdo, telefone, nome de lead, chave | `integration-alert.test.ts:133-137` `not.toContain` para nome de lead, telefone, conteúdo, chave e `tenantId` | ✅ |
| ALERTA-03 AC1 | Destinatário ausente ou vazio → sem envio, `saudavel` mantido, `skipped: "destinatario-ausente"` | `integration-alert.integration.test.ts:217-227` (`undefined`, `""`, `"   "`): `not.toHaveBeenCalled()`, `skipped` `"destinatario-ausente"`, estado `"saudavel"` e instante original | ✅ |
| ALERTA-03 AC2 | `ok:false` → restaura `saudavel`, `sendFailed: true`, nova tentativa | `integration-alert.integration.test.ts:247-251` `sendFailed` `true`, `"saudavel"`, instante anterior; `:254` reenvio na execução seguinte; `:265-266` adaptador que lança | ✅ |
| ALERTA-03 AC3 | Alerta lança → `integrationAlertFailed: true`, demais grupos iguais | `src/server/integration/__tests__/maintenance-alert.integration.test.ts:134` `toBe(true)`, `:140` `expect(withoutAlert(failed)).toEqual(withoutAlert(healthy))` (injeção, L-002) | ✅ |
| ALERTA-03 AC4 | `integrationAlertEvaluated` e `integrationAlertSent` no resultado | `integration-alert.integration.test.ts:200-201` `evaluated` entre `before + 2` e `after` (faixa, por causa do banco compartilhado), `:203` `sent` = N do assunto, `:211` `evaluated: 0` exato; `maintenance-alert.integration.test.ts:190` os cinco campos na resposta da rota | ✅ (faixa justificada) |
| REVOGA-01 AC1 | Revoga todas as ativas do rótulo e imprime a quantidade | `src/db/__tests__/revoke-service-key.test.ts:66` `toEqual({ revoked: 2 })`, `:68` nenhuma ativa com "A", `:77` "B" intacta; `:159-160` código 0 e `"2 chave(s) de serviço revogada(s)..."` | ✅ |
| REVOGA-01 AC2 | Sem ativa com o rótulo → código 1, nada alterado | `revoke-service-key.test.ts:117` `reason: "nao-encontrada"` para inexistente, caixa diferente e só revogada; `:120` snapshot igual; `:196` código 1 | ✅ |
| REVOGA-01 AC3 | Zeraria as ativas → código 1, nada alterado, cita §12.3 | `revoke-service-key.test.ts:89-92` `"ultima-chave"`, `/n8n\/README\.md §12\.3/`, snapshot igual; `:104-106`; `:174-175` código 1 e `"§12.3"` | ✅ |
| REVOGA-01 AC4 | `revoked_at` já preenchido preservado | `revoke-service-key.test.ts:72` `toBe(OLD_REVOCATION.toISOString())` (data fixa distinta de agora, L-053) | ✅ |
| REVOGA-01 AC5 | Rótulo ausente ou vazio → código 1 com uso | `revoke-service-key.test.ts:130-132` `"sem-rotulo"` e `/Uso: npm run db:revoke-service-key/`; `:186-187` `[]`, `[""]`, `["   "]` → 1 | ✅ |
| REVOGA-01 AC6 | Sem `key_hash` nem valor de chave na saída | `revoke-service-key.test.ts:162`, `:177` `expect(printed).not.toContain(hash)` | ✅ |

**Edge cases**

| Edge case | Evidência | Resultado |
| --- | --- | --- |
| Recusa + mensagem recente → `problema` | `integration-alert.test.ts:65` `expect(...alert).toEqual([refused])` | ✅ |
| Única recusa sem tenant conta para todos; o e-mail único lista cada tenant | `integration-health.test.ts:130`, `:141` (sem tenant aparece no próprio e no alheio); o e-mail único só é provado com dois tenants em silêncio (`integration-alert.integration.test.ts:127-129`), sem recusa ponta a ponta | ⚠️ |
| Última mensagem a exatamente 24h → `saudavel` | `integration-alert.test.ts:72` `toEqual(["t-passou"])` (24h fica fora, 24h + 1 ms entra) | ✅ |
| Recusa em exatamente agora − 24h conta | DAL com `since` dado: `integration-health.test.ts:153-154`. O "agora − 24h" do chamador não é testado (5d/5e) | ⚠️ |
| Nenhum tenant → `evaluated: 0`, sem e-mail | `integration-alert.integration.test.ts:211-212` `toEqual({ evaluated: 0, sent: 0, skipped: null, sendFailed: false })`, `not.toHaveBeenCalled()` | ✅ |

**Ações externas e docs (verificável em arquivo)**

| Item | Evidência | Resultado |
| --- | --- | --- |
| ALERTA-04 AC1 | § Gate deste arquivo: F1, F3 e F4 confirmados; F2 **parcial** | ⚠️ |
| ALERTA-04 AC2 | F2 não confirmado, mas a Phase 3 seguiu por decisão registrada do usuário (§ Push e deploy). Desvio da letra do AC, aceito pelo usuário | ⚠️ desvio aceito |
| ALERTA-04 AC3 | § Envio de teste: tentativa 3 `delivered`, confirmação do usuário; `scripts/__tests__/send-test-integration-alert.test.ts:24` assunto começa com `[teste] [crivo]` | ✅ |
| ALERTA-04 AC4 | § Schema (T11) registrado antes de § Push e deploy (T13), cada um com autorização | ✅ |
| ALERTA-04 AC5 | § Variável (T12) antes do push | ✅ |
| ALERTA-04 AC6 | T14 pendente (leitura dos logs agendada) | ❌ pendente |
| LIMPA-01 AC1 | § Linhas inertes: 2 linhas apagadas, data registrada. Quem apagou foi o executor, pela extensão, com autorização (a spec dizia o usuário) | ✅ (ator mudou, autorizado) |
| DOC-01 AC1 | `.specs/ROADMAP-POS-PILOTO.md:278` L15 `✅ EXECUTADO`; `:285` item 1 → L14c; `:287` item 3 deferido com gatilho; `:291` item 7 em `f7e512f`; item 8 aceito sem artefato na mesma tabela | ✅ |
| DOC-01 AC2 | `n8n/README.md:410` passo 1 `db:mint-service-key`; `:413` passo 4 `db:revoke-service-key`; `git grep "UPDATE service_api_keys"` só encontra o texto do próprio critério no `tasks.md` arquivado | ✅ |
| DOC-01 AC3 | `.specs/STATE.md:347` AD-039 ativa; o Scope diz "Não altera a AD-023" e nada nela contradiz `:216-222` | ✅ |
| DOC-01 AC4 | `.specs/features/INDEX.md:57` linha do lote 15 | ✅ |
| Scripts | `package.json` `db:revoke-service-key` e `alert:send-test` (`tsx --conditions=react-server`) | ✅ |

**Contagem:** dos 21 ACs testáveis (ALERTA-01/02/03, REVOGA-01), 17 estão cobertos com o desfecho da
spec, 3 têm cobertura com ressalva de precisão (ALERTA-01 AC7, ALERTA-02 AC3, ALERTA-03 AC4, este
último justificado) e 1 está parcialmente sem evidência (ALERTA-01 AC1).

### Sensor de discriminação

Mutação no arquivo real, um mutante por vez, com cópia de segurança em scratch fora do repositório.
Cada execução rodou só os testes alvo (`-t` quando cabia) e restaurou o arquivo da cópia em seguida,
conferindo o SHA-256. Profundidade: P0 expandida (39 mutantes).

| # | Arquivo | Mutação | Resultado |
| --- | --- | --- | --- |
| 1a | `src/server/data/integration-health.ts:105` | select travado sem `state = 'saudavel'` | MORTO: `integration-health.test.ts:184`, `:190`, `:235` |
| 1b | `integration-health.ts:111` | update sem `state = 'saudavel'` | SOBREVIVEU, **equivalente**: as linhas vêm do select `FOR UPDATE` filtrado na mesma transação e ninguém muda o estado delas antes do update |
| 1c | `integration-health.ts:105,111` | sem a condição nos dois | MORTO: `:184`, `:190`, `:235` |
| 2 | `integration-health.ts:106` | sem `.for("update")` | MORTO: `integration-health.test.ts:235` (`a.length + b.length` = 2) |
| 3a | `integration-health.ts:125` | release grava `claimedAt` | MORTO: `:250`, `:259` |
| 3b | `integration-health.ts:125` | release grava `null` | MORTO: `:250` |
| 4a | `integration-health.ts:130` | release sem a guarda `changedAt = claimedAt` | MORTO: `:269` |
| 4b | `integration-health.ts:129` | release sem a guarda `state = 'problema'` | **SOBREVIVEU** (quase equivalente, ver lacunas) |
| 5a | `integration-health.ts:41` | `gte` → `gt` | MORTO: `:153` |
| 5b | `integration-health.ts:41` | `since + 1 ms` | MORTO: `:153` |
| 5c | `integration-health.ts:41` | `since − 1 ms` | MORTO: `:154` |
| 5d | `src/server/integration/integration-alert.ts:11` | janela 24h → 23h | **SOBREVIVEU** |
| 5e | `integration-alert.ts:37` | `since = now` (recusa nunca conta) | **SOBREVIVEU** |
| 6a | `src/lib/integration-alert.ts:40` | gravado nulo vai para `alert` | MORTO: `integration-alert.test.ts:32`, `integration-alert.integration.test.ts:143` |
| 6b | `src/lib/integration-alert.ts:40` | inicializa sempre `saudavel` | MORTO: `:32`, `:143` |
| 7 | `src/server/integration/lgpd.ts:282` | grupo do alerta fora do `runGroup` (sem catch) | MORTO: `maintenance-alert.integration.test.ts:127` |
| 8a | `integration-alert.ts:51-60` | reivindica antes de checar o destinatário | MORTO: `integration-alert.integration.test.ts:226` (×3), `:237` |
| 8b | `integration-alert.ts:77` | não libera em `ok:false` | MORTO: `:250`, `:266` |
| 8c | `integration-alert.ts:74` | `ok:false` tratado como enviado | MORTO: `:247`, `:265` |
| 9a | `integration-health.ts:60` | recusa sem tenant não somada | MORTO: `integration-health.test.ts:127` |
| 9b | `integration-health.ts:30` | sem `sender = 'agente'` | MORTO: `:106`, `:113` |
| 10a | `src/lib/integration-alert.ts:34` | `lastSuccessAt` = `storedChangedAt` | MORTO: `integration-alert.test.ts:32`, `:51`, `:60`, `:72` |
| 10b | `src/lib/integration-alert.ts:35` | `refusalCount: 0` | MORTO: `:65` |
| 10c | `src/lib/integration-alert.ts:35` | `refusalCount` = número de grupos | SOBREVIVEU, **equivalente**: cada grupo vem de `count()` agrupado, sempre ≥ 1, e `resolveIntegrationHealth` só testa `> 0` |
| 10d | `src/lib/integration-alert.ts:37` | `now − 1 ms` no `resolveIntegrationHealth` | MORTO: `:72` |
| 11a | `src/db/revoke-service-key.ts:56` | sem a recusa de última chave | MORTO: `revoke-service-key.test.ts:89`, `:104`, `:174` |
| 11b | `revoke-service-key.ts:46,68` | seleção sem `isNull` e update sem `isNull` | MORTO: `:66`, `:72` e outros 4 |
| 11c | `revoke-service-key.ts:68` | só o update sem `isNull` | SOBREVIVEU, **equivalente**: os ids vêm da seleção de ativas travada `FOR UPDATE` na mesma transação |
| 11d | `revoke-service-key.ts:48` | rótulo sem distinguir caixa | MORTO: `:117` |
| 12a | `app/api/cron/expire-documents/route.ts:49` | rota não passa `integrationAlert` | MORTO: `maintenance-alert.integration.test.ts:188`, `:210` |
| 12b | `vitest.config.ts:41` | sem `CRIVO_OPERATOR_ALERT_EMAIL: ""` | MORTO: `maintenance-alert.integration.test.ts:180` (rodado só com `-t L-037`, sem envio possível) |
| 12c | `route.ts:46` | destinatário fixo `undefined` | MORTO: `:210` |
| 13a | `src/lib/integration-alert.ts:70` | N fixo em 1 | MORTO: `integration-alert.test.ts:97` |
| 13b | `src/lib/integration-alert.ts:51` | corpo despeja o snapshot inteiro (`JSON.stringify`) | MORTO: `:134` |
| 13c | `src/lib/integration-alert.ts:51` | corpo vaza `tenantId` | MORTO: `:137` |
| 13d | `src/lib/integration-alert.ts:51` | corpo vaza `storedChangedAt` | **SOBREVIVEU** (a spec não proíbe esse campo, ver lacunas) |
| x1 | `integration-alert.ts:65` | e-mail lista todos de `plan.alert`, não só os reivindicados | **SOBREVIVEU** |
| x2 | `integration-alert.ts:75` | `sent` = `plan.alert.length` | **SOBREVIVEU** |
| x3 | `integration-alert.ts:48` | recuperação não gravada | MORTO: `integration-alert.integration.test.ts:161` |

**Resultado:** 39 mutantes, 30 mortos e 9 sobreviventes. Desses 9, 3 são equivalentes (1b, 10c,
11c) e 6 não são (4b, 5d, 5e, 13d, x1, x2).

**Integridade do sensor:** SHA-256 dos 7 arquivos tocados (`src/lib/integration-alert.ts`,
`src/server/data/integration-health.ts`, `src/server/integration/integration-alert.ts`,
`src/server/integration/lgpd.ts`, `app/api/cron/expire-documents/route.ts`,
`src/db/revoke-service-key.ts`, `vitest.config.ts`) gravados antes e conferidos depois com
`sha256sum -c`: todos `OK`. `git status --porcelain` no fim é idêntico ao baseline (só os 4 arquivos
que já estavam modificados antes da verificação: `.env.example` e 3 de `n8n/generated/`). Não foram
usados `git stash`, `checkout` nem `reset`.

### Defeitos que os testes não pegam (item D)

- **D1 (baixa): a mesma `(code, rota)` pode aparecer em duas linhas no e-mail.**
  `src/server/data/integration-health.ts:45-61` agrupa por `(tenant_id, code, route)` e anexa as
  linhas sem tenant sem somar. Uma recusa com tenant e outra sem tenant na mesma `(code, rota)` saem
  como duas linhas com contagens parciais. O Dashboard soma as duas numa linha só
  (`src/server/data/index.ts:3269-3278`). O estado de saúde não muda (o total é igual), mas o e-mail
  diverge da tela e da letra da ALERTA-02 AC3 ("contagem por `(code, rota)`"). O teste
  `integration-health.test.ts:116-145` usa rotas distintas e não exercita o caso.
- **D2 (média): a queda pode ficar presa sem e-mail.** `src/server/integration/integration-alert.ts:57-79`
  grava `problema` (commit do CAS) antes de enviar. Três casos deixam o tenant em `problema` sem que
  nenhum e-mail tenha saído: o processo morre ou estoura o tempo entre o claim e o envio, ou
  `releaseIntegrationProblems` lança depois de um `ok:false`. A execução seguinte vê gravado igual a
  avaliado e nunca alerta. O `runGroup` reporta `integrationAlertFailed: true` só no caso da
  exceção. É o custo do at-most-once escolhido no design, mas nem a spec nem o design registram esse
  modo de perda.
- **D3 (baixa): a causa da falha de envio é descartada.** `integration-alert.ts:67-79` guarda só
  `sendFailed: true`, e o log da rota (`route.ts:52-58`) leva só flags. Sem `RESEND_API_KEY` em
  produção o alerta falha fechado e tenta de novo todo dia (correto pela L-030), mas o operador só vê
  `sendFailed: true`, sem o motivo.
- **D4 (baixa): o rótulo é aparado antes de comparar.** `src/db/revoke-service-key.ts:38,48` aplica
  `trim` ao argumento e compara com o rótulo gravado sem `trim`. Um rótulo gravado com espaço nas
  bordas não pode ser revogado pelo comando. A spec diz "exatamente igual" e não diz nada sobre o
  `trim`.
- **D5 (baixa): três constantes de 24h independentes.** `integration-alert.ts:11` (janela das
  recusas do alerta), `src/lib/pilot-metrics.ts:24` (silêncio) e a janela do Dashboard
  (`app/(crm)/dashboard/page.tsx:106`). "Mesma regra do Dashboard" depende de as três seguirem
  iguais, e os mutantes 5d e 5e mostram que nenhum teste prende a do alerta.
- **Ligação do código de saída dos CLIs sem teste (baixa, L-026).** `revoke-service-key.ts:96-104` e
  `scripts/send-test-integration-alert.ts:48-58` passam o retorno para `process.exit`/`exitCode`.
  Os testes provam só a função `run*`.
- Nenhum vazamento encontrado: o e-mail leva nome, slug, recusas e o instante. O log da rota leva só
  contagens e flags (`maintenance-alert.integration.test.ts:220-223`). A saída do CLI não leva
  `key_hash`.

### Lacunas ranqueadas (fix tasks)

1. **Alta: janela `agora − 24h` do alerta sem teste (ALERTA-01 AC1; mutantes 5e e 5d).** Teste que
   faltou, em `integration-alert.integration.test.ts`: tenant `saudavel` com mensagem recente do
   agente e uma recusa própria com `occurredAt` = `NOW − 24h` exato → entra no e-mail. Outro tenant
   igual com a recusa em `NOW − 24h − 1 ms` → não entra. Cobre também o edge case "recusa
   exatamente em agora − 24h" e o "e-mail único com recusa", ponta a ponta.
2. **Média: reivindicação parcial (ALERTA-01 AC7, ALERTA-03 AC4; mutantes x1 e x2).** Teste que
   faltou: dois tenants em queda, `claimIntegrationProblems` mockado para a "outra execução"
   reivindicar só um deles antes. Afirmar que o e-mail cita só o tenant reivindicado e que `sent` = 1.
3. **Média: perda silenciosa por estado preso (D2).** Decidir com o usuário se fica como trade-off
   documentado (emenda da AD-039 ou do design) ou se a liberação passa a cobrir falha da própria
   liberação e timeout.
4. **Baixa: guarda `state = 'problema'` da liberação não discriminada (mutante 4b).** Quase
   equivalente: só muda o resultado se outra execução gravar `saudavel` com `at` igual ao
   `claimedAt`. Teste: gravar `saudavel` em `claimedAt` e liberar. O `changed_at` tem de continuar
   `claimedAt`.
5. **Baixa: linhas duplicadas por `(code, rota)` no e-mail (D1).** Somar por `(code, rota)` no
   snapshot ou emendar a spec.
6. **Baixa: `storedChangedAt` no corpo não é proibido (mutante 13d).** É lacuna de precisão da spec
   (a ALERTA-02 AC4 lista o que não pode sair, e a T2 diz "nenhum campo além dos do snapshot", que
   inclui `storedChangedAt`). Não pede teste enquanto a spec não proibir o campo.
7. **Baixa: motivo do `sendFailed` não registrado (D3); `trim` do rótulo (D4); exit dos CLIs sem
   teste.**

**Pendente fora do código:** ALERTA-04 AC6 (T14) e a F2 do gate.

### Lacunas de precisão da spec

- ALERTA-02 AC3 não diz se as recusas com e sem tenant de mesma `(code, rota)` se somam (D1).
- ALERTA-03 AC4: "`integrationAlertEvaluated` (tenants avaliados)". O banco de teste é
  compartilhado, então só o caso vazio admite igualdade exata. A faixa usada no teste está
  justificada.
- REVOGA-01 AC1 "exatamente igual" vs `trim` do argumento (D4).
- ALERTA-04 AC2 e LIMPA-01 AC1: a execução divergiu da letra (produção com F2 parcial; limpeza feita
  pelo executor). As duas divergências foram autorizadas pelo usuário e estão registradas, mas a spec
  não foi emendada.

### Lições candidatas (não gravadas; decisão do usuário, AD-028)

- **C1 (de 5d/5e):** quando o chamador calcula a fronteira de uma janela (`since = agora − X`) e a
  passa a um DAL que tem teste de fronteira próprio, testar a fronteira também pelo chamador. O teste
  do DAL com `since` dado não prova o `X` de quem chama.
- **C2 (de x1/x2):** um compare-and-set em lote pode vencer só parte das linhas. Testar a vitória
  parcial e afirmar que o efeito colateral (e-mail, contagem) usa só as linhas reivindicadas, não o
  plano inteiro.
- **C3 (de D1):** quando um AC fixa uma chave de agrupamento para o que se mostra (`por (code, rota)`)
  e a fonte junta duas origens (com e sem tenant), a spec diz se elas se somam, e o teste usa as
  duas origens na mesma chave.

## Reverificação (iteração 1)

**Data:** 2026-10-07 · **Verifier:** o mesmo sub-agente independente · **Diff desde o relatório:**
`b913b8d` (correção da soma no DAL e testes novos) e `39177fd` (emendas da AD-039 e da spec).

### Veredito

**Result:** PASS com ressalvas (iteração 1; substitui o veredito do relatório anterior)

**PASS com ressalvas.** As duas lacunas de teste (alta e média) estão fechadas, e os mutantes que
as expunham morreram. O D1 foi corrigido no código. O modo de perda do D2 está registrado como
trade-off aceito na AD-039 (`.specs/STATE.md:350`) e nas Emendas da spec. As ressalvas são externas:
a ALERTA-04 AC6 (T14) e a F2 do gate, as duas pendentes da leitura dos logs do cron depois das
03:00 UTC, por decisão do usuário.

### Testes

Os mesmos 10 arquivos, uma vez, no banco base: **10 arquivos, 121 testes, 121 passaram** (117 + 4
novos), 210,9 s.

Testes novos, com a asserção que fecha cada lacuna:

- `src/server/integration/__tests__/integration-alert.integration.test.ts:194`: recusa própria em
  `NOW − 24h` exato entra no e-mail (`:206` `toHaveLength(1)`, `:207` `toContain(".../limite: 1")`);
  a de 1 ms antes não entra (`:209-210`, tenant segue `saudavel`). Fecha a ALERTA-01 AC1 e o edge
  case de agora − 24h, ponta a ponta.
- `integration-alert.integration.test.ts:213`: reivindicação parcial. O tenant levado pela "outra
  execução" não aparece (`:224` `toHaveLength(0)`, `:228` `not.toContain(taken.name)`), e
  `result.sent` = N do assunto (`:227`). Fecha a ALERTA-01 AC7 e a ALERTA-03 AC4.
- `src/server/data/__tests__/integration-health.test.ts:147`: recusas com e sem tenant de mesma
  `(code, rota)` saem numa linha com `count: 3` (`:157` `toEqual([...count: 3])`). Fecha a ALERTA-02
  AC3 emendada.
- `integration-health.test.ts:286`: a liberação não desfaz um `saudavel` gravado no mesmo instante da
  reivindicação (`:295` `changedAt` = `D1`). Fecha o mutante 4b.

**L-055:** `git diff e82abe0..HEAD` segue sem tocar `maintenance.integration.test.ts` e
`routes/cron-expire-documents.test.ts`. Em `email.test.ts` a única linha removida é o import
ampliado. Em `git diff 1ccdada..HEAD` dos dois testes do lote, as únicas linhas removidas são
imports ampliados. Nenhuma asserção pré-existente mudou.

### Sensor

Cópias novas em scratch e baseline novo de SHA-256 e porcelain antes de começar (o DAL mudou em
`b913b8d`). Um mutante por vez, restauração da cópia e conferência do hash após cada um.

| # | Arquivo | Mutação | Resultado |
| --- | --- | --- | --- |
| 4b | `src/server/data/integration-health.ts` (release) | sem a guarda `state = 'problema'` | MORTO: `integration-health.test.ts:295` |
| 5d | `src/server/integration/integration-alert.ts:11` | janela 24h → 23h | MORTO: `integration-alert.integration.test.ts:206` |
| 5e | `integration-alert.ts:37` | `since = now` | MORTO: `integration-alert.integration.test.ts:206` |
| x1 | `integration-alert.ts:65` | e-mail lista todo `plan.alert` | MORTO: `integration-alert.integration.test.ts:224` |
| x2 | `integration-alert.ts:75` | `sent` = `plan.alert.length` | MORTO: `integration-alert.integration.test.ts:227` |
| 9c (novo) | `integration-health.ts` (snapshot) | desfaz a soma: chave inclui `tenantId` | MORTO: `integration-health.test.ts:157` |
| 9d (novo) | `integration-health.ts` (snapshot) | soma vira sobrescrita (`=` no lugar de `+=`) | MORTO: `integration-health.test.ts:157` |
| 9a (redefinido) | `integration-health.ts` (snapshot) | recusas sem tenant fora do laço de soma | MORTO: `integration-health.test.ts:127`, `:157` |
| 1a | `integration-health.ts` (claim) | select sem `state = 'saudavel'` | MORTO (regressão) |
| 1c | `integration-health.ts` (claim) | sem a condição no select e no update | MORTO (regressão) |
| 2 | `integration-health.ts` (claim) | sem `.for("update")` | MORTO (regressão) |
| 3a / 3b | `integration-health.ts` (release) | grava `claimedAt` / `null` | MORTO / MORTO (regressão) |
| 4a | `integration-health.ts` (release) | sem a guarda `changedAt = claimedAt` | MORTO (regressão) |
| 5a / 5b / 5c | `integration-health.ts` (snapshot) | `gt`; `since ± 1 ms` | MORTO ×3 (regressão) |
| 9b | `integration-health.ts` (snapshot) | sem `sender = 'agente'` | MORTO (regressão) |
| 6a / 6b | `src/lib/integration-alert.ts:40` | gravado nulo alerta / inicializa sempre `saudavel` | MORTO / MORTO (regressão) |
| 7 | `src/server/integration/lgpd.ts:282` | grupo fora do `runGroup` | MORTO (regressão) |
| 8a / 8b / 8c | `integration-alert.ts` | claim antes do destinatário / sem release / `ok:false` como enviado | MORTO ×3 (regressão) |
| 12a / 12b / 12c | `app/api/cron/expire-documents/route.ts:49`, `vitest.config.ts:41`, `route.ts:46` | sem ligação / sem `""` no Vitest / destinatário `undefined` | MORTO ×3 (regressão) |

**Resultado:** 27 mutantes rodados nesta iteração, **27 mortos e 0 sobreviventes**: os 5 ex-sobreviventes
não equivalentes, 3 do DAL novo (9a redefinido, 9c, 9d) e 19 de regressão. Os equivalentes 1b, 10c e
11c continuam como estavam no relatório anterior. O 13d (`storedChangedAt` no corpo) continua vivo,
aceito como lacuna de precisão da spec. Somando as duas rodadas, os 6 sobreviventes não equivalentes
da primeira caíram para 1 aceito (13d).

**Integridade do sensor:** `sha256sum -c` do baseline novo deu `OK` para os 7 arquivos, e o `git status
--porcelain` final é idêntico ao baseline (os mesmos 4 arquivos modificados antes da verificação). O
relatório só altera este `validation.md`. Não foram usados `git stash`, `checkout` nem `reset`.

### D2 à luz da emenda

A AD-039 (`.specs/STATE.md:350`) agora diz qual é o modo de perda (processo morre ou estoura o
tempo entre a reivindicação e o envio, ou a liberação lança depois de `ok:false`), por que foi
escolhido (contra o risco de e-mail duplicado) e qual a mitigação (log com `sendFailed` e `failed`;
a tela segue mostrando o problema). A spec também registra isso nas Emendas. O ponto deixa de ser
lacuna e passa a decisão registrada. Resta uma observação sem ação: no caso de o processo morrer
entre a reivindicação e o envio, a rota não escreve log nenhum
(`app/api/cron/expire-documents/route.ts:52`), e a única pista é a tela do Dashboard. A AD-039 aceita
isso.

### Lacunas restantes

Nenhuma alta nem média. Ficam as baixas, aceitas pelo orquestrador sem teste novo:

- `storedChangedAt` pode entrar no corpo sem que um teste falhe (mutante 13d,
  `src/lib/integration-alert.ts:51`); a spec não proíbe o campo.
- O motivo do `sendFailed` não é registrado (`src/server/integration/integration-alert.ts:67-79`,
  `app/api/cron/expire-documents/route.ts:52-58`).
- O rótulo é aparado antes de comparar (`src/db/revoke-service-key.ts:38`, `:48`).
- A ligação do código de saída dos comandos de linha não tem teste (`src/db/revoke-service-key.ts:96-104`,
  `scripts/send-test-integration-alert.ts:48-58`).

Pendências externas (ressalvas do veredito): ALERTA-04 AC6 (T14) e F2.
