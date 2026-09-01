# Lote 6b — Persona conversacional + lapidação de UI · Tasks

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/lote-6b-persona-e-lapidacao/design.md`
**Status**: Done — Verifier PASS (2026-08-10), ver `validation.md`. 13/13 tasks completas, 612/612 testes, lint e build verdes, sensor de discriminação 3/3 mutações mortas. Gaps não-bloqueantes: execução real na instância n8n (fora do ar, gap esperado — Runbook pós-hospedagem) e 2 spec-precision gaps menores em PER-01 (lição L-012).

---

## Restrição desta execução

**A instância n8n está fora do ar** (context.md). Nenhuma task publica workflow, cria Data Table ou roda execução na instância. As tasks de n8n entregam **código-fonte do fluxo + módulos puros testados + `n8n/generated/` regenerado**. A publicação e a conversa real ficam no Runbook pós-hospedagem do `spec.md` — não são gate deste lote.

---

## Test Coverage Matrix

> Confirmado por amostragem do repo: vitest, suíte única, 535 testes, 0 skipped. Guidelines: `AGENTS.md`/`CLAUDE.md` (self-check Astryx; sem norma de testes além do padrão da suíte).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Camada de decisão n8n (funções puras) | unit | Todas as branches; 1:1 com ACs de CTX-01, PER-01, PER-02; asserção por **conteúdo citável** do prompt, nunca por presença genérica | `n8n/src/__tests__/*.test.ts` | `npx vitest run` |
| DAL (mensagens por lead, tom de voz) | integration | Ordem, limite, isolamento cross-tenant; padrão SPG-1 (chave ausente não toca / null limpa) | `src/server/data/__tests__/*.test.ts` | `npx vitest run` |
| Rota de integração | integration | Padrão do lote-5: happy + 400 + 401 + 404 cross-tenant + 405 com `Allow` | `src/server/integration/__tests__/routes/*.test.ts` | `npx vitest run` |
| Server action / validação de form | unit | Válido + inválido exato (vazio → null; > 500 chars → erro) | `src/server/__tests__/actions.test.ts` | `npx vitest run` |
| Utilitário puro de UI (`file-type.ts`) | unit | Tabela MIME → kind, incluindo desconhecido | `src/lib/__tests__/*.test.ts` | `npx vitest run` |
| openapi.yaml | contrato | `SwaggerParser.validate()` já existente cobre as adições | teste openapi existente | `npx vitest run` |
| UI (Chats, Documentos, Configurações) | screenshot real | **Obrigatório** via extensão Claude in Chrome contra `next start` em porta dedicada (build de **produção**, nunca `next dev`) | — | manual no Execute |
| Workflows n8n | geração versionada | `n8n/generated/` regenerado e commitado; **sem execução na instância** (hospedagem fora do ar) | `n8n/generated/*` | script de inline/geração |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks só com unit tests | `npx vitest run` |
| Full | Tasks com testes de integração | `npx vitest run` (suíte única no repo) |
| Build | Fim de phase, tasks de schema/UI/fluxo | `npx vitest run` + `npm run lint` + `npm run build` |

Piso de testes: **535** (nunca cair; nenhum teste removido/enfraquecido). `npm run db:seed` antes de qualquer smoke — e lembrar que qualquer `npx vitest run` **rotaciona as API keys dos tenants** (`n8n/README.md` §4); com o n8n fora do ar isso não quebra nada nesta janela, mas a ressincronização é o item 3 do Runbook pós-hospedagem.

---

## Execution Plan

Phases são ordenadas e sequenciais; tasks executam em ordem dentro da phase.

### Phase 1 — CRM: contrato de histórico + tom de voz

```
T1 → T2
T3 → T4
```

### Phase 2 — Camada de decisão pura (n8n/src) + seed

```
T5 → T6 → T7 → T8
T3 → T8
```

### Phase 3 — Fluxo como código (n8n/workflows)

```
T7 → T9 → T10
```

### Phase 4 — UI do CRM

```
T11
T12 → T13
```

Empacotamento sugerido (~7/batch, phases inteiras): **Batch 1 = P1+P2 (T1–T8) · Batch 2 = P3+P4 (T9–T13)**.

---

## Task Breakdown

### T1: DAL + parser de query para o histórico do lead

**What**: `getLeadMessages(tenantId, leadId, limit)` na DAL (join `messages`⋈`conversations` por `leadId`, filtro de `tenantId` nas duas tabelas, `ORDER BY sentAt DESC, id DESC LIMIT n` revertido em TS para ordem crescente; `null` quando o lead não existe no tenant) e `parseMessagesQuery(url)` puro em `parsers.ts` (ausente → 50; 1–100 válido; qualquer outro → erro com detalhe).
**Where**: `src/server/data/index.ts`, `src/server/integration/parsers.ts`, `src/server/data/__tests__/`, `src/server/integration/__tests__/`
**Depends on**: None
**Reuses**: padrão de query tenant-scoped da DAL; discriminação ausente/inválido já usada em `parsers.ts` (SPG-1)
**Requirement**: CTX-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Lead com 5 mensagens → 5 em ordem crescente; `limit=2` → as **2 mais recentes**, ainda crescentes (teste que falharia com `ORDER BY ASC LIMIT`)
- [x] Lead de outro tenant → `null`; lead sem mensagens → `[]` (distinto de `null`)
- [x] `parseMessagesQuery`: sem `limit` → 50; `0`, `101`, `abc`, `-1` → erro; `1` e `100` → aceitos
- [x] Gate: `npx vitest run` verde, ≥535 + novos (548)

**Tests**: integration
**Gate**: full
**Commit**: `feat(contrato): leitura do histórico de mensagens de um lead na DAL`

---

### T2: `GET /api/v1/leads/{id}/messages`

**What**: `listMessages` em `src/server/integration/messages.ts` + `export async function GET` no route handler existente (**remover** o `export const GET = methodNotAllowed(["POST"])` atual — duas exportações do mesmo nome quebram o build) e atualizar os demais `methodNotAllowed` para `["GET","POST"]`; operação + parâmetro `limit` no `openapi.yaml` e a rota listada no guia de integração.
**Where**: `src/server/integration/messages.ts`, `app/api/v1/leads/[id]/messages/route.ts`, `docs/integration/openapi.yaml`, `docs/integration/guia-integracao.md`, testes em `src/server/integration/__tests__/routes/`
**Depends on**: T1
**Reuses**: `authenticate`, `problem`/`methodNotAllowed`, `serializeMessage` (formato idêntico ao do POST)
**Requirement**: CTX-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] 200 com lista crescente; `?limit=2` → 2 itens; `?limit=0` → 400 `payload-invalido`
- [x] 404 `recurso-nao-encontrado` para lead de outro tenant (mesma resposta de lead inexistente)
- [x] 401 sem chave / chave inválida; 405 com `Allow` correto nos verbos restantes
- [x] `SwaggerParser.validate()` verde com a nova operação
- [x] Gate: `npx vitest run` verde (557)

**Tests**: integration
**Gate**: full
**Commit**: `feat(contrato): rota GET de mensagens do lead`

---

### T3: Tom de voz do agente — schema, DAL, action e settings da API

**What**: coluna `agent_voice_tone text NULL` em `tenants` via `drizzle-kit push`; `updateTenantSettings` estendido no padrão SPG-1; validação de 500 caracteres na action; campo em `TenantSettings` (`GET /api/v1/settings`) e no schema `Settings` do `openapi.yaml`.
**Where**: `src/db/schema.ts`, `src/server/data/index.ts`, `src/server/actions/settings.ts`, `src/server/integration/settings.ts`, `docs/integration/openapi.yaml`, testes de DAL/action/rota
**Depends on**: None
**Reuses**: exatamente o caminho de `agentPresentationMessage` (coluna nullable → `optionalTenantText` → action → serializer)
**Requirement**: PER-03

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `drizzle-kit push` aplicado sem perda (coluna nullable)
- [x] Chave ausente não toca; string vazia → `null`; valor grava — testado
- [x] > 500 caracteres → action rejeita **sem persistir**
- [x] `GET /api/v1/settings` inclui o campo (`null` quando não configurado) nos 2 tenants
- [x] Gate: `npx vitest run` verde (566)

**Tests**: integration
**Gate**: full
**Commit**: `feat(config): tom de voz do agente no schema, DAL e contrato`

---

### T4: Campo "Tom de voz e personalidade" em Configurações

**What**: `TextArea` opcional na seção "Persona do Agente SDR" com texto de ajuda explicando que descreve **jeito de falar**, não processo; contador/limite de 500 e mensagem de erro em pt-BR; persistência pela action do T3.
**Where**: `src/components/settings/settings-form.tsx`
**Depends on**: T3
**Reuses**: `SettingsSection`/`FormLayout` já usados na mesma seção; padrão de erro por campo do lote-2
**Requirement**: PER-03

**Tools**: MCP: Claude in Chrome (screenshot) · Skill: NONE

**Done when**:

- [x] Rodar `npx astryx component TextArea` antes de compor (regra do AGENTS.md)
- [x] Salvar persiste e reaparece ao recarregar; salvar vazio grava `null` (grava null coberto por teste de action no T3; persistência real confirmada por screenshot com reload)
- [x] Self-check Astryx: zero `<div>`, zero `style={{}}`, zero valor cru
- [x] **Screenshot real** da seção via Claude in Chrome contra `next start` em porta dedicada (produção) — porta 3101, confirmado salvo + reload
- [x] Gate Build verde (566 testes + lint + build)

**Tests**: unit (action já coberta no T3; sem teste novo de componente — padrão do repo)
**Gate**: build
**Commit**: `feat(config): campo de tom de voz na persona do agente`

---

### T5: `n8n/src/history.mjs` — janela de histórico

**What**: módulo puro com `selectHistoryWindow(messages, {maxMessages=20, sessionGapHours=12})` devolvendo `{ window, hasAgentMessage }`. Corte de sessão **antes** do teto (a ordem inversa produz janela que atravessa o intervalo).
**Where**: `n8n/src/history.mjs`, `n8n/src/__tests__/history.test.ts`
**Depends on**: None
**Reuses**: estilo dos módulos puros existentes (`gate.mjs`, `business-hours.mjs`): ESM sem import externo, JSDoc, tudo testável fora do n8n
**Requirement**: CTX-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Vazio → janela vazia, `hasAgentMessage:false`
- [x] 30 mensagens sem gap → últimas 20
- [x] Gap de 20h entre a 12ª e a 13ª de 30 → começa na 13ª (menos de 20 itens)
- [x] Gap na penúltima → janela de 1 item
- [x] `hasAgentMessage` derivado **da janela**, não da lista inteira (teste com agente só fora da janela)
- [x] Gate: `npx vitest run` verde (589)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agente): janela de historico de conversa`

---

### T6: `prompt.mjs` — persona, estilo e histórico

**What**: `buildPrompt` ganha `history` e o tom de voz do tenant e passa a montar as 5 seções do design (identidade · tom do tenant delimitado + reafirmação · regras de estilo · transparência invertida · formato), na ordem definida. Traz para o módulo a `formatInstruction` que hoje mora inline no `principal.ts`.
**Where**: `n8n/src/prompt.mjs`, `n8n/src/__tests__/prompt.test.ts`
**Depends on**: T5
**Reuses**: `AI_TRANSPARENCY_INSTRUCTION` (metade "nunca negar" preservada literalmente); `missingQualificationFields`
**Requirement**: PER-01, CTX-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Contém a proibição do molde "confirmação → concordância → pergunta" e a proibição de emoji (asserção por trecho citável)
- [x] Contém o tom de voz quando o tenant tem; **não** contém o bloco nem placeholder quando é `null`
- [x] Com `hasAgentMessage:true` → contém "não se apresente de novo"; com `false` → não contém
- [x] Histórico renderizado com `lead:` / `você:` em ordem crescente
- [x] Não instrui a se apresentar como "assistente virtual"/"IA"/"robô"; **mantém** a regra de nunca negar quando perguntado
- [x] Instrui uma pergunta por turno e proíbe listar os campos faltantes para o lead
- [x] Gate: `npx vitest run` verde (589)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agente): persona humanizada e historico no prompt`

---

### T7: `validate-llm.mjs` — saída multi-mensagem

**What**: `mensagens` entra na whitelist de topo e `resposta` sai; regra de 1–3 strings não vazias com rejeição **total** fora disso; resultado `ok:true` carrega `mensagens` e `resposta = mensagens.join(" ")` derivado (para `executiveSummary`).
**Where**: `n8n/src/validate-llm.mjs`, `n8n/src/__tests__/validate-llm.test.ts`
**Depends on**: T6
**Reuses**: whitelist/rejeição total já estabelecida no arquivo (AD-014)
**Requirement**: PER-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] 1, 2 e 3 mensagens aceitas; `[]`, 4 itens, item vazio, item não-string, `mensagens` ausente → rejeitados com `reason` específico
- [x] `resposta` derivada correta e **não aceita** vinda do modelo (campo não whitelisted)
- [x] Testes existentes de `acao`/`campos`/`motivoEscalonamento` continuam passando sem enfraquecimento
- [x] Gate: `npx vitest run` verde (599)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agente): validacao de saida com multiplas mensagens`

---

### T8: Seed sem "assistente virtual"

**What**: reescrever as mensagens de apresentação dos 2 tenants e as conversas mockadas no novo padrão (apresenta nome + imobiliária, sem "assistente virtual"/"IA"/"robô"), e semear `agentVoiceTone` distinto por tenant.
**Where**: `src/db/seed.ts`, `src/db/__tests__/seed.test.ts`
**Depends on**: T3, T7
**Reuses**: estrutura de conversas do seed atual (nenhuma mudança de forma, só de texto)
**Requirement**: PER-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Nenhuma ocorrência de "assistente virtual"/"agente virtual"/"robô" nas mensagens semeadas (teste que varre o texto semeado)
- [x] `agentPresentationMessage` continua presente e distinto entre tenants (assertions existentes intactas)
- [x] `agentVoiceTone` semeado e distinto nos 2 tenants
- [x] Gate: `npx vitest run` verde (601)

**Tests**: integration
**Gate**: full
**Commit**: `chore(seed): conversas e apresentacao sem rotulo de assistente virtual`

---

### T9: Fluxo — nó de histórico, prompt e schema de saída

**What**: em `principal.ts`: nó `HTTP: GET /leads/{id}/messages?limit=20` na rota `conversa` (entre settings e context, `onError: continueRegularOutput` + `alwaysOutputData`); `Code: montar prompt` passa a inlinar `history.mjs`, selecionar a janela e chamar `buildPrompt` com histórico e tom de voz; `formatInstruction` inline removida (veio para `prompt.mjs` no T6); os dois `outputParser` trocam `resposta` por `mensagens` (array 1–3); todos os `Code: finalizar *` emitem `mensagens`.
**Where**: `n8n/workflows/principal.ts`
**Depends on**: T7
**Reuses**: convenção de referência nomeada por checkpoint documentada no topo do arquivo; `__INLINE(...)__`
**Requirement**: CTX-01, PER-01, PER-02

**Tools**: MCP: NONE (instância fora do ar) · Skill: NONE

**Done when**:

- [x] Nó de histórico presente com `limit=20` e degradação para vazio quando falha
- [x] Nenhum nó lê o histórico ou o prompt por `$json` encadeado após um nó HTTP (referência nomeada, regra do arquivo)
- [x] Os 2 schemas de output parser mudados **juntos** (tentativa 1 e 2)
- [x] Rotas de resposta fixa (mídia, opt-out, indisponível, esclarecimento) emitem `mensagens: [texto]`
- [x] Sem `function`/arrow no nível do arquivo (restrição do parser do SDK)
- [x] Gate: `npx vitest run` verde (piso mantido — 601)

**Tests**: unit (módulos inlinados já cobertos em T5–T7; sem teste de workflow — instância indisponível)
**Gate**: full
**Commit**: `feat(agente): historico e saida multi-mensagem no fluxo principal`

---

### T10: Fluxo — envio sequencial das mensagens do turno

**What**: substituir o envio único pela cadeia de 3 estágios do design (send → register → IF existe próxima → Wait 2s → …), com `prepClear` recebendo os 3 caminhos numa única declaração de wiring de saída; regenerar `n8n/generated/`.
**Where**: `n8n/workflows/principal.ts`, `n8n/generated/`
**Depends on**: T9
**Reuses**: `Code: destinatário do envio` como checkpoint único de leitura (correção de `7041a78`/`006e789`); regra de fan-in declarado uma vez
**Requirement**: PER-02

**Tools**: MCP: NONE (instância fora do ar) · Skill: NONE

**Done when**:

- [x] Cada envio lê `mensagens[i]` do checkpoint nomeado, nunca de `$json` pós-HTTP
- [x] Cada registro no CRM usa o `externalId` do **seu** envio e o texto da **sua** mensagem
- [x] Nenhum ciclo no grafo; `prepClear` com wiring de saída declarada uma única vez
- [x] `n8n/generated/` regenerado e commitado; diff contra a instância fica no Runbook (não é gate)
- [x] Gate Build verde (`vitest` 601 + `lint` + `build`)

**Tests**: unit (piso mantido)
**Gate**: build
**Commit**: `feat(agente): envio sequencial das mensagens do turno`

---

### T11: Chats — bolhas à direita e cabeçalhos fixos

**What**: inverter o mapeamento de remetente em `message-thread.tsx` (agente → `user`/`filled`; lead → `assistant`/`ghost` com avatar e nome) e recompor `app/(crm)/chats/page.tsx` com `Layout height="fill"` + `LayoutHeader` + `LayoutPanel isScrollable` + `LayoutContent` com `<StackItem size="fill" isScrollable>`.
**Where**: `app/(crm)/chats/page.tsx`, `src/components/chats/message-thread.tsx`
**Depends on**: None
**Reuses**: `buildChatThread` (inalterado — agrupamento independe do lado)
**Requirement**: UI-01

**Tools**: MCP: Claude in Chrome (screenshot) · Skill: NONE

**Done when**:

- [x] Testes de `chat-thread.ts` seguem verdes sem alteração (prova de que o agrupamento não foi tocado)
- [x] **Screenshot real** com conversa longa rolada até o fim: "Chats", cabeçalho do lead e lista de conversas visíveis; bolhas do agente à direita
- [x] Sem rolagem horizontal nem rolagem da página inteira (confirmado via DOM: `scrollWidth`/`scrollHeight` == `clientWidth`/`clientHeight`, sem overflow)
- [x] Estado vazio (nenhuma conversa selecionada) preservado
- [x] Self-check Astryx
- [x] Gate Build verde

**Tests**: unit (regressão de `chat-thread`)
**Gate**: build
**Commit**: `fix(chats): mensagens do agente a direita e cabecalhos fixos`

---

### T12: Ícone colorido por tipo de arquivo + card de Documentos

**What**: `src/lib/file-type.ts` (`resolveFileKind`, puro, mapa literal) + `src/components/documents/file-type-icon.tsx` (chip `Card variant={hue}` + ícone `text-<hue>-vivid`, padrão do `kpi-tiles.tsx`); card de Configurações recomposto: chip no `startContent`, categoria como `Token` colorido, contagens como `Badge` por modalidade. A página passa a carregar `getDocumentCategories` na mesma `Promise.all`.
**Where**: `src/lib/file-type.ts`, `src/lib/__tests__/file-type.test.ts`, `src/components/documents/file-type-icon.tsx`, `app/(crm)/configuracoes/page.tsx`
**Depends on**: None
**Reuses**: `getDocumentCategories` (existente, tenant-scoped); cores de modalidade da `documents-table.tsx`; chip de ícone do dashboard
**Requirement**: UI-02

**Tools**: MCP: Claude in Chrome (screenshot) · Skill: NONE

**Done when**:

- [x] `resolveFileKind` cobre PDF, DOCX, XLSX, PPTX, imagem, OpenDocument e desconhecido → `generico`
- [x] Mapa de classe é **literal** por kind (Tailwind v4 não gera utility de string interpolada — AD-012)
- [x] Estado vazio do card preservado; "Sem categoria" preservado
- [x] **Screenshot real** de Configurações com o seed (PDF + DOCX + categorias distintas)
- [x] Self-check Astryx
- [x] Gate Build verde

**Tests**: unit
**Gate**: build
**Commit**: `feat(documentos): icone colorido por tipo no card de configuracoes`

---

### T13: Tabela de Documentos + fechamento do lote

**What**: coluna Nome da `documents-table.tsx` passa a usar o chip do T12; gate final completo; rastreabilidade de `spec.md`/`tasks.md` atualizada honestamente (incluindo o que ficou no Runbook pós-hospedagem).
**Where**: `src/components/documents/documents-table.tsx`, `.specs/features/lote-6b-persona-e-lapidacao/spec.md`, `.specs/features/lote-6b-persona-e-lapidacao/tasks.md`
**Depends on**: T12
**Reuses**: `FileTypeIcon` do T12 (uma definição, duas telas)
**Requirement**: UI-02

**Tools**: MCP: Claude in Chrome (screenshot) · Skill: NONE

**Done when**:

- [x] Colunas, ações, filtros e testes existentes da tabela intactos
- [x] **Screenshot real** da página Documentos com tipos distintos
- [x] Gate Build final verde (`npx vitest run` + `npm run lint` + `npm run build`), piso 612 (601 + 11 novos de `file-type.test.ts`)
- [x] `spec.md` e `tasks.md` refletem o que foi de fato provado — nada de n8n publicado/testado na instância é marcado como verificado
- [x] Runbook pós-hospedagem revisado e ainda correto

**Tests**: unit (regressão)
**Gate**: build
**Commit**: `feat(documentos): icone colorido por tipo na tabela e fechamento do lote`
