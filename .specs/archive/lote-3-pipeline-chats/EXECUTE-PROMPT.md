# Prompt de Execução — Lote 3 / Fases 4+6 (Pipeline + Chats) + Refinamentos

> Cole o bloco abaixo numa nova janela do Claude Code aberta na raiz do projeto (`crivo/`).

---

Ative a skill `tlc-spec-driven` e rode APENAS a fase **Execute** da feature `lote-3-pipeline-chats`. Todo o planejamento já está aprovado — não refaça Specify/Design/Tasks e não me peça re-aprovação deles.

## Contexto aprovado (leia nesta ordem antes de executar)
1. `.specs/STATE.md` — decisões ativas AD-001..AD-008 (constraints de projeto) e Handoff.
2. `.specs/features/lote-3-pipeline-chats/tasks.md` — 13 tasks em 4 fases, Test Coverage Matrix e Gate Check Commands (autoritativos).
3. `.specs/features/lote-3-pipeline-chats/spec.md` — ACs = fonte de verdade dos testes (PIPE-01..04, CHAT-01, CAT-01..02, UI-01..02, ICON-01..02).
4. `.specs/features/lote-3-pipeline-chats/design.md` — RSC-first com board client, seleção de conversa por searchParam, paleta de cor 1:1 com Token da Astryx, infra Lucide-Animated, riscos e fallbacks (LayoutPanel→Dialog; shadcn CLI→vendor manual).
5. `.specs/features/lote-3-pipeline-chats/context.md` — decisões do discuss (drag habilitado, painel lateral, paleta fixa, chats read-only) e assumptions.

## Modo de execução (já decidido por mim — não pergunte de novo)
Uso de sub-agentes: **2 batch workers sequenciais + 1 Verifier**, conforme o Phase Execution Map do tasks.md:
- **Batch Worker 1** → Phases 1–2 (T1→T8): schema de cor + seed + DAL + validação/actions + infra de ícones + retrofit Documentos/Configurações
- **Batch Worker 2** → Phases 3–4 (T9→T13): Pipeline (board, drag, painel) + Chats + fechamento (só inicia após o summary completo do Batch 1)
- **Verifier** (automático após o último commit): validação spec-anchored + discrimination sensor, escreve `validation.md`. Loop fix→re-verify limitado a 3 iterações.

Você é o ORQUESTRADOR: despacha cada worker com o payload da skill (tasks do batch + matrix + gates + spec/design/context + coding-principles), recebe o summary compacto, atualiza o status no tasks.md e só então despacha o próximo. Workers não spawnam sub-agentes. Se um gate falhar, o worker para e você decide corrigir/escalar antes do próximo batch.

## Contrato por task (inegociável)
Testes derivados da spec (nunca da implementação); gate verde antes de done (comandos exatos do tasks.md — Vitest SEMPRE com `--no-file-parallelism`); 1 commit atômico por task com a mensagem definida no tasks.md, `git add` apenas dos arquivos da task (nunca `-A`; não commitar `.specs/` nem `.claude/`), trailer:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Nunca enfraquecer/deletar/skipar testes. Base atual: **95 testes** — nenhum pode sumir.

## Restrições críticas do ambiente (repasse aos workers)
1. **Arquivo de env BLOQUEADO**: um hook do projeto NEGA qualquer comando shell que mencione o nome do arquivo de variáveis (ponto-env). Nunca ler/cat/copiar/referenciar esse arquivo em comando shell. A `DATABASE_URL` JÁ ESTÁ configurada (Neon Postgres). Código que precise dela carrega internamente (`import 'dotenv/config'`). NUNCA imprimir a URL/senha em logs, outputs ou commits.
2. **Next.js 16.2.11 tem breaking changes** (regra do AGENTS.md): antes de escrever qualquer código Next, consultar o guia relevante em `node_modules/next/dist/docs/` — em especial `searchParams` em RSC (`/chats`), `router.refresh()` pós-action (board) e revalidate no Next 16.
3. **Astryx (AD-005)**: rodar `npx astryx template kanban-board`, `npx astryx template ai-chat`, `npx astryx component Board`, `npx astryx component Token`, `npx astryx component Card`, `npx astryx docs layout` ANTES das telas correspondentes (T7–T12). Self-check Astryx obrigatório ao fim de cada task de UI (sem `<div>`/`style` cru, tokens sempre). A Astryx NÃO tem Drawer overlay — painel do lead é `Layout`/`LayoutPanel`; fallback aprovado: `Dialog`.
4. **Lucide-Animated (AD-008, T6)**: ícones instalados um a um via `npx shadcn@latest add "https://lucide-animated.com/r/<nome>.json"` para `src/components/icons/` — criar `components.json` mínimo MANUALMENTE antes (não deixar o CLI reescrever configs; conferir git diff após cada add). Garantir `"use client"` em cada ícone (dependem de `motion`). Se o CLI falhar/pedir coisas demais: vendor manual do fonte do ícone a partir do site — mesmo resultado. Nenhuma outra lib de ícones entra no projeto.
5. **Convenção de imports da Fase 1 (o Verifier checa)**: nenhum `import` de `src/db` fora de `src/db/*` e `src/server/data/*`. Toda escrita entra na DAL; actions só orquestram (validação + DAL + revalidate). Tenant SEMPRE do cookie no servidor — nenhuma action aceita `tenantId` do client.
6. **Determinismo de ordenação (lesson do Verifier L2)**: toda query nova/tocada tem ORDER BY determinístico com desempate por `id` (T3 formaliza isso para leads/mensagens/summaries).
7. **Testes de integração rodam contra o Neon real seedado**: `npm run db:seed` garante estado canônico; testes de escrita criam registros próprios e não dependem de ordem; **sempre** `npx vitest run --no-file-parallelism` (flakiness conhecida com paralelismo de arquivos — pendência herdada, fora de escopo corrigir aqui).
8. **Drag semântica (context.md)**: mover card altera SOMENTE `status` + `updatedAt`; nenhum outro campo inferido. Mesmo destino = no-op. Falha = revert + erro visível.
9. Windows 11; scripts npm cross-platform.

## Ao final
1. Verifier PASS + `.specs/features/lote-3-pipeline-chats/validation.md` escrito.
2. Atualizar tasks.md (Status: Done) e a rastreabilidade no spec.md (PIPE/CHAT/CAT/UI/ICON → Verified).
3. Atualizar SOMENTE a seção `## Handoff` do `.specs/STATE.md` (nunca tocar `## Decisions`).
4. Reportar: resumo por batch (commits + testes), veredito do Verifier, e o que testar manualmente (`npm run build && npm run start` → `/pipeline` com drag, `/chats`, `/documentos` cores+espaçamento, `/configuracoes` cards, ícones na sidebar).
