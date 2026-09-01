# Prompt de Execução — Lote 4 / Fase 5 (Dashboard)

> Cole o bloco abaixo numa nova janela do Claude Code aberta na raiz do projeto (`crivo/`).

---

Ative a skill `tlc-spec-driven` e rode APENAS a fase **Execute** da feature `lote-4-dashboard`. Todo o planejamento já está aprovado — não refaça Specify/Design/Tasks e não me peça re-aprovação deles.

## Contexto aprovado (leia nesta ordem antes de executar)
1. `.specs/STATE.md` — decisões ativas AD-001..AD-009 (constraints de projeto) e Handoff.
2. `.specs/features/lote-4-dashboard/tasks.md` — 10 tasks em 3 phases, Test Coverage Matrix e Gate Check Commands (autoritativos).
3. `.specs/features/lote-4-dashboard/spec.md` — ACs = fonte de verdade dos testes (DASH-01..07, INFRA-01); a definição de P (leads com `firstContactAt` no período, limites UTC inclusivos) governa TODOS os cálculos.
4. `.specs/features/lote-4-dashboard/design.md` — RSC-first, `resolveDashboardPeriod` como fonte única do período, DAL com agregação em TS sobre 1 query, Recharts tematizado via `useTheme` (AD-009), baseline em colunas de `tenants`, riscos e mitigações.
5. `.specs/features/lote-4-dashboard/context.md` — decisões do discuss (presets 7/30/90 + range custom, baseline mockado no seed, tiles + gráficos, excluir nulos + base visível) e assumptions.

## Modo de execução (já decidido por mim — não pergunte de novo)
Uso de sub-agentes: **2 batch workers sequenciais + 1 Verifier**, conforme o Phase Execution Map do tasks.md:
- **Batch Worker 1** → Phase 1 (T1→T5): vitest `fileParallelism: false` + colunas de baseline + seed (baselines + datas espalhadas) + DAL de KPIs + DAL de série/distribuições
- **Batch Worker 2** → Phases 2–3 (T6→T10): resolução de período + charts Recharts + página com tiles + filtro integrado + smoke (só inicia após o summary completo do Batch 1)
- **Verifier** (automático após o último commit): validação spec-anchored + discrimination sensor, escreve `validation.md`. Loop fix→re-verify limitado a 3 iterações.

Você é o ORQUESTRADOR: despacha cada worker com o payload da skill (tasks do batch + matrix + gates + spec/design/context), recebe o summary compacto, atualiza o status no tasks.md e só então despacha o próximo. Workers não spawnam sub-agentes. Se um gate falhar, o worker para e você decide corrigir/escalar antes do próximo batch.

## Contrato por task (inegociável)
Testes derivados da spec (nunca da implementação); gate verde antes de done (comandos exatos do tasks.md); 1 commit atômico por task com a mensagem definida no tasks.md, `git add` apenas dos arquivos da task (nunca `-A`; não commitar `.specs/` nem `.claude/` — exceção: T10 commita o spec.md/tasks.md da feature, como no L3), trailer:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Nunca enfraquecer/deletar/skipar testes. Base atual: **146 testes** — nenhum pode sumir; T3 ATUALIZA asserções do seed por invariantes iguais ou mais fortes.

## Restrições críticas do ambiente (repasse aos workers)
1. **Arquivo de env BLOQUEADO**: um hook do projeto NEGA qualquer comando shell que mencione o nome do arquivo de variáveis (ponto-env). Nunca ler/cat/copiar/referenciar esse arquivo em comando shell. A `DATABASE_URL` JÁ ESTÁ configurada (Neon Postgres). Código que precise dela carrega internamente (`import 'dotenv/config'`). NUNCA imprimir a URL/senha em logs, outputs ou commits.
2. **Next.js 16.2.11 tem breaking changes** (regra do AGENTS.md): antes de escrever qualquer código Next, consultar o guia relevante em `node_modules/next/dist/docs/` — em especial `searchParams` como Promise em RSC (`/dashboard`) e navegação por query string no client (`PeriodFilter`).
3. **Astryx (AD-005/AD-009)**: rodar `npx astryx template dashboard` (scaffold SÓ em `scratch/astryx-dashboard/`, git-ignored — NUNCA sobre o app), `npx astryx hook useTheme`, `npx astryx component Card`/`Grid`, `npx astryx docs layout`/`tokens` ANTES das tasks de UI (T7–T9). Gráficos = **Recharts** (instalar versão atual, compat React 19) tematizado via `useTheme` — nenhum hex/px cru, nenhuma outra lib de gráfico (Shadcn NÃO é necessário). Self-check Astryx obrigatório ao fim de cada task de UI. Ícones: SÓ Lucide-Animated pela infra existente (`src/components/icons/`, AD-008).
4. **Vitest**: T1 adiciona `fileParallelism: false` — a partir daí os gates usam `npx vitest run` sem flag (antes de T1 commitado, usar `--no-file-parallelism`). Testes de DAL criam tenant/leads PRÓPRIOS com datas absolutas controladas e range explícito — nunca dependem do seed nem de `new Date()` (o design exige `now` injetável onde precisar).
5. **Convenção de imports da Fase 1 (o Verifier checa)**: nenhum `import` de `src/db` fora de `src/db/*` e `src/server/data/*`. Dashboard é 100% leitura — NENHUMA server action nova; tenant SEMPRE do cookie no servidor.
6. **Definição única de P**: `resolveDashboardPeriod` roda UMA vez na página; o mesmo `{from, to}` alimenta KPIs, série, distribuições e bases. Qualquer divergência entre tile e gráfico é bug de spec (Success Criteria).
7. **Serialização RSC → client**: datas atravessam a fronteira como ISO string (design — Risks); charts são `"use client"`.
8. **Seed determinístico em estrutura, relativo em âncora**: datas como `now − N dias` com N fixo por lead; invariantes de janela (7/30/90d) testadas no seed.test.ts.
9. Windows 11; scripts npm cross-platform.

## Ao final
1. Verifier PASS + `.specs/features/lote-4-dashboard/validation.md` escrito.
2. Atualizar tasks.md (Status: Done) e a rastreabilidade no spec.md (DASH-01..07, INFRA-01 → Verified).
3. Atualizar SOMENTE a seção `## Handoff` do `.specs/STATE.md` (nunca tocar `## Decisions`).
4. Reportar: resumo por batch (commits + testes), veredito do Verifier, e o que testar manualmente (`npm run build && npm run start` → `/dashboard` nos 2 tenants: presets 7/30/90, range custom via URL, URL inválida caindo no default, tiles com bases e baseline, gráficos com estados vazios).
