# Prompt de Execução — Lote 2 / Fases 2+3 (Configurações + Documentos)

> Cole o bloco abaixo numa nova janela do Claude Code aberta na raiz do projeto (`crivo/`).

---

Ative a skill `tlc-spec-driven` e rode APENAS a fase **Execute** da feature `lote-2-configuracoes-documentos`. Todo o planejamento já está aprovado — não refaça Specify/Design/Tasks e não me peça re-aprovação deles.

## Contexto aprovado (leia nesta ordem antes de executar)
1. `.specs/STATE.md` — decisões ativas AD-001..AD-007 (constraints de projeto) e Handoff.
2. `.specs/features/lote-2-configuracoes-documentos/tasks.md` — 11 tasks em 2 fases, Test Coverage Matrix e Gate Check Commands (autoritativos).
3. `.specs/features/lote-2-configuracoes-documentos/spec.md` — ACs = fonte de verdade dos testes (CONF-01..04, DOC-01..07).
4. `.specs/features/lote-2-configuracoes-documentos/design.md` — escritas na DAL, actions só orquestram, upload metadata-only (binário nunca sai do browser), filtros via URL searchParams.
5. `.specs/features/lote-2-configuracoes-documentos/context.md` — decisões do discuss (metadata-only, categorias planas, sem preview, modalidade não afeta documentos).

## Modo de execução (já decidido por mim — não pergunte de novo)
Uso de sub-agentes: **2 batch workers sequenciais + 1 Verifier**, conforme o Phase Execution Map do tasks.md:
- **Batch Worker 1** → Phase 1 (T1→T2→T3→T4→T5→T6): schema + seed + DAL leituras + validação + DAL escritas + actions
- **Batch Worker 2** → Phase 2 (T7→T8→T9→T10→T11): tela Configurações + tela Documentos (listagem, upload, edição/exclusão/categorias) + fechamento (só inicia após o summary completo do Batch 1)
- **Verifier** (automático após o último commit): validação spec-anchored + discrimination sensor, escreve `validation.md`. Loop fix→re-verify limitado a 3 iterações.

Você é o ORQUESTRADOR: despacha cada worker com o payload da skill (tasks do batch + matrix + gates + spec/design/context + coding-principles), recebe o summary compacto, atualiza o status no tasks.md e só então despacha o próximo. Workers não spawnam sub-agentes. Se um gate falhar, o worker para e você decide corrigir/escalar antes do próximo batch.

## Contrato por task (inegociável)
Testes derivados da spec (nunca da implementação); gate verde antes de done (comandos exatos do tasks.md); 1 commit atômico por task com a mensagem definida no tasks.md, `git add` apenas dos arquivos da task (nunca `-A`; não commitar `.specs/` nem `.claude/`), trailer:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Nunca enfraquecer/deletar/skipar testes. Base atual: 27 testes — nenhum pode sumir.

## Restrições críticas do ambiente (repasse aos workers)
1. **Arquivo de env BLOQUEADO**: um hook do projeto NEGA qualquer comando shell que mencione o nome do arquivo de variáveis (ponto-env). Nunca ler/cat/copiar/referenciar esse arquivo em comando shell. A `DATABASE_URL` JÁ ESTÁ configurada (Neon Postgres). Código que precise dela carrega internamente (`import 'dotenv/config'` — padrão já usado em drizzle.config.ts/seed/vitest). NUNCA imprimir a URL/senha em logs, outputs ou commits.
2. **Next.js 16.2.11 tem breaking changes** (regra do AGENTS.md): antes de escrever qualquer código Next, consultar o guia relevante em `node_modules/next/dist/docs/` — em especial `revalidatePath`/router cache para o reflexo do nome no header (CONF-03; fallback previsto no design: `router.refresh()` após action OK) e o contrato de `searchParams` em páginas RSC.
3. **Astryx (AD-005)**: consultar `.specs/features/fase-1-fundacao/astryx-catalog.md` (catálogo já salvo) e rodar `npx astryx template settings`, `npx astryx template file-explorer`, `npx astryx component FileInput`, `npx astryx template DialogFormDialog`, `npx astryx template TableInlineFilterTable` / `PowerSearchSearchWithTable` ANTES de construir as telas (T7–T10). Self-check Astryx obrigatório ao fim de cada task de UI (sem `<div>`/`style` cru, tokens sempre).
4. **Convenção de imports da Fase 1 (o Verifier checa)**: nenhum `import` de `src/db` fora de `src/db/*` e `src/server/data/*`. Toda escrita entra na DAL; actions só orquestram (validação + DAL + revalidate). Tenant SEMPRE do cookie no servidor — nenhuma action aceita `tenantId` do client.
5. **Upload metadata-only**: o binário do arquivo NUNCA é enviado ao servidor nem armazenado — o client extrai `name/type/size` e a action recebe apenas metadados. Nenhuma coluna de conteúdo é criada.
6. **Schema (T1)**: unique index case-insensitive em (`tenant_id`, `lower(name)`) para categorias — verificar sintaxe do drizzle instalado (`uniqueIndex().on(sql\`lower(...)\`)`); FK `documents.category_id` com `ON DELETE SET NULL`.
7. **Testes de integração rodam contra o Neon real seedado** (padrão da Fase 1): `npm run db:seed` garante estado canônico; testes de escrita criam registros próprios e não dependem de ordem.
8. Windows 11; scripts npm cross-platform.

## Ao final
1. Verifier PASS + `.specs/features/lote-2-configuracoes-documentos/validation.md` escrito.
2. Atualizar tasks.md (Status: Done) e a rastreabilidade no spec.md (CONF-01..04, DOC-01..07 → Verified).
3. Atualizar SOMENTE a seção `## Handoff` do `.specs/STATE.md` (nunca tocar `## Decisions`).
4. Reportar: resumo por batch (commits + testes), veredito do Verifier, e o que testar manualmente nas duas telas (`npm run build && npm run start` → `/configuracoes`, `/documentos`).
