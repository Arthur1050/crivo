# Lote 15 — Prontidão operacional do piloto real

**Data:** 2026-10-07 · **Complexidade:** Large · **Status:** Aprovada pelo usuário em 2026-10-07 · **Origem:** `ROADMAP-POS-PILOTO.md` § L15 (itens 1–8), escopo
reduzido pelo usuário em 2026-10-07

## Problem Statement

Quando a integração agente↔CRM cai, a única pista hoje é o bloco de saúde do Dashboard (AD-023,
lote-9): ninguém é avisado. O `crivo-agente-erros` do n8n só manda e-mail quando uma execução falha;
silêncio (n8n parado, webhook que não chega, workflow despublicado) e recusas do contrato passam
despercebidos até alguém abrir a tela. Além disso, a rotação da chave de serviço ainda exige um
`UPDATE` manual no banco para revogar a chave antiga (`n8n/README.md` §12.3), e o roadmap carrega
itens do L15 já resolvidos ou que não são executáveis sem cliente real.

## Goals

- [ ] O operador da plataforma recebe um e-mail no máximo uma vez por queda, quando uma imobiliária passa de saudável para problema na regra do Dashboard.
- [ ] Revogar uma chave de serviço por rótulo é um comando que recusa deixar o agente sem chave ativa.
- [ ] O alerta está em produção (schema, variável, deploy) com cada ação externa autorizada e registrada.
- [ ] O roadmap e o índice refletem o que o L15 fechou, deferiu e moveu.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Publicação do app Meta / business verification (item 1) | Usuário (2026-10-07): sai do L15 e vai para o L14c, junto da conta WhatsApp de produção que ainda não existe |
| Baselines reais (item 3) | Usuário (2026-10-07): não há imobiliária real; deferido com gatilho "primeira imobiliária real com números de antes do produto" |
| Alerta para administradores/gestores da imobiliária | Usuário (2026-10-07): só o operador recebe |
| E-mail de recuperação (problema → saudável) | Usuário (2026-10-07): só o alerta de queda |
| Alerta por WhatsApp | Usuário (2026-10-07): canal é e-mail via Resend; WhatsApp para o operador exigiria template e número real |
| Recusa imediata (alerta no instante da recusa) e heartbeat pelo scheduler n8n | Usuário (2026-10-07): cron diário na transição; heartbeat exigiria republicar o scheduler e não detecta o n8n caído |
| Cron mais frequente que diário | Plano Hobby da Vercel aceita só cron diário, precisão ±59 min (docs Vercel, Usage & Pricing for Cron Jobs) |
| Mudar a regra de saúde (24h, recusas, silêncio) | Fonte única é `resolveIntegrationHealth` (AD-023); o alerta lê a mesma regra |
| Rodar a revogação em produção | Nenhuma rotação está pendente; o lote entrega o comando, não o usa |
| L4 Fix 1 (extração dos deltas) | Já entregue em `f7e512f` (`formatResponseTimeDelta`/`formatQualificationDelta` com teste em `src/lib/__tests__/format.test.ts`); só a documentação é corrigida |
| Comentário de `n8n/src/system-message.mjs:106-112` | Nenhuma mudança neste lote toca esse arquivo; corrigir exigiria republicar o system message (L-048) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Mecanismo | Novo grupo na manutenção diária existente (`/api/cron/expire-documents`, 03:00 UTC), sem cron novo | Usuário escolheu cron diário; reaproveita autenticação `CRON_SECRET` e o isolamento por grupo de `runDailyMaintenance` | Sim (usuário) |
| Regra de "problema" | Exatamente a do Dashboard: `resolveIntegrationHealth` com `getLastAgentMessageAt(tenant)` e recusas das últimas 24h do tenant **mais** as sem tenant (`getIntegrationRefusalsSince`) | Uma regra só; o alerta nunca diverge da tela | Sim (usuário: "a mesma regra do Dashboard") |
| O que é "queda" | Transição de `saudavel` para `problema` em relação ao último estado gravado do tenant | Usuário escolheu "na transição"; evita e-mail diário enquanto o problema persiste | Sim (usuário) |
| Primeira avaliação de um tenant (sem estado gravado) | Grava o estado observado e não envia e-mail | Tenants fictícios sem tráfego nascem em `problema`; alertar na primeira passada seria ruído no deploy | Sim, default do agente; usuário aprova junto da spec |
| Destinatário | Um único endereço na variável `CRIVO_OPERATOR_ALERT_EMAIL` (servidor, nunca no repositório) | Usuário: só o operador; endereço pessoal fora do código | Sim (usuário) |
| Destinatário ausente | Não envia e não grava a transição para `problema` (o tenant continua `saudavel` no estado gravado), para o alerta sair quando a variável existir | L-030: limite ou configuração ausente não pode virar falha aberta silenciosa | Sim, default do agente |
| Vários tenants em queda na mesma execução | Um e-mail só, listando cada imobiliária | Destinatário único; um e-mail por tenant seria ruído com recusa sem tenant (afeta todos) | Sim, default do agente |
| Execuções concorrentes (cron + chamada manual) | A transição é reivindicada por compare-and-set antes do envio; quem não reivindica não envia | Evita e-mail duplicado; detalhe no design | Sim, default do agente |
| Remetente | `RESEND_FROM` já usado pelo convite (`src/server/auth/email.ts`) | Um adaptador de e-mail só; conferir o valor em produção é o item 4 do roadmap | Sim |
| Ruído esperado no piloto | Tenant que recebeu smoke e ficou 24h sem mensagem do agente gera alerta de silêncio | Consequência aceita da regra da AD-023; o e-mail diz qual sinal disparou | Sim, default do agente |
| Revogação | Comando de linha `npm run db:revoke-service-key -- "<rótulo>"`, no padrão de `db:mint-service-key` | Rotação é ato de operador na linha de comando; não há tela de chaves de serviço | Sim, default do agente |
| Linhas inertes de `conversa_estado` | O usuário apaga pela interface do n8n as 2 linhas (`test-tenant-lote6c`, `test-tenant-lote6c-turnlimit`); o lote registra a confirmação | O MCP do n8n não tem ferramenta de remover linha de Data Table; é dado, não workflow | Sim, default do agente |
| L4 Fix 2 | Fechado como aceito sem artefato | Já decidido no roadmap (item 8) | Sim |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Alerta de queda da integração ⭐ MVP

**User Story**: Como operador da plataforma, quero receber um e-mail quando a integração de uma
imobiliária passar a ter problema, para agir antes que leads fiquem sem resposta.

**Why P1**: É o item do L15 que muda o risco operacional do piloto; o resto é limpeza.

**Acceptance Criteria** (ALERTA-01 — avaliação e transição):

1. WHEN a manutenção diária roda THEN o sistema SHALL avaliar cada tenant com `resolveIntegrationHealth`, usando o último instante de mensagem do agente do tenant e a contagem de recusas do tenant e sem tenant com `occurredAt` ≥ agora − 24h.
2. WHEN o estado avaliado de um tenant é `problema` e o estado gravado é `saudavel` THEN o sistema SHALL incluir esse tenant no alerta da execução.
3. WHEN o estado gravado de um tenant está ausente THEN o sistema SHALL gravar o estado avaliado e o instante da avaliação e SHALL NOT incluir o tenant no alerta.
4. WHEN o estado avaliado é `saudavel` e o gravado é `problema` THEN o sistema SHALL gravar `saudavel` e SHALL NOT enviar e-mail.
5. WHEN o estado avaliado é igual ao gravado THEN o sistema SHALL manter o estado e o instante de mudança gravados sem alteração e SHALL NOT incluir o tenant no alerta.
6. WHILE um tenant permanece `problema` em execuções seguidas o sistema SHALL enviar no máximo um e-mail para essa queda.
7. WHEN duas execuções da manutenção avaliam a mesma transição ao mesmo tempo THEN o sistema SHALL enviar no máximo um e-mail para ela.

**Acceptance Criteria** (ALERTA-02 — e-mail):

1. WHEN a execução tem ao menos um tenant no alerta THEN o sistema SHALL enviar exatamente um e-mail para o endereço de `CRIVO_OPERATOR_ALERT_EMAIL`, com remetente `RESEND_FROM` (ou o padrão do adaptador quando ausente).
2. The sistema SHALL usar o assunto `[crivo] Integração com problema em N imobiliária(s)`, com N igual ao número de tenants no alerta.
3. The sistema SHALL listar no corpo, para cada tenant no alerta: nome, slug, a contagem de recusas nas 24h por `(code, rota)`, e o último instante de mensagem do agente em ISO 8601 UTC ou a palavra `nunca`.
4. The sistema SHALL NOT incluir no e-mail conteúdo de mensagem, telefone, nome de lead nem valor de chave ou segredo.

**Acceptance Criteria** (ALERTA-03 — falhas):

1. IF `CRIVO_OPERATOR_ALERT_EMAIL` está ausente ou vazio THEN o sistema SHALL NOT enviar e-mail, SHALL manter `saudavel` como estado gravado dos tenants que entrariam no alerta e SHALL reportar `integrationAlertSkipped: "destinatario-ausente"` no resultado da manutenção.
2. IF o adaptador de e-mail devolve `ok: false` THEN o sistema SHALL restaurar `saudavel` como estado gravado dos tenants do alerta e SHALL reportar `integrationAlertSendFailed: true`, para a próxima execução tentar de novo.
3. IF a avaliação do alerta lança erro THEN o sistema SHALL reportar `integrationAlertFailed: true` e SHALL executar os demais grupos da manutenção com o mesmo resultado que teriam sem o alerta.
4. The sistema SHALL reportar no resultado da manutenção `integrationAlertEvaluated` (tenants avaliados) e `integrationAlertSent` (tenants incluídos num e-mail enviado com `ok: true`).

**Independent Test**: com fixture de um tenant gravado `saudavel`, sem mensagem do agente há 25h,
rodar `runDailyMaintenance` com adaptador de e-mail falso: um e-mail ao operador, estado gravado
`problema`; rodar de novo: nenhum e-mail.

---

### P1: Alerta em produção

**User Story**: Como operador, quero o alerta funcionando em produção, com cada ação externa
autorizada por mim e registrada.

**Why P1**: Código sem deploy não avisa ninguém.

**Acceptance Criteria** (ALERTA-04 — ativação):

1. WHEN o gate de viabilidade roda THEN o executor SHALL registrar, com fonte, se o cron de manutenção executou em produção nos últimos 3 dias, se o domínio de `RESEND_FROM` está verificado no Resend e se `RESEND_FROM` existe no ambiente Production da Vercel.
2. IF algum fato do gate não se confirma THEN o executor SHALL parar antes das tasks de produção e reportar ao usuário.
3. WHEN o comando de envio de teste roda com autorização do usuário THEN o sistema SHALL enviar ao operador um e-mail com o mesmo formato do alerta e o assunto prefixado por `[teste]`, e o executor SHALL registrar a confirmação de recebimento dada pelo usuário.
4. The executor SHALL aplicar o schema em produção antes do deploy do código que o lê, cada um com autorização explícita do usuário no momento e registro do resultado.
5. WHEN o push que faz o deploy é autorizado THEN o executor SHALL já ter registrado a confirmação do usuário de que `CRIVO_OPERATOR_ALERT_EMAIL` existe no ambiente Production da Vercel.
6. WHEN a primeira manutenção de produção após o deploy roda THEN o executor SHALL registrar, com autorização para ler os logs, `integrationAlertFailed: false` e `integrationAlertEvaluated` igual ao número de tenants.

**Independent Test**: e-mail `[teste]` recebido pelo operador; resultado da primeira manutenção de
produção registrado no `validation.md`.

---

### P2: Revogação de chave de serviço por rótulo

**User Story**: Como operador rotacionando a chave do agente, quero revogar a chave antiga por um
comando que não me deixe derrubar o agente.

**Why P2**: Fecha o passo 4 de `n8n/README.md` §12.3, hoje um `UPDATE` manual.

**Acceptance Criteria** (REVOGA-01):

1. WHEN `npm run db:revoke-service-key -- "<rótulo>"` roda e existe ao menos uma chave ativa com rótulo exatamente igual e ao menos uma chave ativa com outro rótulo THEN o sistema SHALL gravar `revoked_at` = agora em todas as chaves ativas com aquele rótulo e SHALL imprimir a quantidade revogada.
2. IF nenhuma chave ativa tem o rótulo THEN o sistema SHALL sair com código 1 sem alterar nenhuma linha.
3. IF revogar deixaria zero chaves de serviço ativas THEN o sistema SHALL sair com código 1 sem alterar nenhuma linha e SHALL citar `n8n/README.md` §12.3 na mensagem.
4. The sistema SHALL NOT alterar `revoked_at` de chave já revogada.
5. IF o rótulo não é informado ou é vazio após `trim` THEN o sistema SHALL sair com código 1 e imprimir o uso.
6. The sistema SHALL NOT imprimir `key_hash` nem valor de chave.

**Independent Test**: em banco de teste com chaves "A" (2 ativas), "B" (1 ativa) e "A" (1 revogada
em data fixa): revogar "A" revoga 2, preserva a data da revogada; revogar "B" em seguida sai com 1.

---

### P3: Limpeza e roadmap

**User Story**: Como mantenedor, quero o backlog do L15 fechado sem itens fantasmas.

**Why P3**: Documentação e uma limpeza de dado inerte, sem efeito no produto.

**Acceptance Criteria** (LIMPA-01):

1. WHEN o usuário confirma ter apagado as 2 linhas inertes de `conversa_estado` THEN o executor SHALL registrar a confirmação e a data no `validation.md`.
2. IF o usuário não fizer a remoção até o fechamento THEN o executor SHALL registrar o item como pendente no Handoff, sem bloquear o fechamento.

**Acceptance Criteria** (DOC-01):

1. The `ROADMAP-POS-PILOTO.md` SHALL marcar o L15 como executado com o que entregou, o item 1 movido ao L14c, o item 3 deferido com o gatilho, o item 7 entregue em `f7e512f` e o item 8 aceito sem artefato.
2. The `n8n/README.md` §12.3 SHALL citar `npm run db:mint-service-key` no passo 1 e `npm run db:revoke-service-key` no passo 4, sem o `UPDATE` manual.
3. The `STATE.md` SHALL registrar a decisão do alerta como AD nova, sem contradizer a AD-023.
4. The `features/INDEX.md` SHALL ganhar a linha do lote 15.

---

## Edge Cases

- WHEN um tenant tem recusas e mensagem do agente recente ao mesmo tempo THEN o sistema SHALL tratá-lo como `problema` (regra da AD-023: recusa decide sozinha).
- WHEN a única recusa das 24h não tem tenant THEN o sistema SHALL contá-la para todos os tenants e o e-mail único SHALL listar cada tenant que transitou.
- WHEN o último instante de mensagem do agente está exatamente a 24h de agora THEN o sistema SHALL tratá-lo como `saudavel` (limite estrito `>` de `resolveIntegrationHealth`, L-023).
- WHEN uma recusa ocorreu exatamente em agora − 24h THEN o sistema SHALL contá-la (`occurredAt ≥ since`, L-023).
- WHEN não existe nenhum tenant THEN o sistema SHALL reportar `integrationAlertEvaluated: 0` sem enviar e-mail.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| ALERTA-01 | P1: Alerta de queda | Tasks | Verified |
| ALERTA-02 | P1: Alerta de queda | Tasks | Verified |
| ALERTA-03 | P1: Alerta de queda | Tasks | Verified |
| ALERTA-04 | P1: Alerta em produção | Tasks | Parcial: AC6 pendente (T14) |
| REVOGA-01 | P2: Revogação | Tasks | Verified |
| LIMPA-01 | P3: Limpeza e roadmap | Tasks | Verified |
| DOC-01 | P3: Limpeza e roadmap | Tasks | Verified |

**Coverage:** 7 total, 7 mapeados para tasks, 0 sem task.

---

## Success Criteria

- [ ] Uma queda simulada em teste gera exatamente um e-mail e a segunda execução não gera nenhum.
- [ ] E-mail `[teste]` recebido pelo operador, com remetente no domínio verificado do `RESEND_FROM` de produção.
- [ ] Primeira manutenção de produção após o deploy roda o grupo do alerta sem falha.
- [ ] `db:revoke-service-key` recusa deixar zero chaves ativas.

---

## Emendas (2026-10-07, execução e Verifier)

- **ALERTA-02 AC3:** as recusas com tenant e as sem tenant de mesma `(code, rota)` somam numa linha
  só, como no Dashboard (`getIntegrationRefusalsSince`). Implementado e testado em F1.
- **ALERTA-04 AC2:** a Phase 3 seguiu com a F2 (cron executou em produção) não comprovada, por decisão
  do usuário em 2026-10-07 ("Considere validado a leitura de mais tarde até que ela realmente ocorre").
  A F2 permanece registrada como parcial em `validation.md` até a leitura real dos logs.
- **LIMPA-01 AC1:** a remoção das 2 linhas foi feita pelo executor, pela extensão do Chrome e com
  autorização expressa do usuário (o MCP do n8n não remove linha), e não pelo usuário. Confirmação
  registrada em `validation.md`.
- **ALERTA-01 AC7 / AD-039:** o modo de perda do at-most-once (queda presa em `problema` sem e-mail
  quando o processo cai entre a reivindicação e o envio) é trade-off aceito e está na AD-039.
