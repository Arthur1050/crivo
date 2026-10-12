# Lote 16b — Vitrine pública (projeto `vitrine/`) — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/lote-16b-vitrine-app/spec.md`
**Design**: `.specs/features/lote-16-vitrine-publica/design.md` (comum ao L16)
**Context**: `.specs/features/lote-16-vitrine-publica/context.md`
**Status**: Approved (usuário, 2026-10-09; revisado com o usuário em 2026-10-10, depois do L16a fechado com Verifier PASS e arquivado)

**Regras deste lote (auditoria do L14b § 7; AD-010, AD-014, AD-025, AD-033, AD-040 a AD-043):**

- Execução em linha, uma task por vez; os únicos sub-agentes são os do fechamento: o Verifier e o agente de lições (AD-045).
- `tasks.md` recebe só status e hash. Evidência no commit e no `validation.md`.
- **Nenhuma ação em produção**: sem projeto na Vercel, sem variável remota, sem push. Isso é o L16c.
- Nada em `vitrine/` importa de fora de `vitrine/`. Fora de `vitrine/`, só arquivos de teste da suíte raiz (`__tests__/`) importam de `vitrine/`: paridade, isolamento e o teste de banco das consultas (AD-044).
- `AGENTS.md`: leia em `node_modules/next/dist/docs/` a página de cada API do Next antes de usá-la.
- Astryx: `npx astryx build`, `npx astryx template` e `npx astryx component` antes de cada tela; sem `<div>` de layout, sem `style`, só tokens. Exceções: `<img>` dentro de `AspectRatio` com utilitários Tailwind de token (a lib não tem primitivo de imagem) e os `<style>` do tema com a saída de `generateThemeCSS` (AD-046).
- Trabalho visual só com captura real pela extensão do Chrome (`npm run vitrine:dev`, porta 3100); sem captura, não altere UI.
- Capturas de 375 px (usuário, 2026-10-10): a página real carregada num quadro de 375 px, como no L16a, porque a janela da extensão não reduz o viewport. Para VTEMA-02 AC9, a largura de rolagem do documento é medida dentro do quadro (≤ 375) e o número vai para o `validation.md`, por página.
- `npm run vitrine:e2e` usa a branch `test`: não rode junto com testes pontuais (L-033).
- Nenhum commit com `Co-Authored-By`, "Generated with" ou marca de atribuição (AD-014).

---

## Test Coverage Matrix

> Guidelines found: `AGENTS.md`/`CLAUDE.md`, `vitest.config.ts` (Neon real, AD-033; coleta todo `*.test.ts`, inclusive `vitrine/`). Amostras: `src/lib/__tests__/format.test.ts`, `src/server/integration/__tests__/properties.test.ts`, `src/server/__tests__/properties-actions.test.ts`, `src/db/__tests__/test-connection.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Lib pura da vitrine (`vitrine/src/lib`, `vitrine/src/tema`, `vitrine/src/revalidacao.ts`) | unit | 1:1 com os ACs; todos os ramos; limites exatos (24/25, 10/11 dígitos) | `vitrine/src/**/__tests__/*.test.ts` | `npx vitest run vitrine/src/<arquivo>` |
| Consultas (`vitrine/src/dados/consultas.ts`) | integration | Como `krivo_vitrine` na branch do worker; fixture escrita como dono; linha de outra loja na fixture (L-035); todos os estados de imóvel | `src/db/__tests__/vitrine-consultas.test.ts` (suíte raiz, AD-044) | `npx vitest run src/db/__tests__/vitrine-consultas.test.ts` |
| Conexão, camada de cache e rota (`vitrine/src/db/conexao.ts`, `vitrine/src/dados/cache.ts`, `vitrine/app/api/**`) | unit | Conexão sem a variável falha sem expor URL; `next/cache` simulado: perfil, tag, `revalidateTag` com `{ expire: 0 }`; todos os status da rota | `vitrine/**/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| Paridade e isolamento (`src/**/__tests__/*paridade*`, `*isolamento*`) | unit / integration | Quebra quando um lado muda; colunas reais das views | `src/lib/__tests__`, `src/db/__tests__` | `npx vitest run <arquivo>` |
| Rotas (`vitrine/app/**`) | e2e + captura real | Cada task de rota acrescenta as asserções dela ao harness: sucesso, vazio, não encontrado, erro; PII, isolamento, cache e revalidação por HTTP contra `next start` | `scripts/vitrine-e2e.ts` | `npm run vitrine:e2e` |
| Componentes montados por rota (`vitrine/src/templates/**`, `vitrine/src/item/**`, `vitrine/src/rodape/**`) | none (build) | Provados pelo e2e da task de rota seguinte, que os monta | - | build gate |
| Scripts de prova (`scripts/vitrine-*.ts`) | integration | Fixture cria e remove tudo, sem resíduo | `scripts/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| Docs | none | registro no commit | - | - |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Task com testes unit/integration | `npx vitest run <arquivos da task>` |
| Build | Toda task que toca `vitrine/` | `npm --prefix vitrine run lint` + `npm --prefix vitrine run typecheck` + `npm --prefix vitrine run build`; e `npm run lint` + `npx tsc --noEmit -p .` na raiz sem erro novo (linha de base do L16a: 50 erros preexistentes em arquivos de teste; reconferir na T0) |
| E2E | Tasks de rota (T14 em diante) e fechamento | `npm run vitrine:e2e` |
| Full | Fechamento do lote | `npm test` + `npm run vitrine:e2e` (nunca simultâneos) |
| Registro | Gate, capturas e docs | Resultado em `validation.md`, commitado |

---

## Execution Plan

### Phase 0: Gate de viabilidade

```
T0
```

### Phase 1: Projeto e dados

```
T0 → T1 → T2 → T3 → T4 → T5
T1 → T6
```

### Phase 2: Lógica pura e revalidação

```
T1 → T7
T1 → T8
T1 → T9
T1 → T10
T2 → T10
T2 → T11 → T12
```

### Phase 3: Harness de prova

```
T0 → T13 → T14
T12 → T14
```

### Phase 4: Páginas

```
T8 → T15 → T16 → T17
T5 → T16
T10 → T16
T14 → T16
T16 → T18
T9 → T19 → T20 → T21
T16 → T19
T7 → T21
T8 → T22 → T23
T9 → T22
T16 → T23
T5 → T24
T10 → T24
T14 → T24
```

### Phase 5: Fechamento

```
T21 → T25 → T26
T23 → T25
T24 → T25
```

---

## Task Breakdown

### T0: Gate de viabilidade (F8–F13, F19)

**Status**: concluída em 2026-10-10 (hash `ddbf72d`; resultado em `validation.md`). Gate: F8, F9, F11 (build), F12, F13 (dois caminhos) e F19 passam; **F10 reprovou** e foi resolvido pela AD-046 (opção b, decisão delegada pelo usuário a um agente Opus 5.5). Protótipo apagado.

**What**: Comprovar F8–F13 e F19 do design com um protótipo descartável em `scratch/vitrine-prova/` (fora do git) lendo a branch `test` como `krivo_vitrine`; registrar resultado e fonte.
**Where**: `.specs/features/lote-16b-vitrine-app/validation.md`
**Depends on**: None
**Reuses**: design.md § Fatos operacionais; docs em `node_modules/next/dist/docs/`
**Requirement**: VCACHE-01, VTEMA-01, VOG-01, VPROJ-01

**Done when**:

- [ ] F8: status HTTP de `notFound()` dentro de `<Suspense>` registrado (a doc diz 200 em streaming); build com banco vazio, contagem de consultas antes e depois do segundo GET, GET depois de `revalidateTag(tag, { expire: 0 })` refletindo a mudança
- [ ] F9: `<head>` com `og:title` para o UA do WhatsApp; F10: cor da loja no HTML sem JS; F11: as 4 fontes na build; F12: PNG do `opengraph-image`
- [ ] F13, dois caminhos: (i) teste dentro do protótipo rodando na suíte raiz, com o `vitest` da raiz e as dependências locais do protótipo; (ii) teste da suíte raiz fora do protótipo importando dele um módulo que cria o `db` com o `drizzle-orm` e o `pg` locais e lê a branch `test` como `krivo_vitrine` (caminho do teste da T4, AD-044)
- [ ] F19: raiz que o Next infere com `package-lock.json` na raiz do repositório e no protótipo, e o efeito de `turbopack.root` apontando para a pasta do protótipo (doc `turbopack.md` § Root directory); o resultado define a config da T1
- [ ] IF F8 ou F10 falhar THEN parar o lote e levar ao usuário a alternativa do design; IF o caminho (ii) da F13 falhar THEN parar e levar ao usuário (reabre onde fica o teste da T4); demais falhas ajustam a task dona
- [ ] Protótipo apagado depois do registro; nenhuma credencial registrada

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): registrar o gate de viabilidade da vitrine`

---

### T1: Projeto base da vitrine

**Status**: concluída em 2026-10-10 (hash no `git log`; gate: 12 testes verdes, build da vitrine e da raiz sem erro novo).

**What**: `vitrine/` com `package.json` (mesmas versões do CRM; scripts `dev`, `build`, `start`, `lint`, `typecheck`), `next.config.ts` (`cacheComponents: true`, `cacheLife.vitrine` = 60/60/300, cabeçalhos `X-Robots-Tag: noindex, nofollow` e `Referrer-Policy`, `turbopack.root` na pasta `vitrine/` conforme a F19), `tsconfig.json` (exclui `**/__tests__/**`: os testes da vitrine importam o `vitest` da raiz, que não é instalado no deploy; eles rodam no Vitest e não passam por `tsc`), lint, `app/layout.tsx` (CSS da Astryx, `lang="pt-BR"`, `robots` noindex) e `app/not-found.tsx` neutro; raiz exclui `vitrine/` do `tsconfig.json` e do lint, e o `.gitignore` da raiz ganha `/vitrine/node_modules` e `/vitrine/.next/`; `vitrine/package-lock.json` versionado.
**Where**: `vitrine/next.config.ts`
**Depends on**: T0
**Reuses**: `next.config.ts`, `eslint.config.mjs` e `app/layout.tsx` da raiz como referência
**Requirement**: VPROJ-01, VSEO-01, VCACHE-01

**Done when**:

- [ ] `src/lib/__tests__/vitrine-isolamento.test.ts`: nenhum `proxy.ts`/`middleware.ts` em `vitrine/` (AC3); varredura dos imports de `vitrine/` fora de `node_modules` (AC4): import relativo nunca sai de `vitrine/`; import de pacote é módulo nativo do Node ou pacote declarado no `package.json` da vitrine; em arquivos de `__tests__/` só `vitest` é aceito a mais; o teste prova a regra com um caso de cada recusa; `vitrine/tsconfig.json` exclui `**/__tests__/**`; `tsconfig.json` e lint da raiz excluem `vitrine/` (AC5); `next.config.ts` da vitrine com `cacheComponents: true`, o perfil 60/60/300 (VCACHE-01 AC2) e `turbopack.root` na própria pasta (F19)
- [ ] `git check-ignore` confirma `vitrine/node_modules` e `vitrine/.next`; depois do `npm install --prefix vitrine` e do build, `git status --short` não lista arquivo dessas duas pastas; `vitrine/package-lock.json` entra no commit
- [ ] Build da vitrine e da raiz passam

**Tests**: unit
**Gate**: build

**Commit**: `feat(l16): projeto base da vitrine`

---

### T2: Contrato da vitrine e paridade

**Status**: concluída em 2026-10-10 (paridade 5 testes verdes, mutação de coluna só na vitrine quebra e foi desfeita; build gate sem erro novo).

**What**: `vitrine/src/contrato.ts` (tag, layouts, fontes, payload, colunas) e o teste de paridade com `src/lib/storefront-contract.ts`.
**Where**: `vitrine/src/contrato.ts`
**Depends on**: T1
**Reuses**: `src/lib/storefront-contract.ts` (L16a T2: `STOREFRONT_LAYOUTS`, `STOREFRONT_FONTS`, `storefrontCacheTag`, `RevalidationRequest`, `STOREFRONT_VIEW_COLUMNS`)
**Requirement**: VPROJ-02

**Done when**:

- [ ] `src/lib/__tests__/storefront-contract-parity.test.ts`: tag para 3 slugs, layouts, fontes e colunas iguais dos dois lados (AC7, AC8); o executor confirma que renomear uma coluna só de um lado quebra o teste e desfaz
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(l16): contrato espelhado da vitrine`

---

### T3: Views declaradas na vitrine

**Status**: concluída em 2026-10-10 (3 testes verdes contra o banco, renomear coluna declarada quebra e foi desfeito; build gate sem erro novo).

**What**: `pgSchema("vitrine")` e `pgView(...).existing()` de `lojas` e `imoveis`, com tipos derivados.
**Where**: `vitrine/src/db/views.ts`
**Depends on**: T2
**Reuses**: colunas do contrato (T2); `currentTestDatabaseUrl` em `src/db/__tests__/vitrine-helpers.ts` (L16a). O lado CRM já confere `STOREFRONT_VIEW_COLUMNS` contra as views reais em `src/db/__tests__/vitrine-views.test.ts` (L16a)
**Requirement**: VPROJ-02, VSEG-01

**Done when**:

- [ ] `src/db/__tests__/vitrine-views-paridade.test.ts`: colunas declaradas = `information_schema.columns` das duas views no banco do worker, nome e ordem (AC8)
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(l16): views declaradas na vitrine`

---

### T4: Consultas e conexão da vitrine

**Status**: concluída em 2026-10-10 (11 testes verdes (8 no banco como krivo_vitrine, 3 de conexão); 5 mutantes mortos; build gate sem erro novo).

**What**: `lojaPorSlug`, `imoveisDaLoja` (ordem destaque → `atualizado_em` desc → referência asc) e `imovelPorReferencia` (sem distinção de caixa), recebendo o `db`; e `vitrine/src/db/conexao.ts` com `criarDb(url)` (Pool `pg` com `max: 3` e Drizzle sobre as views, sem ler ambiente) e a conexão da app por `VITRINE_DATABASE_URL` (`server-only`, criada no primeiro uso).
**Where**: `vitrine/src/dados/consultas.ts`
**Depends on**: T3
**Reuses**: T3; `resolveVitrineTestUrl` em `src/db/test-connection.ts`, `currentTestDatabaseUrl` em `src/db/__tests__/vitrine-helpers.ts` e o padrão de fixture `newTenant`/`addProperty` de `src/db/__tests__/vitrine-views.test.ts` (L16a)
**Requirement**: VSEG-01, VCAT-02, VITEM-01, VPROJ-01

**Done when**:

- [ ] `src/db/__tests__/vitrine-consultas.test.ts` (suíte raiz, AD-044): fixture escrita como dono, com o `db` e o schema de `src/db`; leitura pelas consultas importadas de `vitrine/`, com o `db` de `criarDb(<URL do papel>)` conectado como `krivo_vitrine` (caminho (ii) da F13). Fixture com duas lojas ativas, uma inativa e imóveis em todos os estados: loja A nunca devolve linha da B (VSEG AC2, AC3); vendido, reservado e despublicado ausentes por lista e por referência direta (AC4); ordem com empate de `atualizado_em` decidido pela referência (VCAT AC2); `ap-0142` acha `AP-0142` (VITEM Edge Case); loja inativa → nulo
- [ ] `vitrine/src/db/__tests__/conexao.test.ts`: sem `VITRINE_DATABASE_URL` a conexão da app falha com mensagem sem URL (VPROJ AC6)
- [ ] Quick + Build passam

**Tests**: integration + unit
**Gate**: quick

**Commit**: `feat(l16): consultas e conexão da vitrine`

---

### T5: Camada de cache

**Status**: concluída em 2026-10-10 (7 testes verdes, 3 mutantes mortos (tag fixa, sem cacheLife, perfil errado); build gate sem erro novo).

**What**: `vitrine/src/dados/cache.ts` com `use cache`, `cacheLife("vitrine")` e `cacheTag(tag(slug))` sobre cada consulta, usando a conexão da T4.
**Where**: `vitrine/src/dados/cache.ts`
**Depends on**: T4
**Reuses**: doc `use-cache.md`, `cacheLife.md`, `cacheTag.md`; conexão da T4
**Requirement**: VCACHE-01

**Done when**:

- [ ] `vitrine/src/dados/__tests__/cache.test.ts` com `next/cache` simulado: cada função chama `cacheLife("vitrine")` e `cacheTag("tenant:<slug>:catalogo")` com o slug recebido (AC1)
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(l16): cache da vitrine por loja`

---

### T6: Dev da vitrine contra o banco de teste

**Status**: concluída em 2026-10-10 (7 testes verdes, 3 mutantes mortos, execução real na porta 3100 com 404 em rota inexistente; build gate sem erro novo).

**What**: `npm run vitrine:dev` na raiz: deriva a URL do papel para a branch `test`, gera segredo local e sobe `next dev -p 3100` em `vitrine/` sem imprimir credencial.
**Where**: `scripts/vitrine-dev.ts`
**Depends on**: T1
**Reuses**: `resolveVitrineTestUrl` e `VITRINE_ROLE` em `src/db/test-connection.ts` (L16a T7; já codifica a senha, L-071); senha em `VITRINE_TEST_DB_PASSWORD` do ambiente local
**Requirement**: VPROJ-01

**Done when**:

- [ ] `scripts/__tests__/vitrine-dev.test.ts`: o ambiente passado ao processo filho tem as 3 variáveis, nenhuma linha impressa contém senha
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `chore(l16): dev da vitrine contra o banco de teste`

---

### T7: Paginação e validação de rota

**Status**: concluída em 2026-10-10 (12 testes verdes; 4 mutantes mortos e 1 equivalente; build gate sem erro novo).

**What**: `paginar(itens, pagina)` (24 por página; inválida → 1; acima da última → última), `slugValido`, `referenciaParaUrl` e `referenciaDaUrl`.
**Where**: `vitrine/src/lib/catalogo.ts`
**Depends on**: T1
**Reuses**: —
**Requirement**: VCAT-02, VCAT-03, VITEM-01

**Done when**:

- [ ] Testes: 24 itens → 1 página sem paginação; 25 → página 2 com 1 item; `pagina` `0`, `-1`, `abc`, `1.5` → 1; `99` → última; slugs no limite de 63 e 64, com maiúscula e com `_`
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(l16): paginação e validação de rota da vitrine`

---

### T8: Links de contato

**Status**: concluída em 2026-10-10 (9 testes verdes; 5 mutantes mortos; build gate sem erro novo).

**What**: `linkWhatsapp(numero, mensagem)`, `mensagemItem(ref, loja)`, `mensagemCatalogo(loja)`, `linkTelefone`, `linkInstagram`.
**Where**: `vitrine/src/lib/contato.ts`
**Depends on**: T1
**Reuses**: —
**Requirement**: VITEM-02, VLEGAL-01, VCAT-01

**Done when**:

- [ ] Testes: 10 e 11 dígitos recebem `55`, 12 e 13 não; caracteres não numéricos removidos; mensagem do item com a referência em maiúsculas e o nome, decodificada igual ao texto da spec; mensagem de catálogo; `tel:+55...`; `https://instagram.com/<handle>`
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(l16): links de contato da vitrine`

---

### T9: Apresentação dos dados

**Status**: concluída em 2026-10-10 (13 testes verdes (11 da vitrine + 2 de paridade com o enum do CRM); 5 mutantes mortos; build gate sem erro novo).

**What**: Preço em reais sem centavos, rótulos de tipo e modalidade (`Record` tipado; `ambos` sem rótulo), texto alternativo das fotos, título e descrição de compartilhamento do catálogo e do item.
**Where**: `vitrine/src/lib/apresentacao.ts`
**Depends on**: T1
**Reuses**: formato pt-BR de `src/lib/format.ts` como referência, sem importar
**Requirement**: VCAT-01, VITEM-01, VOG-01

**Done when**:

- [ ] Testes: `52000000n` → `R$ 520.000`; os 7 tipos rotulados; `ambos` → sem rótulo; títulos e descrições exatamente como VOG AC2 e AC3, com e sem título institucional
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(l16): apresentação de preço, tipo e metadados`

---

### T10: Tema da loja

**Status**: concluída em 2026-10-10 (13 testes verdes; 6 mutantes verificados e mortos; build gate sem erro novo; AD-046).

**What**: `temaDaLoja({ slug, cor, fonte })` e `cssDoTema(tema)` em `vitrine/src/tema/tema-da-loja.ts` (puros, sem `next/font`): `defineTheme` estendendo o tema neutro, nome `loja-<slug>`, famílias por `tokens` (`--font-family-body` e `--font-family-heading` = `var(--font-<fonte>)`) e as duas camadas de CSS que a Astryx gera (`generateThemeCSS`; AD-046). `TemaDaLoja` (`'use client'`, porque `defineTheme` não roda em Server Component) em `vitrine/src/tema/tema-da-loja-provider.tsx`, que renderiza `<Theme mode="light">` com os dois `<style>`. E `vitrine/src/tema/fontes.ts` com as 4 fontes de `next/font/google` (`variable` = `--font-<id>`). O mapa fica em módulo próprio porque `next/font/google` é vazio fora do compilador do Next (`index.js` de 0 bytes) e não pode ser importado por um teste.
**Where**: `vitrine/src/tema/tema-da-loja.ts`
**Depends on**: T1, T2
**Reuses**: `npx astryx docs theme` (§ defineTheme, extends); fontes do contrato (T2); AD-046 e os achados do gate T0 em `validation.md`
**Requirement**: VTEMA-01

**Done when**:

- [ ] Testes: `cssDoTema(...).tema` começa com `@layer astryx-theme {` e contém `@scope ([data-astryx-theme="loja-<slug>"])`; `.reset` começa com `@layer reset {` e contém `:where(h1, h2, h3, h4, h5, h6)`; o conteúdo interno é igual a `generateThemeCSS(tema).component` e `.prose`
- [ ] `--color-accent` (via `resolveThemeTokens`): `#d4145a` ≠ `#12a150` ≠ cor nula; cor nula = cor padrão; cor fora do padrão (`#FFF`, `red`, `#d4145a;}</style>`) = cor nula, e a saída nunca contém `</style`; slug fora de `^[a-z0-9-]{1,63}$` lança; nenhuma asserção usa o hex derivado literal
- [ ] `--font-family-body` e `--font-family-heading` = `var(--font-<fonte>)` para as 4 fontes do contrato; o teste não importa `fontes.ts`
- [ ] Alarme de upgrade: o texto de `node_modules/@astryxdesign/core/dist/Theme/Theme.js` contém `@layer reset {` e `@layer astryx-theme {` na injeção
- [ ] `fontes.ts` tipado como `Record` das fontes do contrato (L-029), com `variable` = `--font-<id>`: fonte nova ou renomeada quebra a compilação; provado pelo build (F11) e pelo e2e da T16
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(l16): tema por loja`

---

### T11: Verificação da revalidação

**Status**: concluída em 2026-10-10 (10 testes verdes; 5 mutantes mortos e 1 equivalente; build gate sem erro novo).

**What**: `verificarSegredo(cabecalho, segredo)` (SHA-256 + `timingSafeEqual`; segredo vazio sempre falso) e `lerCorpo(texto)`.
**Where**: `vitrine/src/revalidacao.ts`
**Depends on**: T2
**Reuses**: payload do contrato (T2)
**Requirement**: VCACHE-02

**Done when**:

- [ ] Testes: segredo certo; errado do mesmo tamanho e de outro tamanho; sem `Bearer`; segredo configurado vazio (AC4); corpo não JSON, sem slug, slug inválido (AC5); `timingSafeEqual` chamado (AC7)
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(l16): verificação do aviso de revalidação`

---

### T12: Rota de revalidação

**Status**: concluída em 2026-10-10 (9 testes verdes; 7 mutantes verificados e mortos; build gate sem erro novo, rota ƒ /api/revalidar no build).

**What**: `POST /api/revalidar` → 204 com `revalidateTag(tag, { expire: 0 })`; 401, 400, 405; log `[vitrine]` com slug e desfecho.
**Where**: `vitrine/app/api/revalidar/route.ts`
**Depends on**: T11
**Reuses**: doc `revalidateTag.md` (§ webhooks, `{ expire: 0 }`)
**Requirement**: VCACHE-02

**Done when**:

- [ ] `vitrine/app/api/revalidar/__tests__/route.test.ts` com `next/cache` simulado: 204 e uma chamada com a tag e `{ expire: 0 }` (AC3); 401 e 400 sem chamada (AC4, AC5); GET/PUT → 405 (AC6); nenhum log contém o segredo nem o cabeçalho (AC10); nenhuma resposta define cookie
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(l16): rota de revalidação da vitrine`

---

### T13: Fixture de sentinelas

**Status**: concluída em 2026-10-10 (hash `23c747c`; 4 testes verdes; lint da raiz 0 erros e `tsc` da raiz com os mesmos 50 erros de linha de base).

**What**: `criarFixtureVitrine()`/`removerFixtureVitrine()` na branch `test`: lojas A e B ativas com cores, fontes e layouts diferentes, C inativa, D ativa sem cor, com a fonte padrão e sem imóvel visível (VTEMA AC2/AC7 e o estado vazio da T21); imóveis em todos os estados; captador, endereço e lead com textos sentinela únicos; um imóvel sem foto; um com `<script>` na descrição; 25 imóveis visíveis na loja A.
**Where**: `scripts/vitrine-fixture.ts`
**Depends on**: T0
**Reuses**: padrão de fixture `newTenant`/`addProperty` de `src/db/__tests__/vitrine-views.test.ts` (L16a; não há módulo de fixture compartilhado); tabela `tenant_storefronts` e `properties.featured` (L16a). O seed do L16a já deixa a 1ª imobiliária com vitrine ativa e destaques: a fixture usa tenants próprios e não altera essas linhas
**Requirement**: VSEG-01, VSEG-02

**Done when**:

- [ ] `scripts/__tests__/vitrine-fixture.test.ts`: criar duas vezes não duplica; remover deixa zero linhas das quatro lojas da fixture e não toca linha do seed
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `test(l16): fixture de sentinelas da vitrine`

---

### T14: Harness HTTP da vitrine

**Status**: concluída em 2026-10-10 (hash `eae2d41`; e2e 11 de 11 asserções verdes; falha proposital sai com código 1 e remove a fixture e o processo; lint e `tsc` da raiz sem erro novo).

**What**: `npm run vitrine:e2e`: fixture → `next build` + `next start` da vitrine com o papel e segredo aleatório → asserções nomeadas → derruba o processo e limpa a fixture, mesmo em falha; stdout do servidor capturado para a varredura de sentinelas. Asserções iniciais: rota sem correspondência → 404 neutro (resposta sem streaming); slug inválido → página de não encontrado neutra; `X-Robots-Tag` em toda resposta; nenhum `Set-Cookie`; `POST /api/revalidar` 204/401/400/405 por HTTP.
**Where**: `scripts/vitrine-e2e.ts`
**Depends on**: T13, T12
**Reuses**: T13; `node:assert`
**Requirement**: VCAT-03, VSEG-02, VCACHE-02, VSEO-01

**Done when**:

- [ ] As asserções iniciais passam; uma falha proposital (status esperado trocado) faz o comando sair com código ≠ 0 e ainda limpar a fixture e o processo
- [ ] E2E + Build passam

**Tests**: e2e
**Gate**: e2e

**Commit**: `test(l16): harness http da vitrine`

---

### T15: Rodapé legal

**Status**: concluída em 2026-10-10 (hash `4b61246`; lint, typecheck e build da vitrine sem erro; isolamento da raiz 12 testes verdes; o componente é montado e provado na T16).

**What**: Componente com razão social, CRECI, aviso fixo e, quando houver, endereço, telefone, Instagram e WhatsApp.
**Where**: `vitrine/src/rodape/rodape-legal.tsx`
**Depends on**: T8
**Reuses**: links da T8
**Requirement**: VLEGAL-01

**Done when**:

- [ ] Componentes e tokens Astryx; self-check do `CLAUDE.md`; montado e provado na T16
- [ ] Build passa

**Tests**: none
**Gate**: build

**Commit**: `feat(l16): rodapé legal da vitrine`

---

### T16: Layout da loja

**Status**: concluída em 2026-10-10 (hash `dcd016c`; e2e 18 de 18; 4 mutantes do layout mortos; capturas `t16-01` a `t16-04`, largura de rolagem 375 em A e B; lint, typecheck e build da vitrine sem erro; `tsc` da raiz com os mesmos 50 erros).

**What**: `app/c/[slug]/layout.tsx`: `<Suspense>`; slug inválido → `notFound()` sem consulta; loja ausente → `notFound()`; `TemaDaLoja` da loja (T10: `<Theme mode="light">` com o CSS do tema no HTML, AD-046); cabeçalho com logo, nome e botão de WhatsApp; rodapé legal (T15). O layout raiz (`app/layout.tsx`) ganha `data-theme="light"` no `<html>` e as variáveis das 4 fontes (`fontes.ts`). Antes: `npx astryx template centered-hero`.
**Where**: `vitrine/app/c/[slug]/layout.tsx`
**Depends on**: T15, T5, T10, T14
**Reuses**: `centered-hero`
**Requirement**: VCAT-01, VCAT-03, VTEMA-01, VLEGAL-01

**Done when**:

- [ ] E2E ganha: loja C e slug inexistente → página de não encontrado neutra, com `noindex`, sem nome de nenhuma loja (VCAT AC9, AC10); status registrado (200 esperado pela doc, F8); para A, B e D, no HTML sem JS: exatamente um bloco `@layer astryx-theme {` seguido de `@scope ([data-astryx-theme="loja-<slug>"])` e um `@layer reset {` com o mesmo escopo e `:where(h1, h2, h3, h4, h5, h6)`; o wrapper com `data-astryx-theme="loja-<slug>"`; o HTML de A não contém `loja-<slug de B>`; o `--color-accent` extraído do bloco de cada loja satisfaz acA ≠ acB, acA ≠ acD e acB ≠ acD, sem comparar com hex literal (VTEMA AC2, AC7); `--font-family-body` de A = `var(--font-<fonte de A>)`, de B = `var(--font-<fonte de B>)`, e diferentes (VTEMA AC3); rodapé com razão social, CRECI e aviso (VLEGAL AC1); link `wa.me` do cabeçalho decodificado igual à mensagem de catálogo
- [ ] Captura real do cabeçalho e rodapé (`npm run vitrine:dev`), desktop e 375 px, com a aba visível (o React 19.2 revela o Suspense por `requestAnimationFrame`; em aba oculta o conteúdo fica no fallback)
- [ ] E2E + Build passam

**Tests**: e2e
**Gate**: e2e

**Commit**: `feat(l16): layout e tema da loja`

---

### T17: Imóvel indisponível

**Status**: concluída em 2026-10-10 (hash `b49a51e`; e2e 20 de 20; 2 mutantes mortos; capturas `t17-01` a `t17-03`; a mensagem é renderizada no servidor, não por `notFound()` em `<Suspense>`: ver `validation.md`; lint, typecheck e build da vitrine sem erro; `tsc` da raiz com os mesmos 50 erros).

**What**: `app/c/[slug]/not-found.tsx` com "Este imóvel não está mais disponível.", link para o catálogo, dentro da marca da loja.
**Where**: `vitrine/app/c/[slug]/not-found.tsx`
**Depends on**: T16
**Reuses**: `EmptyState` da Astryx
**Requirement**: VITEM-02

**Done when**:

- [ ] E2E ganha: referência inexistente na loja A → página de não encontrado com a mensagem, o link, o CRECI da A e `noindex`
- [ ] Captura real
- [ ] E2E + Build passam

**Tests**: e2e
**Gate**: e2e

**Commit**: `feat(l16): página de imóvel indisponível`

---

### T18: Vitrine indisponível

**Status**: concluída em 2026-10-10 (hash `49e311d`; e2e 21 de 21; 2 mutantes mortos; 4 testes unitários novos do erro de leitura; capturas `t18-01` e `t18-02`; lint, typecheck e build da vitrine sem erro; `tsc` da raiz com os mesmos 50 erros).

**What**: `app/c/[slug]/error.tsx` com "Vitrine temporariamente indisponível." e log `[vitrine] erro` sem dado de linha.
**Where**: `vitrine/app/c/[slug]/error.tsx`
**Depends on**: T16
**Reuses**: `EmptyState`
**Requirement**: VSEG-02

**Done when**:

- [ ] E2E ganha uma rodada com `VITRINE_DATABASE_URL` apontando para host inválido: a mensagem aparece, sem nome de host, SQL ou pilha no HTML
- [ ] Captura real
- [ ] E2E + Build passam

**Tests**: e2e
**Gate**: e2e

**Commit**: `feat(l16): erro da vitrine sem detalhe técnico`

---

### T19: Template grade

**Status**: concluída em 2026-10-10 (hash `11c1751`; lint, typecheck e build da vitrine sem erro; 2 testes novos de `resumoDosAtributos`; o componente é montado e provado na T21).

**What**: Catálogo em grade: faixa "Destaques" (até 6, omitida sem destaque), grade de `ClickableCard` (3 colunas desktop, 1 no celular), estado vazio, "Sobre". Antes: `npx astryx template product-gallery`.
**Where**: `vitrine/src/templates/grade/catalogo-grade.tsx`
**Depends on**: T9, T16
**Reuses**: `product-gallery`, `centered-hero`
**Requirement**: VTEMA-02, VCAT-01

**Done when**:

- [ ] Componente puro de props; montado e provado na T21
- [ ] Build passa

**Tests**: none
**Gate**: build

**Commit**: `feat(l16): template de catálogo em grade`

---

### T20: Template editorial

**Status**: concluída em 2026-10-10 (hash `3eaddf2`; lint, typecheck e build da vitrine sem erro; mesmas props da T19; montado e provado na T21).

**What**: Catálogo editorial: cabeçalho com a foto do primeiro destaque (omitida sem destaque), lista edge-to-edge de linhas, estado vazio, "Sobre". Antes: `npx astryx template side-gallery`.
**Where**: `vitrine/src/templates/editorial/catalogo-editorial.tsx`
**Depends on**: T19
**Reuses**: `side-gallery`; `List`/`ListItem`
**Requirement**: VTEMA-02, VCAT-01

**Done when**:

- [ ] Mesmas props da T19; montado e provado na T21
- [ ] Build passa

**Tests**: none
**Gate**: build

**Commit**: `feat(l16): template de catálogo editorial`

---

### T21: Página de catálogo

**Status**: concluída em 2026-10-10 (hash `44521cf`; e2e 32 de 32; mutantes mortos; capturas `t21-01` a `t21-08` com a largura de rolagem no `validation.md`; lint, typecheck e build da vitrine sem erro; lint da raiz 0 erros e `tsc` com os mesmos 50 erros). `og:image` do catálogo fica para a T24.

**What**: `app/c/[slug]/page.tsx`: lê `?pagina=` dentro de `<Suspense>`, escolhe o template pelo layout, pagina com `Pagination`, `generateMetadata` do catálogo.
**Where**: `vitrine/app/c/[slug]/page.tsx`
**Depends on**: T20, T7
**Reuses**: T7, T9, T19, T20
**Requirement**: VCAT-01, VCAT-02, VTEMA-02, VOG-01, VSEG-01, VCACHE-01

**Done when**:

- [ ] E2E ganha: A com 24 itens na página 1 e 1 na página 2; `pagina=abc` → página 1; ordem destaque → recente → referência; nenhuma referência da B nas páginas da A; loja D (sem imóvel visível) → estado vazio com 200; A em `grade` e B em `editorial` pelos marcadores de cada template; `og:*` do catálogo no `<head>` com UA do WhatsApp; o HTML do catálogo de A em grade traz o mesmo bloco de tema da T16 (o layout envolve a página); nenhuma sentinela no HTML nem no stdout
- [ ] E2E ganha o cache: mudar o preço de um imóvel da A no banco → página ainda antiga; POST com segredo → nova; página da B não reconsultada (contador de consultas da fixture); segredo errado → 401 e página continua antiga
- [ ] Capturas reais em `.specs/features/lote-16b-vitrine-app/capturas/`: grade e editorial, desktop e 375 px, lojas A e B; catálogo vazio; todas com a aba visível; sem rolagem horizontal em 375 px (VTEMA AC9), com a largura de rolagem medida dentro do quadro e registrada no `validation.md`
- [ ] E2E + Build passam

**Tests**: e2e
**Gate**: e2e

**Commit**: `feat(l16): página de catálogo da vitrine`

---

### T22: Composição do imóvel

**Status**: concluída em 2026-10-12 (hash no `git log`; lint, typecheck e build da vitrine sem erro; lint da raiz 0 erros e `tsc` com os mesmos 50; o componente é montado e provado na T23).

**What**: Galeria (`Carousel` + `Lightbox`, espaço reservado sem foto), tipo e bairro, referência, preço, atributos, descrição como texto com quebras, botão de interesse. Antes: `npx astryx template product-detail`.
**Where**: `vitrine/src/item/pagina-item.tsx`
**Depends on**: T8, T9
**Reuses**: `product-detail`
**Requirement**: VITEM-01, VITEM-02

**Done when**:

- [ ] Componente puro de props; `<img>` com `loading="lazy"`, `referrerPolicy="no-referrer"` e `alt` da T9; montado e provado na T23
- [ ] Build passa

**Tests**: none
**Gate**: build

**Commit**: `feat(l16): composição da página de imóvel`

---

### T23: Página de imóvel

**Status**: concluída em 2026-10-12 (hash no `git log`; e2e 43 de 43; 6 mutantes mortos; capturas `t23-01` a `t23-06` com a largura de rolagem no `validation.md`; lint, typecheck e build da vitrine sem erro; lint da raiz 0 erros e `tsc` com os mesmos 50). `og:image` do imóvel sem foto (cartão da loja) fica para a T24.

**What**: `app/c/[slug]/imovel/[ref]/page.tsx`: params em `<Suspense>`, referência inexistente → `notFound()`, `generateMetadata` com a primeira foto ou a imagem da loja.
**Where**: `vitrine/app/c/[slug]/imovel/[ref]/page.tsx`
**Depends on**: T22, T16
**Reuses**: T4, T5, T9, T22
**Requirement**: VITEM-01, VITEM-02, VOG-01, VSEG-01, VSEG-02

**Done when**:

- [ ] E2E ganha: item visível 200 com os campos de VITEM AC1; `AP-0142` e `ap-0142` → mesma página; vendido, reservado e despublicado → página de não encontrado pela URL direta, sem preço nem descrição do imóvel; referência da B sob o slug da A → não encontrado; `<script>` da descrição escapado; `<img>` com os atributos de AC8; link `wa.me` decodificado igual à mensagem da spec; `og:image` = primeira foto, e a imagem da loja no imóvel sem foto; nenhuma sentinela
- [ ] Capturas reais: com fotos e sem foto, desktop e 375 px; galeria aberta
- [ ] E2E + Build passam

**Tests**: e2e
**Gate**: e2e

**Commit**: `feat(l16): página de imóvel da vitrine`

---

### T24: Imagem de compartilhamento da loja

**Status**: concluída em 2026-10-12 (hash no `git log`; e2e 47 de 47; 5 mutantes mortos; capturas `t24-01` a `t24-03`; lint, typecheck e build da vitrine sem erro; lint da raiz 0 erros e `tsc` com os mesmos 50). Fecha o `og:image` do imóvel sem foto da T23.

**What**: `app/c/[slug]/opengraph-image.tsx` com `ImageResponse` 1200×630: nome da loja sobre a cor da loja (o hex literal da loja ou a cor padrão, não o accent derivado; AD-046), sem recurso externo.
**Where**: `vitrine/app/c/[slug]/opengraph-image.tsx`
**Depends on**: T5, T10, T14
**Reuses**: doc de `opengraph-image` em `node_modules/next/dist/docs/`
**Requirement**: VOG-01

**Done when**:

- [ ] E2E ganha: PNG 1200×630 para A e B; nenhuma requisição de saída durante a geração; loja C → sem PNG da loja
- [ ] Captura da imagem gerada para as duas lojas
- [ ] E2E + Build passam

**Tests**: e2e
**Gate**: e2e

**Commit**: `feat(l16): imagem de compartilhamento da loja`

---

### T25: Capturas de fechamento

**Status**: concluída em 2026-10-12 (hash no `git log`; capturas `t25-01` a `t25-14` listadas no `validation.md`, com a largura de rolagem no quadro de 375 px de grade, editorial, item com e sem foto, indisponível, vazio e erro; a fixture não tem loja de cor sem croma).

**What**: Conjunto final de capturas reais com a fixture: os dois layouts × desktop e 375 px × lojas A e B; item com e sem foto; imóvel indisponível; catálogo vazio; erro.
**Where**: `.specs/features/lote-16b-vitrine-app/capturas/`
**Depends on**: T21, T23, T24
**Reuses**: extensão do Chrome
**Requirement**: VTEMA-02

**Done when**:

- [ ] Arquivos versionados no momento da captura (L-054), listados em `validation.md`; capturas com a aba visível; uma loja de cor sem croma, se a fixture tiver, registra a limitação do accent derivado (AD-046)
- [ ] Largura de rolagem ≤ 375 medida no quadro e registrada para catálogo em grade, catálogo editorial, item, imóvel indisponível e catálogo vazio (VTEMA-02 AC9)

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): capturas da vitrine`

---

### T26: README da vitrine

**Status**: concluída em 2026-10-12 (hash no `git log`; sem credencial nem URL: conferido por busca de `://`, `postgres`, `password`, `neon.tech` e `vercel.app` no arquivo).

**What**: Como rodar (`vitrine:dev`, `vitrine:e2e`), variáveis (nomes, nunca valores), regra de não importar de fora, deploy como segundo projeto (L16c), ADs 040–043.
**Where**: `vitrine/README.md`
**Depends on**: T25
**Reuses**: `scripts/vitrine/README.md` (L16a T21)
**Requirement**: VPROJ-01

**Done when**:

- [ ] Nenhuma credencial ou URL real

**Tests**: none
**Gate**: registro

**Commit**: `docs(l16): readme da vitrine`

---

## Phase Execution Map

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 0:  T0
Phase 1:  T1 → T2 → T3 → T4 → T5
          T1 → T6
Phase 2:  T1 → T7
          T1 → T8
          T1 → T9
          T1 → T10
          T2 → T10
          T2 → T11 → T12
Phase 3:  T13 → T14
Phase 4:  T15 → T16 → T17
          T16 → T18
          T19 → T20 → T21
          T22 → T23
          T24
Phase 5:  T25 → T26
```

Execução estritamente sequencial, na ordem numérica.

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T0 | None | — | ✅ |
| T1 | T0 | T0 → T1 | ✅ |
| T2 | T1 | T1 → T2 | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | T3 | T3 → T4 | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | T1 | T1 → T6 | ✅ |
| T7–T9 | T1 | T1 → T7, T8, T9 | ✅ |
| T10 | T1, T2 | T1 → T10, T2 → T10 | ✅ |
| T11 | T2 | T2 → T11 | ✅ |
| T12 | T11 | T11 → T12 | ✅ |
| T13 | T0 | T0 → T13 | ✅ |
| T14 | T13, T12 | T13 → T14, T12 → T14 | ✅ |
| T15 | T8 | T8 → T15 | ✅ |
| T16 | T15, T5, T10, T14 | T15 → T16, T5 → T16, T10 → T16, T14 → T16 | ✅ |
| T17 | T16 | T16 → T17 | ✅ |
| T18 | T16 | T16 → T18 | ✅ |
| T19 | T9, T16 | T9 → T19, T16 → T19 | ✅ |
| T20 | T19 | T19 → T20 | ✅ |
| T21 | T20, T7 | T20 → T21, T7 → T21 | ✅ |
| T22 | T8, T9 | T8 → T22, T9 → T22 | ✅ |
| T23 | T22, T16 | T22 → T23, T16 → T23 | ✅ |
| T24 | T5, T10, T14 | T5 → T24, T10 → T24, T14 → T24 | ✅ |
| T25 | T21, T23, T24 | T21 → T25, T23 → T25, T24 → T25 | ✅ |
| T26 | T25 | T25 → T26 | ✅ |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T0 | registro | none | none | ✅ |
| T1 | Config do projeto + isolamento | unit | unit | ✅ |
| T2 | Paridade | unit | unit | ✅ |
| T3 | Paridade com o banco | integration | integration | ✅ |
| T4 | Consultas e conexão | integration + unit | integration + unit | ✅ |
| T5 | Camada de cache | unit | unit | ✅ |
| T6 | Script de dev | unit | unit | ✅ |
| T7–T11 | Lib pura | unit | unit | ✅ |
| T12 | Rota de revalidação | unit | unit | ✅ |
| T13 | Script de prova | integration | integration | ✅ |
| T14 | Harness e2e | e2e | e2e | ✅ |
| T15, T19, T20, T22 | Componente montado por rota | none (build) + e2e na rota seguinte | none | ✅ — merge forward para T16, T21 e T23, a primeira task em que o componente é servido |
| T16–T18, T21, T23, T24 | Rotas | e2e | e2e | ✅ |
| T25, T26 | Capturas e docs | none | none | ✅ |

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | Esqueleto do projeto (config, layout raiz, não encontrado neutro) + exclusões na raiz | ⚠️ coeso: nenhum arquivo dele builda sozinho |
| T4 | Consultas + conexão | ⚠️ coeso: o teste das consultas precisa da fábrica de conexão da própria vitrine |
| T10 | Tema + mapa de fontes | ⚠️ coeso: o mapa só alimenta o tema; são dois arquivos porque `next/font` não carrega no Vitest |
| Demais | 1 arquivo | ✅ |

## Requirement Coverage

| Requirement | Tasks |
| --- | --- |
| VPROJ-01 | T0, T1, T4, T6, T26 |
| VPROJ-02 | T2, T3 |
| VCAT-01 | T8, T9, T16, T19, T20, T21 |
| VCAT-02 | T4, T7, T21 |
| VCAT-03 | T7, T14, T16 |
| VITEM-01 | T4, T7, T9, T22, T23 |
| VITEM-02 | T8, T17, T22, T23 |
| VSEG-01 | T3, T4, T13, T21, T23 |
| VSEG-02 | T13, T14, T18, T23 |
| VTEMA-01 | T0, T10, T16 |
| VTEMA-02 | T19, T20, T21, T25 |
| VLEGAL-01 | T8, T15, T16 |
| VOG-01 | T0, T9, T21, T23, T24 |
| VCACHE-01 | T0, T1, T5, T21 |
| VCACHE-02 | T11, T12, T14 |
| VSEO-01 | T1, T14 |
