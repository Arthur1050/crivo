# Lote 12 — Conteúdo de documentos chega ao agente — Tarefas

## Execution Protocol (MANDATORY -- do not skip)

Implemente estas tarefas com a skill `tlc-spec-driven`: **ative-a pelo nome e siga integralmente seu fluxo Execute e suas Critical Rules**. Não procure a skill por caminho de filesystem. A skill é a fonte de verdade para ciclo por tarefa, commits atômicos, delegação, Verifier independente, sensor de discriminação e fechamento.

**Se a skill não puder ser ativada, PARE e informe ao usuário — não prossiga sem ela.**

---

**Design:** `.specs/features/lote-12-conteudo-de-documentos/design.md`  
**Status:** Aprovado — pronto para Execute  
**Total:** 37 tarefas em 6 fases sequenciais

---

## Preconditions for Execute

- Confirmar `git status`, branch e baseline de testes antes da T1; preservar mudanças alheias.
- Confirmar que `TEST_DATABASE_URL` aponta para banco descartável antes de qualquer teste ou `drizzle-kit push`. Nunca usar `DATABASE_URL` de produção por engano.
- Executar `npx drizzle-kit push --config drizzle-test.config.ts` somente no banco de teste durante implementação local. Qualquer push no banco conectado de preview/produção exige autorização explícita no início da tarefa operacional correspondente.
- Ler os guias relevantes em `node_modules/next/dist/docs/` antes de alterar configuração, Route Handlers ou streaming no Next 16.
- Depois da T1, ler a documentação versionada em `node_modules/workflow/docs/` antes da T2 e da T14.
- Antes das tarefas T23–T27, repetir a descoberta Astryx com o CLI local para cada componente usado; aplicar o self-check do `AGENTS.md`.
- T29–T37 contêm efeitos externos. Aprovar `tasks.md` não autoriza provisionamento, deploy, publicação do n8n, mudança de variáveis, alteração de plano ou schema fora do banco de teste.

## Proposed Tool Profiles

| Perfil | Ferramentas propostas |
| --- | --- |
| Local Core | shell local, `apply_patch`, Vitest, ESLint, Next build e skill `tlc-spec-driven` |
| Storage | Local Core + skill `vercel:vercel-storage`; documentação oficial do `@vercel/blob` |
| Workflow | Local Core + skill `vercel:workflow`; docs instaladas em `node_modules/workflow/docs/` |
| Next API | Local Core + skill `vercel:nextjs`; documentação local do Next 16 |
| UI | Local Core + CLI Astryx, skill `vercel:react-best-practices` e verificação em navegador |
| n8n | Local Core + SDK de workflow do repositório; controle do n8n apenas quando autorizado |
| Connected | leitura/controle de Vercel, navegador e n8n; cada escrita externa pede autorização explícita |

Os perfis são uma proposta para aprovação. O usuário pode trocar ou restringir ferramentas antes do Execute.

---

## Test Coverage Matrix

> Gerada a partir do código, das diretrizes do projeto e da spec — confirmar antes do Execute. Diretrizes encontradas: `AGENTS.md`, `vitest.config.ts`, `package.json`, `.specs/STATE.md` (AD-021, AD-023, AD-027), `.specs/LESSONS.md` (L-001–L-025 confirmadas) e testes existentes em `src/server/**/__tests__`, `src/db/__tests__` e `n8n/**/__tests__`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Domínio puro de documentos | unit | Todas as branches; mapeamento 1:1 para ACs aplicáveis; todos os limites e formatos | `src/server/documents/__tests__/*.test.ts` | `npx vitest run src/server/documents/__tests__` |
| Repositório, actions e lifecycle | integration | Queries críticas, concorrência, fault injection, boundaries, tenant isolation e estados finais | `src/server/{documents,data}/__tests__/*.test.ts`, `src/server/__tests__/*.test.ts` | `npx vitest run <arquivo-da-tarefa>` |
| Route Handlers internos e `/api/v1` | integration/e2e | Happy path, todo edge case e toda falha/autorização da rota | `src/server/integration/__tests__/routes/*.test.ts` | `npx vitest run src/server/integration/__tests__/routes` |
| Vercel Workflow | workflow integration | Steps, retries, erro fatal/transitório, replay e conclusão CAS sem payload de conteúdo | `workflows/__tests__/*.test.ts` | `npx vitest run --config vitest.workflow.config.ts` |
| Contrato OpenAPI | integration | Método, schema, exemplos, erros e paridade entre documentação e handler | `src/server/integration/__tests__/openapi.test.ts` | `npx vitest run src/server/integration/__tests__/openapi.test.ts` |
| Workflow n8n como código | unit/structural | Método/body determinísticos, ausência de `$fromAI`, modelo/credencial preservados e generated parity | `n8n/workflows/__tests__/*.test.ts`, `scripts/__tests__/n8n-inline.test.ts` | `npx vitest run n8n/workflows/__tests__ scripts/__tests__/n8n-inline.test.ts` |
| UI React/Astryx | browser e2e + build | Estados, papéis, upload, polling, preview, acessibilidade e screenshots; self-check Astryx integral | evidência da tarefa + componentes em `src/components/documents/` | `npm run build` + verificação em navegador |
| Schema/configuração | build-only | Tipos, imports e configuração compilam; schema é inspecionado no banco de teste antes de uso | `src/db/schema.ts`, `next.config.ts`, `package.json` | `npm run build` |
| Ambiente conectado | connected e2e/manual | Percurso real Blob → Workflow → DB → CRM → n8n, IDs confirmados e nenhum segredo/corpus na evidência | `.specs/features/lote-12-conteudo-de-documentos/tasks.md` | smoke específico + gate Build |

## Gate Check Commands

> Gerados do repositório — confirmar antes do Execute. Comandos de uma mesma célula são executados separadamente, na ordem indicada.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Tarefa com testes unitários/estruturais isolados | `npx vitest run <arquivo-ou-diretório-da-tarefa>` |
| Full | Tarefa de banco, rota, workflow ou integração | `npm test` |
| Build | Fechamento de fase, UI, config e release | `npm test`<br>`npm run lint`<br>`npm run build` |

Em todo gate, registrar total antes/depois e provar que nenhum teste foi silenciosamente removido. Testes de banco rodam serializados pelo `vitest.config.ts` e exclusivamente com `TEST_DATABASE_URL`.

---

## Execution Plan

As fases e tarefas são estritamente sequenciais.

### Phase 1: Fundação de plataforma e dados

```text
T1 -> T2 -> T3 -> T4 -> T5 -> T6
```

### Phase 2: Entrada, storage e extração

```text
T7 -> T8 -> T9 -> T10 -> T11 -> T12
```

### Phase 3: Processamento e ciclo de vida

```text
T13 -> T14 -> T15 -> T16 -> T17 -> T18 -> T19
```

### Phase 4: Contrato de contexto e CRM

```text
T20 -> T21 -> T22 -> T23 -> T24 -> T25 -> T26 -> T27
```

### Phase 5: Integração conectada e benchmark

```text
T28 -> T29 -> T30 -> T31 -> T32 -> T33 -> T34
T28 ---------------------------------> T33
```

### Phase 6: Prova e liberação

```text
T35 -> T36 -> T37
```

---

## Task Breakdown

### Phase 1: Fundação de plataforma e dados

#### T1: Adicionar dependências do pipeline documental

**What:** Fixar as versões compatíveis de Blob, Workflow, extratores PDF/DOCX e harness de Workflow, atualizando o lockfile sem alterar comportamento.  
**Where:** `package.json`  
**Depends on:** None  
**Reuses:** npm e stack TypeScript já existentes  
**Requirement:** DOCBIN-01, DOCTXT-01  
**Tools:** Storage + Workflow

**Done when:**

- [x] `@vercel/blob`, `workflow`, `unpdf`, `mammoth` e dependências técnicas estritamente necessárias estão fixadas em versões compatíveis.
- [x] `package-lock.json` reflete somente a instalação aprovada, sem pacote de RAG/OCR.
- [x] Auditoria das APIs instaladas é registrada para T2, T7 e T14.
- [x] Gate Build passa; total da suíte permanece no mínimo no baseline.

**Tests:** build-only  
**Gate:** Build  
**Commit:** `chore(deps): add document processing dependencies`

**Evidence (2026-09-16):** Installed and lockfile-resolved versions are `@vercel/blob@2.8.0`, `workflow@4.8.9`, `unpdf@1.8.1`, `mammoth@1.12.3`, and development harness `@workflow/vitest@4.0.25`. Node `v24.18.0` satisfies the strictest installed engine (`unpdf >=22`); no OCR or RAG dependency was added. API audit: T2 uses `withWorkflow` from `workflow/next`; T7 will use the Blob client-upload helpers plus server `head`, `get`, and `del` behind the storage contract; T14 will use the installed Workflow `start` API and `@workflow/vitest` harness. The versioned Workflow guide remains mandatory before T2/T14.

#### T2: Integrar Workflow ao build do Next

**What:** Configurar o plugin oficial do Workflow no Next 16 conforme as docs instaladas, preservando toda configuração atual.  
**Where:** `next.config.ts`  
**Depends on:** T1  
**Reuses:** configuração Next existente e `withWorkflow` da versão instalada  
**Requirement:** DOCTXT-01  
**Tools:** Workflow + Next API

**Done when:**

- [x] Guias relevantes de Next 16 e `node_modules/workflow/docs/getting-started/next.mdx` foram lidos.
- [x] O config exportado mantém as opções anteriores e habilita a compilação de `use workflow`/`use step`.
- [x] Health/build do Workflow é verificável localmente sem iniciar processamento real.
- [x] Gate Build passa sem warning novo do plugin.

**Tests:** build-only  
**Gate:** Build  
**Commit:** `chore(workflow): enable workflow in next`

**Evidence (2026-09-16):** Local Next 16 configuration and TypeScript guides plus `workflow@4.8.9`'s `getting-started/next.mdx` were read. `next.config.ts` preserves its `NextConfig` object and exports `withWorkflow(nextConfig)`. `npm run build` reported `workflows build complete (3 steps, 0 workflows)` and generated the internal Workflow routes; no workflow was started. The build, lint (0 errors; 3 pre-existing warnings), and full test suite (91 files, 1,357 tests) passed.

#### T3: Modelar persistência documental completa

**What:** Adicionar enums, intents, limites e campos de storage/processamento/tombstone ao schema Drizzle, com índices tenant-scoped.  
**Where:** `src/db/schema.ts`  
**Depends on:** T2  
**Reuses:** `documents`, `documentCategories`, `tenants`, índices parciais e timestamps existentes  
**Requirement:** DOCBIN-01, DOCTXT-01, DOCLIM-01, DOCLIFE-01  
**Tools:** Local Core

**Done when:**

- [x] `document_upload_intents`, `tenant_document_context_limits` e os campos aprovados de `documents` existem com tipos/defaults corretos.
- [x] Unicidade parcial de hash por tenant, índices de contexto/listagem/manutenção e relações preservam isolamento.
- [x] Schema não armazena URL pública nem credencial do Blob.
- [x] `drizzle-kit push --config drizzle-test.config.ts` converge no banco descartável após autorização local do gate.
- [x] Gate Build passa; inspeção do schema de teste confirma colunas e índices.

**Tests:** build-only + schema inspection  
**Gate:** Build  
**Commit:** `feat(documents): extend document persistence schema`

**Evidence (2026-09-16):** Após confirmação explícita de que o endpoint Neon de teste era descartável, foram removidas somente as linhas `documents` metadata-only desse branch antes da introdução dos campos obrigatórios. O push usou a conexão direta do branch de teste (não o pooler) e convergiu. A inspeção posterior confirmou as três tabelas, enums, defaults, FKs, índices tenant-scoped e índices parciais; nenhuma URL pública ou credencial foi persistida. `npm run lint` teve 0 erros (5 avisos, incluindo 2 gerados pelo Workflow) e `npm run build` passou. A remoção do seed metadata-only e a compatibilidade temporária para rotas legadas foram incluídas nesta unidade porque o schema obrigatório torna o estado intermediário inválido para build/teste.

#### T4: Criar repositório transacional de documentos

**What:** Implementar o módulo de acesso a dados para intents, projeções leves, CAS de attempts, limites, tombstones e consultas tenant-scoped.  
**Where:** `src/server/documents/repository.ts`  
**Depends on:** T3  
**Reuses:** `src/db`, padrões Drizzle de `src/server/data/index.ts` e `serviceScope`  
**Requirement:** DOCBIN-01, DOCTXT-01, DOCCTX-01, DOCLIM-01, DOCLIFE-01  
**Tools:** Local Core

**Done when:**

- [x] Toda leitura/escrita exige tenant e nunca seleciona `extractedText` na listagem.
- [x] Reservas/finalizações concorrentes, unique violations e CAS retornam resultados de domínio estáveis.
- [x] Operações de retry, conclusão, expiração e tombstone aplicam attempt/estado/validade/deletedAt atomicamente.
- [x] Testes cobrem queries críticas, concorrência simulada, outro tenant, insert failure e boundaries.
- [x] Pelo menos 16 testes de integração novos passam; nenhum teste anterior é removido.

**Tests:** integration  
**Gate:** Full  
**Commit:** `feat(documents): add transactional document repository`

**Evidence (2026-09-16):** `src/server/documents/repository.ts` centraliza todas as operações por tenant: intent, finalização idempotente, projeção de listagem sem texto extraído, CAS de processamento, tombstone, expiração e limites de contexto. A finalização trata disputa de hash com `ON CONFLICT DO NOTHING` contra o índice parcial, evitando transação abortada; os resultados expõem somente estados de domínio. Os 18 novos testes do repositório passaram, assim como lint direcionado e a suíte completa (92 arquivos, 1.373 testes).

#### T5: Remover documentos fictícios do seed

**What:** Parar de semear linhas metadata-only de documentos, preservando categorias, tenants e demais fixtures.  
**Where:** `src/db/seed.ts`  
**Depends on:** T4  
**Reuses:** seed determinístico e testes de contagem existentes  
**Requirement:** DOCBIN-01, DOCLIFE-01  
**Tools:** Local Core

**Done when:**

- [x] Seed continua criando categorias úteis, mas zero documento sem Blob/texto.
- [x] Antes/depois de entidades não relacionadas é afirmado explicitamente conforme L-001.
- [x] Testes provam zero documento fictício, categorias preservadas e tenants isolados.
- [x] Pelo menos 3 asserções de integração novas passam; nenhum dado fora do banco de teste é alterado.

**Tests:** integration  
**Gate:** Full  
**Commit:** `test(seed): remove synthetic document rows`

**Evidence (2026-09-16):** O seed preserva tenants, categorias, usuários, permissões, API keys, leads e demais fixtures, mas não cria mais documentos metadata-only. O teste de seed afirma explicitamente coleção documental vazia e preservação de categorias; as fixtures de integração agora criam documentos completos isolados por tenant quando precisam exercitar a leitura. A suíte completa passou: 92 arquivos e 1.373 testes. Esta alteração acompanhou o commit do schema T3, pois deixar o seed antigo contra as novas colunas obrigatórias quebraria o build e a regressão entre commits.

#### T6: Definir contrato independente de storage

**What:** Criar `DocumentStorage`, tipos de stream/metadata, gerador de chave opaca e erros sanitizados independentes do provedor.  
**Where:** `src/server/documents/storage.ts`  
**Depends on:** T5  
**Reuses:** tipos Web Streams e convenções server-only  
**Requirement:** DOCBIN-01, DOCVIEW-01, DOCLIFE-01  
**Tools:** Storage

**Done when:**

- [x] Interface cobre autorização, `head`, `open` e `delete` sem expor URL como identidade.
- [x] Chaves não contêm filename e são imutáveis; filename de download é sanitizado separadamente.
- [x] Erros distinguem ausente, transitório e permanente sem conteúdo sensível.
- [x] Pelo menos 8 testes unitários cobrem chaves, filename e tradução de erros.

**Tests:** unit  
**Gate:** Quick  
**Commit:** `feat(documents): define document storage contract`

**Evidence (2026-09-16):** O contrato independente expõe somente capability de upload, metadados, stream e operações `head`/`open`/`delete`; URL não é identidade persistível. A chave é versionada, imutável e formada apenas por UUIDs emitidos pelo servidor. O filename de download é sanitizado à parte para uso futuro em `Content-Disposition`. A tradução de exceções reduz erros de provedor a `absent`, `transient` ou `permanent`, com mensagens/códigos estáveis sem segredos. Os 11 testes unitários e o lint direcionado passaram.

### Phase 2: Entrada, storage e extração

#### T7: Implementar adapter do Vercel Private Blob

**What:** Implementar `DocumentStorage` com client-upload privado, `head`, `get` por stream e `del` idempotente.  
**Where:** `src/server/documents/vercel-blob-storage.ts`  
**Depends on:** T6  
**Reuses:** `@vercel/blob` instalado e contrato T6  
**Requirement:** DOCBIN-01, DOCVIEW-01, DOCLIFE-01  
**Tools:** Storage

**Done when:**

- [x] Upload usa `access: private`, token curto, tamanho/MIME permitidos e overwrite desabilitado.
- [x] `open` devolve stream e metadata; `delete` trata objeto ausente como sucesso.
- [x] Nenhum token, URL ou corpo aparece em log.
- [x] Pelo menos 10 testes unitários com SDK mockado cobrem sucesso, ausência e falhas transitórias/permanentes.

**Tests:** unit  
**Gate:** Quick  
**Commit:** `feat(documents): add vercel blob storage adapter`

**Evidence (2026-09-16):** `VercelBlobDocumentStorage` usa exclusivamente `generateClientTokenFromReadWriteToken`, `head`, `get` e `del` da versão instalada. O grant exige `access: "private"`, expira em no máximo cinco minutos, limita pathname, MIME e tamanho a 10 MiB e proíbe suffix/overwrite. `head`/`open` removem URLs do retorno; `open` devolve stream privado; `delete` torna ausência idempotente; as exceções são convertidas para o vocabulário sanitizado do domínio. Os 14 testes com SDK mockado e o lint direcionado passaram.

#### T8: Implementar intake e finalização idempotente

**What:** Criar o serviço de intent, preflight, verificação server-side e finalização/compensação de uploads.  
**Where:** `src/server/documents/uploads.ts`  
**Depends on:** T4, T7  
**Reuses:** repository T4, storage T7 e validações existentes  
**Requirement:** DOCBIN-01, DOCLIFE-01  
**Tools:** Storage

**Done when:**

- [x] Permissão é exigida antes de token/objeto; intent expira em 1 hora.
- [x] Hash é recalculado por stream; tamanho, ETag, assinatura, MIME e estrutura são verificados antes da linha visível.
- [x] Callback e cliente repetidos devolvem o mesmo `documentId`.
- [x] Duplicata concorrente no tenant aceita no máximo uma; outro tenant não é revelado.
- [x] Falha entre Blob e DB apaga ou agenda compensação, comprovada por fault injection conforme L-002.
- [x] Pelo menos 18 testes de integração novos passam.

**Tests:** integration  
**Gate:** Full  
**Commit:** `feat(documents): add idempotent upload intake`

**Evidence (2026-09-16):** `uploads.ts` revalida `documentos:escrever`, cria intent tenant-scoped com TTL de uma hora, usa chave UUID opaca e só pede grant depois da reserva. A finalização usa apenas o `intentId` confirmado pelo callback futuro, relê o objeto privado e recalcula SHA-256 por stream; tamanho, ETag, MIME, assinatura PDF/DOCX e estrutura textual básica precisam coincidir antes de `commitUploadIntent` criar `processando`. Repetições devolvem o mesmo documento; duplicatas concorrentes mantêm um único registro; outro tenant recebe sua própria intent. A falha entre Blob e banco marca a intent `failed`, remove o objeto ou preserva a chave opaca para compensação diária. Os 24 testes de integração e a suíte completa passaram (95 arquivos, 1.422 testes).

#### T9: Expor handler autenticado de client upload

**What:** Criar Route Handler para geração de token e `onUploadCompleted`, delegando toda regra ao serviço T8.  
**Where:** `app/api/documents/upload/route.ts`  
**Depends on:** T8  
**Reuses:** sessão Better Auth, permissões e `handleUpload` da versão instalada  
**Requirement:** DOCBIN-01  
**Tools:** Storage + Next API

**Done when:**

- [x] Handler diferencia generate-token e upload-completed sem confiar em `clientPayload` não validado.
- [x] Usuário sem permissão não recebe token e nenhum byte é lido/armazenado.
- [x] Respostas de erro são seguras e callbacks podem ser repetidos.
- [x] Pelo menos 12 testes de rota cobrem auth, payload, tamanho, MIME, callback repetido e compensação.

**Tests:** integration/e2e  
**Gate:** Full  
**Commit:** `feat(documents): add private client upload handler`

**Evidence (2026-09-16):** o Route Handler reserva e autoriza metadados somente pela intake T8, substitui o pathname fornecido pelo navegador pela chave UUID opaca e pede ao `handleUpload` um token privado que restringe MIME, tamanho, validade, sobrescrita e callback. O callback só usa o `intentId` incluído no payload assinado e deixa a releitura/compensação ao T8. Quatorze testes de rota cobrem payload, autorização, limites, repetição e compensação; `npm test` passou com 96 arquivos e 1.436 testes.

#### T10: Implementar decodificação e normalização segura

**What:** Criar funções puras para BOM, UTF-8 estrito, fallback Windows-1252, detecção binária e normalização mínima.  
**Where:** `src/server/documents/text.ts`  
**Depends on:** T9  
**Reuses:** `TextDecoder`, limites e mensagens do design  
**Requirement:** DOCTXT-01  
**Tools:** Local Core

**Done when:**

- [x] Palavras, números, pontuação, delimitadores e quebras internas são preservados.
- [x] CRLF/CR viram LF; BOM e apenas whitespace externo são removidos.
- [x] Conteúdo vazio/invisível e controles binários são recusados.
- [x] Pelo menos 14 testes unitários cobrem UTF-8, BOM, Windows-1252, CSV/MD e bytes inválidos.

**Tests:** unit  
**Gate:** Quick  
**Commit:** `feat(documents): add safe text decoding`

**Evidence (2026-09-16):** `text.ts` usa UTF-8 fatal, fallback explícito Windows-1252 e rejeita controles binários depois de decodificar. A normalização só remove BOM, padroniza quebras e faz trim externo. Os 15 testes preservam CSV/Markdown e conteúdo interno, além de cobrir BOM, fallback, controles, vazio e Unicode invisível.

#### T11: Implementar extratores nativos e guardas estruturais

**What:** Extrair PDF, DOCX, TXT, Markdown e CSV com limites de páginas, imagens, ZIP, tempo e tamanho de saída.  
**Where:** `src/server/documents/extraction.ts`  
**Depends on:** T10  
**Reuses:** `unpdf`, `mammoth`, decoder T10 e fixtures locais  
**Requirement:** DOCTXT-01  
**Tools:** Local Core

**Done when:**

- [x] Cada formato válido produz Unicode normalizado sem OCR nem interpretação ativa.
- [x] PDF somente imagem produz `nenhum_texto_extraivel`.
- [x] Limites 500 páginas/16 MP, 2.000 entradas/50 MiB e 20 MiB extraídos são aplicados no boundary exato.
- [x] Erros são classificados em permanentes/transitórios e não vazam stack/path.
- [x] Pelo menos 20 testes unitários com fixtures cobrem todos os formatos e limites.

**Tests:** unit  
**Gate:** Quick  
**Commit:** `feat(documents): extract native document text`

**Evidence (2026-09-16):** `extraction.ts` extrai apenas texto nativo: `unpdf` verifica páginas e imagens sem OCR; DOCX tem preflight de ZIP antes de `mammoth`; TXT/MD/CSV reutilizam o decoder estrito. Limites de página, imagem, ZIP, saída e timeout retornam códigos seguros. Os 20 testes cobrem os cinco formatos, PDF sem texto, boundaries e falhas transitórias/permanentes.

#### T12: Implementar medição e admissão de corpus

**What:** Criar serialização canônica, contagem UTF-8 e reconciliação `pronto`/`fora_do_agente` para os três corpora.  
**Where:** `src/server/documents/context-budget.ts`  
**Depends on:** T4, T11  
**Reuses:** repository T4 e envelope aprovado  
**Requirement:** DOCLIM-01, DOCCTX-01  
**Tools:** Local Core

**Done when:**

- [x] `novo`, `usado` e `ambos` contam exatamente o JSON que a API retornará.
- [x] Um documento só entra se couber integralmente em todos os corpora aplicáveis.
- [x] Incumbentes são preservados; outsiders são avaliados por idade e candidatos posteriores continuam após um grande não caber.
- [x] Redução de teto rebalanceia por antiguidade; benchmark stale não amplia teto.
- [x] Pelo menos 18 testes unitários/integrados cobrem modalidade, overhead, boundaries, promoção e não truncamento.

**Tests:** unit + integration  
**Gate:** Full  
**Commit:** `feat(documents): enforce direct context budgets`

**Evidence (2026-09-16):** `context-budget.ts` constrói exatamente o envelope direto aprovado e mede seus bytes UTF-8 via JSON canônico. A admissão exige cabimento integral em todos os corpora aplicáveis, preserva incumbentes enquanto o teto comporta o corpus, reequilibra por antiguidade após redução e continua avaliando candidatos posteriores. Os 19 testes cobrem modalidade, overhead, boundaries, promoção, redução e texto integral; `npm test` passou com 99 arquivos e 1.490 testes.

### Phase 3: Processamento e ciclo de vida

#### T13: Implementar estado e conclusão CAS do processamento

**What:** Criar serviço de despacho, retry e conclusão por attempt, incluindo sanitização e reconciliação de orçamento.  
**Where:** `src/server/documents/processing.ts`  
**Depends on:** T4, T11, T12  
**Reuses:** repository, extratores e budget das fases anteriores  
**Requirement:** DOCTXT-01, DOCLIM-01, DOCLIFE-01  
**Tools:** Workflow

**Done when:**

- [x] Retry concorrente cria um único attempt lógico e reutiliza o original.
- [x] Resultado antigo, excluído ou expirado é no-op.
- [x] Sucesso limpa erro e define `pronto`/`fora_do_agente`; falha preserva original.
- [x] Três falhas de dispatch levam a `processamento_indisponivel`, nunca `processando` eterno.
- [x] Pelo menos 16 testes de integração cobrem concorrência, late result, delete/expiry e fault injection.

**Tests:** integration  
**Gate:** Full  
**Commit:** `feat(documents): add attempt-safe processing service`

#### T14: Orquestrar extração no Vercel Workflow

**What:** Criar workflow e steps Node para abrir o Blob, extrair e concluir sem persistir binário/texto no event log.  
**Where:** `workflows/process-document.ts`  
**Depends on:** T2, T13  
**Reuses:** Workflow SDK instalado, storage, extraction e processing  
**Requirement:** DOCTXT-01, DOCLIFE-01  
**Tools:** Workflow

**Done when:**

- [x] Função `use workflow` apenas orquestra IDs; I/O e npm ficam em `use step`.
- [x] Input/output durável contém somente IDs, attempt e métricas pequenas.
- [x] `FatalError`/`RetryableError` refletem a taxonomia e limitam transientes a três tentativas.
- [x] Harness `@workflow/vitest` prova replay, retry, fatal, timeout e CAS stale.
- [x] Pelo menos 10 testes unitários/workflow integration passam.

**Tests:** workflow integration  
**Gate:** Full  
**Commit:** `feat(documents): process documents in durable workflow`

#### T15: Conectar actions de edição, retry e exclusão

**What:** Evoluir as server actions para validade, retry e exclusão por tombstone com guards de papel e mensagens seguras.  
**Where:** `src/server/actions/documents.ts`  
**Depends on:** T14  
**Reuses:** `denyIfForbidden`, tenant ativo e serviços documentais  
**Requirement:** DOCTXT-01, DOCVIEW-01, DOCLIFE-01  
**Tools:** Local Core

**Done when:**

- [x] Admin/gestor podem editar validade/modalidade, reprocessar falha e excluir; corretor é recusado sem mutação.
- [x] Data ausente, vazia, inválida e passada têm semânticas separadas conforme L-005.
- [x] Mudança de modalidade dispara reconciliação e preserva conteúdo/original em erro.
- [x] Duas actions concorrentes produzem estado final idempotente.
- [x] Pelo menos 16 testes de integração novos passam.

**Tests:** integration  
**Gate:** Full  
**Commit:** `feat(documents): wire document lifecycle actions`

#### T16: Criar rota de preview textual

**What:** Expor preview sob demanda somente para documento ativo em `pronto`/`fora_do_agente`, com tenant e permissão.  
**Where:** `app/api/documents/[id]/preview/route.ts`  
**Depends on:** T15  
**Reuses:** sessão, `documentos:ler`, repository e mensagens 404 indistinguíveis  
**Requirement:** DOCVIEW-01  
**Tools:** Next API

**Done when:**

- [x] `pronto` retorna texto integral; `fora_do_agente` inclui aviso/estado.
- [x] Processando/falha não retornam texto; expirado/deleted/outro tenant retornam 404 seguro.
- [x] Sem permissão não cria token nem conteúdo parcial.
- [x] Resposta é `no-store` e texto nunca é interpretado.
- [x] Pelo menos 10 testes de rota cobrem todos os estados e papéis.

**Tests:** integration/e2e  
**Gate:** Full  
**Commit:** `feat(documents): add extracted text preview route`

#### T17: Criar download autenticado por streaming

**What:** Expor o original ativo pelo stream do Private Blob com filename e headers seguros.  
**Where:** `app/api/documents/[id]/download/route.ts`  
**Depends on:** T7, T16  
**Reuses:** sessão, storage adapter e sanitização T6  
**Requirement:** DOCBIN-01, DOCVIEW-01, DOCLIFE-01  
**Tools:** Storage + Next API

**Done when:**

- [ ] Download funciona em processando/pronto/falha/fora e bloqueia expirado/deleted/objeto ausente.
- [ ] Outro tenant e sem permissão não recebem metadata, URL nem stream.
- [ ] Headers incluem attachment, MIME seguro, `nosniff` e `private, no-store`.
- [ ] Bytes e SHA-256 da resposta igualam a fixture original.
- [ ] Pelo menos 12 testes de rota cobrem headers, estados, integridade e erro de storage.

**Tests:** integration/e2e  
**Gate:** Full  
**Commit:** `feat(documents): stream authenticated original downloads`

#### T18: Implementar tombstone e remoção física

**What:** Criar lifecycle que bloqueia/limpa texto atomicamente, remove Blob por retry e só então apaga a linha.  
**Where:** `src/server/documents/lifecycle.ts`  
**Depends on:** T12, T17  
**Reuses:** repository, storage e reconciliação de budget  
**Requirement:** DOCLIFE-01, DOCVIEW-01  
**Tools:** Storage

**Done when:**

- [ ] Exclusão/expiração marcam tombstone e removem texto antes da chamada externa.
- [ ] `delete`/`head` idempotentes confirmam ausência antes do hard delete.
- [ ] Falha externa mantém linha inacessível e registra somente código sanitizado.
- [ ] Conclusão tardia do Workflow não reativa linha.
- [ ] Pelo menos 16 testes de integração cobrem falha parcial, concorrência e outro tenant.

**Tests:** integration  
**Gate:** Full  
**Commit:** `feat(documents): add tombstone document lifecycle`

#### T19: Isolar grupos da manutenção diária

**What:** Refatorar a rotina diária para expiração, tombstones, intents órfãs e recusas de integração independentes.  
**Where:** `src/server/integration/lgpd.ts`  
**Depends on:** T18  
**Reuses:** cron atual, `purgeIntegrationRefusals` e lifecycle T18  
**Requirement:** DOCLIFE-01  
**Tools:** Local Core

**Done when:**

- [ ] Boundary `expiresAt <= now` bloqueia e processa exatamente no instante conforme L-023.
- [ ] Falha de qualquer grupo não impede os outros e aparece no resultado sanitizado.
- [ ] Intents vencidas e objetos órfãos são compensados; tombstones falhos são retomados.
- [ ] Testes da rota cron continuam verdes e cobrem falha independente de cada grupo.
- [ ] Pelo menos 10 testes de integração novos passam.

**Tests:** integration  
**Gate:** Full  
**Commit:** `feat(documents): isolate daily document maintenance`

### Phase 4: Contrato de contexto e CRM

#### T20: Implementar fonte direta de contexto

**What:** Substituir `content: null` por `DocumentContextSource` direto, envelope canônico e queries prontas/ativas ordenadas.  
**Where:** `src/server/integration/context.ts`  
**Depends on:** T12, T19  
**Reuses:** repository, budget e categoria existentes  
**Requirement:** DOCCTX-01, DOCLIM-01  
**Tools:** Local Core

**Done when:**

- [ ] `novo`, `usado` e `ambos` obedecem compatibilidade sem duplicar.
- [ ] Somente `pronto`, ativo e não expirado retorna texto integral.
- [ ] Perguntas diferentes mantêm conjunto/ordem no modo `direct`.
- [ ] Resposta vazia é isolada por tenant e serialização coincide byte a byte com T12.
- [ ] Pelo menos 16 testes de integração novos cobrem os 13 ACs de DOCCTX-01 aplicáveis ao serviço.

**Tests:** integration  
**Gate:** Full  
**Commit:** `feat(context): serve direct document corpus`

#### T21: Migrar `/api/v1/context` para POST

**What:** Aceitar `{modality, question}` em POST, manter GET legado temporário e preservar instrumentação/problem+json.  
**Where:** `app/api/v1/context/route.ts`  
**Depends on:** T20  
**Reuses:** `withIntegrationRoute`, auth de serviço e `problem()`  
**Requirement:** DOCCTX-01, DOCPROVA-01  
**Tools:** Next API

**Done when:**

- [ ] POST valida modalidade e question `trim` de 1–4.096 caracteres; campo ausente e vazio têm testes distintos.
- [ ] Tenant/header não vem do modelo; question não aparece em URL/log/resposta.
- [ ] Resposta usa envelope, ordem e `Cache-Control: no-store`.
- [ ] GET legado continua apenas para rollback e métodos restantes anunciam contrato correto.
- [ ] Pelo menos 15 testes de rota cobrem auth, isolamento, body, métodos e recusas instrumentadas.

**Tests:** integration/e2e  
**Gate:** Full  
**Commit:** `feat(api): add document context post contract`

#### T22: Atualizar contrato OpenAPI de contexto

**What:** Documentar POST, três modalidades, pergunta, envelope e problemas sem publicar conteúdo de exemplo sensível.  
**Where:** `docs/integration/openapi.yaml`  
**Depends on:** T21  
**Reuses:** schemas e exemplos existentes do contrato v1  
**Requirement:** DOCCTX-01  
**Tools:** Local Core

**Done when:**

- [ ] Request/response e limites refletem o handler exatamente.
- [ ] Auth, tenant e códigos de erro permanecem documentados.
- [ ] Teste OpenAPI valida o documento e paridade de métodos/schemas.
- [ ] Pelo menos 5 asserções contratuais novas passam.

**Tests:** integration  
**Gate:** Full  
**Commit:** `docs(api): document context post contract`

#### T23: Transformar UploadDialog em upload real

**What:** Implementar hash no navegador, intent/client upload, progresso, validade opcional e preservação do formulário em falha.  
**Where:** `src/components/documents/upload-dialog.tsx`  
**Depends on:** T9, T22  
**Reuses:** Dialog/Layout atuais, `ProgressBar`, `DateTimeInput`, categorias e validações  
**Requirement:** DOCBIN-01, DOCLIFE-01  
**Tools:** UI + Storage

**Done when:**

- [ ] Estados “Validando”, “Enviando” e “Preparando processamento” são observáveis e acessíveis.
- [ ] SHA-256 e upload rodam sem enviar o binário pela server action.
- [ ] Data/hora futura ou sem validade funciona; erro preserva campos/arquivo quando suportado.
- [ ] Duplicata orienta a editar o documento existente.
- [ ] Self-check Astryx passa sem `div`, estilo inline, CSS novo ou valor arbitrário.
- [ ] Seis cenários de navegador e screenshots cobrem sucesso, progresso e falhas.

**Tests:** browser e2e + build  
**Gate:** Build  
**Commit:** `feat(documents): upload files with progress`

#### T24: Criar dialog de preview inerte

**What:** Adicionar preview fullscreen carregado sob demanda para texto extraído e aviso de limite.  
**Where:** `src/components/documents/document-preview-dialog.tsx`  
**Depends on:** T16, T23  
**Reuses:** `Dialog`, `CodeBlock`, `Banner` e rota T16  
**Requirement:** DOCVIEW-01, DOCLIM-01  
**Tools:** UI

**Done when:**

- [ ] Texto não vem na listagem e só é buscado ao abrir.
- [ ] HTML, Markdown, scripts e links permanecem texto inerte.
- [ ] Estado fora do agente mostra aviso; loading/erro/fechar são acessíveis.
- [ ] Self-check Astryx passa.
- [ ] Pelo menos cinco cenários de navegador incluem payload hostil e texto longo.

**Tests:** browser e2e + build  
**Gate:** Build  
**Commit:** `feat(documents): preview extracted text safely`

#### T25: Exibir estados e ações por papel na tabela

**What:** Acrescentar `StatusDot`, validade com hora e ações condicionais de preview/download/retry/edit/delete.  
**Where:** `src/components/documents/documents-table.tsx`  
**Depends on:** T15, T17, T24  
**Reuses:** Table compacta, AlertDialog, menus e FileTypeIcon existentes  
**Requirement:** DOCTXT-01, DOCLIM-01, DOCVIEW-01, DOCLIFE-01  
**Tools:** UI

**Done when:**

- [ ] Todos os estados têm texto e semântica, com expirado derivado pelo instante.
- [ ] Corretor só vê leitura; admin/gestor veem escrita; APIs continuam sendo autoridade.
- [ ] Preview fica oculto em processando/falha; download fica disponível quando permitido.
- [ ] Exclusão mantém confirmação permanente e retry explica erro seguro.
- [ ] Oito cenários de navegador e screenshots cobrem estados e papéis.

**Tests:** browser e2e + build  
**Gate:** Build  
**Commit:** `feat(documents): show document states and actions`

#### T26: Criar refresh limitado para processamento

**What:** Adicionar ilha cliente que atualiza o RSC enquanto houver documento processando, pausando quando oculto.  
**Where:** `src/components/documents/document-processing-refresh.tsx`  
**Depends on:** T25  
**Reuses:** `router.refresh`, Page Visibility API e props booleanas  
**Requirement:** DOCTXT-01  
**Tools:** UI

**Done when:**

- [ ] Intervalo aproximado de 3 s existe apenas com `hasProcessingDocuments`.
- [ ] Aba oculta pausa; unmount/estado terminal limpam timer; não há polling duplicado.
- [ ] Quatro cenários de navegador provam start/pause/resume/stop.
- [ ] Gate Build e self-check React passam.

**Tests:** browser e2e + build  
**Gate:** Build  
**Commit:** `feat(documents): refresh processing document states`

#### T27: Integrar permissões, banner e novos componentes na página

**What:** Compor RSC de documentos com projeção leve, permissões, stale benchmark, dialogs e refresh.  
**Where:** `app/(crm)/documentos/page.tsx`  
**Depends on:** T26  
**Reuses:** página RSC, filtros, toolbar, tenant ativo e componentes T23–T26  
**Requirement:** DOCLIM-01, DOCVIEW-01, DOCLIFE-01  
**Tools:** UI + Next API

**Done when:**

- [ ] RSC não serializa `extractedText` e passa somente dados necessários.
- [ ] Upload/gestão aparecem conforme `documentos:escrever`; leitura conforme `documentos:ler`.
- [ ] Benchmark stale/ausente aparece somente a admin/gestor sem ampliar teto.
- [ ] Empty/filter states continuam corretos e polling só monta quando necessário.
- [ ] Seis cenários visuais desktop cobrem vazio, filtros, papéis, stale e todos os estados.

**Tests:** browser e2e + build  
**Gate:** Build  
**Commit:** `feat(documents): integrate document management page`

### Phase 5: Integração conectada e benchmark

#### T28: Migrar a tool `consultar_documentos`

**What:** Alterar a definição fonte do n8n para POST com modalidade/pergunta determinísticas e preservar modelo, credencial e demais nós.  
**Where:** `n8n/workflows/principal.ts`  
**Depends on:** T21, T27  
**Reuses:** `Code: gate`, pergunta montada do buffer, credencial HTTP Header e gerador n8n existente  
**Requirement:** DOCCTX-01, DOCPROVA-01  
**Tools:** n8n

**Done when:**

- [ ] Body envia modalidade real `novo|usado|ambos` e pergunta do lead; nenhum parâmetro usa `$fromAI`.
- [ ] Conteúdo retornado fica disponível ao agente antes da resposta.
- [ ] Modelo snapshot, reasoning, memória, tools e conexões não relacionadas ficam idênticos.
- [ ] Generated workflow é regenerado e parity test passa.
- [ ] Pelo menos oito testes estruturais novos cobrem body, ausência de GET/fallback e invariantes.

**Tests:** unit/structural  
**Gate:** Quick  
**Commit:** `feat(agent): send question to document context`

#### T29: Provisionar Private Blob de Frankfurt

**What:** Criar/conectar o store privado correto ao ambiente de preview e registrar evidência sanitizada.  
**Where:** `.specs/features/lote-12-conteudo-de-documentos/tasks.md`  
**Depends on:** T28  
**Reuses:** projeto Vercel existente e AD-030  
**Requirement:** DOCBIN-01, DOCVIEW-01  
**Tools:** Connected + Storage

**Done when:**

- [ ] Usuário autorizou explicitamente a criação/conexão externa nesta tarefa.
- [ ] Store é Private, Frankfurt, ligado apenas aos ambientes aprovados e sem segredo copiado à evidência.
- [ ] Upload/read/delete sintético mínimo confirma conectividade; objeto scratch é removido.
- [ ] Evidência registra projeto/store por identificador não secreto e resultado.

**Tests:** connected e2e/manual  
**Gate:** Full  
**Commit:** `chore(storage): record private blob provisioning`

#### T30: Habilitar Workflow no ambiente de preview

**What:** Validar endpoints/Fluid Compute e executar um run canário no deployment preview.  
**Where:** `.specs/features/lote-12-conteudo-de-documentos/tasks.md`  
**Depends on:** T2, T14, T29  
**Reuses:** configuração T2, Workflow T14 e CLI oficial  
**Requirement:** DOCTXT-01  
**Tools:** Connected + Workflow

**Done when:**

- [ ] Usuário autorizou deploy/configuração externa desta tarefa.
- [ ] Preview build expõe health correto e um run sintético conclui.
- [ ] Inspeção confirma inputs/outputs sem binário/texto.
- [ ] Run ID e status são registrados sem payload sensível.

**Tests:** workflow connected e2e  
**Gate:** Build  
**Commit:** `chore(workflow): record preview workflow readiness`

#### T31: Aplicar schema e descarte aprovado no ambiente de teste/preview

**What:** Convergir schema conectado e apagar somente documentos metadata-only, preservando categorias/configurações.  
**Where:** `.specs/features/lote-12-conteudo-de-documentos/tasks.md`  
**Depends on:** T3, T5, T30  
**Reuses:** `drizzle-test.config.ts`, schema T3 e decisão de descarte aprovada  
**Requirement:** DOCBIN-01, DOCLIFE-01  
**Tools:** Connected

**Done when:**

- [ ] Alvo absoluto/DSN mascarado é conferido como teste/preview antes da mutação.
- [ ] Usuário autorizou explicitamente push e exclusão das linhas daquele ambiente.
- [ ] Contagem antes/depois prova só `documents` removido; categorias, tenants e configurações permanecem.
- [ ] Schema introspection confirma constraints/índices e suíte completa passa no banco de teste.

**Tests:** integration + schema inspection  
**Gate:** Full  
**Commit:** `chore(db): record document schema convergence`

#### T32: Provar o fluxo documental no preview

**What:** Executar upload real por formato e validar extração, retry, preview, download, limite, expiry e delete.  
**Where:** `.specs/features/lote-12-conteudo-de-documentos/tasks.md`  
**Depends on:** T9, T14, T19, T27, T31  
**Reuses:** fixtures sintéticas e deployment preview  
**Requirement:** DOCBIN-01, DOCTXT-01, DOCLIM-01, DOCVIEW-01, DOCLIFE-01  
**Tools:** Connected + UI

**Done when:**

- [ ] PDF/DOCX/TXT/MD/CSV válidos percorrem o fluxo; PDF imagem e arquivos inválidos falham corretamente.
- [ ] Cross-tenant, concorrência, retry e resultado tardio não vazam/corrompem.
- [ ] Download é byte a byte idêntico; preview é inerte; expiração boundary bloqueia imediatamente.
- [ ] Tombstone e limpeza removem Blob/linha; nenhum conteúdo aparece em logs.
- [ ] IDs, estados e screenshots sanitizados ficam registrados; objetos scratch são removidos.

**Tests:** connected e2e  
**Gate:** Build  
**Commit:** `test(documents): verify connected document flow`

#### T33: Publicar a tool e configurar retenção do n8n

**What:** Publicar a versão fonte aprovada e aplicar retenção de execução segura antes de documento real.  
**Where:** `.specs/features/lote-12-conteudo-de-documentos/tasks.md`  
**Depends on:** T28, T32  
**Reuses:** protocolo de publicação e hash dos lotes 10/11  
**Requirement:** DOCCTX-01, DOCPROVA-01  
**Tools:** Connected + n8n

**Done when:**

- [ ] Usuário autorizou explicitamente publicação e mudança de configuração do n8n.
- [ ] Versão ativa casa com fonte/generated e preserva modelo/memória/tools não relacionadas.
- [ ] Sucessos/progresso/manuais não persistem; erros têm retenção máxima de 24 h.
- [ ] Execução sintética POST usa pergunta/modalidade corretas e retorna conteúdo antes da resposta.
- [ ] IDs/status são conferidos ao vivo antes de serem citados, conforme L-011.

**Tests:** n8n live e2e  
**Gate:** Full  
**Commit:** `chore(agent): publish context tool and retention policy`

#### T34: Medir e persistir os tetos diretos

**What:** Criar/rodar benchmark reproduzível das três modalidades no workflow/modelo publicados e persistir limites.  
**Where:** `scripts/document-context-benchmark.ts`  
**Depends on:** T12, T20, T33  
**Reuses:** envelope canônico, API de contexto, OpenAI usage e protocolo AD-027  
**Requirement:** DOCLIM-01  
**Tools:** Local Core + Connected

**Done when:**

- [ ] Dataset põe fatos no início/meio/fim, histórico de 50 mensagens, tools/prompt completos e segunda observação.
- [ ] Registra bytes, tokens, latência, custo, qualidade e fórmula/margem por faixa/modalidade.
- [ ] Persiste o menor teto aprovado para cada tenant/modalidade com hashes e timestamps.
- [ ] Alteração simulada de modelo/workflow/prompt/tools marca stale sem ampliar teto.
- [ ] Testes unitários do cálculo e execução conectada das três modalidades passam sem guardar corpus na evidência.

**Tests:** unit + connected e2e  
**Gate:** Full  
**Commit:** `test(context): benchmark direct document limits`

### Phase 6: Prova e liberação

#### T35: Executar prova conversacional document-grounded

**What:** Provar no agente publicado fatos exclusivos, isolamento e exclusão dos estados não elegíveis seguindo AD-027.  
**Where:** `.specs/features/lote-12-conteudo-de-documentos/tasks.md`  
**Depends on:** T33, T34  
**Reuses:** `n8n/smoke/roteiro.md`, checklist de limpeza e barra por desfecho  
**Requirement:** DOCPROVA-01, DOCCTX-01  
**Tools:** Connected + n8n

**Done when:**

- [ ] Lead pergunta fato exclusivo em pronto e recebe resposta compatível sem contradição.
- [ ] Outro tenant e estados processando/falha/fora/expirado não influenciam a resposta.
- [ ] Documento com instrução hostil não altera persona, tools nem regras do agente.
- [ ] Memória persistente não contém observação integral da tool.
- [ ] IDs, estados e resposta mínima são registrados; corpus, chaves e PII ficam fora da evidência.

**Tests:** conversational connected e2e  
**Gate:** Full  
**Commit:** `test(agent): verify document grounded conversation`

#### T36: Remover compatibilidade GET do contexto

**What:** Desativar GET legado após a prova publicada e tornar POST o único método aceito.  
**Where:** `app/api/v1/context/route.ts`  
**Depends on:** T21, T35  
**Reuses:** `methodNotAllowed`, testes de rota e OpenAPI já em POST  
**Requirement:** DOCCTX-01, DOCPROVA-01  
**Tools:** Next API

**Done when:**

- [ ] GET responde 405 com `Allow: POST`; POST permanece idêntico.
- [ ] Nenhum consumidor fonte/generated usa GET ou query string.
- [ ] Testes de contrato, instrumentação e n8n continuam verdes.
- [ ] Pelo menos quatro asserções de regressão cobrem remoção e ausência de fallback.

**Tests:** integration/e2e  
**Gate:** Full  
**Commit:** `refactor(api): remove legacy context get`

#### T37: Liberar e reverificar o lote completo

**What:** Aplicar gates finais, deploy autorizado, schema aprovado no alvo final e smoke pós-release sem ampliar o escopo.  
**Where:** `.specs/features/lote-12-conteudo-de-documentos/tasks.md`  
**Depends on:** T29, T30, T31, T32, T33, T34, T36  
**Reuses:** deployment Vercel, protocolo de publicação n8n e checklist comercial  
**Requirement:** DOCBIN-01, DOCTXT-01, DOCCTX-01, DOCLIM-01, DOCVIEW-01, DOCLIFE-01, DOCPROVA-01  
**Tools:** Connected

**Done when:**

- [ ] Full/Build passam do zero; contagem final e delta são registrados.
- [ ] Usuário autorizou cada deploy/push/schema externo; nenhum force-push foi usado.
- [ ] Ambiente final repete upload → Workflow → preview/download → contexto → resposta → delete.
- [ ] Plano Vercel comercial é gate obrigatório antes de clientes pagantes; ausência bloqueia somente uso comercial, não validação não comercial.
- [ ] Traceability sobe para Implementing; Verifier independente roda depois do commit final, gera `validation.md`, executa sensor e só então pode marcar Verified.

**Tests:** full regression + connected smoke  
**Gate:** Build  
**Commit:** `chore(release): release document content flow`

---

## Phase Execution Map

```text
Phase 1: T1 -> T2 -> T3 -> T4 -> T5 -> T6
Phase 2: T7 -> T8 -> T9 -> T10 -> T11 -> T12
Phase 3: T13 -> T14 -> T15 -> T16 -> T17 -> T18 -> T19
Phase 4: T20 -> T21 -> T22 -> T23 -> T24 -> T25 -> T26 -> T27
Phase 5: T28 -> T29 -> T30 -> T31 -> T32 -> T33 -> T34
Phase 6: T35 -> T36 -> T37
```

Fases rodam na ordem. Dependências cross-phase aparecem nas definições; as setas acima representam a sequência interna de cada fase.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | Um conjunto coeso de dependências em `package.json` | ✅ Granular |
| T2 | Um arquivo de configuração | ✅ Granular |
| T3 | Um schema documental coeso em um arquivo | ⚠️ Coeso; não dividir porque constraints cruzam as três entidades |
| T4 | Um módulo repository | ✅ Granular |
| T5 | Um seed | ✅ Granular |
| T6 | Uma interface de storage | ✅ Granular |
| T7 | Um adapter de storage | ✅ Granular |
| T8 | Um serviço de intake | ✅ Granular |
| T9 | Um endpoint de upload | ✅ Granular |
| T10 | Um módulo puro de texto | ✅ Granular |
| T11 | Um serviço de extração | ✅ Granular |
| T12 | Um serviço de orçamento | ✅ Granular |
| T13 | Um serviço de processamento | ✅ Granular |
| T14 | Um workflow | ✅ Granular |
| T15 | Um boundary de actions documentais | ⚠️ Coeso; ações compartilham a mesma permissão e transições |
| T16 | Um endpoint de preview | ✅ Granular |
| T17 | Um endpoint de download | ✅ Granular |
| T18 | Um serviço de lifecycle | ✅ Granular |
| T19 | Uma rotina de manutenção | ✅ Granular |
| T20 | Uma fonte de contexto | ✅ Granular |
| T21 | Um endpoint de integração | ✅ Granular |
| T22 | Um contrato OpenAPI | ✅ Granular |
| T23 | Um componente de upload | ✅ Granular |
| T24 | Um componente de preview | ✅ Granular |
| T25 | Um componente de tabela | ✅ Granular |
| T26 | Um componente de refresh | ✅ Granular |
| T27 | Uma página RSC | ✅ Granular |
| T28 | Um workflow n8n fonte | ✅ Granular |
| T29 | Um recurso Blob conectado | ✅ Granular |
| T30 | Um ambiente Workflow conectado | ✅ Granular |
| T31 | Uma convergência de schema em ambiente definido | ✅ Granular |
| T32 | Um smoke do fluxo documental conectado | ✅ Granular |
| T33 | Uma publicação/configuração coesa do n8n | ⚠️ Coeso; retenção é pré-condição da mesma ativação |
| T34 | Um benchmark reproduzível | ✅ Granular |
| T35 | Uma prova conversacional | ✅ Granular |
| T36 | Remoção de um método legado | ✅ Granular |
| T37 | Uma liberação final | ✅ Granular |

Nenhuma tarefa tem ❌. Os três itens ⚠️ são unidades transacionais/operacionais que perderiam verificabilidade se divididos.

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows within phase | Status |
| --- | --- | --- | --- |
| T1 | None | início | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | início da fase; T6 cross-phase | ✅ Match |
| T8 | T4, T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T4, T11 | T11 → T12 | ✅ Match |
| T13 | T4, T11, T12 | início da fase; deps cross-phase | ✅ Match |
| T14 | T2, T13 | T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T7, T16 | T16 → T17 | ✅ Match |
| T18 | T12, T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |
| T20 | T12, T19 | início da fase; deps cross-phase | ✅ Match |
| T21 | T20 | T20 → T21 | ✅ Match |
| T22 | T21 | T21 → T22 | ✅ Match |
| T23 | T9, T22 | T22 → T23 | ✅ Match |
| T24 | T16, T23 | T23 → T24 | ✅ Match |
| T25 | T15, T17, T24 | T24 → T25 | ✅ Match |
| T26 | T25 | T25 → T26 | ✅ Match |
| T27 | T26 | T26 → T27 | ✅ Match |
| T28 | T21, T27 | início da fase; deps cross-phase | ✅ Match |
| T29 | T28 | T28 → T29 | ✅ Match |
| T30 | T2, T14, T29 | T29 → T30 | ✅ Match |
| T31 | T3, T5, T30 | T30 → T31 | ✅ Match |
| T32 | T9, T14, T19, T27, T31 | T31 → T32 | ✅ Match |
| T33 | T28, T32 | T32 → T33 | ✅ Match |
| T34 | T12, T20, T33 | T33 → T34 | ✅ Match |
| T35 | T33, T34 | início da fase; deps cross-phase | ✅ Match |
| T36 | T21, T35 | T35 → T36 | ✅ Match |
| T37 | T29, T30, T31, T32, T33, T34, T36 | T36 → T37 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Config/dependencies | build-only | build-only | ✅ OK |
| T2 | Next config | build-only | build-only | ✅ OK |
| T3 | Schema | build-only + inspection | build-only + inspection | ✅ OK |
| T4 | Repository | integration | integration | ✅ OK |
| T5 | Seed | integration | integration | ✅ OK |
| T6 | Domain/storage contract | unit | unit | ✅ OK |
| T7 | Storage adapter | unit | unit | ✅ OK |
| T8 | Upload service | integration | integration | ✅ OK |
| T9 | Route | integration/e2e | integration/e2e | ✅ OK |
| T10 | Domain/text | unit | unit | ✅ OK |
| T11 | Domain/extraction | unit | unit | ✅ OK |
| T12 | Domain + repository | unit + integration | unit + integration | ✅ OK |
| T13 | Processing service | integration | integration | ✅ OK |
| T14 | Workflow | workflow integration | workflow integration | ✅ OK |
| T15 | Server actions | integration | integration | ✅ OK |
| T16 | Route | integration/e2e | integration/e2e | ✅ OK |
| T17 | Route | integration/e2e | integration/e2e | ✅ OK |
| T18 | Lifecycle service | integration | integration | ✅ OK |
| T19 | Maintenance service | integration | integration | ✅ OK |
| T20 | Context service | integration | integration | ✅ OK |
| T21 | Route | integration/e2e | integration/e2e | ✅ OK |
| T22 | OpenAPI | integration | integration | ✅ OK |
| T23 | UI | browser e2e + build | browser e2e + build | ✅ OK |
| T24 | UI | browser e2e + build | browser e2e + build | ✅ OK |
| T25 | UI | browser e2e + build | browser e2e + build | ✅ OK |
| T26 | UI | browser e2e + build | browser e2e + build | ✅ OK |
| T27 | UI/RSC | browser e2e + build | browser e2e + build | ✅ OK |
| T28 | n8n workflow source | unit/structural | unit/structural | ✅ OK |
| T29 | Connected storage | connected e2e/manual | connected e2e/manual | ✅ OK |
| T30 | Connected Workflow | workflow connected e2e | workflow connected e2e | ✅ OK |
| T31 | Connected schema | integration + inspection | integration + inspection | ✅ OK |
| T32 | Connected product flow | connected e2e | connected e2e | ✅ OK |
| T33 | Published n8n | n8n live e2e | n8n live e2e | ✅ OK |
| T34 | Benchmark | unit + connected e2e | unit + connected e2e | ✅ OK |
| T35 | Conversational product | conversational connected e2e | conversational connected e2e | ✅ OK |
| T36 | Route | integration/e2e | integration/e2e | ✅ OK |
| T37 | Release | full regression + connected smoke | full regression + connected smoke | ✅ OK |

Todos os testes são escritos/atualizados na mesma tarefa que cria a camada correspondente. Não existe task posterior de “adicionar testes”.

---

## Requirement Coverage

| Requirement | Tasks |
| --- | --- |
| DOCBIN-01 | T1, T3, T4, T5, T6, T7, T8, T9, T17, T29, T31, T32, T37 |
| DOCTXT-01 | T1, T2, T3, T4, T10, T11, T13, T14, T15, T25, T26, T30, T32, T37 |
| DOCCTX-01 | T4, T12, T20, T21, T22, T28, T33, T35, T36, T37 |
| DOCLIM-01 | T3, T4, T12, T13, T20, T24, T25, T27, T32, T34, T37 |
| DOCVIEW-01 | T6, T7, T15, T16, T17, T18, T23, T24, T25, T27, T29, T32, T37 |
| DOCLIFE-01 | T3, T4, T5, T6, T7, T8, T13, T15, T17, T18, T19, T23, T25, T27, T31, T32, T37 |
| DOCPROVA-01 | T21, T28, T33, T35, T36, T37 |

**Coverage:** 7/7 requisitos mapeados; nenhuma tarefa sem requirement; nenhuma implementação sem teste/gate correspondente.

---

## Execute Packing Preview

Com 37 tarefas, o plano excede um único batch. O empacotamento natural mantém cada fase inteira:

1. Batch 1 — Phase 1 (6 tarefas)
2. Batch 2 — Phase 2 (6 tarefas)
3. Batch 3 — Phase 3 (7 tarefas)
4. Batch 4 — Phase 4 (8 tarefas)
5. Batch 5 — Phase 5 (7 tarefas)
6. Batch 6 — Phase 6 (3 tarefas)

Antes do Execute, a skill deve oferecer subagentes ao usuário. Batches continuam sequenciais e nenhum worker pode iniciar a fase seguinte antes do gate/commits da anterior.
