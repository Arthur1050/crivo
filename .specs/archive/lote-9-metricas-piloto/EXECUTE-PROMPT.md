# Prompt de Execução — Lote 9: Instrumentação de métricas do piloto

> Cole o bloco abaixo numa nova janela do Claude Code aberta na raiz do projeto (`crivo/`).
> **Antes de colar, confira na janela nova**: extensão **Claude in Chrome** disponível — há quatro superfícies novas de UI (T20/T21 reuniões a confirmar, T25/T26 formulário de baseline, T29/T30 saúde da integração, T33 relatório) e o painel Browser embutido **não serve**, ele não captura quando não está visível.
> **MCP do n8n NÃO é necessário neste lote**: nenhum workflow muda, nenhum contrato de request/response muda, nenhum código de erro novo é criado.
> **Nenhuma variável de ambiente nova** é introduzida — nada a acrescentar na Vercel desta vez.

---

Ative a skill `tlc-spec-driven` e rode APENAS a fase **Execute** da feature `lote-9-metricas-piloto`. Todo o planejamento já está aprovado — não refaça Specify/Design/Tasks e não me peça re-aprovação deles.

## Contexto aprovado (leia nesta ordem antes de executar)

1. `.specs/STATE.md` — decisões ativas AD-001..AD-022 e o Handoff do lote-8. **Atenção ao item 2 das Restrições Críticas antes de interpretar qualquer AD-014.**
2. `.specs/features/lote-9-metricas-piloto/tasks.md` — 34 tasks em 9 phases, Test Coverage Matrix e Gate Check Commands (autoritativos).
3. `.specs/features/lote-9-metricas-piloto/spec.md` — ACs = fonte de verdade dos testes (BASE-01/02, PRES-01/02, SCOPE-02, SAUDE-01/02/03, REL-01, PERF-01) + Edge Cases.
4. `.specs/features/lote-9-metricas-piloto/design.md` — arquitetura, Components, Data Models, **Risks & Concerns** (leia inteiro; a primeira linha dele é a única condição de parada do lote).
5. `.specs/features/lote-9-metricas-piloto/context.md` — decisões do usuário, discrição do agente, e o que foi deliberadamente adiado.
6. `AGENTS.md` — **Next 16 tem breaking changes**; leia o guia relevante em `node_modules/next/dist/docs/` antes de escrever código. Já verificado neste planejamento: `after` de `next/server` é estável desde 15.1 e **lança fora de request scope** (ver condição de parada).
7. `CLAUDE.md` — regras de UI: sem `<div>`, sem estilo inline, sem valor cru; `npx astryx component <Nome>` antes de usar qualquer componente; status é `StatusDot`/`Token`, nunca `Badge` decorativo.

## Modo de execução (já decidido — não pergunte de novo)

**5 batch workers sequenciais + 1 Verifier**:

| Batch | Fases | Tasks | Observação |
| ----- | ----- | ----- | ---------- |
| 1 | Phase 1 + Phase 2 | T1–T7 (7) | Schema, seed e as regras puras que todo o resto consome |
| 2 | Phase 3 + Phase 4 | T8–T17 (10) | O miolo de risco (T8) e depois seis trocas mecânicas de route file |
| 3 | Phase 5 + Phase 6 | T18–T26 (9) | Fecha a lacuna de isolamento (T18) e entrega baseline + reuniões a confirmar |
| 4 | Phase 7 + Phase 8 | T27–T33 (7) | Comparação normalizada, saúde na tela, cron e relatório |
| 5 | Phase 9 | T34 (1) | Decisões, rastreabilidade e handoff |

Batch 2 fica em 10 tasks porque a Phase 4 é uma cadeia única (cada route file depende do anterior estar verde) e o corte só pode cair em fronteira de fase.

Você é o ORQUESTRADOR: despacha cada worker com o payload da skill, recebe o summary compacto e **confirma o resultado por conta própria** (`git log`, contagem de testes rodada por você) antes de despachar o próximo. Workers não spawnam sub-agentes.

**Verifier** (automático após o último commit, nunca opcional e nunca perguntado): validação spec-anchored + discrimination sensor, escreve `validation.md`. Loop fix→re-verify limitado a 3 iterações. Ao final, `python3 <skill-dir>/scripts/validate_state.py lote-9-metricas-piloto` precisa sair 0.

Alvos naturais de mutação para o sensor, se ajudar a planejar: `src/lib/pilot-metrics.ts` (normalização do baseline, janela de pendência, limiar de saúde), `assignedTo(scope)` nas três escritas do Pipeline (T18), a extração de `code` no wrapper (T8) e o corte de 30 dias da purga (T7).

## ⚠️ Condição de PARADA — respeite-a literalmente

**T8 é bloqueante para toda a Phase 4.** `after()` de `next/server` **lança** quando chamado fora de um request scope do Next (`node_modules/next/dist/server/after/after.js:12-19`, erro `E468`). Todos os 9 arquivos de teste de rota do projeto chamam os handlers exportados direto no vitest, sem request scope. O wrapper precisa chamar `after()` dentro de `try/catch`, com fallback para `await` direto da gravação. Se depois disso a suíte de rotas ainda quebrar por causa do agendamento, **PARE e me chame** — não desative a instrumentação nem enfraqueça teste de rota para passar. O plano B (registrar de forma síncrona sempre, aceitando o custo na resposta) muda uma garantia da spec (SAUDE-01 AC5) e a escolha é minha.

## Contrato por task (inegociável)

Testes derivados da spec (nunca da implementação); gate verde antes de done (comandos exatos do `tasks.md`); 1 commit atômico por task com a mensagem definida no `tasks.md`; `git add` apenas dos arquivos da task (nunca `-A`; não commitar `.specs/` nem `.claude/` — exceção: T34 commita `spec.md`/`tasks.md` da feature via `git add -f`, padrão dos lotes 3–8).

**Mensagem de commit sem NENHUMA trailer de autoria** — nada de `Co-Authored-By: Claude ...` nem "Generated with Claude Code". O passo de apendar a trailer, padrão do harness, deve ser omitido deliberadamente (AD-014).

**Piso de testes: 912** (74 arquivos), herdado do lote-8. Confirme rodando `npx vitest run` antes de T1 e use o número real como piso. Nenhum teste pode ser removido, pulado ou enfraquecido. As trocas da Phase 4 mantêm as expectativas dos testes de rota **exatamente como estão** — se um teste de rota precisar mudar de expectativa para passar, o wrapper está errado, não o teste.

## Restrições críticas do ambiente

1. **Arquivo de env BLOQUEADO**: hook do projeto NEGA comando shell que mencione o arquivo de variáveis. Nunca imprimir URL/senha/API key em log, output ou commit.

2. **⚠️ O `.specs/STATE.md` tem DUAS entradas numeradas `AD-014`** e as duas seguem valendo:
   - **`AD-014` (trailer de commit)** — proíbe `Co-Authored-By: Claude`. **ATIVA.**
   - **`AD-014` (workflow-as-code)** — superada só na metade "efeito colateral decidido por LLM" (AD-018). A metade *workflow-as-code* continua integral. **Este lote não toca n8n**, então na prática ela não é exercida aqui.

3. **Banco de testes**: `vitest run` usa `TEST_DATABASE_URL` por causa do guard em `src/db/index.ts:9-11` — nenhum `vitest run` toca o banco real. Só `npm run db:seed` explícito rotaciona a chave de serviço. A nota do `n8n/README.md §4` que descreve esse risco está **obsoleta** (confirmado no lote-8) e não foi corrigida — não a use como fonte.

4. **Verificação visual**: toda superfície nova de UI precisa de captura REAL de tela pela extensão do Chrome antes de a task ser dada como pronta. Sem captura, não altere UI às cegas.

5. **Git**: `origin/main` está sincronizado com `main` no início deste lote (HEAD `9039776`). **Push, deploy e qualquer operação remota exigem autorização explícita minha** — commits locais estão autorizados pela aprovação das tasks, o resto não.

6. **Untracked pré-existentes** que NÃO são deste lote e não devem ser commitados: `public/crivo_*.png`, `skills-lock.json`, e o ruído recorrente de fim de linha em `n8n/src/phase.mjs` (o `git diff` dele é vazio).

## Ao final do lote

Além do `validation.md` e do `validate_state.py`, o T34 precisa deixar registrado no Handoff:

- Estado real do repositório verificado contra `git log`/`git status` (não o que o worker relatou).
- As dívidas herdadas do lote-7/lote-8 que este lote **não** tocou: opt-out por linguagem natural; duas linhas inertes em `conversa_estado`; ausência de helper de revogação de chave de serviço por label; Vale do Uberaba sem `tenant_config`; L4 Fix 2 e L5 Fix 1; migração do modelo do agente para `gpt-5-nano`; `n8n/README.md §4` obsoleto; `openapi.yaml` sem `assignedBroker` nem os 2 códigos de erro do lote-8; `RESEND_FROM` a confirmar na Vercel; SEED-01 (round-trip real) e ATRIB-02 AC8 como evidência de campo ainda em aberto.
- Que os cinco baselines dos tenants-piloto passam a nascer **nulos** e precisam ser preenchidos por um usuário real para que o Dashboard compare de verdade (é um dos Success Criteria da spec, e é ato meu, não do código).
