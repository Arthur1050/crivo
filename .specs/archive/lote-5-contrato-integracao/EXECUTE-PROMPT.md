# Prompt de Execução — Lote 5: Contrato de Integração CRM ↔ Agente

> Cole o bloco abaixo numa nova janela do Claude Code aberta na raiz do projeto (`crivo/`).

---

Ative a skill `tlc-spec-driven` e rode APENAS a fase **Execute** da feature `lote-5-contrato-integracao`. Todo o planejamento já está aprovado — não refaça Specify/Design/Tasks e não me peça re-aprovação deles.

## Contexto aprovado (leia nesta ordem antes de executar)
1. `.specs/STATE.md` — decisões ativas AD-001..AD-012 (constraints de projeto) e Handoff.
2. `.specs/features/lote-5-contrato-integracao/tasks.md` — 11 tasks em 4 phases, Test Coverage Matrix e Gate Check Commands (autoritativos).
3. `.specs/features/lote-5-contrato-integracao/spec.md` — ACs = fonte de verdade dos testes (INT-01..INT-08, LGPD-01..LGPD-02); Assumptions já assinadas (idempotência por `externalId`, problem+json, TTL via cron, opt-out por endpoint).
4. `.specs/features/lote-5-contrato-integracao/design.md` — arquitetura service layer + handlers finos; tabela `TRANSITIONS`; Data Models (colunas/tabela novas); Error Handling (códigos estáveis); Test Strategy.
5. `.specs/features/lote-5-contrato-integracao/context.md` — decisões do discuss: REST por recurso, API key por tenant, shape completo com `content` mockado, só-avanço+escalar, humano vence (409), upsert completo, desacoplamento para futuro microserviço.

## Modo de execução (já decidido por mim — não pergunte de novo)
Uso de sub-agentes: **2 batch workers sequenciais + 1 Verifier**, conforme o Phase Execution Map do tasks.md:
- **Batch Worker 1** → Phases 1–2 (T1→T6): schema/seed (api keys, external ids, opt-out) + problem/auth + parsers + POST /leads idempotente + regras de estado/trava humana + PATCH /leads/{id}
- **Batch Worker 2** → Phases 3–4 (T7→T11): mensagens + contexto + LGPD (TTL/opt-out/indicador) + OpenAPI/guia + smoke fim-a-fim (só inicia após o summary completo do Batch 1)
- **Verifier** (automático após o último commit): validação spec-anchored + discrimination sensor, escreve `validation.md`. Loop fix→re-verify limitado a 3 iterações.

Você é o ORQUESTRADOR: despacha cada worker com o payload da skill, recebe o summary compacto, atualiza o status no tasks.md e só então despacha o próximo. Workers não spawnam sub-agentes. Se um gate falhar, o worker para e você decide corrigir/escalar antes do próximo batch.

## Contrato por task (inegociável)
Testes derivados da spec (nunca da implementação); gate verde antes de done (comandos exatos do tasks.md); 1 commit atômico por task com a mensagem definida no tasks.md, `git add` apenas dos arquivos da task (nunca `-A`; não commitar `.specs/` nem `.claude/` — exceção: T11 commita o spec.md/tasks.md da feature, como nos lotes 3–4; como `.specs` agora está no `.gitignore`, essa exceção exige `git add -f` nesses 2 arquivos), trailer:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Nunca enfraquecer/deletar/skipar testes. Base atual: **261 testes** — nenhum pode sumir; asserções existentes só podem ser substituídas por equivalentes ou mais fortes.

## Restrições críticas do ambiente (repasse aos workers)
1. **Arquivo de env BLOQUEADO**: um hook do projeto NEGA qualquer comando shell que mencione o nome do arquivo de variáveis (ponto-env). Nunca ler/cat/copiar/referenciar esse arquivo em comando shell. A `DATABASE_URL` JÁ ESTÁ configurada (Neon Postgres). Código que precise dela carrega internamente (`import 'dotenv/config'`). NUNCA imprimir a URL/senha em logs, outputs ou commits. As chaves de API que o seed do T1 imprimir também NUNCA vão para commit/arquivo versionado.
2. **Next.js 16.2.11 tem breaking changes** (regra do AGENTS.md): antes de escrever route handlers, consultar `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (handlers = Web Request/Response; `params` é Promise) e `dynamic-routes.md` (precedência estática > catch-all).
3. **Novas rotas ficam FORA do padrão de telas**: `/api/v1/*` (contrato) e `/api/cron/*` (manutenção). Nenhuma tela do CRM muda além do que o tasks.md manda: action do Kanban registra ator `humano` (T5) e indicador de opt-out no detalhe do lead (T9). A prova do lote é exatamente as telas NÃO mudarem e refletirem escrita via API.
4. **Astryx (AD-005/AD-010/AD-011/AD-012)**: só o T9 toca UI — verificar `npx astryx component Token` (e StatusDot se preciso) antes de codar; self-check Astryx ao final (sem `<div>`/`style={{}}`/hex cru); ícones só `lucide-react` (AD-011).
5. **Migração**: `drizzle-kit push` (padrão L3/L4). Colunas novas SEMPRE nullable/aditivas; unique indexes PARCIAIS (`WHERE ... IS NOT NULL`) para não conflitar com dado do seed antigo. Atenção ao quirk conhecido: o push pode recriar o índice por expressão de `document_categories` — confirmar que não sobra resíduo.
6. **RSC-first (AD-007)**: as rotas de API NÃO usam cookie de tenant — tenant vem EXCLUSIVAMENTE da API key (design § auth). `tenant_id` jamais é aceito em payload.
7. **Vitest**: `npx vitest run` sem flags (`fileParallelism: false` já configurado). Todo teste novo cria os PRÓPRIOS dados (tenant/lead/chave próprios; `externalId` = `crypto.randomUUID()`; datas absolutas controladas) — nunca depender do snapshot do seed (higiene: `mutations.test.ts`/`actions.test.ts` já sujam o banco; rodar `npm run db:seed` antes de smoke).
8. **Handlers de rota são testados como FUNÇÕES** (`POST(new Request("http://local/api/v1/leads", {...}))`) — sem servidor HTTP nos testes; o smoke do T11 é o único que sobe `next start` (build de produção, porta dedicada ex.: `:3100`).
9. **Screenshot obrigatório no T11** (regra de memória do usuário): extensão **Claude in Chrome** (`mcp__claude-in-chrome__*`) contra `next start` próprio — o painel Browser embutido não composita quando oculto. Validar em build de produção (em dev o indicador do Next sobrepõe o rodapé da sidebar e parece bug).
10. **Única devDependency nova autorizada**: `@apidevtools/swagger-parser` (T10). Nenhuma dependência de runtime nova.
11. Windows 11; scripts npm cross-platform; PowerShell 5.1 (sem `&&`).

## Ao final
1. Verifier PASS + `.specs/features/lote-5-contrato-integracao/validation.md` escrito.
2. Atualizar tasks.md (Status: Done) e a rastreabilidade no spec.md (INT-01..INT-08, LGPD-01..LGPD-02 → Verified).
3. Atualizar SOMENTE a seção `## Handoff` do `.specs/STATE.md` (nunca tocar `## Decisions` — exceto se o Execute consolidar a decisão candidata do design: problem+json como padrão de erro de API externa → aí registrar como novo AD-NNN).
4. Reportar: resumo por batch (commits + testes), veredito do Verifier, onde as chaves de API do seed foram impressas (sem repetir os valores), e o que testar manualmente: fluxo curl/Invoke-RestMethod de exemplo (criar lead → qualificar → escalar → mensagens → opt-out → contexto), conferindo Kanban/Chats nos 2 tenants e o indicador de opt-out.
