# Prompt de Execução — Lote 6c: AI Agent, memória persistente e tools determinísticas

> Cole o bloco abaixo numa nova janela do Claude Code aberta na raiz do projeto (`crivo/`).
> **Antes de colar, confira na janela nova**: MCP do **n8n** conectado (a instância está no ar e T5–T12/T16 dependem dela). **Claude in Chrome não é necessário** — este lote não toca nenhuma tela.
> **Antes de começar, tenha em mãos**: os dados de conexão do **Postgres da própria instância n8n** (host local, banco, usuário, senha) — é onde a memória vai morar. HUMAN GATE do T5.

---

Ative a skill `tlc-spec-driven` e rode APENAS a fase **Execute** da feature `lote-6c-agente-ai-agent-memoria-tools`. Todo o planejamento já está aprovado — não refaça Specify/Design/Tasks e não me peça re-aprovação deles.

## Contexto aprovado (leia nesta ordem antes de executar)

1. `.specs/STATE.md` — decisões ativas AD-001..AD-019. **Atenção ao item 2 das Restrições Críticas abaixo antes de interpretar qualquer AD-014.**
2. `.specs/features/lote-6c-agente-ai-agent-memoria-tools/tasks.md` — 17 tasks em 5 phases, Test Coverage Matrix e Gate Check Commands (autoritativos).
3. `.specs/features/lote-6c-agente-ai-agent-memoria-tools/spec.md` — ACs = fonte de verdade dos testes (AGN-01..05, MEM-01..04, QLF-01..03, VOZ-01..03, CTX-03, OBS-01) + Edge Cases.
4. `.specs/features/lote-6c-agente-ai-agent-memoria-tools/design.md` — arquitetura, as 5 tools (3 nativas + 2 sub-workflows), componentes, Data Models, Risks & Concerns.
5. `.specs/features/lote-6c-agente-ai-agent-memoria-tools/context.md` — as 4 decisões do usuário (GA-1..GA-4) e o veredito sobre RabbitMQ.
6. `n8n/README.md` — credenciais, Data Tables, nono dígito brasileiro, riscos herdados.

## Modo de execução (já decidido — não pergunte de novo)

**3 batch workers sequenciais + 1 Verifier**, conforme o empacotamento do `tasks.md`:

- **Batch Worker 1** → Phases 1–2 (T1→T6): camada pura (`phase.mjs`, `voice.mjs`, `session.mjs`, `system-message.mjs`) + infra (banco de memória, colunas em `conversa_estado`). **Contém o HUMAN GATE do T5.**
- **Batch Worker 2** → Phases 3–4 (T7→T11): os 2 sub-workflows de tool + a reescrita de `principal.ts` (remoção do miolo, bloco de memória, nó AI Agent). Só inicia após o summary completo do Batch 1.
- **Batch Worker 3** → Phase 5 (T12→T17): publicação, remoção dos 3 módulos mortos, troca de modelo, rastreabilidade.
- **Verifier** (automático após o último commit): validação spec-anchored + discrimination sensor, escreve `validation.md`. Loop fix→re-verify limitado a 3 iterações.

Você é o ORQUESTRADOR: despacha cada worker com o payload da skill, recebe o summary compacto, atualiza o status no `tasks.md` e só então despacha o próximo. Workers não spawnam sub-agentes.

## Contrato por task (inegociável)

Testes derivados da spec (nunca da implementação); gate verde antes de done (comandos exatos do `tasks.md`); 1 commit atômico por task com a mensagem definida no `tasks.md`; `git add` apenas dos arquivos da task (nunca `-A`; não commitar `.specs/` nem `.claude/` — exceção: T17 commita o `spec.md`/`tasks.md` da feature via `git add -f`, padrão dos lotes 3–6b).

**Mensagem de commit sem NENHUMA trailer de autoria** — nada de `Co-Authored-By: Claude ...` nem "Generated with Claude Code". O passo de apendar a trailer, padrão do harness, deve ser omitido deliberadamente.

## Restrições críticas do ambiente

1. **Arquivo de env BLOQUEADO**: hook do projeto NEGA comando shell que mencione o arquivo de variáveis. `DATABASE_URL` e `TEST_DATABASE_URL` já estão configuradas; o código carrega via `import 'dotenv/config'`. Nunca imprimir URL/senha/API key em log, output ou commit.

2. **⚠️ O `.specs/STATE.md` tem DUAS entradas numeradas `AD-014`. Elas não são a mesma coisa e só UMA é superada por este lote:**
   - **`AD-014` (trailer de commit, linha ~110)** — proíbe `Co-Authored-By: Claude` nos commits. **CONTINUA ATIVA E VALENDO.** O histórico remoto foi reescrito com `filter-branch` + `push --force` justamente para remover essas trailers.
   - **`AD-014` (workflow-as-code, linha ~117)** — é a que o **AD-018** supersede, e **somente na metade "efeitos colaterais nunca decididos autonomamente por LLM"**. A metade *workflow-as-code* (fonte no repo, camada pura testada, `n8n/generated/` reproduzível, UI do n8n nunca editada à mão) **continua valendo integralmente**.

3. **AD-018 (novo modelo de barreira) — o que mudou em relação ao lote-6b**: o LLM decide QUANDO chamar uma tool; quem detém a regra decide o que é permitido — preferencialmente o **contrato do CRM**, que já a implementa. Restam **dois** invariantes duros: **opt-out/LGPD** (em `gate.mjs`, antes do agente, sem tool exposta ao modelo) e **trava humana** (`escalado_humano`). Todo o resto **degrada ou regenera, nunca bloqueia**. Não recrie a validação total-ou-nada de `validate-llm.mjs` dentro das tools — ela morre em T13 de propósito.

4. **Risco de segurança que é teste obrigatório (T11)**: o `leadId` das tools nativas deve vir de **expressão do fluxo, NUNCA de `$fromAI`**. Se o modelo puder preencher o `leadId`, ele pode escrever no lead errado — potencialmente de outro tenant. O Verifier vai atacar exatamente isso no sensor de mutação.

5. **Subnodes do AI Agent não enxergam `$json`**: dentro de `memory()`, `languageModel()`, `tool()`, referencie dado do fluxo com `nodeJson(triggerNode, 'campo.caminho')`. Usar `$json` na `sessionKey` da memória é a armadilha documentada pelo próprio n8n — a chave sairia vazia e todos os leads compartilhariam sessão. **Isso quebraria MEM-01 AC2 (isolamento entre tenants) em silêncio.**

6. **Parser do MCP do n8n rejeita `!` (non-null assertion)** no wiring dos workflows — foi o bug do commit `b0b7ff9` (`.onTrue!()`/`.onCase!()`). E `tsconfig.json` exclui `n8n/workflows` e `n8n/generated` do type-check (`0a987af`), então **o build NÃO vai te avisar** de erro de tipo nesses arquivos. Valide sempre por `validate_workflow` via MCP.

7. **`executeOnce: true` em nó HTTP encadeado depois de nó multi-item** — sem isso o nó roda 1× por item, foi o bug do commit `a3cc1ea` (contexto duplicado no prompt a cada turno). Relevante no bloco de memória (T10), onde a semeadura produz múltiplos itens.

8. **Referência nomeada no n8n**: todo nó que precisa de dado anterior a um HTTP/WhatsApp lê de `$('Nome do nó').first()`, nunca de `$json` encadeado — classe de bug corrigida em `7041a78`/`006e789`. E `.first()` num Switch sempre lê a saída 0: use Code nodes de checkpoint por rota.

9. **SDK do n8n**: sem `function`/arrow no nível do arquivo de workflow (o parser rejeita); nó com múltiplos predecessores tem o wiring de saída declarado UMA vez numa variável nomeada; sem ciclos no grafo. Chame `get_sdk_reference` e `get_node_types` antes de escrever — não adivinhe nome de parâmetro.

10. **Macro `__INLINE(modulo.mjs)__`**: é assim que a camada pura entra nos Code nodes. Ao remover um módulo (T13/T14/T15), confirme que nenhum `__INLINE` órfão restou em `n8n/workflows/`.

11. **`npx vitest run` NÃO rotaciona mais as API keys dos tenants.** O commit `72ed42a` isolou a suíte com `TEST_DATABASE_URL`, e o `drizzle-kit push` contra o banco de teste já foi executado (confirmado em 2026-08-14: 612 testes passando, exit 0). **Ignore a rotina de ressincronização de `tenant_config` descrita em `n8n/README.md` §4** — ela descreve o comportamento anterior ao isolamento. Se a suíte falhar por dado, investigue antes de assumir que precisa reseedar produção.

12. **Contagem de testes — leia antes de tratar queda como regressão.** Baseline: **612**. Este lote **remove 69 testes de propósito** (`prompt.test.ts` 20, `history.test.ts` 10, `validate-llm.test.ts` 39), cada um junto do módulo que testa, em task própria e revertível. Trajetória: 612 → ~692 (fim da Fase 1) → ~623 (fim da Fase 5). **Nenhum teste sobrevivente pode ser enfraquecido, deletado ou skipado.** Asserções existentes só podem ser substituídas por equivalentes ou mais fortes.

13. **T5 é HUMAN GATE**: a memória mora no **Postgres da própria instância n8n**, no mesmo servidor, por conexão local — decisão do usuário (2026-08-14), pela latência do caminho quente (memória é lida e escrita a cada turno). A senha depende do usuário. Documente, confirme via `list_credentials`, e **PARE e me chame** se a credencial não existir. Não invente credencial, **não aponte a memória para o banco do CRM** (quebraria INT-08), e não crie banco novo em nenhum provedor externo — não é isso que foi pedido.

14. **Dependências novas: NENHUMA.** `n8n/src/` é código puro sem imports externos (roda no sandbox do Code node); módulos de lá podem importar uns aos outros, mas nunca nada do resto do repo.

15. **Nada de UI neste lote.** Se alguma task parecer pedir mudança de tela, é sinal de que o escopo derrapou — pare e me consulte.

16. Windows 11; PowerShell 5.1 (sem `&&`); scripts npm cross-platform.

## Blast radius

Aprovar este plano autoriza implementação e commits **locais**. `git push`, deploy na Vercel e qualquer mudança em banco de produção exigem meu OK explícito na hora. **Publicar workflow na instância n8n (T12, T16) está autorizado** — é o objeto do lote e a instância é de teste.

## Ao final

1. Verifier PASS + `.specs/features/lote-6c-agente-ai-agent-memoria-tools/validation.md` escrito. O Verifier deve validar explicitamente que **cada teste removido corresponde a um módulo removido** e que nenhum sobrevivente foi enfraquecido — a queda de 692 para ~623 é esperada e declarada, não regressão.
2. Sensor de mutação deve cobrir, no mínimo: `leadId` via `$fromAI` (escrita cross-lead), `sessionKey` sem `nodeJson` (vazamento entre tenants), purga de sessão sem limpar `perguntadosJson`/`aberturasJson`, e as duas barreiras de `voice.mjs`.
3. Atualizar `tasks.md` (Status: Done) e a rastreabilidade do `spec.md` (os 17 requirement IDs → status real), honestamente.
4. Atualizar `## Handoff` do `.specs/STATE.md` **e** gravar AD-018 e AD-019 em `## Decisions` (T17) — esta é a exceção autorizada para tocar `## Decisions`, porque as duas decisões foram planejadas mas não registradas.
5. Reportar: resumo por batch (commits + contagem de testes), veredito do Verifier, e uma **comparação da mesma fixture antes e depois do T16** (troca de `flash-lite` para `flash`), para eu decidir se o modelo mais caro se paga.
