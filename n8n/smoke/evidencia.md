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
