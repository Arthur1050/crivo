# Prompt de Execução — Redesign CRM com Astryx

> Cole o bloco abaixo numa nova janela do Claude Code aberta na raiz do projeto (`crivo/`).

---

Ative a skill `tlc-spec-driven` e rode APENAS a fase **Execute** da feature `redesign-crm-astryx`. Todo o planejamento já está aprovado — não refaça Specify/Design/Tasks e não me peça re-aprovação deles.

## Contexto aprovado (leia nesta ordem antes de executar)
1. `.specs/STATE.md` — decisões ativas AD-001..AD-010 (constraints de projeto) e Handoff.
2. `.specs/features/redesign-crm-astryx/tasks.md` — 11 tasks em 3 phases, Test Coverage Matrix e Gate Check Commands (autoritativos).
3. `.specs/features/redesign-crm-astryx/spec.md` — ACs = fonte de verdade dos testes (RD-01..RD-08); paridade funcional é requisito, não sugestão.
4. `.specs/features/redesign-crm-astryx/design.md` — **§ Referência Visual (R0–R5) é a fonte de verdade do layout**: as imagens de referência do usuário NÃO existem como arquivo; a transcrição textual é autoritativa. Fidelidade de composição/hierarquia com tokens Astryx — nunca de pixel/cor crua.
5. `.specs/features/redesign-crm-astryx/context.md` — decisões do discuss (colunas aditivas de tenant; usuário mock; status "Online" fixo + persona editável; paridade funcional).

## Modo de execução (já decidido por mim — não pergunte de novo)
Uso de sub-agentes: **2 batch workers sequenciais + 1 Verifier**, conforme o Phase Execution Map do tasks.md:
- **Batch Worker 1** → Phases 1–2 (T1→T7): colunas/seed/mockManager + DAL + shell SideNav-only + pipeline (header/colunas/cards) + dashboard (KPIs/grid/recentes)
- **Batch Worker 2** → Phase 3 (T8→T11): documentos + chats + configurações + smoke final (só inicia após o summary completo do Batch 1)
- **Verifier** (automático após o último commit): validação spec-anchored + discrimination sensor, escreve `validation.md`. Loop fix→re-verify limitado a 3 iterações.

Você é o ORQUESTRADOR: despacha cada worker com o payload da skill (tasks do batch + matrix + gates + spec/design/context), recebe o summary compacto, atualiza o status no tasks.md e só então despacha o próximo. Workers não spawnam sub-agentes. Se um gate falhar, o worker para e você decide corrigir/escalar antes do próximo batch.

## Contrato por task (inegociável)
Testes derivados da spec (nunca da implementação); gate verde antes de done (comandos exatos do tasks.md); 1 commit atômico por task com a mensagem definida no tasks.md, `git add` apenas dos arquivos da task (nunca `-A`; não commitar `.specs/` nem `.claude/` — exceção: T11 commita o spec.md/tasks.md da feature, como nos lotes 3–4), trailer:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Nunca enfraquecer/deletar/skipar testes. Base atual: **200 testes** — nenhum pode sumir; asserções de consumidores da DAL só podem ser substituídas por equivalentes ou mais fortes.

## Restrições críticas do ambiente (repasse aos workers)
1. **Arquivo de env BLOQUEADO**: um hook do projeto NEGA qualquer comando shell que mencione o nome do arquivo de variáveis (ponto-env). Nunca ler/cat/copiar/referenciar esse arquivo em comando shell. A `DATABASE_URL` JÁ ESTÁ configurada (Neon Postgres). Código que precise dela carrega internamente (`import 'dotenv/config'`). NUNCA imprimir a URL/senha em logs, outputs ou commits.
2. **Next.js 16.2.11 tem breaking changes** (regra do AGENTS.md): antes de escrever qualquer código Next, consultar o guia relevante em `node_modules/next/dist/docs/`.
3. **Astryx (AD-005/AD-010)**: workflow discover-don't-guess OBRIGATÓRIO — antes de cada task de UI, rodar os comandos `npx astryx component <X>` / `npx astryx template <t>` listados na própria task (scaffolds SÓ em `scratch/`, git-ignored — NUNCA sobre o app). Self-check Astryx do AGENTS.md ao fim de CADA task de UI: sem `<div>`/`<span>` de layout, sem `style={{}}`, sem hex/px cru, sem componente/prop não verificado. Pontos de API sinalizados no design (Risks): `SideNavHeading`+`NavHeadingMenu` (T3) e família Chat (T9) — verificar via CLI antes de codar; fallback do switcher: DropdownMenu no heading.
4. **Ícones: SÓ Lucide-Animated** (AD-008) via `npx shadcn@latest add "https://lucide-animated.com/r/<nome>.json"` em `src/components/icons/`. Se um nome não existir no registry, usar o equivalente mais próximo — nunca SVG ad-hoc. Ícones são client components (folhas na árvore RSC).
5. **Gráficos: Recharts tematizado via `useTheme`** (AD-009) — `VolumeChart`/`DistributionChart` NÃO mudam de lib nem de cálculo; no T7 eles apenas ganham Cards/grid em volta.
6. **Migração**: `drizzle-kit push` (repo sem pasta de migrations — desvio pré-autorizado no design, mesmo padrão L3/L4). Colunas novas SEMPRE nullable; seed preenche.
7. **RSC-first (AD-007)**: tenant SEMPRE do cookie no servidor; dados do layout para a Sidebar client atravessam a fronteira serializados (sem Date/bigint crus). Nenhuma server action nova além da extensão de `updateTenantSettings`.
8. **Vitest**: `npx vitest run` sem flags (`fileParallelism: false` já configurado). Testes de DAL criam tenant/leads PRÓPRIOS com datas absolutas controladas — nunca dependem do seed nem de `new Date()`.
9. **Paridade funcional é AC**: nenhuma feature nova (sem drag-and-drop, sem sidebar colapsável, sem filtros novos). Painel de detalhe do lead, dialogs de documentos, filtro de período e navegação de chats ficam funcionalmente intocados.
10. Windows 11; scripts npm cross-platform.

## Ao final
1. Verifier PASS + `.specs/features/redesign-crm-astryx/validation.md` escrito.
2. Atualizar tasks.md (Status: Done) e a rastreabilidade no spec.md (RD-01..RD-08 → Verified).
3. Atualizar SOMENTE a seção `## Handoff` do `.specs/STATE.md` (nunca tocar `## Decisions`).
4. Reportar: resumo por batch (commits + testes), veredito do Verifier, e o que testar manualmente (`npm run build && npm run start` → 5 rotas nos 2 tenants; conferir contra design.md § Referência Visual: sidebar R0 com troca de tenant, pipeline R1 com lead completo e lead esparso, dashboard R2 com presets, documentos R3 com upload/edição, configurações R4 salvando campos novos e refletindo na sidebar, chats R5 com divisor de data).
