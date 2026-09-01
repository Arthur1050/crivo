# Prompt de Execução — Lote 6: Agente n8n + WhatsApp

> Cole o bloco abaixo numa nova janela do Claude Code aberta na raiz do projeto (`crivo/`).
> **Antes de colar, confira na janela nova**: MCP do **n8n** conectado (obrigatório no Batch 2) e extensão **Claude in Chrome** ativa (screenshots do T2/T13).

---

Ative a skill `tlc-spec-driven` e rode APENAS a fase **Execute** da feature `lote-6-agente-n8n-whatsapp`. Todo o planejamento já está aprovado — não refaça Specify/Design/Tasks e não me peça re-aprovação deles.

## Contexto aprovado (leia nesta ordem antes de executar)
1. `.specs/STATE.md` — decisões ativas AD-001..AD-014 (a AD-014 é nova e rege este lote: workflow-as-code; efeito colateral nunca decidido autonomamente por LLM) e Handoff.
2. `.specs/features/lote-6-agente-n8n-whatsapp/tasks.md` — 13 tasks em 4 phases, Test Coverage Matrix e Gate Check Commands (autoritativos).
3. `.specs/features/lote-6-agente-n8n-whatsapp/spec.md` — ACs = fonte de verdade dos testes (AGT-01..09, INT-09, CONF-05, LGPD-03); Assumptions todas assinadas.
4. `.specs/features/lote-6-agente-n8n-whatsapp/design.md` — Abordagem A (determinística); pipeline de nós; Data Models (Data Tables, `LlmTurnOutput`, response do `/settings`); Error Handling; Risks R1–R7; Tech Decisions (TZ `America/Sao_Paulo`, 2 templates Meta, e-mail do lead só no Calendar, Calendar ANTES do PATCH de status).
5. `.specs/features/lote-6-agente-n8n-whatsapp/context.md` — decisões do discuss (número de teste Meta; Gemini com nó isolado; API em produção na Vercel; memória n8n sincronizada; agendamento com Calendar+Meet+convite opcional+lembrete; workflow versionado).
6. `docs/integration/guia-integracao.md` + `docs/integration/openapi.yaml` — o contrato que o fluxo consome (idempotência §2, transições/trava §3, opt-out §4, limites §6).

## Modo de execução (já decidido por mim — não pergunte de novo)
Uso de sub-agentes: **2 batch workers sequenciais + 1 Verifier**, conforme o Phase Execution Map do tasks.md:
- **Batch Worker 1** → Phases 1–2 (T1→T8): CRM (colunas de horário comercial + tela de Configurações + `GET /api/v1/settings` + openapi/guia) + camada de decisão pura em `n8n/src/` com fixtures (normalize, gate/opt-out, business-hours/24h, prompt/validate-llm).
- **Batch Worker 2** → Phases 3–4 (T9→T13): pipeline workflow-as-code (`scripts/n8n-inline.mjs` + runbook) + 3 workflows publicados via MCP + conectividade Meta real + smoke fim-a-fim (só inicia após o summary completo do Batch 1).
- **Verifier** (automático após o último commit): validação spec-anchored + discrimination sensor, escreve `validation.md`. Loop fix→re-verify limitado a 3 iterações.

Você é o ORQUESTRADOR: despacha cada worker com o payload da skill, recebe o summary compacto, atualiza o status no tasks.md e só então despacha o próximo. Workers não spawnam sub-agentes.

## Pré-requisitos com passo HUMANO (pausar e me pedir quando chegar neles)
O Batch 2 (T12) depende de ações que só EU faço. O T9 escreve o runbook (`n8n/README.md`) com o passo-a-passo; ao chegar no T12, PARE e me peça para executar o runbook antes de continuar:
1. Credencial **WhatsApp Trigger** na instância n8n (App ID + App Secret do app Meta — o nó registra/verifica o webhook sozinho; NÃO inventar verify-token manual).
2. Credencial **WhatsApp** de envio (access token **permanente de System User** — NUNCA o token temporário de 23h do painel [Risk R2] — + phone number ID do número de teste).
3. Credencial **Google Calendar** (minha conta Google).
4. Submissão das 2 templates Meta (`lembrete_reuniao`, `reengajamento`) — aprovação da Meta pode demorar; T12 valida.
5. Confirmar na Vercel: `DATABASE_URL` (Neon) e `CRON_SECRET` setados; banco de produção seedado; as API keys em `tenant_config` = as impressas pelo seed DESSE banco.

## Contrato por task (inegociável)
Testes derivados da spec (nunca da implementação); gate verde antes de done (comandos exatos do tasks.md); 1 commit atômico por task com a mensagem definida no tasks.md, `git add` apenas dos arquivos da task (nunca `-A`; não commitar `.specs/` nem `.claude/` — exceção: T13 commita o spec.md/tasks.md da feature via `git add -f`, padrão dos lotes 3–5), trailer:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Nunca enfraquecer/deletar/skipar testes. Base atual: **401 testes** — nenhum pode sumir; asserções existentes só podem ser substituídas por equivalentes ou mais fortes.

## Restrições críticas do ambiente (repasse aos workers)
1. **Arquivo de env BLOQUEADO**: hook do projeto NEGA comando shell que mencione o arquivo de variáveis (ponto-env). `DATABASE_URL` já está configurada; código carrega via `import 'dotenv/config'`. NUNCA imprimir URL/senha/API keys em logs, outputs ou commits — as chaves de tenant vivem só na Data Table `tenant_config` da instância (Risk R1, aceito no piloto) e no output único do seed.
2. **Next.js 16.2.11 breaking changes** (AGENTS.md): antes do route handler do T3, consultar `node_modules/next/dist/docs/.../route.md` (handlers Web Request/Response; `params` é Promise).
3. **n8n é workflow-as-code (AD-014)**: OBRIGATÓRIO `get_sdk_reference` + `get_workflow_best_practices` (chatbot/scheduling já pesquisados no design) + `get_node_types` de TODOS os nós antes de escrever `n8n/workflows/*.ts`. Publicação SEMPRE a partir de `n8n/generated/` (gerado por `scripts/n8n-inline.mjs`); UI do n8n nunca editada à mão; diff generated↔export da instância deve ser zero. Nunca acessar o Postgres do CRM direto do n8n — só via contrato.
4. **Saída de LLM nunca vira efeito sem validação** (AD-014): todo PATCH/evento/envio passa por `validate-llm.mjs`/gate — o Verifier vai atacar exatamente isso no sensor.
5. **Astryx (AD-005/010/011/012)**: só T2 toca UI — `npx astryx component`/`search` antes de compor a seção de horário; self-check ao final; ícones só `lucide-react`.
6. **Migração**: `drizzle-kit push`, colunas SEMPRE nullable/aditivas (T1). Atenção ao quirk do índice de `document_categories` (pode ser recriado — conferir que não sobra resíduo).
7. **Vitest**: `npx vitest run` sem flags. Teste novo cria os PRÓPRIOS dados; nunca depender do snapshot do seed; `npm run db:seed` antes de smoke (e coordenar rotação de chave com `tenant_config` — runbook).
8. **Screenshots obrigatórios (T2 e T13)**: extensão **Claude in Chrome** contra `next start` em porta dedicada (build de produção; painel Browser embutido não composita; em dev o indicador do Next parece bug de layout).
9. **API de produção**: `https://crivo-arthur1050s-projects.vercel.app` (proteção Vercel já ajustada para previews-only nesta sessão de planejamento; confirmado `401 problem+json` sem chave). O fluxo n8n aponta para ela.
10. **Timezone**: toda lógica de horário comercial/lembrete em `America/Sao_Paulo` (design, Tech Decisions).
11. **Dependências novas**: NENHUMA de runtime no CRM. Na camada `n8n/src/`, código puro sem dependências (roda no sandbox do Code node — sem rede, sem require de http).
12. Windows 11; scripts npm cross-platform; PowerShell 5.1 (sem `&&`).

## Ao final
1. Verifier PASS + `.specs/features/lote-6-agente-n8n-whatsapp/validation.md` escrito (incluindo evidência dos workflows: ids de execução MCP + diff generated↔instância).
2. Atualizar tasks.md (Status: Done) e a rastreabilidade no spec.md (AGT-01..09, INT-09, CONF-05, LGPD-03 → Verified).
3. Atualizar SOMENTE a seção `## Handoff` do `.specs/STATE.md` (nunca tocar `## Decisions` — a AD-014 já foi registrada no planejamento).
4. Reportar: resumo por batch (commits + testes), veredito do Verifier, estado da conectividade Meta (webhook verificado, templates aprovadas ou pendentes), links/ids do evento de Calendar do smoke, e o que testar manualmente: roteiro das 3 conversas no número de teste (qualificar→agendar / escalar / opt-out) conferindo Kanban, Chats, indicador de opt-out e o evento com link do Meet.
