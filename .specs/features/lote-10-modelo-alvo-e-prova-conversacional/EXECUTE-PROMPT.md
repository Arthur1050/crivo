# Prompt de Execução — Lote 10: Modelo alvo e prova conversacional

> Cole o bloco abaixo numa nova janela do Claude Code aberta na raiz do projeto (`crivo/`).
> **Antes de colar, confira na janela nova**:
> - **MCP do n8n É OBRIGATÓRIO** neste lote — publicação de workflow, execução da bateria e leitura de execuções passam todos por ele. Sem MCP do n8n, o lote não sai da Fase 1.
> - **Extensão Claude in Chrome disponível** — a Fase 5 exige captura real de tela do CRM em três cenários. O painel Browser embutido **não serve** (não captura quando não está visível).
> - **Você (usuário) precisa estar presente** da T12 à T16: são três conversas reais no WhatsApp, conduzidas por você, com evento real no seu Google Calendar.
> - **Nenhuma variável de ambiente nova no app** — a credencial OpenAI vive no cofre do n8n (`OpenAI account`, `openAiApi`, id `bGnmNn5iFH4sBCoo`), já criada. Nada a acrescentar na Vercel.

---

Ative a skill `tlc-spec-driven` e rode APENAS a fase **Execute** da feature
`lote-10-modelo-alvo-e-prova-conversacional`. Todo o planejamento já está aprovado — não refaça
Specify/Design/Tasks e não me peça re-aprovação deles.

## Contexto aprovado (leia nesta ordem antes de executar)

1. `.specs/STATE.md` — decisões ativas AD-001..AD-025 e o Handoff do lote-9. **Atenção ao item 2 das Restrições Críticas antes de interpretar qualquer AD-014.**
2. `.specs/features/lote-10-modelo-alvo-e-prova-conversacional/tasks.md` — 25 tasks em 8 phases, Test Coverage Matrix e Gate Check Commands (autoritativos, incluindo o gate **Evidência**).
3. `.specs/features/lote-10-modelo-alvo-e-prova-conversacional/spec.md` — ACs = fonte de verdade dos testes (MOD-01/02/03, SMK-01..06, DOC-01/02, MTN-01) + Edge Cases.
4. `.specs/features/lote-10-modelo-alvo-e-prova-conversacional/design.md` — leia inteiro, em especial a seção **Pesquisa** (tudo ali foi confirmado ao vivo via MCP: schema do nó, lista real de modelos da conta, ausência de tool MCP para apagar linha de Data Table) e **Risks & Concerns**.
5. `.specs/features/lote-10-modelo-alvo-e-prova-conversacional/context.md` — as cinco decisões do usuário (A–E), o achado do `gate.mjs` que redesenhou o smoke, e o que ficou como discrição do agente.
6. `n8n/README.md` — runbook da camada n8n. **§1** (pipeline de publicação), **§4** (ordem seed ↔ rotação de chaves — a seção que a T19 corrige), **§8** (nono dígito brasileiro), **§§10-12** (formato de registro de evidência real, que este lote segue).
7. `AGENTS.md` / `CLAUDE.md` — **Next 16 tem breaking changes**; regras de UI da Astryx. Na prática este lote **não toca UI nem código do app**: o único código alterado é `n8n/workflows/principal.ts` e sua suíte de teste.

## Modo de execução (já decidido — não pergunte de novo)

**5 batches sequenciais + 1 Verifier**, com dois batches que NÃO são delegáveis:

| Batch | Fases | Tasks | Delegável? |
| ----- | ----- | ----- | ---------- |
| 1 | Phase 1 + Phase 2 | T1–T5 (5) | Sim — worker |
| 2 | Phase 3 + Phase 4 | T6–T11 (6) | Sim — worker |
| 3 | Phase 5 | T12–T16 (5) | **NÃO** — orquestrador + usuário presente |
| 4 | Phase 6 + Phase 7 | T17–T24 (8) | Sim — worker |
| 5 | Phase 8 | T25 (1) | **NÃO** — depende de homologação no painel da Meta |

Você é o ORQUESTRADOR: despacha cada worker com o payload da skill, recebe o summary compacto e
**confirma o resultado por conta própria** (`git log`, contagem de testes rodada por você) antes de
despachar o próximo. Workers não spawnam sub-agentes. Os batches 3 e 5 você executa você mesmo, no
diálogo comigo — nunca delegue conversa real no WhatsApp nem captura de tela do meu CRM.

**Verifier** (automático após o último commit, nunca opcional e nunca perguntado): validação
spec-anchored + discrimination sensor, escreve `validation.md`. Loop fix→re-verify limitado a 3
iterações. Ao final, `python3 <skill-dir>/scripts/validate_state.py lote-10-modelo-alvo-e-prova-conversacional`
precisa sair 0.

**Aviso ao Verifier, para ele não medir o lote pela régua errada**: das 25 tasks, exatamente duas
tocam código (T3 e, condicionalmente, T9). O piso de testes sobe pouco **por desenho**, não por
cobertura faltando — a evidência deste lote é execução real (bateria + 3 conversas), registrada com
id de execução em `n8n/smoke/evidencia.md`. O alvo natural de mutação é a suíte de grafo de T3:
inverter o id do modelo, reintroduzir um nó `lmChatGoogleGemini`, remover uma das 5 tools, alterar a
`sessionKey` da memória, ou mexer na contagem de nós/conexões — cada um desses tem que matar um
teste. Se algum sobreviver, a suíte de T3 é decorativa e vira fix task.

## ⚠️ Condições de PARADA — respeite-as literalmente

**1. Divergência entre publicado e `n8n/generated/` na T2.** Se o `crivo-agente-principal` publicado
não bater com `n8n/generated/principal.ts`, **PARE e me chame** antes de publicar qualquer coisa.
Publicar por cima apagaria silenciosamente uma alteração feita na UI que ninguém registrou — foi
exatamente o modo de falha que o lote-8 T30 encontrou com o modelo. Registre a divergência (T2 já
pede isso) e espere minha decisão.

**2. Veredito ambíguo da bateria na T9.** O critério de T6 é binário de propósito. Se o resultado
não couber nele — por exemplo, uma tool chamada mas com comportamento estranho, ou o agente
prosseguindo do enum inválido de um jeito novo — **PARE e me chame**. Não "interprete a favor" nem
dispare o rollback por conta própria: a escolha entre seguir e reverter é minha quando o critério
não decide sozinho.

**3. Congelamento de `vitest` da T12 até a T16.** `src/db/__tests__/seed.test.ts` chama `runSeed()`
no `beforeAll`, e o seed rotaciona as chaves. Um `npx vitest run` no meio de um cenário mata a
conversa com `401` por motivo que nada tem a ver com o modelo — é o incidente real do lote-6 T11
(`n8n/README.md` §4). Nenhum teste roda nessa janela. Se algo parecer exigir uma rodada de teste ali,
**PARE e me chame** em vez de rodar.

**4. Smoke reprovado por estilo.** Se os desfechos passarem mas a conversa ficar ruim, **não
redesenhe a persona**. A AD-016 continua sendo a especificação do estilo. A válvula existe (decisão E
do `context.md`: ajuste de prompt como fix task pós-smoke reprovado), mas quem decide acioná-la sou
eu — registre a observação na T16 e me pergunte.

**5. Limpeza entre cenários é minha, não sua.** Da T13 à T15, quem apaga o lead, a linha de
`conversa_estado` e a sessão de memória sou eu, à mão. Sua parte é apresentar o checklist da T11 e
**esperar minha confirmação dos três alvos** antes de começar o cenário seguinte. Não escreva script
de reset, não crie workflow de reset, e não apague nada por conta própria.

## Contrato por task (inegociável)

Testes derivados da spec (nunca da implementação); gate verde antes de done (comandos exatos do
`tasks.md`, incluindo o gate **Evidência**, que exige id de execução registrado e proíbe rodar
teste); 1 commit atômico por task com a mensagem definida no `tasks.md`; `git add` apenas dos
arquivos da task (nunca `-A`).

**`.specs/` É versionado neste repositório** (ver o comentário no `.gitignore`) — não precisa de
`git add -f`, e as tasks T17-T24 commitam arquivos de `.specs/` normalmente. O que **não** é
versionado é `.claude/`.

**Mensagem de commit sem NENHUMA trailer de autoria** — nada de `Co-Authored-By: Claude ...` nem
"Generated with Claude Code". O passo de apendar a trailer, padrão do harness, deve ser omitido
deliberadamente (AD-014). Isso vale mesmo que o harness da sua janela mande o contrário.

**Piso de testes: 1015** (81 arquivos), herdado do lote-9. **Confirme rodando `npx vitest run` na T1
e use o número real como piso** — a documentação já esteve desatualizada antes. Nenhum teste pode ser
removido, pulado ou enfraquecido. A T3 só sobe o piso; nenhuma task o abaixa.

## Restrições críticas do ambiente

1. **Arquivo de env BLOQUEADO**: hook do projeto NEGA comando shell que mencione o arquivo de
   variáveis. Nunca imprimir URL, senha ou API key em log, output ou commit. Vale também para a chave
   da OpenAI: ela existe só no cofre do n8n e **nunca** entra no repositório.

2. **⚠️ O `.specs/STATE.md` tem DUAS entradas numeradas `AD-014`** e as duas seguem valendo:
   - **`AD-014` (trailer de commit)** — proíbe `Co-Authored-By: Claude`. **ATIVA.**
   - **`AD-014` (workflow-as-code)** — superada só na metade "efeito colateral decidido por LLM"
     (AD-018). A metade *workflow-as-code* continua integral e **este lote a exerce diretamente**:
     a UI do n8n nunca é editada à mão; toda mudança é `n8n/workflows/*.ts` →
     `node scripts/n8n-inline.mjs` → `n8n/generated/*.ts` → publicação via MCP.

3. **Banco de testes**: `vitest run` usa `TEST_DATABASE_URL` por causa do guard em
   `src/db/index.ts:9-11` — nenhum `vitest run` toca o banco real. Só `npm run db:seed` explícito
   rotaciona as chaves. **É exatamente esse fato que a T19 vai registrar no `n8n/README.md` §4**, que
   hoje descreve o risco como se o guard não existisse. Não use a §4 atual como fonte antes da T19.

4. **Verificação visual**: os três cenários da Fase 5 exigem captura REAL de tela do CRM pela
   extensão do Chrome. Sem captura, o cenário não é dado como pronto.

5. **Git**: `origin/main` está sincronizado com `main` no início deste lote (HEAD `d550b79`).
   **Push, deploy e qualquer operação remota exigem autorização explícita minha** — commits locais
   estão autorizados pela aprovação das tasks, o resto não. A Vercel redeploya automaticamente em
   push a `main`; como este lote não muda código do app, não há motivo para push antes do fim.

6. **Estado do repositório**: working tree limpa. O único untracked no início são os artefatos de
   planejamento deste lote, se eu ainda não os tiver commitado. Nenhum dos ruídos antigos
   (`public/crivo_*.png`, `skills-lock.json`) existe mais — os dois foram versionados.

## Fatos já confirmados no planejamento — não os reconfirme do zero

Economize turnos: isto foi verificado ao vivo em 2026-09-05 e está registrado no `design.md`.

- Nó: `@n8n/n8n-nodes-langchain.lmChatOpenAi` **v1.3**. `model` é **resource locator**
  (`{ __rl: true, mode, value, cachedResultName }`), não string como no nó Gemini.
- Modelos disponíveis na conta: `gpt-5-nano`, `gpt-5-nano-2025-08-07`, `gpt-5.4-nano`,
  **`gpt-5.4-nano-2026-03-17`** ← o escolhido.
- `reasoningEffort` só aparece no schema para `gpt-5.*` / `o[3-9]`. `temperature` existe mas **fica
  de fora** (família de raciocínio na Responses API, que é o default do nó).
- Não existe ferramenta MCP para apagar linha de Data Table — por isso a limpeza é manual.
- `n8n-nodes-base.dataTable` v1.1 tem `resource: "row", operation: "deleteRows"` (relevante só se um
  lote futuro automatizar a limpeza; **não use neste**).
- `conversations.leadId` e `messages.conversationId` são FK **sem** `onDelete` (`schema.ts:206-232`)
  — daí a ordem de remoção no checklist.
- A divergência fonte × instância que o roadmap L10 item 2 descrevia **não existe mais**:
  `principal.ts:1269` já declara `flash-lite`, alinhado no lote-8 T30.

## Ao final do lote

Além do `validation.md` e do `validate_state.py`, as tasks de fechamento (T20-T24) precisam deixar
registrado:

- **AD-026 com o modelo que REALMENTE ficou** — se o rollback da T9 disparou, ela nomeia o Gemini e o
  motivo, nunca o alvo planejado. Escrever a AD antes do veredito seria registrar uma decisão que não
  aconteceu.
- **AD-027** (protocolo de prova conversacional) e **AD-015 com `Status: superseded by AD-027`**.
- Estado real do repositório verificado contra `git log`/`git status` — não o que o worker relatou.
- As dívidas herdadas que este lote **não** tocou: opt-out por linguagem natural (L13); duas linhas
  inertes em `conversa_estado`; ausência de helper de revogação de chave de serviço por label na DAL;
  L4 Fix 1, L4 Fix 2 e L5 Fix 1; `openapi.yaml` sem `assignedBroker` nem os 2 códigos de erro do
  lote-8; `RESEND_FROM` a confirmar na Vercel; alerta ativo de queda da integração (L15); baselines
  dos tenants-piloto ainda fictícios (L15).
- **Se MTN-01 não rodou**: a pendência nomeada do 2º número homologado + `tenant_config` do Vale do
  Uberaba, com quem depende dela. MTN-01 fica explicitamente **não verificado** — nunca aprovado por
  ausência.
- Se algum cenário do smoke reprovou, o veredito honesto disso em AGT-04 / AGT-05 / LGPD-03 na
  rastreabilidade do lote-6 (T22) — a tabela não sobe para `Verified` por conveniência.
