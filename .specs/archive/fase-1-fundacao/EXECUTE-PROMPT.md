# Prompt de Execução — Lote 1 / Fase 1 (fundação técnica)

> Cole o bloco abaixo numa nova janela do Claude Code aberta na raiz do projeto (`crivo/`).

---

Ative a skill `tlc-spec-driven` e rode APENAS a fase **Execute** da feature `fase-1-fundacao`. Todo o planejamento já está aprovado — não refaça Specify/Design/Tasks e não me peça re-aprovação deles.

## Contexto aprovado (leia nesta ordem antes de executar)
1. `.specs/STATE.md` — decisões ativas AD-001..AD-007 (constraints de projeto) e Handoff.
2. `.specs/features/fase-1-fundacao/tasks.md` — 8 tasks em 3 fases, Test Coverage Matrix e Gate Check Commands (autoritativos).
3. `.specs/features/fase-1-fundacao/spec.md` — ACs = fonte de verdade dos testes.
4. `.specs/features/fase-1-fundacao/design.md` — arquitetura RSC-first + cookie, Data Models (fonte do schema Drizzle).
5. `.specs/features/fase-1-fundacao/context.md` — decisões do discuss.

## Modo de execução (já decidido por mim — não pergunte de novo)
Uso MÁXIMO de sub-agentes: **3 batch workers sequenciais + 1 Verifier**, conforme registrado no tasks.md ("Batching decidido com o usuário"):
- **Batch Worker 1** → Phase 1 (T1→T2→T3): stack + schema + seed
- **Batch Worker 2** → Phase 2 (T4→T5): DAL + contexto de tenant (só inicia após o summary completo do Batch 1)
- **Batch Worker 3** → Phase 3 (T6→T7→T8): store/switcher + shell + error states (só após Batch 2)
- **Verifier** (automático após o último commit): validação spec-anchored + discrimination sensor, escreve `validation.md`. Loop fix→re-verify limitado a 3 iterações.

Você é o ORQUESTRADOR: despacha cada worker com o payload da skill (tasks do batch + matrix + gates + spec/design + coding-principles), recebe o summary compacto, atualiza a tabela "Status das tasks" no tasks.md e só então despacha o próximo. Workers não spawnam sub-agentes. Se um gate falhar, o worker para e você decide corrigir/escalar antes do próximo batch.

## Contrato por task (inegociável)
Testes derivados da spec (nunca da implementação); gate verde antes de done (comandos exatos do tasks.md); 1 commit atômico por task com a mensagem definida no tasks.md, `git add` apenas dos arquivos da task (nunca `-A`; não commitar `.specs/` nem `.claude/`), trailer:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
Nunca enfraquecer/deletar/skipar testes.

## Restrições críticas do ambiente (repasse aos workers)
1. **Arquivo de env BLOQUEADO**: um hook do projeto NEGA qualquer comando shell que mencione o nome do arquivo de variáveis (ponto-env). Nunca ler/cat/copiar/referenciar esse arquivo em comando shell. A `DATABASE_URL` JÁ ESTÁ configurada nele (Neon Postgres, conexão verificada). Código que precise dela carrega internamente: `import 'dotenv/config'` (drizzle.config.ts, seed, vitest setup) ou `process.loadEnvFile()`. NUNCA imprimir a URL/senha em logs, outputs ou commits.
2. **Next.js 16.2.11 tem breaking changes** (regra do AGENTS.md): antes de escrever qualquer código Next, consultar o guia relevante em `node_modules/next/dist/docs/`. Já validado no design: `cookies()` é assíncrono; `fetch` sem cache por padrão; Cache Components fica DESLIGADO.
3. **Astryx**: pacotes npm `@astryxdesign/core`, `@astryxdesign/theme-neutral`, `@astryxdesign/cli` (docs: https://astryx.atmeta.com/docs/getting-started); `npx astryx init` é não-interativo. Na T1, salvar a saída de `npx astryx component` e `npx astryx template --list` em `.specs/features/fase-1-fundacao/astryx-catalog.md` (payload dos batches 2/3; não commitar). Se a Astryx não tiver componente de sidebar/nav, compor com primitivos de layout (fallback previsto no design).
4. **Seed (T3)**: dados pt-BR realistas de Uberaba/MG (bairros, nomes, conversas de qualificação imobiliária novo/usado), UUIDs determinísticos, delete-and-insert transacional. Testes de invariantes rodam contra o Neon real seedado.
5. Windows 11; scripts npm cross-platform (`tsx` para o seed).

## Ao final
1. Verifier PASS + `.specs/features/fase-1-fundacao/validation.md` escrito.
2. Atualizar tasks.md (Status: Done) e a rastreabilidade no spec.md (FUND-01..09 → Verified).
3. Atualizar SOMENTE a seção `## Handoff` do `.specs/STATE.md` (nunca tocar `## Decisions`).
4. Reportar: resumo por batch (commits + testes), veredito do Verifier, e o comando para eu subir o app localmente.
