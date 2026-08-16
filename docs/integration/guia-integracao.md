# Guia de Integração — Contrato CRM ↔ Agente

Este guia complementa `openapi.yaml` (a autoridade estrutural do contrato — paths, schemas, erros) com a semântica que um cliente HTTP precisa conhecer para integrar com segurança: autenticação, idempotência, a máquina de estados do pipeline, LGPD e os limites do v1. Ele é dirigido a quem vai implementar o consumidor (fluxo n8n da Fase 8) ou reimplementar a própria API em outro runtime.

Todos os endpoints abaixo vivem sob o prefixo `/api/v1`, exceto o job de TTL (`/api/cron/expire-documents`), que fica fora do contrato do agente por definição — veja "TTL de documentos" adiante.

---

## 1. Autenticação e revogação

- Toda rota `/api/v1/*` exige o header `Authorization: Bearer <chave>`.
- Existem **dois modos** de autenticação (lote-7 — SEC-01), testados nesta ordem exata pelo servidor a cada chamada:

  1. **Chave de serviço** (`serviceAuth`) — uma credencial única, cross-tenant, usada pelo fluxo do agente n8n. Se o hash da chave enviada corresponde a uma linha ativa de `service_api_keys`, este modo é usado. Exige o header adicional `X-Crivo-Tenant` com o **slug** do tenant (ex.: `triangulo`, `vale-uberaba`). Header ausente, ou com slug que não corresponde a nenhum tenant, responde `401` `tenant-nao-identificado` — o servidor **nunca** cai em nenhum tenant default nesse caso.
  2. **Chave por tenant** (`bearerAuth`) — o modo original (lote-5), inalterado: a chave identifica o tenant diretamente. Só é tentado quando a chave **não** corresponde a nenhuma chave de serviço ativa. `X-Crivo-Tenant`, se enviado junto de uma chave de tenant, é **ignorado** — mesmo que aponte para um tenant diferente do dono da chave.

  A regra de precedência é simples: **chave de serviço primeiro, chave de tenant como fallback.** Os dois modos nunca se combinam numa mesma chamada.
- A chave (em qualquer modo) identifica o **tenant** da chamada — nenhum payload de nenhum endpoint aceita `tenant_id`. O isolamento entre imobiliárias é estrutural: a chave (mais o header, no modo de serviço) é a única fonte de tenant que o servidor conhece; o corpo da requisição nunca é lido para isso.
- Sem header `Authorization`, chave malformada, chave de tenant inexistente ou revogada → `401` `nao-autenticado`, sem tocar o banco. Chave de serviço válida com `X-Crivo-Tenant` ausente/desconhecido → `401` `tenant-nao-identificado` (veja acima).
- Um recurso (lead, mensagem) que existe mas pertence a **outro** tenant responde `404` `recurso-nao-encontrado` — nunca `403`. O contrato nunca revela a existência de dado de outro tenant.
- **Formato da chave**: string opaca de alta entropia (64 hex chars no gerador atual), nos dois modos. O servidor nunca persiste o valor em claro de nenhuma das duas — só o hash sha256, em tabelas próprias (`tenant_api_keys` e `service_api_keys`, respectivamente).
- **Provisionamento**: o seed do ambiente (`npm run db:seed`) gera 1 chave por tenant **e** 1 chave de serviço, imprimindo os valores em claro **uma única vez** no output do comando. Guarde-os imediatamente — não há como recuperá-los depois (o banco só tem o hash).
- **Rotação/revogação**: revogar uma chave é preencher `revoked_at` na linha correspondente de `tenant_api_keys` ou `service_api_keys` (operação de banco/admin, sem endpoint dedicado no v1). Uma chave revogada passa a responder `401` em qualquer rota, imediatamente. O procedimento humano de rotação da chave de serviço usada pelo fluxo n8n está documentado em `n8n/README.md`.
- **Atenção**: rodar `npm run db:seed` novamente gera chaves **novas** — para os tenants e para a chave de serviço — e invalida as anteriores (o seed é idempotente para os dados de negócio, mas não para as chaves). Não reseedar um ambiente com um consumidor real conectado sem coordenar a rotação.

## 2. Idempotência

Dois recursos do contrato são idempotentes por um `externalId` fornecido pelo cliente — a defesa contra retries do fluxo do agente, que são esperados (webhooks e filas reentregam):

| Recurso | Campo de idempotência | Escopo da unicidade | Comportamento na reentrega |
| ------- | ---------------------- | -------------------- | --------------------------- |
| Lead (`POST /leads`) | `externalId` (ex.: `wa_id` do contato) | Por tenant — dois tenants podem usar o mesmo valor sem colidir | `201` na primeira vez; `200` com o lead existente nas seguintes, nunca duplica |
| Mensagem (`POST /leads/{id}/messages`) | `externalId` (ex.: id da mensagem no WhatsApp) | Por tenant | `201` na primeira vez; `200` com a mensagem existente nas seguintes, nunca duplica |

- A unicidade é garantida por **índice único parcial no Postgres** (`WHERE external_id IS NOT NULL`), não só na camada de aplicação — duas requisições concorrentes com o mesmo `externalId` produzem no máximo 1 registro, mesmo em corrida.
- **Mensagens fora de ordem** são aceitas: o campo `sentAt` vem do cliente e não precisa refletir a ordem de chegada das requisições. A tela de Chats sempre ordena a thread por `sentAt`, nunca pela ordem de ingestão.
- Reentrega **nunca é tratada como erro** — é sempre `2xx` com o recurso existente.

## 3. Máquina de estados do pipeline e trava humana

`status` do lead tem 3 valores: `em_qualificacao`, `qualificado_agendado`, `escalado_humano`. O agente só pode **avançar**, nunca regredir nem sair de `escalado_humano` — destravar um lead escalado é ação humana, feita pelo Kanban do CRM, fora da API.

**Tabela de transições permitidas** (`PATCH /leads/{id}` com `status` no corpo):

| De ↓ / Para → | `em_qualificacao` | `qualificado_agendado` | `escalado_humano` |
| --------------- | :----------------: | :---------------------: | :-----------------: |
| `em_qualificacao` | — | ✅ | ✅ (exige `escalationReason`) |
| `qualificado_agendado` | ❌ | — | ❌ |
| `escalado_humano` | ❌ | ❌ | — |

Qualquer combinação marcada ❌ responde `409` `transicao-invalida`.

**Trava humana** (INT-04): assim que um humano move o lead pelo Kanban do CRM, o lead fica marcado internamente como `status_changed_by = 'humano'`. A partir daí, **qualquer tentativa de mudar o `status`** via API — mesmo uma transição presente na tabela acima — responde `409` `lead-travado-por-humano`. Campos de qualificação e novas mensagens continuam aceitos normalmente; só a coluna `status` fica bloqueada. Um humano pode "destravar" simplesmente movendo o lead de novo pelo Kanban (o que marca o novo status como de origem humana outra vez, ou libera a próxima ação do agente conforme a nova tabela de transições a partir do novo status).

**Códigos de erro 409 do PATCH**, na ordem em que são avaliados:

1. `transicao-invalida` — a transição pedida não está na tabela acima a partir do status atual do lead.
2. `lead-travado-por-humano` — a transição está na tabela, mas um humano alterou o status por último.
3. `motivo-escalonamento-obrigatorio` — a transição para `escalado_humano` foi pedida sem `escalationReason` preenchido (ou preenchido só com espaços).

**Atomicidade**: se o PATCH mistura campos válidos com uma transição de status rejeitada, a request inteira é rejeitada — nenhum campo do payload é gravado, nem os que seriam válidos isoladamente. Não há "salvamento parcial".

**Upsert parcial de qualificação**: no corpo do PATCH, uma chave **ausente** nunca toca a coluna correspondente; uma chave presente com valor `null` explícito **limpa** a coluna; uma chave presente com valor grava esse valor. Isso vale para todos os campos de qualificação (`modality`, `region`, `budgetCents`, `propertyType`, `purchaseHorizon`, `motivation`, `creditStatus`, `chainedOperation`, `executiveSummary`, `escalationReason`, `meetingAt`) — `status` é exceção: não aceita `null` (é uma coluna obrigatória no schema).

## 4. Opt-out (LGPD-01)

- `POST /leads/{id}/opt-out` registra o timestamp de opt-out no lead. É **idempotente**: chamar duas vezes preserva o timestamp da primeira chamada — nunca o substitui por um mais recente.
- O campo `optedOutAt` é sempre incluído na representação de um lead na API (`null` quando não houve opt-out).
- O detalhe do lead no CRM exibe um indicador visual quando `optedOutAt` está presente.
- **Responsabilidade do consumidor**: o CRM só **registra e expõe** o estado de opt-out — ele não é quem dispara mensagens ao lead. **É dever do consumidor (o fluxo do agente) consultar `optedOutAt` antes de qualquer novo envio e interromper todo disparo subsequente a um lead com opt-out registrado.** Nenhum mecanismo do lado do CRM bloqueia o envio de mensagens pelo canal externo (WhatsApp) — o contrato só garante que o estado está disponível para essa checagem.

## 5. TTL de documentos (LGPD-02)

- Cada documento de contexto tem um `expiresAt` opcional. Um job agendado (Vercel Cron, diário — `vercel.json`) chama `/api/cron/expire-documents` e deleta todo documento com `expiresAt <= now()`, reportando a contagem de deletados por tenant.
- **Esse endpoint fica fora de `/api/v1`** e usa autenticação própria: header `Authorization: Bearer <CRON_SECRET>` (variável de ambiente do projeto), não a API key de tenant. O agente n8n nunca precisa chamá-lo.
- **`GET /api/cron/expire-documents` também é aceito, com a mesma autenticação** — a Vercel invoca Cron Jobs sempre via `GET` (e injeta automaticamente `Authorization: Bearer $CRON_SECRET` quando a variável está configurada no projeto), então o handler responde aos dois verbos para funcionar de fato quando implantado.
- Sem secret ou com secret errado → `401`, nada é deletado.
- **`GET /api/v1/context` nunca depende do job já ter rodado**: a leitura de contexto filtra `expiresAt IS NULL OR expiresAt > now()` na própria query, então um documento vencido some da resposta imediatamente ao expirar, mesmo que o cron ainda não tenha passado.

## 6. Limites do v1

- **Tamanho de corpo**: 100 KB por requisição. Acima disso, `413` `corpo-grande-demais`, sem gravar nada.
- **Rate limiting**: não implementado no v1 — o piloto opera com 2 consumidores conhecidos e chaves revogáveis, o que é considerado suficiente para essa fase. Fica registrado aqui como evolução futura esperada antes de abrir o contrato a mais tenants/consumidores.
- **Datas**: todo campo de data/hora (`firstContactAt`, `sentAt`, `meetingAt`) exige ISO-8601 completo (data + hora + timezone) — datas sem hora (`"2026-08-01"`) são rejeitadas com `400`.
- **Enums**: todo campo de enum (`status`, `modality`, `propertyType`, `motivation`, `creditStatus`, `sender`) só aceita os valores exatos listados em `openapi.yaml`; qualquer outro valor responde `400` `payload-invalido` apontando o campo.
- **Rotas/métodos desconhecidos**: qualquer path sob `/api/v1` sem handler correspondente responde `404` `rota-inexistente`; um método não suportado num path existente responde `405` `metodo-nao-suportado` com header `Allow`. Nunca HTML — sempre `application/problem+json`.

## 7. Procedimento de substituição da implementação

Este contrato foi desenhado para que a implementação atual (route handlers do Next.js em `app/api/v1/**`, delegando para a camada de serviço `src/server/integration/*`) seja **substituível** por outro runtime (ex.: um microserviço em Python) sem exigir mudanças no CRM nem no consumidor n8n.

O acoplamento entre o CRM e esta API é **só o banco de dados**: o CRM lê o mesmo Postgres em que esta API escreve. Um substituto precisa honrar exatamente duas coisas:

1. **O contrato público — `openapi.yaml`**. Todo path, verbo, schema de request/response e código de erro (`Problem.code`) descrito neste diretório precisa se comportar de forma idêntica do ponto de vista do consumidor (n8n): mesmos status HTTP, mesmos campos, mesma semântica de idempotência/transições/opt-out/TTL documentada acima. `SwaggerParser.validate()` sobre o `openapi.yaml` é o gate de que o documento em si está bem formado — a paridade de comportamento do substituto contra esse contrato é responsabilidade de quem migra (recomenda-se testes de contrato/replay contra os casos deste guia antes do corte).
2. **O schema Postgres** (`src/db/schema.ts` no CRM). O substituto escreve nas mesmas tabelas/colunas que o CRM já lê: `leads` (incluindo `external_id`, `opted_out_at`, `status_changed_by`), `conversations`, `messages` (incluindo `external_id`), `documents`, `tenant_api_keys`. Nenhuma tela do CRM muda — elas continuam lendo o banco sem saber quem o escreveu (troca de fonte, não redesenho — mesmo princípio da Fase 9 deste produto).

Passos práticos para o corte:

1. Implementar o novo serviço honrando (1) e (2) acima, apontando para o **mesmo** banco (ou uma réplica em sincronia estrita).
2. Rodar o novo serviço em paralelo ao atual, validando respostas byte-a-byte (ou campo-a-campo) contra os cenários deste guia — em especial idempotência, a tabela de transições/409 e a trava humana, que são as regras com mais estado.
3. Gerar novas API keys (`tenant_api_keys`) apontando para o novo serviço, se o mecanismo de auth mudar de forma; caso contrário, reaproveitar as chaves existentes (o hash sha256 independe do runtime).
4. Trocar o endpoint que o n8n chama; desligar os route handlers antigos.
5. O job de TTL (`/api/cron/expire-documents`) e o `CRON_SECRET` seguem o mesmo princípio: qualquer runtime que rode a mesma query de expiração contra o mesmo schema cumpre o contrato.

Nenhum desses passos exige alterar `app/(crm)/**` (as telas do CRM) — elas nunca conheceram a implementação desta API, só o banco.

## 8. Settings do tenant e horário comercial (INT-09)

- `GET /api/v1/settings` retorna a persona do agente (`agentName`,
  `agentPresentationMessage`), o nome da imobiliária (`realEstateName`), a
  modalidade suportada (`supportedModality`) e o horário comercial
  configurado pela imobiliária na tela de Configurações do CRM
  (`meetingDays`, `meetingHoursStart`, `meetingHoursEnd` — CONF-05).
- **Horário comercial**: `meetingDays` é uma lista de inteiros ISO
  1(segunda)–7(domingo); `meetingHoursStart`/`meetingHoursEnd` são strings
  `"HH:MM"`, sem timezone — interprete no fuso `America/Sao_Paulo` (único
  fuso do produto no piloto).
- **Fallback do consumidor**: quando a imobiliária não configurou horário
  comercial, os 3 campos acima vêm `null`. Nesse caso, o consumidor (fluxo do
  agente) deve aplicar o fallback **segunda a sexta, 9h às 18h** antes de
  propor qualquer horário de reunião — o CRM nunca inventa um valor default
  para esses campos; a decisão de fallback é do consumidor, documentada aqui
  para que toda reimplementação do fluxo aplique o mesmo default.
- Sujeito às mesmas regras transversais do contrato: `401` sem chave válida
  ou chave inválida/revogada, isolamento por tenant (a chave nunca revela
  settings de outro tenant), `application/problem+json` em qualquer erro.

## 9. Histórico de mensagens do lead (lote-6b — CTX-02)

- `GET /leads/{id}/messages` retorna a thread do lead em ordem cronológica
  crescente (`sentAt` ASC), no mesmo formato `Message` já usado pelo
  `POST /leads/{id}/messages`. É esta rota que o fluxo do agente consulta a
  cada turno para dar contexto ao modelo — nunca uma cópia paralela do
  histórico do lado do consumidor.
- **`limit`** (query, opcional): quantas mensagens mais recentes devolver,
  sempre em ordem crescente. Sem o parâmetro, o padrão é **50**. Faixa
  válida: inteiro de 1 a 100 — qualquer outro valor (incluindo `0`, negativo,
  não numérico ou acima de 100) responde `400` `payload-invalido`, sem
  corrigir silenciosamente.
- Lead inexistente ou de outro tenant responde `404`
  `recurso-nao-encontrado` — mesma regra de isolamento cross-tenant do
  restante do contrato (nunca `403`).
- Sujeito às mesmas regras transversais: `401` sem chave válida, isolamento
  por tenant, `application/problem+json` em qualquer erro.
