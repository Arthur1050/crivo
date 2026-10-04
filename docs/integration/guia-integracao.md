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
2. `lead-conduzido-por-humano` (lote-14) — o lead tem a marca de condução humana (`humanTakeoverAt` preenchido) e o patch traz `status` ou `meetingAt`. Vale também para `meetingAt` sem `status`. Patch só de qualificação continua aceito. Com a marca **e** a trava humana ao mesmo tempo, o código é este.
3. `lead-travado-por-humano` — a transição está na tabela, mas um humano alterou o status por último.
4. `motivo-escalonamento-obrigatorio` — a transição para `escalado_humano` foi pedida sem `escalationReason` preenchido (ou preenchido só com espaços).

O agendamento ainda pode responder `409` `sem-corretor-disponivel` (nenhum corretor atende no horário pedido) ou `409` `conflito-de-agenda` (o horário colide com outra reunião), depois das regras acima.

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
- **`POST /api/v1/context` nunca depende do job já ter rodado**: a leitura de contexto filtra `expiresAt IS NULL OR expiresAt > now()` na própria query, então um documento vencido some da resposta imediatamente ao expirar, mesmo que o cron ainda não tenha passado.

## 6. Limites do v1

- **Tamanho de corpo**: 100 KiB (102400 bytes UTF-8) por requisição. Acima disso, `413` `corpo-grande-demais`, sem gravar nada.
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

L14b: `POST /leads/{id}/messages` aceita `whatsappPhoneNumberId` opcional/nulo para legado, ou string de 1–32 dígitos após trim. Registre o número factual do evento/envio; o CRM não infere o canal do cadastro do lead. Formato inválido responde `400 payload-invalido`; numa mensagem nova, número desconhecido, de outro tenant ou sem propriedade verificada responde `409 canal-nao-vinculado`, sem gravação. Registrar mensagem não exige credencial de transporte. Replay conserva texto, hora, autoria e canal originais, inclusive `null`.

As mensagens serializadas acrescentam `whatsappPhoneNumberId` (nulo no legado). POST continua retornando o objeto da mensagem (`201` nova / `200` replay) e acrescenta `anchorMessageId` e `agentStateRevision`, ambos anuláveis. A âncora é o inbound corrente por `sentAt`/`id`, mesmo se o turno enviado for antigo ou uma saída; a revisão é a projeção corrente do agente, independente da revisão da ponte. Não use o ID da mensagem atrasada/repetida como âncora para publicar estado. Uma fase calculada para turno antigo também não pode ser publicada na âncora corrente só porque ela veio na resposta: descarte a publicação desse turno quando a âncora calculada não for a mesma âncora corrente.

GET mantém o array legado e acrescenta headers `X-Crivo-Anchor-Message-Id` e `X-Crivo-Agent-State-Revision`, com a string literal `null` quando ausentes. Os metadados vêm do mesmo snapshot do histórico e não são limitados pelos itens retornados: a âncora pode ficar fora de `limit`, e um array vazio também fornece os headers. Serviço de integração consulta todas as carteiras do tenant autorizado; nunca retorna fatos de outro tenant.

- `GET /leads/{id}/messages` retorna a thread do lead em ordem cronológica
  crescente (`sentAt` ASC), no mesmo formato `Message` já usado pelo
  `POST /leads/{id}/messages`. É uma leitura bruta do histórico. No L14b,
  o fluxo usa `POST /leads/{id}/session-context` para o contexto autoritativo
  de cada turno, com ponte/reset/buffer — veja seção 11.
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

## 10. Condução humana e autoria (lote-14)

O corretor pode assumir uma conversa pelo Chats do CRM, responder ao lead e devolver a conversa ao agente. Para o consumidor do contrato, isso aparece em quatro pontos.

**Campos de condução no `Lead`** (em toda resposta que devolve o lead):

- `humanTakeoverAt` (ISO 8601 ou `null`): a marca de condução humana. Preenchido, um humano conduz a conversa: o consumidor não deve enviar nenhuma mensagem ao lead e recebe `409 lead-conduzido-por-humano` se tentar mudar `status` ou `meetingAt`. O lead em `escalado_humano` também é conduzido por humano, com ou sem a marca.
- `memoryResetRequestedAt` (ISO 8601 ou `null`): instante do último pedido do CRM para reconstruir a memória do agente (devolução ao agente ou opt-out registrado pela tela). O consumidor guarda o último pedido atendido e reconstrói a memória a partir de `POST /leads/{id}/session-context` quando o pedido for mais novo (L14b, seção 11).

**`GET /leads/{id}`**: devolve o `Lead` do tenant da chave. É a leitura que o agente faz imediatamente antes de cada envio, para não falar com um lead que um humano acabou de assumir. Lead inexistente ou de outro tenant responde `404` `recurso-nao-encontrado`; sem chave, `401`. Se a leitura falhar, o consumidor não deve enviar.

**`GET /memory-resets?since=<ISO 8601>`**: devolve `{ "resets": [{ "leadId", "waId", "requestedAt" }] }` com os pedidos de reconstrução do tenant com `requestedAt` maior ou igual a `since` (o próprio `since` entra). Leads sem `externalId` não aparecem. `since` ausente ou inválido responde `400` `payload-invalido`. Serve para purgar a memória de quem não escreve mais (opt-out pelo CRM tem de ser purgado em até 20 minutos).

**`whatsappPhoneNumberId` no `POST /leads`** (opcional, só dígitos, 1 a 32): o id do número de WhatsApp da imobiliária para o qual o lead escreveu. O CRM responde ao lead por esse número. Enviar a cada mensagem recebida; o CRM grava só quando o valor muda, e uma entrega sem o campo nunca apaga o valor existente. Valor vazio, só espaços, não numérico ou com mais de 32 dígitos responde `400` `payload-invalido`.

**Autoria `humano`** nas mensagens:

- `GET /leads/{id}/messages` pode devolver `sender: "humano"`: mensagem escrita por um usuário do CRM e entregue ao lead pelo WhatsApp. O campo `authorName` traz o nome do autor no momento do envio (preservado mesmo se o usuário for removido depois); nas mensagens `agente` e `lead`, `authorName` é `null`.
- `POST /leads/{id}/messages` aceita só `sender: "agente"` e `sender: "lead"`. `sender: "humano"` responde `400` `payload-invalido` e nada é gravado: a autoria humana nasce só pela tela, com usuário autenticado, nunca pela credencial de serviço.
- Ao reconstruir a memória do agente, a mensagem `humano` deve entrar como fala da imobiliária, atribuída ao corretor, e nunca como fala do lead.

## 11. Reengajamento e contexto (L14b)

Todas as operações usam o wrapper autenticado e o tenant derivado da credencial; não aceitam tenant, destino, credencial de transporte ou parâmetros de Graph no corpo. IDs de path são UUID; recurso ausente/estrangeiro é 404, payload inválido é 400, corpo acima de 100 KiB é 413 e verbo não suportado é 405 com Allow. Erros usam application/problem+json e detalhes estáticos. O OpenAPI descreve os DTOs e códigos específicos.

| Operação relativa a /api/v1 | Corpo/consulta | Resultado |
| --- | --- | --- |
| POST /leads/{id}/agent-state | Âncora, reset observado, expectedRevision, phase, até 8 askedFields e openingHistory | 200 replay/state; 409 quando âncora/reset/revisão/fase divergem |
| GET /whatsapp/automation/candidates | limit 1–100 (padrão 100), cursor opaco até 1024 caracteres | Página de IDs/ação, cutoffAt e nextCursor; pode ser vazia com cursor |
| POST /leads/{id}/reengagement/prepare | anchorMessageId | 201 claimToken/expiração/frame; 200 episódio já consumido sem token alheio; 409 lease ativa |
| POST /leads/{id}/reengagement/{episodeId}/preparation-failure | claimToken e code permitido | 200 liberação; replay do token liberado retorna 409 e não libera lease substituta |
| POST /leads/{id}/reengagement/{episodeId}/send | claimToken e text | 200 fato de envio/replay; marcador durável antes da única chamada Meta |
| POST /leads/{id}/reengagement/{episodeId}/acknowledgement | wamid/acceptedAt opcionais ou nulos | Reconciliação factual, sem transporte; corpo vazio usa identidade durável, sem inventar aceite |
| POST /leads/{id}/reengagement/expire | anchorMessageId | Omissão aos 24h/escalonamento aos 48h; replay preserva resultado e atribuição |
| POST /leads/{id}/session-context | bufferMessageIds opcionais, até 50 IDs reais de inbound | frame/history/requiresRebuild/pendingAcceptance/anchor/agentStateRevision, sem mutação |
| POST /whatsapp/statuses | phoneNumberId e 1–100 status normalizados | 200 processed idempotente; 403 sem origem comprovada ou canal verificado |
| POST /whatsapp/usage/sync | phoneNumberId cadastrado | 200 synced/skipped/unavailable e snapshot permitido; 503 indisponibilidade técnica |

No primeiro envio, text recebe trim e deve ter 1–4096 unidades UTF-16: caracteres astrais contam duas. O limite está na semântica de disparo, não no parser estrutural. Replay consumido retorna a identidade original mesmo com novo texto inválido ou transporte agora indisponível, sem nova chamada Meta. Refused/uncertain/accepted_pending_record também são resultados factuais 200; não reenviar um resultado indeterminado. Acknowledgement tardio reconcilia o aceite, mas reset/takeover não reativam uma ponte invalidada.

A metadata aditiva de POST /messages é **corrente**: anchorMessageId/agentStateRevision não autorizam publicar uma projeção calculada para outra âncora. Guarde a âncora/revisão originais do turno e descarte saída obsoleta. GET /messages conserva o array e anuncia X-Crivo-Anchor-Message-Id/X-Crivo-Agent-State-Revision (literal null sem fato). Canal opcional/nulo mantém legado; replay conserva canal e autoria originais. A revisão do frame de sessão é da ponte, independente da revisão do agente. Use history já calculado pelo CRM sem recortar/semear novamente; pending exige aguardar/reconciliar, sem gerar a partir de contexto presumido.

Status só recebem capacidade de origem a partir de prova de configuração servidor da versão instalada do forwarder: HMAC SHA256 sobre raw-body, rejeição de assinatura inválida e credencial autenticada correspondente. Body/header verified não concedem prova. O default permanece fechado até esse gate factual. Validação e persistência do lote são integrais; status nunca criam inbound/bolha/agente. Órfãos expiram em 30 dias; pricing ausente/desconhecido não presume gratuidade.

Consumo usa cadência de 15min por número inclusive falha/troca de mês, lease de 90s e orçamento de 80s; Graph é montado no servidor. 429/timeout preservam o snapshot corrente válido e só registram reason limitado. Mês/configuração incompatíveis ficam indisponíveis; falha não publica zero. O preflight disponível é de conta de teste: adapter produtivo ausente, usageEnabled false e **Consumo indisponível**, sem saldo presumido. USO03/USO04 permanecem deferidos ao L14c; esta API não habilita essas superfícies.
