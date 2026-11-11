# Lote 18a — Costuras do núcleo — Validação

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

## Validation: Lote 18a — FAIL

**Data**: 2026-11-10
**Spec**: `.specs/features/lote-18a-costuras-do-nucleo/spec.md`
**Faixa de diff**: `bf5e646..e35ce43` (66 commits, 472 arquivos)
**Verifier**: subagente independente (autor ≠ verificador), sem contexto da execução

Resumo: o comportamento do Krivo está preservado (contratos, schema, gerados, build, tsc, ESLint, suíte), e as costuras novas estão quase todas cobertas por testes discriminantes. O veredito é FAIL por dois motivos que o método trata como bloqueantes: um mutante sobrevivente no caminho de dados da imobiliária (a faceta de segmentos no processamento de documentos) e um teste do vertical de teste que afirma uma propriedade do grafo de imports que não é verdadeira (ele alcança `n8n/verticals/real-estate/src/phase.mjs`). As duas correções são de teste; nenhuma exige mudar o código de produção.

### Conclusão das tasks

T1–T45 marcadas como feitas em `tasks.md`, com duas caixas abertas: T24 (`npm run db:push:test` sem mudança pendente) e T45 (`next build` e Verifier). O `next build` foi rodado nesta verificação (abaixo). O `db:push:test` não foi repetido aqui: ele derruba o schema `vitrine` e reaplica em todas as branches de teste, e a suíte completa estava rodando; fica a prova registrada pelo executor (saída 0, com o mesmo `42P07` em `leads_tenant_id_id_idx` que ocorre em `bf5e646`).

### Checagem ancorada na spec

| Critério | Resultado definido na spec | Evidência `arquivo:linha` | Resultado |
| --- | --- | --- | --- |
| BOUND-01 AC1–2 (mapa único, pacote de todo `core`) | todo arquivo classificado; `core` com pacote | `scripts/__tests__/boundary.test.ts:51` - `expect(checkClassification(repositoryFiles(), rules)).toEqual([])`; `:67` exige pacote | ✅ PASS (mapa por glob, primeira regra vence) |
| BOUND-01 AC3 | falha citando o caminho | `scripts/__tests__/boundary.test.ts:55` - `"Arquivo sem classificação: src/new.ts"` | ✅ PASS |
| BOUND-01 AC4 | regra órfã falha citando o caminho | `scripts/__tests__/boundary.test.ts:61` - `"Regra órfã: src/missing.ts"` | ✅ PASS |
| BOUND-02 AC1 | erro `no-restricted-imports` | `scripts/__tests__/boundary-eslint.test.ts:15` - `{ ruleId: "no-restricted-imports", severity: 2 }` | ✅ PASS |
| BOUND-02 AC2–4 | falha citando os dois caminhos | `scripts/__tests__/boundary.test.ts:95-105` - `Import proibido: ${file} -> ${target}` (core→vertical, core→app, vertical→app, client→core server, client→server-only); `:107` reexportação e import dinâmico | ✅ PASS |
| BOUND-03 AC1 | 13 termos, qualquer caixa, arquivo e linha | `scripts/__tests__/boundary.test.ts:129` - `line: 2, message: Termo de mercado "${term}"` | ✅ PASS (texto JSX não é checado; não há arquivo `core` com JSX hoje) |
| BOUND-03 AC2 | comentário ignorado | `scripts/__tests__/boundary.test.ts:143` - `toEqual([])` | ✅ PASS |
| BOUND-03 AC3 | comentário com nome novo, por `git grep` | `git grep` desta verificação: `selectForMeeting`, `normalizarBaseDaVitrine`, `interpretarPatchAgendamento`, `broker-assignment`, `meetingAttended`, `lib/permissions` com 0 ocorrências fora de teste; `supportedModality`, `meetingDays`/`meetingHours*` e `brokerId` restantes são campo do fio ou do better-auth | ✅ PASS (prova por processo, sem teste) |
| BOUND-04 AC1–2 | arquivo único; só itens do L18c | `scripts/__tests__/boundary.test.ts:29` - `checkTransitionEntries(transitional)` = `[]`; `:37` recusa categoria fora de `stored/api/n8n-modules/route-folders` | ✅ PASS (107 entradas: 33 `stored`, 4 `api`, 70 `n8n-modules`) |
| BOUND-04 AC3 | entrada órfã falha | `scripts/__tests__/boundary.test.ts:113`, `:147`, `:189`, `:230` - `Exceção sem ocorrência` | ✅ PASS |
| KEEP-01 AC1 | `openapi.yaml` sem diferença | `git diff --exit-code bf5e646 -- docs/integration/openapi.yaml n8n/generated/` → saída 0 | ✅ PASS |
| KEEP-01 AC2–3 | mesmos campos, valores, corpos e códigos | testes de rota existentes com valores inalterados (auditoria abaixo); ex.: `src/server/integration/__tests__/routes/leads-patch.test.ts` só troca `supportedModality` → `supportedSegment` na fixture | ✅ PASS |
| KEEP-02 AC1–2 | 9 arquivos sem diferença; falha cita arquivo e 1ª linha | `scripts/__tests__/boundary-generated.test.ts:46` (regera e compara hashes), `:57` - `"erros.ts:1: primeira linha diferente da base"` | ✅ PASS |
| KEEP-02 AC3 | hashes intocados depois da criação | `git log -- scripts/boundary/generated-hashes.json` → só `321623d`; `n8n/` igual a `bf5e646` nesse commit | ✅ PASS |
| KEEP-03 AC1 | foto do schema igual à base | `scripts/__tests__/boundary-schema.test.ts:26` - `expect(snapshotSchema({ ...schema, ...realEstateSchema })).toEqual(baseline)`; `src/db/` igual a `bf5e646` em `eb04f04` | ✅ PASS |
| KEEP-03 AC2 | `db:push:test` sem mudança pendente | sem prova independente; registro do executor (saída 0 e `42P07` também na base) | ⚠️ não reverificado |
| KEEP-03 AC3 | views e papéis da vitrine iguais | `scripts/{vitrine/vitrine.sql => storefront/storefront.sql}` com 0 linha alterada; `git diff --exit-code bf5e646 -- vitrine/` → 0 | ✅ PASS |
| KEEP-04 AC1 | `npm test` verde, ≥ 250 arquivos e 4041 testes | `npm test` desta verificação: 276 arquivos, 4291 testes, 0 falhas | ✅ PASS |
| KEEP-04 AC2–3 | teste existente só muda símbolo, import ou entrega | auditoria dos 174 testes alterados (abaixo) | ✅ PASS |
| KEEP-04 AC4–5 | tsc sem aumento; ESLint 0 erros, ≤ 9 avisos | `npx tsc --noEmit -p .` → 0 erros; `npx eslint .` → 0 erros, 9 avisos | ✅ PASS |
| KEEP-04 AC6 | `next build` contra o banco de teste sem erro | rodado nesta verificação (abaixo): saída 0 | ✅ PASS |
| KEEP-05 AC1–3 | 8 telas, URLs e menus iguais | tabela de capturas no topo deste arquivo (`evidence/base/` e `evidence/end/`) | ✅ PASS |
| KEEP-06 | nada em produção | `git branch -r --contains HEAD` vazio (nada publicado); nenhum comando de banco de produção nesta verificação; n8n e Vercel não tocados | ✅ PASS (sem prova possível sobre ações de sessões anteriores além do registro) |
| VOCAB-01 AC1, AC3 | constante por valor, valor atual | `src/lib/__tests__/vocabulary.test.ts:19-38` - `expect(actual).toEqual(expected)` com literais (ex.: `attendant: "corretor"`) | ✅ PASS |
| VOCAB-01 AC2 | constantes do vertical | `src/verticals/real-estate/__tests__/vocabulary.test.ts:18`, `:27` | ✅ PASS |
| VOCAB-01 AC4 | literal fora dos módulos falha, com arquivo e linha | `scripts/__tests__/boundary.test.ts:161-171` - `Valor gravado literal "corretor"`; `:157` árvore real | ✅ PASS |
| VOCAB-01 AC5 | tipos derivados | `src/lib/__tests__/vocabulary.test.ts:51` - `expectTypeOf<Role>().toEqualTypeOf<...>()` | ✅ PASS |
| VOCAB-01 AC6 | predicados com o mesmo SQL | `src/server/data/__tests__/role-vocabulary.test.ts:36-37` - SQL `'corretor' = any(string_to_array(...))` | ✅ PASS |
| VOCAB-02 AC1–2 | nomes novos, colunas mantidas | `scripts/__tests__/boundary-schema.test.ts:26` (colunas iguais); `src/server/data/__tests__/optional-appointments.test.ts:36` usa `appointmentAt` | ✅ PASS |
| VOCAB-02 AC3 | `appointmentAt` ↔ `meetingAt` na borda | `src/server/integration/__tests__/qualification-kit.test.ts:110` (`meetingAt` → `appointmentAt`), `:140` (`meetingAt: null` na resposta), `:150` | ✅ PASS |
| VOCAB-03 AC1 | `read`/`write` e recursos novos | `src/lib/__tests__/access.test.ts:92` - `RESOURCES` igual à lista | ✅ PASS |
| VOCAB-03 AC2 | matriz igual célula por célula | `src/lib/__tests__/access.test.ts:90-100` - matriz literal de `bf5e646` | ✅ PASS |
| ENG-01 AC1–4 | identificador em português falha; rota e `n8n/` fora | `scripts/__tests__/boundary.test.ts:199`, `:203`, `:213`, `:217`, `:223` | ✅ PASS |
| VERT-01 AC1 | campos do contrato | `src/vertical-kit/__tests__/index.test.ts:51` (cada campo obrigatório) | ✅ PASS |
| VERT-01 AC2 | kit só importa o vocabulário | `src/vertical-kit/__tests__/index.test.ts:91-106` | ✅ PASS |
| VERT-01 AC3 | `id` vazio e colisão lançam erro nomeando o campo | `src/vertical-kit/__tests__/index.test.ts:42` (`/\bid\b/`), `:46` (`resources[0].name`) | ✅ PASS |
| VERT-01 AC4 | papel ausente quebra a compilação | `src/vertical-kit/__tests__/index.test.ts:86` - `@ts-expect-error` | ✅ PASS |
| VERT-01 AC5 | núcleo recebe o vertical por parâmetro ou fábrica | 4 arquivos `core` importam `n8n/verticals/real-estate/src/phase.mjs` (exceção `n8n-modules` até o L18c) | ⚠️ PASS com exceção registrada (ver lacuna 2) |
| VERT-02 AC1–2 | `real-estate`, agendamento, `catalog`, segmentos, marca | `src/verticals/real-estate/__tests__/index.test.ts:17-23` | ✅ PASS |
| VERT-02 AC3 | app passa o vertical | `src/kit/*` com `realEstate`; mutantes M25 e M29 mortos pelos testes de rota; M26 sobreviveu | ❌ lacuna (ver lacuna 1) |
| VERT-03 AC1 | vertical sem catálogo, agendamento e segmentos, outra marca | `src/vertical-kit/__tests__/fixture-vertical.test.ts:14` | ✅ PASS |
| VERT-03 AC2 | lead, conversa, mensagem, documento, permissão e LGPD no banco | `src/vertical-kit/__tests__/fixture-vertical.integration.test.ts:49` (lead, mensagem, conversa, opt-out), `:81` (permissão), `:93-110` (reserva de documento) | ✅ PASS |
| VERT-03 AC3 | `type` com a marca | `src/vertical-kit/__tests__/fixture-vertical.integration.test.ts:113` - `"urn:acme:problem:recurso-nao-encontrado"` | ✅ PASS |
| VERT-03 Independent Test | nenhum arquivo `vertical` da imobiliária no grafo | `src/vertical-kit/__tests__/fixture-vertical.integration.test.ts:116-123` filtra só `src/verticals/real-estate/`; o grafo real inclui `n8n/verticals/real-estate/src/phase.mjs` (via `src/db/schema.ts`) | ❌ lacuna (ver lacuna 2) |
| ACCESS-01 AC1–4 | fábrica, `catalog` com as permissões de `imoveis`, recurso desconhecido recusado, vertical de teste sem `catalog` | `src/lib/__tests__/access.test.ts:90`, `:102`, `:112-116`, `:117` | ✅ PASS |
| QUAL-01 AC1–2 | faceta com os 8 campos; núcleo trata como opaco | `src/verticals/real-estate/__tests__/qualification.test.ts:19-43`; `src/server/integration/__tests__/qualification-kit.test.ts:99-113` | ✅ PASS |
| QUAL-01 AC3 | colunas na lista de transição | `scripts/__tests__/boundary-schema.test.ts:34-45` | ✅ PASS |
| QUAL-01 AC4 | PATCH valida e grava como na base; POST ignora | `src/server/integration/__tests__/qualification-contract.test.ts:8-30` (ordem das falhas); `src/server/integration/__tests__/qualification-kit.test.ts:80-92` | ✅ PASS |
| QUAL-02 AC1 | consumidores leem do vertical | `src/server/reengagement/__tests__/qualification-facts.test.ts:55-69`; `src/server/data/__tests__/qualification-readers.test.ts:37-50` | ✅ PASS |
| QUAL-02 AC2 | sem faceta: mesmo problema de campo inválido | `src/server/integration/__tests__/qualification-kit.test.ts:51-65` - `detail: "Campo '${field}' inválido."` | ⚠️ lacuna de precisão: a spec diz "o mesmo problema que `parseLeadPatch` devolve hoje", mas em `bf5e646` campo desconhecido era ignorado e os campos de enum tinham `... Valores aceitos: ...`; o texto escolhido é razoável, não é "o mesmo" |
| APPT-01 AC1 | agendamento ligado como na base | testes existentes de agenda/atribuição inalterados; `src/server/data/__tests__/optional-appointments.test.ts:57` | ✅ PASS |
| APPT-01 AC2 | recusa `meetingAt` com o problema atual | `src/server/integration/__tests__/qualification-kit.test.ts:117-131` - `"Campo 'meetingAt' deve ser uma data ISO-8601 válida."` (texto de `bf5e646`) | ✅ PASS |
| APPT-01 AC3 | `engaged` → `goal_reached` sem horário | `src/server/integration/__tests__/qualification-kit.test.ts:134-146` | ✅ PASS |
| APPT-01 AC4 | listas vazias de pendências e comparecimento | `src/server/data/__tests__/optional-appointments.test.ts:56-70` | ✅ PASS |
| APPT-01 AC5 | texto do agendamento fora do núcleo | termos `reuni`/`meeting` barrados no núcleo (`scripts/__tests__/boundary.test.ts:125`) | ⚠️ lacuna de precisão: a spec não diz quais códigos o núcleo devolve |
| CAT-01 AC1 | catálogo classificado como `vertical` | `scripts/boundary/map.json` (`src/verticals/real-estate/**`, `app/api/v1/properties/**`) | ⚠️ PASS com desvio: `src/server/actions/properties.ts` ficou `app` (emenda do design), e a spec diz `vertical` |
| CAT-01 AC2 | schemas compostos, DDL igual | `scripts/__tests__/boundary-schema.test.ts:26`; `drizzle.config.ts:11` e `drizzle-test.config.ts:23` com os dois schemas | ✅ PASS |
| CAT-02 AC1–2 | vitrine no vertical; AD-050 mantida | `scripts/boundary/map.json`; testes de vitrine e de actions com valores inalterados (auditoria) | ✅ PASS (mesmo desvio das actions) |
| AGENT-01 AC1–2 | gerado de fontes genéricas e manifesto, sem mudar texto | `scripts/__tests__/n8n-inline-vertical.test.ts:55-75`; `scripts/__tests__/boundary-generated.test.ts:46` | ✅ PASS |
| AGENT-01 AC3 | sem tool de agendamento e sem lembrete | `scripts/__tests__/n8n-agent-fixture.test.ts:155-170` | ✅ PASS |
| AGENT-01 AC4 | nenhum nó com termo da imobiliária | `scripts/__tests__/n8n-agent-fixture.test.ts:172-186` - `/im[oó]ve|imobili|corretor|buscar_imoveis/i` | ✅ PASS |
| AGENT-02 AC1 | `__INLINE` nas duas pastas; `--vertical` e `--out` | `scripts/__tests__/n8n-inline-vertical.test.ts:55`; `--vertical`/`--out` da linha de comando sem teste próprio | ⚠️ PASS parcial (a CLI é fina, `scripts/n8n-inline.mjs` `parseArgs`) |
| AGENT-02 AC2 | nome duplicado falha citando o nome | `scripts/__tests__/n8n-inline-vertical.test.ts:94-98` - `/módulo duplicado duplicate\.mjs/` | ✅ PASS |
| AGENT-02 AC3 | determinismo | `scripts/__tests__/n8n-inline.test.ts:168`, `:190`; `scripts/__tests__/n8n-inline-vertical.test.ts:74` | ✅ PASS |
| SEG-01 AC1 | símbolo `segment`, coluna `modality` | `src/server/integration/__tests__/document-segments.integration.test.ts:34`; `scripts/__tests__/boundary-schema.test.ts:26` | ✅ PASS |
| SEG-01 AC2 | contexto filtrado como na base para a imobiliária | `src/server/integration/__tests__/document-context.integration.test.ts:75-150` (pelo `src/kit/document-context.ts`, valores inalterados); `src/verticals/real-estate/__tests__/index.test.ts:30` | ✅ PASS no contexto; ❌ no processamento (lacuna 1) |
| SEG-01 AC3 | sem segmentos: lista e entrega todos | `src/server/integration/__tests__/document-segments.integration.test.ts:59-83`, `:85-107` | ✅ PASS |

**Edge cases**: arquivo novo sem classificação (`boundary.test.ts:55`) ✅; `core.autocrlf` (o inliner normaliza CRLF; rodar `node scripts/n8n-inline.mjs` no Windows regrava os 9 gerados com LF e o `git status` acusa 3 deles como modificados sem diferença de conteúdo, resolvido com `git checkout --`; o `npm test` deixa o mesmo efeito nos mesmos 3 arquivos, com `git hash-object` igual ao blob de `HEAD`) ✅ com observação; publicação de gerados não ocorreu ✅; suíte única (verificado antes de rodar) ✅.

### Auditoria dos testes existentes (KEEP-04 AC2–3)

Script próprio comparou os 174 arquivos de teste modificados ou renomeados entre `bf5e646` e `HEAD`: nenhum perdeu `expect(` ou `it(`/`describe(`, nenhum ganhou `skip`/`only`/`todo`. Os literais removidos são caminhos de import, nomes de recurso e ação (`ler`/`escrever`/`documentos`/`configuracoes`/`usuarios`/`imoveis` → `read`/`write`/`documents`/`settings`/`users`/`catalog`, com a paridade provada em `src/lib/__tests__/access.test.ts:90`), nomes de fixture (`Tenant Broker …` → `Tenant Assignee …`), `supportedModality` → `supportedSegment` e `meetingAt` → `appointmentAt` como propriedade do schema. Nenhum valor gravado ou do fio mudou. `src/server/integration/__tests__/properties.test.ts` ganhou uma asserção negativa (`assigneeName`).

- **Exceção da T37 (`157e7fa`)**: as 6 asserções `toContain("__INLINE(x.mjs)__")` viraram `toContain(readInlinedModule("x.mjs"))` sobre o gerado; a nova forma é mais forte (exige o módulo inteiro inlined).
- **Não declarado na T37 (`55027e5`, T39)**: 9 testes de `n8n/workflows/__tests__/` passaram a comparar o gerado atual com a fonte de `bf5e646` lida por `git show` (`n8n/workflows/__tests__/workflow-baseline.ts:12`), e não com a fonte atual. A força não caiu, porque o gerado atual continua do lado testado e o teste de hashes regera a partir da fonte atual. Porém o commit não explica a troca, e esses testes passam a depender do histórico do git (um clone raso sem `bf5e646` os quebra). Fica como ressalva para o L18b.
- **`88f0f5c`**: não afrouxou nada. Em `vertical-alert.test.ts`, o assunto esperado do vertical de teste passou de "imobiliária(s)" para "empresa(s)", que é o comportamento correto depois do `brand.tenantNoun`, e o corpo passou a ser conferido (`"nas empresas abaixo.\n\nTenant Azul (tenant-blue)"`). Em `boundary-eslint.test.ts`, o caso de exceção passou para a exceção que ainda existe (`parsers.ts` → `phase.mjs`, nas duas grafias), e o caso de recusa passou de 1 alvo para 2. O mutante M16 confirma que o teste atualizado discrimina.

### Sensor de discriminação

Worktree descartável em `HEAD` (`e35ce43`), com `node_modules` por junção e os testes rodados da raiz real com `--root` no worktree. Cada mutante foi aplicado, testado e revertido por `git checkout`; a junção foi desfeita antes de `git worktree remove --force`. `git status --porcelain` do repositório real: vazio antes e depois (igual ao baseline).

| # | Arquivo | Mutação | Morto? |
| --- | --- | --- | --- |
| M1 | `src/vertical-kit/index.ts:85` | `defineVertical` deixa de validar `brand.name`/`problemUrn`/`tenantHeader`/`alertTag` | ❌ Sobreviveu (fora das ACs; validação sem teste) |
| M2 | `src/vertical-kit/index.ts:98` | aceita recurso com nome de recurso do núcleo | ✅ |
| M3 | `src/lib/access.ts:42` | `createAccess` ignora o 1º recurso do vertical | ✅ |
| M4 | `src/lib/access.ts:48` | `can` exige todos os papéis em vez da união | ✅ |
| M5 | `src/server/integration/parsers.ts:293` | PATCH aceita `meetingAt` com `appointments: false` | ✅ |
| M6 | `src/server/integration/parsers.ts:286` | sem faceta, não recusa campo de qualificação | ✅ |
| M7 | `src/verticals/real-estate/qualification.ts:44` | remove `beforeCoreText` (ordem das falhas do PATCH) | ✅ |
| M8 | `src/verticals/real-estate/qualification.ts:58` | `serialize` troca `motivation` por `creditStatus` | ✅ |
| M9 | `src/server/integration/kit.ts:23` | `applyLeadPatch` pula `toLeadColumns` | ✅ |
| M10 | `src/server/documents/context-budget.ts:33` | sem faceta, nenhum documento se aplica | ✅ |
| M11 | `src/server/documents/segments.ts:15` | sem faceta, usa o segmento pedido em vez do fixo | ✅ |
| M12 | `src/server/integration/context.ts:85` | teto lido pelo segmento bruto da consulta (`null` com faceta ausente) | ✅ |
| M13 | `src/server/data/index.ts:1530` | pendências ignoram `appointments: false` | ✅ |
| M14 | `src/server/data/index.ts:784` | comparecimento ignora `appointments: false` | ✅ |
| M15 | `src/lib/duplicate-document.ts:12` | mensagem de duplicata fixa "imobiliária" | ✅ |
| M16 | `src/lib/integration-alert.ts:73` | corpo do alerta fixa "imobiliárias" | ✅ |
| M17 | `src/server/integration/problem.ts:84` | `type` ignora a marca | ✅ |
| M18 | `scripts/boundary/check.ts:207` | fronteira não recusa vertical → app | ✅ |
| M19 | `scripts/boundary/check.ts:90` | termos de mercado sensíveis à caixa | ✅ |
| M20 | `scripts/boundary/check.ts:251` | regra órfã não reprova | ✅ |
| M21 | `scripts/n8n-inline.mjs:168` | `__VALUE__` expande para o nome | ✅ |
| M22 | `scripts/n8n-inline.mjs:136` | `__IF__` mantém trecho com chave `false` | ✅ |
| M23 | `scripts/n8n-inline.mjs:161` | `__BLOCK__` deixa linha extra | ✅ |
| M24 | `scripts/n8n-inline.mjs:204` | módulo duplicado nas duas pastas não reprova | ✅ |
| M25 | `app/api/cron/expire-documents/route.ts:60` | cron diário sem a faceta da imobiliária | ✅ |
| M26 | `src/kit/document-services.ts:9` | processamento de documento da imobiliária com `facet: null` | ❌ Sobreviveu a 6 arquivos e 133 testes (`processing.integration`, `processing`, `lifecycle.integration`, `document-context.integration`, `context-ceiling`, `repository`) |
| M27 | `src/server/data/index.ts:668` | amostra de documentos conta tudo no segmento padrão | ✅ |
| M28 | `src/server/reengagement/context.ts:80` | frame sem os fatos da qualificação | ✅ |
| M29 | `src/server/integration/leads.ts:76` | JSON do lead sem os campos de qualificação | ✅ (morto pelos testes de rota `leads-get`/`leads-patch` e `qualification-contract`; sobrevive a `qualification-kit` + `leads.test.ts` sozinhos) |
| M30 | `scripts/boundary/check.ts:200` | `vertical-kit` pode importar qualquer módulo | ✅ |

**Profundidade**: ampliada (30 mutantes, caminhos de integridade de dados e de fronteira).
**Resultado do sensor**: 28 de 30 mortos; 2 sobreviventes (M26 bloqueante, M1 menor) - FAIL.

### Gate

- **Build**: `npx tsc --noEmit -p .` → 0 erros; `npx eslint .` → 0 erros e 9 avisos (linha de base).
- **`next build` contra o banco de teste**: script no scratchpad com o mecanismo de `scripts/dev-test-db.mjs` (`DATABASE_URL` trocada pela DSN de teste só no processo filho, aborta sem `TEST_DATABASE_URL` e se a DSN coincidir com a padrão). Host impresso e conferido antes de rodar: `ep-holy-rice-…/neondb` (o host de teste registrado em `lote-16c-vitrine-ativacao/validation.md:37`). Resultado: `✓ Compiled successfully`, TypeScript sem erro, 29 de 29 páginas estáticas geradas, saída 0. O log traz `BetterAuthError: You are using the default secret` na coleta de dados das páginas, não fatal: a variável não está no ambiente local; não é do lote.
- **Suíte completa (`npm test`)**: rodada nesta verificação, sem outra suíte ativa (conferido antes): 276 arquivos e 4291 testes, 0 falhas, 0 pulados, saída 0, em 1213 s. Delta sobre a base: +26 arquivos e +250 testes.
- **Base**: 250 arquivos e 4041 testes em `bf5e646`.

### Emendas da execução (`design.md`) e AD-052

1. **`brand.tenantNoun`**: coerente. É campo de `brand`, validado por `defineVertical`, e mantém em português só o que a pessoa lê (AD-052). Os testes da imobiliária continuam com "imobiliária(s)".
2. **Núcleo importa `phase.mjs` do vertical**: legal pela BOUND-04 AC2 (módulo de `n8n/` que depende do L18c), mas incoerente com duas coisas. (a) A VERT-03 pede o vertical de teste sem nenhum arquivo `vertical` da imobiliária no grafo, e o grafo do teste de integração alcança `n8n/verticals/real-estate/src/phase.mjs`. (b) A AD-052 diz que `packages/*` nunca importa `apps/*`, e o design promete que o L18b "só move pastas". Como o L18b vem antes do L18c, mover pastas deixaria `@core/db` (`src/db/schema.ts`, no `CHECK lead_agent_state_asked_fields`) e `@core/server` importando `apps/real-estate`. O L18b precisa resolver isso antes de mover (passar `FIELD_LABELS` pela faceta de qualificação ou manter a lista de campos no núcleo), ou a AD-052 precisa registrar a exceção.
3. **`src/lib/storefront.ts` como reexportação**: coerente; o mapa o classifica como `vertical`.
4. **Actions do catálogo e da vitrine no app**: coerente com a decisão de design "Actions: camada `app` no L18a", mas a CAT-01 AC1 e a CAT-02 AC1 da spec ainda dizem `vertical` para `src/server/actions/properties.ts` e `src/server/actions/storefront.ts`. A spec deveria ser emendada.

### Qualidade de código

| Princípio | Status |
| --- | --- |
| Código mínimo e mudanças cirúrgicas | ✅ (renomeações separadas dos ajustes, conforme os commits de movimento) |
| Sem escopo extra | ✅ |
| Segue os padrões do projeto | ✅ |
| Checagem ancorada na spec | ⚠️ (QUAL-02 AC2 e APPT-01 AC5 com lacuna de precisão) |
| Testes mapeiam para AC | ✅ |
| Diretrizes documentadas (`CLAUDE.md`, `AGENTS.md`) | ✅ commits em pt-BR, sem trailer de atribuição em `bf5e646..HEAD` (0 ocorrências) |
| Padrões silenciosos | ⚠️ `appointments = true` (`src/server/data/index.ts:755`, `:1528`) e `facet = null` (`src/server/documents/repository.ts:480`, `src/server/integration/lgpd.ts:102`, `src/server/integration/context.ts:42`) como padrão de parâmetro: um chamador que esquecer o vertical cai em silêncio no comportamento de um dos verticais. É a origem do M26. |

### Lacunas que viram tasks de correção (ordem de gravidade)

1. **M26, faceta de segmentos no processamento de documentos (Major)**: nenhum teste prova que `src/kit/document-services.ts` passa `realEstate.documentSegments` ao serviço de processamento; com `facet: null`, a admissão da imobiliária depois de processar um documento passa a usar um segmento só, e 133 testes passam. Correção: em `src/server/documents/__tests__/processing.integration.test.ts`, um caso da imobiliária em que o resultado da admissão depende do segmento (por exemplo, um documento `usado` que cabe no teto de `usado` mas não no de `novo`), afirmando o status `pronto`/`fora_do_agente` e o contexto. Verificar com o mesmo mutante.
2. **VERT-03, grafo do vertical de teste (Major)**: `src/vertical-kit/__tests__/fixture-vertical.integration.test.ts:122` filtra só `src/verticals/real-estate/` e afirma "sem alcançar o vertical imobiliário", mas o grafo inclui `n8n/verticals/real-estate/src/phase.mjs`. Correção: filtrar pela classificação do mapa (`layer === "vertical"`) e afirmar que o único arquivo alcançado é o da exceção registrada em `transitional.json`, para o teste não mentir e para a exceção falhar quando for removida. Registrar no plano do L18b o item da emenda 2.
3. **M1, validação da marca sem teste (Minor)**: `defineVertical` valida `brand.name`, `problemUrn`, `tenantHeader` e `alertTag`, mas nenhum teste exercita esses campos vazios. Correção: estender `src/vertical-kit/__tests__/index.test.ts:20` aos quatro campos.
4. **QUAL-02 AC2, precisão da spec (Minor)**: emendar a spec com o texto escolhido (`Campo '<campo>' inválido.`) ou alinhar o texto ao de `bf5e646`.
5. **CAT-01/CAT-02, spec desatualizada (Minor)**: emendar a spec para as actions no `app`, como o design.
6. **`workflow-baseline.ts` (Minor)**: documentar no commit ou no `design.md` a troca de `55027e5` e a dependência de `git show bf5e646`; avaliar no L18b um arquivo de referência versionado em vez do histórico.
7. **KEEP-03 AC2 (Minor)**: rodar `npm run db:push:test` em janela sem suíte e registrar a saída; o `42P07` é anterior ao lote.
8. **AGENT-02 AC1 (Minor)**: teste da linha de comando com `--vertical` e `--out`.

### Rastreabilidade

Nenhum requisito muda de status neste relatório: com o veredito FAIL, todos ficam em `Implementing` até as correções 1 e 2 e uma nova verificação.
