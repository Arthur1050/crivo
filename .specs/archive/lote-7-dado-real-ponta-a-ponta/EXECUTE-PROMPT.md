# Prompt de Execução — Lote 7: Dado real ponta a ponta (Fase 9)

> Cole o bloco abaixo numa nova janela do Claude Code aberta na raiz do projeto (`crivo/`).
> **Antes de colar, confira na janela nova**: MCP do **n8n** conectado (a instância precisa estar no ar — Phases 3 e 4 dependem dela) **e** a extensão **Claude in Chrome** disponível (há captura real obrigatória em T6, T10, T11 e nas três provas da Phase 4). O painel Browser embutido **não serve** — ele não captura quando não está visível.
> **Antes de começar, tenha em mãos**: acesso à instância n8n para criar uma credencial (HUMAN GATE do T17) e o celular com o número de teste do WhatsApp já homologado (Phase 4 — você é quem manda as mensagens).

---

Ative a skill `tlc-spec-driven` e rode APENAS a fase **Execute** da feature `lote-7-dado-real-ponta-a-ponta`. Todo o planejamento já está aprovado — não refaça Specify/Design/Tasks e não me peça re-aprovação deles.

## Contexto aprovado (leia nesta ordem antes de executar)

1. `.specs/STATE.md` — decisões ativas AD-001..AD-019 e o Handoff do lote-6c. **Atenção ao item 2 das Restrições Críticas antes de interpretar qualquer AD-014.**
2. `.specs/features/lote-7-dado-real-ponta-a-ponta/tasks.md` — 22 tasks em 4 phases, Test Coverage Matrix e Gate Check Commands (autoritativos).
3. `.specs/features/lote-7-dado-real-ponta-a-ponta/spec.md` — ACs = fonte de verdade dos testes (REAL-01, KPI-01/02, ATRIB-01/02, SEC-01, PRIV-01, SMOKE-01, SHELL-01) + Edge Cases.
4. `.specs/features/lote-7-dado-real-ponta-a-ponta/design.md` — arquitetura, pesquisa sobre credencial dinâmica no n8n, componentes, Data Models, Risks & Concerns.
5. `.specs/features/lote-7-dado-real-ponta-a-ponta/context.md` — as decisões do usuário e o que foi deliberadamente adiado.
6. `n8n/README.md` — credenciais, Data Tables, risco R1, nono dígito brasileiro.
7. `docs/integration/guia-integracao.md` + `docs/integration/openapi.yaml` — contrato vigente, que este lote estende de forma aditiva.

## Modo de execução (já decidido — não pergunte de novo)

**3 batch workers sequenciais + Phase 4 conduzida por você (orquestrador) + 1 Verifier**:

- **Batch Worker 1** → Phase 1 (T1→T6): schema `slug`, seed de 3 tenants, atribuição de corretor, `first_response_at`, estados vazios. **Contém captura real em T6.**
- **Batch Worker 2** → Phase 2 (T7→T11): DAL de escrita, server actions, controles do painel, sidebar honesta. **Contém captura real em T10 e T11.**
- **Batch Worker 3** → Phase 3 (T12→T18): chave de serviço, auth de modo duplo, docs do contrato, troca no fluxo n8n. **Contém o HUMAN GATE do T17.**
- **Phase 4 (T19→T22): NÃO delegue.** As três conversas exigem um humano mandando mensagem real pelo WhatsApp. Conduza você mesmo, comigo presente, um roteiro por vez.
- **Verifier** (automático após o último commit): validação spec-anchored + discrimination sensor, escreve `validation.md`. Loop fix→re-verify limitado a 3 iterações.

Você é o ORQUESTRADOR: despacha cada worker com o payload da skill, recebe o summary compacto, **confirma o resultado por conta própria** (git log, contagem de testes rodada por você) antes de despachar o próximo. Workers não spawnam sub-agentes.

## Contrato por task (inegociável)

Testes derivados da spec (nunca da implementação); gate verde antes de done (comandos exatos do `tasks.md`); 1 commit atômico por task com a mensagem definida no `tasks.md`; `git add` apenas dos arquivos da task (nunca `-A`; não commitar `.specs/` nem `.claude/` — exceção: T22 commita `spec.md`/`tasks.md` da feature via `git add -f`, padrão dos lotes 3–6c).

**Mensagem de commit sem NENHUMA trailer de autoria** — nada de `Co-Authored-By: Claude ...` nem "Generated with Claude Code". O passo de apendar a trailer, padrão do harness, deve ser omitido deliberadamente.

## ⚠️ Antes de T1 — dois pré-requisitos bloqueantes

1. **Confirme o piso real de testes.** O `STATE.md` registra 622, mas esse número não é confiável até ser verificado (no lote-5 o registrado era 261 e o real 268). Rode `npx vitest run` e use o número que sair como piso. Toda meta de contagem do `tasks.md` é relativa a ele.
2. **Confirme que a suíte roda contra o banco de TESTE.** `src/db/index.ts:10-21` exige `TEST_DATABASE_URL` sob `VITEST`. O `STATE.md` registra que `drizzle-kit push` nunca rodou com sucesso contra um banco de teste realmente vazio. **Se a suíte não abrir verde, PARE e me chame** — a partir do T2 este projeto convive com lead real, e uma suíte apontando para o banco errado o destrói.

## Restrições críticas do ambiente

1. **Arquivo de env BLOQUEADO**: hook do projeto NEGA comando shell que mencione o arquivo de variáveis. Nunca imprimir URL/senha/API key em log, output ou commit.

2. **⚠️ O `.specs/STATE.md` tem DUAS entradas numeradas `AD-014`** e as duas continuam valendo aqui:
   - **`AD-014` (trailer de commit, ~linha 110)** — proíbe `Co-Authored-By: Claude`. **ATIVA.**
   - **`AD-014` (workflow-as-code, ~linha 117)** — superada só na metade "efeito colateral decidido por LLM" (AD-018). A metade *workflow-as-code* **continua integral**: fonte em `n8n/workflows/`, `n8n/generated/` reproduzível pelo inliner, **UI do n8n nunca editada à mão**. Única exceção de sempre: credencial é trabalho humano.

3. **Este lote muda a forma do dado de produção (T2).** O reseed apaga os 50 leads mockados **e os leads de teste reais do lote-6c** dos dois tenants-piloto. Isso é intencional e aprovado. Mas: **rodar `npm run db:seed` contra o banco de produção exige meu OK explícito na hora** — peça antes de rodar, e diga o que vai ser apagado.

4. **O smoke da Phase 4 exige o CRM novo no ar.** O fluxo n8n chama a URL de produção. Ou seja, Phase 3 (auth de serviço) e Phase 4 dependem de um **deploy na Vercel**, que também exige meu OK explícito na hora. Não faça deploy por conta própria.

5. **Ordem de corte do T17 (senão o agente fica mudo em produção)**: primeiro a credencial existe na instância (HUMAN GATE), depois o CRM com o modo de serviço está no ar, e só então o fluxo troca o header e a coluna `apiKey` sai da Data Table. Inverter isso derruba o agente.

6. **Risco nomeado do design — slug divergente.** Os valores de `tenantSlug` na Data Table `tenant_config` foram escritos em outra sessão e podem não bater com os `slug` do seed. **Leia os valores reais via MCP antes de trocar o header do T17** e reconcilie. Não assuma.

7. **Astryx é a lib e o `AGENTS.md` é o self-check.** Antes de escrever JSX nos T9/T10/T11, rode `npx astryx component <Nome>` para cada componente — props confirmados no CLI, nunca presumidos. Nenhum `<div>` de layout, nenhum `style={{}}`, nenhum valor cru (`bg-[#fff]`, `p-[13px]`). Ao final de cada task de UI, releia o arquivo e refaça o self-check.

8. **Screenshot é gate em trabalho de UI, não ilustração.** Captura real pela extensão Claude in Chrome contra `next start` numa porta dedicada (**build de produção — em `next dev` o indicador do Next fica sobre o rodapé da sidebar e parece bug de layout**). Inspeção de DOM não substitui: só a captura revelou, em lotes anteriores, timestamps em inglês, grid de KPI órfão e filtros desalinhados. Pare o servidor e confirme a porta livre ao final de cada task.

9. **Texto em inglês cravado na Astryx.** `Timestamp` relativo e `FieldLabel` required/optional emitem string em inglês sem prop de locale. Use `formatRelativeTimePtBR`/`RelativeTime` de `src/lib` (T11) e confira se qualquer componente novo da lib **emite texto próprio** antes de confiar nele num ponto visível.

10. **Evidência de execução n8n só depois de confirmar.** Todo id de execução citado em `validation.md`, `tasks.md` ou no relatório final precisa passar por `get_execution` **antes** de ser escrito. No lote-6 uma execução foi citada de memória e não existia. Vale para T17 e para as três provas da Phase 4.

11. **Parser do MCP do n8n rejeita `!` (non-null assertion)** no wiring; `tsconfig.json` exclui `n8n/workflows` e `n8n/generated` do type-check, então **o build NÃO avisa** de erro de tipo lá. Valide por `validate_workflow` via MCP. Chame `get_sdk_reference` e `get_node_types` antes de escrever — não adivinhe nome de parâmetro.

12. **Referência nomeada no n8n**: nó que precisa de dado anterior lê de `$('Nome do nó').first()`, nunca de `$json` encadeado; e `.first()` num Switch sempre lê a saída 0 — use Code node de checkpoint por rota. Classe de bug já corrigida em `7041a78`/`006e789`.

13. **Contagem de testes: este lote não remove nenhum teste.** Nada de `.skip`, nada de asserção enfraquecida, nada de deletar teste para fazer gate passar. A contagem só sobe. Se cair, é regressão — investigue antes de seguir.

14. **Dependências novas: NENHUMA prevista.** Se alguma task parecer exigir pacote novo, pare e me consulte antes de instalar.

15. **INT-08 (desacoplamento) vale no T11**: a sidebar deriva o estado do agente **do dado do próprio CRM**. Nenhum import, nenhuma chamada, nenhuma variável de ambiente apontando para a instância n8n no caminho do CRM.

16. **Escopo travado.** Não estão neste lote e não devem aparecer: atendimento humano pelo Chats, usuários/perfis/papéis, atribuição por disponibilidade de agenda, baselines reais. Se uma task parecer pedir isso, o escopo derrapou — pare e me consulte.

17. Windows 11; PowerShell 5.1 (sem `&&`); scripts npm cross-platform.

## Blast radius

Aprovar este plano autoriza implementação e commits **locais**. Exigem meu OK explícito, na hora, cada um por vez:

- `npm run db:seed` contra o banco de produção (T2)
- `npx drizzle-kit push` contra o banco de produção (T1, T12)
- `git push`
- deploy na Vercel (pré-requisito das Phases 3 e 4)

**Publicar workflow na instância n8n (T17) está autorizado** — é o objeto do lote e a instância é de teste.

## Ao final

1. Verifier PASS + `validation.md` escrito, com as três provas da Phase 4 (screenshot + id de execução confirmado + artefato externo) ou, honestamente, o registro do que **não** foi provado. Desfecho não observado é gap declarado, nunca inferido a partir do estado do CRM.
2. O sensor de mutação deve cobrir, no mínimo: o desempate de `assignBroker` (trocar a ordem do desempate tem que matar teste), a guarda de tenant em `updateLeadBroker` (aceitar corretor de outro tenant tem que matar teste), a condição de escrita única de `first_response_at` (sobrescrever tem que matar teste) e a precedência dos dois modos em `authenticate()` (chave de tenant obedecendo o header `X-Crivo-Tenant` tem que matar teste).
3. Atualizar `tasks.md` (Status: Done) e a rastreabilidade do `spec.md` (os 9 requirement IDs → status real), honestamente.
4. Atualizar `## Handoff` do `.specs/STATE.md` **e** gravar **AD-020** em `## Decisions` (T22) — exceção autorizada para tocar `## Decisions`: o roadmap ganha o lote de usuários/perfis/papéis + atribuição por agenda entre a Fase 9 e a Fase 10 (L7 = Fase 9, L8 = usuários/papéis, L9 = Fase 10), e AD-006 fica `amended by AD-020`.
5. Reportar: resumo por batch (commits + contagem de testes conferida por você, não pelo relato do worker), veredito do Verifier, e o que ficou como gap conhecido para o L8.
