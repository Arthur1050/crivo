# Catálogo de imóveis — Tasks

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute
flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source
of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier,
discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Spec**: `.specs/features/lote-11-catalogo-de-imoveis/spec.md`
**Context**: `.specs/features/lote-11-catalogo-de-imoveis/context.md`
**Design**: `.specs/features/lote-11-catalogo-de-imoveis/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Gerada do codebase, das diretrizes do projeto e da spec — confirmar antes do Execute.
> **Diretrizes encontradas**: `CLAUDE.md` e `AGENTS.md` (convenções de UI/Astryx e de decisão
> arquitetural — **nenhuma diretriz de teste**); `vitest.config.ts` (sem limiar de cobertura,
> `fileParallelism: false`); **nenhum workflow de CI**. Sem diretriz de teste documentada, valem os
> **defaults fortes** da skill: toda AC da spec e todo Edge Case listado têm teste.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Função pura (`src/lib/*.ts`) | unit | Todos os ramos; 1:1 com as ACs da spec; todo Edge Case listado | `src/lib/__tests__/*.test.ts` | `npx vitest run src/lib` |
| Validação (`src/server/validation.ts`) | unit | Um caso válido e um inválido por regra; campo ausente ≠ campo vazio | `src/server/__tests__/*.test.ts` | `npx vitest run src/server/__tests__` |
| DAL (`src/server/data/`) | integration | Caminhos de consulta principais + erros; isolamento por tenant sempre | `src/server/data/__tests__/*.test.ts` | `npx vitest run src/server/data` |
| Server action (`src/server/actions/`) | integration | Permissão, validação e efeito no banco; recusa não grava | `src/server/__tests__/*.test.ts` | `npx vitest run src/server/__tests__` |
| Serviço do contrato (`src/server/integration/`) | integration | Todos os ramos; 1:1 com as ACs; todo Edge Case | `src/server/integration/__tests__/*.test.ts` | `npx vitest run src/server/integration` |
| Route handler (`app/api/v1/`) | e2e | Toda rota no escopo: happy + todo Edge Case + erro/405/auth | `src/server/integration/__tests__/routes/*.test.ts` | `npx vitest run src/server/integration` |
| Seed (`src/db/seed.ts`) | integration | Determinismo + presença das combinações exigidas | `src/db/__tests__/seed.test.ts` | `npx vitest run src/db` |
| Módulo puro n8n (`n8n/src/*.mjs`) | unit | Toda cláusula da instrução, uma asserção por cláusula | `n8n/src/__tests__/*.test.ts` | `npx vitest run n8n/src` |
| Workflow n8n (`n8n/workflows/*.ts`) | unit | Estrutura: nome da tool, origem de cada parâmetro, contagem de nós/conexões | `n8n/workflows/__tests__/*.test.ts` | `npx vitest run n8n/workflows` |
| Contrato publicado (`docs/integration/openapi.yaml`) | unit | Documento válido + a rota nova presente com seus parâmetros | `src/server/integration/__tests__/openapi.test.ts` | `npx vitest run src/server/integration` |
| Componente React / página (`src/components/`, `app/(crm)/`) | **none** | Gate de build apenas — o projeto tem **zero `.test.tsx`**; a evidência visual é captura de tela | — | gate de build |
| Schema / enum (`src/db/schema.ts`) | **none** | Gate de build apenas | — | gate de build |

## Gate Check Commands

> Gerada do codebase — confirmar antes do Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Depois de task com teste unitário só | `npx vitest run <caminho da suíte da task>` |
| Full | Depois de task com teste de integração ou de rota | `npx vitest run` |
| Build | Depois de task de schema, de UI, de documentação, e ao fim de cada fase | `npx vitest run && npm run lint && npm run build` |

**⚠️ Nunca rodar duas suítes ao mesmo tempo.** `npx vitest run` semeia um `TEST_DATABASE_URL`
compartilhado; duas rodadas concorrentes se corrompem e produzem falhas falsas convincentes
(`STATE.md § Handoff`, achado da T16 do lote-10). Antes de aceitar uma falha como real, confirmar que
nenhum outro processo `node` está vivo e repetir isolado.

**Lint**: 3 avisos pré-existentes são esperados (`ifElse` não usado em `scheduler.ts` e em
`generated`, diretiva eslint redundante em `route-instrumentation.test.ts`), 0 erros. Um aviso novo é
regressão.

---

## Execution Plan

Fases ordenadas, executadas em sequência; tasks dentro de uma fase executam em ordem.

### Fase 1: Fundação de dados

```
T1 → T2 → T3 → T4 → T5 → T6
```

### Fase 2: Permissão, escrita e seed

```
T7 → T8 → T9 → T10
```

### Fase 3: Contrato de integração

```
T11 → T12 → T13 → T14
```

### Fase 4: Tela do CRM

```
T15 → T16 → T17 → T18 → T19 → T20
```

### Fase 5: Fluxo do agente

```
T21 → T22 → T23 → T24
```

### Fase 6: Prova conversacional e fechamento

```
T25 → T26 → T27 → T28 → T29
```

---

## Task Breakdown

### T1: Medir o piso de testes antes de qualquer mudança

**What**: Rodar o gate build completo em árvore limpa e registrar o número exato de testes, arquivos e avisos de lint como baseline do lote.
**Where**: `.specs/features/lote-11-catalogo-de-imoveis/evidencia.md`
**Depends on**: None
**Reuses**: Procedimento da T1 do lote-10
**Requirement**: — (disciplina de execução)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `git status --porcelain` vazio antes de medir (os artefatos de planejamento ja foram commitados em `2026-09-10`, fora desta task)
- [x] Gate build passa: `npx vitest run && npm run lint && npm run build`
- [x] `evidencia.md` §1 registra: N testes / M arquivos / exit 0 no build / os 3 avisos de lint pré-existentes
- [x] O número registrado é o medido nesta janela, nunca copiado do Handoff do lote-10

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): registra piso de testes do lote-11`

---

### T2: Função pura de normalização de texto para busca

**What**: `normalizeForSearch(value)` — minúsculas, sem diacríticos, espaços colapsados e aparados.
**Where**: `src/lib/normalize-text.ts`
**Depends on**: T1
**Reuses**: Estilo de módulo puro de `src/lib/permissions.ts` e `src/lib/broker-assignment.ts`
**Requirement**: IMOV-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `normalizeForSearch("Santa María ")` e `normalizeForSearch("santa maria")` produzem o mesmo valor
- [x] Cobre: acento, cedilha, caixa, espaço duplo, espaço nas pontas, string vazia
- [x] Nenhum import — função pura, sem `server-only`
- [x] Gate passa: `npx vitest run src/lib/__tests__/normalize-text.test.ts`
- [x] Contagem de testes do arquivo registrada (6 testes)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(lib): adiciona normalizacao de texto para busca`

---

### T3: Enums e tabela `properties` no schema

**What**: `propertyKindEnum`, `propertyStatusEnum` e a tabela `properties` com os 4 índices do design.
**Where**: `src/db/schema.ts`
**Depends on**: T2
**Reuses**: `modalityEnum` (linha 22); disciplina de índice único parcial de `leads_assigned_user_id_meeting_at_idx`
**Requirement**: IMOV-01, IMOV-03, IMOV-05, IMOV-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `propertyKindEnum` com os 7 valores do design; `propertyTypeEnum` **inalterada** (diff do arquivo prova)
- [x] `properties` com `tenant_id` e `captured_by_user_id` NOT NULL, e as colunas `*Normalized`
- [x] Os 4 índices declarados: `(tenant_id, sequence)` único, `(tenant_id, reference)` único, `(tenant_id, status, published)`, `(captured_by_user_id)`
- [x] Migração aplicada no banco de desenvolvimento e a tabela existe
- [x] Gate build passa

**Tests**: none
**Gate**: build

**Commit**: `feat(db): adiciona tabela properties e enums do catalogo`

---

### T4: Validações do catálogo

**What**: `validatePriceCents`, `validateAreaSqm`, `validateRoomCount`, `validatePhotoUrls`, `validatePropertyKind`, `validatePropertyStatus`, `validateDescription`, `validateUf`.
**Where**: `src/server/validation.ts`
**Depends on**: T3
**Reuses**: `ValidationResult` e o formato de mensagem de `validateFileSize`/`validateModality`
**Requirement**: IMOV-06, IMOV-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Um caso válido e um inválido por regra, mais as fronteiras: preço `0` e `1`, área `0` e `1`, contagem `-1` e `0`, descrição em 4000 e em 4001 caracteres
- [x] `validatePhotoUrls`: URL sem esquema recusada, 12 aceitas, 13 recusadas, lista vazia aceita
- [x] Toda mensagem de erro nomeia o campo
- [x] Gate passa: `npx vitest run src/server/__tests__`
- [x] Contagem de testes registrada (218 testes, 8 arquivos em `src/server/__tests__`)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(validation): adiciona regras de validacao do catalogo`

---

### T5: Leitura do catálogo na DAL

**What**: `getProperties(tenantId, filters?)` e `isActiveMemberOf(tenantId, userId)`.
**Where**: `src/server/data/index.ts`
**Depends on**: T4
**Reuses**: `getDocuments` (linha 544) como molde do `and(...)` com `undefined` condicional; `tenant_members` com `deactivatedAt IS NULL`
**Requirement**: IMOV-01, IMOV-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `getProperties` filtra por status, publicação, tipo, modalidade e busca textual normalizada
- [x] Teste de isolamento: imóvel de outro tenant nunca aparece
- [x] `isActiveMemberOf` falso para usuário de outro tenant **e** para vínculo com `deactivatedAt` preenchido
- [x] Gate passa: `npx vitest run` (1140 testes, 84 arquivos)
- [x] Contagem de testes registrada, maior que a da T4 (218 testes em T4 → 1140 no total da suíte, 14 novos em `properties.test.ts`)

**Tests**: integration
**Gate**: full

**Commit**: `feat(data): adiciona leitura do catalogo de imoveis`

---

### T6: Escrita do catálogo na DAL

**What**: `createProperty` (com `sequence` = `max+1` do tenant, `reference` derivada e até 3 tentativas em colisão), `updateProperty` e `deleteProperty`.
**Where**: `src/server/data/index.ts`
**Depends on**: T5
**Reuses**: `createDocument`/`updateDocument`/`deleteDocument` como molde de assinatura e retorno
**Requirement**: IMOV-01, IMOV-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Referências nascem sequenciais **por imobiliária**: dois tenants começam ambos em 1
- [x] O tipo do patch de `updateProperty` **não aceita** `sequence` nem `reference` (imutabilidade por construção, não por checagem — IMOV-03 AC6; provado por `@ts-expect-error` + `npm run build`)
- [x] Colisão forçada (inserir `sequence` duplicado direto no banco) é rejeitada pelo índice, e a linha não é gravada pela metade
- [x] `createProperty` grava `neighborhoodNormalized`/`cityNormalized` via `normalizeForSearch`
- [x] `updatedAt` avança no update
- [x] Gate passa: `npx vitest run` (1151 testes, 84 arquivos) — fim de fase, `npm run lint` (0 erros, 3 avisos pré-existentes) e `npm run build` (exit 0) também rodados
- [x] Contagem de testes registrada, maior que a da T5 (1140 em T5 → 1151, 11 novos em `properties.test.ts`)

**Tests**: integration
**Gate**: full

**Commit**: `feat(data): adiciona escrita do catalogo com referencia unica por tenant`

---

### T7: Recurso `imoveis` na matriz de permissões

**What**: `"imoveis"` em `RESOURCES` e nas três linhas da matriz — administrador e gestor com `["ler","escrever"]`, corretor com `["ler"]`.
**Where**: `src/lib/permissions.ts`
**Depends on**: None (a Fase anterior conclui antes desta comecar)
**Reuses**: A própria matriz e `can()`
**Requirement**: IMOV-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Teste cobre as 6 combinações papel × ação para `imoveis`
- [x] Teste de papéis acumulados: corretor + gestor recebe `escrever` (união, PERM-01 AC4)
- [x] Nenhum escopo por captador foi introduzido (IMOV-04 AC6) — grep por `PropertyScope` vazio
- [x] Gate passa: `npx vitest run src/lib`
- [x] Contagem de testes registrada (216 testes, 17 arquivos em `src/lib`)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(permissions): adiciona recurso imoveis a matriz de papeis`

---

### T8: Server actions do catálogo

**What**: `createPropertyAction`, `updatePropertyAction`, `deletePropertyAction`, `setPropertyPublishedAction`, `setPropertyStatusAction`.
**Where**: `src/server/actions/properties.ts`
**Depends on**: T7
**Reuses**: `src/server/actions/documents.ts` na íntegra como molde; `denyIfForbidden`; `getActiveTenantId()`
**Requirement**: IMOV-02, IMOV-04, IMOV-05, IMOV-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Sessão de corretor recebe recusa em **cada uma** das 5 actions, e o banco fica inalterado (IMOV-04 AC3)
- [x] Captador de outro tenant e captador desativado recusados, sem gravar (IMOV-02 AC4)
- [x] Campo obrigatório **ausente** no payload de criação recusado como campo vazio, nunca tratado como "manter valor atual" (IMOV-07 AC5)
- [x] `tenantId` vem sempre de `getActiveTenantId()` — nenhuma action lê tenant do `input`
- [x] `revalidatePath("/imoveis")` em toda escrita bem-sucedida
- [x] Gate passa: `npx vitest run` (1179 testes, 85 arquivos)
- [x] Contagem de testes registrada, maior que a da T7 (216 em T7 → 1179 no total, 21 novos em `properties-actions.test.ts`)

**Tests**: integration
**Gate**: full

**Commit**: `feat(actions): adiciona escrita do catalogo com permissao e validacao`

---

### T9: Recusa legível ao excluir usuário que ainda é captador

**What**: Traduzir a violação da FK `captured_by_user_id` numa recusa com mensagem legível na tela de Usuários, em vez de erro cru.
**Where**: `src/server/actions/users.ts`
**Depends on**: T8
**Reuses**: O formato `{ ok:false, error }` já usado no módulo
**Requirement**: IMOV-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Excluir usuário que é captador devolve `{ ok:false }` com mensagem que diz quantos imóveis ele capta
- [x] Excluir usuário sem imóvel continua funcionando
- [x] **Desativar** continua funcionando em ambos os casos (USER-02: desativação não apaga a linha)
- [x] Gate passa: `npx vitest run` (1185 testes, 85 arquivos)
- [x] Contagem de testes registrada, maior que a da T8 (1179 em T8 → 1185, 5 novos em `users-actions.test.ts`)

**Tests**: integration
**Gate**: full

**Commit**: `fix(usuarios): recusa legivel ao excluir usuario que capta imovel`

---

### T10: Imóveis no seed determinístico

**What**: Bloco de imóveis por imobiliária, com captador entre os usuários daquela imobiliária e as 4 combinações de status × publicação.
**Where**: `src/db/seed.ts`
**Depends on**: T9
**Reuses**: A estrutura determinística já usada para leads e documentos no mesmo arquivo
**Requirement**: SEEDIM-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Duas execuções sobre banco limpo produzem o mesmo conjunto (referências, preços e captadores idênticos)
- [x] Cada imobiliária tem pelo menos um `disponivel`+`publicado`, um `disponivel`+não publicado, um `reservado` e um `vendido`
- [x] Todo captador é membro ativo da imobiliária do imóvel
- [x] `seed.test.ts` continua passando sem afrouxar nenhuma asserção existente
- [x] Gate passa: `npx vitest run` (1241 testes, 88 arquivos)
- [x] Contagem de testes registrada, maior que a da T9 (1185 em T9; +2 novos em `seed.test.ts`)

**Tests**: integration
**Gate**: full

**Commit**: `feat(seed): adiciona imoveis deterministicos por imobiliaria`

---

### T11: Parse dos filtros da rota

**What**: `parsePropertyFilters(params)` — reais inteiros para preço, inteiro ≥ 1 para quartos, valores de enum vindos do próprio schema, texto normalizado para bairro e cidade.
**Where**: `src/server/integration/property-filters.ts`
**Depends on**: None (a Fase anterior conclui antes desta comecar)
**Reuses**: A disciplina de `parsers.ts:202` (lista de valores permitidos vinda do enum, nunca duplicada); `normalizeForSearch`
**Requirement**: BUSCA-01, BUSCA-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Preço em **reais** é convertido para centavos aqui, uma única vez
- [x] `precoMin > precoMax` recusado (Edge Case), com detalhe nomeando o conflito
- [x] Preço não inteiro, negativo ou zero recusado — e nunca reinterpretado como centavos (Edge Case)
- [x] `quartosMin` zero ou negativo recusado (Edge Case)
- [x] Enum inválida recusada; ausência de todo filtro aceita
- [x] `bairro`/`cidade` passam por `normalizeForSearch`
- [x] Gate passa: `npx vitest run src/server/integration` (242 testes, 25 arquivos)
- [x] Contagem de testes registrada, maior que a da T10 (+26 novos em `property-filters.test.ts`, arquivo novo)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(integration): adiciona parse dos filtros de busca de imoveis`

---

### T12: Serviço de busca e serialização do contrato

**What**: `searchVisibleProperties(tenantId, filters)` — corte de visibilidade, `total`, página de 3, ordenação, e o DTO em português sem endereço, descrição, foto nem captador.
**Where**: `src/server/integration/properties.ts`
**Depends on**: T11
**Reuses**: `src/server/integration/context.ts` como molde de serviço fino; `formatCurrencyBRL` (`src/lib/format.ts:12`)
**Requirement**: BUSCA-01, BUSCA-02, BUSCA-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] O corte `status = 'disponivel' AND published = true` existe **só neste módulo** (grep prova)
- [ ] Teste nas fronteiras **3 e 4**: com 3 casando, `total` é 3 e a lista tem 3; com 4 casando, `total` é 4 e a lista tem 3
- [ ] Ordenação `updatedAt` desc, `id` asc, provada com empate de `updatedAt`
- [ ] Uma asserção **por campo proibido**, separadamente: sem `street`, sem `number`, sem `complement`, sem `description`, sem foto, sem nenhum campo de captador
- [ ] `preco` sai como string formatada; nenhum `bigint` atravessa o DTO
- [ ] Catálogo vazio devolve `{ imoveis: [], total: 0 }`, nunca erro (Edge Case)
- [ ] Filtro com acento e caixa diferentes casa o imóvel (Edge Case)
- [ ] Captador desativado não torna o imóvel invisível (Edge Case)
- [ ] Gate passa: `npx vitest run`
- [ ] Contagem de testes registrada, maior que a da T11

**Tests**: integration
**Gate**: full

**Commit**: `feat(integration): adiciona busca de imoveis visiveis do contrato`

---

### T13: Rota `GET /api/v1/properties`

**What**: Handler fino sob `withIntegrationRoute`, mais `methodNotAllowed(["GET"])` nos 4 outros verbos.
**Where**: `app/api/v1/properties/route.ts`
**Depends on**: T12
**Reuses**: `app/api/v1/context/route.ts` linha a linha como molde
**Requirement**: BUSCA-01, BUSCA-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Happy path com filtros combinados e sem filtro nenhum
- [ ] Filtro inválido → `400` `application/problem+json` com `code` `payload-invalido`
- [ ] Chave de serviço ausente/inválida e `X-Crivo-Tenant` desconhecido recusados (SEC-01), sem cair em tenant default
- [ ] Tenant A e tenant B com a mesma chave devolvem conjuntos disjuntos
- [ ] Os 4 verbos não suportados devolvem `405` em `problem+json`
- [ ] `route-instrumentation.test.ts` (varredura existente) passa sem alteração — o export está marcado `INSTRUMENTED`
- [ ] Recusa registrada em `integration_refusals` (AD-023)
- [ ] Nenhuma regra de negócio no corpo do handler
- [ ] Gate passa: `npx vitest run`
- [ ] Contagem de testes registrada, maior que a da T12

**Tests**: e2e
**Gate**: full

**Commit**: `feat(api): adiciona GET /api/v1/properties ao contrato`

---

### T14: Rota nova no `openapi.yaml`

**What**: Documentar `GET /api/v1/properties` — parâmetros, schema de resposta e os códigos de erro.
**Where**: `docs/integration/openapi.yaml`
**Depends on**: T13
**Reuses**: A entrada de `GET /context` como molde
**Requirement**: BUSCA-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `openapi.test.ts` valida o documento sem erro
- [ ] Asserção nova confirmando que o caminho existe com os 7 parâmetros de filtro e o schema de resposta com `imoveis` e `total`
- [ ] O schema documentado **não** declara endereço, descrição, foto nem captador
- [ ] A dívida herdada do lote-8 (`assignedBroker`, os 2 códigos de erro) **não** é adotada aqui — continua no L14
- [ ] Gate passa: `npx vitest run src/server/integration`
- [ ] Contagem de testes registrada, maior que a da T13

**Tests**: unit
**Gate**: quick

**Commit**: `docs(api): documenta GET /properties no openapi`

---

### T15: Barra de filtros da tela de imóveis

**What**: Filtros de status, publicação, tipo e modalidade, mais busca textual, todos escritos na URL.
**Where**: `src/components/properties/properties-toolbar.tsx`
**Depends on**: None (a Fase anterior conclui antes desta comecar)
**Reuses**: `src/components/documents/documents-toolbar.tsx` como molde, incluindo o debounce de 300 ms e o `router.replace`
**Requirement**: IMOV-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Cada filtro escreve seu parâmetro na URL; nenhum filtro é aplicado no client
- [ ] Componentes Astryx (`Selector`, `TextInput`, `HStack`) — nenhum `<div>`, nenhum `style={{}}`, nenhum valor cru
- [ ] Gate build passa

**Tests**: none
**Gate**: build

**Commit**: `feat(imoveis): adiciona barra de filtros do catalogo`

---

### T16: Tabela de imóveis

**What**: `Table` com referência, tipo, bairro/cidade, preço, área, dormitórios, status e publicação, mais menu de linha com editar e excluir.
**Where**: `src/components/properties/properties-table.tsx`
**Depends on**: T15
**Reuses**: `src/components/documents/documents-table.tsx` (Table com `pixel`/`proportional`, `DropdownMenu`, `AlertDialog`); `formatCurrencyBRL`
**Requirement**: IMOV-04, IMOV-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `Table` edge-to-edge, **não** `Card` por linha (regra do `CLAUDE.md`)
- [ ] Status via `StatusDot`/`Token`; publicação via `Badge` — nunca `Badge` decorativo
- [ ] Os controles de escrita só são renderizados quando a permissão concede `escrever`
- [ ] Exclusão passa por `AlertDialog`
- [ ] Nenhum `<div>`, nenhum `style={{}}`, nenhum hex ou px cru
- [ ] Gate build passa

**Tests**: none
**Gate**: build

**Commit**: `feat(imoveis): adiciona tabela do catalogo`

---

### T17: Diálogo de cadastro e edição

**What**: Um `Dialog purpose="form"` que serve criação e edição, com seleção de captador entre os membros ativos da imobiliária.
**Where**: `src/components/properties/property-form-dialog.tsx`
**Depends on**: T16
**Reuses**: `src/components/documents/upload-dialog.tsx` e `edit-document-dialog.tsx` como molde
**Requirement**: IMOV-02, IMOV-06, IMOV-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Captador é campo obrigatório, listando só membros ativos daquela imobiliária
- [ ] Referência aparece somente leitura na edição, e não existe na criação
- [ ] Fotos são campo de URL, com o teto de 12 refletido na interface
- [ ] Erro devolvido pela action aparece no formulário, sem fechar o diálogo
- [ ] Nenhum `<div>`, nenhum `style={{}}`, nenhum valor cru
- [ ] Gate build passa

**Tests**: none
**Gate**: build

**Commit**: `feat(imoveis): adiciona dialogo de cadastro e edicao de imovel`

---

### T18: Página `/imoveis`

**What**: RSC que lê `searchParams`, consulta duas vezes (tudo × filtrado) e distingue os dois estados vazios.
**Where**: `app/(crm)/imoveis/page.tsx`
**Depends on**: T17
**Reuses**: `app/(crm)/documentos/page.tsx` como molde direto, incluindo o par de consultas
**Requirement**: IMOV-01, IMOV-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] "Nenhum imóvel cadastrado" e "nenhum imóvel casa com o filtro" são estados distintos (Edge Case)
- [ ] `getActiveTenantId()` resolve a imobiliária no servidor
- [ ] Os controles de escrita são passados à tabela conforme a permissão da sessão
- [ ] Gate build passa

**Tests**: none
**Gate**: build

**Commit**: `feat(imoveis): adiciona pagina do catalogo`

---

### T19: Item de navegação

**What**: Entrada "Imóveis" em `NAV_ITEMS`, entre Documentos e Configurações.
**Where**: `src/components/shell/sidebar.tsx`
**Depends on**: T18
**Reuses**: `visibleItems` (linha 154) já filtra por `can(roles, resource, "ler")` — nenhuma lógica nova
**Requirement**: IMOV-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Item aponta para `/imoveis` com `resource: "imoveis"` e um ícone `lucide-react` coerente com os demais
- [ ] Nenhuma condicional nova de visibilidade foi escrita — a filtragem existente resolve (IMOV-04 AC4)
- [ ] Gate build passa

**Tests**: none
**Gate**: build

**Commit**: `feat(shell): adiciona Imoveis a navegacao`

---

### T20: Evidência visual das duas visões

**What**: Capturas de tela de `/imoveis` como gestor (com controles de escrita) e como corretor (sem nenhum), mais o diálogo de cadastro aberto.
**Where**: `.specs/features/lote-11-catalogo-de-imoveis/evidencia.md`
**Depends on**: T19
**Reuses**: Procedimento de captura já usado nos lotes de UI
**Requirement**: IMOV-04

**Tools**:
- MCP: `claude-in-chrome` (extensão do Chrome — **não** o painel embutido)
- Skill: NONE

**Done when**:
- [ ] Captura real (nunca inspeção de DOM) das duas visões, anexada e referenciada em `evidencia.md`
- [ ] A visão de corretor não exibe botão de criar, menu de linha nem controle de publicação — é a prova de `IMOV-04 AC2`, que o projeto não consegue provar por teste (zero `.test.tsx`)
- [ ] Tela conferida em tema claro e escuro
- [ ] Gate build passa

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): registra evidencia visual da tela de imoveis`

---

### T21: Fronteira de capacidade e catálogo de tools no system message

**What**: Remover "NÃO busca imóveis" e "NÃO informa preços" da fronteira de capacidade, manter a proibição de foto e arquivo, e acrescentar `buscar_imoveis` ao catálogo de tools com a regra de resultado vazio.
**Where**: `n8n/src/system-message.mjs`
**Depends on**: None (a Fase anterior conclui antes desta comecar)
**Reuses**: `TOOLS_CATALOG_INSTRUCTION` e `CAPABILITY_BOUNDARY_INSTRUCTION` já existentes
**Requirement**: BUSCA-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Uma asserção **por cláusula**: "não busca imóveis" ausente, "não informa preços" ausente, proibição de foto presente, proibição de arquivo/e-mail presente
- [ ] Linha de `buscar_imoveis` presente no catálogo, instruindo a declarar ausência quando não houver resultado (BUSCA-05 AC6)
- [ ] Instrução de citar somente os campos devolvidos, sem prometer endereço nem nome de corretor (BUSCA-05 AC7)
- [ ] `n8n/src/gate.mjs` e `n8n/src/phase.mjs` com **zero** linhas tocadas (grep no diff prova — BUSCA-05 AC10)
- [ ] Gate passa: `npx vitest run n8n/src`
- [ ] Contagem de testes registrada, maior que a da T14

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agente): libera busca de imoveis na fronteira de capacidade`

---

### T22: Nó `buscar_imoveis` no workflow

**What**: `httpRequestTool` v4.5 com `X-Crivo-Tenant` por expressão do fluxo, um `$fromAI` por filtro, `neverError`, e `retryOnFail`/`maxTries` em `config`.
**Where**: `n8n/workflows/principal.ts`
**Depends on**: T21
**Reuses**: `consultarDocumentosTool` (linha 1153) como molde
**Requirement**: BUSCA-04

**Tools**:
- MCP: `n8n` (`get_node_types`, `validate_workflow`)
- Skill: NONE

**Done when**:
- [ ] `retryOnFail` e `maxTries` estão em `config`, **não** dentro de `parameters` — o erro que o commit `a80760c` corrigiu em `consultar_documentos`
- [ ] `X-Crivo-Tenant` vem de `$('Code: gate')`, nunca de `$fromAI` (BUSCA-04 AC3)
- [ ] A tool entra em `subnodes.tools` do `AI Agent`; as 5 existentes permanecem
- [ ] Teste estrutural: nome da tool, origem de cada parâmetro, e as contagens de nós e conexões batendo com a adição de exatamente uma tool
- [ ] `agentModel` com zero linhas tocadas (AD-026)
- [ ] `validate_workflow` do MCP passa
- [ ] Gate passa: `npx vitest run n8n/workflows`
- [ ] Contagem de testes registrada, maior que a da T21

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agente): adiciona tool buscar_imoveis ao fluxo principal`

---

### T23: Regenerar o artefato publicável

**What**: `node scripts/n8n-inline.mjs` e revisão do `n8n/generated/principal.ts` resultante.
**Where**: `n8n/generated/principal.ts`
**Depends on**: T22
**Reuses**: Pipeline documentado em `n8n/README.md §1`
**Requirement**: BUSCA-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `n8n/generated/principal.ts` regenerado pelo script, nunca editado à mão (AD-014)
- [ ] O diff contém a tool nova e as duas mudanças de `system-message`, e **nada mais** inesperado
- [ ] `scripts/__tests__/n8n-inline.test.ts` passa
- [ ] Gate build passa

**Tests**: none
**Gate**: build

**Commit**: `chore(agente): regenera principal com a tool buscar_imoveis`

---

### T24: Publicar e conferir hash

**What**: Publicar `crivo-agente-principal` na instância a partir de `n8n/generated/principal.ts` e conferir SHA-256 do publicado antes de ativar.
**Where**: `.specs/features/lote-11-catalogo-de-imoveis/evidencia.md`
**Depends on**: T23
**Reuses**: Procedimento do lote-10 (conferência de SHA antes de ativar)
**Requirement**: BUSCA-04

**Tools**:
- MCP: `n8n` (`update_workflow`, `get_workflow_details`, `publish_workflow`)
- Skill: NONE

**Done when**:
- [ ] SHA-256 do publicado confere com o gerado **antes** de ativar (BUSCA-04 AC12)
- [ ] `evidencia.md` registra o id da versão publicada, como o Handoff do lote-10 faz
- [ ] Nenhum outro workflow tocado — a dívida cosmética do `crivo-tool-agendar-reuniao` fica como está
- [ ] Gate build passa

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): registra publicacao do principal com buscar_imoveis`

---

### T25: Cenário de inventário no roteiro de smoke

**What**: Cenário novo descrito como intenção de turno, com o estado final exigido e o checklist de limpeza dos alvos na ordem n8n→CRM.
**Where**: `n8n/smoke/roteiro.md`
**Depends on**: None (a Fase anterior conclui antes desta comecar)
**Reuses**: A estrutura dos 3 cenários existentes (AD-027)
**Requirement**: PROVA-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Cenário descrito como **intenção de turno**, nunca como fala literal (o modelo não é determinístico)
- [ ] Cobre os dois desfechos: critério que casa e critério que não casa
- [ ] Checklist nomeia lead no CRM, linha de `conversa_estado` e sessão em `n8n_chat_histories`, com linha de confirmação antes de começar
- [ ] Barra de aprovação por desfecho; qualidade de fala em seção separada que não reprova sozinha
- [ ] Gate build passa

**Tests**: none
**Gate**: build

**Commit**: `docs(smoke): adiciona cenario de consulta de inventario`

---

### T26: Executar o cenário de inventário

**What**: Conversa real pelos dois desfechos, com evidência.
**Where**: `.specs/features/lote-11-catalogo-de-imoveis/evidencia.md`
**Depends on**: T25
**Reuses**: Protocolo da AD-027
**Requirement**: PROVA-02

**Tools**:
- MCP: `n8n` (`get_execution`, `search_executions`)
- Skill: NONE

**Done when**:
- [ ] Imóvel citado ao lead tem referência e preço batendo com a linha do banco (PROVA-02 AC3)
- [ ] Critério sem resultado produz declaração de ausência, sem nenhum imóvel citado (PROVA-02 AC4)
- [ ] Ids de execução conferidos por `get_execution` antes de citados — nunca de memória (lição `L-011`)
- [ ] Captura da conversa registrada
- [ ] Iterações do turno observadas e registradas — se `maxIterations: 8` estourar, abrir task de correção dentro do lote (risco nomeado no `design.md`)
- [ ] Gate build passa

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): registra prova conversacional do cenario de inventario`

---

### T27: Regressão do cenário qualificar→agendar

**What**: Repetir o cenário do lote-10 com a 6ª tool no ar e confirmar que o desfecho não regrediu.
**Where**: `.specs/features/lote-11-catalogo-de-imoveis/evidencia.md`
**Depends on**: T26
**Reuses**: Cenário já versionado em `n8n/smoke/roteiro.md`
**Requirement**: PROVA-02

**Tools**:
- MCP: `n8n` (`get_execution`)
- Skill: NONE

**Done when**:
- [ ] Lead termina em `qualificado_agendado` com responsável atribuído (PROVA-02 AC7)
- [ ] Evento com link do Meet existe no calendário
- [ ] Limpeza dos alvos confirmada antes de começar
- [ ] Ids de execução conferidos por `get_execution`
- [ ] Gate build passa

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): registra regressao do cenario de agendamento`

---

### T28: Emenda à rastreabilidade do lote-6c

**What**: Registrar em `VOZ-02 AC5` do lote-6c que a proibição de buscar imóveis e informar preços foi **parcialmente superseded** por `BUSCA-05` do lote-11.
**Where**: `.specs/features/lote-6c-agente-ai-agent-memoria-tools/spec.md`
**Depends on**: T27
**Reuses**: O molde do que a AD-022 fez com `ATRIB-01` do lote-7
**Requirement**: BUSCA-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] A nota diz **qual** metade caiu (buscar imóveis, informar preços) e qual permanece (foto e arquivo)
- [ ] O veredito original do Verifier daquele lote **não** é reescrito — só recebe a nota de supersessão
- [ ] Gate build passa

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): registra supersessao parcial de VOZ-02 AC5 pelo lote-11`

---

### T29: Fechar o lote

**What**: Rastreabilidade da spec para `Verified`, `INDEX.md`, `ROADMAP-POS-PILOTO.md` e `STATE.md § Handoff`.
**Where**: `.specs/features/lote-11-catalogo-de-imoveis/spec.md`
**Depends on**: T28
**Reuses**: Procedimento de fechamento do lote-10
**Requirement**: — (fechamento)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Os 15 requirement IDs com status final e evidência `file:line`; nenhum aprovado por ausência
- [ ] `INDEX.md` ganha a linha do lote-11, com o que ficou aberto
- [ ] `ROADMAP-POS-PILOTO.md` marca o L11 como executado e registra o que sobrou para o L12 e o L16
- [ ] `STATE.md § Handoff` reescrito para o lote-11, preservando as pendências herdadas ainda não resolvidas
- [ ] Piso de testes final registrado e **maior** que o da T1
- [ ] `validate_state.py lote-11-catalogo-de-imoveis` exit 0 (roda depois do Verifier)
- [ ] **Revisão das lições `candidate`**: rodar `lessons.py list --status all`, ler as candidatas destiladas neste lote e **apresentar ao usuário** quais merecem promoção a `confirmed`, com o critério (generalizável além do incidente · acionável no planejamento · ainda verdadeira contra o código atual · não redundante com outra lição, com uma AD ativa ou com o `CLAUDE.md`). A promoção é decisão do usuário — nunca automática. Sem este passo a lição destilada nunca chega a ser carregada em lote nenhum, que foi o que aconteceu com as 25 primeiras (auditado em 2026-09-10)
- [ ] Gate build passa

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): fecha o lote-11 com a rastreabilidade final`

---

## Phase Execution Map

```
Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5 → Fase 6

Fase 1:  T1 → T2 → T3 → T4 → T5 → T6
Fase 2:  T7 → T8 → T9 → T10
Fase 3:  T11 → T12 → T13 → T14
Fase 4:  T15 → T16 → T17 → T18 → T19 → T20
Fase 5:  T21 → T22 → T23 → T24
Fase 6:  T25 → T26 → T27 → T28 → T29
```

Execução estritamente sequencial — não há paralelismo dentro de fase.

---

## Task Granularity Check

| Task | Escopo | Status |
| --- | --- | --- |
| T1 | 1 medição, 1 arquivo de evidência | ✅ Granular |
| T2 | 1 função pura | ✅ Granular |
| T3 | 2 enums + 1 tabela, 1 arquivo, coeso | ✅ Granular |
| T4 | 8 validações, 1 arquivo, mesma regra de retorno | ✅ Granular |
| T5 | 2 funções de leitura, 1 arquivo | ✅ Granular |
| T6 | 3 funções de escrita, 1 arquivo, mesma unidade de escrita | ✅ Granular |
| T7 | 1 entrada na matriz | ✅ Granular |
| T8 | 5 actions, 1 arquivo, mesmo molde | ✅ Granular |
| T9 | 1 tradução de erro, 1 arquivo | ✅ Granular |
| T10 | 1 bloco de seed | ✅ Granular |
| T11 | 1 função de parse | ✅ Granular |
| T12 | 1 função de serviço + 1 DTO | ✅ Granular |
| T13 | 1 rota | ✅ Granular |
| T14 | 1 entrada de documentação | ✅ Granular |
| T15 | 1 componente | ✅ Granular |
| T16 | 1 componente | ✅ Granular |
| T17 | 1 componente | ✅ Granular |
| T18 | 1 página | ✅ Granular |
| T19 | 1 item de navegação | ✅ Granular |
| T20 | 1 evidência visual | ✅ Granular |
| T21 | 2 constantes do mesmo módulo | ✅ Granular |
| T22 | 1 nó | ✅ Granular |
| T23 | 1 regeneração | ✅ Granular |
| T24 | 1 publicação | ✅ Granular |
| T25 | 1 cenário de roteiro | ✅ Granular |
| T26 | 1 execução de cenário | ✅ Granular |
| T27 | 1 execução de regressão | ✅ Granular |
| T28 | 1 emenda de rastreabilidade | ✅ Granular |
| T29 | 1 fechamento | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (corpo) | Diagrama mostra | Status |
| --- | --- | --- | --- |
| T1 | None | (início da Fase 1) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | None | (início de fase; a fronteira Fase 1→2 já sequencia) | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | None | (início de fase; a fronteira Fase 2→3 já sequencia) | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | None | (início de fase; a fronteira Fase 3→4 já sequencia) | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |
| T20 | T19 | T19 → T20 | ✅ Match |
| T21 | None | (início de fase; a fronteira Fase 4→5 já sequencia) | ✅ Match |
| T22 | T21 | T21 → T22 | ✅ Match |
| T23 | T22 | T22 → T23 | ✅ Match |
| T24 | T23 | T23 → T24 | ✅ Match |
| T25 | None | (início de fase; a fronteira Fase 5→6 já sequencia) | ✅ Match |
| T26 | T25 | T25 → T26 | ✅ Match |
| T27 | T26 | T26 → T27 | ✅ Match |
| T28 | T27 | T27 → T28 | ✅ Match |
| T29 | T28 | T28 → T29 | ✅ Match |

Nenhuma dependência aponta para fase posterior.

---

## Test Co-location Validation

| Task | Camada criada/modificada | Matriz exige | Task diz | Status |
| --- | --- | --- | --- | --- |
| T1 | nenhuma (medição) | — | none | ✅ OK |
| T2 | Função pura `src/lib` | unit | unit | ✅ OK |
| T3 | Schema / enum | none | none | ✅ OK |
| T4 | Validação | unit | unit | ✅ OK |
| T5 | DAL | integration | integration | ✅ OK |
| T6 | DAL | integration | integration | ✅ OK |
| T7 | Função pura `src/lib` | unit | unit | ✅ OK |
| T8 | Server action | integration | integration | ✅ OK |
| T9 | Server action | integration | integration | ✅ OK |
| T10 | Seed | integration | integration | ✅ OK |
| T11 | Serviço do contrato (puro) | unit | unit | ✅ OK |
| T12 | Serviço do contrato (com banco) | integration | integration | ✅ OK |
| T13 | Route handler | e2e | e2e | ✅ OK |
| T14 | Contrato publicado | unit | unit | ✅ OK |
| T15 | Componente React | none | none | ✅ OK |
| T16 | Componente React | none | none | ✅ OK |
| T17 | Componente React | none | none | ✅ OK |
| T18 | Página | none | none | ✅ OK |
| T19 | Componente React | none | none | ✅ OK |
| T20 | nenhuma (evidência) | — | none | ✅ OK |
| T21 | Módulo puro n8n | unit | unit | ✅ OK |
| T22 | Workflow n8n | unit | unit | ✅ OK |
| T23 | Artefato gerado | none | none | ✅ OK |
| T24 | nenhuma (publicação) | — | none | ✅ OK |
| T25 | Documentação | none | none | ✅ OK |
| T26 | nenhuma (execução real) | — | none | ✅ OK |
| T27 | nenhuma (execução real) | — | none | ✅ OK |
| T28 | Documentação | none | none | ✅ OK |
| T29 | Documentação | none | none | ✅ OK |

Nenhum `Tests: none` é deferimento de teste: cada um cai numa camada que a matriz marca `none`
(componente React, schema, artefato gerado, documentação) ou numa task que não cria código.
