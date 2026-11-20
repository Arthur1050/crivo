# Lote 18a — Costuras do núcleo — Validação

> Desde o fechamento (2026-11-16, AD-029), `tasks.md` e `EXECUTE-PROMPT.md` estão em [`../../archive/lote-18a-costuras-do-nucleo/`](../../archive/lote-18a-costuras-do-nucleo/); as citações de `tasks.md` abaixo se referem a esse arquivo.

## Capturas da base e do fim (T3, T44 — KEEP-05)

**Data**: 2026-11-10. **Base**: `bf5e646`, num worktree descartável. **Fim**: `lote-18a` em `2154adc` (código igual ao de `0ad44fb`, a T43). As duas subiram com `npm run preview:test` na porta 3210, contra o mesmo banco de teste base, em sequência (a base foi derrubada antes de o fim subir), sem suíte nem script de fixture entre elas. Mesma janela do Chrome (1440 × 900, área útil de 1384 × 849) e mesmas escalas por captura.

**Logins**: administrador `verificacao@fixture.test` e corretor `corretor@fixture.test`, na `krivo-demo`.

**Método**: comparação visual de cada par e diferença de pixels em tons de cinza com limiar de 40 (Pillow), contando os pixels acima do limiar.

| Página | Administrador | Corretor |
| --- | --- | --- |
| Login | nenhuma (178 pixels no campo de e-mail: cursor do mouse e caret, só na captura do fim) | mesma tela, sem sessão |
| Dashboard | nenhuma (0 pixels) | nenhuma (0 pixels) |
| Pipeline | nenhuma (0 pixels) | nenhuma (0 pixels) |
| Chats | nenhuma (0 pixels) | nenhuma (0 pixels) |
| Documentos | nenhuma (0 pixels) | nenhuma (0 pixels) |
| Imóveis | nenhuma (0 pixels) | nenhuma (0 pixels) |
| Configurações | nenhuma (0 pixels) | nenhuma (0 pixels; 404 nas duas) |
| Usuários | nenhuma (0 pixels) | nenhuma (0 pixels; 404 nas duas) |

**Menu de cada papel**: igual ao da base. Administrador: Dashboard, Pipeline, Chats, Documentos, Imóveis, Configurações e Usuários. Corretor: Dashboard, Pipeline, Chats, Documentos e Imóveis.

**Observações**: o selo "1 Issue" do modo de desenvolvimento do Next aparece nas mesmas páginas nas duas versões (Dashboard, Documentos e Configurações), então não vem do lote. Os textos relativos ("há 1 dia", "Atualizada ontem") são dado variável e saíram iguais porque as duas sessões rodaram no mesmo dia. Resultado: **nenhuma diferença visível**; nenhuma correção foi necessária.

**Arquivos**: `evidence/base/` e `evidence/end/`, com os mesmos nomes (`login.jpg`, `admin-01-dashboard.jpg` a `admin-07-usuarios.jpg`, `corretor-01-dashboard.jpg` a `corretor-07-usuarios.jpg`).

---

## Validation: Lote 18a — PASS

**Data**: 2026-11-16 (checagem da G1, a 4ª, autorizada pelo usuário acima do limite de 3 iterações; a primeira verificação foi em 2026-11-10, e as duas reverificações em 2026-11-15)
**Spec**: `.specs/features/lote-18a-costuras-do-nucleo/spec.md`
**Faixa de diff**: `bf5e646..75d218c` (81 commits, 474 arquivos); correções do Verifier em `e35ce43..75d218c`; desde a reverificação final, `025accf..75d218c` (1 commit, 2 arquivos: `tasks.md` e `qualification-kit.test.ts`)
**Verifier**: subagente independente (autor ≠ verificador), sem contexto da execução

Resumo: a F12 tirou o corpo do caso sem faceta da ordem inversa de `LEAD_QUALIFICATION_FIELDS`. Com `region` no meio do corpo, os quatro mutantes da regra de ordem e de precedência da QUAL-02 AC2 morrem, inclusive o Q1b, que sobrevivia. Era a única lacuna bloqueante. Os gates curtos passaram, e a suíte completa e o build já tinham passado em `a04e800`, sem mudança de código desde então. Seguem a KEEP-03 AC2 como Minor herdada e as observações não bloqueantes da reverificação de `a04e800`.

## Checagem da G1 de 2026-11-16

Sobre `75d218c`. `git diff 025accf..HEAD --stat`: só `.specs/features/lote-18a-costuras-do-nucleo/tasks.md` (+1) e `src/server/integration/__tests__/qualification-kit.test.ts` (+1 −1). Nenhum arquivo de código mudou.

### G1: QUAL-02 AC2 sem faceta

| Regra da QUAL-02 AC2 (`spec.md:266`) | Evidência `arquivo:linha` | Resultado |
| --- | --- | --- |
| cita o primeiro campo na ordem de `LEAD_QUALIFICATION_FIELDS` (`src/vertical-kit/index.ts:34-37`) | `src/server/integration/__tests__/qualification-kit.test.ts:67-74`: corpo `{ chainedOperation, region, budgetCents }` (`:68`) → `detail: "Campo 'region' inválido."` (`:71`), sem gravar (`:73`) | ✅ Primeiro do corpo e último da lista dão `chainedOperation`, último do corpo dá `budgetCents`; só o primeiro da lista dá `region` |
| depois das validações de `status`, `executiveSummary` e `escalationReason` | `qualification-kit.test.ts:76-88`, sem mudança desde `025accf` | ✅ |
| código | `src/server/integration/parsers.ts:289-292`, depois de `:265` (`status`) e `:280` (`executiveSummary`, `escalationReason`) | ✅ |

A única linha alterada do teste é o corpo (`:68`). A asserção (`:71`) e o título do caso ficaram iguais; nenhuma asserção foi removida ou enfraquecida.

### Sensor de discriminação

Mutantes injetados em `src/server/integration/parsers.ts:290` (Q2 no topo do parser, antes de `:265`), a partir de uma cópia no scratchpad (SHA-256 `af3812a6…a9`), por um script que exige ocorrência única do trecho. Depois de cada mutante, o arquivo foi restaurado da cópia e o hash conferiu com o original. Não usei `git stash`. Rodaram `qualification-kit.test.ts` e `parsers.test.ts`, com 70 testes. `git status --porcelain` saiu vazio antes do primeiro mutante e depois do último, as duas saídas iguais.

| # | Mutação em `createLeadPatchParser` | Morto? |
| --- | --- | --- |
| Q1 | `:290` `[...LEAD_QUALIFICATION_FIELDS].reverse().find(...)`: cita o último campo presente na ordem da lista | ✅ (1 falha: `qualification-kit.test.ts:67`) |
| Q1b | `:290` campos de qualificação de `Object.keys(json)`, `.pop()`: cita o último na ordem do corpo | ✅ (1 falha: `:67`) |
| Q3 | `:290` campos de qualificação de `Object.keys(json)`, `[0]`: cita o primeiro na ordem do corpo | ✅ (1 falha: `:67`) |
| Q2 | recusa sem faceta inserida antes da validação de `status` (`:265`) | ✅ (3 falhas: `:76-88`, os casos de `status`, `executiveSummary` e `escalationReason`) |

**Resultado do sensor**: 4 de 4 mortos.

### Gate

Na árvore real em `75d218c`, em sequência:

- **`npx vitest run src/server/integration/__tests__/qualification-kit.test.ts src/server/integration/__tests__/parsers.test.ts`**: 2 arquivos, 70 testes, 0 falha.
- **`npx tsc --noEmit -p .`**: 0 erros.
- **`npx eslint src/server/integration`**: 0 erros e 1 aviso (diretiva `eslint-disable` sem uso em `src/server/integration/__tests__/route-instrumentation.test.ts:60`; o arquivo é igual ao de `bf5e646`, então o aviso é da linha de base).
- A suíte completa e o build não rodaram, por instrução: desde `a04e800`, onde passaram (278 arquivos, 4.319 testes, 0 falha; 29 de 29 páginas), só mudaram testes sem banco e documentação.
- Trailers: `git log bf5e646..75d218c` não tem `Co-Authored-By` nem "Generated with".

### Rastreabilidade

Com o veredito PASS, os requisitos do lote podem passar de `Implementing` para verificados na tabela da spec (`spec.md:380` em diante); esta checagem não altera a spec. A F8 foi marcada em `tasks.md`: o gate da suíte completa passou em `a04e800`, e a G1 que a mantinha aberta fechou aqui.

**Não bloqueantes, mantidos**: KEEP-03 AC2 (Minor, herdada): `db:push:test` segue sem prova independente, com o registro do executor. As observações sem efeito no veredito da reverificação de `a04e800` (itens 1 a 4) continuam valendo.

---

## Reverificação final de 2026-11-15 (FAIL, sobre `b595e81`)

Sobre `b595e81`. `git diff 52970c2..HEAD --stat`: só `spec.md` (+1 −1), `tasks.md` (+2) e `src/server/integration/__tests__/qualification-kit.test.ts` (+22). Nenhum arquivo de código mudou.

### G1: QUAL-02 AC2 sem faceta

| Regra da QUAL-02 AC2 (`spec.md:266`) | Evidência `arquivo:linha` | Resultado |
| --- | --- | --- |
| 400 `payload-invalido`, `detail` `Campo '<campo>' inválido.` | `qualification-kit.test.ts:51-64` (um campo por requisição, com valor, `null` e `[]`), `:69-72` | ✅ |
| cita o primeiro campo na ordem de `LEAD_QUALIFICATION_FIELDS` (`src/vertical-kit/index.ts:34-37`: `region`, `purchaseHorizon`, `modality`, `propertyType`, `motivation`, `creditStatus`, `budgetCents`, `chainedOperation`) | `qualification-kit.test.ts:67-74`: corpo `{ chainedOperation, budgetCents, region }` (`:68`) → `detail: "Campo 'region' inválido."` (`:71`) | ⚠️ Parcial. O caso distingue "primeiro da lista" de "último da lista" (Q1) e de "primeiro do corpo" (Q3). Mas o corpo está na ordem inversa da lista, então "último do corpo" também dá `region` (Q1b sobrevive), embora o título do caso diga "não a do corpo" |
| depois das validações de `status`, `executiveSummary` e `escalationReason` | `qualification-kit.test.ts:76-88`: cada valor inválido junto de `region` (`:81`) → `detail` de `status` (`:77`, `^Campo 'status' inválido\. Valores aceitos: `), `executiveSummary` (`:78`) e `escalationReason` (`:79`, `deve ser uma string.`) | ✅ Q2, Q2b e Q2c mortos |
| não grava | `:73`, `:87` (`updateLeadFromAgent` não chamado) | ✅ |

As expectativas dos casos novos conferem com o texto da AC2 e com o código (`src/server/integration/parsers.ts:265-292`). Nenhuma asserção antiga mudou: o diff do arquivo só adiciona linhas.

**CAT-02 (F11)**: `spec.md:311-312` lista os itens 1 e 2 em sequência, e a emenda vem logo depois, em `:314`. ✅

### Sensor de discriminação

Mutantes injetados no próprio `src/server/integration/parsers.ts`, a partir de uma cópia guardada no scratchpad (SHA-256 `af3812a6…a9`), por um script que exige ocorrência única de cada trecho. Depois de cada mutante, o arquivo foi restaurado da cópia, e no fim o hash conferiu com o original. Não usei `git stash`. Rodaram `qualification-kit.test.ts`, `parsers.test.ts` e `qualification-contract.test.ts`, com 72 testes. `git status --porcelain` saiu vazio antes do primeiro mutante e depois do último, as duas saídas iguais.

| # | Mutação em `createLeadPatchParser` (`parsers.ts`) | Morto? |
| --- | --- | --- |
| Q1 | `:290` `LEAD_QUALIFICATION_FIELDS.findLast(...)`: cita o último campo presente na ordem da lista | ✅ (1 falha: `:67`) |
| Q1b | `:290` `Object.keys(json).findLast(...)`: cita o último campo de qualificação na ordem do corpo | ❌ Sobreviveu (72 de 72 passam) |
| Q3 | `:290` `Object.keys(json).find(...)`: cita o primeiro campo de qualificação na ordem do corpo | ✅ (1 falha: `:67`) |
| Q2 | bloco `:289-292` movido para antes da validação de `status` (`:263`) | ✅ (3 falhas: `:76-88`) |
| Q2b | bloco movido para depois de `status` e antes de `executiveSummary` (`:276`) | ✅ (2 falhas: `executiveSummary`, `escalationReason`) |
| Q2c | recusa dentro do laço, entre `executiveSummary` e `escalationReason` (`:280`) | ✅ (1 falha: `escalationReason`) |

**Profundidade**: focada na G1, com 6 mutantes: Q1 e Q2 refeitos e 4 novos.
**Resultado do sensor**: 5 de 6 mortos. Sobreviveu a Q1b, a regra de ordem da AC2. FAIL.

### Gate

Na árvore real em `b595e81`, em sequência:

- **`npx vitest run src/server/integration/__tests__/qualification-kit.test.ts`**: 1 arquivo, 22 testes, 0 falha.
- **`npx tsc --noEmit -p .`**: 0 erros, saída 0.
- **`npx eslint .`**: 0 erros e 9 avisos (linha de base).
- **`validate_spec.py lote-18a-costuras-do-nucleo`**: 0 erros e 0 avisos.
- A suíte completa e o build não rodaram nesta rodada, por instrução: a mudança é só um teste sem banco e documentação. Ambos passaram em `a04e800` (278 arquivos, 4.319 testes, 0 falha; 29 de 29 páginas).
- Trailers: `git log bf5e646..b595e81` não tem `Co-Authored-By` nem "Generated with".

### Lacuna que vira task de correção

1. **G1 residual, QUAL-02 AC2: ordem do corpo inversa à da lista (Minor, bloqueante pelo método)**. O corpo de `qualification-kit.test.ts:68`, `{ chainedOperation, budgetCents, region }`, está na ordem inversa de `LEAD_QUALIFICATION_FIELDS`. Por isso "último do corpo" e "primeiro da lista" dão o mesmo `region`, e Q1b sobrevive.
   - **Correção** (só de teste): pôr `region` no meio do corpo, por exemplo `{ chainedOperation: true, region: "Centro", budgetCents: 1 }`, mantendo a asserção `Campo 'region' inválido.`. Assim o primeiro do corpo é `chainedOperation`, o último do corpo é `budgetCents`, o último da lista é `chainedOperation`, e só o primeiro da lista dá `region`.
   - **Verificação**: refazer Q1, Q1b e Q3.

Fora isso, a KEEP-03 AC2 segue como antes (Minor, herdada).

### Rastreabilidade

Nenhum requisito muda de status. Com o veredito FAIL, todos ficam em `Implementing`, e a caixa da F8 continua aberta, embora o gate da suíte completa já tenha passado em `a04e800`.

As observações não bloqueantes da reverificação anterior continuam valendo (seção seguinte, "Observações sem efeito no veredito", itens 1 a 4).

---

## Reverificação de 2026-11-15 (anterior, sobre `a04e800`)

### Lacunas do FAIL anterior

| # | Lacuna de 2026-11-10 | Evidência nesta verificação | Resultado |
| --- | --- | --- | --- |
| 1 | M26: a faceta de segmentos chega ao processamento de documentos | `src/kit/document-services.ts:9` passa `facet: realEstate.documentSegments`; `src/server/documents/__tests__/processing.integration.test.ts:100-121`: tetos `novo` 1 e `usado`/`ambos` 1.000.000, `usado` → `{ kind: "completed", status: "pronto" }` (`:108-109`), `novo` → `fora_do_agente` (`:112`), contexto `usado` e `ambos` = `[used.id]` e `novo` = `[]` (`:116-118`). A regra é a de `bf5e646` (`context-budget.ts`, `applies`: consulta `ambos`, documento `ambos` ou mesmo segmento). M26 refeito: morto. M26b (`reconcileTenantDocumentAdmission` com `null`, `:13`): morto por `repository.test.ts` | ✅ Fechada |
| 2 | VERT-03: grafo do vertical de teste filtrado pela camada do `map.json` | `src/vertical-kit/__tests__/fixture-vertical.integration.test.ts:118-126` filtra por `classifyFile(file, map)?.layer === "vertical"` e afirma `[]`; `source-graph.ts:22-23` trata JSON como folha. Mutante F3 (import de `phase.mjs` devolvido a `src/db/schema.ts`, na árvore real com cópia e restauração): morto, com `"n8n/verticals/real-estate/src/phase.mjs"` no diff da falha | ✅ Fechada |
| 3 | M1: campos de `brand` e `tenantNoun` validados | `src/vertical-kit/__tests__/index.test.ts:20-28` (`name`, `problemUrn`, `tenantHeader`, `alertTag` com `undefined`, `null`, `7`, `""`, `" "` → `Vertical inválido: brand.<campo>.`); `:30-44` (`tenantNoun`, `singular`, `plural`, agora também com `""`). M1a, M1b e M1c: mortos | ✅ Fechada |
| 4 | Inliner sem teste de `--vertical` e `--out` | `scripts/__tests__/n8n-inline-cli.test.ts:32-48` (`--out` e `--vertical real-estate --out` gravam só na pasta pedida, iguais a `renderWorkflows`, com `n8n/generated/` intocado) e `:50-61` (vertical sem manifesto ou com nome inválido sai com erro e não grava). N14 (`--out` ignorado) e N15 (`--vertical` ignorado): mortos | ✅ Fechada |
| 5 | Spec sem as emendas da QUAL-02 AC2 e das CAT-01/02 | `spec.md:263-268` (texto `Campo '<campo>' inválido.` e a emenda); `spec.md:306` e `:311` (actions em `app`) e `:313` (emenda) | ✅ Fechada no texto; a emenda da QUAL-02 abriu a lacuna nova G1 (abaixo). A emenda das CAT ficou entre o AC1 e o AC2 da CAT-02 (`spec.md:313`), o que quebra a numeração da lista (cosmético) |
| 6 | `workflow-baseline.ts` sem documentar a dependência de `git show bf5e646` | `n8n/workflows/__tests__/workflow-baseline.ts:1-10` (clone raso sem `bf5e646` quebra os testes; troca no backlog); `.specs/ROADMAP-POS-PILOTO.md` item (1) | ✅ Fechada |
| 7 | Imports de `phase.mjs` no núcleo e entrada `check:` | `git grep phase.mjs -- src app scripts/boundary eslint.config.mjs` (fora de teste): só `src/verticals/real-estate/qualification.ts:3` (camada `vertical`). `scripts/boundary/transitional.json:724-728`: `check:lead_agent_state_asked_fields`, `stored`, `L18c`; as 4 entradas `import:` saíram. `src/db/schema.ts:380-383` lista os 8 campos na ordem de `FIELD_LABELS`, e o `CHECK` (`:405`) gera o mesmo SQL: `scripts/__tests__/boundary-schema.test.ts:26` (foto igual à base) e `:48-54` (lista igual a `qualification.agentFields` e entrada única `check:`) | ✅ Fechada |
| 8 | F8: suíte completa verde | `npm test` nesta verificação: 278 arquivos, 4.319 testes, 0 falha, saída 0 (1.218 s), com o teste de Havana em 2020 | ✅ Gate fechado (a caixa da F8 fica aberta porque o veredito é FAIL) |

**F9 (Havana)**: `src/db/__tests__/schema-whatsapp-usage.test.ts:94-109` manteve as mesmas 6 asserções (3 `toEqual` de instante, `freeServiceVolume` 999 e as duas recusas `23514`), com os instantes de 2026 trocados pelos de 2020 e nada mais. Em 2020 Cuba saiu do horário de verão em 1º/11 à 01:00 local, então a meia-noite de 1º/11 se repete em 04:00Z e 05:00Z, e a de 1º/12 cai em 05:00Z: a fixture tem a mesma forma da original. Contagem de `expect(` igual (52 antes e depois).

**Auditoria dos testes alterados nas correções** (`e35ce43..a04e800`, 15 arquivos): nenhum perdeu `expect(` nem ganhou `skip`/`only`/`todo`. `openapi.test.ts`, `agent-state.test.ts`, `conduction-reengagement.test.ts` e `messages-reengagement.test.ts` só trocaram import (diff conferido linha a linha). Em `qualification-facts.test.ts` (arquivo novo do L18a, ausente em `bf5e646`), o caso sem faceta passou de `pendingField: "region"` para `pendingField: null` com `askedFields: []`, o que segue a decisão F1 do usuário; o caso com `["modality"]` sem faceta ficou como recusa (`:75-80`). Em `boundary-eslint.test.ts`, o caso de exceção virou recusa, porque a exceção deixou de existir.

### Checagem ancorada na spec (critérios tocados pelas correções)

| Critério | Resultado definido na spec | Evidência `arquivo:linha` | Resultado |
| --- | --- | --- | --- |
| VERT-01 AC1 | campos do contrato; peças do agente fora do bundle do navegador | `src/vertical-kit/__tests__/index.test.ts:46`, `:61-66`, `:78-90` (`agentFields` e `nextFieldToAsk` preservados), `:92-99` (`qualification.nextFieldToAsk` e `qualification.agentFields` recusados com `undefined`, texto, `[""]` e duplicado); nenhum arquivo `"use client"` importa `src/verticals/real-estate` | ✅ PASS |
| VERT-01 AC2 | kit só importa o vocabulário | `src/vertical-kit/__tests__/index.test.ts:110` | ✅ PASS |
| VERT-01 AC3 | `id` vazio e colisão lançam erro nomeando o campo | `index.test.ts:52-53` (`/\bid\b/`), `:56-58` (`resources[0].name`) | ✅ PASS |
| VERT-01 AC4 | papel ausente quebra a compilação | `index.test.ts:104-107` (`@ts-expect-error`) | ✅ PASS |
| VERT-01 AC5 | núcleo recebe o vertical por parâmetro ou fábrica | `createAgentStateParser` (`src/server/integration/parsers.ts:77`) em `createIntegrationKit` (`src/server/integration/kit.ts:18`); `createPublishAgentState` (`src/server/reengagement/agent-state.ts:47`) e `createPrepareFrame` ligados em `src/kit/reengagement.ts:7-8`; nenhum `core` importa `phase.mjs` (lacuna 7); `scripts/__tests__/boundary-eslint.test.ts:22-26` recusa as duas grafias. Mutantes N8 e N9 (app entrega `null`): mortos | ✅ PASS (a exceção de 2026-11-10 saiu) |
| VERT-02 AC1–2 | `real-estate`, agendamento, `catalog`, segmentos, marca | `src/verticals/real-estate/__tests__/index.test.ts:15-23` | ✅ PASS |
| VERT-02 AC3 | app passa o vertical a toda peça que o exige | `src/kit/document-services.ts:9`, `:13`, `:17`; `src/kit/integration.ts:5-8`; `src/kit/reengagement.ts:7-8`. M25, M26, M26b, M29, N8 e N9 mortos; `agent-fields.test.ts:58-61` e `:86-89` e `qualification-facts.test.ts:89-96` provam a ligação pelo `src/kit/` | ✅ PASS |
| VERT-03 AC1 | vertical sem catálogo, agendamento e segmentos, outra marca | `src/vertical-kit/__tests__/fixture-vertical.test.ts:14` | ✅ PASS |
| VERT-03 AC2 | peças de lead, conversa, mensagem, documento, permissão e LGPD no banco | `fixture-vertical.integration.test.ts` (7 testes verdes na suíte); estado do agente sem faceta: `agent-fields.test.ts:50-56` e `:77-84` (só `[]` passa) | ✅ PASS |
| VERT-03 AC3 | `type` com a marca | `fixture-vertical.integration.test.ts:113-116` - `"urn:acme:problem:recurso-nao-encontrado"` | ✅ PASS |
| VERT-03 Independent Test | nenhum arquivo `vertical` da imobiliária no grafo | `fixture-vertical.integration.test.ts:125` (camada do mapa, `[]`); mutante F3 morto | ✅ PASS |
| QUAL-01 AC1–2 | 8 campos na faceta; núcleo trata como opaco | `src/verticals/real-estate/__tests__/qualification.test.ts:19-43`; `agent-fields.test.ts:32-37` (os 8 campos na ordem do `phase.mjs` e `nextFieldToAsk`); N4 (ordem trocada) e N5 (um campo a menos): mortos | ✅ PASS |
| QUAL-01 AC3 | colunas na lista de transição | `scripts/__tests__/boundary-schema.test.ts:35-46`; a lista gravada do `CHECK` em `:48-54` | ✅ PASS |
| QUAL-01 AC4 | PATCH valida e grava como em `bf5e646`; POST ignora | `src/server/integration/__tests__/qualification-contract.test.ts:8`, `:35`; `qualification-kit.test.ts:80-92` | ✅ PASS |
| QUAL-02 AC1 | consumidores leem do vertical | `src/server/reengagement/__tests__/qualification-facts.test.ts:52-64` (fatos da faceta e pendência `propertyType`), `:89-96`; `src/server/data/__tests__/qualification-readers.test.ts:37`. N6, N7 e N13 mortos | ✅ PASS |
| QUAL-02 AC2 | sem qualificação: 400 `payload-invalido`, `detail` `Campo '<campo>' inválido.`, citando o primeiro na ordem de `LEAD_QUALIFICATION_FIELDS`, depois das validações de `status`, `executiveSummary` e `escalationReason` | `src/server/integration/__tests__/qualification-kit.test.ts:50-64` - `detail: \`Campo '${field}' inválido.\``, com um campo por requisição | ❌ lacuna G1: o texto e o código 400 estão provados, mas a ordem entre campos e a precedência das validações do núcleo não têm asserção (Q1 e Q2 sobrevivem) |
| SEG-01 AC1 | símbolo `segment`, coluna `modality` | `src/server/integration/__tests__/document-segments.integration.test.ts:49`; `boundary-schema.test.ts:26` | ✅ PASS |
| SEG-01 AC2 | contexto filtrado como em `bf5e646` para a imobiliária | `src/server/integration/__tests__/document-context.integration.test.ts:75-150`; no processamento, `processing.integration.test.ts:100-121` (lacuna 1) | ✅ PASS |
| SEG-01 AC3 | sem segmentos: lista e entrega todos | `document-segments.integration.test.ts:59`, `:85` | ✅ PASS |
| AGENT-02 AC1 | `__INLINE` nas duas pastas; `--vertical` e `--out`, imobiliária e `n8n/generated/` como padrão | `scripts/__tests__/n8n-inline-vertical.test.ts:55`; `scripts/__tests__/n8n-inline-cli.test.ts:32-61` (`--out` sem `--vertical` gera a imobiliária). A pasta padrão `n8n/generated/` é provada pela função (`boundary-generated.test.ts:46`), não pela linha de comando sem `--out`, que regravaria o repositório | ✅ PASS |
| AGENT-02 AC2 | nome duplicado falha citando o nome | `n8n-inline-vertical.test.ts:94-98` | ✅ PASS |
| AGENT-02 AC3 | determinismo | `scripts/__tests__/n8n-inline.test.ts:168`, `:190` | ✅ PASS |

Os demais critérios (BOUND, KEEP, VOCAB, ENG, ACCESS, APPT, CAT, AGENT-01) não foram tocados pelas correções; a evidência de 2026-11-10 continua valendo, com a suíte, o tsc, o ESLint, o diff e o build repetidos abaixo. Os arquivos citados nela não mudaram em `e35ce43..a04e800`, salvo `index.test.ts`, `boundary-eslint.test.ts` e `boundary-schema.test.ts`, cujas linhas estão atualizadas acima. KEEP-03 AC2 continua sem prova independente (`db:push:test` não rodou, pelo motivo registrado em `tasks.md`).

**Edge cases**: `core.autocrlf` ✅ (a suíte regravou `principal.ts`, `scheduler.ts` e `smoke-reset.ts` de `n8n/generated/` só com fim de linha; `git diff` vazio; restaurados com `git checkout --`); suíte única (nenhum `vitest` ou `next` ativo antes de começar) ✅; nada publicado (`git branch -r --contains HEAD` vazio, nenhum push) ✅.

### Sensor de discriminação

Worktree descartável em `a04e800`, no scratchpad, com `node_modules` por junção. Testes sem banco rodaram com o diretório no worktree; testes de banco rodaram da raiz real com `--root` no worktree (branch base do banco de teste, que a suíte paralela não usa). O mutante F3 depende de caminhos relativos ao diretório atual (`source-graph.ts`), então rodou na árvore real depois da suíte, com cópia de `src/db/schema.ts` no scratchpad e restauração. Cada mutante foi aplicado com uma substituição de ocorrência única e revertido por `git checkout --` no worktree; a junção foi desfeita antes de `git worktree remove --force`. `git status --porcelain` do repositório real: vazio antes do primeiro mutante e depois do último.

| # | Arquivo | Mutação | Morto? |
| --- | --- | --- | --- |
| M26 | `src/kit/document-services.ts:9` | processamento da imobiliária com `facet: null` | ✅ (`processing.integration.test.ts`, 1 de 18) |
| M26b | `src/kit/document-services.ts:13` | reconciliação da admissão com `null` | ✅ (`repository.test.ts`, DOCLIM-01 AC12) |
| M1a | `src/vertical-kit/index.ts:90` | `defineVertical` não valida `brand.name`/`problemUrn`/`tenantHeader`/`alertTag` | ✅ (4 testes) |
| M1b | `src/vertical-kit/index.ts:95` | não valida `tenantNoun.singular`/`plural` | ✅ (2 testes) |
| M1c | `src/vertical-kit/index.ts:95` | `tenantNoun` aceita texto vazio | ✅ (2 testes) |
| N1 | `src/server/integration/parsers.ts:88` | sem faceta, o parser aceita `askedFields` não vazio | ✅ |
| N2 | `src/server/reengagement/agent-state.ts:30` | sem faceta, a publicação aceita `askedFields` não vazio | ✅ |
| N3 | `src/server/reengagement/context.ts:71` | sem faceta, o frame aceita estado gravado com campo perguntado | ✅ |
| N4 | `src/verticals/real-estate/qualification.ts:71` | `agentFields` com `region` e `propertyType` trocados | ✅ (`agent-fields`, `boundary-schema`) |
| N5 | `src/verticals/real-estate/qualification.ts:71` | `agentFields` sem `chainedOperation` | ✅ (4 testes) |
| N6 | `src/server/reengagement/context.ts:87` | `pendingField` ignora a faceta (`null`) | ✅ |
| N7 | `src/server/reengagement/context.ts:87` | `nextFieldToAsk` sem os campos confirmados | ✅ |
| N8 | `src/kit/reengagement.ts:8` | app entrega `null` à publicação do estado | ✅ |
| N9 | `src/server/integration/kit.ts:18` | kit entrega `null` ao parser do estado | ✅ |
| N10 | `src/vertical-kit/index.ts:119` | `defineVertical` não valida `agentFields` | ✅ |
| N11 | `src/vertical-kit/index.ts:114` | `defineVertical` não exige `nextFieldToAsk` | ✅ |
| N12 | `src/db/schema.ts:381` | lista gravada do `CHECK` em outra ordem | ✅ (foto do schema e lista da faceta) |
| N13 | `src/server/reengagement/context.ts:83` | `confirmed` vazio | ✅ |
| N14 | `scripts/n8n-inline.mjs:259` | `--out` ignorado | ✅ (2 testes) |
| N15 | `scripts/n8n-inline.mjs:260` | `--vertical` ignorado | ✅ (2 testes) |
| E1 | `eslint.config.mjs:39` | regra de import com uma entrada por glob, como antes da F1 | ✅ (caminhos relativos `../../../n8n/...` deixam de ser recusados) |
| F3 | `src/db/schema.ts:3` | import de `phase.mjs` devolvido ao schema | ✅ (`fixture-vertical.integration.test.ts`) |
| Q1 | `src/server/integration/parsers.ts:290` | sem faceta, cita o último campo presente em vez do primeiro de `LEAD_QUALIFICATION_FIELDS` | ❌ Sobreviveu (`qualification-kit`, `parsers`, `fixture-vertical`: 68 testes) |
| Q2 | `src/server/integration/parsers.ts:263` | sem faceta, recusa o campo de qualificação antes de validar `status`, `executiveSummary` e `escalationReason` | ❌ Sobreviveu (mesmos 68 testes) |

**Profundidade**: ampliada (24 mutantes: os 2 da primeira verificação refeitos, 1 irmão do M26, 2 variantes do M1, 15 para a F1, 2 para a F5, 1 para a F3 e 2 para a emenda da F6).
**Resultado do sensor**: 22 de 24 mortos; 2 sobreviventes (Q1 e Q2, a mesma lacuna) - FAIL.

### Gate

Rodados uma vez, em sequência, na árvore real em `a04e800`:

- **Suíte completa (`npm test`)**: 278 arquivos e 4.319 testes, 0 falha, 0 pulado, saída 0, em 1.218 s. Nenhuma outra suíte ativa (conferido antes). Delta sobre a base (250 arquivos e 4.041 testes): +28 arquivos e +278 testes. Fecha o gate da F8.
- **`npx tsc --noEmit -p .`**: 0 erros.
- **`npx eslint .`**: 0 erros e 9 avisos (linha de base).
- **`git diff --exit-code bf5e646 -- docs/integration/openapi.yaml n8n/generated/`**: saída 0 (depois de restaurar os 3 gerados regravados só com fim de linha).
- **`next build` contra o banco de teste** (`build-test-db.mjs` do scratchpad, `DATABASE_URL` trocada só no processo filho): host conferido antes (`ep-holy-rice-…/neondb`, diferente do padrão); `✓ Compiled successfully`, 29 de 29 páginas estáticas, saída 0.

### Qualidade de código das correções

| Princípio | Status |
| --- | --- |
| Código mínimo e mudanças cirúrgicas | ✅ (F1 em 21 arquivos, os demais commits só de teste ou docs) |
| Sem escopo extra | ✅ |
| Segue os padrões do projeto | ✅ (fábricas por faceta, como `createPrepareFrame`) |
| Checagem ancorada na spec | ❌ QUAL-02 AC2 (G1) |
| Testes mapeiam para AC | ✅ |
| Diretrizes documentadas (`CLAUDE.md`, `AGENTS.md`) | ✅ commits em pt-BR, Conventional Commits, 0 trailer de atribuição em `bf5e646..a04e800` |

**Observações sem efeito no veredito**:

1. `eslint.config.mjs:33-39` percorre as pastas com caminhos relativos ao diretório atual (`existsSync`, `readdirSync`). Rodado de outra pasta, o ESLint carregaria a configuração sem as regras de fronteira das globs `/**`, sem aviso. Com `npx eslint .` na raiz funciona, e o `boundary-eslint.test.ts` roda na raiz.
2. A entrada `check:lead_agent_state_asked_fields` não é conferida pelo detector genérico de exceção órfã de `scripts/boundary/check.ts` (que trata `market:` e `import:`); quem a prende é `boundary-schema.test.ts:48-54`, como já acontece com as entradas `column:` e `enum:`.
3. `src/vertical-kit/__tests__/fixture-vertical.test.ts:31` ainda filtra o grafo pela pasta `src/verticals/real-estate/`; o grafo dele é pequeno e o `checkImports` da linha `:33` cobre o resto, mas o filtro pela camada, como no teste de integração, seria mais fiel.
4. O limite de 8 em `askedFields` (`parsers.ts:88`, `agent-state.ts:30`) continua fixo no núcleo, e não vem de `agentFields.length`. Não há AC sobre isso; vale olhar no L18c.

### Lacunas que viram tasks de correção (ordem de gravidade)

1. **G1, QUAL-02 AC2 sem asserção da ordem (Minor, bloqueante pelo método)**: a emenda da F6 (`spec.md:266`) define que, sem qualificação, o `detail` cita o primeiro campo na ordem de `LEAD_QUALIFICATION_FIELDS` e só depois das validações de `status`, `executiveSummary` e `escalationReason`. O código faz isso (`src/server/integration/parsers.ts:289-292`, depois de `:265-287`), mas `src/server/integration/__tests__/qualification-kit.test.ts:50-64` manda um campo por requisição. Q1 e Q2 sobrevivem. Correção: em `qualification-kit.test.ts`, (a) um PATCH com dois campos fora da ordem do objeto (por exemplo `{ chainedOperation: true, region: "Centro" }`), afirmando `Campo 'region' inválido.`; (b) um PATCH com `status` inválido e um campo de qualificação, afirmando o `detail` de `status` (`Campo 'status' inválido. Valores aceitos: ...`); (c) o mesmo com `executiveSummary: 7`, afirmando `Campo 'executiveSummary' deve ser uma string.`. Verificar com Q1 e Q2.
2. **Numeração da CAT-02 (Cosmético)**: a emenda em `spec.md:313` ficou entre o AC1 e o AC2 da CAT-02; mover o bloco para depois do AC2.
3. **KEEP-03 AC2 (Minor, herdada)**: `db:push:test` segue sem prova independente; fica com o registro do executor.

### Rastreabilidade

Nenhum requisito muda de status: com o veredito FAIL, todos ficam em `Implementing` até a correção G1 e uma nova verificação, que pode se limitar a Q1, Q2 e ao gate curto dos arquivos tocados, mais a suíte completa.

---

### Primeira verificação (2026-11-10), em resumo

Veredito FAIL, sobre `bf5e646..e35ce43` (66 commits, 472 arquivos): 30 mutantes, 28 mortos; sobreviveram M26 (faceta de segmentos no processamento, Major) e M1 (validação da marca, Minor). A VERT-03 afirmava um grafo sem o vertical imobiliário que alcançava `n8n/verticals/real-estate/src/phase.mjs` (Major). Suíte com 276 arquivos e 4.291 testes, tsc 0, ESLint 0 e 9, diff 0 e build com 29 páginas. As 8 lacunas viraram as correções F1 a F7 de `tasks.md`, e a falha de Havana da F8 virou a F9. O relatório completo está no histórico do git (`150ed22`).
