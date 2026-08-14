# n8n/ — Agente de Qualificação (Fase 8 / Lote 6)

Runbook de setup + referência da camada n8n do Crivo. Cobre **todos os passos humanos** necessários antes/durante o Execute deste lote e os riscos R1–R3/R6 do design (`.specs/features/lote-6-agente-n8n-whatsapp/design.md`).

> **Regra de ouro (AD-014)**: a UI do n8n **nunca** é editada à mão — nem os workflows (`n8n/workflows/*.ts` → `n8n/generated/*.ts` → publicado via MCP), nem as Data Tables (criadas via MCP `create_data_table`/`add_data_table_column`). O único trabalho manual na instância n8n é **credenciais** (Google/Meta exigem OAuth/tokens que só o dono da conta pode gerar) e **templates de mensagem** no painel da Meta (aprovação é um processo da Meta, não do n8n).

---

## 1. Arquitetura deste diretório

```
n8n/
├── src/            # Camada de decisão pura (T5-T8) — testada por vitest, zero I/O
│   ├── normalize-event.mjs   business-hours.mjs   gate.mjs
│   ├── prompt.mjs             validate-llm.mjs
│   └── __tests__/*.test.ts
├── fixtures/       # Payloads reais (Meta, saída LLM) usados pelos testes E pelas execuções de teste via MCP
├── workflows/      # FONTE dos workflows SDK — o que se edita (marcadores __INLINE(...)__)
├── generated/      # SAÍDA do inliner — o que é publicado na instância (nunca editar à mão)
└── README.md       # este arquivo
```

**Pipeline de publicação**: editar `n8n/workflows/*.ts` → `node scripts/n8n-inline.mjs` (gera `n8n/generated/*.ts`, determinístico — ver docstring do script e `scripts/__tests__/n8n-inline.test.ts`) → publicar o conteúdo de `n8n/generated/<arquivo>.ts` na instância via MCP (`create_workflow_from_code` na primeira vez, `update_workflow`/republicação nas seguintes) → `get_workflow_details` para conferir que o publicado == `generated/`.

**Convenção do marcador** `__INLINE(<arquivo>.mjs)__`: dentro do `jsCode` de um nó Code, escrito como string literal concatenada (`'__INLINE(gate.mjs)__' + '\n' + '<harness>'`) — nunca dentro de um template literal (backtick), porque alguns módulos de `n8n/src/` (ex.: `prompt.mjs`, `business-hours.mjs`) usam backtick internamente e isso quebraria a sintaxe se colado cru dentro de outro backtick. O inliner substitui o marcador por `JSON.stringify(<módulo sem export/import>)` — seguro para qualquer conteúdo. Quando um Code node precisa de mais de um módulo (ex.: `validate-llm.mjs` depende de `business-hours.mjs`), os marcadores do(s) módulo(s) dependido(s) vêm **primeiro** no mesmo `jsCode`, nessa ordem — a resolução de dependência é textual/posicional, não automática.

---

## 2. Credenciais humanas (nenhuma pode ser criada por automação — dependem da conta Meta/Google do usuário)

Estado confirmado nesta sessão (`list_credentials` via MCP, T9): a instância já tem `Google Gemini(PaLM) Api account` (googlePalmApi) e `Gmail account` (gmailOAuth2) — reusadas sem mudança. **Faltam as 3 abaixo** — sem elas, os workflows publicados ficam estruturalmente corretos mas não conseguem executar em produção (a saber: os nós ficam com credencial "pendente", resolvida por nome via `newCredential(...)` no código gerado).

### 2.1 WhatsApp Trigger (App ID + App Secret) — credencial `whatsAppTriggerApi`

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → abrir o app Meta já criado (modo dev) → **Configurações do app → Básico**.
2. Copiar **ID do aplicativo** e **Chave secreta do aplicativo** (botão "Mostrar").
3. No n8n: criar credencial do tipo **WhatsApp Trigger API**, colar os dois valores.
4. **Não existe "verify token" para preencher manualmente no app da Meta.** O nó `whatsAppTrigger` registra e verifica a assinatura do webhook sozinho na ativação, usando o próprio id do nó. Se o painel da Meta pedir uma "Verify Token" ao configurar a URL de callback, o valor é o id do nó (visível no n8n ao configurar o webhook) — nunca inventar uma string.
5. Isso só fecha o laço em **T12** (fora do escopo deste worker): ativar `crivo-agente-principal` publicado é o que dispara o registro do webhook na Meta.

### 2.2 WhatsApp send (access token + phone number id) — credencial `whatsAppApi`

**Risco R2 — o mais importante desta seção**: a tela "Configuração da API" do app Meta mostra um **token de acesso temporário (23h)**. Usar esse token na credencial de envio do n8n faz o agente parar de responder em menos de um dia, silenciosamente (a falha só aparece quando `crivo-agente-erros` dispara o e-mail de erro na próxima tentativa de envio). **Nunca usar esse token.**

Passo a passo do token **permanente de System User**:

1. [business.facebook.com/settings](https://business.facebook.com/settings) → **Usuários → Usuários do sistema**.
2. Criar (ou reusar) um usuário do sistema com papel **Admin**.
3. **Adicionar ativos** → selecionar o app do WhatsApp do Crivo → conceder controle total.
4. **Gerar novo token** → selecionar o app → marcar os escopos `whatsapp_business_messaging` e `whatsapp_business_management` → **sem prazo de expiração** (a opção existe só para tokens de System User; é o que resolve R2).
5. Copiar o token gerado (só aparece uma vez, igual às API keys do CRM — guardar num cofre, nunca em texto versionado).
6. **Phone number ID**: no app Meta → **WhatsApp → Configuração da API** → "ID do número de telefone" do número de teste (mesmo valor que já está na fixture `n8n/fixtures/meta-message-text.json` → `metadata.phone_number_id`, hoje um valor de exemplo — confirmar contra o real na Execute).
7. No n8n: credencial do tipo **WhatsApp API**, colar o token permanente + phone number id.

### 2.3 Google Calendar — credencial `googleCalendarOAuth2Api`

Fase 8 usa **uma conta Google só** (do usuário) para os 2 tenants de teste (context.md — decisão registrada; credencial por tenant é productização de piloto real).

1. [console.cloud.google.com](https://console.cloud.google.com) → projeto (novo ou existente) → **APIs e serviços → Biblioteca** → ativar **Google Calendar API**.
2. **Tela de consentimento OAuth** → tipo Externo (ou Interno se Workspace) → preencher o mínimo (nome do app, e-mail) → escopo `https://www.googleapis.com/auth/calendar`.
3. **Credenciais → Criar credenciais → ID do cliente OAuth** → tipo "App para computador" (o n8n faz o handshake).
4. No n8n: credencial do tipo **Google Calendar OAuth2 API**, colar Client ID + Client Secret → **Sign in with Google** → autorizar com a conta que vai hospedar os 2 calendários de teste.
5. Anotar o **Calendar ID** de cada calendário de teste (Configurações do Google Calendar → "Integrar agenda" → "ID da agenda"; para o calendário principal da conta, geralmente é o próprio e-mail) — vai na coluna `calendarId` da Data Table `tenant_config` (seção 3).

### 2.4 Postgres local para a memória conversacional — credencial `postgres` "Postgres n8n local" (lote-6c, MEM-01)

O nó `@n8n/n8n-nodes-langchain.memoryPostgresChat` (T10) precisa de uma credencial Postgres. A escolha (context.md/design.md — decisão do usuário 2026-08-14) é **o próprio banco da instância n8n**, por conexão **local** (mesmo servidor) — nunca o banco do CRM (violaria o desacoplamento de INT-08) e nunca um banco novo externo.

**Por que local**: a memória é lida e escrita a **cada turno** de conversa — é o caminho mais quente do fluxo. Conexão local elimina o salto de rede que uma memória hospedada em outro serviço teria em toda leitura/escrita. O desacoplamento de INT-08 continua intacto: o que ele proíbe é o n8n ter credencial do banco do **CRM**; ter um banco próprio (o mesmo Postgres que já hospeda as tabelas operacionais da própria instância n8n) não viola nada.

**Como foi criada**: campos da credencial em modo Expression, apontando para as mesmas variáveis de ambiente `DB_POSTGRESDB_*` que a própria instância n8n já usa para se conectar ao seu banco — não é uma senha nova, é a mesma conexão que o n8n já mantém consigo mesmo, referenciada por expressão. **Cuidado operacional conhecido**: expressões com `$env` em campos de credencial exigem `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` na instância — o flag bloqueia acesso a env var na *resolução da credencial*, não só dentro de Code nodes. Há um bug aberto do n8n sobre esse flag às vezes não pegar mesmo após restart ([n8n-io/n8n#29603](https://github.com/n8n-io/n8n/issues/29603)); nesta instância, setar o flag e reiniciar resolveu de primeira, mas se uma credencial Postgres nova falhar com `access to env vars denied [Error resolving credentials]`, esse é o suspeito número um.

**Confirmação real (2026-08-14, não só presença em `list_credentials`)**: workflow temporário (`ManualTrigger` → `Postgres` `executeQuery`, `SELECT 1 as ok, current_database() as db, now() as ts`, credencial resolvida por nome via `newCredential('Postgres n8n local')`) rodado via `execute_workflow` — execução `396` no workflow `6cIBuPLpAMDTOVoo`, `status: "success"`, saída `{"ok":1,"db":"n8n","ts":"2026-08-14T15:16:41.365Z"}`. `db: "n8n"` confirma que a credencial aponta para o banco da própria instância, não para o do CRM. Workflow temporário arquivado (`archive_workflow`) logo depois — nada ficou pendurado na instância. Credencial: nome **"Postgres n8n local"**, tipo `postgres`, id `yyiKyt0KY8Q7TwND`, visível em `list_credentials`.

**LGPD (MEM-04) e retenção**: a purga de sessão/opt-out (`Memory Manager` mode `delete`, T10) alcança a tabela `n8n_chat_histories` **deste mesmo banco** — é onde o nó `memoryPostgresChat` grava, sem tabela paralela. Nota operacional de retenção: a memória conversacional **divide o Postgres com as tabelas operacionais do próprio n8n** (execuções, credenciais, workflows) — não é um banco isolado. O corte de sessão de 12h (`session.mjs`) já limita o crescimento por conversa; não há política de retenção adicional além disso neste lote. Um restore de backup do n8n restaura as conversas junto — comportamento aceito, não mitigado (design.md — Risks & Concerns).

---

## 3. Data Tables e schemas (criadas via MCP, nunca pela UI)

Todas as 3 são criadas com `create_data_table` (colunas com `add_data_table_column` quando necessário) e populadas com `add_data_table_rows` — nunca pelo botão "+ Data Table" da UI (mesma regra da seção anterior). Tipos abaixo usam os 4 tipos suportados pela ferramenta MCP: `string | number | boolean | date`.

### `tenant_config` — mapeamento `phoneNumberId` → tenant

| coluna | tipo | nota |
| ------ | ---- | ---- |
| `phoneNumberId` | string | chave de lookup (evento Meta, `metadata.phone_number_id`) |
| `tenantSlug` | string | identificação humana do tenant |
| `apiKey` | string | API key do CRM para esse tenant — ver **Risco R1** e seção 4 |
| `calendarId` | string | id do Google Calendar (seção 2.3) |

Fase 8: 2 linhas para os 2 tenants reais do seed de produção + 1 linha extra com um `phoneNumberId` fictício (apontando para qualquer um dos 2 tenants reais) só para o teste de isolamento via fixture do T10 — nunca um `phoneNumberId` de produção de verdade.

**Risco R1 (aceito para o piloto, documentado)**: `apiKey` fica em texto claro na Data Table — não há tipo "secret" nas Data Tables do n8n. Aceitável com 2 consumidores conhecidos e chaves revogáveis (`revoked_at` na tabela `tenant_api_keys` do CRM). Antes de números reais de imobiliária: migrar para credencial HTTP Header Auth por tenant (1 credencial n8n por tenant, referenciada por nome nos HTTP Request nodes) ou para os secrets nativos do n8n, se disponíveis no plano.

### `conversa_estado` — estado leve da conversa (chave composta `tenantSlug`+`waId`)

| coluna | tipo | nota |
| ------ | ---- | ---- |
| `tenantSlug` | string | metade da chave composta |
| `waId` | string | outra metade — `wa_id` do contato Meta |
| `leadId` | string | id do lead no CRM (cache; fonte de verdade é o CRM) |
| `bufferJson` | string | buffer de debounce, JSON de `[{messageId,text,sentAt}]` |
| `camposJson` | string | cache dos campos de qualificação já coletados |
| `fase` | string | `qualificando` \| `agendando` \| `encerrada` |
| `lastInboundAt` | date | última mensagem recebida — base da janela de 24h e do reengajamento |
| `reengaged` | boolean | true após o único reengajamento (AGT-05 AC2) |
| `perguntadosJson` | string | **NOVO (lote-6c)** — JSON array dos campos obrigatórios já perguntados (`phase.mjs` — `REQUIRED_FIELDS`); "perguntado" é permanente, não depende do lead ter respondido (QLF-02) |
| `aberturasJson` | string | **NOVO (lote-6c)** — JSON array das aberturas de turno já usadas pelo agente nesta sessão (`voice.mjs` — `checkOpening`), para barrar repetição (VOZ-01 AC2) |

Perder esta tabela **não é perda de dado**: o cold start reconstrói `leadId`/campos a partir da resposta idempotente de `POST /leads` (spec.md — edge case). Não over-engineering de durabilidade aqui, de propósito.

**Purga atômica (lote-6c, design.md — Risks & Concerns)**: quando a sessão expira (gap > 12h, `isSessionExpired` em `session.mjs`) ou o lead faz opt-out, a purga precisa limpar `perguntadosJson` e `aberturasJson` **no mesmo passo** em que a memória (`n8n_chat_histories`, seção 2.4) é apagada — nunca só uma das duas. Purgar a memória sem limpar essas colunas faria uma sessão nova herdar "já perguntei tudo" e pular direto para `agendando` com um lead frio; limpar as colunas sem purgar a memória deixaria o agente reperguntar o que a memória ainda lembra. As duas colunas novas são criadas via `add_data_table_column` (MCP), confirmadas via `search_data_tables` — nunca pela UI (regra de ouro do topo deste README).

### `agenda_envios` — fila de lembretes de reunião

| coluna | tipo | nota |
| ------ | ---- | ---- |
| `leadId` | string | id do lead no CRM |
| `tenantSlug` | string | tenant dono do lead |
| `waId` | string | destino do lembrete |
| `meetingAt` | date | horário da reunião confirmada |
| `meetLink` | string | link do Google Meet do evento criado |
| `sentAt` | date | `null` até o scheduler enviar o lembrete; marca o envio |

---

## 4. `tenant_config` com chaves do seed de produção — ordem seed ↔ rotação (Risco R6)

**O problema**: `npm run db:seed` gera **novas** API keys por tenant toda vez que roda (imprime o valor em claro **uma única vez**, no próprio stdout do comando — nunca grava em arquivo, só o hash sha256 fica no banco). Rodar o seed de novo depois que a `tenant_config` já foi populada **invalida** as chaves que estavam lá, sem aviso — o próximo `POST /leads` do agente responde `401` para os dois tenants.

**Ordem obrigatória, uma única vez por ambiente**:

1. Confirmar que ninguém mais vai reseedar o banco de produção nesta janela de trabalho (checar `.specs/STATE.md` / avisar no chat da orquestração se for um lote coordenado).
2. Rodar `npm run db:seed` **uma vez**.
3. Copiar as duas chaves impressas no stdout do próprio comando, imediatamente — não existe outra forma de recuperá-las depois.
4. Chamar `add_data_table_rows` na `tenant_config` com essas chaves, na mesma sessão — nunca escrever a chave em arquivo, log, commit ou relatório.
5. Registrar (fora do código versionado — ex.: no handoff da sessão) **quando** o seed rodou, para que outra sessão/worker saiba que não precisa (e não deve) reseedar de novo só para popular a mesma tabela.

Se o ambiente for reseedado por qualquer outro motivo depois deste passo, a `tenant_config` precisa ser re-sincronizada (repetir 2-4) — é seguro fazer de novo, só desperdiça um ciclo se evitável.

**Ocorrido de fato no T11** (não hipotético, causa raiz confirmada — não é mais mistério): a `apiKey` gravada no T10 parou de autenticar (`401 nao-autenticado`, "Chave de API inválida ou revogada") entre a execução 56 (T10, ~18:28) e a primeira execução do scheduler (T11, ~18:47). Causa raiz: `src/db/__tests__/seed.test.ts` chama `runSeed()` no próprio `beforeAll` (mais 2 chamadas extras em testes de idempotência) — e o próprio comentário do arquivo confirma que a API key é **não determinística de propósito**, regenerada a cada execução. Ou seja: **qualquer `npx vitest run`, de qualquer sessão, em qualquer lugar, reseeda o banco e rotaciona as duas chaves como efeito colateral** — não precisa ser `npm run db:seed` direto; o próprio gate de testes já faz isso. Este worker não rodou nem `db:seed` nem `vitest run` no intervalo exato 18:28-18:47 — outra sessão da mesma orquestração rodou `vitest run` nesse intervalo (mandato de "uma vez só por lote" vale para `db:seed` direto; o suite de testes reseedar como efeito colateral é comportamento pré-existente do repositório, fora do controle de qualquer worker individual). A mesma causa também produz falhas *intra-run* — ex.: `src/server/integration/__tests__/e2e-smoke.test.ts` (que bate na API real) pode ver 401/404 quando corre em paralelo com `seed.test.ts` dentro do **mesmo** `npx vitest run`, se o vitest paraleliza arquivos de teste (não investigado a fundo aqui — fora do escopo deste worker; watchpoint para quem mexer em `vitest.config.ts`). **Ordem segura, já usada neste lote**: terminar todo código+gate primeiro, rodar `npx vitest run` pela última vez, e só then fazer UM `npm run db:seed` final + captura de chaves + `add_data_table_rows` + toda a evidência MCP ao vivo restante, sem nenhum `vitest run` depois disso (ver seção 4, passos 1-5). **Próximo passo para quem pegar T12/T13**: confirmar se a `tenant_config` ainda tem a `apiKey` válida antes de assumir que o round-trip com o CRM funciona (qualquer `vitest run` rodado por qualquer pessoa desde a última sincronização já invalida); se não, repetir só os passos 3-4 (nunca o 2) usando as chaves atuais do ambiente.

---

## 5. Templates Meta (envio proativo fora da janela de 24h)

Toda mensagem proativa do produto (lembrete de reunião, reengajamento) acontece, por definição, **fora** da janela de resposta gratuita de 24h da Cloud API — a Meta exige uma **template message** pré-aprovada nesse caso (texto livre é rejeitado). Criar em **WhatsApp Manager → Gerenciador de modelos de mensagem** no painel da Meta, categoria **Utilitário** (não Marketing — evita revisão mais lenta e custo maior):

### `lembrete_reuniao`

- **Categoria**: Utility.
- **Corpo** (pt-BR), 2 variáveis:
  > Olá! Passando para confirmar sua reunião hoje às {{1}}. Link do Google Meet: {{2}}
- **Variáveis**: `{{1}}` = horário formatado (`HH:MM`, `America/Sao_Paulo`), `{{2}}` = `meetLink` do evento (Data Table `agenda_envios`).

### `reengajamento`

- **Categoria**: Utility.
- **Corpo** (pt-BR), 1 variável:
  > Oi! Aqui é {{1}}, da imobiliária. Ainda tem interesse em continuar nossa conversa sobre o imóvel? É só responder por aqui.
- **Variável**: `{{1}}` = `agentName` do tenant (`GET /api/v1/settings`).

**Aprovação é da Meta, não do n8n** — normalmente minutos a poucas horas para categoria Utility com conteúdo direto. Sem aprovação, o scheduler tenta enviar e a chamada `sendTemplate` falha — cai no tratamento de erro do design (marca tentativa, `crivo-agente-erros` notifica, nunca bloqueia o fluxo principal). Confirmar o status de aprovação das 2 templates é passo humano fora do alcance de qualquer ferramenta MCP disponível aqui — reportado como pendência, não assumido como feito.

**Atualização pós-submissão (relatada pelo usuário, Worker 3)**: a Meta aprovou `reengajamento` na categoria **Marketing**, não Utility como planejado acima — decisão da própria revisão da Meta, não uma escolha de ninguém do time. `lembrete_reuniao` presumivelmente permaneceu Utility (não confirmado por nenhuma ferramenta MCP disponível — status de categoria de template vive só no painel da Meta; conferir lá). Implicação é **só de custo**: a Meta cobra conversas de categoria Marketing mais caro que Utility — nenhuma mudança de código ou parâmetro do `sendTemplate` é necessária, porque a categoria é uma propriedade do template já aprovado, não um parâmetro que o fluxo escolhe por chamada. LGPD-03 AC2 (nunca enviar a lead com `optedOutAt` preenchido) já é reforçado independente da categoria/texto do template, então não há gap de compliance aqui — só o custo por conversa de reengajamento fica mais alto do que o orçado.

---

## 6. Cadência do scheduler (Risco R3 — quota de execuções)

`crivo-agente-scheduler` roda como **1 workflow único** com 3 varreduras sequenciais (lembretes, reengajamento, escalonamento por silêncio) exatamente para minimizar o número de execuções contra a quota do plano n8n — 3 workflows separados triplicariam o consumo só de scheduling.

**Matemática do risco**, a 15 min:

```
24h / 15min = 96 execuções/dia
96 × 30 dias ≈ 2.880 execuções/mês  (design.md arredonda para "~2,9k")
```

Isso é **só** o scheduler — soma com toda execução do `crivo-agente-principal` (1 por rajada de mensagem, após debounce) no mesmo plano.

**Antes de publicar em T11**: checar o plano/quota atual da instância (página de uso/billing do n8n Cloud — fora do alcance dos tools MCP disponíveis aqui, é passo humano/painel). Se a quota apertar:

- **30 min** ainda satisfaz "~1h antes" do lembrete (a varredura de lembretes olha `meetingAt ≤ now + 60min`; rodando a cada 30 min, o pior caso é o lembrete sair ~30min mais tarde que o alvo de 1h, ainda dentro de uma folga razoável) — reduz a matemática acima pela metade (~1.440/mês).
- A cadência é **1 parâmetro** (`minutesInterval` no Schedule Trigger de `n8n/workflows/scheduler.ts`) — mudar exige editar o `.ts`, rodar `node scripts/n8n-inline.mjs` e republicar via MCP, nunca editar o nó na UI (regra do topo deste README).

---

## 7. Checklist de execução (ordem sugerida para quem for rodar T10-T13 do zero)

1. Credenciais da seção 2 criadas no n8n (WhatsApp Trigger, WhatsApp send com token permanente, Google Calendar).
2. `node scripts/n8n-inline.mjs` rodado, `n8n/generated/*.ts` revisado.
3. Data Tables criadas via MCP (seção 3); `tenant_config` populada seguindo a ordem da seção 4 (seed → captura → linhas).
4. Templates da seção 5 submetidas no painel Meta (aprovação acompanhada fora do MCP).
5. Workflows publicados via MCP a partir de `n8n/generated/`; `crivo-agente-erros` ligado a `crivo-agente-principal` e `crivo-agente-scheduler` via `settings.errorWorkflow`.
6. Cadência do scheduler (seção 6) confirmada contra a quota real do plano antes de ativar em produção.
7. `crivo-agente-principal` ativado → Meta verifica o webhook automaticamente (seção 2.1) → smoke real no número de teste (T12/T13, fora do escopo deste worker).

---

## 8. Nono dígito brasileiro — o `wa_id` recebido ≠ o destinatário do envio

**A armadilha**: desde 2016/2017 (Anatel), todo celular brasileiro tem 9 dígitos locais — o "nono dígito", um `9` acrescentado antes do número antigo de 8 dígitos. O `wa_id` que a Meta entrega no webhook, porém, vem no **formato legado, sem esse 9**: o número real +55 34 99953-2444 chega como `553499532444` (12 dígitos), enquanto o painel da Meta (campo `to` do curl de exemplo) usa `5534999532444` (13 dígitos). Mandar o `wa_id` cru como destinatário faz a Cloud API responder **erro 131030 — "Recipient phone number not in allowed list"**, e o envio falha depois de todo o resto ter dado certo (lead criado, LLM respondido). Foi exatamente isso na execução 354 de `crivo-agente-principal`, e **não é específico do número de teste**: em produção, toda resposta a lead brasileiro falharia.

**Como o fluxo trata**: `n8n/src/phone.mjs` (`toWhatsAppMsisdn`) insere o `9` depois do DDD quando o número é brasileiro (prefixo `55`), tem 12 dígitos e o número local começa com 6-9 (faixa de **celular**; fixo começa com 2-5 e nunca recebeu o nono dígito — sem esse discriminador um fixo viraria um celular inexistente). Números já com 13 dígitos e números de outros países voltam inalterados (idempotente). Todo nó de envio passa por ela:

| Workflow | Onde normaliza | Nós de envio |
| -------- | -------------- | ------------ |
| `principal.ts` | `Code: destinatário do envio` (convergência de todas as rotas antes do envio) | `WhatsApp: enviar resposta` |
| `scheduler.ts` | `Code: combinar lembrete e tenant` / `Code: combinar reengajamento e tenant` | lembrete texto livre, lembrete template, reengajamento template |

**O `waId` cru continua sendo a chave de tudo o mais** — Data Tables `conversa_estado`/`agenda_envios` e `externalId` do lead no CRM — porque é nesse formato que a Meta sempre entrega os eventos recebidos. Só o campo `recipientPhoneNumber` usa o valor normalizado (`recipientMsisdn`). Nunca "consertar" o `wa_id` na entrada: isso quebraria o casamento com as mensagens seguintes.

---

## 9. Referências

- `.specs/features/lote-6-agente-n8n-whatsapp/design.md` — arquitetura completa, tabela de riscos R1–R7, estratégia de erro.
- `docs/integration/guia-integracao.md` — contrato consumido pelo fluxo (auth, idempotência, transições, 409, opt-out).
- `n8n/src/*.mjs` + `n8n/src/__tests__/*.test.ts` — camada de decisão pura, única fonte de verdade das regras de negócio inlined nos workflows.
- `scripts/n8n-inline.mjs` — docstring do script tem o detalhe completo do mecanismo de marcador.

---

## 10. T12 — Conectividade Meta real: confirmações (2026-08-09)

### 10.1 Payload real vs. fixtures — diff zero

Comparado o payload de entrada do nó `WhatsApp Trigger` da execução real **404** de `crivo-agente-principal` (`2026-08-09T02:50:47Z`, `mode:"webhook"`, ~12.6s de duração — round-trip completo com resposta do Gemini e envio confirmado) contra `n8n/fixtures/meta-message-text.json`. Todos os campos que `normalizeEvent` consome batem em presença e tipo: `messaging_product`, `metadata.phone_number_id`, `contacts[].wa_id`, `messages[].id/timestamp/type/text.body`. **Diff estrutural: zero — fixture não alterada.**

Duas observações honestas, nenhuma bloqueante:

- O payload real trouxe dois campos adicionais que a fixture não tem: `contacts[].user_id` e `messages[].from_user_id` (formato `BR.<dígitos>`, aparentemente um identificador Meta mais novo). São aditivos — `normalizeEvent` lê só os campos nomeados acima e ignora o resto, então não afetam o comportamento nem exigem mudança na fixture.
- O `wa_id`/`from` real da execução 404 tem 12 dígitos (`553499532444` — formato legado, sem o nono dígito, exatamente o que a seção 8 já documenta), enquanto o valor de exemplo usado nas fixtures (`5534999990001`) tem 13 dígitos (já com o nono dígito incluído). `normalizeEvent` só repassa `waId` como string opaca — não valida nem transforma formato — então isso não é uma divergência estrutural nem afeta nenhum teste hoje; é só uma imprecisão de dado de exemplo nas fixtures em relação ao formato real documentado na seção 8. Registrado aqui em vez de "corrigido" porque mudar o valor exigiria também atualizar as asserções de `n8n/src/__tests__/normalize-event.test.ts` sem nenhum ganho de cobertura — fora do escopo do T12 (que não deve tocar `n8n/src/`).

### 10.2 Token de envio (WhatsApp API, credencial `HB4RrjlPYBAIkaX8`) — permanência (Risco R2)

Confirmado por observação em **Meta Business Settings → Usuários → Usuários do sistema → "Conversions API System User"** (sem gerar/regenerar/revogar nada):

- A credencial pertence de fato a um **usuário do sistema** ("Conversions API System User", `Acesso de Employee`), com o app `crivo` instalado com exatamente os escopos `business_management`, `whatsapp_business_management` e `whatsapp_business_messaging` desde **5 de ago de 2026** — mesma data em que a credencial foi criada nesta feature.
- O assistente "Gerar token" desse usuário do sistema, para o app `crivo`, oferece as opções **"60 dias (recomendado)"** e **"Nunca"** na etapa "Definir expiração" — confirma que o mecanismo de token permanente que o runbook (seção 2.2) descreve existe e está disponível para esta credencial. O fluxo foi fechado nessa etapa (sem avançar/gerar) para não invalidar o token em uso.
- Evidência indireta forte de que o token atual **não é** o temporário de 23h do painel "Configuração da API" (a preocupação específica do Risco R2): a execução **404**, de hoje (`2026-08-09`), 4 dias depois da credencial ter sido criada (`2026-08-05`), enviou uma mensagem real com sucesso pelo nó `WhatsApp: enviar resposta` (Graph API respondeu com `wamid` de confirmação). Um token de 23h não sobreviveria 4 dias.
- **O que não foi possível confirmar**: o Meta não expõe, para um token de usuário do sistema já emitido, se ele foi gerado com "60 dias" ou "Nunca" — essa informação só aparece na tela do próprio assistente de geração, no momento da criação, e não fica visível depois. Não há como ler isso retroativamente sem gerar um token novo (ação que invalidaria o atual e está fora do escopo permitido aqui).

**Conclusão honesta**: confirmado que o token é de usuário do sistema (não o temporário de 23h — a falha específica que o R2 descreve) e que segue funcionando 4 dias depois da criação. Não confirmado com certeza absoluta se a opção escolhida na geração foi "Nunca" (permanente) ou "60 dias". Pendência conhecida, não bloqueante para T12: se o envio parar de funcionar em algum momento (o que `crivo-agente-erros` notificaria por e-mail), gerar um novo token de usuário do sistema escolhendo explicitamente "Nunca" resolve definitivamente.

### 10.3 Resync `tenant_config` (rodado nesta sessão, após `npx vitest run`)

Como o gate deste T12 rodou `npx vitest run` (que rotaciona as API keys via `runSeed()` em `beforeAll`, conforme seção 4), o procedimento da seção 4 foi seguido até o fim: `npm run db:seed` rodado uma única vez, as 2 chaves capturadas do stdout, aplicadas às 2 linhas da Data Table `tenant_config` (`eqp0TUHvN9yQNvdY`) via workflow n8n temporário com nó Data Table em `update` (casado por `phoneNumberId`), workflow arquivado logo em seguida. Validado com `GET /api/v1/settings` disparado de dentro de outro workflow temporário (também arquivado após a checagem): `200`, `realEstateName: "Triângulo Imóveis"`. Nenhuma chave foi escrita em arquivo, log ou commit.
