# Handoff — Lote 7 (Fase 9): o que falta é T22 + Verifier

> Cole este arquivo (ou aponte para ele) numa janela nova do Claude Code aberta na raiz do projeto (`crivo/`).
> **Confira antes de começar**: MCP do **n8n** conectado e extensão **Claude in Chrome** disponível (o T22 tem checagem em produção; o Verifier pode querer captura real).
> Ative a skill `tlc-spec-driven` e rode **apenas o que falta do Execute**: **T22** e, na sequência, o **Verifier**. Não refaça Specify/Design/Tasks e não repita T1–T21.

---

## 1. Onde o lote está

**T1 a T21: Done.** **T22: Pending.** **Verifier: não rodou.**

Toda a evidência real de cada task está registrada em `tasks.md`, na nota logo abaixo do `**Status**: Done` de cada uma — inclusive ids de execução do n8n **já confirmados por consulta** (nunca citados de memória). O Verifier deve reconferir por conta própria em vez de confiar nessas notas, mas elas dizem onde olhar.

- **Phase 1 (T1–T6)** — commits `292d83f..5f9513f`. Schema `slug`, seed de 3 tenants (`Crivo Demo` + 2 pilotos vazios), `assignBroker` puro, `first_response_at`, estados vazios confirmados por captura real.
- **Phase 2 (T7–T11)** — commits `8df07a8..42c809d`. DAL de escrita, server actions, `LeadControls`, painel (sobre o redesign que o usuário fez em paralelo), sidebar com atividade real.
- **Phase 3 (T12–T18)** — commits `6e20bba..c1c6c55`. `service_api_keys`, DAL, seed emitindo a chave, `authenticate()` de modo duplo, docs do contrato, e a troca do fluxo n8n para credencial de serviço (HUMAN GATE cumprido; coluna `apiKey` removida da Data Table).
- **Phase 4 (T19–T21)** — as três conversas reais estão **provadas**, cada uma com screenshot + id de execução confirmado + artefato/estado verificado em produção. Detalhe completo nas notas do `tasks.md`.

**Contagem de testes: piso real do lote 622 → 693 agora.** Nenhum teste removido, pulado ou enfraquecido em nenhum momento.

**Git**: branch `main`, HEAD `36c9a8a`, **7 commits locais ainda não enviados** (`1e01d9e..36c9a8a` — todas as correções achadas na Phase 4). Working tree limpa fora de untracked pré-existentes (`public/crivo_*.png`, `skills-lock.json`).

**n8n**: `crivo-agente-principal` (`0B1nqjODu7xuYYKF`) publicado na versão **`d3105bb3-8522-449c-aa7c-0569d6a2a547`**, **61 nós**, ativo. `n8n/generated/principal.ts` está byte-idêntico ao publicado (conferido a cada publicação).

---

## 2. O que exatamente falta

### T22 — expiração de documentos, AD-020 e fechamento

O `**Done when**` completo está em `tasks.md`. Resumo dos 6 itens:

1. **Rodar a rota de expiração em produção** e registrar a contagem por tenant. `POST`/`GET /api/cron/expire-documents` com `Authorization: Bearer $CRON_SECRET` (a rota aceita os dois verbos — SPEC_DEVIATION justificada do lote-5, porque o Vercel Cron chama por GET). Nunca foi observada rodando em produção.
2. **Conferir `GET /api/v1/context` DEPOIS da expiração**: nenhum documento expirado pode aparecer na resposta.
3. **Registrar a AD-020** em `.specs/STATE.md` na seção `## Decisions` — **esta é a única exceção autorizada para tocar `## Decisions`**, concedida explicitamente pelo `EXECUTE-PROMPT.md`. Conteúdo: o roadmap ganha o lote de usuários/perfis/papéis + atribuição por agenda **entre** a Fase 9 e a Fase 10, ficando **L7 = Fase 9, L8 = usuários/papéis, L9 = Fase 10**; e a **AD-006 passa a `amended by AD-020`**.
4. Rastreabilidade do `spec.md` (os 9 requirement IDs → status real) e do `tasks.md` atualizada no mesmo commit.
5. Gate final `npx vitest run && npm run lint && npm run build` verde, com a contagem final registrada contra o piso 622.
6. Conferir que nenhum teste sumiu ao longo do lote.

**Commit**: `docs(lote-7): registra AD-020 e fecha rastreabilidade`

**Exceção de `git add`**: `.specs/` é gitignored (`.gitignore:47`). O T22 é a task que commita `spec.md`/`tasks.md` da feature via **`git add -f`** — padrão dos lotes 3–6c. `STATE.md`, `validation.md`, `HANDOFF.md` e `EXECUTE-PROMPT.md` continuam fora do controle de versão de propósito.

### Verifier — automático depois do T22

Sub-agente **fresco** (author ≠ verifier), que re-deriva a cobertura do zero a partir do `spec.md`, escreve `.specs/features/lote-7-dado-real-ponta-a-ponta/validation.md` (PASS/FAIL, evidência por AC com `file:line`, resultado do sensor, faixa de diff) e devolve veredito + gaps ranqueados. Loop fix→re-verify limitado a 3 iterações.

**O sensor de mutação precisa cobrir, no mínimo** (exigência literal do `EXECUTE-PROMPT.md`):

- o desempate de `assignBroker` — trocar a ordem do desempate tem que matar teste;
- a guarda de tenant em `updateLeadBroker` — aceitar corretor de outro tenant tem que matar teste;
- a condição de escrita única de `first_response_at` — sobrescrever tem que matar teste;
- a precedência dos dois modos em `authenticate()` — chave de tenant obedecendo o header `X-Crivo-Tenant` tem que matar teste.

Mutações rodam em scratch isolado (worktree temporário ou cópia de arquivos — **nunca `git stash`**), descartado depois, com `git status --porcelain` da árvore real conferido contra o baseline pré-sensor.

Fechamento determinístico: `python3 <skill-dir>/scripts/validate_state.py lote-7-dado-real-ponta-a-ponta` precisa sair 0.

---

## 3. Achados reais da Phase 4 — material obrigatório do `validation.md`

A Phase 4 encontrou **6 defeitos reais que nenhum teste automatizado pegaria**, porque só aparecem numa conversa real contra a Cloud API da Meta e o modelo de verdade. Isso é o argumento mais forte a favor do smoke roteirizado e **deve constar no `validation.md`**, não ser varrido para debaixo do tapete:

1. **Memória nunca salva** (`853013c`) — o AI Agent só encerra via tool `responder_lead`, e o salvamento automático do n8n/LangChain só dispara em resposta final de texto. `ai.agent.memory.saves` era 0 em toda execução: o agente esquecia tudo dentro da própria conversa. Corrigido com salvamento explícito por turno.
2. **Data sem âncora** (`aad5161`) — sem "hoje é X" no prompt, o modelo resolveu "terça-feira" para duas datas diferentes em turnos consecutivos e colidiu com o próprio agendamento. Não é falha de modelo específico.
3. **Promessa de e-mail** (`aad5161`) — o agente prometeu mandar link por e-mail, capacidade que não existe e que nenhuma instrução proibia.
4. **Reagendamento em loop** (`e945b42`) — com a reunião já confirmada, a instrução de fase continuava mandando agendar em todo turno; o lead disse só "obrigado" e o agente reagendou em cima do próprio horário. Parecia alucinação, era o prompt.
5. **Turno mudo** (`dbb521b`) — o agente escreveu a resposta como texto final em vez de chamar a tool; o texto era descartado e o lead ficava sem nada. Hoje cai num envio de contingência.
6. **Confirmação de opt-out não entregue** (`36c9a8a`) — os nós de Data Table de purga substituíam `$json` e o envio saía sem `phoneNumberId`/`mensagens` (Meta 400). O lead era descadastrado corretamente mas nunca era avisado — a única obrigação que a LGPD-03 AC1 faz questão. Era a única rota que não seguia a convenção de convergência do topo de `principal.ts`.

Houve ainda **uma regressão introduzida e corrigida no mesmo dia** (`81face0`): ao excluir o turno atual da semeadura, uma conversa nova passou a ter zero mensagens anteriores e o Code node devolvia `[]` — o que no n8n faz todos os nós seguintes serem pulados; o agente não rodava e o lead ficava sem resposta (execução 931). Corrigido com item sentinela + IF. Registrar isso também: o Verifier deve saber que essa classe de bug existe neste fluxo.

---

## 4. Armadilhas do ambiente (aprendidas nesta sessão — não redescubra do zero)

1. **Autosave da UI do n8n sobrescreve publicação por MCP.** Aconteceu 2x. Se o usuário tiver a aba do editor aberta, um autosave com cópia velha pode reverter o que foi publicado. **Sempre** conferir `get_workflow_history` depois de publicar: a versão mais nova com `autosaved: false` tem que ser a sua **e** ser igual ao `activeVersionId`. Um draft `autosaved: true` por cima é tolerável (aconteceu e foi inofensivo); o ativo não ser o seu, não é.
2. **`validate_workflow` é impraticável para `principal.ts`** (~119k chars, a tool só aceita código inline). O caminho que funcionou: `validate_node_config` nos nós novos + a validação server-side do próprio `update_workflow` + comparação **byte a byte** do `jsCode` publicado contra `n8n/generated/principal.ts`, extraindo as strings programaticamente (script descartável avaliando a concatenação de literais — nunca redigitando à mão).
3. **`update_workflow` recebe `operations`, não código bruto.** Não existe replace de workflow inteiro para workflow existente (só `create_workflow_from_code`, que cria outro).
4. **`versionDescription` tem limite de 1000 chars.**
5. **5 avisos `SUBNODE_NOT_CONNECTED`** nos nós `Chat Memory Manager: *` são conhecidos e benignos. Qualquer aviso além desses é sinal de problema.
6. **`npx drizzle-kit push` sem flag mira PRODUÇÃO** (`drizzle.config.ts` só lê `DATABASE_URL`). Para o banco de teste foi usado um helper em scratchpad nesta sessão; recrie se precisar, nunca rode o bare contra produção sem OK explícito.
7. **`npx vitest run` reseeda o banco de teste** e, historicamente, rotacionava chaves (`n8n/README.md` §4). Hoje isolado por `TEST_DATABASE_URL` (`src/db/index.ts:10-21`).
8. **Nó que devolve 0 itens mata a cadeia inteira no n8n** — todos os nós seguintes são pulados. Já causou um apagão real aqui (item 3 da seção anterior).
9. **PowerShell 5.1 não tem `&&`**; a ferramenta Bash (Git Bash) tem.
10. **Trailer de commit**: proibido `Co-Authored-By: Claude` / "Generated with" (AD-014). Validar toda mensagem com `python3 <skill-dir>/scripts/check_commit.py --message "..."`.
11. **Arquivo de env é bloqueado por hook** — nunca imprimir URL/senha/API key em log, output ou commit.

---

## 5. Blast radius — precisa de OK explícito do usuário, na hora

- **Rodar a rota de expiração em produção** (T22 item 1) — é escrita em dado real de produção.
- **`git push`** dos 7 commits locais. Já foi autorizado 2x nesta sessão, mas **autorização não é permanente**: peça de novo.
- **Deploy na Vercel** (o projeto é git-linked: push em `main` dispara deploy de produção automaticamente — então pedir push é, na prática, pedir deploy).
- Qualquer novo `npm run db:seed` ou `drizzle-kit push` contra produção.

Publicar workflow na instância n8n **está autorizado** (é o objeto do lote e a instância é de teste).

---

## 6. Estado de produção agora

- **Vercel**: projeto `crivo` (`prj_O9vEsQZlWqMRRkaIn7llpoHh8dNx`, team `team_OhaWvx8glCwkSeNa2sSJqQIq`), produção em `crivo-plum.vercel.app`, servindo o commit `c1c6c55`. **Os 7 commits de correção da Phase 4 ainda não estão no ar** — mas são todos de `n8n/`, que não afeta o app Next.js; o fluxo n8n já está publicado com essas correções direto na instância.
- **Banco de produção**: 3 tenants (`Crivo Demo` com dataset rico, `triangulo` e `vale-uberaba` sem lead de seed), tabela `service_api_keys` aplicada, coluna `tenants.slug` aplicada.
- **n8n**: 61 nós, ativo, credencial de serviço `YhGcdfGtdEBBU9YP` em uso; `tenant_config` sem coluna `apiKey`; 1 linha (`triangulo`).
- **Modelo do agente**: `gemini-3.5-flash-lite`, **trocado à mão pelo usuário na UI**. `n8n/workflows/principal.ts` ainda declara `models/gemini-3.5-flash` na fonte — **divergência conhecida entre fonte e instância**, que o próximo `n8n-inline` + publish reverteria sem querer. O usuário decidiu migrar para **`gpt-5-nano`** num lote futuro; até lá, alinhar fonte e instância é uma pendência a resolver conscientemente (ver seção 7).

---

## 7. Pendências conhecidas, não bloqueantes

- **Divergência de modelo fonte × instância** (acima). Decidir: ou atualizar a fonte para `flash-lite`, ou assumir a troca para OpenAI já no próximo lote.
- **Troca para `gpt-5-nano`** — decisão tomada pelo usuário nesta sessão, com base numa comparação de custo real: `gemini-3.5-flash` (o modelo que estava em uso) é o **mais caro** dos comparados, ~$0,067/conversa contra ~$0,002 do `gpt-5-nano`. Exige credencial nova, troca do nó `languageModel` e reverificação do tool calling — é trabalho de Design, não detour.
- **Opt-out por linguagem natural** — pedido do usuário, registrado em `context.md` (Deferred Ideas) com o caminho provável e o risco de falso positivo a medir.
- **2 linhas inertes em `conversa_estado`** (`test-tenant-lote6c`, `test-tenant-lote6c-turnlimit`) — não há tool MCP de delete de linha.
- **Sem helper de revogação de chave de serviço por label** na DAL; hoje exige update direto no banco (documentado em `n8n/README.md` §12.3).
- **Vale do Uberaba sem `tenant_config`** (falta 2º número de teste homologado) — multi-tenancy real ponta a ponta segue não exercitada.
- Fixes herdados abertos: **L4 Fix 2** (DASH-06 AC2 sem artefato) e **L5 Fix 1** (413/JSON inválido sem teste dedicado em `POST /api/v1/leads`).

---

## 8. Ordem sugerida na janela nova

1. Ler `.specs/STATE.md` (Decisions + Handoff), este arquivo, `spec.md`, `tasks.md` (as notas de evidência), `design.md`.
2. Rodar `npx vitest run` e confirmar o piso atual (**esperado: 693**).
3. Executar o T22 — pedindo o OK do usuário antes da rota de expiração em produção.
4. Commit do T22 (com `git add -f` de `spec.md`/`tasks.md`).
5. Despachar o **Verifier** (sub-agente fresco), com o sensor cobrindo as 4 mutações nomeadas.
6. Tratar gaps (máx. 3 iterações), rodar `validate_state.py`, e só então reportar o lote como fechado.
7. Perguntar sobre `git push` + deploy no fim, se o usuário quiser publicar.
