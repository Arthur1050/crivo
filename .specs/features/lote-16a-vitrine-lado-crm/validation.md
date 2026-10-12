# Lote 16a — Validação

## Registro do gate de viabilidade (T0, 2026-10-09)

Executado na branch `test` do Neon (banco de teste, AD-033), como `neondb_owner` (sem superusuário). Papel de prova `krivo_vitrine_gate`, criado e removido na mesma execução; schema `vitrine` de prova criado e removido. Nenhuma URL, senha ou chave foi impressa ou registrada: a senha do papel de prova era aleatória, só existiu em memória e em arquivo temporário apagado.

| ID | Fato | Fonte e comando (sem credencial) | Resultado |
| --- | --- | --- | --- |
| F1 | Papel criado por SQL fica isolado | `create role ... login password ...` pelo dono; `pg_has_role(papel, 'neon_superuser', 'member')`; `pg_auth_members`; `information_schema.role_table_grants`; `has_table_privilege(papel, tabela, 'select')` nas 25 tabelas de `public`; login real e `select` em 9 tabelas | **Passou.** Membro de `neon_superuser`: não. Associações a papéis: 0. Grants em `role_table_grants` antes de grant explícito: 0. Tabelas de `public` com `SELECT`: 0 de 25. `rolsuper`, `rolcreaterole`, `rolcreatedb`, `rolbypassrls`: todos falsos. `SELECT` em `leads`, `messages`, `conversations`, `users`, `sessions`, `accounts`, `tenants`, `properties`, `tenant_api_keys`: `42501` em todas. |
| F2 | Papéis são por branch | `select count(*) from pg_roles where rolname = ...` na base e nos 4 workers | **Passou.** O papel criado na `test` não existe em nenhum dos 4 workers (`test-worker-1` a `4`). Aplicar o SQL por alvo é necessário e basta; T10 já prevê isso. |
| F3 | O papel faz login pelo pooler com a URL base trocando usuário e senha | `new Client(url com usuário e senha trocados).connect()`; `select current_user` | **Passou.** O host da URL base é `-pooler`; `current_user` = papel de prova. T7 e T9 usam o mesmo endpoint. |
| F4 | `default_transaction_read_only`, `statement_timeout` e `security_barrier` aceitos | `show server_version`; `alter role ... set ...`; `show` em sessão nova; escrita; `create view ... with (security_barrier = true)` e `pg_class.reloptions` | **Passou.** Postgres 17.11. Sessão do papel: `default_transaction_read_only = on`, `statement_timeout = 5s`; `create table` recusado com `25006`; `reloptions = {security_barrier=true}`. |
| F5 | `drizzle-kit push` ignora o schema `vitrine`; alterar coluna usada por view falha | Push real na branch `test` com `vitrine.gate_v` (view sobre `public.properties`) presente; `alter table ... alter column neighborhood type varchar(500)` numa transação revertida | **Passou nos dois pontos.** O push não citou o schema `vitrine` (`schemaFilter: ["public"]`). O `alter` com a view presente falhou com `0A000 cannot alter type of a column used by a view or rule`. Confirma a ordem drop → push → apply do design (T10). |
| F7 | `after()` funciona em Server Action no Next 16.2.11 | `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`, linha 8 | **Passou.** A doc lista "Server Functions" entre os usos permitidos. |

### Achado do gate (não bloqueia, afeta T1 e T10)

O `drizzle-kit push` na branch `test` termina com `error: relation "leads_tenant_id_id_idx" already exists` (`42P07`) **e código de saída 0**, com ou sem a view de prova presente. É a quirk já registrada no Handoff do L15 (o `push` não enxerga índices únicos e tenta recriá-los) somada ao L-068 (saída 0 com falha). Consequências para o lote:

- A T1 não pode confiar no código de saída do push nem na ausência de erro: confere o estado final em `pg_constraint` e `information_schema.columns` em todos os alvos.
- A T10 precisa de conferência de estado final (já prevista) e não pode tratar saída 0 como sucesso.
- Se o erro abortar as instruções que vêm depois do índice, a T1 detecta pela conferência e corrige a causa antes de seguir.

### Linha de base do `tsc`

`npx tsc --noEmit -p .` na `main` em `803ef9c`, antes de qualquer mudança do lote: **50 erros** (saída 1), todos preexistentes (o lote 14b registrou o mesmo total). Critério do build gate nas tasks de código: nenhum erro novo além desses 50, e nenhum nos arquivos que a task altera.

### Estado após o gate

Papel `krivo_vitrine_gate` removido (`pg_roles` = 0) e schema `vitrine` inexistente na base de teste. Workers não foram tocados. Nada fora dos bancos de teste.

---

## Verificação independente (Verifier, 2026-10-09)

**Veredito: PASS**

- **Intervalo**: `803ef9c..606bd80` (24 commits: T0–T21, o fix `2e120e6` e o handoff `5dfcc23`). Verifier independente (autor ≠ verificador), derivado da spec; nenhum código ou teste alterado.
- **Spec-anchored**: 53/53 ACs e 6/6 Edge Cases com evidência `arquivo:linha`; 0 lacuna de precisão bloqueante (2 observações abaixo).
- **Sensor**: 29 mutantes, 28 mortos, 1 sobrevivente (M27, fora dos ACs e dos 8 alvos obrigatórios). Os 8 alvos obrigatórios (10 mutações) morreram.
- **Gates**: `tsc` 50 erros (= linha de base, nenhum em arquivo do lote); `npx eslint` saída 0. Full não rodada aqui (o orquestrador já rodou: 219 arquivos, 3680 testes verdes).
- **Árvore**: `git status --porcelain` e `git diff --stat` idênticos à linha de base registrada antes do sensor (só os 4 arquivos preexistentes de fora do lote). Banco de teste base restaurado: `verifyVitrineState(base)` = `[]`.

### Tarefas

T0–T21 marcadas Done em `tasks.md`, cada uma com commit no intervalo (T21 = `606bd80`, sem hash anotado na linha de status). Nenhum commit do intervalo traz `Co-Authored-By`, "Generated with" ou marca de atribuição (`git log 803ef9c..HEAD --format=%B`). `vitrine/` não existe.

### Spec-anchored: critérios de aceitação

Abreviações: `SV` = `src/db/__tests__/schema-vitrine.test.ts`; `V` = `src/db/__tests__/vitrine-views.test.ts`; `P` = `src/db/__tests__/vitrine-privilegios.test.ts`; `D` = `scripts/__tests__/test-db-push.test.ts`; `L` = `src/lib/__tests__/storefront.test.ts`; `C` = `src/lib/__tests__/storefront-contract.test.ts`; `DAL` = `src/server/data/__tests__/storefront.test.ts`; `PF` = `src/server/data/__tests__/properties-featured.test.ts`; `PA` = `src/server/__tests__/properties-actions.test.ts`; `SA` = `src/server/__tests__/storefront-actions.test.ts`; `SS` = `src/server/__tests__/settings-storefront-actions.test.ts`; `R` = `src/server/storefront/__tests__/revalidation.test.ts`; `SC` = `src/server/storefront/__tests__/schedule.test.ts`; `INT` = `src/server/integration/__tests__/properties.test.ts`; `SEED` = `src/db/__tests__/seed.test.ts`.

#### VCFG-01 / VCFG-02 — Dados da vitrine

| AC | Desfecho da spec | Evidência (`arquivo:linha` — asserção) | Resultado |
| --- | --- | --- | --- |
| Dados AC1 | PK `tenant_id` → `tenants`, cascata | `SV:53` — `expect(pk...attname).toEqual(["tenant_id"])`; `SV:80` — linha some após `delete tenants` (`toHaveLength(0)`) | ✅ |
| Dados AC2 | colunas ativa…endereço + `updated_at` | `SV:45` — `expect(names).toEqual(["about","accent_color","active","address","creci","font","headline","instagram","layout","legal_name","phone","tenant_id","updated_at"])` | ✅ |
| Dados AC3 | padrões `false`/`grade`/`inter` | `SV:60-62` — `row.active toBe(false)`, `row.layout toBe("grade")`, `row.font toBe("inter")`; `C:16-17` enums = contrato | ✅ |
| Dados AC4 | sem linha → inativa com padrões, sem criar linha | `DAL:48-54` — `toEqual({tenantId, active:false, layout:"grade", ..., updatedAt:null})` e `rowOf → toHaveLength(0)` | ✅ |
| Dados AC5 | cor inválida → recusa no campo `cor` | `L:65` — `refusal({accentColor}).field toBe("cor")` p/ `#ABC`, `vermelho`, `#aabbc`, `#aabbccd`, `aabbcc`, `#gggggg`; `SA:126-131` recusa `cor` e banco inalterado | ✅ |
| Dados AC6 | cor válida em minúsculas | `L:71` — `accentColor toBe("#aabbcc")`; `SA:166-167` gravado `#aabbcc` | ✅ |
| Dados AC7 | limites 40/120/120/1500/200 → recusa no campo | `L:90-96` — limite aceito (`toBe("a".repeat(max))`) e `max+1` → `over.field toBe(field)` para `creci`, `razaoSocial`, `titulo`, `sobre`, `endereco` | ✅ |
| Dados AC8 | Instagram fora de `[a-z0-9._]{1,30}` → `instagram` | `L:113-114` (30 aceito, 31 → `instagram`); `L:117-118` (5 formatos inválidos) | ✅ |
| Dados AC9 | telefone ≠ 10..13 dígitos → `telefone` | `L:125,127` (10 e 13 aceitos, normalizados); `L:131-132` (9 e 14 → `telefone`) | ✅ |
| Dados AC10 | vazio/espaços → nulo | `L:145-152` — `toEqual({ok:true, value:{... creci:null ... address:null}})` para `""`, `"   "`, `null`, `undefined` | ✅ |
| Dados AC11 | falha → nada gravado | `L:159` (recusa sem `value`); `SA:131` `getStorefront toEqual(before)`; `DAL:105-109` falha injetada no upsert → `toEqual(before)` (L-002) | ✅ |
| Dados AC12 | check de identidade ativa e de formato da cor no banco | `SV:89` (CRECI nulo/vazio/espaços → `"23514"`), `SV:101` (razão social), `SV:111-113` (update recusado, linha continua inativa), `SV:132` (cor → `"23514"`), `SV:145` (dois checks em `pg_constraint`) | ✅ |

#### VATIV-01 — Ativação

| AC | Desfecho da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | CRECI vazio → `creci` | `L:194` — `toEqual(["creci"])`; `SA:149` — `errors.map(field) toEqual(["creci"])` | ✅ |
| AC2 | razão social vazia → `razaoSocial` | `L:198`; `SA:152` — `toEqual(["razaoSocial"])` | ✅ |
| AC3 | WhatsApp do agente vazio → `whatsappAgente` | `L:202`; `SA:156` — `toEqual(["whatsappAgente"])` | ✅ |
| AC4 | todas, na ordem CRECI → razão → WhatsApp | `L:206-208`, `L:212-217`; `SA:141` — `toEqual(["creci","razaoSocial","whatsappAgente"])` e `SA:142` nada gravado | ✅ |
| AC5 | ativa + apagar CRECI/razão → recusa | `DAL:117-121` — `toEqual({ok:false, reason:"identidade-incompleta"})` p/ 4 variações e `toEqual(before)`; `SA:148-152` na action | ✅ |
| AC6 | ativa + WhatsApp vazio nas configurações → recusa no campo, nada gravado | `SS:102-110` — `toEqual({ok:false, error:"Desative a vitrine antes de remover o WhatsApp do agente.", field:"agentWhatsapp"})`, `name`, `city` e `agentWhatsapp` inalterados | ✅ |
| AC7 | desativar sem exigir outro campo | `SA:184-185` — `{ok:true}` e `toMatchObject({active:false, creci:null, legalName:null})`; `DAL:128-129` | ✅ |

#### VBANCO-01/02/03 — Fronteira de banco

| AC | Desfecho da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | schema `vitrine`, 2 views com `security_barrier` | `V:97-98` — `[["imoveis","v"],["lojas","v"]]` e `reloptions toContain("security_barrier=true")` | ✅ |
| AC2 | colunas de `lojas`, na ordem | `V:106` (`information_schema.columns` por `ordinal_position` = contrato) + `C:21` (lista literal da spec) | ✅ |
| AC3 | colunas de `imoveis`, na ordem | `V:106` + `C:29` | ✅ |
| AC4 | só loja ativa, com CRECI, razão e WhatsApp | `V:121` — só `complete.slug` entre completa, sem WhatsApp (nulo e espaços), inativa e sem linha; `V:130-148` valor de cada coluna | ✅ |
| AC5 | só `disponivel` E publicado, de loja visível | `V:160` (6 combinações → só 1); `V:168` (loja inativa/sem WhatsApp → `[]`); `V:176-193` valores | ✅ |
| AC6 | papel com login, read-only, 5s, USAGE, SELECT só nas views | `P:137-139` (`rolcanlogin`, `rolconfig` contém `default_transaction_read_only=on` e `statement_timeout=5s`); `P:152` USAGE; `P:170` grants | ✅ |
| AC7 | papel lê as duas views | `P:89`, `P:94` — conectado como `krivo_vitrine`, `rows toEqual([{slug}])` / `[{referencia:"PRV-1"}]` | ✅ |
| AC8 | `SELECT` nas 10 tabelas → `42501` | `P:100` — `it.each(TABLES_DENIED)`, `codeOf(...) toBe("42501")`, uma por tabela (lista em `P:16-19` = as 10 da spec) | ✅ |
| AC9 | `INSERT/UPDATE/DELETE` nas views recusados | `P:119` — código ∈ {`25006`,`42501`,`55000`} p/ 3 verbos × 2 views; `P:127-128` nada escrito. A spec diz só "recusar" (sem código), então a asserção por conjunto está no nível da spec | ✅ |
| AC10 | não é membro de papel algum | `P:157` (`neon_superuser` = false), `P:160` (`pg_auth_members` = 0), `P:163` atributos elevados falsos | ✅ |
| AC11 | exatamente 2 linhas em `role_table_grants` | `P:170-173` — `toEqual([{vitrine, imoveis, SELECT}, {vitrine, lojas, SELECT}])`; `P:182` nenhum privilégio de coluna em `public` | ✅ |
| AC12 | `db:push:test`: drop → push → apply, por alvo, nessa ordem | `D:40-44` — `calls toEqual([drop, push, apply, verify] × 3 alvos)`; parada no 1º erro `D:53-55`, `D:70-71` | ✅ |
| AC13 | 2ª execução = mesmo estado, sem erro | `V:243-248` (aplicar 2× não duplica checks nem muda views); `D:125` `verifyVitrineState(url) toEqual([])` no estado deixado pelo `db:push:test`; `V:256-268` recria check removido | ✅ |
| AC14 | paridade contrato × view (≤ 3 visíveis) | `V:283-288` — 3 linhas, `search.total toBe(viewRows.length)`, mesmas referências | ✅ |

#### VREV-01/02 — Aviso de revalidação

| AC | Desfecho da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | `POST <URL>/api/revalidar`, `Bearer <segredo>`, corpo só `slug` | `R:31-35` — URL exata, `method toBe("POST")`, `Authorization toBe("Bearer ...")`, `body toBe('{"slug":"imob-x"}')` | ✅ |
| AC2 | sem URL/segredo → nada enviado, 1 `info` `[vitrine]`+slug, `ignorado` | `R:58-63` — `"ignorado"`, `fetchMock not.toHaveBeenCalled`, `info` 1×, contém `[vitrine]` e `imob-x` | ✅ |
| AC3 | não-2xx → `warn` com prefixo, slug, status; `falhou` | `R:72-77` (500, 401, 302) | ✅ |
| AC4 | erro ou > 3 s → `warn` com nome do erro; `falhou` | `R:88-92` (`TypeError`); `R:100-109` (2999 ms sem warn, 3000 ms → `falhou`, sinal abortado, `TimeoutError`) | ✅ |
| AC5 | sem repetição | `R:117`, `R:121`, `R:128` — `toHaveBeenCalledTimes(1)` em 500, rejeição e timeout | ✅ |
| AC6 | nunca lança | `R:135-148` — `resolves.toBe("falhou"/"ignorado")` com fetch síncrono que lança, rejeição não-Error e logger que lança | ✅ |
| AC7 | segredo nunca em log | `R:172-175` — `not.toContain(SECRET)` e `not.toContain("Bearer")` em 5 desfechos | ✅ |
| AC8 | escrita de imóvel com sucesso agenda com o tenant dono | `PA:572-573`, `:579-580`, `:586-587`, `:593-594`, `:600-601` (criar, editar, excluir, publicar, status) — `toHaveBeenCalledTimes(1)` + `toHaveBeenCalledWith(tenantId)`; destaque `PA:687-688`, `:700-701`; slug do tenant: `SC:45` `request toHaveBeenCalledWith("imob-x")` após `getTenantSlug(TENANT)` | ✅ |
| AC9 | salvar vitrine/configurações agenda | `SA:171-172`, `SA:186-187`; `SS:155-156`; ordem grava → agenda `SS:203` | ✅ |
| AC10 | recusa por validação/permissão não agenda | `PA:615`, `:622`, `:633`, `:642`, `:660` (validação, inexistente, corretor nas 5 actions); `PA:712`, `:725`, `:738`; `SA:111`, `:132`, `:143`, `:157`; `SS:111`, `:167`, `:178`, `:189` — `scheduled not.toHaveBeenCalled()` | ✅ |
| AC11 | as duas variáveis vazias no env do Vitest | `R:183-184` — `env.VITRINE_PUBLIC_URL toBe("")`, `env.VITRINE_REVALIDATE_SECRET toBe("")`; `R:188-193` ambiente do teste vazio e `fetch` global não chamado | ✅ |

#### VDEST-01 — Destaques

| AC | Desfecho da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | `properties.featured` booleano, padrão `false` | `SV:155` — `toEqual([{data_type:"boolean", is_nullable:"NO", column_default:"false"}])`; `PF:64` | ✅ |
| AC2 | gravar valor e atualizar `updated_at` | `PF:71-80` — `featured toBe(true/false)` e `updatedAt > longAgo` nos dois sentidos; `PF:88` nenhum outro campo muda; `PA:686` via action | ✅ |
| AC3 | sem `imoveis:escrever` → recusa sem gravar | `PA:710-711` — `toEqual({ok:false, error:"Sem permissão para escrever imoveis."})` e `featured toBe(false)` | ✅ |
| AC4 | outro tenant = inexistente, intocado | `PF:96-102` — `toBe(false)` e `read(foreign) toEqual(before)`; `PA:723-724` — `{ok:false, error:"Imóvel não encontrado."}` e intocado | ✅ |
| AC5 | sem teto | `PF:113-115` — 7 destaques aceitos | ✅ |
| AC6 | busca do contrato `/api/v1` sem destaque | `INT:332-333` — `not.toHaveProperty("featured")` e `("destaque")` com imóvel em destaque presente (`INT:327`, `:330`) | ✅ |

#### VUI-01/02 — Telas (matriz do lote: build + captura real; lógica na lib com unit)

| AC | Desfecho da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | seção "Vitrine" com todos os campos | `app/(crm)/configuracoes/page.tsx:102-120`; `src/components/settings/storefront-form.tsx:150-326`; captura `t18-01`, `t18-02` | ✅ |
| AC2 | somente leitura sem `configuracoes:escrever` | `page.tsx:119` (`canWrite={can(roles,"configuracoes","escrever")}`), `storefront-form.tsx:158` e demais `isDisabled={!canWrite}`, `:329-345` sem botão. Sem captura: nenhum papel da matriz (`src/lib/permissions.ts:51,63,74`) tem `ler` sem `escrever`, então o estado é inalcançável hoje (observação 1) | ✅ (código) |
| AC3 | lista de pré-condições junto à ativação | `storefront-form.tsx:90,162-176` (rótulos da lib, ordem testada em `L:206`); capturas `t18-01`, `t18-02` (3 bloqueios) | ✅ |
| AC4 | ativa + URL → link `<URL>/c/<slug>` | `storefront-form.tsx:91,178-182`; capturas `t18-06`, `t18-07` ("Abrir vitrine") | ✅ |
| AC5 | recusa junto a cada campo, valores mantidos | `storefront-form.tsx:105-119` (`setErrors` por campo, estado não é limpo); capturas `t18-03` ("vermelho" mantido + mensagem no campo), `t18-04`/`t18-05` (CRECI, razão, WhatsApp), `t18-08` (WhatsApp nas configurações) | ✅ |
| AC6 | formulário oferece destaque a quem tem `imoveis:escrever` | `src/components/properties/property-form-dialog.tsx:352-357` (só na edição; o diálogo só abre via ações com `canWrite`, `properties-table.tsx:182`); captura `t19-01` | ✅ |
| AC7 | lista indica destaque | `src/components/properties/properties-table.tsx:121` (`Token "Destaque"`); capturas `t19-02` (gestor), `t19-03` (corretor, sem ação nem Configurações) | ✅ |
| AC8 | só Astryx, sem `<div>` nem `style` | `git diff 803ef9c..HEAD -- app src/components` sem `<div`, `<span`, `style=` nem valor arbitrário nas linhas acrescentadas | ✅ |

#### VSEED-01 — Seed

| AC | Desfecho da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | 1ª imobiliária ativa e completa; 2ª inativa | `SEED:744-766` — `toMatchObject({active:true, ..., creci:"CRECI-MG 12345-J", ...})`, segunda `active toBe(false)`; `SEED:773` só a 1ª em `vitrine.lojas` | ✅ |
| AC2 | ≥ 1 destaque visível e 1 não visível da ativa | `SEED:786-787` — `["IM-0001"]` e `["IM-0004"]`; nenhum destaque fora da 1ª | ✅ |
| AC3 | duas execuções = mesmas linhas e destaques | `SEED:805` — `expect(await snapshot()).toEqual(before)` após `runSeed()` | ✅ |

#### Edge Cases

| Edge Case | Evidência | Resultado |
| --- | --- | --- |
| slug ilegível → `warn`, nada enviado | `SC:54-55` (nulo) e `SC:66-68` (leitura falha) — `request not.toHaveBeenCalled()`, `warn` 1× com `[vitrine]` | ✅ |
| `#AABBCC` → `#aabbcc` | `L:71`; `SA:167` | ✅ |
| `@Imobiliaria.X` → `imobiliaria.x` | `L:108`; `SA:169` | ✅ |
| ativa com tudo vendido: loja sim, imóveis não | `V:202-203` | ✅ |
| exclusão da imobiliária em cascata | `SV:80` | ✅ |
| desativada → nenhum imóvel na view | `V:213-214` | ✅ |

#### Asserções preexistentes (L-055)

`git diff 803ef9c..HEAD` nos 5 arquivos de teste preexistentes tocados só acrescenta linhas: `properties-actions.test.ts` (+mock, +import, +2 blocos `describe`), `properties.test.ts` da integração (+1 `it`), `seed.test.ts` (+import, +1 `describe`), `actions.test.ts` (+mock), `test-connection.test.ts` (import ampliado em 1 linha, a única alteração, +1 `describe`). Nenhuma asserção existente mudou.

#### Outras conferências

- **Consumidor de produção da action de destaque (L-021)**: `src/components/properties/property-form-dialog.tsx:247` chama `setPropertyFeaturedAction`; `storefront-form.tsx:112` chama `saveStorefrontAction`.
- **Contrato**: `STOREFRONT_VIEW_COLUMNS` (`src/lib/storefront-contract.ts:27`) = listas literais da spec (`C:21`, `C:29`) = colunas reais das views (`V:106`); `STOREFRONT_LAYOUTS`/`STOREFRONT_FONTS` = `enumValues` do schema (`C:16-17`).
- **Commit de fix `2e120e6`**: restaura o índice `document_categories_tenant_id_lower_name_idx` depois do push. Ordem e parada testadas com simuladores (`D` bloco "índice que o drizzle-kit push derruba") e a recriação idempotente contra o banco real; a ligação em `realSteps` não é testada (M27, abaixo).
- **Commit de handoff `5dfcc23`**: só `STATE.md` (+3 linhas), consistente com os hashes do intervalo.

### Sensor de discriminação

Cópia de cada arquivo fora do repositório antes de cada mutação, uma mutação por vez, restauração antes da próxima e `git diff --quiet -- <arquivo>` confirmando identidade com o HEAD após cada uma. Mutações no SQL: aplicadas no banco base pelo `beforeAll` de `V`; depois de restaurar, `V` foi rodado de novo para reaplicar o SQL correto, e GRANT/`set` do papel foram desfeitos à mão (script temporário fora do repositório). Um processo de teste por vez.

| # | Mutação | Arquivo | Testes que mataram | Resultado |
| --- | --- | --- | --- | --- |
| M1a | `vitrine.imoveis` sem `and p.published` (alvo 1) | `scripts/vitrine/vitrine.sql:106` | `V` (AC5 combinações; AC14 paridade) | ✅ morto |
| M1b | `vitrine.imoveis` sem `p.status = 'disponivel'` (alvo 1) | `scripts/vitrine/vitrine.sql:106` | `V` (AC5; vendidos; vendido some; AC14) | ✅ morto |
| M2 | `vitrine.lojas` sem a condição de WhatsApp (alvo 2) | `scripts/vitrine/vitrine.sql:80` | `V` (corte de loja AC4; imóveis de loja sem WhatsApp) | ✅ morto |
| M3 | `grant select on public.properties to krivo_vitrine` (alvo 3) | `scripts/vitrine/vitrine.sql:130` | `P` (`public.properties` → 42501; AC11 grants; privilégio de coluna) **e** `D` (`verifyVitrineState = []`); `V` sozinho passa | ✅ morto |
| M4 | `default_transaction_read_only = off` (alvo 4) | `scripts/vitrine/vitrine.sql:126` | `P:137-139` (`rolconfig`) e `D` (conferência do estado) | ✅ morto |
| M5 | `deletePropertyAction` sem agendar (alvo 5) | `src/server/actions/properties.ts:338` | `PA:583` | ✅ morto |
| M6a | agenda na recusa por validação de `setPropertyStatusAction` (alvo 6) | `src/server/actions/properties.ts:386` | `PA:625` | ✅ morto |
| M6b | agenda na recusa por permissão de `deletePropertyAction` (alvo 6) | `src/server/actions/properties.ts:328` | `PA:647` | ✅ morto |
| M6c | agenda na recusa por validação de área em `updatePropertyAction` | `src/server/actions/properties.ts:259` | `PA:618` | ✅ morto |
| M7 | `ACTIVATION_ORDER` trocada (razão antes de CRECI) (alvo 7) | `src/lib/storefront.ts:193` | `L:205`, `L:220`; `SA:135` | ✅ morto |
| M8 | log de não-2xx com `auth=${secret}` (alvo 8) | `src/server/storefront/revalidation.ts:78` | `R:153` (AC7) | ✅ morto |
| M9 | limite do CRECI 40 → 41 | `src/lib/storefront.ts:64` | `L:90` (caso `creci`) | ✅ morto |
| M10 | check do banco `trim(creci) <> ''` em vez de `nullif(trim(...))` | `scripts/vitrine/vitrine.sql:39` | `V:251` (check recriado aceita CRECI nulo) e `SV:83`, `:95`, `:105` | ✅ morto |
| M11 | `setPropertyFeatured` sem filtro de tenant | `src/server/data/index.ts:913` | `PF:91`; `PA:715` | ✅ morto |
| M12 | upsert sem `updatedAt` no `set` | `src/server/data/storefront.ts:78` | `DAL:66` | ✅ morto |
| M13 | WhatsApp apagável com vitrine ativa (`if (false && storefront.active)`) | `src/server/actions/settings.ts:135` | `SS:93` (3 variações) | ✅ morto |
| M14 | timeout 3000 → 30000 | `src/server/storefront/revalidation.ts:15` | `R:95`, `R:114`, `R:153` | ✅ morto |
| M15 | agendamento sem checar slug nulo | `src/server/storefront/schedule.ts:21` | `SC:48` | ✅ morto |
| M16 | cor sem `toLowerCase` | `src/lib/storefront.ts:84` | `L:24`, `L:69`, `L:170`; `SA:146`, `:160`, `:176`, `:190` | ✅ morto |
| M17 | telefone até 14 dígitos | `src/lib/storefront.ts:74` | `L:130` | ✅ morto |
| M18 | action da vitrine pula os bloqueios de ativação | `src/server/actions/storefront.ts:59` | `SA:135`, `SA:146` | ✅ morto |
| M19 | 3xx tratado como sucesso (`> 299` → `> 399`) | `src/server/storefront/revalidation.ts:77` | `R:68` (302) | ✅ morto |
| M20 | configurações sem agendar no sucesso | `src/server/actions/settings.ts:166` | `SS:149`, `SS:192` | ✅ morto |
| M21 | action de destaque sem a guarda de permissão | `src/server/actions/properties.ts:417` | `PA:704` | ✅ morto |
| M22 | `verifyVitrineState` não aponta grant inesperado | `scripts/vitrine/apply.ts:114` | `D` ("GRANT a mais em public.properties") | ✅ morto |
| M23 | `pushToTargets` segue apesar de problema na conferência | `scripts/test-db-push.ts:101` | `D:59` | ✅ morto |
| M24 | `STOREFRONT_VIEW_COLUMNS.lojas` com `telefone`/`endereco` trocados | `src/lib/storefront-contract.ts:42-43` | `C:21`; `V:101` | ✅ morto |
| M25 | seed marca destaque em todas as imobiliárias | `src/db/seed.ts:906` | `SEED:776`, `SEED:794` | ✅ morto |
| M26 | action da vitrine agenda duas vezes | `src/server/actions/storefront.ts:82` | `SA:160`, `SA:176` | ✅ morto |
| M27 | `realSteps` sem `restoreIndexes` (fix `2e120e6`) | `scripts/test-db-push.ts:117` | — `D` passou 14/14 | ❌ **sobreviveu** |
| M28 | `vitrine.imoveis` sem `security_barrier` | `scripts/vitrine/vitrine.sql:85` | `V:92` (AC1) | ✅ morto |

**Profundidade**: expandida (P0: fronteira de segurança). **Resultado**: 28/29 mortos; os 8 alvos obrigatórios (M1a, M1b, M2, M3, M4, M5, M6a, M6b, M7, M8) todos mortos. Alvo 3 morto por `P` e por `D`.

**Restauração do banco base**: após M3/M4/M10/M28, `V` rodou com o SQL correto (13/13), o script temporário fez `revoke select on public.properties from krivo_vitrine` e `alter role krivo_vitrine set default_transaction_read_only = on`, e conferiu: grants = `vitrine.imoveis:SELECT, vitrine.lojas:SELECT`; `rolconfig` = `default_transaction_read_only=on, statement_timeout=5s`; checks com a definição `NULLIF(TRIM(...))` original. Após M25, `SEED` rodou de novo com o seed correto (35/35). Por fim `P` 26/26, `D` 14/14, `SV` 10/10 e `verifyVitrineState(base)` = `[]` (arquivo temporário na raiz, apagado em seguida).

### Gates

- `npx tsc --noEmit -p .`: saída 1, **50** `error TS` (= linha de base da T0). Todos em 10 arquivos de teste preexistentes (`context-post`, `properties-get`, `settings-get`, `processing*`, `context-get-removed`, `openapi`, `e2e-smoke`, `upload-route`, `storage`); nenhum em arquivo do intervalo.
- `npx eslint`: saída 0.
- Testes pontuais rodados pelo Verifier (um processo por vez, banco base): `V` 13, `P` 26, `D` 14, `SV` 10, `SEED` 35 verdes no estado restaurado; os demais arquivos verdes como linha de base das mutações. Full: não rodada (orquestrador: 219 arquivos, 3680 testes).

### Lacunas (ordenadas)

1. **M27 sobreviveu (menor, fora dos ACs)**: nenhum teste prova que `realSteps()` (`scripts/test-db-push.ts:114-127`) liga `restoreIndexes`; como a etapa é opcional em `PushSteps`, apagar a linha 117 passa na suíte e o `db:push:test` volta a perder o índice único de categoria em silêncio (o `verifyVitrineState` também não confere esse índice). **Correção sugerida**: exportar `realSteps` (ou tornar `restoreIndexes` obrigatório no tipo) e afirmar `realSteps().restoreIndexes === restoreDrizzleBlindIndexes`, ou incluir o índice na conferência do estado final. Lição **candidata** L-069 registrada (`lessons.py add`, sinal `surviving_mutant`); promoção é decisão do usuário (AD-028).

### Observações

1. **VUI-01 AC2 sem captura**: o modo somente leitura é inalcançável com a matriz atual (gestor/administrador têm `ler` e `escrever`, corretor não tem nenhum dos dois). A evidência é o código (`page.tsx:119`, `isDisabled={!canWrite}` em todos os campos, sem botão). A tela fica sem prova visual até existir um papel com só `ler`.
2. **Asserções de sessão atrás do pooler não discriminam M4**: com o papel em `default_transaction_read_only = off`, `P:142-148` (`show default_transaction_read_only` e `create temp table` → `25006`) continuaram passando, porque o pooler do Neon reaproveita a conexão de servidor aberta antes da mudança. Quem matou M4 foi a asserção de catálogo `P:133-140`. AC6 continua coberto; só não convém tratar a asserção de sessão como prova do `set` do papel.
3. **VREV-02 AC8 "despublicado"** usa o mesmo caminho de `setPropertyPublishedAction` que "publicado"; só `published: true` é testado (`PA:590`). Mesma linha de código, sem risco prático.
4. **Capturas inspecionadas** (11 jpg em `capturas/`): T18 mostra a seção vazia com os 3 bloqueios (desktop e 375 px), recusa de cor com o valor "vermelho" mantido, recusa de ativação com mensagens em CRECI, razão social e WhatsApp (desktop e 375 px), ativa com "Abrir vitrine" (desktop e 375 px) e a recusa do WhatsApp com vitrine ativa em Dados da Imobiliária. T19 mostra o diálogo de edição com "Destaque na vitrine" (gestor), o Token "Destaque" na lista (gestor) e a lista do corretor sem "Novo imóvel", sem ações e sem Configurações no menu. Em `t18-06` o indicador do Next em desenvolvimento mostra "1 Issue", que não dá para inspecionar sem subir o servidor. As capturas da T19 são anteriores ao seed da T20 (por isso só IM-0001 aparece em destaque).
5. `tasks.md`: a linha de status da T21 está "Done" sem o hash (`606bd80`).

## Fechamento do lote (orquestrador, 2026-10-09)

- **Full (`npm test`), uma vez, antes do Verifier**: 219 arquivos, 3680 testes, exit 0, sem as duas instabilidades conhecidas (`DOCLIM-01 AC8` e `maintenance.integration.test.ts`). Rodou em `606bd80`.
- **Lacuna M27 do Verifier, fechada**: apagar `restoreIndexes` de `realSteps()` passava na suíte. Commit `3b620bc` exporta `realSteps` e afirma que cada etapa real é a função certa; o teste falha sem a linha (conferido removendo-a). Só `scripts/__tests__/test-db-push.test.ts` e uma palavra de `export` mudaram; a Full não foi repetida (lote de uma Full só), o arquivo roda verde (15 testes) e `tsc`/`eslint` seguem na linha de base.
- **`db:push:test`**: rodado duas vezes seguidas com sucesso após a T10 (`c4f71f5`) e mais duas após o fix `2e120e6`, nos 5 alvos, com a conferência do estado final.
- **Capturas reais** (extensão do Chrome, `capturas/`): `t18-01` a `t18-08` (seção Vitrine vazia com 3 bloqueios em desktop e 375 px, recusa de cor, recusa de ativação por campo em desktop e 375 px, ativa com o link em desktop e 375 px, recusa de apagar o WhatsApp com a vitrine ativa) e `t19-01` a `t19-03` (diálogo com o destaque, lista com o marcador, lista do corretor sem controle). As de 375 px renderizam a página real num quadro de 375 px porque a janela da extensão não reduz o viewport. O modo somente leitura da seção (VUI-01 AC2) não tem captura: nenhum papel da matriz tem `configuracoes:ler` sem `escrever`.
- **Achados fora da spec, resolvidos no lote**: o `drizzle-kit push` derruba o índice `document_categories_tenant_id_lower_name_idx` a cada execução (corrigido em `2e120e6`); o setter de `URL` não codifica `%` na senha (corrigido na T7); `FormLayout` horizontal estourava em 375 px (trocado por `Grid` na T18).
- **Pendências para o L16c**: aplicar o SQL, o papel e a senha em produção (uma ação por task); medir a revalidação na Vercel (F15). Quirk do `drizzle-kit push` (saída 0 após erro em índice único existente) segue; o `db:push:test` o contorna, o push de produção não é feito por ele.

## Reverificação do sensor (HEAD c63535c)

**Veredito: PASS**

- **Escopo**: sensor de discriminação refeito por um Verifier independente no HEAD final `c63535c` (depois do fix de M27 em `3b620bc`), cobrindo os 8 alvos obrigatórios, o M27 e 6 mutantes próprios. Nenhum código ou teste alterado; só esta seção foi acrescentada.
- **Resultado**: **21/21 mortos, 0 sobrevivente**. Alvos obrigatórios (13 mutações, incluindo M27): todos mortos.
- **Método**: cópia de cada arquivo no scratchpad (fora do repositório) antes da mutação, uma mutação por vez no arquivo real, só os testes que deveriam matá-la, restauração da cópia antes da próxima e `git diff --quiet -- <arquivo>` + comparação de `git status --porcelain`/`git diff --stat` com a linha de base após cada restauração. Um processo `npx vitest run` por vez (L-033), sempre no banco de teste base. Linha de base verde antes do sensor: `V`+`P`+`D` 54/54 (13+26+15); `PA`+`SA`+`L`+`R`+`PF`+`SS` 116/116.
- **Mutações no SQL**: aplicadas no banco base pelo `beforeAll` de `V` (`V:77-80`); para M3 e M4 a ordem foi `V` (aplica o SQL mutado) → `P` → `D`. Depois de restaurar o arquivo, `V` rodou de novo para reaplicar o SQL correto e um script node temporário fora do repositório conferiu e desfez à mão `revoke select on public.properties from krivo_vitrine` e `alter role krivo_vitrine set default_transaction_read_only = on`.

| # | Mutação | Arquivo | Teste que matou | Resultado |
| --- | --- | --- | --- | --- |
| R1a | `vitrine.imoveis` sem `and p.published` (alvo 1, mutante A) | `scripts/vitrine/vitrine.sql:106` | `V:153` (AC5, combinações de status × publicação); `V:272` (AC14 paridade) | ✅ morto |
| R1b | `vitrine.imoveis` sem `p.status = 'disponivel'` (alvo 1, mutante B) | `scripts/vitrine/vitrine.sql:106` | `V:153`; `V:198` (loja só com vendidos); `V:217` (vendido sai da view); `V:272` | ✅ morto |
| R2 | `vitrine.lojas` sem `nullif(trim(t.agent_whatsapp), '') is not null` (alvo 2) | `scripts/vitrine/vitrine.sql:80` | `V:113` (corte de loja AC4); `V:163` (imóveis de loja sem WhatsApp) | ✅ morto |
| R3 | `grant select on public.properties to krivo_vitrine` acrescentado ao SQL (alvo 3) | `scripts/vitrine/vitrine.sql:130` | **`P`**: `P:99` (`SELECT em public.properties` → 42501), `P:166` (AC11 `role_table_grants` = 2 linhas), `P:176` (nada de `public` legível). **`D`**: `D:124` (`verifyVitrineState = []`), `D:128` e `D:151` (reaplicam o SQL mutado e esperam `[]`). `V` sozinho passa (13/13) | ✅ morto (por `P` e por `D`) |
| R4 | `default_transaction_read_only = on` → `= off` (alvo 4) | `scripts/vitrine/vitrine.sql:126` | `P:133` (AC6, `rolconfig`); `D:124`, `D:128`, `D:140`, `D:151` (conferência do estado final) | ✅ morto |
| R5a | `deletePropertyAction` sem `scheduleStorefrontRevalidation(tenantId)` (alvo 5) | `src/server/actions/properties.ts:338` | `PA:583` (AC8 `deletePropertyAction`) | ✅ morto |
| R5b | `setPropertyFeaturedAction` sem `scheduleStorefrontRevalidation(tenantId)` (alvo 5) | `src/server/actions/properties.ts:431` | `PA:679` (gestor marca), `PA:692` (gestor desmarca) | ✅ morto |
| R6a | agenda antes do `return statusCheck` na recusa por validação de `setPropertyStatusAction` (alvo 6) | `src/server/actions/properties.ts:386` | `PA:625` (AC10, status fora do enum) | ✅ morto |
| R6b | agenda antes do `return` da recusa por permissão de `saveStorefrontAction` (alvo 6) | `src/server/actions/storefront.ts:48` | `SA:102` — `AssertionError` em `SA:111` (`scheduled not.toHaveBeenCalled()`) | ✅ morto |
| R7 | `ACTIVATION_ORDER` = `["razaoSocial","creci","whatsappAgente"]` (alvo 7) | `src/lib/storefront.ts:193` | `L:205` (ordem CRECI → razão → WhatsApp), `L:220`; `SA:135` (três recusas na ordem) | ✅ morto |
| R8a | log de não-2xx com `auth=${secret}` (alvo 8) | `src/server/storefront/revalidation.ts:78` | `R:153` (AC7, segredo nunca em log) | ✅ morto |
| R8b | log do `catch` com `error.message` (a mensagem do erro traz o segredo) (alvo 8) | `src/server/storefront/revalidation.ts:87` | `R:153` | ✅ morto |
| M27 | `realSteps()` sem `restoreIndexes: restoreDrizzleBlindIndexes,` | `scripts/test-db-push.ts:118` | `D:207` (etapas reais ligam cada função, L-026) | ✅ **morto** (sobrevivia antes de `3b620bc`) |
| E1 | `setPropertyFeatured` sem filtro de tenant (`.where(eq(properties.id, propertyId))`) | `src/server/data/index.ts:913` | `PF:91` (AC4 outro tenant intocado); `PA:715` | ✅ morto |
| E2 | limite do CRECI 40 → 41 | `src/lib/storefront.ts:64` | `L:90` (caso `creci`) | ✅ morto |
| E3 | WhatsApp apagável com vitrine ativa (`if (false && storefront.active)`) | `src/server/actions/settings.ts:135` | `SS:92` (VATIV-01 AC6: string vazia, só espaços, nulo) | ✅ morto |
| E4 | timeout 3000 → 30000 | `src/server/storefront/revalidation.ts:15` | `R:95` (timeout de 3 s), `R:114` (uma chamada no timeout), `R:153` — por estouro do `testTimeout` de 30 s (a promessa não resolve no tempo simulado) | ✅ morto |
| E5 | timeout 3000 → 3001 (fronteira) | `src/server/storefront/revalidation.ts:15` | `R:95`, `R:153` (mesmo mecanismo: 3000 ms simulados não disparam o aborto) | ✅ morto |
| E6 | `realSteps()` com `restoreIndexes: async () => {}` (função errada no lugar certo) | `scripts/test-db-push.ts:118` | `D:207` | ✅ morto |

Abreviações iguais às da seção "Verificação independente" (`V`, `P`, `D`, `PA`, `SA`, `L`, `R`, `PF`, `SS`). Total: 21 mutações (R1a, R1b, R2, R3, R4, R5a, R5b, R6a, R6b, R7, R8a, R8b, M27 + E1–E6), 21 mortas.

**Observação (não bloqueia)**: E4 e E5 morrem por estouro do `testTimeout` (30 s) e não por uma asserção sobre o desfecho, porque o teste avança exatamente 3000 ms simulados e espera a promessa. A discriminação existe (o teste falha), mas o diagnóstico de uma regressão real seria "Test timed out" em vez de uma mensagem sobre o timeout de 3 s.

**Restauração da árvore**: após cada mutação o arquivo voltou idêntico ao HEAD (`git diff --quiet -- <arquivo>`), e no fim `git status --porcelain` e `git diff --stat` ficaram idênticos à linha de base registrada antes do sensor (os 4 arquivos preexistentes de fora do lote), acrescidos apenas deste `validation.md`.

**Restauração do banco base**: depois de R3 e de R4, `V` reaplicou o SQL correto (13/13) e o script temporário confirmou/desfez o estado do papel. Estado final conferido: grants = `vitrine.imoveis:SELECT, vitrine.lojas:SELECT`; `rolconfig` = `default_transaction_read_only=on, statement_timeout=5s`. Rodada final no estado restaurado: `V` 13/13, `P` 26/26, `D` 15/15; `PA`+`SA`+`L`+`R`+`PF`+`SS` 116/116. `verifyVitrineState(base)` = `[]` (arquivo `.ts` temporário na raiz, executado com `npx tsx` e apagado em seguida).

### Confirmação final do `db:push:test` (HEAD `c63535c`, depois da reverificação)

Duas execuções consecutivas de `npm run db:push:test`, ambas com exit 0, nos 5 alvos, com a conferência do estado final e o índice `document_categories_tenant_id_lower_name_idx` presente nos 5 ao fim.

### Full de fechamento no HEAD final

`npm test` rodado de novo em `bceff6d`, depois de todos os commits de código (o primeiro `3b620bc` mexeu em teste depois da primeira Full): 219 arquivos, 3681 testes (o +1 é o teste do M27), exit 0, sem timeout. Esta é a Full de fechamento; a primeira (em `606bd80`) fica superseded, como no precedente do L15.

## Decisão das lições e conferência de encerramento (2026-10-10)

- **Lições (AD-028)**, por delegação do usuário a um agente Opus 5.5 (commit `aa5c808`): **L-069 descartada** (duplica a L-026; a candidata da lacuna M27 citada na "Verificação independente" não existe mais no store), **L-070 e L-071 promovidas** a `confirmed`, sem inflar `recurrence`. Achado do mesmo agente: o `drizzle-kit push` de produção também derruba `document_categories_tenant_id_lower_name_idx`; o L16c precisa recriá-lo e conferi-lo (nota em `scripts/vitrine/README.md` § Produção e no Handoff do `STATE.md`).
- **Observação 5 do Verifier resolvida**: a linha de status da T21 no `tasks.md` arquivado traz o hash `606bd80`.
- **Conferência de encerramento**: os 22 hashes de T0–T21 e os das fix tasks F1 `2e120e6` e F2 `3b620bc` existem em `git log`; nenhum commit de `803ef9c..HEAD` traz `Co-Authored-By` ou "Generated with"; `validate_state.py` (L16a), `validate_spec.py` (L16a, L16b, L16c) e `validate_tasks.py` (L16a arquivado, L16b, L16c) com 0 erros.
