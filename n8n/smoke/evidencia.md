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
