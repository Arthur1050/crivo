# Lote 10 — Evidência de execução (modelo alvo e prova conversacional)

Arquivo de evidência do lote-10. Registra medições reais, ids de execução e ids de versão publicada —
nunca "funcionou". Segue o estilo de registro de `n8n/README.md` §§10-12: o que foi medido, com que
comando, e o que ficou honestamente por confirmar.

---

## T1 — Linha de base do lote (2026-09-05)

### 1.1 Piso de testes medido

`npx vitest run` na raiz do projeto, rodado nesta sessão antes de qualquer alteração de código:

```
Test Files  81 passed (81)
     Tests  1015 passed (1015)
  Duration  591.37s
```

**Piso medido: 1015 testes em 81 arquivos, 0 falhas** (exit code 0). O número bate com o piso herdado
que o `.specs/STATE.md` cita, mas foi **medido agora**, não copiado da documentação — é essa medição
que vale como linha de base para a contagem exigida no T3 (piso + os testes novos da suíte de grafo,
sem nenhuma deleção silenciosa).

Nota sobre o output: a rodada emite avisos `SECURITY WARNING: The SSL modes 'prefer', 'require', and
'verify-ca' are treated as aliases for 'verify-full'` vindos de `pg-connection-string`. São avisos de
depreciação da dependência, não falhas — nenhum teste é afetado e o exit code é 0. Registrado aqui só
para que a próxima rodada não os confunda com regressão deste lote.

### 1.2 Sincronia entre a fonte dos workflows e `n8n/generated/`

`node scripts/n8n-inline.mjs` rodado na raiz. Saída: os 5 arquivos regenerados
(`erros`, `principal`, `scheduler`, `tool-agendar-reuniao`, `tool-responder-lead`).

`git status --porcelain` logo em seguida: **vazio**. `git diff --stat n8n/generated/`: **vazio**.

**Diff zero em `n8n/generated/` — fonte e artefato gerado estavam sincronizados antes deste lote.**
Nenhuma dessincronia a registrar, e portanto nenhuma investigação pendente antes do T2. Isso importa
porque é o que autoriza o T4 a tratar qualquer diff no gerado como consequência exclusiva da troca do
nó de modelo: partindo de zero, o diff do T4 é, por construção, só o que o T3 mudou.

### 1.3 Estado do nó de modelo antes da troca (fonte)

Para referência do ponto de partida, `n8n/workflows/principal.ts` linhas ~1248-1272 declaram
`agentModel` como `@n8n/n8n-nodes-langchain.lmChatGoogleGemini` v1.1, com
`modelName: "models/gemini-3.5-flash-lite"` e `options: { temperature: 0.4 }`, credencial
`googlePalmApi`. É esse bloco que o T3 substitui; a confirmação de que a **instância publicada** roda
o mesmo modelo é o objeto do T2.

---

## T2 — Paridade publicado × `n8n/generated/` (2026-09-05)

> **VEREDITO: DIVERGÊNCIA LÓGICA ENCONTRADA. A condição de parada do batch disparou.**
> Nenhuma publicação foi feita. O batch parou aqui — T3, T4 e T5 **não** foram executados.
> A decisão de como resolver é do orquestrador, não deste worker.

### 2.1 Alvo e método

Workflow publicado `crivo-agente-principal`, id **`0B1nqjODu7xuYYKF`** (obtido via `search_workflows`),
lido com `get_workflow_details`. Estado da instância no momento da leitura:

- `active: true`, `isArchived: false`
- `versionId` = `activeVersionId` = **`d3105bb3-8522-449c-aa7c-0569d6a2a547`** (o que está publicado é
  o que está ativo — não há draft pendente divergindo da versão ativa)
- `settings`: `{"executionOrder":"v1","availableInMCP":true,"binaryMode":"separate","errorWorkflow":"73Yx70RMJrpLiYQn"}`
  — `errorWorkflow` aponta para `crivo-agente-erros` (id `73Yx70RMJrpLiYQn`), como esperado

O lado versionado foi obtido compilando `n8n/generated/principal.ts` com `toJSON()` (o mesmo grafo que
o inliner produz e que uma publicação levaria para a instância), e comparado **nó a nó e conexão a
conexão** por script, não a olho.

### 2.2 Contagens — batem dos dois lados

| | `n8n/generated/principal.ts` | publicado (`0B1nqjODu7xuYYKF`) |
| --- | --- | --- |
| Nós | **61** | **61** |
| Conexões (arestas) | **75** | **75** |
| Nós com conexões de saída | 60 | 60 |
| Nós só num lado | — | nenhum (0 sobrando, 0 faltando) |
| Conexões só num lado | — | nenhuma (0 sobrando, 0 faltando) |

Nome, `type` e `typeVersion` batem em **todos** os 61 nós — zero divergência de tipo ou de versão de nó.
A topologia é idêntica. **É esse par 61/75 que o T3 deve fixar como discriminante de MOD-01 AC2.**

### 2.3 Nó de modelo publicado — ponto de partida confirmado

O nó de modelo hoje na instância é, como o lote esperava:

```
Gemini Chat Model :: @n8n/n8n-nodes-langchain.lmChatGoogleGemini :: v1.1
parameters: { "modelName": "models/gemini-3.5-flash-lite", "options": { "temperature": 0.4 } }
```

Idêntico ao que a fonte declara. **Confirmado: a troca parte de `lmChatGoogleGemini` /
`models/gemini-3.5-flash-lite`.** Nenhum nó `lmChatOpenAi` existe na instância hoje.

### 2.4 Divergências cosméticas (não bloqueantes) — classificadas, não ignoradas

Foram medidos 113 pontos de diferença em `parameters`. Classificados um a um por script:

- **80 pontos presentes na fonte e ausentes no publicado** — *todos* são parâmetros cujo valor é
  igual ao default do nó, que o n8n não persiste. Os valores distintos são exatamente:
  `language="javaScript"`, `resource="row"|"message"`, `condition="eq"`, `returnAll=false`,
  `mode="runOnceForAllItems"|"load"`, `contentType="json"`, `method="GET"`, `resume="timeInterval"`,
  `unit="seconds"`, `messageType="text"`, `simplifyOutput=true`, `hasOutputParser=false`,
  `source="database"`, `insertMode="insert"`, `hideFromUI=false`, `batchSize=1`,
  `messageStatusUpdates=[]`. Nenhum altera comportamento.
- **31 pontos presentes no publicado e ausentes na fonte** — *todos* são `options = {}` vazio e
  `conditions.options.version = 1`, que a UI do n8n materializa ao salvar. Nenhum altera comportamento.
- **2 diferenças de valor**, ambas em `jsCode` (`Code: preparar clear de buffer (turno do agente)` e
  `Code: preparar turno para memória`): a única diferença é **uma quebra de linha final** que o n8n
  remove ao persistir (146→145 e 655→654 caracteres). Confirmado por script que os dois textos são
  idênticos ignorando espaço em branco final. Mesmo JavaScript.
- **Posições de canvas**: 52 nós diferem, quase todos por ≤12px (encaixe de grade da UI). Dois se
  movimentaram de verdade: `Postgres Chat Memory` (+0,+140) e `Data Table: limpar buffer`
  (+5968,+212). Posição não afeta execução — é cosmético —, mas o deslocamento grande é registrado
  aqui porque **é sinal de que alguém arrastou nós na UI** em algum momento, o que é o contexto que
  torna o achado da §2.5 plausível.

Credenciais não são comparáveis por esta via: `get_workflow_details` devolve `credentials: {}` para
todos os nós (a ferramenta não expõe o vínculo de credencial), e o `toJSON()` do SDK também não
resolve `newCredential()`. Não é divergência observada — é **não observável por este instrumento**, e
está registrado como tal em vez de afirmado nos dois sentidos.

### 2.5 DIVERGÊNCIA LÓGICA — configurações de execução ausentes no publicado

Três nós têm, na fonte versionada, configurações **de nível de nó** que governam comportamento em
falha, e que **não existem no workflow publicado**:

| Nó | Fonte (`n8n/workflows/principal.ts`) | Publicado |
| --- | --- | --- |
| `HTTP: GET /leads/{id}/messages (semeadura)` | `retryOnFail: true`, `maxTries: 3`, `waitBetweenTries: 2000`, **`onError: "continueRegularOutput"`**, **`alwaysOutputData: true`** (linhas 808-814) | **nenhuma das cinco** |
| `HTTP: registrar mensagem fixa` | `retryOnFail: true`, `maxTries: 3`, `waitBetweenTries: 2000` (linhas 1633-1637) | **nenhuma das três** |
| `consultar_documentos` | `retryOnFail: true`, `maxTries: 2` (linhas 1150-1151) | **nenhuma das duas** |

Para contraste — e isto é o que descarta "a ferramenta não devolve esses campos" como explicação —
os outros 4 nós HTTP do mesmo workflow **devolvem** essas configurações normalmente no publicado.
Ex.: `HTTP: GET /settings` publicado traz `retryOnFail: true, maxTries: 3, waitBetweenTries: 2000`.
A ausência nos três nós acima é dado real, não limitação de instrumento.

**Por que isto é lógico e não cosmético**: `onError: "continueRegularOutput"` + `alwaysOutputData` no
nó de semeadura é exatamente o que a própria fonte documenta nas linhas 802-803 — *"histórico vazio ->
segue com memória vazia (onError: continueRegularOutput + alwaysOutputData), nunca aborta o turno"*.
Sem essas duas configurações, uma falha desse GET **aborta o turno do agente** em vez de seguir com
memória vazia. Ou seja: a instância roda hoje um comportamento de falha diferente do que a fonte
versionada descreve e do que o design do lote-6c decidiu. `retryOnFail` nos outros dois é da mesma
natureza — menos grave, mas ainda semântica de execução, não aparência.

### 2.6 Direção da divergência — o que o orquestrador precisa saber para decidir

A divergência é **por ausência no publicado**, não por alteração no publicado: a fonte tem *mais*
configuração que a instância, e não existe nenhum ponto em que a instância tenha algo que a fonte não
tenha (fora os defaults cosméticos da §2.4). Em outras palavras, o cenário que a condição de parada
teme — *"publicar por cima apagaria uma alteração feita na UI que ninguém registrou"* — **não** é o
cenário aqui: publicar `n8n/generated/principal.ts` por cima **restauraria** as configurações que a
fonte já declara, sem apagar trabalho de UI não registrado.

Isso **não** autoriza publicar. A regra do lote manda parar e devolver a decisão ao orquestrador, e é
o que este worker fez. Registrado aqui para que a decisão seja tomada com o sinal certo em mãos, e
não com a suposição pessimista. Duas leituras possíveis, ambas plausíveis, nenhuma confirmável com o
que está disponível aqui:

1. A última publicação foi feita por um caminho que não carrega configurações de nível de nó (o
   próprio MCP `update_workflow` opera por operações nomeadas — `setNodeSettings` é uma operação
   separada de `addNode`, e é fácil uma publicação anterior ter aplicado nós sem aplicar settings).
2. Alguém editou o workflow na UI e as removeu — menos provável, porque remover `retryOnFail` de três
   nós dispersos não é um gesto de UI natural, e o deslocamento de canvas da §2.4 indica interação de
   UI de arrastar, não de reconfigurar.

A hipótese 1 é a mais consistente com a evidência. Nenhuma das duas foi confirmada — dito assim em
vez de escolhido por conveniência.

### 2.7 O que fica pendente da decisão do orquestrador

- Se a decisão for **publicar e reconciliar**: o T5 fecha a lacuna sozinho, porque a publicação leva a
  fonte inteira (nó de modelo **e** as configurações da §2.5). Convém confirmar depois da publicação
  que os três nós passaram a ter as configurações, senão a hipótese 1 acima se confirma como um
  buraco do próprio pipeline de publicação — e aí é bug de pipeline, não deste lote.
- Se a decisão for **investigar antes**: nada aqui bloqueia a leitura; o workflow segue ativo e
  funcional com Gemini.
- Em qualquer caso, **T3/T4/T5 não foram executados** e o nó de modelo continua Gemini na fonte e na
  instância. Nada foi publicado, alterado ou revertido por este worker.


---

## T3-T4 — Troca do modelo na fonte e no gerado (2026-09-05)

Decisão do orquestrador sobre a §2.5: **publicar e seguir** (autorizada pelo usuário). O batch
retomou em T3 com esse aval — a §2.6 já registrava que a divergência é por ausência no publicado, e
portanto que publicar restaura em vez de apagar.

- **T3** (`6f45b04`): `agentModel` em `n8n/workflows/principal.ts` deixa de ser
  `@n8n/n8n-nodes-langchain.lmChatGoogleGemini` v1.1 / `models/gemini-3.5-flash-lite` /
  `temperature: 0.4` e passa a `@n8n/n8n-nodes-langchain.lmChatOpenAi` v1.3, `model` como resource
  locator (`value` = `cachedResultName` = `gpt-5.4-nano-2026-03-17`),
  `options: { reasoningEffort: "low", timeout: 120000 }`, credencial `openAiApi` "OpenAI account".
  Suíte nova `n8n/workflows/__tests__/principal-modelo.test.ts` (7 testes) fixa o nó novo **e** o que
  não podia mudar (5 tools, memória, 61 nós / 75 conexões da §2.2).
- **Contagem de testes**: `npx vitest run` = **1022 passed (1022) em 82 arquivos**. Piso de T1 era
  1015 em 81 arquivos: +7 testes, +1 arquivo, exatamente a suíte nova. Nenhuma deleção silenciosa.
- **T4** (`8d517d6`): `node scripts/n8n-inline.mjs` rodado; `git diff n8n/generated/principal.ts`
  ficou **inteiramente dentro do bloco `agentModel`** (linhas 1245-1290 do gerado) — nenhuma linha
  fora dele. Gate `npx vitest run && npm run lint && npm run build` verde (lint com os mesmos 3
  avisos pré-existentes de `ifElse` não usado e diretiva eslint redundante, 0 erros).

---

## T5 — Publicação do nó de modelo na instância (2026-09-05)

### 5.1 O que foi publicado, e como

Workflow `crivo-agente-principal` (`0B1nqjODu7xuYYKF`), via MCP `update_workflow` + `publish_workflow`
— **nenhuma edição pela UI** (AD-014). As operações foram a tradução mecânica do que
`n8n/generated/principal.ts` declara para os nós afetados:

1. `removeNode` `Gemini Chat Model`
2. `addNode` `OpenAI Chat Model` (`lmChatOpenAi` v1.3, mesmos `parameters` e `position` do gerado,
   credencial `openAiApi` id `bGnmNn5iFH4sBCoo` "OpenAI account")
3. `addConnection` `OpenAI Chat Model` → `AI Agent` em `ai_languageModel`
4. `setNodeSettings` em `HTTP: GET /leads/{id}/messages (semeadura)` e em
   `HTTP: registrar mensagem fixa` — as configurações da §2.5

**Id da versão publicada: `8f9f8418-35b0-4d63-b8a0-e522f6f4e679`** (a anterior era
`d3105bb3-8522-449c-aa7c-0569d6a2a547`). `versionId` == `activeVersionId` — o publicado é o ativo, sem
draft pendente.

### 5.2 Confirmação por `get_workflow_details` depois da publicação

| Item | Resultado |
| --- | --- |
| Nó de modelo | `OpenAI Chat Model`, `@n8n/n8n-nodes-langchain.lmChatOpenAi`, `typeVersion 1.3` |
| `model` | `{ __rl: true, mode: "list", value: "gpt-5.4-nano-2026-03-17", cachedResultName: "gpt-5.4-nano-2026-03-17" }` |
| `options` | `{ reasoningEffort: "low", timeout: 120000 }` — sem `temperature` |
| Conexão | `OpenAI Chat Model --ai_languageModel--> AI Agent` |
| Nós Gemini remanescentes | **nenhum** (busca por tipo e por nome: 0) |
| Contagens | **61 nós / 75 conexões** — idênticas à §2.2, a troca não mexeu em mais nada |
| `active` | `true` (`isArchived: false`) |
| `settings.errorWorkflow` | `73Yx70RMJrpLiYQn` = `crivo-agente-erros`, inalterado |

**Credenciais continuam não observáveis por esta via**: `get_workflow_details` e
`get_workflow_version` devolvem credencial vazia para **0 de 61** nós — inclusive para nós que
comprovadamente têm credencial (WhatsApp, Postgres). Não é sinal de que a credencial do nó novo
faltou; é a mesma limitação de instrumento já registrada na §2.4. A credencial foi passada
explicitamente no `addNode` e a resposta do MCP veio com `autoAssignedCredentials: []` (nada precisou
ser inferido). Confirmação real só virá da primeira execução — T7.

### 5.3 Fechamento da §2.5 — 2 de 3 restaurados, e o terceiro é OUTRA coisa

| Nó | Depois da publicação |
| --- | --- |
| `HTTP: GET /leads/{id}/messages (semeadura)` | **restaurado**: `retryOnFail: true`, `maxTries: 3`, `waitBetweenTries: 2000`, `onError: "continueRegularOutput"`, `alwaysOutputData: true` |
| `HTTP: registrar mensagem fixa` | **restaurado**: `retryOnFail: true`, `maxTries: 3`, `waitBetweenTries: 2000` |
| `consultar_documentos` | **CONTINUA SEM** `retryOnFail`/`maxTries` |

> **ACHADO NOVO — `consultar_documentos` não é lacuna de publicação, é bug da fonte.**
> Em `n8n/workflows/principal.ts` (linha **1150**), `retryOnFail: true` e `maxTries: 2` estão
> declarados **dentro de `parameters`**, e não no nível do `config` do nó — repare na indentação: os
> outros seis `retryOnFail` do arquivo (linhas 420, 480, 556, 650, 810, 1652) estão a 4 espaços,
> nível de `config`; o da 1150 está a 6, dentro de `parameters`. `toJSON()` os emite por isso como
> parâmetros do nó, e o n8n os **descarta ao salvar** (não são parâmetros válidos de
> `httpRequestTool`). Ou seja: `retryOnFail` nesse nó **nunca esteve em vigor**, nem antes nem
> depois desta publicação, e nenhuma republicação vai corrigi-lo enquanto a fonte estiver assim.
>
> Isso **refuta parcialmente a hipótese 1 da §2.6** (buraco no pipeline de publicação): o pipeline
> restaurou corretamente os dois nós cuja fonte declara as configurações no lugar certo. O terceiro
> caso era, o tempo todo, uma declaração no lugar errado.
>
> **Consequência prática**: `consultar_documentos` não tem retry — uma falha transitória do
> `GET /context` volta ao agente como erro de tool na primeira tentativa. O `neverError` das
> `options` continua valendo (a tool devolve a resposta em vez de abortar o turno), então o impacto é
> "o agente perde a consulta de documentos naquele turno", não "o turno morre".
>
> **Não corrigido aqui, de propósito**: consertar a indentação é mudança de fonte + regeneração +
> republicação, fora do escopo de T5 (que é publicar o que T4 gerou) e sem relação com a troca de
> modelo. Fica registrado como item para o backlog do lote, com a linha exata.

### 5.4 Avisos de validação na publicação

`update_workflow` devolveu 5 avisos `SUBNODE_NOT_CONNECTED`, todos sobre os nós
`Chat Memory Manager: *` (`memoryManager`). São **pré-existentes e esperados**: esses nós são usados
no fluxo principal com a memória pendurada como subnode deles, não como subnodes de um agente — o
validador do MCP não modela esse arranjo. Nenhum deles é o nó tocado por esta publicação, e as
contagens 61/75 provam que nada foi desconectado. Registrado para que a próxima publicação não os
confunda com regressão.

---

## T7 — BATERIA NÃO REALIZADA: conta OpenAI sem créditos (2026-09-05)

> **VEREDITO: BLOQUEIO POR CAUSA ALHEIA AO MODELO. `bateria.md` §6.2, 4ª cláusula.**
> A bateria **não rodou**: o modelo não chegou a ser invocado nenhuma vez. Nenhuma das 5 tools foi
> exercitada, R1 e R2 são **indeterminados**, e o veredito de T9 **não pode ser emitido**.
> **Nenhum rollback foi disparado** e nenhuma linha de código foi alterada. T7, T8 e T9 ficam
> **não concluídas**; T10 e T11 não foram iniciadas. A decisão é do orquestrador/usuário.

### 7.1 O que foi tentado, exatamente como `bateria.md` manda

Alvo correto e respeitado: tenant `triangulo`, `phoneNumberId` `1321478747709350`, **`waId`
`553490000010`** (lead de descarte). **O `waId` `553499532444` do roteiro do smoke não foi tocado em
nenhum momento** — nenhuma das duas execuções o referencia.

Disparo pelo mecanismo da §2: `test_workflow` no workflow `0B1nqjODu7xuYYKF` com `pinData` **só** no
nó `WhatsApp Trigger`, no formato achatado do webhook da Meta. Nenhum outro nó pinado.

| Execução | `wamid` | Turno (§4) | Intenção do lead | Status |
| --- | --- | --- | --- | --- |
| **`1884`** | `wamid.BATERIA-L10-1` | 1 | Interesse inicial, revela modalidade (apartamento usado, compra) | `error` |
| **`1885`** | `wamid.BATERIA-L10-2` | 2 | Revela região (Abadia) e pergunta quais documentos levar | `error` |

Só 2 turnos foram disparados porque o 2º confirmou que a falha é determinística. Turnos 3, 4 e 5
(enum inválido, agendamento, escalonamento) **não foram disparados** — não havia o que medir.

### 7.2 A falha, com o texto literal do erro

As duas execuções morrem no mesmo ponto, com a mesma mensagem, vinda do nó `AI Agent`
(`@n8n/n8n-nodes-langchain.agent` v3.1):

```
NodeOperationError: OpenAI: Rate limit reached
description: "You have no credits remaining. Add credits to continue using the API
              at https://platform.openai.com/settings/organization/billing/."
```

**"Rate limit reached" aqui é rótulo, não diagnóstico.** A `description` é o corpo real da resposta
da OpenAI: é o erro `insufficient_quota`, que a API devolve com HTTP 429 e o SDK rotula como classe
"rate limit". Não é throttle transitório — é **estado de faturamento**: a organização
`org-qkmJQuJ2WnvoIKMr2UJwIJkZ` está com saldo zerado.

Três fatos, dos dados de execução, que sustentam "determinístico" em vez de "tente de novo":

1. O nó de modelo já carrega `max_retries: 2` (visível no `ai_languageModel` de ambas as execuções).
   Cada execução, portanto, **já tentou 3 vezes** internamente antes de desistir.
2. As duas execuções, separadas por ~40 s (21:06:57Z e 21:07:33Z), falharam de forma idêntica.
3. A `description` é uma condição de saldo, não uma janela de tempo. Nenhuma espera a resolve.

### 7.3 Por que isto não é R1, não é R2, e não autoriza rollback

`bateria.md` §6.2 nomeia este caso na letra: *"a execução falhou por causa **alheia ao modelo**
(credencial, quota, rede) — isso não é R1 nem R2: é bateria não realizada, e a rodada não conta
contra o orçamento da §4."*

O telemetry do nó `AI Agent` fecha a questão — o modelo não produziu **nenhuma** saída:

```
ai.agent.tool_calls.requested: 0
ai.agent.tool_calls.completed: 0
ai.agent.iteration.count:      0
ai.agent.execution.succeeded:  false
ai.agent.failure.type:         NodeOperationError
```

- **R1 (cobertura das 5 tools) é indeterminado, não verdadeiro.** R1 lê "zero passos `action.tool`
  ao fim do orçamento de 2 rodadas". Aqui há zero passos porque **o orçamento não foi gasto**: o
  modelo nunca respondeu para poder chamar tool alguma. Ler isso como `R1 = verdadeiro` seria
  reprovar o `gpt-5.4-nano` por uma fatura não paga — exatamente o erro que a §6.2 existe para
  impedir. As duas rodadas da §4 continuam **integralmente disponíveis**.
- **R2 (sobrevivência à recusa) é indeterminado.** O turno do enum inválido (§5) nunca foi disparado;
  não há recusa `payload-invalido` observada, e portanto nada a julgar. **T8 não foi executada.**
- **Logo, T9 não tem veredito.** Nem APROVADO (R1/R2 não são falsos — são desconhecidos) nem
  REPROVADO. `n8n/workflows/principal.ts` e `n8n/generated/principal.ts` **não foram tocados** por
  esta task, e o modelo publicado na instância continua `gpt-5.4-nano-2026-03-17`
  (versão `8f9f8418-35b0-4d63-b8a0-e522f6f4e679`, `active: true`).

### 7.4 O que ficou PROVADO por estas duas execuções

O bloqueio é tardio: tudo antes do nó de modelo rodou de verdade, com credencial real. Isso fecha uma
pendência honesta que a §5.2 deixara em aberto ("confirmação real só virá da primeira execução — T7"):

| Confirmado | Evidência (execuções `1884` / `1885`) |
| --- | --- |
| `pinData` só no `WhatsApp Trigger` funciona | As duas execuções alcançaram o `AI Agent`; nenhum nó intermediário precisou de pin |
| Chave de serviço do CRM válida | `POST /leads` idempotente devolveu o lead `60f537c3-e8a5-4ad2-b036-b37dca2ab3df`; `GET /settings` e `GET /leads/{id}/messages` devolveram corpo real |
| `Code: gate` roteia certo | `route: "conversa"` nas duas |
| Debounce e buffer funcionam | `bufferArray` da `1885` traz as 2 mensagens na ordem; `perguntadosJson` evoluiu de `["modality"]` para `["modality","region"]` |
| Nó de modelo publicado é o do T5 | O `ai_languageModel` mostra `model: "gpt-5.4-nano-2026-03-17"`, `timeout: 120000`, `model_kwargs.reasoning.effort: "low"` — sem `temperature` |
| **Credencial OpenAI está vinculada e é usada** | A chamada saiu para `https://api.openai.com/v1` com a org `org-qkmJQuJ2WnvoIKMr2UJwIJkZ`. A falha é de **saldo**, não de credencial ausente — o que a §5.2 não conseguia observar por `get_workflow_details` |

Dito de forma honesta: **o único elo não exercitado da cadeia é justamente o que a bateria existe
para medir.**

### 7.5 Rejeito deixado no ambiente — alvos de limpeza pendentes

As duas execuções chegaram a escrever antes de morrer. Nada disso foi limpo por este worker (limpar
exige acesso direto ao Postgres da instância e ao CRM, e a bateria pode ser retomada exatamente daqui
se a quota voltar — apagar agora custaria o estado já construído):

| # | Alvo | Chave |
| --- | --- | --- |
| 1 | Lead de descarte no CRM | `id 60f537c3-e8a5-4ad2-b036-b37dca2ab3df`, `externalId 553490000010`, `status em_qualificacao` — com 2 mensagens (`6a54fa57-…`, `af9d7f61-…`) |
| 2 | Linha de `conversa_estado` (`ZsplBxJjXv3kwKZ8`) | `id 18`, `tenantSlug triangulo` + `waId 553490000010`, `perguntadosJson ["modality","region"]` |
| 3 | Sessão `n8n_chat_histories` | Chave `"triangulo:553490000010"` — provavelmente vazia (`ai.agent.memory.saves: 0` nas duas execuções), mas o `loadMemoryVariables` foi chamado; conferir antes da Fase 5 |
| 4 | Evento no Google Calendar | **Nenhum** — o turno 4 nunca rodou. `agendar_reuniao` não foi chamada nenhuma vez |

Nenhum desses alvos é o lead do roteiro do smoke.

### 7.6 O que o orquestrador precisa decidir

Este worker **não** escolhe entre as opções abaixo — `bateria.md` §6.2 tira essa decisão de quem
executa a bateria. Os dados para decidir:

- **Retomar no OpenAI** exige adicionar créditos à organização `org-qkmJQuJ2WnvoIKMr2UJwIJkZ`. Nada
  de código muda; a bateria recomeça do turno 1 com o orçamento da §4 intacto, depois de limpar os
  alvos da §7.5 (o lead já tem `modality` e `region` marcados como perguntados).
- **Trocar de modelo** é possível sem obstáculo técnico: a credencial `Google Gemini(PaLM) Api
  account` (`kXQDjxSVrWhSCr6H`, tipo `googlePalmApi`) **continua existindo na instância**, então o
  rollback de `6.1` é executável a qualquer momento. Mas fazê-lo **agora** seria reverter o
  `gpt-5.4-nano` sem nenhuma evidência contra ele — o oposto do que o portão de rollback foi
  desenhado para fazer.
- **Seguir para a Fase 4 sem a bateria** deixaria T9 permanentemente sem veredito e MOD-02 sem
  fechamento. O roteiro (T10/T11) é documental e não depende do modelo, mas a Fase 5 depende: uma
  conversa real no WhatsApp bate no mesmo `insufficient_quota` e morre no mesmo nó.

---

## T7 (2ª tentativa) — BATERIA PARADA NO TURNO 1: estado sujo + credencial do Calendar (2026-09-05)

> **VEREDITO: DUAS CONDIÇÕES DE PARADA DISPARARAM ANTES DE QUALQUER MEDIÇÃO VÁLIDA.**
> (1) A limpeza dos alvos da §7.5 **não foi efetivada** — o turno 1 encontrou o lead de descarte e a
> linha `id 18` de `conversa_estado` vivos, com o buffer da tentativa anterior intacto; a bateria
> rodou, sem querer, **sobre estado sujo**. (2) A credencial `Google Calendar account` da instância
> **precisa ser reconectada**, o que torna `agendar_reuniao` não mensurável.
> **Esta rodada NÃO conta contra o orçamento de 2 rodadas da `bateria.md` §4** — nem por §6.2
> (causa alheia ao modelo), nem como medição, porque o turno 1 não partiu do estado inicial que a
> §4 pressupõe. **Nenhum rollback foi disparado. Nenhuma linha de código foi alterada.**
> T7, T8 e T9 continuam **não concluídas**; T10 e T11 não foram iniciadas.

### 8.1 O bloqueio anterior (§7) está resolvido — a quota da OpenAI voltou

O primeiro fato a registrar é positivo e fecha a §7: **o `insufficient_quota` sumiu**. Na execução
`1886` o nó `OpenAI Chat Model` respondeu **8 vezes** (8 `subRun` registrados), o `AI Agent` emitiu
**8 chamadas de tool** com argumentos bem formados e recebeu 8 `observation`. O elo que a §7.4
apontava como "o único não exercitado da cadeia" **passou a ser exercitável**. Nada abaixo põe isso
em dúvida — o que segue é sobre o *ambiente*, não sobre o modelo.

### 8.2 Como o turno 1 foi disparado

Mecanismo da `bateria.md` §2, sem desvio: `test_workflow` em `0B1nqjODu7xuYYKF`, `pinData` **só** no
nó `WhatsApp Trigger`, `timeout` 300 s, `triggerNodeName: "WhatsApp Trigger"`. Alvo correto: tenant
`triangulo`, `phoneNumberId` `1321478747709350`, **`waId` `553490000010`**. O `wamid` recebeu série
nova (`wamid.BATERIA-L10-R1-1`) para não colidir com os ids da tentativa anterior.

**O `waId` `553499532444` do roteiro do smoke não foi tocado** — a execução `1886` não o referencia
em nenhum ponto.

| Execução | `wamid` | Turno (§4) | Intenção do lead | Status |
| --- | --- | --- | --- | --- |
| **`1886`** | `wamid.BATERIA-L10-R1-1` | 1 | Interesse inicial, revela modalidade (apartamento usado, compra) | `error` — `Max iterations (8) reached` no nó `AI Agent` |

Turnos 2 a 5 **não foram disparados**: as duas condições de parada abaixo já eram visíveis nos dados
da `1886`, e continuar só aprofundaria a contaminação.

### 8.3 PARADA 1 — a limpeza dos três alvos não foi efetivada

A verificação foi feita **nos dados da própria execução `1886`** (os alvos 1 e 3 não são legíveis por
nenhuma ferramenta MCP disponível: não existe tool de leitura de linha de Data Table, e as variáveis
de ambiente do projeto são inacessíveis a agentes por política, o que impede consultar o Postgres da
instância ou a API do CRM diretamente).

| # | Alvo (§7.5) | Esperado se limpo | **Observado na `1886`** |
| --- | --- | --- | --- |
| 1 | Lead no CRM | `POST /leads` idempotente devolveria um **id novo** | `HTTP: POST /leads (idempotente)` devolveu **`60f537c3-e8a5-4ad2-b036-b37dca2ab3df`** — **o mesmo id da tentativa anterior**, `status em_qualificacao`, `firstContactAt 2026-09-05T21:06:24.000Z` |
| 1b | Mensagens do lead | Só a mensagem do turno novo | `HTTP: GET /leads/{id}/messages (semeadura)` devolveu **3** mensagens: `6a54fa57-…` e `af9d7f61-…` (as duas da tentativa anterior) **mais** a nova `fb675a4c-…` |
| 2 | Linha de `conversa_estado` | Linha ausente (id novo ao ser criada) | `Data Table: conversa_estado (antes do buffer)` devolveu **`id 18`**, `createdAt 2026-09-05T21:06:39.643Z` — **a mesma linha**, com `perguntadosJson ["modality","region"]` e `bufferJson` contendo `wamid.BATERIA-L10-1` e `wamid.BATERIA-L10-2` |
| 3 | Sessão `n8n_chat_histories` | Vazia | `Chat Memory Manager: carregar sessão` → `{"messages":[],"messagesCount":0}` — **este alvo está limpo** (como a §7.5 já previa: nunca chegou a ser escrito) |

**Sinal que enganou, e por que está registrado**: antes de disparar, `search_data_tables` mostrou
`conversa_estado` com `updatedAt: 2026-09-05T21:43:41.654Z` — 36 min depois das execuções
`1884`/`1885` e 4 min antes deste turno. Foi lido como indício de limpeza manual recente. **Era falso
indício**: esse `updatedAt` é do *registro da tabela*, não das linhas, e a linha `id 18` continuava lá
com `updatedAt 2026-09-05T21:07:32.295Z`. Fica registrado para que a próxima verificação **não** use
`search_data_tables` como prova de linha apagada — ele não prova nada sobre linhas.

**Consequência direta e mensurável da sujeira** — não é preocupação teórica:

1. O `bufferJson` velho foi **reidratado**: `Code: gate` entregou ao agente um `bufferArray` com as
   **3** mensagens (as 2 antigas + a nova), como se o lead tivesse acabado de mandar as três.
2. `perguntadosJson` saltou de `["modality","region"]` para **`["modality","region","propertyType"]`**
   já no turno 1 — ou seja, `resolveConversationPhase` colocou a conversa na fase **`agendando`**
   **no primeiro turno**, quando a `bateria.md` §3 diz explicitamente que essa fase "não é alcançável
   antes do 4º turno".
3. Por isso o agente foi direto tentar `agendar_reuniao` no turno 1. **A ordem de turnos da §4 foi
   violada pelo estado herdado, não pelo roteiro.** Qualquer leitura de R1/R2 sobre esta execução
   estaria medindo a sujeira, não o modelo.

### 8.4 PARADA 2 — credencial `Google Calendar account` precisa ser reconectada

As **três** chamadas de `agendar_reuniao` da execução `1886` voltaram com a mesma `observation`,
literal:

```
[{"error":"The credential \"Google Calendar account\" needs to be reconnected."}]
```

A credencial **existe** na instância (`list_credentials`: id `2kXea9a4br8Gn3pp`, tipo
`googleCalendarOAuth2Api`, projeto pessoal `tTVoFkYzH7IEInaG`) — o que caducou é o **token OAuth**.
Reconectar exige o fluxo OAuth na UI do n8n, ação do usuário; nenhum worker pode fazê-la.

**Por que isto é uma parada, e não um resultado**: a `bateria.md` §3 diz que "o efeito externo não
conta" — a Meta recusando o número fictício ou o Calendar recusando *o evento* são falhas do ambiente
de descarte. Mas aqui a tool **nem alcançou** o Google: o nó falhou na resolução da credencial, antes
da chamada. Isso é a 4ª cláusula da §6.2 pela letra — *"a execução falhou por causa alheia ao modelo
(credencial, quota, rede)"* — e vale especificamente para `agendar_reuniao`: enquanto o token estiver
caducado, essa tool **não é mensurável**, e a §7 alvo 4 (evento fantasma no calendário) fica sem
risco, porque nenhum evento chega a ser criado.

Vale notar o contraste que confirma o diagnóstico: `consultar_documentos` e `responder_lead`
alcançaram seus serviços e voltaram com **corpo real**. Não é falha geral de credenciais — é esta.

### 8.5 O que a execução `1886` mostrou mesmo assim — registrado, mas SEM valor de veredito

Isto **não** é evidência de T7. Está aqui porque descartar observação real seria pior que registrá-la
com a ressalva certa. **Nenhuma linha desta seção pode ser citada em R1 ou R2.**

Passos do `AI Agent` na `1886`, na ordem (8 iterações, `maxIterations: 8`):

| # | `action.tool` | `toolInput` (resumo) | `observation` |
| --- | --- | --- | --- |
| 1 | `consultar_documentos` | `{}` | lista real com 2 documentos (`Tabela de Preços…`, `Modelo de Contrato Padrão.docx`) |
| 2 | `agendar_reuniao` | `meetingAtProposto: "2026-09-07T10:00:00-03:00"` | `credential … needs to be reconnected` |
| 3 | `responder_lead` | mensagem abrindo com "Boa, …" | `{"ok":false,"reason":"abertura-proibida"}` |
| 4 | `responder_lead` | mensagem reescrita, abertura trocada | `{"error":"Bad request - please check your parameters"}` |
| 5 | `agendar_reuniao` | `meetingAtProposto: "2026-09-07T15:00:00-03:00"` | `credential … needs to be reconnected` |
| 6 | `responder_lead` | mensagem abrindo com "Boa! …" | `{"ok":false,"reason":"abertura-proibida"}` |
| 7 | `agendar_reuniao` | `meetingAtProposto: "2026-09-07T17:00:00-03:00"` | `credential … needs to be reconnected` |
| 8 | `responder_lead` | mensagem abrindo com "Boa! …" | `{"ok":false,"reason":"abertura-proibida"}` |

Leitura honesta, com as ressalvas na frente:

- **`registrar_qualificacao` não foi chamada** neste turno. Mas o turno **não era** o turno 1 do
  roteiro na prática: o estado sujo já marcava `modality`, `region` e `propertyType` como perguntados
  e empurrou a conversa para `agendando`. Não dá para dizer se o modelo deixaria de registrar
  qualificação num turno 1 limpo. **Indeterminado, não "não chamada".**
- **`escalar_para_humano` não foi chamada** — correto e esperado: §4 a reserva para o último turno.
- `abertura-proibida` **não é falha do ambiente**: é a barreira determinística de persona
  (`n8n/src/voice.mjs:74`, VOZ-01 AC1) rejeitando aberturas como "Boa"/"Show". Ela funcionou como
  projetada. O que se observa é o modelo **reincidindo** na mesma classe de abertura três vezes
  (passos 3, 6, 8) em vez de mudar de estratégia — sinal de estilo que **merece ser reavaliado numa
  rodada limpa**, mas que aqui está confundido com o laço causado pelo Calendar quebrado.
- O `Bad request` do passo 4 é da própria tool `responder_lead` e **não** foi investigado — fora do
  escopo desta parada, fica anotado como ponto a observar na rodada limpa.
- O `Max iterations (8)` que matou a execução é **consequência do ambiente**: 3 das 8 iterações foram
  gastas batendo numa credencial caducada. Não é R2 — R2 fala do turno do enum inválido (§5), que
  **nunca foi disparado**.

### 8.6 Estado de R1, R2 e do veredito de T9

- **R1 — indeterminado.** O orçamento de 2 rodadas da §4 continua **integralmente disponível**: esta
  execução não é uma rodada, é um turno abortado sobre estado sujo.
- **R2 — indeterminado.** O turno do enum inválido (§5) não foi disparado; nenhuma recusa
  `payload-invalido` foi observada. **T8 não foi executada.**
- **T9 sem veredito.** Nem APROVADO nem REPROVADO. `n8n/workflows/principal.ts` e
  `n8n/generated/principal.ts` **não foram tocados**; o modelo publicado segue
  `gpt-5.4-nano-2026-03-17` (versão `8f9f8418-35b0-4d63-b8a0-e522f6f4e679`, `active: true`).

### 8.7 Alvos de limpeza — estado atualizado (a `1886` acrescentou rejeito)

Substitui a tabela da §7.5. Tudo abaixo precisa ser limpo **antes** de retomar o turno 1.

| # | Alvo | Chave | Estado depois da `1886` |
| --- | --- | --- | --- |
| 1 | Lead de descarte no CRM | `id 60f537c3-e8a5-4ad2-b036-b37dca2ab3df`, `externalId 553490000010` | **vivo**, `status em_qualificacao`, agora com **3** mensagens: `6a54fa57-…`, `af9d7f61-…` e `fb675a4c-841d-405e-9993-11d2daca539b` (nova). Ordem de remoção: `messages` → `conversations` → `leads` |
| 2 | Linha de `conversa_estado` (`ZsplBxJjXv3kwKZ8`) | `id 18`, `tenantSlug triangulo` + `waId 553490000010` | **viva**, agora com `perguntadosJson ["modality","region","propertyType"]`, `bufferJson` com **3** mensagens e `updatedAt 2026-09-05T21:48:10.694Z`. **É a linha mais crítica**: é ela que forçou a fase `agendando` no turno 1 |
| 3 | Sessão `n8n_chat_histories` | `"triangulo:553490000010"` | **limpa** — `messagesCount: 0` na carga, e `ai.agent.memory.saves: 0` (a execução morreu antes de salvar o turno) |
| 4 | Evento no Google Calendar | agenda de `tostamatias@gmail.com` | **nenhum** — as 3 tentativas de `agendar_reuniao` pararam na credencial, nada foi criado |

### 8.8 O que precisa acontecer antes de retomar

Duas coisas, ambas de fora deste worker, e a bateria **não deve ser retomada sem as duas**:

1. **Limpar os alvos 1 e 2 da §8.7** — e confirmar a limpeza por um meio que leia linha, não
   metadado de tabela (a armadilha da §8.3). Sem isso, o turno 1 volta a nascer na fase `agendando`.
2. **Reconectar a credencial `Google Calendar account`** (`2kXea9a4br8Gn3pp`) pelo fluxo OAuth na UI
   do n8n. Sem isso, `agendar_reuniao` é estruturalmente não mensurável e R1 ficaria verdadeiro por
   um motivo que não é o modelo — exatamente o erro que a §6.2 existe para impedir.

Feitas as duas, a bateria recomeça do turno 1 com o orçamento da §4 intacto. **Nenhuma decisão de
rollback pode ser tomada com o que existe hoje.**

---

## T7 — BATERIA REALIZADA: as 5 tools exercitadas (2026-09-05)

> **VEREDITO DE T7: as 5 tools têm chamada bem-sucedida pela definição da `bateria.md` §3.**
> Esta é a **1ª rodada válida** do orçamento de 2 rodadas da §4 — a primeira em que o estado inicial
> estava limpo e o modelo respondeu. As duas tentativas anteriores (§7 e §8) continuam não contando:
> nenhuma mediu o modelo. **Orçamento restante: 1 rodada.**

### 9.1 Verificação de estado limpo — feita por EXECUÇÃO REAL, não por metadado

A lição da §8.3 foi aplicada: `search_data_tables` **não** foi usado como prova. A limpeza foi
confirmada dentro da própria execução `1900` (turno 1), em três pontos independentes:

| # | Alvo (§8.7) | Esperado se limpo | **Observado na `1900`** |
| --- | --- | --- | --- |
| 1 | Lead no CRM | `POST /leads` idempotente devolve um **id novo** | **`4f7f6784-3433-476a-8a7e-1abc47ba85a1`** — id **novo**; o `60f537c3-e8a5-4ad2-b036-b37dca2ab3df` das tentativas anteriores **não voltou**. `firstContactAt 2026-09-05T22:02:32.000Z` (deste turno), todos os campos de qualificação `null` |
| 1b | Mensagens do lead | Só a mensagem do turno novo | `GET /leads/{id}/messages (semeadura)` devolveu **1** mensagem (`d36f386e-…`). As 3 antigas sumiram |
| 2 | Linha de `conversa_estado` | Lookup vazio, linha criada com id novo | `Data Table: conversa_estado (antes do buffer)` devolveu **`{}`** (nenhuma linha). A linha nasceu como **`id 19`**, `createdAt 2026-09-05T22:02:43.573Z` — a `id 18` sumiu |
| 3 | Sessão `n8n_chat_histories` | Vazia | `ai.agent.memory.loads: 0` / `saves: 0` em todas as execuções |

**Consequência positiva mensurável**: `perguntadosJson` entrou o turno 1 como `["modality"]` (um único
campo, marcado por este turno) e a fase **não** era `agendando` — o oposto exato do sintoma da §8.3.
A ordem de turnos da §4 passou a ser governada pelo roteiro, não pelo estado herdado. **A limpeza
pegou.**

### 9.2 Disparo — mecanismo da §2, sem desvio

`test_workflow` em `0B1nqjODu7xuYYKF`, `pinData` **só** no nó `WhatsApp Trigger`, `timeout` 300 s,
`triggerNodeName: "WhatsApp Trigger"`. Alvo: tenant `triangulo`, `phoneNumberId` `1321478747709350`,
**`waId` `553490000010`**. Série de `wamid` nova (`wamid.BATERIA-L10-R2-*`).

**O `waId` `553499532444` do roteiro do smoke não foi tocado em nenhuma das 5 execuções.**

| Execução | `wamid` | Turno | Intenção do lead | Status final |
| --- | --- | --- | --- | --- |
| **`1900`** | `…R2-1` | 1 | Interesse inicial, revela modalidade (apartamento usado, compra) | `error` — `Max iterations (8)` |
| **`1910`** | `…R2-2` | 2 | Revela região (Abadia) e pergunta quais documentos levar | `error` — `Max iterations (8)` |
| **`1923`** | `…R2-3` | 3 | Confirma tipo de imóvel + motivação e forma de pagamento (caso do enum, §5) | `error` — `Max iterations (8)` |
| **`1934`** | `…R2-4` | 4 | Pede explicitamente para registrar motivação e status de crédito na ficha (§5, reescrito) | `error` — `Max iterations (8)` |
| **`1942`** | `…R2-5` | 5 | Pede falar com uma pessoa sobre pendência judicial | `error` — `Max iterations (8)` |

O turno 4 usou a permissão da §4 de **reescrever um turno para induzir mais diretamente** uma tool
que não apareceu: o turno 3 produziu `agendar_reuniao` mas não o enum inválido, então o turno 4 pediu
os dois campos do enum pelo nome. Continua dentro da 1ª rodada.

### 9.3 Cobertura das 5 tools — id de execução por tool

Definição aplicada, a da §3: passo com `action.tool` **e** `observation` correspondente. Recusa de
negócio do CRM (`400`/`409` `problem+json`) **conta**; efeito externo **não** conta.

| # | Tool | Chamada bem-sucedida? | Execuções | Observação mais forte |
| --- | --- | --- | --- | --- |
| 1 | `registrar_qualificacao` | **SIM** | `1900`, `1910`, `1923`, `1934`, `1942` | Corpo real do lead atualizado (`propertyType`, `region`, `motivation`, `creditStatus`) |
| 2 | `consultar_documentos` | **SIM** | `1910`, `1923`, `1942` | Lista real com 2 documentos (`Tabela de Preços - Empreendimentos Novos.pdf`, `Modelo de Contrato Padrão.docx`) |
| 3 | `responder_lead` | **SIM** | `1900`, `1910`, `1923`, `1934`, `1942` | `{"ok":false,"reason":"abertura-proibida"}` (barreira de persona) e a falha de envio ao número fictício — as duas contam pela §3 |
| 4 | `agendar_reuniao` | **SIM** | **`1923`** | `{"ok":true,"meetingAt":"2026-09-07T10:00:00-03:00","meetLink":"https://www.google.com/calendar/event?eid=NnJjaTR0NmhoaWdvMHFjaGkwaXF0dnZvM3MgdG9zdGFtYXRpYXNAbQ","corretor":{"name":"Fernanda Souza Lima"},"crmAtualizado":true,"eventoCriado":true}` |
| 5 | `escalar_para_humano` | **SIM** | **`1942`** | `409 transicao-invalida` (`code: "transicao-invalida"`) — recusa de negócio do CRM, que a §3 conta como chamada bem-sucedida |

**Nenhuma tool ficou não chamada.** R1 da §6 é, portanto, **falso**.

**Sobre a `escalar_para_humano` e o `409`**: a tool foi chamada com `motivo` bem formado ("Lead
solicitou atendimento com pessoa de verdade para tratar pendência judicial que trava financiamento").
O CRM recusou com `transicao-invalida` porque o lead já estava em `qualificado_agendado` desde o turno
3 — não existe transição desse status para `escalado_humano`. É recusa de **negócio**, prevista pela
§3 como chamada bem-sucedida. Efeito colateral favorável, aliás: o lead **não** ficou travado em
`somente-registrar`, que é o risco que a §4 queria evitar ao pôr essa tool por último.

### 9.4 A credencial do Google Calendar está funcional — a PARADA 2 da §8.4 está resolvida

A `agendar_reuniao` da execução `1923` voltou com `eventoCriado: true`, `crmAtualizado: true` e um
`meetLink` real. A mensagem `The credential "Google Calendar account" needs to be reconnected` da §8.4
**não apareceu nenhuma vez** nas 5 execuções. O token OAuth foi reconectado com sucesso.

**Consequência de limpeza**: existe agora um **evento real** na agenda de `tostamatias@gmail.com` em
**2026-09-07 10:00 (-03:00)**. É o alvo 4 da `bateria.md` §7, e desta vez ele **não está vazio**.

### 9.5 A fase `agendando` chegou no turno 3, não no 4 — e isso não é sujeira

A `bateria.md` §3 afirma que `agendar_reuniao` "não é alcançável antes do 4º turno". Na prática foi
alcançada no **turno 3**, e a causa é de ordenação interna, não de estado herdado: o nó
`Data Table: marcar campo perguntado` marca o campo **antes** de o agente rodar. Logo o turno 1 marcou
`modality`, o 2 marcou `region` e o 3 marcou `propertyType` — e `resolveConversationPhase` já
resolveu `agendando` **dentro do próprio turno 3**. A contagem da §3 assumia marcação depois do turno.

Fica registrado como **imprecisão da `bateria.md` §3**, não como contaminação: a linha `id 19` nasceu
vazia nesta rodada (§9.1) e cada turno marcou exatamente um campo, na ordem. Item para o backlog.

### 9.6 Todas as 5 execuções morreram em `Max iterations (8)` — a causa, medida

Isto **não** é falha do modelo, e a evidência é direta. `responder_lead` é a única via de resposta e
**não pode ter sucesso neste ambiente**: o destinatário é fictício. Confirmado no sub-workflow
`tool-responder-lead` (`Li2hgCX943zKmDXf`), execução **`1903`**, filha da `1900`:

```
NodeApiError no no "WhatsApp: enviar resposta do agente"
statusCode: 400
error.code: 131030
error.message: "Recipient phone number not in allowed list"
recipientMsisdn: "5534990000010"
```

É **exatamente** o erro que a `bateria.md` §3 pré-declara como não contando contra o modelo. O efeito
não previsto pela §3 é o de segunda ordem: como `responder_lead` nunca devolve sucesso, o agente nunca
consegue emitir resposta final e **sempre** consome as 8 iterações. Isso vale para qualquer modelo
neste alvo — é propriedade do ambiente de descarte, não do `gpt-5.4-nano`.

As execuções filhas que voltaram `success` (`1901`, `1902`, `1905`) são as barradas por
`abertura-proibida`: nessas o sub-workflow completa e devolve `{"ok":false,...}` sem chamar a Meta.

### 9.7 Observações de estilo — registradas, sem valor de veredito

Nenhuma linha desta seção entra em R1 ou R2. São sinais para a prova conversacional (Fase 5), onde o
número é real e o critério é outro.

- **Reincidência em abertura proibida**: o modelo abriu com "Boa"/"Show" e, após
  `{"ok":false,"reason":"abertura-proibida"}`, **voltou a abrir com a mesma classe de saudação** em
  vez de mudar de estratégia — `1900` (passos 3, 4, 6), `1934` (passos 6, 7 e 9). A barreira
  (`n8n/src/voice.mjs:74`, VOZ-01 AC1) funcionou como projetada em todas as vezes. O `agentVoiceTone`
  do tenant literalmente pede que o agente use "boa" e "show" para reagir ao que o lead conta, o que
  põe o tom configurado em conflito direto com a barreira — item para o backlog, não defeito do
  modelo.
- **Pedido de dado sensível**: em `1934` e `1942` o agente pediu **nome completo e CPF** ao lead
  ("pode mandar só os dados, sem foto"). Nada no roteiro pediu isso. Merece decisão de produto antes
  da Fase 5.
- **Registro de campo tardio**: em `1910` o lead revelou a região ("Abadia") e o agente **não** a
  registrou naquele turno — re-registrou `propertyType`. A `region` só foi gravada em `1923`.
- **Qualidade quando funciona**: em `1923` e `1942` as mensagens propostas eram coerentes, citavam a
  reunião confirmada e faziam uma pergunta de avanço por vez.

### 9.8 Alvos de limpeza depois desta rodada

Substitui a tabela da §8.7. **O alvo 4 deixou de ser vazio.**

| # | Alvo | Chave | Estado |
| --- | --- | --- | --- |
| 1 | Lead de descarte no CRM | `id 4f7f6784-3433-476a-8a7e-1abc47ba85a1`, `externalId 553490000010` | **vivo**, `status qualificado_agendado`, `meetingAt 2026-09-07T13:00:00.000Z`, com **5** mensagens (`d36f386e-…`, `277c43cb-…`, `cc46a64c-…`, `2ae32478-…`, `529c5afe-…`). Ordem de remoção: `messages` → `conversations` → `leads` |
| 2 | Linha de `conversa_estado` (`ZsplBxJjXv3kwKZ8`) | `id 19`, `tenantSlug triangulo` + `waId 553490000010` | **viva**, `perguntadosJson ["modality","region","propertyType"]`, `bufferJson` com as 5 mensagens |
| 3 | Sessão `n8n_chat_histories` | `"triangulo:553490000010"` | **limpa** — `ai.agent.memory.saves: 0` nas 5 execuções |
| 4 | **Evento no Google Calendar** | agenda de `tostamatias@gmail.com` | **EXISTE**: evento em **2026-09-07 10:00 (-03:00)** com Meet, criado pela `agendar_reuniao` da `1923`, corretora `Fernanda Souza Lima`. **Apagar antes da Fase 5** — senão o cenário 1 do smoke pode cair em `horario-ocupado` |

---

## T8 — Recusa por enum inválido: observada 5 vezes, em 3 execuções (2026-09-05)

> **RESULTADO: a recusa `400 payload-invalido` foi observada de verdade, com `code` íntegro, e o
> agente SEGUIU o turno nas três execuções — corrigindo o valor para um do enum e chegando a
> `responder_lead`.** Nenhuma das cláusulas de R2 que descrevem o comportamento do agente diante da
> recusa (§6 R2, cláusulas 2 e 3) foi observada.

### 10.1 As recusas, literais

O `neverError: true` das 3 tools nativas funcionou como projetado: o corpo `problem+json` chegou
íntegro ao agente como `observation`, com `code` legível.

| # | Execução | Chamada recusada | `observation` (literal) |
| --- | --- | --- | --- |
| 1 | **`1900`** (turno 1) | `registrar_qualificacao {campo: "propertyType", valor: "apartamento usado"}` | `{"type":"urn:crivo:problem:payload-invalido","title":"Payload inválido","status":400,"detail":"Campo 'propertyType' inválido. Valores aceitos: casa, apartamento.","code":"payload-invalido"}` |
| 2 | **`1934`** (turno 4) | `registrar_qualificacao {campo: "motivation", valor: "morar sozinho"}` | `…"detail":"Campo 'motivation' inválido. Valores aceitos: investidor, morador.","code":"payload-invalido"` |
| 3 | **`1934`** (turno 4) | `registrar_qualificacao {campo: "creditStatus", valor: "recurso próprio junto com FGTS"}` | `…"detail":"Campo 'creditStatus' inválido. Valores aceitos: pre_aprovado, recurso_proprio, fgts.","code":"payload-invalido"` |
| 4 | **`1942`** (turno 5) | `registrar_qualificacao {campo: "motivation", valor: "morar sozinho"}` | idem #2 |
| 5 | **`1942`** (turno 5) | `registrar_qualificacao {campo: "creditStatus", valor: "recurso próprio junto com FGTS para fechar"}` | idem #3 |

**`code` registrado: `payload-invalido`** (`type: urn:crivo:problem:payload-invalido`, `status: 400`)
nas cinco.

A recusa #1 é espontânea — não foi provocada pelo roteiro. O modelo tentou gravar o texto cru do lead
("apartamento usado") num campo de enum já no turno 1. As #2 e #3 são o caso da `bateria.md` §5,
provocado de propósito; as #4 e #5 são a repetição do mesmo caso num turno posterior, e servem de
confirmação de que o comportamento não foi sorte de uma execução.

### 10.2 Comportamento do agente depois da recusa: SEGUIU e CORRIGIU

Em nenhuma das três execuções o agente travou, abortou por causa da recusa, ou repetiu o valor
inválido. A sequência de passos, na ordem real:

**`1900`** — recusa no passo 1, correção no passo 2:

| Passo | `action.tool` | `toolInput` | `observation` |
| --- | --- | --- | --- |
| 1 | `registrar_qualificacao` | `propertyType: "apartamento usado"` | **`400 payload-invalido`** |
| 2 | `registrar_qualificacao` | `propertyType: "apartamento"` | corpo do lead, `propertyType: "apartamento"` — **gravado** |
| 3-8 | `responder_lead` | (6 tentativas) | `abertura-proibida` / falha de envio ao número fictício |

**`1934`** — duas recusas seguidas, duas correções, depois a resposta:

| Passo | `action.tool` | `toolInput` | `observation` |
| --- | --- | --- | --- |
| 1 | `registrar_qualificacao` | `region: "Abadia"` | ok |
| 2 | `registrar_qualificacao` | `motivation: "morar sozinho"` | **`400 payload-invalido`** |
| 3 | `registrar_qualificacao` | `creditStatus: "recurso próprio junto com FGTS"` | **`400 payload-invalido`** |
| 4 | `registrar_qualificacao` | `motivation: "morador"` | **gravado** |
| 5 | `registrar_qualificacao` | `creditStatus: "recurso_proprio"` | **gravado** |
| 6-8 | `responder_lead` | (3 tentativas) | `abertura-proibida` / falha de envio |

**`1942`** — duas recusas, outra tool no meio, depois correção e resposta:

| Passo | `action.tool` | `toolInput` | `observation` |
| --- | --- | --- | --- |
| 1 | `registrar_qualificacao` | `motivation: "morar sozinho"` | **`400 payload-invalido`** |
| 2 | `registrar_qualificacao` | `creditStatus: "recurso próprio junto com FGTS para fechar"` | **`400 payload-invalido`** |
| 3 | `escalar_para_humano` | `motivo: "…pendência judicial…"` | `409 transicao-invalida` |
| 4 | `registrar_qualificacao` | `motivation: "morador"` | **gravado** |
| 5 | `consultar_documentos` | `{}` | lista real |
| 6-8 | `responder_lead` | (4 tentativas) | `abertura-proibida` / falha de envio |

Três fatos que fecham a leitura, todos verificáveis nas tabelas acima:

1. **Correção, não teimosia.** Cada valor inválido foi tentado **exatamente uma vez**. O modelo leu o
   `detail` do `problem+json` (que lista os valores aceitos) e mandou um valor do enum na tentativa
   seguinte — `"morar sozinho"` → `"morador"`, `"recurso próprio junto com FGTS"` → `"recurso_proprio"`,
   `"apartamento usado"` → `"apartamento"`. A `bateria.md` §5 diz que corrigir "é bom, mas não é
   exigido"; o modelo fez o que não era exigido.
2. **Chegou a `responder_lead` nos três turnos.** O lead nunca ficou no vácuo por causa da recusa.
3. **A recusa não abortou nada.** Em `1942` o agente ainda chamou mais duas tools (`escalar_para_humano`,
   `consultar_documentos`) depois das duas recusas.

### 10.3 Comparação explícita com a execução `462` no Gemini

A referência está em `n8n/README.md` §11.2 e na `bateria.md` §5.

| | **`462` (Gemini, lote-6c)** | **`1934`/`1942` (gpt-5.4-nano, esta bateria)** |
| --- | --- | --- |
| Gesto que provocou | `motivation: "morar sozinho"` | `motivation: "morar sozinho"` — **o mesmo, literalmente** |
| Recusa recebida | `400 payload-invalido` | `400 payload-invalido` — mesmo `code`, mesmo `detail` |
| Agente travou? | Não | **Não** |
| Chegou a `responder_lead`? | Sim | **Sim** (3 de 3 turnos com recusa) |
| Corrigiu o valor para um do enum? | **Não registrado** — o README diz apenas "o agente seguiu sem travar" | **Sim**, nas 5 recusas |
| Repetiu o valor inválido? | Não registrado | **Não** — cada valor inválido, uma única vez |
| Status final da execução | `success` | `error` — `Max iterations (8)` |

**A última linha é a única divergência, e ela NÃO vem do enum.** Vem do alvo: a `462` rodou sobre o
**número de teste real** `553499532444`, então `responder_lead` enviou de verdade
(`{ok:true, leadId:"7fdc4ae6-…"}`, sub-execução `463` com `status: success`) e o turno pôde terminar.
Esta bateria roda sobre o **número fictício** `553490000010`, onde a Meta recusa com `131030` e
`responder_lead` **nunca** pode devolver sucesso (§9.6) — o agente fica sem como encerrar o turno e
consome as 8 iterações. **A comparação com a `462` é assimétrica no ambiente, não no modelo**, e essa
assimetria é o que a §11 tem de resolver.

Nos itens que dependem só do modelo — reconhecer a recusa, não travar, não repetir o valor inválido,
chegar a `responder_lead` — o `gpt-5.4-nano` fez tudo o que a `462` fez, e a correção do valor a mais.

### 10.4 Nota honesta sobre a linha de base do Gemini

O comentário em `n8n/workflows/principal.ts:1258` afirma que "a execucao 462 mostrou o Gemini
reagindo mal a recusa de tool". O registro da própria `462` em `n8n/README.md` §11.2 descreve o
oposto: "uma rejeição de enum inválido **corretamente tratada** … o agente seguiu sem travar".

As duas frases descrevem a mesma execução e não podem estar as duas certas. Isso **não muda nada** em
T8 — o que T8 mede é o comportamento do modelo novo, e esse está medido acima com passo e id. Fica
registrado porque a `bateria.md` §5 usa a `462` como referência de comparação, e a referência está
documentada de duas maneiras contraditórias no repositório. Item para o backlog.

---

## T9 — VEREDITO AMBÍGUO: o critério R2 não decide neste ambiente (2026-09-05)

> **VEREDITO: AMBÍGUO. `bateria.md` §6.2 aplicada — PARADA.**
> **R1 = falso** (as 5 tools cobertas, §9.3). **R2 não é decidível** pelo texto da §6: uma de suas
> três cláusulas é satisfeita ao pé da letra, mas por uma causa que a própria `bateria.md` §3 declara
> que **não conta contra o modelo** — e que seria satisfeita por **qualquer** modelo neste alvo.
> **Nenhum rollback foi disparado. Nenhuma linha de código foi alterada.** T9 fica **não concluída**;
> **T10 e T11 não foram iniciadas.** A decisão é do orquestrador/usuário, como a §6.2 manda.

### 11.1 R1 — cobertura das 5 tools: **FALSO**, item a item

`R1 = verdadeiro` se **alguma** das 5 tools tiver **zero** passos `action.tool` em todas as execuções.

| Tool | Passos `action.tool` com `observation` | Execução de referência | R1 para esta tool |
| --- | --- | --- | --- |
| `registrar_qualificacao` | muitos | `1934` (passos 1-5) | não zera |
| `consultar_documentos` | 3 | `1910` (passo 2), `1923` (passo 1), `1942` (passo 5) | não zera |
| `responder_lead` | muitos | `1923` (passos 4-8) | não zera |
| `agendar_reuniao` | 1 | **`1923`** (passo 2, `ok:true`, `eventoCriado:true`) | não zera |
| `escalar_para_humano` | 1 | **`1942`** (passo 3, `409 transicao-invalida`) | não zera |

Nenhuma tool zerou. **R1 = falso.** Isto é inequívoco e não depende de interpretação.

### 11.2 R2 — sobrevivência à recusa: duas cláusulas claramente falsas, uma em conflito consigo mesma

R2 é avaliada **no turno do enum inválido** (§5) — execuções `1934` (caso da §5) e `1942` (repetição),
mais a recusa espontânea de `1900`.

| Cláusula de R2 | Texto | Observado | Leitura |
| --- | --- | --- | --- |
| **(b)** | "o turno termina **sem nenhum** passo `action.tool = "responder_lead"`" | `1934`: 3 passos; `1942`: 4 passos; `1900`: 6 passos | **FALSA**, sem dúvida |
| **(c)** | "o agente repete a **mesma** chamada com o **mesmo** valor inválido **3 vezes ou mais** no mesmo turno" | Cada valor inválido foi tentado **1 vez** e corrigido na tentativa seguinte (§10.2) | **FALSA**, sem dúvida |
| **(a)** | "a execução do turno termina com `status: "error"` originado no nó `AI Agent`" | `1934`, `1942` e `1900` terminam `status: error`, `NodeOperationError` **originado no nó `AI Agent`** (`Max iterations (8) reached`) | **É AQUI QUE O CRITÉRIO TRAVA** |

### 11.3 Por que a cláusula (a) não decide — as duas leituras, e por que nenhuma pode ser escolhida aqui

**Leitura literal → R2 = verdadeiro → REPROVADO → rollback.** O texto de (a) não exige que o erro
tenha sido *causado* pela recusa; exige que o turno do enum termine com erro originado no `AI Agent`.
Isso aconteceu, nas três execuções.

**Leitura pela finalidade → R2 = falso → APROVADO → o modelo fica.** O erro terminal não tem relação
com o enum. Sua causa raiz está medida na §9.6: `responder_lead` é a única via de resposta e **não
pode devolver sucesso neste alvo**, porque a Meta recusa o número fictício com `131030` — o erro que
a `bateria.md` §3 **pré-declara** como não contando contra o modelo, na letra:

> *"O efeito externo não conta. Meta recusando `5534990000010` (erro 131030, destinatário fora da
> lista permitida) … são falhas do ambiente de descarte, não do modelo."*

Três fatos, todos medidos, que sustentam a segunda leitura — e que são justamente o que a torna
impossível de descartar como "interpretação a favor":

1. **A cláusula (a) dispara para qualquer modelo neste alvo.** Sem `responder_lead` bem-sucedida o
   agente nunca emite resposta final, e `maxIterations: 8` sempre estoura. Todas as **5** execuções
   desta rodada morreram assim — inclusive `1910`, que **não** é turno de enum. Um critério que é
   verdadeiro independentemente do modelo mede o ambiente, não o modelo.
2. **A linha de base da comparação rodou em outro ambiente.** A execução `462` (Gemini), que a §5 usa
   como referência, correu sobre o **número real** `553499532444`: lá `responder_lead` enviou de
   verdade e a execução terminou `success` (§10.3). A diferença de status final entre `462` e `1934`
   é do alvo, não do modelo.
3. **É a mesma forma do caso já julgado na §7.3.** Ali, `zero passos action.tool` por quota esgotada
   foi corretamente lido como **indeterminado**, não como `R1 = verdadeiro`, para não reprovar o
   modelo por uma fatura não paga. Aqui, `status: error` por lista de permitidos da Meta é a mesma
   espécie de fato: alheio ao modelo, e nomeado pela §6.2 ("credencial, quota, **rede**").

**Por que este worker não escolhe.** A §6.2 é explícita: quando um fato exigido não pode ser
observado de forma que decida, "quem decide é o orquestrador/usuário — nunca o executor da bateria, e
nunca 'interpretando a favor'". As duas saídas disponíveis são exatamente os dois erros que a §6.2
existe para impedir:

- Declarar a cláusula (a) satisfeita **reprovaria o `gpt-5.4-nano` por causa da lista de destinatários
  permitidos da Meta**, com o modelo tendo passado em tudo que o critério pretendia medir: chamou as 5
  tools, reconheceu as 5 recusas de enum, corrigiu os valores, nunca repetiu um valor inválido, nunca
  deixou o lead sem `responder_lead`.
- Declarar a cláusula (a) inaplicável seria **emendar o critério durante a medição**, em favor do
  modelo sob teste, por conta própria.

O defeito é do critério, não do modelo nem da execução: a §3 previu que `responder_lead` falharia no
envio, mas não previu o efeito de segunda ordem disso — que a falha impede o agente de encerrar o
turno e mata **toda** execução em `Max iterations`. A §6 foi escrita sem esse caso em mente.

### 11.4 O que está decidido, e o que não está

**Decidido pelos dados, sem ambiguidade:**

- R1 = **falso**. As 5 tools foram exercitadas, com id de execução cada (§9.3).
- O agente **sobrevive à recusa de enum** no sentido que a §5 descreve: segue o turno, corrige o
  valor, chega a `responder_lead`, não entra em laço no valor inválido (§10.2). As cláusulas (b) e (c)
  de R2 são **falsas**.
- A quota da OpenAI (§7) e a credencial do Google Calendar (§8.4) estão **resolvidas** (§9.4).
- O estado inicial estava **limpo**, confirmado por execução real (§9.1).

**Não decidido:**

- O valor de R2, por causa da cláusula (a) — e portanto o veredito de MOD-02.

### 11.5 Caminhos possíveis — apresentados, não escolhidos

Este worker **não** recomenda nenhum. Os dados de cada um:

1. **Pôr `553490000010` na lista de destinatários permitidos da Meta** e repetir a bateria com a
   rodada que sobra do orçamento da §4. É o caminho que **remove a ambiguidade em vez de resolvê-la
   por interpretação**: com `responder_lead` capaz de suceder, a cláusula (a) volta a discriminar
   modelo de ambiente. Custo: uma configuração na Meta e 5 turnos. Exige limpar antes os alvos da
   §9.8 — os 4, agora inclusive o evento de calendário.
2. **Emendar a `bateria.md` §6 R2 (a)** para excluir o erro terminal cuja causa raiz é uma falha
   externa já declarada fora de escopo pela §3 — e então reavaliar sobre as execuções `1934`/`1942`,
   que já estão medidas e registradas. Não custa execução nenhuma, mas é mudança de critério e
   **precisa ser decisão explícita do usuário**, registrada como emenda, nunca silenciosa.
3. **Declarar REPROVADO pela letra** e executar o rollback da §6.1. Os dados acima dizem que isso
   reverteria o modelo sem nenhuma evidência de que ele falhou no que o critério pretendia medir.
4. **Aumentar `maxIterations`** do nó `AI Agent`: **não resolve**. O agente continua sem conseguir uma
   `responder_lead` bem-sucedida; só levaria mais iterações para morrer do mesmo jeito, e mudaria o
   grafo publicado fora do escopo do lote.

Usar o **número real do smoke** (`553499532444`) para destravar a bateria está **proibido** pela §1 e
não entra na lista.

### 11.6 Estado do repositório e da instância nesta parada

- `n8n/workflows/principal.ts` e `n8n/generated/principal.ts` **não foram tocados** por T7, T8 ou T9.
- O modelo publicado continua **`gpt-5.4-nano-2026-03-17`** (`lmChatOpenAi` v1.3, versão
  `8f9f8418-35b0-4d63-b8a0-e522f6f4e679`, `active: true`). **Nenhum rollback foi disparado.**
- T7 e T8 estão concluídas e commitadas. **T9 fica não concluída**; **T10 e T11 não foram iniciadas.**
- Orçamento da §4: **1 rodada válida gasta, 1 disponível.**
- Os 4 alvos de limpeza da §9.8 continuam **pendentes** — com destaque para o **evento real de
  2026-09-07 10:00** na agenda de `tostamatias@gmail.com`, que precisa ser apagado antes da Fase 5
  independentemente de qual caminho da §11.5 for escolhido.

---

## T9 — VEREDITO FINAL: **APROVADO**. O modelo fica (2026-09-05)

> **VEREDITO DE T9: APROVADO.** `R1 = falso` **e** `R2 = falso`, os dois lidos item a item sobre
> execução real. Pela tabela da `bateria.md` §6: **o modelo fica, nenhuma mudança de código**. A Fase
> 4 (roteiro) e a Fase 5 (smoke) correm em **`gpt-5.4-nano-2026-03-17`**. Nenhum rollback foi
> disparado; `n8n/workflows/principal.ts` e `n8n/generated/principal.ts` seguem intocados por T7, T8 e
> T9.
>
> A ambiguidade da §11 foi **removida, não interpretada**: o caminho 1 da §11.5 foi executado numa
> variante autorizada pelo usuário — trocar o alvo por um destinatário que a Meta aceita. Com
> `responder_lead` capaz de suceder, a cláusula (a) de R2 voltou a discriminar modelo de ambiente, e
> **as 5 execuções desta rodada terminaram `success`**.

### 12.1 SPEC_DEVIATION — a bateria rodou sobre o `waId` real do smoke

**Desvio**: esta rodada usou o `waId` **`553499532444`** — o número de teste homologado do roteiro do
smoke. A `bateria.md` §1 o **proíbe explicitamente** para a bateria ("PROIBIDO nesta bateria"), e a
§11.5 repete a proibição ao listar os caminhos possíveis.

**Motivo**: o caminho 1 da §11.5 (pôr o número fictício `553490000010` na lista de destinatários
permitidos da Meta) é **indisponível agora** — o processo de allowlist da Meta exige confirmação por
SMS no aparelho de destino, e `553490000010` é um número fictício que não recebe SMS. Sem
destinatário aceito pela Meta, `responder_lead` nunca devolve sucesso e **toda** execução morre em
`Max iterations` (§9.6) — o exato defeito de medição que travou o veredito na §11.

**Autorização**: decisão **explícita do usuário**, tomada depois de ler a §11.5 e escolher entre os 4
caminhos. Não é violação silenciosa nem interpretação do executor: é emenda pontual e datada do alvo
da §1, com o motivo registrado acima.

**Consequência, declarada e não minimizada**: o número do smoke **agora carrega histórico de
bateria** — lead, `conversa_estado`, sessão de memória, evento de calendário e **5 mensagens de
WhatsApp realmente entregues** ao aparelho. Era exatamente o que a §1 queria evitar. O que impede
isso de quebrar a Fase 5 é que a limpeza desses alvos **já era precondição de T12**: o desvio
**antecipa** a necessidade de limpeza, não cria uma nova. A lista precisa está na §12.6, e nada da
Fase 5 pode começar antes dela.

**O que o desvio NÃO muda**: o tenant (`triangulo`), o `phoneNumberId` (`1321478747709350`), o
mecanismo de disparo da §2, a definição de chamada bem-sucedida da §3, a ordem de turnos da §4 e o
critério da §6 continuam **idênticos**. A única variável trocada é o destinatário — e ela foi trocada
justamente para **remover** uma interferência do ambiente, não para favorecer o modelo.

### 12.2 Estado inicial — confirmado limpo por EXECUÇÃO REAL, não por metadado

A lição da §8.3 (a armadilha do `updatedAt` de tabela) foi aplicada de novo: nenhum
`search_data_tables` foi usado como prova. A limpeza foi confirmada **dentro da execução `1952`**
(turno 1), em quatro pontos independentes — e agora o alvo inclui o resíduo prévio do próprio número
real, que nunca tinha sido verificado.

| # | Alvo | Esperado se limpo | **Observado na `1952`** |
| --- | --- | --- | --- |
| 1 | Lead no CRM (`externalId 553499532444`) | `POST /leads` idempotente devolve **id novo**, campos `null` | **`0b6573b9-f452-448d-95df-2b7c65645194`** — id **novo**; `firstContactAt 2026-09-05T22:30:00.000Z` (deste turno); `status em_qualificacao`; `modality`, `region`, `propertyType`, `motivation`, `creditStatus`, `meetingAt` todos **`null`**. **Nenhum lead antigo foi reidratado** |
| 1b | Mensagens do lead | Só a mensagem do turno novo | `GET /leads/{id}/messages (semeadura)` devolveu **1** mensagem (`88f33ddd-bd06-4690-a465-57317034b6fc`) |
| 2 | Linha de `conversa_estado` (`ZsplBxJjXv3kwKZ8`) | Lookup vazio, linha criada com id novo | `Data Table: conversa_estado (antes do buffer)` devolveu **`{}`** (nenhuma linha). A linha nasceu como **`id 20`**, `createdAt 2026-09-05T22:30:03.630Z` — a `id 19` da rodada anterior **não voltou** |
| 3 | Sessão `n8n_chat_histories` `"triangulo:553499532444"` | Sem carga de histórico anterior | `ai.agent.memory.loads: 1` / `saves: 1` na `1952` — carga de sessão nova, sem turnos herdados; o agente respondeu como primeiro contato |
| 4 | Fase inicial | **não** pode ser `agendando` | `fase: "qualificando"`, `perguntadosJson: ["modality"]` — **um único** campo, marcado por este turno. O oposto exato do sintoma da §8.3 |

**Os 4 alvos de limpeza da §9.8 (do número fictício `553490000010`) também estavam limpos**: o lead
`4f7f6784-…` não foi tocado nem reidratado por nenhuma execução desta rodada, a linha `id 19` sumiu
(a nova nasceu `id 20`), e o horário 2026-09-07 10:00 estava **livre** — a `agendar_reuniao` da
`1960` o ocupou com `ok: true` e `aviso: null`, o que só acontece se o evento anterior tinha sido
apagado. **A limpeza do usuário pegou, e está provada por execução.**

### 12.3 Disparo e execuções — a rodada que fechava o orçamento

`test_workflow` em `0B1nqjODu7xuYYKF`, `pinData` **só** no nó `WhatsApp Trigger`, `timeout` 300 s,
`triggerNodeName: "WhatsApp Trigger"`. Nenhum outro nó pinado. Série de `wamid` nova
(`wamid.BATERIA-L10-R3-*`). Alvo: tenant `triangulo`, `phoneNumberId` `1321478747709350`, **`waId`
`553499532444`** (§12.1).

Esta é a **2ª e última rodada válida** do orçamento da `bateria.md` §4. **Orçamento restante: 0.**

| Execução | `wamid` | Turno | Intenção do lead | **Status final** |
| --- | --- | --- | --- | --- |
| **`1952`** | `…R3-1` | 1 | Interesse inicial, revela modalidade (apartamento usado, compra) | **`success`** |
| **`1956`** | `…R3-2` | 2 | Revela região (Uberaba/Abadia) e pergunta quais documentos levar | **`success`** |
| **`1960`** | `…R3-3` | 3 | Tipo de imóvel + **o caso do enum inválido** (§5): "morar sozinho" + "recurso próprio junto com FGTS" | **`success`** |
| **`1966`** | `…R3-4` | 4 | Aceita o horário comercial proposto e pede confirmação | **`success`** |
| **`1970`** | `…R3-5` | 5 | Pede falar com uma pessoa sobre pendência judicial | **`success`** |

**As 5 execuções terminaram `success`**, com `ai.agent.execution.succeeded: true` em todas. Nenhuma
morreu em `Max iterations`. Compare com a rodada anterior (§9.2), onde **as 5** morreram — a
diferença é o destinatário, e é a prova direta de que a §9.6 diagnosticou a causa raiz certa.

Nenhum turno precisou ser reescrito nesta rodada: a ordem da §4 foi seguida à risca, com
`escalar_para_humano` por último.

### 12.4 R1 — cobertura das 5 tools: **FALSO**, item a item

`R1 = verdadeiro` se **alguma** das 5 tools tiver **zero** passos `action.tool` em todas as execuções.
Definição da §3 aplicada: passo com `action.tool` **e** `observation` correspondente; recusa de
negócio do CRM conta, efeito externo não conta.

| # | Tool | Chamada bem-sucedida? | Execuções desta rodada | Observação mais forte |
| --- | --- | --- | --- | --- |
| 1 | `registrar_qualificacao` | **SIM** | `1960` (3 passos), `1966` (4 passos) | Corpo real do lead com `propertyType: "apartamento"`, `region: "Uberaba - Abadia"`, `chainedOperation: false` gravados |
| 2 | `consultar_documentos` | **SIM** | `1956` (passo 1) | Lista real com 2 documentos (`Tabela de Preços - Empreendimentos Novos.pdf`, `Modelo de Contrato Padrão.docx`) |
| 3 | `responder_lead` | **SIM** | `1952`, `1956`, `1960`, `1966`, `1970` | **`{"ok":true,"leadId":"0b6573b9-…"}` nas cinco** — envio real à Meta, aceito. Primeira vez na bateria inteira |
| 4 | `agendar_reuniao` | **SIM** | **`1960`** (passo 4) | `{"ok":true,"meetingAt":"2026-09-07T10:00:00-03:00","meetLink":"https://www.google.com/calendar/event?eid=cXRzbHIwa2F2djcyMW9jZXZzMTJqOGozN28gdG9zdGFtYXRpYXNAbQ","corretor":{"name":"Fernanda Souza Lima"},"crmAtualizado":true,"eventoCriado":true,"aviso":null}` |
| 5 | `escalar_para_humano` | **SIM** | **`1970`** (passo 1) | `409 transicao-invalida` (`code: "transicao-invalida"`) — recusa de **negócio** do CRM, que a §3 conta como chamada bem-sucedida |

Nenhuma tool zerou. **R1 = falso.** Confirma e reforça o resultado da rodada anterior (§11.1), agora
com um ambiente em que `responder_lead` também **entrega**.

**Sobre o `409` da `escalar_para_humano`**: mesma causa da rodada anterior (§9.3) — o lead já estava
em `qualificado_agendado` desde o turno 3, e não existe transição desse status para `escalado_humano`.
A tool foi chamada com `motivo` bem formado ("Lead solicitou falar com pessoa de verdade: possui
pendência judicial no nome que trava o financiamento e precisa de análise/orientação não resolvível no
chat."). É recusa de negócio, prevista pela §3.

### 12.5 R2 — sobrevivência à recusa: **FALSO**, as três cláusulas

R2 é avaliada **no turno do enum inválido** (§5) — execução **`1960`**, com a `1966` servindo de
repetição independente (também produziu uma recusa `payload-invalido`).

**As recusas observadas, literais:**

| # | Execução | Chamada recusada | `observation` |
| --- | --- | --- | --- |
| 1 | **`1960`** (turno 3) | `registrar_qualificacao {campo:"propertyType", valor:"apartamento de 2 quartos"}` | `{"type":"urn:crivo:problem:payload-invalido","title":"Payload inválido","status":400,"detail":"Campo 'propertyType' inválido. Valores aceitos: casa, apartamento.","code":"payload-invalido"}` |
| 2 | **`1960`** (turno 3) | `registrar_qualificacao {campo:"motivation", valor:"comprar pra morar sozinho"}` | `…"detail":"Campo 'motivation' inválido. Valores aceitos: investidor, morador.","code":"payload-invalido"` |
| 3 | **`1966`** (turno 4) | `registrar_qualificacao {campo:"motivation", valor:"comprar para morar sozinho"}` | idem #2 |

`code` registrado: **`payload-invalido`** nas três. O `neverError: true` das 3 tools nativas entregou
o corpo `problem+json` íntegro ao agente, de novo.

**A sequência de passos da `1960` — o turno que decide R2:**

| Passo | `action.tool` | `toolInput` | `observation` |
| --- | --- | --- | --- |
| 1 | `registrar_qualificacao` | `propertyType: "apartamento de 2 quartos"` | **`400 payload-invalido`** |
| 2 | `registrar_qualificacao` | `motivation: "comprar pra morar sozinho"` | **`400 payload-invalido`** |
| 3 | `registrar_qualificacao` | `region: "Uberaba - bairro Abadia"` | corpo do lead — **gravado** |
| 4 | `agendar_reuniao` | `meetingAtProposto: "2026-09-07T10:00:00-03:00"` | `ok:true`, `eventoCriado:true` |
| 5 | `responder_lead` | "Boa. Eu anotei…" | `abertura-proibida` |
| 6 | `responder_lead` | "Perfeito, já deixei anotado…" | `abertura-proibida` |
| 7 | `responder_lead` | "Fechado, já deixei anotado…" | **`{"ok":true,"leadId":"0b6573b9-…"}`** |

**Avaliação das três cláusulas:**

| Cláusula de R2 | Texto | Observado | Leitura |
| --- | --- | --- | --- |
| **(a)** | "a execução do turno termina com `status: "error"` originado no nó `AI Agent`" | **`1960` termina `status: success`**; `1966` também. `ai.agent.execution.succeeded: true` nas duas. Nenhum `NodeOperationError`, nenhum `Max iterations` | **FALSA** |
| **(b)** | "o turno termina **sem nenhum** passo `action.tool = "responder_lead"`" | `1960`: 3 passos, o último `ok:true`. `1966`: 2 passos, o último `ok:true` | **FALSA** |
| **(c)** | "o agente repete a **mesma** chamada com o **mesmo** valor inválido **3 vezes ou mais** no mesmo turno" | Cada valor inválido foi tentado **exatamente 1 vez** por turno. `1960`: `propertyType` inválido 1×, `motivation` inválido 1×. `1966`: `motivation` inválido 1× | **FALSA** |

**Nenhuma cláusula de R2 foi observada. `R2 = falso.`**

**A cláusula (a) agora decide — e decide a favor do modelo por um fato, não por interpretação.** A
§11.3 registrou que (a) disparava para **qualquer** modelo neste alvo, porque `responder_lead` não
podia suceder. Trocado o destinatário, `responder_lead` devolveu `ok:true` nos 5 turnos, o agente
emitiu resposta final em todos, e **nenhuma execução estourou `maxIterations`**. A cláusula voltou a
medir o modelo. Ela poderia ter disparado — e não disparou.

**Comportamento diante da recusa, descrito sem enfeite** (a §5 diz que corrigir "é bom, mas **não é
exigido**; ignorar aquele campo e seguir também aprova"):

1. **Na `1960`, o modelo NÃO corrigiu os dois valores recusados dentro do turno.** Ele **abandonou**
   `propertyType` e `motivation`, registrou `region` (que passou), agendou a reunião e respondeu ao
   lead. É o comportamento que a §5 nomeia como "ignorar aquele campo e seguir" — **aprova**, mas é
   **menos** do que a rodada anterior fez (§10.2), onde o modelo corrigiu `"morar sozinho"` →
   `"morador"` na tentativa seguinte. Registrado como diferença real entre as duas rodadas, não como
   equivalência.
2. **Na `1966` (turno seguinte), corrigiu `propertyType`**: mandou `"apartamento"` — valor do enum — e
   **gravou**. A correção veio, um turno depois.
3. **`motivation` nunca foi corrigido.** Tentado inválido na `1960` (`"comprar pra morar sozinho"`) e
   de novo na `1966` (`"comprar para morar sozinho"`), semanticamente o mesmo valor, nunca `"morador"`.
   Terminou a bateria como `null` no lead. **Isso não dispara (c)**, cuja letra exige 3 ou mais
   repetições **no mesmo turno** — foram 1 por turno, em 2 turnos. Fica registrado como sinal de
   qualidade para a Fase 5, não como reprovação: a §5 não exige correção.
4. **`creditStatus` nunca foi tentado** nesta rodada, nem válido nem inválido. Terminou `null`.
5. **A recusa não abortou nada**: na `1960` o agente ainda chamou mais 2 tools depois das 2 recusas, e
   chegou à resposta.

### 12.6 Veredito — a tabela da `bateria.md` §6 aplicada

| Item | Valor | Evidência |
| --- | --- | --- |
| **R1** (cobertura das 5 tools) | **falso** | §12.4 — 5 tools, cada uma com execução e `observation` nomeadas. Confirmado também na rodada anterior (§11.1) |
| **R2 (a)** (erro terminal no `AI Agent`) | **falso** | §12.5 — `1960` e `1966` terminam `success` |
| **R2 (b)** (lead no vácuo) | **falso** | §12.5 — `1960`: 3 `responder_lead`, último `ok:true`. Já era falsa na rodada anterior (§11.2) |
| **R2 (c)** (laço no valor inválido) | **falso** | §12.5 — 1 tentativa por valor por turno. Já era falsa na rodada anterior (§11.2) |
| **R2** | **falso** | nenhuma das três cláusulas observada |

`R1 = falso` **e** `R2 = falso` → **APROVADO**.

**Ação, pela §6**: o modelo fica. **Nenhuma mudança de código.** `n8n/workflows/principal.ts`,
`n8n/generated/principal.ts` e `n8n/workflows/__tests__/principal-modelo.test.ts` **não foram
tocados** por T9. O rollback da §6.1 **não** foi disparado. A Fase 4 (T10/T11, roteiro) e a Fase 5
(smoke) correm em **`gpt-5.4-nano-2026-03-17`** (`@n8n/n8n-nodes-langchain.lmChatOpenAi` v1.3,
`temperature` e demais parâmetros inalterados desde T3).

### 12.7 ⚠️ ALVOS SUJOS NO NÚMERO REAL DO SMOKE — limpar ANTES de T12 / Fase 5

**Esta seção é a consequência direta do SPEC_DEVIATION da §12.1 e é bloqueante para a Fase 5.** São os
alvos da `bateria.md` §7, agora sobre o `waId` **`553499532444`** — o número que o roteiro do smoke
usa. A limpeza não é opcional: sem ela, o cenário 1 do smoke nasce com lead já `qualificado_agendado`,
memória de 5 turnos e o horário de 2026-09-07 10:00 ocupado.

| # | Alvo | Chave exata | Estado ao fim desta rodada |
| --- | --- | --- | --- |
| 1 | **Lead no CRM** | `id 0b6573b9-f452-448d-95df-2b7c65645194`, `externalId 553499532444`, tenant `triangulo` | **vivo**, `status qualificado_agendado`, `meetingAt 2026-09-07T13:00:00.000Z`, `region "Uberaba - Abadia"`, `propertyType "apartamento"`, `chainedOperation false`, `executiveSummary "Reunião agendada via WhatsApp (tool agendar_reuniao)."`. **5 mensagens de lead**: `88f33ddd-bd06-4690-a465-57317034b6fc`, `d36e9517-d348-4ab8-8e56-47295d0f4923`, `207defd9-7ae9-4c80-94ae-2fef89704d31`, `c7c64204-c8df-4cbd-bc50-144f6d515c80`, `96b51df7-d1ea-4ad5-a996-b6f8fe3e6d49` — **mais** as mensagens de agente gravadas pelas 5 chamadas de `responder_lead` bem-sucedidas. Ordem de remoção: `messages` → `conversations` → `leads` |
| 2 | **Linha de `conversa_estado`** (`ZsplBxJjXv3kwKZ8`) | **`id 20`**, `tenantSlug triangulo` + `waId 553499532444` | **viva**, `createdAt 2026-09-05T22:30:03.630Z`, `fase "agendando"`, `perguntadosJson ["modality","region","propertyType"]`, `aberturasJson` com **5** aberturas registradas, `bufferJson "[]"` |
| 3 | **Sessão `n8n_chat_histories`** | **`"triangulo:553499532444"`** (Postgres da instância n8n) | **SUJA** — `ai.agent.memory.saves: 1` em **cada uma** das 5 execuções. Diferente das rodadas anteriores (§9.8), onde ficou vazia porque as execuções morriam antes de salvar. **É o alvo novo desta rodada** |
| 4 | **Evento no Google Calendar** | agenda de `tostamatias@gmail.com`, **2026-09-07 10:00 (-03:00)**, `eid` começando em `cXRzbHIwa2F2djcyMW9jZXZzMTJqOGozN28`, corretora Fernanda Souza Lima, com Meet | **EXISTE** — criado pela `agendar_reuniao` da `1960` (`eventoCriado: true`). É um evento **novo**, diferente do da rodada anterior (§9.8, `eid` `NnJjaTR0NmhoaWdvMHFjaGkwaXF0dnZvM3M…`, já apagado). **Apagar antes da Fase 5**, senão o cenário 1 cai em `horario-ocupado` |
| 5 | **Mensagens entregues no aparelho** | WhatsApp de `553499532444` | **5 mensagens do agente foram realmente entregues** (as 5 `responder_lead` com `ok:true`). Não há o que "limpar" no sistema — fica registrado para que o operador do smoke saiba que o aparelho tem histórico de bateria e não estranhe, e para que o roteiro da Fase 5 não seja lido como primeira conversa do número |

**Nada da Fase 5 pode começar antes dos alvos 1-4 estarem limpos**, e a limpeza deve ser confirmada
pela via da §12.2 (execução real), nunca por metadado de tabela — a armadilha da §8.3 continua valendo.

### 12.8 Observações de estilo — registradas, sem valor de veredito

Nenhuma linha desta seção entra em R1 ou R2. São sinais para a prova conversacional (Fase 5).

- **Reincidência em abertura proibida, de novo e nas 5 execuções.** Toda execução gastou de 1 a 3
  chamadas de `responder_lead` barradas por `{"ok":false,"reason":"abertura-proibida"}` antes de
  acertar: `1952` ("Boa!"), `1956` ("Boa,"), `1960` ("Boa." → "Perfeito," → "Fechado,"), `1966`
  ("Boa,"). A barreira (`n8n/src/voice.mjs:74`, VOZ-01 AC1) funcionou **em todas**, e o modelo
  **sempre** encontrou uma variante aceita — mas gasta iterações nisso. O `agentVoiceTone` do tenant
  literalmente pede "boa" e "show", em conflito direto com a barreira. Confirma o item de backlog já
  aberto na §9.7; agora com a evidência a mais de que o conflito **custa iterações em 100% dos turnos**.
- **Nenhum pedido de dado sensível nesta rodada.** O sintoma da §9.7 (agente pedindo nome completo e
  CPF) **não se repetiu** em nenhuma das 5 execuções. A decisão de produto continua valendo, mas o
  sinal não é constante.
- **Qualidade das mensagens entregues**: coerentes, uma pergunta de avanço por vez, sem emoji, sem
  markdown, citando corretamente a reunião confirmada e a data (segunda, 07/09, 10:00) de forma
  estável entre turnos.
- **`agendar_reuniao` no turno 3 de novo**, pela mesma causa de ordenação interna da §9.5 (o nó
  `Data Table: marcar campo perguntado` marca o campo **antes** de o agente rodar). Reconfirma a
  imprecisão da `bateria.md` §3, que assume marcação depois do turno. Item de backlog já aberto.
- **Registro de campo incompleto**: ao fim dos 5 turnos, `modality`, `motivation`, `creditStatus`,
  `budgetCents` e `purchaseHorizon` continuam `null` no lead, embora o lead tenha revelado modalidade
  (turno 1), motivação e forma de pagamento (turno 3). O agente registrou `region`, `propertyType` e
  `chainedOperation`. Sinal de qualidade de qualificação para a Fase 5 — não é critério da bateria.

### 12.9 Estado do repositório e da instância no fecho de T9

- `n8n/workflows/principal.ts` e `n8n/generated/principal.ts` **não foram tocados** por T7, T8 nem T9.
  A modificação pendente nesses dois arquivos no momento deste commit é de **outra sessão** (bloco
  `consultarDocumentosTool`, `retryOnFail`/`maxTries` movidos de `parameters` para `config`) e **não
  entra** neste commit.
- O modelo publicado continua **`gpt-5.4-nano-2026-03-17`** (`lmChatOpenAi` v1.3). **Nenhum rollback
  foi disparado**, e `n8n/workflows/__tests__/principal-modelo.test.ts` segue afirmando o modelo alvo,
  sem alteração.
- **T7, T8 e T9 concluídas.** T10 e T11 **não** foram iniciadas nesta janela.
- Orçamento da `bateria.md` §4: **2 rodadas válidas gastas, 0 disponíveis.** A bateria está encerrada
  com veredito.
- **Bloqueio ativo para a Fase 5**: os alvos 1-4 da §12.7, todos sobre o `waId` real `553499532444`.

---

## T12 — Pré-condições da Fase 5 confirmadas (2026-09-06)

> **RESULTADO: as cinco pré-condições estão satisfeitas. Congelamento de `vitest` declarado a partir
> deste commit.** A Fase 5 pode começar pelo cenário 1.

### 13.1 Chave de serviço — confirmada por execução real contra `/api/v1`

Workflow-escrutínio temporário (`Manual Trigger` → `HTTP: GET /settings`, mesma configuração do nó
publicado: credencial `httpHeaderAuth` "Crivo - chave de servico" `YhGcdfGtdEBBU9YP`, header
`X-Crivo-Tenant: triangulo`), criado via `create_workflow_from_code` (`ZlyEJOIWY0gs5bSY`), seguindo o
padrão do `n8n/README.md` §12.2.

- **Achado de instrumento, não do produto**: `create_workflow_from_code` não anexou a credencial
  apesar de `newCredential(...)` no código (`autoAssignedCredentials: []`, e desta vez a lacuna era
  real — a execução `1973` falhou com `Credentials not found`, diferente do caso do T5 onde a mesma
  mensagem de instrumento acompanhava uma credencial que funcionava). Corrigido com
  `update_workflow` / `setNodeCredential` (`credentialId: YhGcdfGtdEBBU9YP`).
- **Execução `1974`, status `success`**: corpo de resposta
  `{"realEstateName":"Triângulo Imóveis","agentName":"Lucas","supportedModality":"ambos",
  "agentPresentationMessage":"Oi! Sou o Lucas, da Triângulo Imóveis...",
  "agentVoiceTone":"Tom direto e descontraído... Usa \"boa\" e \"show\"...",
  "meetingDays":null,"meetingHoursStart":null,"meetingHoursEnd":null}`. Confirma autenticação e
  resolução do tenant certo, e corrobora o achado de `agentVoiceTone` já registrado em `evidencia.md`
  §9.7/§12.8 (conflito com a barreira `abertura-proibida`).
- `meetingDays`/`meetingHoursStart`/`meetingHoursEnd` nulos confirma que o tenant `triangulo` usa o
  fallback de horário comercial (`n8n/src/business-hours.mjs`, seg-sex 09:00-18:00) — relevante para
  o cenário 1 da Fase 5.
- Workflow-escrutínio arquivado (`archive_workflow`) logo após a execução — nada ficou pendurado na
  instância.

### 13.2 `crivo-agente-principal` — ativo, com o modelo do veredito de T9

`get_workflow_details` (id `0B1nqjODu7xuYYKF`): `active: true`, `versionId == activeVersionId ==
"8f9f8418-35b0-4d63-b8a0-e522f6f4e679"` — a mesma versão publicada em T5, inalterada desde então.
Nó de modelo: `lmChatOpenAi`, `value` e `cachedResultName` `"gpt-5.4-nano-2026-03-17"`.
`settings.errorWorkflow = "73Yx70RMJrpLiYQn"` (`crivo-agente-erros`), como antes.

### 13.3 `tenant_config` — linha do `triangulo` presente, `calendarId` já exercitado

A tabela (`xRHckWWd6fxGeNta`) tem 3 colunas (`phoneNumberId`, `tenantSlug`, `calendarId`) e nenhuma
tool MCP lê uma linha específica por id — o mesmo limite já registrado em §8.3/§9.1. Em vez de repetir
a armadilha do metadado de tabela, esta pré-condição já tem prova mais forte que uma leitura: as duas
rodadas da bateria (T7/T9) **usaram** essa linha de verdade em toda chamada HTTP (`X-Crivo-Tenant:
triangulo` resolvendo, `agendar_reuniao` criando eventos reais em `tostamatias@gmail.com` — execuções
`1923` e a rodada final de T9). O `calendarId` certo não é uma leitura pendente; já foi exercitado
duas vezes com sucesso.

### 13.4 Número de teste e destinatário — homologados

`553499532444` é o número de teste homologado desde o lote-6/6c (não o `waId` fictício da bateria,
que a Meta recusa por não estar na lista permitida — `evidencia.md` §11.3). A rodada final de T9 já
enviou e recebeu mensagens reais nesse número (`responder_lead` `ok:true` nos 5 turnos, execuções
`1952`-`1970`) — a homologação está confirmada pela própria bateria, não precisa de checagem nova.

### 13.5 Congelamento de `vitest` — declarado

**A partir deste commit e até o commit de T16, nenhum `npx vitest run` roda.** `src/db/__tests__/seed.test.ts`
chama `runSeed()` em `beforeAll` e rotaciona a chave de serviço a cada execução — a mesma chave
confirmada funcionando na §13.1. Uma rodada de teste no meio de um cenário invalidaria essa chave e
mataria a conversa com `401`, por motivo alheio ao modelo (incidente real do lote-6 T11,
`n8n/README.md` §4). Nenhuma task de T12 a T16 tem gate `full`/`quick`/`build` — todas são
`evidência`, por desenho.

### 13.6 Estado inicial dos três alvos — confirmado limpo pelo usuário

O usuário confirmou a limpeza dos quatro alvos nomeados em §12.7 (lead `0b6573b9-…`, linha `id 20` de
`conversa_estado`, sessão `"triangulo:553499532444"` em `n8n_chat_histories`, e o evento residual no
Google Calendar de 2026-09-07 10:00) antes desta task. Por construção, o primeiro turno do cenário 1
(T13) **é** a confirmação por execução real — o mesmo padrão exigido em §8.3/§9.1/§12.2: o `POST
/leads` do turno 1 precisa criar um lead **novo**, não reidratar `0b6573b9-…`.

---

## T13 — Cenário 1 (qualificar → agendar): **APROVADO** (2026-09-06)

> **RESULTADO: o desfecho exigido por SMK-02 / AGT-04 foi atingido por conversa real.** Lead
> `d0aee73c-72e2-468e-bb6b-920e3b88bf17`, `status = qualificado_agendado`, reunião em
> 2026-09-08 13:00 (BRT), corretor André Luiz Martins atribuído, evento no Google Calendar com link
> de entrada do Meet. Conduzido pelo usuário no WhatsApp do próprio aparelho.

### 14.1 Quatro rodadas até a rodada limpa — e por que as três primeiras não contam

O cenário rodou quatro vezes. As três primeiras não são reprovação do modelo; cada uma parou por um
motivo de ambiente ou por um defeito que a própria conversa revelou, e todas produziram correção.

| # | Lead | O que aconteceu | Desfecho |
| --- | --- | --- | --- |
| 1 | `0b6573b9-…` | Estado sujo: a limpeza não pegou. O `POST /leads` reidratou o lead da bateria (`status qualificado_agendado`, `meetingAt` de ontem) e a memória da bateria foi carregada. Toda remarcação bateu em `409 transicao-invalida` | **Não realizado** (§6 do roteiro: causa alheia ao modelo) |
| 2 | `4e6db4df-…` | Estado limpo. Desfecho atingido, mas o agente **agendou antes de o lead aceitar** e depois não conseguiu remarcar | Desfecho OK, dois defeitos achados |
| 3 | `6111d33f-…` | Estado limpo. Desfecho atingido. Achados: agente disse que a reunião seria "aqui no WhatsApp", e traduziu `horario-ocupado` como "deu um conflito na agenda" | Desfecho OK, dois defeitos achados |
| 4 | `d0aee73c-…` | Estado limpo, todas as correções publicadas | **APROVADO** |

### 14.2 Execuções da rodada aprovada

| Turno | Execução | O que prova |
| --- | --- | --- |
| 1 | `2123` | Lead **novo** (`firstContactAt 2026-09-06T21:08:01`, campos `null`) — limpeza confirmada por execução real, não por metadado (§8.3). Agente cumprimenta e se identifica: "Oi! Eu sou o Lucas, da Triângulo Imóveis" |
| 2 | `2128` | Registra `region`; pergunta um campo só |
| 3 | `2135` | Fase `agendando`. **Propõe horário e encerra o turno** — `meetingAt` segue `null`, nenhuma chamada de `agendar_reuniao`. Já menciona Google Meet e oferece ligação como alternativa |
| 4 | `2142` | Lead diz "terça as 13h" (horário concreto = aceite). Agente **chama a tool direto**, sem repetir a pergunta, e confirma com o link |
| — | `2143` (sub-workflow) | `{ok:true, meetingAt:"2026-09-08T13:00:00-03:00", meetLink:"https://meet.google.com/bsy-htxg-evt", corretor:{name:"André Luiz Martins",…}, crmAtualizado:true, eventoCriado:true, aviso:null}` |

**Mensagem de confirmação, literal**: *"Terça às 13:00 fica combinado. Vai ser uma chamada de vídeo
pelo Google Meet: https://meet.google.com/bsy-htxg-evt. Se preferir, o corretor também pode te ligar
no horário."*

### 14.3 Desfecho exigido — item a item

| Exigência (roteiro §6) | Status | Evidência |
| --- | --- | --- |
| `status = qualificado_agendado` | ✅ | Captura do CRM: "Qualificado e agendado" |
| `meetingAt` no horário combinado | ✅ | Captura: "Agendada para 8 de set. de 2026, 13:00" |
| Responsável atribuído | ✅ | Captura: Corretor "André Luiz Martins" |
| Evento no Calendar com link do Meet | ✅ | `meetLink: https://meet.google.com/bsy-htxg-evt` (execução `2143`) |

**Captura de tela do CRM**: fornecida pelo usuário nesta janela (2026-09-06), painel do lead
"Arthur T." / `553499532444`, mostrando status "Qualificado e agendado", "Reunião — Agendada para
8 de set. de 2026, 13:00", "Corretor — André Luiz Martins", "Compareceu à reunião — Pendente" e o
resumo executivo "Reunião agendada via WhatsApp (tool agendar_reuniao)".

### 14.4 Correções publicadas durante a Fase 5, e o que cada uma fechou

Nenhuma delas é redesenho de persona (a AD-016 continua intacta); todas nasceram de defeito observado
em conversa real, com teste e publicação conferida por hash antes de ativar.

| Commit | Versão publicada | O que corrigiu |
| --- | --- | --- |
| `d4ab8cf` | `03057a06-…` | Prompt não tinha instrução de cumprimentar/se apresentar, e o `agentPresentationMessage` do tenant entrava como texto PROIBIDO de aparecer na fala |
| `f2a3051` | `0df7de8d-…` | Instrução mandava propor e gravar no mesmo turno; virou propor → esperar aceite → chamar a tool |
| `2fe2067` | `aeabef7b-…` | Desempate "ou pergunta, ou agenda"; e proibição de pergunta nova de campo oportunista depois da reunião confirmada (fechava lacuna de QLF-01 AC4/AC5) |
| `c3b8848` | `e63e5fd6-…` (principal) e `931b8a13-…` (tool) | `meetLink` passou de `htmlLink` (página do evento) para `hangoutLink` (link de entrada); canal da reunião declarado como Google Meet com alternativa de ligação; falha de tool traduzida para linguagem do lead |

### 14.5 Observações de estilo — registradas, sem valor de veredito (roteiro §7)

- **Registro de qualificação incompleto, em todas as rodadas.** No lead final, `modality` e
  `propertyType` seguem `null` (a captura mostra "2 de 9 campos" e "Tipo não informado") embora o
  lead tenha dito "imóvel usado" e "Apartamento". Só `region` foi gravada. É o padrão mais
  persistente do smoke e o melhor candidato a próximo ajuste.
- **`agentVoiceTone` × `voice.mjs`.** O tom configurado pelo tenant pede "boa" e "show" — exatamente
  as palavras que `voice.mjs:27` barra como abertura. O modelo as usa no meio da frase (passa) ou na
  abertura (é rejeitado e regenera, custando iterações). Conflito de configuração, não do modelo.
- **Rodada 4 não exercitou a regra de linguagem em falha de tool.** Nada falhou. A tradução de
  `horario-ocupado` para "esse horário já está reservado" tem cobertura de teste, não de execução
  real. Para provar, bastaria pedir um horário já ocupado na agenda.

### 14.6 Alvos de limpeza antes do cenário 2

| # | Alvo | Chave |
| --- | --- | --- |
| 1 | Sessão de memória | `"triangulo:553499532444"` em `n8n_chat_histories` |
| 2 | Linha de `conversa_estado` | Data Table `ZsplBxJjXv3kwKZ8`, `tenantSlug`+`waId` |
| 3 | Lead no CRM | `d0aee73c-72e2-468e-bb6b-920e3b88bf17`, ordem `messages` → `conversations` → `leads` |
| 4 | Evento no Calendar | `tostamatias@gmail.com`, terça 2026-09-08 13:00 (Meet `bsy-htxg-evt`) |

### 14.7 Achado de paridade, não corrigido de propósito

O nó `Code: checar horario comercial` do `crivo-tool-agendar-reuniao` publicado é uma cópia
**minificada** do módulo (1.867 chars contra 5.704 em `n8n/generated/`): mesma lógica, mesmos
identificadores, mesmo harness final, sem comentários e sem formatação. Divergência cosmética
anterior a este lote, encontrada ao publicar a correção do `meetLink`. Não foi tocada — está fora do
escopo desta task, e reescrever 5.704 chars à mão para restaurar comentários inertes seria risco sem
retorno. Fica como dívida de paridade nomeada.

---

## T14 — Cenário 2 (escalar para humano): **APROVADO** (2026-09-08)

> **RESULTADO: o desfecho exigido por SMK-03 / AGT-05 foi atingido por conversa real.** Lead
> `3c9ce0fe-6b7c-439f-9912-eced234d018f`, `status = escalado_humano` com `escalationReason` gravado e
> responsável atribuído (André Luiz Martins), e a mensagem seguinte do lead registrada **sem nenhuma
> resposta do agente** — a trava provada pelo comportamento, não pelo status.

### 15.1 Três rodadas: as duas primeiras acharam defeitos, a terceira passou

| # | Lead | Desfecho | O que apareceu |
| --- | --- | --- | --- |
| 1 | `41e81d48-…` (07/09) | Os 3 requisitos atingidos | Mas o agente disse "vou chamar **o Arthur** pra cuidar do seu financiamento" — Arthur é o nome do PRÓPRIO LEAD; e pediu horário depois de a conversa já ter passado para um humano |
| 2 | `f3a9f435-…` (08/09) | Os 3 requisitos atingidos | Nome errado **repetiu** ("O Arthur T. vai continuar seu atendimento"), já com a correção de prompt publicada — prova de que instrução não bastava. Postura lida pelo usuário como "arrogante e desesperado para vender" |
| 3 | `3c9ce0fe-…` (08/09) | **APROVADO** | Nome correto, uma mensagem curta, sem negociar horário, abertura acolhedora |

### 15.2 Execuções da rodada aprovada

| Turno | Execução | O que prova |
| --- | --- | --- |
| 1 | `2190` | Lead **novo** (`firstContactAt 2026-09-08T21:47:02`, campos `null`). Abertura com a postura nova: "Oi, tudo bem? Eu sou o Lucas, da Triângulo Imóveis. Me diz qual anúncio você viu (ou o bairro/rua do imóvel) que eu te ajudo a entender a melhor opção pra você." — reage ao que o lead trouxe (o anúncio) em vez de pedir região como campo de formulário |
| 2 | `2195` | Transparência (AD-016): "Sim, eu sou um agente de atendimento automatizado da Triângulo Imóveis..." — confirma quando perguntado diretamente, sem negar |
| 3 | `2200` | `escalar_para_humano` com motivo; CRM devolve `status escalado_humano`, `escalationReason` e `assignedBroker` |
| 4 | `2206` | **`route: "somente-registrar"`**, sem `response_ai_agent` no metadata — a mensagem "Ok. Obrigado" foi gravada e o agente **não rodou** |

### 15.3 Desfecho exigido — item a item

| Exigência (roteiro §4) | Status | Evidência |
| --- | --- | --- |
| `status = escalado_humano` | OK | Captura do CRM: "Escalado para humano" |
| `escalationReason` gravado | OK | "Lead pediu para falar com um humano." (captura e execução `2200`) |
| Responsável atribuído | OK | `assignedBroker` com "André Luiz Martins" na observação de `2200` (rede de segurança da AD-022) |
| Mensagem seguinte gravada **sem resposta** | OK | Execução `2206`, rota `somente-registrar`, agente não executado |

**Captura de tela do CRM**: fornecida pelo usuário nesta janela (2026-09-08), painel do lead
"Arthur T." / `553499532444`, com o marcador vermelho "Escalado para humano", o banner "Lead pediu
para falar com um humano.", "Qualificação 0 de 9 campos" e "Reunião — Agendada para —".

### 15.4 O achado mais importante desta task: instrução de prompt perdeu para o payload

O nome errado foi corrigido **duas vezes**, e só a segunda funcionou.

- **Tentativa 1** (`3753977`, versão `f3ab55ad`) — regra no prompt: "use EXATAMENTE o nome que a tool
  devolveu no campo do responsável — NUNCA o nome do lead". **Falhou na rodada seguinte**: o agente
  disse "O Arthur T. vai continuar seu atendimento".
- **Causa**: `escalar_para_humano` é um `httpRequestTool` que faz `PATCH /leads/{id}` e entrega ao
  modelo **o corpo cru da resposta** — o lead inteiro, cujo `name` de primeiro nível é o nome do
  lead. O campo certo (`assignedBroker.name`) está aninhado e é menos proeminente. Quando a resposta
  errada é o campo mais óbvio do payload, instrução não resolve.
- **Tentativa 2** (`bfc3e36`, versão `d7c14587`) — correção na **fronteira**, na disciplina da
  AD-018: `optimizeResponse: true` + `fieldsToInclude: "except"` +
  `fields: "name,contactName,phone,externalId"`. O nome do lead deixou de existir no que o agente lê.
- **`except` e não `selected`, de propósito**: `selected` derrubaria o `code` do `problem+json` de um
  `409` (`transicao-invalida`, `lead-travado-por-humano`), que a AD-013 define como o canal de
  correção do agente. Fixado por teste em `principal-modelo.test.ts`.
- **Comparação direta do payload que o modelo lê**, mesma tool, duas rodadas:
  - antes (`2185`): `id`, `externalId`, **`name: "Arthur T."`**, `phone`, `status`, …, `assignedBroker.name: "André Luiz Martins"`
  - depois (`2200`): `id`, `status`, …, `assignedBroker.name: "André Luiz Martins"` — sem `name`, `contactName`, `phone` nem `externalId`

### 15.5 Correção de postura de conversa (mesma task, `bfc3e36`)

Feedback literal do usuário sobre a rodada 2: o agente parecia "arrogante e desesperado para vender",
"alguém que não está preocupado com mais nada além de conseguir fechar uma reunião". O diagnóstico
não é uma frase: todas as instruções empurravam para extrair campo e agendar, e nenhuma pedia
conversa. Três mudanças, todas de prompt:

1. **Postura**: reagir ao que o lead trouxe antes de puxar campo (se ele cita um anúncio, perguntar
   de qual imóvel se trata); pergunta aberta é melhor que pedir região quando ele disse pouco; nunca
   soar apressado nem empurrar reunião a cada turno; duas ou três trocas antes de qualificar são
   desejáveis.
2. **Primeiro turno**: proibido abrir pedindo região, tipo de imóvel ou dado de cadastro.
3. **Instrução de fase**: o campo do turno deixou de ser ordem — "se couber com naturalidade"; se o
   turno pedir só uma resposta, o campo espera.

Efeito visível na rodada aprovada: a abertura passou de "Em qual região você quer procurar?" para
"Me diz qual anúncio você viu (ou o bairro/rua do imóvel) que eu te ajudo a entender a melhor opção
pra você." Aprovado pelo usuário ("melhorou").

### 15.6 Observações de estilo — registradas, sem valor de veredito

- **`abertura-proibida` de novo**: 1 rejeição em `2200` ("Boa.") antes de acertar com "Certo.". Mesmo
  conflito com o `agentVoiceTone` do tenant, que pede "boa" e "show".
- **Qualificação zerada nesta conversa** (captura: "0 de 9 campos"). Aqui é **correto**: o lead pediu
  humano no segundo turno e nunca revelou modalidade, região ou tipo. Não é o defeito de registro
  incompleto do cenário 1.
- **Consequência conhecida do afrouxamento da instrução de fase**: os campos continuam sendo marcados
  como "perguntados" ANTES de o agente rodar. Se ele conversar em vez de perguntar, o campo é contado
  como perguntado mesmo assim. Defeito pré-existente (§14.5), que esta mudança torna mais visível.
  Não foi tocado: é mudança na máquina de fases, não no prompt.

### 15.7 Alvos de limpeza antes do cenário 3

Três alvos (não houve agendamento, então nada no Calendar):

| # | Alvo | Chave |
| --- | --- | --- |
| 1 | Sessão de memória | `"triangulo:553499532444"` em `n8n_chat_histories` |
| 2 | Linha de `conversa_estado` | Data Table `ZsplBxJjXv3kwKZ8`, `tenantSlug`+`waId` |
| 3 | Lead no CRM | `3c9ce0fe-6b7c-439f-9912-eced234d018f`, ordem `messages` -> `conversations` -> `leads` |

---

## T15 — Cenário 3 (opt-out): **APROVADO** (2026-09-09)

> **RESULTADO: o desfecho exigido por SMK-04 / LGPD-03 foi atingido por conversa real, ponta a
> ponta.** Lead `81509a2c-83ca-4bcc-8f3c-60aba7ffe374`, `optedOutAt = 2026-09-09T12:46:14.541Z`,
> sessão de memória purgada **pelo próprio fluxo**, exatamente uma confirmação enviada e silêncio
> depois. É o desfecho que a AD-015 deferiu em 2026-08-09 e que nunca tinha rodado.

### 16.1 Duas rodadas: a primeira achou um defeito de compliance

| # | Lead | O que aconteceu |
| --- | --- | --- |
| 1 | (09/09, manhã) | O lead escreveu "quero que você pare de me mandar mensagens" — pedido em português comum. `detectOptOut` só reconhece a palavra exata, então a rota `opt-out` **não disparou**, `optedOutAt` ficou nulo, e o agente respondeu "vou deixar de te mandar mensagens" (promessa que não tem como cumprir) e **seguiu respondendo mais três vezes**. Defeito de compliance real, não de estilo |
| 2 | `81509a2c-…` (09/09, 12:44) | **APROVADO** — com a orientação nova publicada |

### 16.2 Execuções da rodada aprovada

| Turno | Execução | O que prova |
| --- | --- | --- |
| 1 | `2229` | Lead **novo** (`firstContactAt 2026-09-09T12:44:46`, campos `null`) — estado limpo |
| 2 | `2234` | Lead diz "foi engano, não quero você me mandando mais mensagens". Agente: *"Entendi. Para encerrar de vez, basta você responder com a palavra sair, sozinha, sem mais nada."* — reconhece a intenção, **não promete parar**, e orienta |
| 3 | `2239` | `route: "opt-out"` (gate determinístico na palavra exata). Nó `Chat Memory Manager: purgar memória (opt-out)` executou com `{success: true}` — **purga pelo próprio fluxo**. Confirmação única enviada |
| 4 | `2243` | `optedOutAt: "2026-09-09T12:46:14.541Z"` já preenchido; `route: "somente-registrar"`; a mensagem "teste" foi gravada e **nenhuma resposta** foi enviada |

### 16.3 Desfecho exigido — item a item

| Exigência (roteiro §5) | Status | Evidência |
| --- | --- | --- |
| `optedOutAt` preenchido | OK | `2026-09-09T12:46:14.541Z`, lido no gate de `2243` |
| Sessão purgada **pelo fluxo**, não pela limpeza manual | OK | Nó de purga executou em `2239` com `{success: true}`, dentro da rota `opt-out` |
| Exatamente UMA confirmação, e silêncio depois | OK | Confirmação em `2239`; `2243` roteado para `somente-registrar`, sem resposta |

**Captura**: conversa completa fornecida pelo usuário (09/09), mostrando os quatro turnos e a ausência
de resposta ao "teste".

### 16.4 A correção que destravou o cenário — e por que ela não emenda a AD-018

A rodada 1 expôs um buraco de compliance: quem pede para parar em português comum não era
descadastrado. Quatro desenhos foram postos ao usuário; ele escolheu um quinto, melhor que os três
que eu havia proposto:

> **O agente interpreta a intenção e orienta o lead a digitar a palavra `sair`.**

Por que este desenho é o certo:

- **O efeito continua 100% determinístico.** `gate.mjs` **não mudou uma linha** (confirmado por
  `git status` antes do commit). O opt-out segue detectado antes do agente, por igualdade exata.
- **Nenhuma tool de opt-out é exposta ao modelo** — a metade literal da AD-018 que trata do
  invariante de LGPD. **A AD-018 fica intacta, sem emenda.**
- **O modelo faz só o que cabe a ele**: reconhecer intenção e orientar. Não decide efeito nenhum.
- **A confirmação vira ato explícito do lead**, que é o consentimento mais forte para LGPD — mais
  forte que uma inferência de modelo.
- **Falso positivo custa zero**: quem não quer sair simplesmente não digita. Compare com a
  alternativa de expor a tool, onde um falso positivo tira o lead do funil e exige ato humano para
  desfazer.

Fecha também a promessa fora de capacidade: o agente passa a nunca dizer que vai parar nem que já
parou.

**SPEC_DEVIATION registrado**: "opt-out por linguagem natural" estava Out of Scope no `spec.md` deste
lote, adiado para o L13. Trazido para cá por decisão explícita do usuário (2026-09-09), com o
argumento de compliance. Commit `585633a`, versão publicada `57ea08a0-…`.

### 16.5 Limite conhecido e aceito

A cobertura **não** é total, e não deve ser lida como tal: o agente agora *orienta* em qualquer
redação, mas o descadastro só acontece se o lead digitar a palavra. Se ele pedir para parar e não
responder mais nada, `optedOutAt` continua nulo — a conversa morre sem registro formal. É inerente ao
desenho que preserva a AD-018, e é exatamente o que um L13 precisaria resolver se o produto quiser
cobertura sem ato do lead.

### 16.6 Observações de estilo

- Nenhuma rejeição por `abertura-proibida` nesta conversa.
- Abertura do turno 1 com a postura nova ("Me conta qual imóvel você procura que eu te ajudo a chegar
  na melhor opção") — sem pedir dado de cadastro de saída.
- A confirmação de opt-out é texto fixo do fluxo, não do modelo — por desenho.

### 16.7 Alvos de limpeza depois do cenário 3

Três alvos. **Atenção**: a sessão de memória já foi purgada pelo fluxo; o que resta é o lead e a linha
de estado.

| # | Alvo | Chave |
| --- | --- | --- |
| 1 | Sessão de memória | `"triangulo:553499532444"` — já purgada pelo fluxo em `2239`, conferir só por garantia |
| 2 | Linha de `conversa_estado` | Data Table `ZsplBxJjXv3kwKZ8`, `tenantSlug`+`waId` |
| 3 | Lead no CRM | `81509a2c-83ca-4bcc-8f3c-60aba7ffe374`, ordem `messages` -> `conversations` -> `leads` |

---

## T16 — Veredito consolidado da prova conversacional: **APROVADO** (2026-09-09)

> **Os três desfechos que a AD-015 deferiu em 2026-08-09 têm, agora, prova de execução real.** Cada
> um foi atingido numa conversa limpa, com id de execução, estado final conferido no CRM e captura de
> tela. O veredito é APROVADO **pela barra da spec** — o estado final no CRM, nunca o estilo
> (`spec.md` P1-smoke AC7).

### 17.1 Veredito por cenário

| Cenário | Requisito | Veredito | Desfecho provado |
| --- | --- | --- | --- |
| 1 — qualificar → agendar | SMK-02 / AGT-04 | **APROVADO** | `qualificado_agendado`, reunião 2026-09-08 13:00, André Luiz Martins, evento com Meet `bsy-htxg-evt` |
| 2 — escalar para humano | SMK-03 / AGT-05 | **APROVADO** | `escalado_humano` + `escalationReason` + responsável, e mensagem seguinte sem resposta (`2206`, rota `somente-registrar`) |
| 3 — opt-out | SMK-04 / LGPD-03 | **APROVADO** | `optedOutAt` gravado, memória purgada pelo próprio fluxo, uma confirmação e silêncio (`2243`) |

### 17.2 As rodadas reprovadas, nominalmente

Registradas porque o veredito só é honesto com elas à vista. **Nenhuma foi reprovação do modelo** no
sentido de qualidade de fala: cada uma expôs um defeito do produto que só uma conversa real revelaria.

| Cenário | Rodada | Por que não valeu |
| --- | --- | --- |
| 1 | `0b6573b9-…` | **Não realizada**: a limpeza não pegou. O `POST /leads` reidratou o lead da bateria, com `status` terminal e memória de ontem. Toda remarcação bateu em `409` |
| 1 | `4e6db4df-…` | Desfecho atingido, mas o agente **agendou antes do aceite** e depois não conseguiu remarcar |
| 1 | `6111d33f-…` | Desfecho atingido, mas disse que a reunião seria "aqui no WhatsApp" e traduziu `horario-ocupado` como "conflito na agenda" |
| 2 | `41e81d48-…` | Desfecho atingido, mas anunciou **o nome do próprio lead** como se fosse o corretor, e pediu horário depois de escalar |
| 2 | `f3a9f435-…` | Nome errado **repetiu**, já com a correção de prompt publicada. Postura lida como "arrogante e desesperado para vender" |
| 3 | (09/09 manhã) | **Buraco de compliance**: o lead pediu para parar em português comum, o opt-out não disparou, e o agente prometeu parar e continuou respondendo |

### 17.3 O que o smoke encontrou — e por que isso justifica o lote

Onze defeitos reais, nenhum deles alcançável por teste automatizado, todos corrigidos e republicados
com hash conferido antes de ativar:

| # | Defeito | Correção | Commit |
| --- | --- | --- | --- |
| 1 | Não cumprimentava nem se apresentava | Instrução de abertura de sessão | `d4ab8cf` |
| 2 | Agendava antes do lead aceitar | Propor → esperar aceite → chamar tool | `f2a3051` |
| 3 | Perguntava e agendava no mesmo turno | Regra "ou pergunta, ou agenda" | `2fe2067` |
| 4 | Perguntava campo oportunista após confirmar | Proibição no ramo de reunião confirmada (QLF-01 AC4/AC5) | `2fe2067` |
| 5 | `meetLink` era a página do evento, não o link de entrada | `hangoutLink` no lugar de `htmlLink` | `c3b8848` |
| 6 | Dizia que a reunião seria "pelo WhatsApp" | Canal declarado como Google Meet, com alternativa de ligação | `c3b8848` |
| 7 | Vazava jargão técnico ao lead | Tradução obrigatória para linguagem do lead | `c3b8848` |
| 8 | Anunciava o nome do lead como corretor | Recorte da resposta na fronteira da tool | `bfc3e36` |
| 9 | Postura de vendedor apressado | Seção de postura de conversa | `bfc3e36` |
| 10 | Negociava horário depois de escalar | Regra de entrega ao humano | `3753977` |
| 11 | Opt-out em linguagem natural sem registro | Orientação para digitar a palavra, sem tocar no gate | `585633a` |

**O achado que vale além deste lote** (§15.4): o defeito 8 foi corrigido duas vezes. A primeira, por
instrução de prompt, **falhou** — o payload devolvia o lead inteiro e o `name` do topo era mais óbvio
que o `assignedBroker.name`. Só a correção na fronteira funcionou. Quando a resposta errada é o campo
mais visível do payload, instrução não vence: é preciso remover o campo.

### 17.4 Observações de estilo consolidadas — nenhuma reprova cenário

- **`agentVoiceTone` × `voice.mjs` (recorrente, em todos os cenários)**: o tom configurado pelo tenant
  pede "boa" e "show", exatamente as palavras que `voice.mjs:27` barra como abertura. Custa de 1 a 3
  iterações por turno quando o modelo tenta usá-las. **É conflito de configuração, não do modelo** —
  o melhor candidato a próximo ajuste, e é ajuste de tenant, não de código.
- **Registro de qualificação incompleto (cenário 1, todas as rodadas)**: `modality` e `propertyType`
  ficaram `null` mesmo o lead tendo dito "imóvel usado" e "Apartamento". Só `region` foi gravada.
- **Campos marcados como perguntados antes de o agente rodar**: defeito pré-existente da máquina de
  fases, que o afrouxamento da instrução de fase (defeito 9) torna mais visível. Não foi tocado.

### 17.5 Fix task? Não

Nenhum cenário reprovou pelo desfecho na rodada final, então `spec.md` P1-smoke AC8 não é acionado.
Os itens da §17.4 são observação, e os defeitos da §17.3 já foram corrigidos durante a própria fase —
não sobra nenhum aberto que exija fix task antes de SMK-02/03/04 e AGT-04/AGT-05/LGPD-03 subirem na
rastreabilidade.

### 17.6 Congelamento de `vitest` encerrado

O congelamento declarado em §13.5 vigorou da T12 até aqui. Esta é a primeira rodada completa de
testes desde então.

**Resultado**: `npx vitest run` = **1076 passed (1076) em 82 arquivos, 0 falhas, exit 0**. Piso de T1
era 1015 em 81 arquivos: **+61 testes, +1 arquivo**, monotônico. A suíte `n8n/src` sozinha foi de 168
para 236 ao longo do lote.

**Nota de método** — duas rodadas concorrentes contra o mesmo `TEST_DATABASE_URL` produziram falhas
falsas antes desta: uma acusou `23503` em `create-admin.test.ts`, outra acusou 6 tenants onde o
`seed.test.ts` espera 3. Não são regressões — são duas execuções semeando o mesmo banco ao mesmo
tempo. A rodada isolada, com nenhum outro processo `node` vivo, veio limpa. **A suíte usa um banco
compartilhado: nunca rodar duas ao mesmo tempo.**

## T25 — Multi-tenancy real: **caminho indisponível** (2026-09-09)

### 18.1 Decisão do usuário

Perguntado diretamente se o 2º número (Vale do Uberaba) já tinha sido homologado no painel da Meta, o
usuário respondeu, nesta janela, em 2026-09-09: **"Não tem como adicionar o numero dele. Ignore essa
pendencia. Vale do Uberaba é fictício."**

Isso muda a natureza da pendência que o Handoff do lote-9 e do lote-8 vinham carregando como "Vale do
Uberaba sem `tenant_config` (falta 2º número homologado)" — uma formulação que presumia homologação
futura, só atrasada. O que o usuário registrou agora é diferente: **não existe caminho para obter esse
número**, porque o tenant `vale-uberaba` não corresponde a um negócio real capaz de passar pela
verificação de empresa da Meta. Este lote não teve como confirmar de forma independente o motivo
exato (não há tool MCP para consultar status de homologação de número no painel da Meta) — o registro
aqui é o que o usuário informou diretamente, não uma inferência.

### 18.2 MTN-01 — não verificado, por ausência estrutural de caminho, nunca por omissão

`MTN-01` fica **explicitamente não verificado** na rastreabilidade do lote-10 (`spec.md`, atualizado
nesta task). Não é "não tentado" nem "aprovado por ausência" — é um requisito cujo pré-requisito
(número real homologável para `vale-uberaba`) não existe, segundo a informação do usuário. Nenhuma
linha nova foi escrita em `tenant_config`; nenhum cenário foi repetido no segundo número; nenhum lead
foi criado sob `vale-uberaba` nesta task.

### 18.3 O que permanece fechado

Os três desfechos que dependiam de conversa real — `AGT-04`/`SMK-02` (qualificar→agendar), `AGT-05`/
`SMK-03` (escalonamento) e `LGPD-03`/`SMK-04` (opt-out) — foram todos provados no tenant `triangulo`
(T13–T15) e não dependem de `vale-uberaba` nem de MTN-01. Nada neste achado reabre nenhum dos três.

### 18.4 Nota para reconciliação futura, fora do escopo desta task

A AD-001 descreve o MVP como piloto pago com **dois** clientes-âncora reais de Uberaba/MG, e o
Handoff do lote-9 já registrava que as métricas-baseline de ambos os tenants-piloto (`vale-uberaba` e
`triangulo`) foram preenchidas com dado **fictício**, por decisão do usuário, à espera de dado de
campo real. O que este T25 acrescenta é mais específico: para `vale-uberaba`, não é só a métrica que
é provisória — o próprio número de WhatsApp não tem caminho de homologação no momento. Se isso
significa que o segundo cliente-âncora da AD-001 não está mais em pé, ou que `vale-uberaba` sempre foi
só um tenant de demonstração, é uma pergunta sobre premissa de produto que cabe ao usuário resolver
numa rodada de Specify futura — não é reescrita aqui, e a AD-001 não é emendada por este lote.
