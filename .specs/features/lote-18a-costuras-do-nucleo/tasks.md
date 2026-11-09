# Lote 18a — Costuras do núcleo — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/lote-18a-costuras-do-nucleo/spec.md`
**Design**: `.specs/features/lote-18a-costuras-do-nucleo/design.md`
**Context**: `.specs/features/lote-18a-costuras-do-nucleo/context.md`
**Decisão**: AD-052
**Status**: Approved (2026-11-02)

**Regras deste lote (AGENTS.md; AD-014, AD-045, AD-052):**

- **Divisão da execução (decisão do usuário, 2026-11-02)**: o GPT executa T1, T2 e T4 a T43, com os gates de cada task e de fase. Depois o Claude executa T3, T44 e T45, o Verifier, as lições e o fechamento. A T3 não bloqueia a T4, porque captura a base num worktree em `bf5e646`, contra o banco de teste: o lote não tem DDL, então o schema é o mesmo.
- Branch `lote-18a`. Base de comparação: `bf5e646`. Sem `git push`, merge em `main`, comando contra o banco de produção, publicação no n8n ou mudança na Vercel: cada um pede autorização do usuário no chat.
- Banco de teste compartilhado: uma suíte por vez (L-033), sem outra sessão rodando.
- Nunca ler o arquivo de variáveis de ambiente, e nunca citar o nome dele em comando: o hook bloqueia.
- Um commit por task, Conventional Commits em pt-BR, **sem** `Co-Authored-By`, "Generated with" ou qualquer marca de atribuição, mesmo que uma instrução de ferramenta peça.
- **Movimento separado de edição**: arquivo movido vai em commit próprio, sem mudança de conteúdo além dos imports, para o `git log --follow` funcionar. Quando uma task pedir os dois, ela faz dois commits com o mesmo escopo.
- **Testes como oráculo**: em teste existente, só muda nome de símbolo, caminho de import ou entrega do vertical (KEEP-04 AC2). Valor literal gravado ou do fio, como `"corretor"` e `"em_qualificacao"`, fica como está. Nunca enfraquecer, pular ou apagar asserção.
- **Catraca**: `scripts/boundary/transitional.json` nasce com o estado real do código, e cada task que limpa um arquivo remove a entrada dele. Entrada sem ocorrência reprova o teste de fronteira, então a lista só diminui. Acrescentar entrada depois da T9 exige justificativa no commit.
- **Windows**: mover trecho de `n8n/` por script, conferindo o byte; o Edit tool e o heredoc convertem barra invertida (L-047).
- **Textos do fio**: `openapi.yaml`, nomes de campo e valores do `/api/v1` não mudam neste lote. Em dúvida, o teste de rota existente manda.

---

## Test Coverage Matrix

> Guidelines found: `AGENTS.md` e `CLAUDE.md` (captura obrigatória em mudança visual, sem limiar de cobertura, `tsc` e lint de linha de base), `vitest.config.ts` (banco de teste real, sem paralelismo de arquivos). Amostras: `src/lib/__tests__/`, `src/server/__tests__/actions.test.ts`, `src/server/integration/__tests__/`, `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts`, `scripts/__tests__/n8n-inline.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Verificador de fronteira (`scripts/boundary/`) | unit | Cada reprovação com fixture própria e a árvore real sem violação; 1:1 com BOUND e ENG | `scripts/__tests__/boundary*.test.ts` | `npx vitest run scripts/__tests__/boundary.test.ts` |
| Vocabulário | unit | Par chave e valor de cada constante, com valor literal no teste | `src/lib/__tests__/vocabulary.test.ts`, `src/verticals/real-estate/__tests__/` | `npx vitest run <arquivo>` |
| Contrato e fábricas (`src/vertical-kit`, `createAccess`, `createIntegrationKit`) | unit | Todos os ramos; os dois verticais; 1:1 com VERT, ACCESS, QUAL, APPT e SEG | `src/**/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| Schema | integration | Foto igual à base; `db:push:test` sem pendência | `scripts/__tests__/boundary-schema.test.ts` | `npm run db:push:test` |
| DAL e `/api/v1` | integration | Testes existentes intactos; casos novos para vertical sem recurso e para ordem de validação | `src/server/**/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| Inliner | unit | Cada marca e cada erro; determinismo; sincronismo com o disco | `scripts/__tests__/n8n-inline.test.ts` | `npx vitest run scripts/__tests__/n8n-inline.test.ts` |
| Workflows gerados | unit | Testes existentes contra `n8n/generated/`; vertical de teste por `toJSON()` | `n8n/workflows/__tests__/*.test.ts` | `npx vitest run n8n/workflows/__tests__` |
| Componentes e páginas | none (build) + captura real | Sem mudança visual, provada por captura na base e no fim | - | `npx tsc --noEmit -p .` |
| Renomeação de símbolo sem lógica nova | none além dos testes existentes | Suíte existente e checagens de fronteira | - | gate Full no fim da fase |
| Docs e registro | none | Registro no commit | - | - |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Task com testes próprios | `npx vitest run <arquivos da task>` |
| Boundary | Toda task que toca código | `npx vitest run scripts/__tests__/boundary.test.ts` |
| Build | Toda task de código, antes do commit | `npx tsc --noEmit -p .` (sem aumentar a contagem de `bf5e646`) + `npx eslint .` (0 erros, no máximo 9 avisos) |
| Schema | Task que muda `src/db/schema.ts` ou o schema do vertical | `npm run db:push:test` sem mudança pendente |
| Agent | Task que toca `n8n/` | `node scripts/n8n-inline.mjs` seguido de `git diff --exit-code bf5e646 -- n8n/generated/` |
| Full | Fim das fases 2, 4, 5, 6, 7 e 8 | `npm test` (sem outra suíte rodando), com pelo menos 250 arquivos e 4041 testes |

---

## Execution Plan

Phases run in order, and tasks run in order within each phase.

### Phase 0: Referências da base

Fotos tiradas antes de qualquer mudança.

```
T1 → T2 → T3
```

### Phase 1: Verificador de fronteira

```
T3 → T4 → T5 → T6 → T7 → T8 → T9
```

### Phase 2: Vocabulário

```
T9 → T10 → T11 → T12 → T13 → T14 → T15
```

### Phase 3: Contrato do vertical

```
T15 → T16 → T17 → T18
```

### Phase 4: Permissões e kit de integração

```
T18 → T19 → T20 → T21 → T22 → T23
```

### Phase 5: Vertical sai do núcleo

```
T23 → T24 → T25 → T26 → T27 → T28 → T29 → T30 → T31
```

### Phase 6: Agendamento e identificadores

```
T31 → T32 → T33 → T34 → T35
```

### Phase 7: Agente genérico

```
T35 → T36 → T37 → T38 → T39 → T40 → T41
```

### Phase 8: Provas e fechamento

```
T41 → T42 → T43 → T44 → T45
```

---

## Task Breakdown

### T1: Foto do schema da base

**What**: Criar a foto normalizada do schema e guardar a de `bf5e646`, com teste que compara o estado atual.
**Where**: `scripts/boundary/schema-snapshot.ts`
**Depends on**: None
**Reuses**: `generateDrizzleJson` de `drizzle-kit/api`
**Requirement**: KEEP-03

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] A primeira coisa da task é confirmar que `generateDrizzleJson` roda sem banco e sem variável de ambiente. Se não servir, usar `drizzle-kit export` com linhas ordenadas e registrar a troca no commit.
- [x] `scripts/boundary/schema-baseline.json` gerado sem nenhuma mudança em `src/db/schema.ts`.
- [x] Teste falha quando uma coluna, índice, check ou valor de enum muda: um caso por tipo, sobre fixture.
- [x] Teste passa sobre a árvore real.

**Execução**: `generateDrizzleJson` sem banco: 27 tabelas e 19 enums; schema sem diferença de `bf5e646`. Quick: 1 arquivo, 5 testes, 0 falhas. TypeScript: 0 erros. ESLint: 0 erros, 9 avisos. Boundary ainda não existe (T4).

| Critério / KEEP-03 | Evidência | Resultado esperado |
| --- | --- | --- |
| Foto da árvore real | `scripts/__tests__/boundary-schema.test.ts:23`, `expect(snapshotSchema(schema)).toEqual(baseline)` | Igualdade com a base |
| Coluna, índice, check e enum | `scripts/__tests__/boundary-schema.test.ts:27`, `expect(snapshotSchema(fixture(change))).not.toEqual(snapshotSchema(fixture()))` | Diferença para cada uma das quatro fixtures |

| Asserção | Origem | Necessária |
| --- | --- | --- |
| `boundary-schema.test.ts:23`, igualdade com baseline | KEEP-03 AC1 | Sim |
| `boundary-schema.test.ts:27`, quatro diferenças | T1, detecção por tipo | Sim |

**Adequação**: critérios cobertos, sem alteração de teste existente; fixtures derivadas da T1, conforme AGENTS.md.

**Tests**: unit
**Gate**: quick
**Commit**: `test(nucleo): fotografar o schema da base do lote 18a`

---

### T2: Hashes de `n8n/generated/`

**What**: Guardar os hashes dos 9 arquivos gerados em `bf5e646` e testar que regenerar em pasta temporária produz os mesmos bytes.
**Where**: `scripts/__tests__/boundary-generated.test.ts`
**Depends on**: T1
**Reuses**: `generateAll` de `scripts/n8n-inline.mjs`
**Requirement**: KEEP-02

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] `scripts/boundary/generated-hashes.json` com os 9 arquivos, com CRLF normalizado como o inliner faz.
- [x] O teste regenera em pasta temporária e compara com os hashes, citando o arquivo e a primeira linha diferente quando falha.
- [x] O teste também compara o disco: `n8n/generated/` editado à mão falha.
- [x] Injetar uma mudança em `n8n/src/gate.mjs` faz o teste falhar; reverter a injeção.

**Execução**: hashes derivados de `git show bf5e646`, sem alteração do gerado. Quick: 1 arquivo, 4 testes, 0 falhas. TypeScript: 0 erros. ESLint: 0 erros, 9 avisos. Boundary ainda não existe (T4). Injeções feitas em cópias temporárias de `gate.mjs` e do gerado, descartadas pelo teste; a árvore real fica intacta.

| Critério / KEEP-02 | Evidência em `scripts/__tests__/boundary-generated.test.ts` | Resultado esperado |
| --- | --- | --- |
| Nove arquivos e hashes | `:49`, `expect(generated).toHaveLength(9)`; `:50`, `expect(checkGenerated(directory)).toEqual([])` | 9 arquivos idênticos à base |
| Disco atual | `:54`, `expect(checkGenerated(DEFAULT_GENERATED_DIR)).toEqual([])` | Sem diferença |
| Edição manual | `:62`, `expect(checkGenerated(directory)).toEqual(["erros.ts:1: primeira linha diferente da base"])` | Nome e linha 1 |
| Mudança na fonte | `:72`, `expect(checkGenerated(directory)).toContainEqual(expect.stringMatching(/^principal\.ts:\d+: primeira linha diferente da base$/))` | Diferença em principal |

| Asserções | Origem | Necessárias |
| --- | --- | --- |
| `boundary-generated.test.ts:49`, `:50`, `:54` | KEEP-02 AC1/AC3 e T2 | Sim |
| `boundary-generated.test.ts:62`, `:72` | KEEP-02 AC2 e injeções exigidas pela T2 | Sim |

**Adequação**: critérios cobertos; nenhum teste existente alterado, conforme AGENTS.md.

**Tests**: unit
**Gate**: quick
**Commit**: `test(n8n): guardar os hashes dos workflows gerados na base`

---

### T3: Capturas da base

**What**: Capturar as 8 páginas em `bf5e646` nas visões de administrador e corretor.
**Where**: `.specs/features/lote-18a-costuras-do-nucleo/evidence/base/`
**Depends on**: T2
**Reuses**: `npm run preview:test`, `scripts/preview-test-users.ts`
**Requirement**: KEEP-05

**Tools**: MCP: `claude-in-chrome`. Skill: NONE.

**Done when**:

- [ ] `npm run preview:test` no ar e fixture de dados repovoada, sem outra sessão de captura.
- [ ] PNG de Dashboard, Pipeline, Chats, Documentos, Imóveis, Configurações, Usuários e Login em largura desktop, com o administrador.
- [ ] PNG das mesmas páginas logadas com o corretor, inclusive o menu lateral dele.
- [ ] O commit lista os logins por papel, sem senha, e a base usada.

**Tests**: none
**Gate**: quick
**Commit**: `docs(specs): registrar as capturas da base do lote 18a`

---

### T4: Mapa de fronteira e classificação

**What**: Criar `map.json` com as regras do `design.md` § 1 e `checkClassification`, com a primeira versão do teste.
**Where**: `scripts/boundary/check.ts`
**Depends on**: T3
**Reuses**: Classificação inicial do design
**Requirement**: BOUND-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] `scripts/boundary/map.json` classifica todos os arquivos não teste de `src/`, `app/`, `n8n/`, `scripts/`, `workflows/` e `proxy.ts`.
- [x] Todo arquivo `core` tem `package`.
- [x] Arquivo não classificado e regra órfã reprovam, citando o caminho, com um caso de fixture cada.
- [x] Arquivos de teste seguem o arquivo testado, com um caso provando isso.

**Execução**: Quick/Boundary: 1 arquivo, 5 testes, 0 falhas. TypeScript: 0 erros. ESLint: 0 erros, 9 avisos. T3 dispensada como dependência pelo prompt. Regras de pastas futuras entram quando existirem, para não criar regra órfã.

| Critério | Evidência em `scripts/__tests__/boundary.test.ts` | Resultado esperado |
| --- | --- | --- |
| Árvore e pacotes | `:22`, `expect(checkClassification(repositoryFiles(), rules)).toEqual([])` | Sem violação |
| Arquivo desconhecido | `:26`, `expect(checkClassification(["src/new.ts"], [])).toEqual(...)` | Caminho e mensagem de falta de classificação |
| Regra órfã | `:32`, `expect(checkClassification([], [{ glob: "src/missing.ts", layer: "app" }])).toEqual(...)` | Caminho e mensagem de regra órfã |
| Pacote obrigatório | `:38`, `expect(checkClassification(["src/core.ts"], [{ glob: "src/core.ts", layer: "core" }])).toEqual(...)` | Caminho e mensagem de falta de pacote |
| Herança do teste | `:48`, `expect(classifyFile("src/lib/__tests__/sample.test.ts", fixture)).toEqual(fixture[0])`; `:49`, igualdade com `[]` | Camada do módulo testado |

| Asserções | Origem | Necessárias |
| --- | --- | --- |
| `boundary.test.ts:22`, `:26`, `:32`, `:38`, `:48`, `:49` | BOUND-01 AC1–4 e T4 | Sim |

**Adequação**: critérios cobertos com fixtures independentes; testes existentes intactos, conforme AGENTS.md.

**Tests**: unit
**Gate**: quick
**Commit**: `feat(nucleo): classificar os arquivos em núcleo, vertical e app`

---

### T5: Direção dos imports

**What**: Implementar `checkImports` com AST e resolução de `@/` e caminho relativo, e criar `transitional.json` com as violações atuais.
**Where**: `scripts/boundary/check.ts` (modify)
**Depends on**: T4
**Reuses**: `typescript`
**Requirement**: BOUND-02, BOUND-04

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Cada direção proibida da BOUND-02 reprova em fixture própria, citando os dois caminhos: núcleo para vertical, núcleo para app, vertical para app e `@core/client` para `server-only` ou `@core/server`.
- [x] Import dinâmico e `export from` são checados.
- [x] Violações atuais entram em `transitional.json` com `path`, `term`, `reason` e `removedIn`.
- [x] Entrada sem ocorrência reprova (BOUND-04 AC3).

**Execução**: Quick/Boundary: 1 arquivo, 14 testes, 0 falhas. TypeScript: 0 erros. ESLint: 0 erros, 9 avisos. Quatro dependências preexistentes registradas, para remoção nas costuras do L18a. Checagem aplica-se aos módulos não teste, conforme o escopo de classificação de BOUND-01.

| Critério | Evidência em `scripts/__tests__/boundary.test.ts` | Resultado esperado |
| --- | --- | --- |
| Cinco direções proibidas | `:78`, `expect(checkImports(...)).toEqual([{ file, line: 2, message: ... }])` | Os dois caminhos e a linha 2, em cada fixture |
| Import dinâmico e reexportação | `:84`, `expect(checkImports(...)).toEqual([{ file: "src/core/sample.ts", line: 1, message: ... }])` | Recusa com os dois caminhos |
| Exceções atuais | `:68`, `expect(checkImports(repositorySources(), rules, transitional)).toEqual([])` | Sem violação |
| Exceção usada e órfã | `:91`, igualdade com `[]`; `:92`, igualdade com a violação `Exceção sem ocorrência` | Só a ocorrência registrada é permitida |

| Asserções | Origem | Necessárias |
| --- | --- | --- |
| `boundary.test.ts:68`, `:78`, `:84` | BOUND-02 AC2–4 e T5 | Sim |
| `boundary.test.ts:91`, `:92` | BOUND-04 AC1/AC3 | Sim |

**Adequação**: critérios cobertos com fixtures por direção e forma de import; testes anteriores preservados, conforme AGENTS.md.

**Tests**: unit
**Gate**: quick
**Commit**: `feat(nucleo): reprovar import fora da direção da fronteira`

---

### T6: Regra de ESLint

**What**: Gerar blocos `no-restricted-imports` a partir de `map.json`.
**Where**: `eslint.config.mjs` (modify)
**Depends on**: T5
**Reuses**: `scripts/boundary/map.json`
**Requirement**: BOUND-02

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Import proibido em arquivo `core` dá erro de `no-restricted-imports`, provado por teste que chama a API do ESLint sobre texto de fixture.
- [x] As exceções de `transitional.json` valem também aqui.
- [x] `npx eslint .` termina com 0 erros e no máximo 9 avisos.

**Execução**: Quick + Boundary: 2 arquivos, 21 testes, 0 falhas. TypeScript: 0 erros. ESLint: 0 erros, 9 avisos. Primeira rodada de lint: 4 erros falsos em `app/api/v1/properties/route.ts` (`no-restricted-imports`), por aceitar `..` depois da raiz de destino num padrão relativo. Corrigido o padrão; segunda rodada verde, com fixture para o caminho válido. Nenhuma exceção acrescentada.

| Critério | Evidência em `scripts/__tests__/boundary-eslint.test.ts` | Resultado esperado |
| --- | --- | --- |
| Import proibido | `:15`, `expect(await violations(...)).toEqual([{ ruleId: "no-restricted-imports", severity: 2 }])` | Erro do ESLint para alias e relativo |
| Exceção restrita ao alvo | `:21`, igualdade com `[]`; `:25`, igualdade com erro de severidade 2 | Exceção permite só o alvo registrado |
| Direção válida | `:31`, `expect(await violations("app/api/v1/properties/route.ts", "import '../../../../src/server/integration/problem';")).toEqual([])` | Vertical pode importar core |

| Asserções | Origem | Necessárias |
| --- | --- | --- |
| `boundary-eslint.test.ts:15`, `:21`, `:25`, `:31` | BOUND-02 AC1, exceções da T6 e direção do design §1 | Sim |

**Adequação**: fixtures usam a API real do ESLint; casos de permissão e recusa cobertos, conforme AGENTS.md.

**Tests**: unit
**Gate**: quick
**Commit**: `feat(nucleo): impedir no ESLint import fora da fronteira`

---

### T7: Termos de mercado

**What**: Implementar `checkMarketTerms` sobre identificadores e literais, sem comentários.
**Where**: `scripts/boundary/check.ts` (modify)
**Depends on**: T6
**Reuses**: `transitional.json`
**Requirement**: BOUND-03, BOUND-04

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Cada termo da BOUND-03 reprova em qualquer caixa, com arquivo e linha, inclusive em template `sql`.
- [x] Termo em comentário passa, com caso de fixture.
- [x] Ocorrências atuais em arquivos `core` entram em `transitional.json` e o teste passa na árvore real.

**Execução**: Quick/Boundary: 1 arquivo, 31 testes, 0 falhas. TypeScript: 0 erros. ESLint: 0 erros, 9 avisos. Lista com 154 entradas (4 imports e 150 pares arquivo/termo). Dicionário em JSON separado do código verificado. Arquivos de dados não são analisados como TypeScript; identificadores e literais de código são lidos pelo AST.

| Critério | Evidência em `scripts/__tests__/boundary.test.ts` | Resultado esperado |
| --- | --- | --- |
| Treze termos, identificador/literal | `:107`, `expect(checkMarketTerms(...)).toEqual([{ file: "src/core/sample.ts", line: 2, message: ... }])` | Recusa com arquivo, linha e termo canônico |
| Template SQL interpolado | `:114`, igualdade com a violação de `property` na linha 2 | Localização do termo |
| Comentários | `:120`, `expect(checkMarketTerms(...)).toEqual([])` | Sem violação |
| Árvore real | `:102`, `expect(checkMarketTerms(repositorySources(), rules, transitional)).toEqual([])` | Exceções correspondem às ocorrências reais |
| Catraca | `:125`, igualdade com `[]`; `:126`, igualdade com `Exceção sem ocorrência` | Exceção deixa de valer quando o termo some |

| Asserções | Origem | Necessárias |
| --- | --- | --- |
| `boundary.test.ts:102`, `:107`, `:114`, `:120` | BOUND-03 AC1/AC2 e T7 | Sim |
| `boundary.test.ts:125`, `:126` | BOUND-04 AC3 | Sim |

**Adequação**: um caso por termo, com identificador/literal, SQL e comentários; testes da base intactos, conforme AGENTS.md.

**Tests**: unit
**Gate**: quick
**Commit**: `feat(nucleo): reprovar termo de mercado no código do núcleo`

---

### T8: Valores gravados como literal

**What**: Implementar `checkStoredValues` sobre os valores em português da VOCAB-01, fora de `n8n/`, dos módulos de vocabulário e do texto de tela.
**Where**: `scripts/boundary/check.ts` (modify)
**Depends on**: T7
**Reuses**: `transitional.json`
**Requirement**: VOCAB-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Literal igual a um valor reprova em `.ts` e `.tsx`, inclusive como chave de objeto e dentro de `sql`.
- [x] Texto JSX e texto maior que contém a palavra (`"Corretor responsável"`) passam, com caso de fixture.
- [x] O literal `"lead"`, igual nos dois vocabulários, fica fora.
- [x] Ocorrências atuais entram em `transitional.json`.

**Execução**: Quick/Boundary: 1 arquivo, 48 testes, 0 falhas. TypeScript: 0 erros. ESLint: 0 erros, 9 avisos. Lista com 605 entradas, das quais 451 de literal. Primeira rodada: 1 falha por `property` no nome de uma API do TypeScript usada no próprio verificador; substituída pelo reconhecimento genérico do nó nomeado dentro do objeto, sem exceção nova. Segunda rodada verde.

| Critério | Evidência em `scripts/__tests__/boundary.test.ts` | Resultado esperado |
| --- | --- | --- |
| Literais TS/TSX, chaves e SQL | `:144`, `expect(checkStoredValues(...)).toEqual([{ file, line: ..., message: ... }])` | Recusa do valor exato, com arquivo e linha |
| Texto de tela e valores sem troca | `:158`, `expect(checkStoredValues(...)).toEqual([])` | JSX, rótulo maior, `lead`, `fgts` e `editorial` preservados |
| Módulos de vocabulário e n8n | `:162`, igualdade com `[]` | Exceções de escopo da VOCAB-01 |
| Ocorrências atuais e catraca | `:134`, árvore real igual a `[]`; `:167`, ocorrência igual a `[]`; `:168`, violação de exceção órfã | Lista corresponde ao código |

| Asserções | Origem | Necessárias |
| --- | --- | --- |
| `boundary.test.ts:134`, `:144`, `:158`, `:162` | VOCAB-01 AC4 e T8 | Sim |
| `boundary.test.ts:167`, `:168` | BOUND-04 AC3 | Sim |

**Adequação**: critérios cobertos, inclusive chaves sem aspas e SQL interpolado; asserções de valor da base intactas, conforme AGENTS.md.

**Tests**: unit
**Gate**: quick
**Commit**: `feat(nucleo): reprovar valor gravado escrito como literal`

---

### T9: Identificadores em português

**What**: Implementar `checkIdentifiers` e a lista `portuguese-terms.json`.
**Where**: `scripts/boundary/check.ts` (modify)
**Depends on**: T8
**Reuses**: Levantamento do `design.md` § 12
**Requirement**: ENG-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] camelCase, PascalCase e snake_case são quebrados em palavras, com caso de fixture para cada um.
- [x] Palavras que também são inglês (`normal`, `conversation`) não reprovam, com caso de fixture.
- [x] Comentário, texto JSX e texto literal passam.
- [x] Nome de arquivo e de pasta em português fora de `app/` reprova.
- [x] Ocorrências atuais entram em `transitional.json`.

**Execução**: Quick/Boundary: 1 arquivo, 59 testes, 0 falhas. TypeScript: 0 erros. ESLint: 0 erros, 9 avisos. Lista inicial fechada em 771 entradas: 4 imports, 150 termos de mercado, 451 valores literais e 166 identificadores/caminhos. Daqui em diante, qualquer entrada nova exige justificativa no commit. Não houve execução de suíte completa nesta fase; a próxima está na T15.

| Critério | Evidência em `scripts/__tests__/boundary.test.ts` | Resultado esperado |
| --- | --- | --- |
| Três convenções de nome | `:180`, `expect(checkIdentifiers(...)).toEqual([{ file: "src/sample.ts", line: 2, message: ... }])` | Detecta `buscar` nas três formas |
| Palavras também inglesas | `:186`, igualdade com `[]` | `normal` e `conversation` permitidos |
| Comentário, JSX e literal | `:190`, igualdade com `[]` | Texto ignorado |
| Arquivo e pasta | `:194`, igualdade com a violação de `usuarios` na linha 1 | Caminho reprovado |
| Rotas e n8n | `:200`, igualdade com `[]`; `:201`, violação do símbolo `buscar` na página | Só os símbolos da página são checados |
| Árvore e catraca | `:176`, árvore igual a `[]`; `:208`, ocorrência igual a `[]`; `:209`, exceção órfã | Lista corresponde às ocorrências |

| Asserções | Origem | Necessárias |
| --- | --- | --- |
| `boundary.test.ts:176`, `:180`, `:186`, `:190`, `:194`, `:200`, `:201` | ENG-01 AC1–4 e T9 | Sim |
| `boundary.test.ts:208`, `:209` | BOUND-04 AC3 | Sim |

**Adequação**: critérios cobertos por convenção, caminhos e escopos; testes da base intactos, conforme AGENTS.md.

**Tests**: unit
**Gate**: quick
**Commit**: `feat(nucleo): reprovar identificador em português`

---

### T10: Vocabulário do núcleo

**What**: Criar as constantes de status, papel, fase, `sender`, `status_actor`, saúde da integração, `document_status`, `human_send_state` e código de problema.
**Where**: `src/lib/vocabulary.ts`
**Depends on**: T9
**Reuses**: `design.md` § 2, `src/server/integration/problem.ts:20`
**Requirement**: VOCAB-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Teste afirma com valor literal cada par chave e valor de cada constante.
- [x] Teste compara cada conjunto com `pgEnum.enumValues` do schema e `PROBLEM_CODE` com `ProblemCode`.
- [x] Chaves de `PROBLEM_CODE` em inglês para todos os códigos existentes.
- [x] Tipos `LeadStatus`, `Role` e `AgentPhase` derivados das constantes.

**Execução**: Quick + Boundary: 2 arquivos, 77 testes, 0 falhas (18 de vocabulário). TypeScript: 0 erros. ESLint: 0 erros, 9 avisos. Papel não tem enum PostgreSQL: comparação com `ROLES` existente; saúde usa `enumValues` da coluna textual. Primeira rodada: o import de `TITLES` carregou a instrumentação e foi barrado pela proteção `TEST_DATABASE_URL não definida`; isolada a instrumentação da rota com mock, sem carregar ambiente nem conexão. Segunda rodada verde. Única entrada nova: `src/lib/vocabulary.ts`, `market:corretor`, valor persistido obrigatório até o L18c; justificativa no commit.

| Critério | Evidência em `src/lib/__tests__/vocabulary.test.ts` | Resultado esperado |
| --- | --- | --- |
| Cada chave e valor, inclusive códigos | `:39`, `expect(actual).toEqual(expected)` | Nove objetos literais do vocabulário atual |
| Conjuntos e ordem | `:48`, `expect(Object.values(actual)).toEqual(values)` | Igualdade com enums/coluna e papéis atuais |
| Códigos e tipos | `:52`, `expect(Object.values(PROBLEM_CODE)).toEqual(Object.keys(TITLES))`; `:53–56`, `expectTypeOf(...).toEqualTypeOf(...)` | Catálogo completo e tipos derivados |

| Asserções | Origem | Necessárias |
| --- | --- | --- |
| `vocabulary.test.ts:39`, `:48`, `:52–56` | VOCAB-01 AC1/AC3/AC5 e T10 | Sim |

**Adequação**: pares esperados literais, comparação com fontes atuais e verificação de tipos pelo TypeScript; testes da base intactos, conforme AGENTS.md.

**Tests**: unit
**Gate**: quick
**Commit**: `feat(nucleo): criar o vocabulário em inglês do núcleo`

---

### T11: Vocabulário da imobiliária

**What**: Criar as constantes de `modality`, `property_type`, `property_kind`, `property_status`, `motivation`, `credit_status` e `storefront_layout`.
**Where**: `src/verticals/real-estate/vocabulary.ts`
**Depends on**: T10
**Reuses**: `context.md` § Termos em inglês
**Requirement**: VOCAB-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Teste afirma com valor literal cada par chave e valor.
- [x] Teste compara cada conjunto com o `enumValues` do schema.

**Execução**: Quick + Boundary: 2 arquivos, 73 testes, 0 falhas (14 do domínio). TypeScript: 0 erros. ESLint: 0 erros, 9 avisos. Nova regra `src/verticals/**` acompanha os primeiros arquivos reais. Entrada nova de identificador para a pasta `imobiliaria` prescrita pela T11; temporária até a T34, com justificativa no commit, sem trocar o id do vertical.

| Critério | Evidência em `src/verticals/real-estate/__tests__/vocabulary.test.ts` | Resultado esperado |
| --- | --- | --- |
| Cada chave e valor | `:17`, `expect(actual).toEqual(expected)` | Sete objetos literais com os valores atuais |
| Conjuntos do schema | `:26`, `expect(Object.values(actual)).toEqual(values)` | Valores e ordem dos sete enums preservados |

| Asserções | Origem | Necessárias |
| --- | --- | --- |
| `vocabulary.test.ts:17`, `:26` | VOCAB-01 AC2/AC3 e T11 | Sim |

**Adequação**: pares literais e paridade com o schema; testes da base intactos, conforme AGENTS.md.

**Tests**: unit
**Gate**: quick
**Commit**: `feat(imobiliaria): criar o vocabulário em inglês do domínio`

---

### T12: Enums leem o vocabulário

**What**: Fazer os `pgEnum` do núcleo usarem as constantes, sem mudar valor nem ordem.
**Where**: `src/db/schema.ts` (modify)
**Depends on**: T11
**Reuses**: `src/lib/vocabulary.ts`
**Requirement**: VOCAB-01, KEEP-03

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Foto do schema igual à base (teste da T1).
- [x] `npm run db:push:test` sem mudança pendente.
- [x] Enums do vertical continuam literais aqui até a T24, e constam em `transitional.json`.

**Tests**: integration
**Gate**: full
**Commit**: `refactor(nucleo): ler os valores dos enums do vocabulário`

---

### T13: Literais do servidor

**What**: Trocar literais de vocabulário por constantes em `src/server/`, `src/lib/` e `workflows/`, inclusive `HAS_BROKER_ROLE` e `HAS_ADMIN_ROLE`.
**Where**: `src/server/`
**Depends on**: T12
**Reuses**: `src/lib/vocabulary.ts`
**Requirement**: VOCAB-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Teste de banco confirma que os dois predicados de papel geram o mesmo SQL e casam com vínculo de vários papéis (`"gestor,corretor"`).
- [x] Entradas de `checkStoredValues` desses arquivos saem de `transitional.json`, fora os valores de domínio que dependem das T26 a T31.
- [x] `src/server/data/index.ts`, `reengagement/`, `documents/` e `integration/` passam nos testes existentes sem mudar valor esperado.

**Tests**: integration
**Gate**: quick
**Commit**: `refactor(nucleo): trocar por constantes os literais do servidor`

---

### T14: Literais de telas e actions

**What**: Trocar literais por constantes em `src/components/`, `app/` e `src/server/actions/`, com chave computada nos `Record`.
**Where**: `src/components/`
**Depends on**: T13
**Reuses**: `src/lib/vocabulary.ts`, `src/verticals/real-estate/vocabulary.ts`
**Requirement**: VOCAB-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] `Record<LeadStatus, string>` e semelhantes continuam tipados: tirar uma chave quebra a compilação (L-029).
- [x] Rótulos em português não mudam.
- [x] Entradas desses arquivos saem de `transitional.json`.

**Tests**: none
**Gate**: build
**Commit**: `refactor(crm): trocar por constantes os literais de telas e actions`

---

### T15: Literais de seed e scripts

**What**: Trocar literais em `src/db/seed.ts`, `src/db/create-admin.ts` e `scripts/`.
**Where**: `src/db/seed.ts` (modify)
**Depends on**: T14
**Reuses**: Módulos de vocabulário
**Requirement**: VOCAB-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] `seed.test.ts` e os testes de script passam sem mudar valor esperado.
- [x] Entradas desses arquivos saem de `transitional.json`.
- [x] Gate curto autorizado para este bloco verde (seed e scripts); suíte completa reservada ao fim dos blocos definidos no pedido da sessão.

**Tests**: integration
**Gate**: full
**Commit**: `refactor(nucleo): trocar por constantes os literais de seed e scripts`

---

### T16: `defineVertical`

**What**: Criar o contrato e a validação na carga.
**Where**: `src/vertical-kit/index.ts`
**Depends on**: T15
**Reuses**: `design.md` § 3
**Requirement**: VERT-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] `id` vazio lança erro nomeando o campo.
- [x] Recurso com nome de recurso do núcleo lança erro nomeando o campo.
- [x] Recurso sem um dos três papéis falha na compilação, provado por `@ts-expect-error`.
- [x] O módulo só importa o vocabulário, provado pelo teste de fronteira.

**Tests**: unit
**Gate**: quick
**Commit**: `feat(nucleo): criar o contrato do vertical`

---

### T17: Vertical da imobiliária

**What**: Definir o vertical do Krivo com marca, recurso `catalog`, agendamento ligado e os três segmentos. A qualificação entra na T27.
**Where**: `src/verticals/real-estate/index.ts`
**Depends on**: T16
**Reuses**: `src/verticals/real-estate/vocabulary.ts`
**Requirement**: VERT-02

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Teste afirma `id`, `brand` com `Krivo`, `krivo`, `X-Krivo-Tenant`, `appointments: true`, `catalog` com as permissões de `imoveis` e os segmentos.
- [x] O módulo é seguro para o navegador: sem `server-only` e sem banco, provado pelo teste de fronteira.

**Tests**: unit
**Gate**: quick
**Commit**: `feat(imobiliaria): definir o vertical do Krivo`

---

### T18: Vertical de teste

**What**: Criar o vertical sem catálogo, sem agendamento e sem segmentos, com a marca `Acme`.
**Where**: `src/vertical-kit/__tests__/fixture-vertical.ts`
**Depends on**: T17
**Reuses**: `defineVertical`
**Requirement**: VERT-03

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] O teste afirma que `defineVertical` aceita o fixture.
- [x] O grafo de imports do fixture não alcança `src/verticals/real-estate/`, por caso próprio que usa `checkImports`.

**Tests**: unit
**Gate**: quick
**Commit**: `test(nucleo): criar o vertical de teste`

---

### T19: `createAccess`

**What**: Criar a matriz por composição, com `read`/`write` e recursos em inglês.
**Where**: `src/lib/access.ts`
**Depends on**: T18
**Reuses**: `src/lib/permissions.ts:45`
**Requirement**: ACCESS-01, VOCAB-03

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Teste de paridade percorre a matriz de `bf5e646`, literal no teste, célula por célula, com o de-para do design.
- [x] Recurso desconhecido devolve `false`.
- [x] Com o vertical de teste, nenhum papel recebe `catalog`.
- [x] Mutante que troca uma célula morre.

**Tests**: unit
**Gate**: quick
**Commit**: `feat(nucleo): compor a matriz de permissões com o vertical`

---

### T20: Consumidores de permissão

**What**: Criar `src/kit/access.ts`, trocar `src/server/actions/permission.ts`, `session.ts`, `sidebar.tsx` e as páginas, e remover `src/lib/permissions.ts`.
**Where**: `src/kit/access.ts`
**Depends on**: T19
**Reuses**: `createAccess`
**Requirement**: ACCESS-01, VOCAB-03, KEEP-05

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Testes de actions, sessão e permissão passam com só a mudança de nome de recurso, ação e import.
- [x] Nenhuma referência a `documentos`, `configuracoes`, `usuarios`, `imoveis`, `ler` ou `escrever` como recurso ou ação em código não teste.
- [x] As URLs continuam em português.

**Tests**: integration
**Gate**: quick
**Commit**: `refactor(crm): usar as permissões compostas com o vertical`

---

### T21: `problem` com a marca

**What**: Transformar `problem` e `methodNotAllowed` em kit com marca, e os 22 arquivos de rota passam a importar de `src/kit/integration.ts`.
**Where**: `src/server/integration/problem.ts` (modify)
**Depends on**: T20
**Reuses**: `TITLES`, `PROBLEM_CODE`
**Requirement**: VERT-02, VERT-03, KEEP-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Com a imobiliária, `type` continua `urn:krivo:problem:<code>`, afirmado com literal.
- [x] Com o vertical de teste, `type` usa `acme`.
- [x] `openapi.test.ts` e os testes de rota passam com só a mudança de import.

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(integracao): ligar a resposta de problema à marca do vertical`

---

### T22: Header de tenant com a marca

**What**: Fazer `authenticateIntegration` ler o nome do header da marca.
**Where**: `src/server/integration/auth.ts` (modify)
**Depends on**: T21
**Reuses**: `src/server/integration/__tests__/`
**Requirement**: VERT-02, KEEP-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Com a imobiliária, `X-Krivo-Tenant` funciona e os textos de recusa não mudam.
- [x] Com o vertical de teste, só o header da marca dele é aceito.

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(integracao): ler da marca o header de tenant`

---

### T23: Marca fora do núcleo

**What**: Tirar os demais usos de `krivo` do código do núcleo, encontrados por `checkMarketTerms`: alerta de integração, e-mails e `VITRINE_ROLE`.
**Where**: `src/lib/integration-alert.ts` (modify)
**Depends on**: T22
**Reuses**: `VerticalBrand`
**Requirement**: VERT-02, BOUND-03

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Assunto do alerta segue `[krivo]` com a imobiliária, afirmado com literal, e usa a marca do vertical de teste.
- [x] Entradas de `krivo` em arquivos `core` saem de `transitional.json`, salvo o que depende do L18c, com motivo.
- [x] Gate Full da fase verde.

**Execução parcial e desvios (2026-11-05)**:

- T19: paridade literal de `bf5e646` verificada; o mutante que concede escrita em Dashboard ao administrador foi detectado. T20: política composta entregue por parâmetro à guarda; o commit adicional `2ceb116` removeu um import sem uso e restaurou os 9 avisos de linha de base. T21: respostas, autenticação e wrapper das rotas ligados pelo kit; as rotas do catálogo são pontos de composição do app.
- T23: as fábricas de autenticação, sessão e upload permitem entregar o envio de e-mail e a política do app sem import do núcleo para o kit. A resolução de tenant e os scripts que montam dependências específicas foram classificados como app; o papel físico da vitrine foi extraído para o vertical sem mudança de valor. A credencial publicada do n8n em `src/db/mint-service-key.ts` fica como exceção justificada do L18c.
- Gates concluídos: T19, 2 arquivos/63 testes; T20, 5/160; T21, 6/130; T22, 3/84. Gate focado da T23: 7 arquivos/141 testes. TypeScript final: 0 erros. ESLint final: 0 erros/9 avisos. Comparação dos 40 arquivos de teste existentes alterados: somente imports, nomes de recurso/ação, símbolos e entrega do vertical; nenhuma alteração inesperada de literal.
- `npm test`: 262 arquivos passaram e 3 falharam (265 no total); 4.190 testes passaram e 2 falharam (4.192 executados). Duas falhas de carregamento nas rotas de download/preview foram corrigidas com imports relativos e os dois arquivos passaram no reteste. Restaram as duas asserções de `src/server/reengagement/__tests__/expire.test.ts:114`: `updatedAt` gravado pela aplicação anterior ao valor inicial do banco. Persistiram na execução focada e também substituindo temporariamente `updateLeadFromAgent` pela função original de `bf5e646` (36 testes passaram/2 falharam); a função de trabalho foi restaurada byte a byte.
- **Bloqueio**: a DAL e o repositório envolvidos foram tocados na T13, portanto a falha permanece pendência deste lote, conforme o pedido. Após três execuções reproduzindo a asserção, a T23 fica sem commit: fazer o timestamp monotônico exige alterar a lógica temporal, em conflito com a restrição de preservar comportamento. Nenhuma asserção foi enfraquecida. A suíte ampla não foi repetida com esse bloqueio aberto; as alterações da T23 permanecem na árvore para continuação.
- `docs/integration/openapi.yaml` e `n8n/generated/` continuam sem diferença para `bf5e646`. Nenhuma alteração de schema ou ação de produção nesta sessão.

**Tests**: integration
**Gate**: full
**Commit**: `refactor(nucleo): tirar a marca do código do núcleo`

**Retomada concluída (2026-11-06)**:

- Bloqueio anterior superado após a sincronização do relógio informada pelo usuário: reteste de `reengagement/__tests__/expire.test.ts` e `data/__tests__/mutations.test.ts`, 2 arquivos/63 testes verdes. As duas falhas históricas registradas estavam no mesmo arquivo de expiração; como segundo arquivo, foi escolhido o teste de mutações da DAL que também verifica `updatedAt`. Nenhuma alteração nesses testes nem na lógica temporal de `updateLeadFromAgent`.
- Única execução de `npm test` nesta retomada: 265 arquivos/4.216 testes verdes, sem falhas. TypeScript: 0 erros. ESLint: 0 erros/9 avisos. Comparação dos 40 arquivos de teste existentes alterados no bloco sem mudança inesperada de literal; somente imports, símbolos, recursos/ações e entrega do vertical. T23 preservada e concluída no commit `bb37b0d`.
- Ajuste autorizado em commit próprio `99a7e44`: `STATUS_ACTOR` no tipo `StatusActor`, no ator padrão e nas leituras/escritas de `statusChangedBy`, com os mesmos valores persistidos. Gate curto: 5 arquivos/163 testes verdes; TypeScript: 0 erros; ESLint: 0 erros/9 avisos.
- OpenAPI e workflows gerados sem diferença para `bf5e646`. Nenhuma DDL, ação de produção ou publicação. Próximo bloco: T24–T31; T3, T44, T45 e Verifier não executados.

---

### T24: Schema do vertical

**What**: Mover `properties`, `tenantStorefronts` e os enums deles para o schema do vertical, e passar os dois schemas ao Drizzle.
**Where**: `src/verticals/real-estate/schema.ts`
**Depends on**: T23
**Reuses**: `design.md` § 8
**Requirement**: CAT-01, KEEP-03

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Foto do schema igual à base, com os dois arquivos.
- [x] `drizzle.config.ts`, `drizzle-test.config.ts` e `scripts/test-db-push.ts` listam os dois schemas.
- [ ] `npm run db:push:test` sem mudança pendente.
- [x] Views e papéis de `vitrine.sql` sem diferença.

A suíte completa validou a foto do schema. A checagem com `db:push:test` ficou pendente sob a restrição de DDL desta sessão.

**Tests**: integration
**Gate**: full
**Commit**: `refactor(imobiliaria): mover catálogo e vitrine para o schema do vertical`

---

### T25: Catálogo

**What**: Mover DAL, integração, filtros, action e validação de imóveis para o vertical e reclassificar no mapa.
**Where**: `src/verticals/real-estate/data/properties.ts`
**Depends on**: T24
**Reuses**: `src/server/data/index.ts:702-914`
**Requirement**: CAT-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Commit de movimento separado do commit de ajuste.
- [x] Testes de imóveis e `properties-actions.test.ts` passam com só a mudança de import.
- [x] `app/api/v1/properties` classificada como `vertical` no mapa.
- [x] Entradas de `property` desses arquivos saem de `transitional.json`.

**Tests**: integration
**Gate**: quick
**Commit**: `refactor(imobiliaria): mover o catálogo para o vertical`

---

### T26: Vitrine

**What**: Mover `src/lib/storefront*.ts`, `src/server/storefront/`, `src/server/data/storefront.ts` e a action para o vertical.
**Where**: `src/verticals/real-estate/storefront/`
**Depends on**: T25
**Reuses**: AD-049, AD-050
**Requirement**: CAT-02

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Commit de movimento separado do commit de ajuste.
- [x] Testes de vitrine e de isolamento passam com só a mudança de import.
- [x] Configurações continua mostrando `StorefrontComingSoon` e `saveStorefrontAction` continua como está.
- [x] `VITRINE_ROLE` em `test-connection.ts` tratado sem mudar o papel.

**Tests**: integration
**Gate**: quick
**Commit**: `refactor(imobiliaria): mover a vitrine para o vertical`

---

### T27: Faceta de qualificação

**What**: Criar `parsePatch`, `serialize`, `toLeadColumns` e `promptFacts`, e ligar ao vertical.
**Where**: `src/verticals/real-estate/qualification.ts`
**Depends on**: T26
**Reuses**: `src/server/integration/parsers.ts:307`, `leads.ts:97`
**Requirement**: QUAL-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Antes de mover: casos que fixam a ordem de validação do `PATCH` e a ordem dos campos do JSON, passando na base (L-042).
- [x] Teste de chave ausente, `null` explícito, valor válido e valor inválido, campo por campo (L-005).
- [x] Fixture com os 8 campos em valores distintos (L-078).

**Tests**: unit
**Gate**: quick
**Commit**: `feat(imobiliaria): criar a faceta de qualificação do vertical`

---

### T28: Kit de integração com qualificação

**What**: Criar `createIntegrationKit` com `parseLeadPatch`, `serializeLead` e `applyLeadPatch` e tornar opaco o campo de qualificação em `updateLeadFromAgent`.
**Where**: `src/server/integration/kit.ts`
**Depends on**: T27
**Reuses**: `src/server/integration/leads.ts`, `parsers.ts`
**Requirement**: QUAL-01, QUAL-02

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Testes de `/api/v1/leads` e `openapi.test.ts` passam com só a mudança de import.
- [x] Com o vertical de teste, `PATCH` com um campo de qualificação responde `payload-invalido`, e com `status` funciona.
- [x] Teste de ligação: tirar a chamada de `toLeadColumns` falha um teste (L-026).
- [x] Trava humana, condução humana e rede de escalonamento continuam na mesma ordem.

**Tests**: integration
**Gate**: quick
**Commit**: `refactor(integracao): delegar ao vertical os campos de qualificação`

---

### T29: Leitores de qualificação

**What**: Passar a seleção de qualificação a `getLeads` e `getRecentLeads`, usar `promptFacts` no reengajamento e mover `getLeadDistributions` para o vertical.
**Where**: `src/server/data/index.ts` (modify)
**Depends on**: T28
**Reuses**: `src/server/reengagement/context.ts:71`
**Requirement**: QUAL-02

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Pipeline, Dashboard e o contexto de reengajamento passam nos testes existentes.
- [x] Com o vertical de teste, ler e gravar lead funciona sem os campos.
- [x] Teste de ligação: tirar `promptFacts` do reengajamento falha um teste (L-026).

**Tests**: integration
**Gate**: quick
**Commit**: `refactor(nucleo): ler a qualificação pelo vertical`

---

### T30: Lista de colunas transitórias

**What**: Restringir as entradas de qualificação em `transitional.json` às colunas e aos enums de `leads`, com `removedIn: L18c`, e tipar `LeadQualificationRow`.
**Where**: `scripts/boundary/transitional.json` (modify)
**Depends on**: T29
**Reuses**: `design.md` § 8
**Requirement**: QUAL-01, BOUND-04

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] Nenhum arquivo `core` fora de `src/db/schema.ts`, `src/vertical-kit/` e o tipo de linha cita os 8 campos.
- [x] Teste de fronteira passa.

**Tests**: unit
**Gate**: quick
**Commit**: `chore(nucleo): restringir as exceções de qualificação ao L18c`

---

### T31: Segmentos de documento

**What**: Renomear para `segment` nas peças de documento e aplicar `documentSegments` no contexto, na admissão e no teto.
**Where**: `src/server/integration/context.ts` (modify)
**Depends on**: T30
**Reuses**: `src/server/documents/context-budget.ts`
**Requirement**: SEG-01, VERT-03

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [x] `POST /context` continua lendo `modality`, com a mesma resposta para a imobiliária.
- [x] Com o vertical de teste, o contexto entrega todos os documentos admitidos do tenant.
- [x] `updateDocumentAction`, upload e reconciliação usam `segment` (L-097), com os testes existentes intactos.
- [x] `leads.modality` e `properties.modality` mantêm o nome.
- [x] Gate Full da fase verde.

**Tests**: integration
**Gate**: full
**Commit**: `refactor(documentos): tratar a modalidade como segmento do vertical`

**Andamento em 2026-11-09**

- T31 em `817a73c`. Gate focado com 34 arquivos e 742 testes verdes. TypeScript com 0 erros e ESLint com 0 erros e 9 avisos.
- A primeira suíte completa passou em 270 arquivos e 4.211 testes. `seed.test.ts` falhou na preparação e 36 testes ficaram sem execução. Um teste temporário removeu três limites de uma fixture de seed nas branches de teste. A segunda suíte passou em 271 arquivos e 4.247 testes, sem falhas.
- OpenAPI e workflows gerados conferidos contra `bf5e646`. Próximo bloco T32–T35.

---

### T32: Símbolos de agendamento e atribuição

**What**: Aplicar as renomeações do `design.md` § 7 no schema, DAL, `src/lib/`, telas e testes, com a tradução na borda do `/api/v1`.
**Where**: `src/db/schema.ts` (modify)
**Depends on**: T31
**Reuses**: `design.md` § 7
**Requirement**: VOCAB-02, KEEP-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Arquivos `broker-*` e `meeting-attendance.ts` movidos em commit próprio.
- [ ] Foto do schema igual à base.
- [ ] `/api/v1` e `/settings` respondem `meetingAt`, `meetingDays` e `assignedBroker`, afirmados com literal.
- [ ] `git grep` dos nomes antigos sem resultado em código, inclusive comentários (L-063), salvo fio e `n8n/`.
- [ ] Índice `leads_assigned_user_id_meeting_at_idx` com o mesmo nome.

**Tests**: integration
**Gate**: quick
**Commit**: `refactor(nucleo): renomear agendamento e atribuição para termos genéricos`

---

### T33: Chave do agendamento

**What**: Aplicar `appointments: false` no kit, no DAL e nas métricas.
**Where**: `src/server/integration/kit.ts` (modify)
**Depends on**: T32
**Reuses**: `TRANSITIONS`, `src/lib/pilot-metrics.ts`
**Requirement**: APPT-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Ligado: testes de agenda, conflito e comparecimento passam sem mudança de valor.
- [ ] Desligado: `meetingAt` no `PATCH` responde `payload-invalido`, com a mesma mensagem de campo inválido.
- [ ] Desligado: `engaged` para `goal_reached` funciona sem horário.
- [ ] Desligado: pendências e métricas de comparecimento devolvem lista vazia.
- [ ] Os dois lados de cada chave têm teste (L-102).

**Tests**: integration
**Gate**: quick
**Commit**: `feat(nucleo): tornar o agendamento opcional por vertical`

---

### T34: Identificadores de `src/` e `app/`

**What**: Renomear pastas, arquivos e símbolos em português apontados por `checkIdentifiers`, como `src/components/usuarios/`.
**Where**: `src/components/users/`
**Depends on**: T33
**Reuses**: `design.md` § 12
**Requirement**: ENG-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Commit de movimento separado.
- [ ] Entradas de identificador de `src/` e `app/` saem de `transitional.json`, salvo pastas de rota e campos do fio.
- [ ] Texto de tela não muda.

**Tests**: none
**Gate**: build
**Commit**: `refactor(crm): renomear para inglês os identificadores em português`

---

### T35: Identificadores de `scripts/`

**What**: Renomear os símbolos e os arquivos em português de `scripts/` e `workflows/`.
**Where**: `scripts/vitrine-e2e.ts` (modify)
**Depends on**: T34
**Reuses**: `transitional.json`
**Requirement**: ENG-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Testes de script passam com só a mudança de nome.
- [ ] `npm run vitrine:e2e` continua iniciando, sem renomear o script do `package.json`, ou com a renomeação refletida nele e no README.
- [ ] Entradas de identificador de `scripts/` saem de `transitional.json`.
- [ ] Gate Full da fase verde.

**Tests**: integration
**Gate**: full
**Commit**: `refactor(scripts): renomear para inglês os identificadores em português`

---

### T36: Inliner com vertical

**What**: Acrescentar `--vertical`, `--out`, pastas múltiplas, `__VALUE`, `__BLOCK`, `__IF`, manifesto e os erros do design.
**Where**: `scripts/n8n-inline.mjs` (modify)
**Depends on**: T35
**Reuses**: `inlineWorkflowSource`, `generateAll`
**Requirement**: AGENT-02

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Teste por marca e por erro: bloco ausente, bloco sem referência, `__VALUE` sem valor, módulo duplicado, `__IF` sem `__ENDIF`, workflow fora da lista.
- [ ] As marcas somem por inteiro, sem linha em branco a mais.
- [ ] Duas execuções produzem os mesmos bytes.
- [ ] Sem o manifesto ainda em uso, o gate Agent segue sem diferença.

**Tests**: unit
**Gate**: quick
**Commit**: `feat(n8n): gerar os workflows por vertical`

---

### T37: Testes dos workflows contra o gerado

**What**: Fazer os 19 arquivos de teste importar de `n8n/generated/`, com só a mudança de import.
**Where**: `n8n/workflows/__tests__/` (modify)
**Depends on**: T36
**Reuses**: `scripts/__tests__/reengagement-proof.test.ts:220`
**Requirement**: AGENT-01, KEEP-02

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] A primeira rodada contra o gerado passa, ou cada asserção que dependia da fonte é listada no commit e tem equivalente de mesma força.
- [ ] O teste da T2 reprova fonte editada sem regenerar.

**Tests**: unit
**Gate**: quick
**Commit**: `test(n8n): testar os workflows pelo que é publicado`

---

### T38: Módulos do vertical

**What**: Mover `system-message.mjs`, `phase.mjs`, `reengagement-prompt.mjs`, `benchmark-corpus.mjs`, `benchmark-score.mjs` e `benchmark-contexto.ts` para `n8n/verticals/real-estate/`, e criar o manifesto.
**Where**: `n8n/verticals/real-estate/agent.mjs`
**Depends on**: T37
**Reuses**: `scripts/document-context-benchmark.ts:30`
**Requirement**: AGENT-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Commit de movimento separado.
- [ ] Testes de módulo passam com só a mudança de caminho.
- [ ] Gate Agent sem diferença.

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(n8n): mover para o vertical os módulos da imobiliária`

---

### T39: Valores do vertical

**What**: Trocar por `__VALUE` a URL do CRM, os ids e os exemplos `imobiliaria-a` e `Imobiliária A` nas fontes genéricas.
**Where**: `n8n/workflows/principal.ts` (modify)
**Depends on**: T38
**Reuses**: `n8n/verticals/real-estate/agent.mjs`
**Requirement**: AGENT-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Troca feita por script que confere o byte (L-047).
- [ ] Gate Agent sem diferença.
- [ ] `git grep` de `imobiliaria-a` nas fontes genéricas sem resultado.

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(n8n): ler do manifesto os valores do vertical`

---

### T40: Blocos do vertical

**What**: Mover para blocos as definições de tool com texto de mercado e a lista de tools do agente, em `principal.ts`, `reengagement-contextual.ts`, `scheduler.ts` e `tool-agendar-reuniao.ts`.
**Where**: `n8n/verticals/real-estate/blocks/`
**Depends on**: T39
**Reuses**: `n8n/workflows/principal.ts:1256-1596`
**Requirement**: AGENT-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Movimento por script (L-047).
- [ ] Gate Agent sem diferença.
- [ ] Nenhuma fonte genérica fora de trecho `__IF(appointments)__` cita `imóve`, `imobili`, `corretor` ou `buscar_imoveis` em código.

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(n8n): mover para blocos as tools da imobiliária`

---

### T41: Vertical de teste no agente

**What**: Marcar os trechos de agendamento com `__IF` e gerar os workflows do vertical de teste, com os testes de `toJSON()`.
**Where**: `n8n/verticals/__fixture__/agent.mjs`
**Depends on**: T40
**Reuses**: `n8n/workflows/scheduler.ts`
**Requirement**: AGENT-01, AGENT-02

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Saída em pasta ignorada pelo Git, recriada a cada teste.
- [ ] O JSON do vertical de teste não tem tool de agendamento nem ramo de lembrete.
- [ ] O JSON não cita `imóve`, `imobili`, `corretor` nem `buscar_imoveis`, em qualquer caixa.
- [ ] Gate Agent sem diferença e gate Full da fase verde.

**Tests**: unit
**Gate**: full
**Commit**: `test(n8n): gerar o agente de um vertical sem agendamento`

---

### T42: Vertical de teste nas peças

**What**: Rodar o vertical de teste pelas peças de lead, conversa, mensagem, documento, permissão e LGPD no banco de teste.
**Where**: `src/vertical-kit/__tests__/fixture-vertical.integration.test.ts`
**Depends on**: T41
**Reuses**: `src/vertical-kit/__tests__/fixture-vertical.ts`
**Requirement**: VERT-03

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Uma operação real de cada grupo conclui e confere a linha gravada (L-027).
- [ ] Caso confere que o grafo de imports do teste não alcança `src/verticals/real-estate/`.
- [ ] Peça que falhar vira correção nesta task, nunca exceção na lista.

**Tests**: integration
**Gate**: quick
**Commit**: `test(nucleo): provar as peças do núcleo sem a imobiliária`

---

### T43: Lista de transição final

**What**: Fechar `transitional.json` e proibir no teste qualquer entrada fora das categorias da BOUND-04.
**Where**: `scripts/boundary/transitional.json` (modify)
**Depends on**: T42
**Reuses**: `scripts/boundary/check.ts`
**Requirement**: BOUND-04, ENG-01

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] Toda entrada tem `removedIn: L18c` e categoria entre colunas e valores gravados, campos do `/api/v1`, módulos de `n8n/` e pastas de rota.
- [ ] Teste reprova entrada de outra categoria.
- [ ] O commit lista a contagem de entradas por categoria, para o spec do L18c.
- [ ] A lista de termos em português é revista contra uma amostra dos identificadores restantes.

**Tests**: unit
**Gate**: quick
**Commit**: `chore(nucleo): fechar a lista de transição para o L18c`

---

### T44: Capturas do fim

**What**: Capturar as mesmas páginas da T3 e comparar.
**Where**: `.specs/features/lote-18a-costuras-do-nucleo/evidence/end/`
**Depends on**: T43
**Reuses**: `npm run preview:test`
**Requirement**: KEEP-05

**Tools**: MCP: `claude-in-chrome`. Skill: NONE.

**Done when**:

- [ ] Mesmo banco de teste, mesma fixture e mesmas larguras da T3.
- [ ] Cada par comparado por página e papel, e a diferença registrada no `validation.md`, ou "nenhuma".
- [ ] Menu de cada papel igual ao da base.
- [ ] Diferença real vira correção antes de prosseguir.

**Tests**: none
**Gate**: quick
**Commit**: `docs(specs): registrar as capturas do fim do lote 18a`

---

### T45: Docs e gate final

**What**: Atualizar `n8n/README.md`, a seção n8n do `AGENTS.md`, `.specs/features/INDEX.md`, rodar todos os gates e registrar o Handoff.
**Where**: `n8n/README.md` (modify)
**Depends on**: T44
**Reuses**: L-063
**Requirement**: KEEP-01, KEEP-04, KEEP-06

**Tools**: MCP: NONE. Skill: NONE.

**Done when**:

- [ ] README explica vertical, manifesto, blocos e marcas.
- [ ] `git diff bf5e646 -- docs/integration/openapi.yaml n8n/generated/` vazio.
- [ ] `npm test` sem falha, com pelo menos 250 arquivos e 4041 testes.
- [ ] `npx tsc --noEmit -p .` sem aumento, ESLint em 0 erros e no máximo 9 avisos, `next build` contra o banco de teste sem erro.
- [ ] O commit afirma que não houve comando contra produção, publicação no n8n nem mudança na Vercel.
- [ ] Depois do commit, roda o Verifier independente, com as lições delegadas ao agente Opus 5.5 (AD-045).

**Tests**: none
**Gate**: full
**Commit**: `docs(nucleo): documentar a fronteira e o gerador por vertical`

---

## Phase Execution Map

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8

Phase 0:  T1 → T2 → T3
Phase 1:  T4 → T5 → T6 → T7 → T8 → T9
Phase 2:  T10 → T11 → T12 → T13 → T14 → T15
Phase 3:  T16 → T17 → T18
Phase 4:  T19 → T20 → T21 → T22 → T23
Phase 5:  T24 → T25 → T26 → T27 → T28 → T29 → T30 → T31
Phase 6:  T32 → T33 → T34 → T35
Phase 7:  T36 → T37 → T38 → T39 → T40 → T41
Phase 8:  T42 → T43 → T44 → T45
```

Execução sequencial, sem paralelismo: quase toda task mexe nos mesmos arquivos e usa o mesmo banco de teste.

**Lotes de worker (~7 tasks, fases inteiras):**

| Worker | Fases | Tasks | Tier sugerido |
| --- | --- | --- | --- |
| 1 | 0 e 1 | T1 a T9 | Alto: desenha o verificador |
| 2 | 2 e 3 | T10 a T18 | Médio: mecânico, com fixture ao fim |
| 3 | 4 | T19 a T23 | Alto: fábricas e marca |
| 4 | 5 | T24 a T31 | Alto: qualificação e movimentos |
| 5 | 6 | T32 a T35 | Médio: renomeações |
| 6 | 7 | T36 a T41 | Alto: gerador e igualdade de bytes |
| 7 | 8 | T42 a T45 | Alto: prova final |

---

## Task Granularity Check

| Tasks | Escopo | Status |
| --- | --- | --- |
| T1, T2, T4 a T12, T16 a T19, T21, T22, T27, T28, T30, T33, T36, T39, T41, T43 | Um módulo ou uma função | ✅ Granular |
| T13, T14, T15, T20, T34, T35, T37 | Mesma troca mecânica em vários arquivos, sem lógica nova | ⚠️ Vários arquivos, uma mudança só |
| T24, T25, T26, T29, T31, T32, T38, T40 | Um conceito que cruza arquivos e só compila junto | ⚠️ Não dá para dividir sem quebrar a suíte |
| T3, T23, T42, T44, T45 | Uma entrega de prova ou de limpeza | ✅ Granular |

## Diagram-Definition Cross-Check

Todas as fases são cadeias lineares, e cada task depende da anterior. O diagrama de cada fase começa pela última task da fase anterior, que é a dependência da primeira task dela.

| Fase | Diagrama | Depends on | Status |
| --- | --- | --- | --- |
| 0 | T1 → T3 | T1: None; T2: T1; T3: T2 | ✅ Match |
| 1 | T4 → T9 | T4: T3; demais: anterior | ✅ Match |
| 2 | T10 → T15 | T10: T9; demais: anterior | ✅ Match |
| 3 | T16 → T18 | T16: T15; demais: anterior | ✅ Match |
| 4 | T19 → T23 | T19: T18; demais: anterior | ✅ Match |
| 5 | T24 → T31 | T24: T23; demais: anterior | ✅ Match |
| 6 | T32 → T35 | T32: T31; demais: anterior | ✅ Match |
| 7 | T36 → T41 | T36: T35; demais: anterior | ✅ Match |
| 8 | T42 → T45 | T42: T41; demais: anterior | ✅ Match |

## Test Co-location Validation

| Task | Camada | Matriz exige | Task diz | Status |
| --- | --- | --- | --- | --- |
| T1, T2, T4 a T9 | Verificador e referências | unit | unit | ✅ OK |
| T10, T11, T16 a T19, T21, T22, T27, T30, T43 | Vocabulário, contrato, fábricas | unit | unit | ✅ OK |
| T12, T24 | Schema | integration | integration | ✅ OK |
| T13, T15, T20, T23, T25, T26, T28, T29, T31 a T33, T35, T42 | DAL, `/api/v1`, scripts com banco | integration | integration | ✅ OK |
| T36 a T41 | Inliner e workflows | unit | unit | ✅ OK |
| T14, T34 | Componentes e renomeação de símbolo | none + build | none | ✅ OK |
| T3, T44 | Captura real | none + captura | none | ✅ OK |
| T45 | Docs e gate final | none | none | ✅ OK |

**Tools**: as tasks não usam skill além de `tlc-spec-driven`, e o único MCP é `claude-in-chrome`, nas capturas T3 e T44.
