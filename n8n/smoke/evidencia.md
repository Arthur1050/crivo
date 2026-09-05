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

- **T3** (`99b8783`): `agentModel` em `n8n/workflows/principal.ts` deixa de ser
  `@n8n/n8n-nodes-langchain.lmChatGoogleGemini` v1.1 / `models/gemini-3.5-flash-lite` /
  `temperature: 0.4` e passa a `@n8n/n8n-nodes-langchain.lmChatOpenAi` v1.3, `model` como resource
  locator (`value` = `cachedResultName` = `gpt-5.4-nano-2026-03-17`),
  `options: { reasoningEffort: "low", timeout: 120000 }`, credencial `openAiApi` "OpenAI account".
  Suíte nova `n8n/workflows/__tests__/principal-modelo.test.ts` (7 testes) fixa o nó novo **e** o que
  não podia mudar (5 tools, memória, 61 nós / 75 conexões da §2.2).
- **Contagem de testes**: `npx vitest run` = **1022 passed (1022) em 82 arquivos**. Piso de T1 era
  1015 em 81 arquivos: +7 testes, +1 arquivo, exatamente a suíte nova. Nenhuma deleção silenciosa.
- **T4** (`dacba56`): `node scripts/n8n-inline.mjs` rodado; `git diff n8n/generated/principal.ts`
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
