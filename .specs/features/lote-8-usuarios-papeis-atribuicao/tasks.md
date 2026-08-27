# Lote 8 — Usuários, papéis e atribuição por agenda Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/lote-8-usuarios-papeis-atribuicao/spec.md`
**Design**: `.specs/features/lote-8-usuarios-papeis-atribuicao/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Gerada a partir do codebase, das guidelines do projeto e da spec — confirmar antes do Execute. Guidelines encontradas: `AGENTS.md` / `CLAUDE.md` (convenções de UI e stack; nenhuma regra de teste), `vitest.config.ts` (`environment: node`, `fileParallelism: false` porque os testes batem no Neon real). **Sem CI, sem threshold de cobertura, sem CONTRIBUTING** — logo, defaults fortes aplicados para a expectativa de cobertura, com os 55 arquivos de teste existentes servindo de piso de estilo e localização.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Função pura de domínio (`src/lib/*.ts`) | unit | Todos os ramos; 1:1 com as ACs da spec; toda edge case listada tem teste | `src/lib/__tests__/*.test.ts` | `npm test` |
| Camada de decisão do agente (`n8n/src/*.mjs`) | unit | Todos os ramos; 1:1 com as ACs | `n8n/src/__tests__/*.test.ts` | `npm test` |
| Acesso a dados (`src/server/data/*`) | integration | Caminhos de query principais + erro + isolamento entre tenants **e entre corretores** | `src/server/data/__tests__/*.test.ts` | `npm test` |
| Guarda de sessão e permissão (`src/server/auth/*`) | integration | Sessão ausente, expirada, sem vínculo, vínculo inválido, cada papel × cada recurso | `src/server/auth/__tests__/*.test.ts` | `npm test` |
| Server actions (`src/server/actions/*`) | integration | Caminho feliz + recusa por permissão + entrada inválida | `src/server/__tests__/actions.test.ts` | `npm test` |
| Rotas e contrato (`app/api/**`, `src/server/integration/*`) | integration | Toda rota tocada: feliz + toda edge case listada + caminhos de erro (`problem+json` com `code`) | `src/server/integration/__tests__/**/*.test.ts` | `npm test` |
| Seed (`src/db/seed.ts`) | integration | Determinismo (duas execuções, mesmo estado) + presença dos usuários/papéis/janelas | `src/db/__tests__/seed.test.ts` | `npm test` |
| Schema, config, componentes React, `proxy.ts` | none | — (gate de build; `proxy.ts` é exercitado indiretamente pelos testes de guarda) | — | gate de build |

## Gate Check Commands

> Gerados a partir do codebase — confirmar antes do Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Após tasks com testes unitários de função pura | `npm test` |
| Full | Após tasks que tocam DAL, rotas, guarda ou seed | `npm test` |
| Build | Ao fechar uma fase, ou em tasks de schema/config/componente | `npm test && npm run lint && npm run build && npx tsc --noEmit` |

> `npm test` é `vitest run` (suíte inteira, sem seleção parcial — `fileParallelism: false`), então Quick e Full coincidem em comando e diferem apenas em intenção. **`npx tsc --noEmit` só entra no gate de build a partir da T1**, que corrige a falha pré-existente em `src/lib/__tests__/format.test.ts:17`; antes disso ele está vermelho por motivo alheio a este lote.
>
> **Piso de testes do lote: 693** (55 arquivos), herdado do fechamento do lote-7. Nenhum teste pode ser removido, pulado ou enfraquecido; a contagem só sobe. As reescritas das Phases 3 e 4 substituem asserções sobre `brokers` por asserções equivalentes sobre `tenant_members` — substituição 1:1, nunca redução.

---

## Execution Plan

Fases são ordenadas e rodam sequencialmente — cada uma termina antes da próxima começar, e as tasks dentro de uma fase executam em ordem.

### Phase 1: Espinha e pré-condições

Existe para que as fases seguintes possam falhar cedo e barato.

```
T1 → T2 → T3
```

### Phase 2: Autenticação e vínculo

```
T4 → T5 → T6 → T7 → T8 → T9 → T10
```

### Phase 3: Corretor vira usuário

```
T11 → T12 → T13 → T14
```

### Phase 4: Papéis, permissões e escopo

```
T15 → T16 → T17 → T18
```

### Phase 5: Gestão de usuários

```
T19 → T20 → T21 → T22 → T23
```

### Phase 6: Agenda e atribuição

```
T24 → T25 → T26 → T27 → T28
```

### Phase 7: Fluxo n8n e ambiente

```
T29 → T30 → T31
```

### Phase 8: Recuperação de senha e fechamento

```
T32 → T33
```

---

## Task Breakdown

### Phase 1: Espinha e pré-condições

### T1: Corrigir a falha pré-existente de `tsc --noEmit` ✅

**What**: Consertar os erros de tipo pré-existentes para que `npx tsc --noEmit` fique verde e possa entrar no gate de build. A checagem real apurou **15 erros em 5 arquivos**, não 1: os `BigInt literals` em `format.test.ts` e `parsers.test.ts` vinham de `tsconfig.json` com `"target": "ES2017"` (subido para `ES2020`, o mínimo que resolve), e os 3 arquivos de teste do n8n tinham erros de tipo próprios (índice de `FIELD_LABELS` por `string`, fixture de `HistoryMessage` sem tipo). Escopo estendido aprovado explicitamente pelo usuário.
**Where**: `tsconfig.json`, `n8n/src/__tests__/phase.test.ts`, `n8n/src/__tests__/session.test.ts`, `n8n/src/__tests__/system-message.test.ts`
**Depends on**: None
**Reuses**: nada
**Requirement**: — (pré-condição de `SCOPE-01`: a proteção de tipo do `LeadScope` só vale se a compilação for checada)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `npx tsc --noEmit` sai com código 0 no repositório inteiro
- [x] Nenhuma asserção do teste foi enfraquecida ou removida para conseguir isso — o diff é 100% type-level (anotação de parâmetro, `keyof typeof`, tipo de retorno da fixture); nenhum `expect(...)` mudou
- [x] Gate de build passa: `npm test && npm run lint && npm run build && npx tsc --noEmit`
- [x] Contagem de testes: ≥ 693 (piso do lote inalterado) — 693 passed, 55 arquivos

**Tests**: unit
**Gate**: build

**Commit**: `fix(tipos): corrige erro pre-existente em format.test`

---

### T2: Instalar better-auth e provar id `uuid` contra o schema real ✅

**What**: Adicionar `better-auth` com adaptador Drizzle, criar a configuração mínima com as 4 tabelas core (`users`, `sessions`, `accounts`, `verifications`) e **provar por teste** que os ids gerados são `uuid` compatíveis com as PKs do projeto.
**Where**: `src/server/auth/config.ts`
**Depends on**: T1
**Reuses**: `db` de `src/db/index.ts` (mesma pool `pg`, nenhuma conexão nova)
**Requirement**: `AUTH-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `better-auth` instalado (`1.7.1`) e a instância `auth` exportada de um módulo só (`src/server/auth/config.ts`)
- [x] Tabelas core adicionadas a `src/db/schema.ts` e aplicadas ao banco — geradas por `npx auth@latest generate` (o pacote `@better-auth/cli` está descontinuado e parou na 1.4.x, que **não** emite a coluna `accounts.issuer` exigida pela 1.7; o CLI atual mora no pacote `auth`). Aplicadas aos dois bancos: `npx drizzle-kit push` e `npx drizzle-kit push --config drizzle-test.config.ts`
- [x] Teste cria um usuário pela API do better-auth e assevera que `id` casa o formato `uuid` v4 — `src/server/auth/__tests__/config.test.ts:35`, `expect(result.user.id).toMatch(UUID_V4)`
- [x] **Condição de parada NÃO acionada**: `advanced.database.generateId: "uuid"` faz o better-auth emitir `crypto.randomUUID()` (v4), compatível com as PKs `uuid`/`defaultRandom()` do projeto. Sem essa opção o padrão da lib é um alfanumérico de 32 caracteres, que não caberia na coluna
- [x] Gate de build passa
- [x] Contagem de testes: 695 (693 + 2)

**Nota de execução**: `drizzle-test.config.ts` (novo) é o espelho de `drizzle.config.ts` apontando para `TEST_DATABASE_URL`. Sem ele não havia caminho para aplicar schema ao banco da suíte, e toda task de schema deste lote (T3, T4, T11) precisa dele. O nome evita `*.test.ts`, que o vitest recolheria como arquivo de teste.

**Tests**: integration
**Gate**: build

**Commit**: `feat(auth): instala better-auth com adaptador drizzle`

---

### T3: `tenants.slug` obrigatório ✅

**What**: Tornar `slug` NOT NULL com índice único total (hoje é nullable com índice parcial) e garantir que o seed escreve slug para todo tenant que cria.
**Where**: `src/db/schema.ts`
**Depends on**: T2
**Reuses**: convenção de slug já usada por `resolveTenantIdBySlug` e pela Data Table `tenant_config` do n8n
**Requirement**: `TENANT-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `slug` é NOT NULL com `uniqueIndex` sem cláusula `where` — `src/db/schema.ts`, aplicado aos dois bancos
- [x] Seed escreve slug determinístico para os 3 tenants — asseverado em `src/db/__tests__/seed.test.ts:88`, `expect(slugs).toEqual(["crivo-demo", "triangulo", "vale-uberaba"])`
- [x] Reseed roda sem erro contra o banco (`npm run db:seed`, exit 0)
- [x] Gate de build passa
- [x] Contagem de testes: 695 (inalterada em relação a T2 — nenhum teste novo era exigido, ver nota)

**SPEC_DEVIATION — slug do Vale do Uberaba**: o texto da task pedia `vale-do-uberaba`. O valor real em uso no repositório é **`vale-uberaba`** — é o que `src/db/seed.ts` grava, o que `seed.test.ts:42,88` assevera, e o que `docs/integration/openapi.yaml:329` e o `guia-integracao.md` documentam como exemplo de `X-Crivo-Tenant`. O `vale-do-uberaba` que aparece em `n8n/workflows/scheduler.ts` está apenas nos `output:` de dado de exemplo fixado do editor, não na Data Table: pelo Handoff do lote-7, o Vale do Uberaba **não tem linha em `tenant_config`** (falta o 2º número homologado). Mudar o slug quebraria asserções existentes sem nenhum consumidor real do outro lado. **Razão**: alinhar ao valor que o produto de fato usa, em vez de a uma suposição de planejamento.

**Nota de execução**: nenhum teste novo. O critério "seed escreve slug para todo tenant" já era coberto 1:1 por `seed.test.ts:83-89` (lote-7), e o critério de schema é de camada `none` na matriz — verificado pelo gate de build. O que a mudança de fato produziu foi a **rede de compilação em ação**: `slug` NOT NULL quebrou `npx tsc --noEmit` em 21 arquivos de teste cujas fixtures de tenant não escreviam slug; todas ganharam `slug: \`fixture-${<tenantId>}\``. Nenhuma asserção foi tocada.

**Consequência de ambiente**: `npm run db:seed` rotacionou as chaves de API dos 3 tenants **e a chave de serviço do agente** no banco real (comportamento normal do seed). A credencial do n8n fica desatualizada até T31, que já prevê o reseed e o acerto do ambiente.

**Tests**: integration
**Gate**: build

**Commit**: `feat(schema): torna slug do tenant obrigatorio`

---

### Phase 2: Autenticação e vínculo

### T4: Plugin `organization` mapeado sobre `tenants` ✅

**What**: Configurar o plugin `organization` com `schema.modelName` apontando `organization`→`tenants`, `member`→`tenant_members`, `invitation`→`tenant_invitations`, incluindo `logo`/`metadata` em `tenants` e os `additionalFields` de janela de trabalho e desativação em `tenant_members`.
**Where**: `src/db/schema.ts`
**Depends on**: T3
**Reuses**: tabela `tenants` existente; formato `meetingDays`/`meetingHoursStart` para os campos de janela
**Requirement**: `TENANT-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `tenant_members` e `tenant_invitations` criadas, com único por `(userId, organizationId)` — o único é asseverado em `src/server/auth/__tests__/organization.test.ts:126`, `await expect(db.insert(tenant_members).values({...})).rejects.toThrow()`
- [x] `tenants` ganha `logo` e `metadata` (ambas nullable) e continua com todas as colunas de domínio intactas — `organization.test.ts:84-85`, `expect(rows[0].agentName).toBe("Agente Fixture T4")` e `expect(rows[0].supportedModality).toBe("ambos")` provam que a criação pelo plugin preenche as colunas de domínio
- [x] `sessions` carrega `activeOrganizationId` — `organization.test.ts:124`, `expect(rows[0].activeOrganizationId).toBe(organizationId)` depois de `setActiveOrganization`
- [x] Teste cria organização + membro e lê de volta pela API do plugin, confirmando que a linha caiu em `tenants`, não numa tabela nova — `organization.test.ts:81-83` (select direto em `tenants`), `:94-96` (vínculo em `tenant_members`), `:105-107` (`getFullOrganization` devolve o mesmo id/slug/membro)
- [x] Gate de build passa
- [x] Contagem de testes: 700 (699 + 1)

**Decisão de execução — `agentName`/`supportedModality` como `additionalFields` de `organization`**: `tenants` tem duas colunas NOT NULL de domínio que o plugin não conhece, e sem elas nenhum `createOrganization` conseguiria escrever na tabela. Declaradas como `additionalFields` do modelo `organization` em `src/server/auth/config.ts`. A alternativa seria dar `default` a coluna de domínio — enfraquecer o schema para acomodar a biblioteca. Declarar é dizer a verdade sobre a tabela mapeada.

**Nota de schema**: `tenant_members` e `tenant_invitations` são exportadas em snake_case, ao contrário do resto de `schema.ts`. O adaptador Drizzle resolve a tabela por `schema[modelName]` (lookup por chave exata do módulo), então o nome do export TEM que ser o `modelName`. Renomear quebra em runtime, não em compilação — registrado em comentário no próprio schema. `sessions.activeOrganizationId` é `text` sem FK porque é assim que o plugin declara o campo e o que o CLI emite; a validação contra os vínculos reais mora na guarda da T7.

**Tests**: integration
**Gate**: build

**Commit**: `feat(auth): mapeia plugin organization sobre tenants`

---

### T5: Porta de entrada `proxy.ts` ✅

**What**: Criar o `proxy.ts` na raiz, com checagem otimista lendo só o cookie de sessão e `matcher` excluindo `/api/v1`, `/api/cron`, `_next/static`, `_next/image` e `public/`.
**Where**: `proxy.ts`
**Depends on**: T4
**Reuses**: nada — Next 16 renomeou `middleware.ts` → `proxy.ts`, o convention antigo está deprecado
**Requirement**: `AUTH-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Requisição sem cookie a qualquer rota sob `/(crm)` redireciona para `/login` — verificado por requisição real contra `npm run dev`: `/pipeline`, `/dashboard`, `/chats`, `/documentos`, `/configuracoes` e `/` respondem **307 com `location: /login`**. `/login` passa (404 só porque a tela nasce na T6)
- [x] Nenhuma consulta a banco e nenhum import da DAL no arquivo — os únicos imports são `next/server` e `better-auth/cookies` (`getSessionCookie`, que lê só o cabeçalho `Cookie` e cuida do prefixo `__Secure-`)
- [x] `/api/v1/**` e `/api/cron/**` não passam pelo proxy — requisição real com a credencial de serviço: `GET /api/v1/context?modality=novo` com `Authorization: Bearer <chave de serviço>` + `X-Crivo-Tenant: triangulo` respondeu **200 com a lista de documentos**; sem credencial, **401 do próprio contrato** (não 307 do proxy); `GET /api/cron/expire-documents` respondeu **401**, também do próprio handler
- [x] Gate de build passa
- [x] Contagem de testes: 700 (inalterada — `Tests: none` por camada)

**Nota de matcher**: além das negativas previstas no design, entrou `.*\..*` (qualquer caminho com extensão). Sem ela, todo arquivo de `public/` — servido a partir da raiz, ex.: `/crivo_white_symbol.png` — seria redirecionado para o login. Verificado: `/crivo_white_symbol.png` e `/favicon.ico` respondem 200. `api` sai inteiro do matcher, o que cobre `/api/v1`, `/api/cron` e também `/api/auth/**` (o handler do better-auth não pode exigir a sessão que ele mesmo emite).

Rotas públicas tratadas no corpo da função, não no matcher: `/login`, `/recuperar-senha`, `/convite/[token]` e `/sem-acesso` — todas precisam responder sem sessão.

**Tests**: none — camada `proxy.ts` na matriz; o comportamento é coberto pelos testes de guarda da T7 e pela verificação de rota acima
**Gate**: build

**Commit**: `feat(auth): adiciona proxy de protecao de rotas`

---

### T6: Tela de login e handler do better-auth ⚠️ (código completo; verificação visual BLOQUEADA)

**What**: Criar a rota catch-all do better-auth e a tela de login com e-mail e senha, mensagem genérica de falha e rate limit ativo.
**Where**: `app/login/page.tsx`
**Depends on**: T5
**Reuses**: componentes Astryx (`astryx component` antes de compor); rate limit nativo do better-auth
**Requirement**: `AUTH-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Credenciais corretas criam sessão — `src/server/auth/__tests__/login.test.ts:53-61`: `expect(response.user.email).toBe(email)`, `expect(headers.get("set-cookie")).toContain("better-auth.session_token")` e linha presente em `sessions`. O `redirect` para o Pipeline é do componente client (camada `none` na matriz)
- [x] E-mail inexistente e senha errada produzem **a mesma** mensagem — `login.test.ts:79-81`: `expect(wrongPassword.body?.message).toBeTruthy()` antes de `expect(unknownEmail.body?.message).toBe(wrongPassword.body?.message)` e a mesma comparação em `.code`
- [x] Acima de 10 falhas em 1 minuto, novas tentativas são recusadas — `login.test.ts:135-137`: `expect(statuses[9]).toBe(401)`, `expect(statuses[10]).toBe(429)`, `expect(statuses[11]).toBe(429)`
- [x] Sair invalida a sessão — `login.test.ts:101,104`: `expect(await auth.api.getSession(...)).toBeNull()` e a linha DAQUELA sessão sumiu de `sessions`. "Volta ao login" é o proxy, provado na T5
- [x] Self-check Astryx: nenhum `<div>` de layout, nenhum `style={{}}`, nenhum valor cru — grep limpo em `src/components/auth/login-form.tsx`; todo tamanho passa por prop de componente (`width`/`maxWidth`/`gap`/`padding` do Stack e do Card, `minHeight` do Center), props confirmadas por `npx astryx component`
- [x] Gate de build passa — 704 testes, lint 0 erros, build compilado, `tsc` 0
- [x] Contagem de testes: 704 (700 + 4)

**⚠️ VERIFICAÇÃO VISUAL NÃO REALIZADA — pendência para o usuário.** A extensão Claude in Chrome está conectada e funciona (captura `https://example.com` normalmente), mas o Chrome dela **não alcança o dev server desta máquina** em nenhum endereço testado: `localhost:3000`, `127.0.0.1:3000`, `172.26.48.1:3000` e `192.168.100.129:3000` todos caem em página de erro. Provado por contagem de requisições: com o servidor de pé e respondendo 200 a `Invoke-WebRequest` nos três hosts, **nenhuma** das navegações do Chrome apareceu no log do dev server. O painel Browser embutido não foi usado como substituto (instrução explícita). A tela está com o gate verde e o self-check de código limpo, mas **ninguém olhou para ela renderizada** — conferir `/login` no navegador é um passo de 30 segundos que fica para o usuário. O mesmo vale para a T10.

**SPEC_DEVIATION — chave do rate limit.** `AUTH-01` AC4 diz "para o mesmo e-mail". O rate limit nativo do better-auth (que a task manda reusar) é chaveado por **IP + rota** (`createRateLimitKey(ip, path)` em `better-auth/dist/api/rate-limiter`), não por e-mail. Configurado `customRules: { "/sign-in/email": { window: 60, max: 10 } }`, o que barra o ataque de força bruta que a AC quer barrar, mas por IP. Um limite por e-mail exigiria contador próprio — solução caseira, contra o "Reuses: rate limit nativo do better-auth" da própria task. **Razão**: reusar o mecanismo da biblioteca, como instruído; a diferença de chave fica registrada para o usuário decidir se quer o limite por e-mail num lote de endurecimento.

**Nota de execução**: o rate limit do better-auth só conta requisições HTTP — chamadas diretas de `auth.api.*` não passam pela barreira. O teste da AC4 vai por `auth.handler(new Request(...))`, que é o mesmo caminho que a tela usa. Ele fica por último no arquivo de propósito: como a chave é IP + rota, depois dele `/sign-in/email` está esgotada pelo resto da janela de 60s naquele processo.

**Ambiente**: `.env.example` ganhou `BETTER_AUTH_SECRET` (assina o cookie de sessão; sem ela a biblioteca usa um valor de desenvolvimento e **lança em produção**) e `BETTER_AUTH_URL`. O usuário precisa preenchê-las no `.env` antes do deploy.

**Tests**: integration
**Gate**: build

**Commit**: `feat(auth): adiciona tela de login`

---

### T7: Guarda de sessão `verifySession()` ✅

**What**: Implementar a guarda memoizada com `cache()` que resolve usuário, imobiliária ativa, papéis do vínculo e o `LeadScope`, com o fallback da AC4 quando o cookie aponta para fora dos vínculos.
**Where**: `src/server/auth/session.ts`
**Depends on**: T6
**Reuses**: `resolveActiveTenant()` de `src/server/tenant.ts` (função pura já testada)
**Requirement**: `AUTH-01`, `TENANT-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `verifySession()` devolve `AuthContext` — `src/server/auth/__tests__/session.test.ts`, teste "vínculo válido": assevera `user.id`, `user.email`, `tenantId`, `roles` e `leadScope`. ⚠️ O **redirecionamento** em si não é exercitado em vitest (ver gap abaixo)
- [x] Imobiliária fora dos vínculos é ignorada e cai no primeiro vínculo do usuário — teste "imobiliária ativa fora dos vínculos": `expect(context.tenantId).toBe(primeiro)`, `expect(context.tenantId).not.toBe(alheio)` e `expect(context.roles).toEqual(["corretor"])` (os papéis são os DAQUELE vínculo)
- [x] Usuário sem nenhum vínculo é sinalizado sem renderizar dado de imobiliária — `expect(resolution).toMatchObject({ ok: false, reason: "sem-vinculo" })` e `expect(resolution).not.toHaveProperty("context")`
- [x] Testes cobrem: sem sessão, sessão expirada, sem vínculo, vínculo inválido, vínculo válido — os 5 casos, mais escopo de corretor puro × acumulado e 4 casos de `parseRoles`
- [x] Gate full passa: `npm test` — 714 testes
- [x] Contagem de testes: 714 (704 + 10)

**⚠️ Gap de verificação — memoização com `cache()`.** O critério "chamadas repetidas no mesmo render pass fazem uma consulta só" **não é exercitável em vitest**, e isso foi provado empiricamente, não suposto: `cache()` do React só memoiza dentro de um escopo de requisição fornecido pelo Next; num Node puro ele é no-op (probe: 3 chamadas → 3 execuções reais). A memoização está estruturalmente presente (`export const verifySession = cache(...)` e `getLeadScope = cache(...)`) e é o Next que fornece o escopo em runtime. Foi por causa disso que o comportamento testável foi extraído para `resolveAuthContext(headers)`, que recebe os headers e não redireciona — é ele que os 6 testes de integração exercitam.

**⚠️ Gap de verificação — `redirect()`.** Pela mesma razão, o `redirect("/login")` / `redirect("/sem-acesso")` mora na casca `verifySession()` e não é exercitado por teste. O que é testado é a **decisão** que o alimenta (`{ ok: false, reason: "sem-sessao" | "sem-vinculo" }`). O redirecionamento de requisição sem cookie já foi provado por requisição real na T5.

**Nota de escopo — `parseRoles`.** A função vive por ora em `session.ts`, com nota no código: a guarda precisa dos papéis antes da T15, que é quem cria `src/lib/permissions.ts` com o `parseRoles` canônico e a matriz `can`. **A T15 deve absorver esta função e fazer este módulo importá-la**, em vez de deixar duas cópias.

**Tests**: integration
**Gate**: full

**Commit**: `feat(auth): adiciona guarda de sessao na dal`

---

### T8: Comando de bootstrap de administrador ✅

**What**: Criar o comando de linha que cria ou promove um usuário a administrador de uma imobiliária, com senha definida, sem depender de envio de e-mail.
**Where**: `src/db/create-admin.ts`
**Depends on**: T7
**Reuses**: padrão de script de `src/db/seed.ts` (`tsx`, `dotenv/config`, execução idempotente)
**Requirement**: `SEED-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Comando recebe imobiliária e e-mail e cria o usuário administrador com senha — `src/db/__tests__/create-admin.test.ts`: `expect(result.outcome).toBe("usuario-criado-e-vinculado")`, `expect(membership.role).toBe("administrador")` e, para provar que a senha **funciona** (e não só que o usuário existe), `expect(signedIn.user.id).toBe(result.userId)` depois de `signInEmail`
- [x] Executado sobre um e-mail que já existe, promove em vez de duplicar — `expect(result.outcome).toBe("vinculo-promovido")`, `expect(userRows).toHaveLength(1)`, `expect(memberships).toHaveLength(1)` e `expect(memberships[0].role).toBe("corretor,administrador")`
- [x] Script registrado em `package.json` — `db:create-admin`
- [x] Teste cobre criação e promoção — mais 3 casos: usuário existente em OUTRA imobiliária ganha vínculo novo (não um segundo usuário), execução repetida sobre quem já é administrador não altera nada, e slug inexistente é recusado apontando o slug
- [x] Gate full passa — 719 testes
- [x] Contagem de testes: 719 (714 + 5)

**Decisão de execução — promoção acumula, não substitui.** Promover alguém que já era corretor grava `corretor,administrador`, não `administrador`. Papéis acumuláveis são **união** de permissões (PERM-01 AC4): substituir faria um corretor perder a carteira ao virar administrador. O retorno do comando nomeia o que de fato aconteceu (`usuario-criado-e-vinculado` | `usuario-existente-vinculado` | `vinculo-promovido` | `ja-era-administrador`) em vez de dizer só "ok" — é o que permite o teste distinguir criação de promoção sem inspecionar o banco por adivinhação.

**Nota de implementação**: o usuário é criado pela API do better-auth (`signUpEmail`), nunca por `INSERT` direto em `users`. É ela que faz o hash da senha e cria a linha de `accounts` que o login lê — um `INSERT` produziria um usuário que não consegue entrar.

**Tests**: integration
**Gate**: full

**Commit**: `feat(auth): adiciona comando de bootstrap de administrador`

---

### T9: Seletor de imobiliária pelos vínculos ✅

**What**: Recompor o seletor da sidebar para listar apenas as imobiliárias vinculadas ao usuário e trocar a ativa via `organization.setActive`, escondendo o seletor quando há um vínculo só.
**Where**: `src/components/shell/tenant-switcher.tsx`
**Depends on**: T8
**Reuses**: o próprio componente e o `NavHeadingMenu` da Astryx — recomposição in-place (AD-010), nunca rebuild
**Requirement**: `TENANT-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Usuário com um vínculo não vê seletor; com mais de um, vê só os dele — `src/server/__tests__/linked-tenants.test.ts`: um vínculo devolve `toHaveLength(1)`, e a imobiliária alheia que existe no banco **não** aparece (`expect(...).not.toContain(alheio)`); com dois vínculos devolve os dois na ordem determinística do vínculo. A decisão de renderizar é `tenants.length > 1` em `sidebar.tsx` (camada `none` na matriz)
- [x] Trocar a imobiliária ativa passa a resolver leitura e escrita naquele escopo, com os papéis daquele vínculo — `setActiveTenant` grava `activeOrganizationId` via `setActiveOrganization` do plugin, e a guarda lê de lá; que os papéis são os DAQUELE vínculo já é asseverado em `session.test.ts` (teste da AC4: `expect(context.roles).toEqual(["corretor"])`)
- [x] Zustand espelha o `activeOrganizationId` da sessão, não mais o cookie — `src/stores/tenant-store.ts` segue sendo só espelho; o que mudou é a fonte que o servidor entrega. O cookie `crivo_tenant` deixou de existir como mecanismo
- [x] Self-check Astryx cumprido — recomposição in-place (AD-010): mesmos componentes (`NavHeadingMenu`, `SideNavHeading`), nenhum `<div>`, `style={{}}` ou valor cru introduzido
- [x] Gate de build passa — 723 testes, lint 0 erros (2 warnings pré-existentes), build compilado, `tsc` 0
- [x] Contagem de testes: 723 (719 + 4)

**Decisão de escopo — `getActiveTenantId` manteve a assinatura.** Remover a função quebrava 5 páginas e 3 server actions de uma vez, que é literalmente o escopo da T18. Em vez disso ela **trocou de fonte**: era o cookie `crivo_tenant`, agora é `verifySession().tenantId`. As páginas continuam compilando e a T18 faz a fiação do `LeadScope` sem pressa.

**Consequência — `actions.test.ts` teve o harness adaptado, não as asserções.** As 44 asserções estão intactas. O que mudou foi o mock: antes `next/headers.cookies()` devolvia cookie ausente e `getActiveTenantId()` caía no primeiro tenant; agora `../auth/session.verifySession` é mockada devolvendo contexto de administrador **na mesma primeira imobiliária de `getTenants()`**. Mesmo tenant real, mesmas asserções. Três títulos que diziam "resolve o tenant ativo pelo cookie" passaram a dizer "pela sessão autenticada" — correção de texto que tinha virado mentira, sem tocar em asserção.

**⚠️ TESTE DEGRADADO — decisão do usuário necessária.** `src/server/__tests__/tenant.test.ts` tem o caso *"setActiveTenant rejeita um tenantId inexistente sem gravar o cookie (não falha silenciosamente)"*. Ele **continua passando, mas pelo motivo errado**: verificado por probe, a rejeição hoje vem de `` `headers` was called outside a request scope ``, não da validação de vínculo. Ou seja, ele passaria mesmo se `setActiveTenant` não validasse nada. **Não foi alterado nem removido** — a regra é não mexer em teste alheio sem confirmação. O invariante que ele queria proteger está coberto por outro ângulo em `linked-tenants.test.ts` (imobiliária sem vínculo não entra na lista contra a qual `setActiveTenant` valida). Sugestão para a T18, que já reescreve esse caminho: reescrever o caso com o mesmo harness de sessão usado em `actions.test.ts`.

**Nota — `src/lib/mock-manager.ts` ficou sem consumidor.** O shell passou a exibir o usuário autenticado real (`AUTH-01` AC6), no lugar do gestor fictício derivado do nome do tenant. O módulo e seus 5 testes foram **deixados intactos** (remover baixaria a contagem de testes, e código morto pré-existente não se apaga sem pedido). Candidato a remoção num lote de limpeza.

**Tests**: integration
**Gate**: build

**Commit**: `feat(auth): seletor de imobiliaria pelos vinculos do usuario`

---

### T10: Tela de ausência de acesso ✅

**What**: Criar a tela apresentada a usuário autenticado sem nenhum vínculo de imobiliária.
**Where**: `app/sem-acesso/page.tsx`
**Depends on**: T9
**Reuses**: componentes Astryx de estado vazio
**Requirement**: `TENANT-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Usuário sem vínculo cai nesta tela e nenhum dado de imobiliária é renderizado — **verificado por requisição real** contra `npm run dev`, com os três desfechos de roteamento: sem sessão → `307 location: /login`; autenticado **sem** vínculo → `200` com a tela de ausência de acesso; autenticado **com** vínculo → `307 location: /pipeline` (chegou por engano, tem para onde ir). A metade "nenhum dado de imobiliária" foi medida, não presumida: com **3 tenants no banco**, a página não contém **nenhum** nome nem slug de imobiliária. O único dado exibido é o e-mail do próprio usuário, que é dele
- [x] A tela explica o que fazer (pedir vínculo a um administrador) — "Peça a um administrador da imobiliária que vincule o seu e-mail", com botão Sair para quem entrou na conta errada
- [x] Self-check Astryx cumprido — `EmptyState` + `Card` + `Center` + `VStack` + `Text`; grep limpo de `<div>`, `style={{}}`, `.css`, `@apply` e valor cru em `app/sem-acesso/page.tsx` e em `src/components/auth/sign-out-button.tsx`
- [x] Gate de build passa — 723 testes, lint 0 erros, build compilado, `tsc` 0
- [x] Contagem de testes: 723 (inalterada — `Tests: none` por camada, como previsto na matriz)

**Nota de implementação — laço de redirecionamento evitado.** A página usa `resolveAuthContext(await headers())` diretamente, **não** `verifySession()`. A guarda manda para cá justamente quem está sem vínculo; chamá-la aqui redirecionaria a página para si mesma indefinidamente. Os três desfechos são tratados explicitamente, e os três foram verificados por requisição real.

**⚠️ VERIFICAÇÃO VISUAL NÃO REALIZADA — mesma pendência da T6.** Repetida a tentativa com o dev server recém-subido e aba nova: a extensão Claude in Chrome captura `https://example.com` normalmente, mas nenhuma navegação dela para `localhost:3000` aparece no log do dev server (o servidor responde 200 a `Invoke-WebRequest` no mesmo instante). O Chrome da extensão não alcança este servidor. A evidência de comportamento acima é mais forte que um screenshot para a parte que importa (vazamento de dado de imobiliária), mas **a aparência das telas `/login` e `/sem-acesso` segue sem conferência humana**.

**Tests**: none — componente React, camada "none" na matriz; o roteamento até ela é coberto pelos testes de guarda da T7
**Gate**: build

**Commit**: `feat(auth): adiciona tela de ausencia de acesso`

---

### Phase 3: Corretor vira usuário

### T11: Remover `brokers` e renomear a coluna de responsável ✅

**What**: Tirar `brokers` do schema e renomear `leads.broker_id` → `leads.assigned_user_id`, referenciando `users.id`.
**Where**: `src/db/schema.ts`
**Depends on**: T10
**Reuses**: nada — é remoção e rename
**Requirement**: `SEED-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] **Grep completo dos consumidores de `brokerId`/`broker_id`/`brokers` registrado nas notas desta task antes de qualquer alteração** (lição L-015 do lote-7) — lista abaixo
- [x] `brokers` removida do schema; `assignedUserId` referencia `users.id` — `src/db/schema.ts`, aplicado aos DOIS bancos
- [x] Nenhuma ocorrência de `brokers` resta em `src/db/schema.ts`
- [x] Gate de build passa — 723 testes, lint 0 erros (2 warnings pré-existentes em `n8n/`), build compilado, `tsc --noEmit` 0
- [x] Contagem de testes: 723 (inalterada em relação a T10, como previsto — `Tests: none`)

**Grep de consumidores (L-015 — feito ANTES de qualquer alteração)**. `git grep -n -E "brokerId|broker_id|brokers|Broker"` em todo o repo, 19 arquivos fora de `.specs/`:

| Arquivo | Ocorr. | O que era | Tratamento |
| ------- | ------ | --------- | ---------- |
| `src/db/schema.ts` | 2 | tabela `brokers`; `leads.brokerId` | removida / renomeada |
| `src/server/data/index.ts` | 33 | `Broker`, `getBrokers`, join de `brokerName`, `updateLeadBroker`, `getBrokerLoads`, `createAgentLead` | reescritos sobre `tenant_members` + `users` |
| `src/db/seed.ts` | 15 | `brokerRows`, `brokerIds`, delete/insert de `brokers` | vira `users` + `tenant_members` (papel `corretor`) |
| `src/server/data/__tests__/broker-assignment.test.ts` | 31 | fixture `createBroker`, asserções de carga/desempate | reescrito 1:1 sobre `tenant_members` |
| `src/server/data/__tests__/lead-controls.test.ts` | 28 | fixture + asserções de `updateLeadBroker` | idem |
| `src/server/__tests__/actions.test.ts` | 25 | `createFixtureBroker`, asserções de `updateLeadBrokerAction` | idem |
| `src/server/data/__tests__/recent-leads.test.ts` | 14 | fixtures `BROKER_FULL`/`BROKER_SPARSE` | idem |
| `src/server/data/__tests__/isolation.test.ts` | 11 | só a API `getBrokers` | inalterado (a API sobreviveu) |
| `src/db/__tests__/seed.test.ts` | 7 | snapshot + "pilotos mantêm corretores" | asserções equivalentes sobre `tenant_members` |
| `src/components/pipeline/lead-controls.tsx` | 17 | `Pick<Broker,"id"\|"name">`, prop `brokerId` | inalterado (o tipo `Broker` sobreviveu) |
| `src/components/pipeline/pipeline-board.tsx` | 7 | `Broker`, `LeadWithBroker` | inalterado |
| `src/components/pipeline/lead-detail-panel.tsx` | 7 | `lead.brokerId` | → `lead.assignedUserId` |
| `src/server/actions/pipeline.ts` | 7 | `updateLeadBrokerAction`, `UpdateLeadBrokerInput.brokerId` | inalterado (nome de função/campo de input não é a coluna) |
| `src/lib/broker-assignment.ts` | 3 | `BrokerLoad`, `assignBroker` | inalterado (função pura, sem tabela) |
| `src/lib/__tests__/broker-assignment.test.ts` | 10 | testes da função pura | inalterados |
| `app/(crm)/pipeline/page.tsx` | 4 | `getBrokers(tenantId)` | inalterado |
| `src/server/auth/session.ts` | 2 | `isBrokerOnly` (papel) | inalterado — não tem relação com a tabela |

**Fora do CRM**: `n8n/` e `docs/integration/openapi.yaml` **não têm nenhuma ocorrência** — confirmado pelo grep. O rename é 100% interno, como o design previa.

**Decisão de escopo — o `Where` da task ficou pequeno.** A task declara `Where: src/db/schema.ts`, mas o `Done when` exige gate de **build** verde. Remover o export `brokers` quebra a compilação de 9 arquivos de uma vez (DAL, seed e 4 arquivos de teste que inserem na tabela): não existe estado intermediário compilável. Então esta task carrega a consequência mecânica inteira, com **comportamento preservado**: o corretor passa a ser `users` + vínculo em `tenant_members`, sem filtro de papel ainda. O filtro por papel `corretor` (e a exclusão de vínculo desativado) é o que a T12 acrescenta, com teste próprio.

**Decisão — `Broker` deixa de ser tipo de tabela.** `export type Broker = typeof brokers.$inferSelect` virou uma interface explícita (`id` = `users.id`, `tenantId` = a imobiliária do vínculo, `createdAt` = a data DO VÍNCULO). Manter o nome preserva `Pick<Broker, "id" | "name">` nos três componentes de Pipeline sem tocá-los. `phone` sai (não existe em `users`) e não tinha consumidor.

**Nota de aplicação do schema**: `drizzle-kit push` não roda aqui sem TTY (ele pergunta se `assigned_user_id` é rename de `broker_id` ou coluna nova). Como não há dado a preservar (AD-021: o reseed é o caminho de convergência), as 3 sentenças foram aplicadas direto aos dois bancos (`drop column broker_id`, `add column assigned_user_id` + FK para `users`, `drop table brokers`) e o `push` seguinte confirmou os dois bancos em dia.

**Consequência de ambiente**: o banco de TESTE foi resemeado (necessário — sem usuários, `getBrokers` devolveria vazio e os testes de isolamento cairiam). O banco real **não** foi tocado nem resemeado nesta task; ele fica com `leads.assigned_user_id` nulo e sem usuários de corretor até o reseed da T31.

**Tests**: none — camada de schema, "none" na matriz; a cobertura vem da T12, que reescreve a DAL e seus testes
**Gate**: build

**Commit**: `refactor(schema): remove brokers e renomeia coluna de responsavel`

---

### T12: DAL sobre `tenant_members` ✅

**What**: Atualizar todos os consumidores da camada de acesso a dados e reescrever `getBrokerLoads`/`getBrokers` sobre `tenant_members` filtrando por papel corretor.
**Where**: `src/server/data/index.ts`
**Depends on**: T11
**Reuses**: a mesma query agregada com LEFT JOIN de `getBrokerLoads` (preserva corretor com zero leads)
**Requirement**: `SEED-01`, `ATRIB-02`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Todas as funções que liam `brokers` leem `tenant_members` **com papel corretor** — `getBrokers`, `getBrokerLoads` e a subquery de validação de `updateLeadBroker` passaram a filtrar por `HAS_BROKER_ROLE`. Provado em `broker-assignment.test.ts:153` (`expect(loads.map((l) => l.id)).toEqual([brokerId])` com gestor e administrador na mesma imobiliária), `:190-191` (`expect(ids).toEqual([brokerId, acumuladoId].sort())` e `expect(ids).not.toContain(gestorId)`) e `lead-controls.test.ts:189` (`expect(result).toBeNull()` ao tentar atribuir um gestor)
- [x] Papel **acumulado** continua sendo corretor — `broker-assignment.test.ts:170`, `expect(loads.map((l) => l.id)).toEqual([acumuladoId])` para `"corretor,administrador"` (PERM-01 AC4: união, nunca igualdade de string)
- [x] `src/server/data/__tests__/broker-assignment.test.ts` reescrito sobre `tenant_members`, com as mesmas asserções de carga e desempate — feito na T11 (a compilação forçou), com as 6 asserções originais preservadas: `activeLeads` 2 de 3, `activeLeads` 0 (LEFT JOIN), isolamento por tenant, menor carga com desempate por `createdAt`, tenant sem corretor, reentrega não reatribui
- [x] Nenhum teste removido, pulado ou enfraquecido — 723 → **727**
- [x] Gate full passa — `npm test`: 727 passed, 61 arquivos; `tsc --noEmit` 0
- [x] Contagem de testes: 727 (723 + 4)

**Decisão de execução — o filtro é de pertencimento ao conjunto, não igualdade.** O plugin grava papéis acumulados como string separada por vírgula (`"corretor,administrador"` — AD-021, e é o que `create-admin.ts` produz ao promover). `role = 'corretor'` excluiria justamente quem acumula cargos, invertendo a PERM-01 AC4. O predicado é `'corretor' = any(string_to_array(role, ','))`, num único `sql` compartilhado pelas três funções (`HAS_BROKER_ROLE`) — uma definição, três consumidores, impossível divergirem.

**Fora de escopo deliberadamente — vínculo desativado.** `deactivatedAt` existe no schema desde a T4, mas nenhuma das três funções o filtra ainda: desativação é a T21 (USER-02) e a lista de candidatos por disponibilidade é a T27 (`getBrokerCandidates`, função nova). Filtrar aqui seria antecipar comportamento sem teste de destino de carteira para sustentá-lo.

**Tests**: integration
**Gate**: full

**Commit**: `refactor(dal): le corretores de tenant_members`

---

### T13: Telas que exibem o corretor responsável ✅

**What**: Atualizar os componentes de Pipeline e Dashboard que exibem o corretor para a nova origem do dado.
**Where**: `src/components/pipeline/`
**Depends on**: T12
**Reuses**: os próprios componentes — recomposição in-place (AD-010)
**Requirement**: `SEED-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Nome do responsável aparece igual ao que aparecia antes, agora vindo de `users` — a troca de fonte foi na T11 (`getLeads`/`getRecentLeads` fazem `leftJoin(users, eq(leads.assignedUserId, users.id))` com `brokerName: users.name`); nenhum componente mudou de contrato, e as asserções de `recent-leads.test.ts:201,273` (`expect(comCorretor!.brokerName).toBe(BROKER_FULL_NAME)`) continuam valendo sobre a nova origem
- [x] Lead sem responsável é exibido explicitamente como sem responsável — card do Kanban (`src/components/pipeline/pipeline-board.tsx`) passou de `{lead.brokerName && <Avatar/>}` (omissão silenciosa) para um ternário com `Sem responsável`
- [x] Self-check Astryx cumprido — a alternativa usa `Text type="supporting" color="secondary"`, componente e props já usados duas linhas acima no mesmo arquivo; nenhum `<div>`, `style={{}}`, `.css` ou valor cru introduzido
- [x] Gate de build passa — 727 testes, lint 0 erros (2 warnings pré-existentes), `npm run build` exit 0, `tsc --noEmit` 0
- [x] Contagem de testes: 727 (inalterada — `Tests: none` por camada)

**Nota de escopo — as outras duas telas já tratavam o caso.** O levantamento dos três pontos que exibem o responsável achou apenas um em falta: `recent-leads-table.tsx:116` já renderiza `<Fallback />` quando `brokerName` é nulo, e o painel de detalhe já mostra o `Selector` com placeholder `"Escolha o corretor"` (`lead-controls.tsx:142`). Só o card do Kanban omitia. Mudar os outros dois seria "while I'm here".

**Tests**: none — componentes React, camada "none" na matriz
**Gate**: build

**Commit**: `refactor(pipeline): exibe responsavel a partir de usuarios`

---

### T14: Seed com usuários, papéis e janelas de trabalho ✅

**What**: Fazer o seed criar, por imobiliária, administrador, gestor e dois corretores com janelas de trabalho distintas, e nascer todos os leads sem responsável exceto os já agendados.
**Where**: `src/db/seed.ts`
**Depends on**: T13
**Reuses**: `id(seed)` determinístico e a transação delete-and-insert já existentes
**Requirement**: `SEED-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Cada imobiliária ganha ≥ 1 administrador, 1 gestor e 2 corretores — `src/db/__tests__/seed.test.ts:187-189`, `expect(administradores.length).toBeGreaterThanOrEqual(1)`, `expect(gestores.length).toBeGreaterThanOrEqual(1)`, `expect(corretores.length).toBeGreaterThanOrEqual(2)`, para os 3 tenants. São 5 membros por imobiliária (1 administrador, 1 gestor, 3 corretores)
- [x] Todos em convite pendente — `seed.test.ts:205`, `expect(credentials).toHaveLength(0)`: nenhum dos 15 usuários semeados tem linha em `accounts`, que é o que guarda o hash de senha. A AC4 (pendente segue elegível a receber lead) tem asserção própria em `:213`, `expect(assigned.length).toBeGreaterThan(0)`
- [x] As janelas dos corretores diferem, com **ao menos um horário coberto por apenas um deles** — `seed.test.ts:247`, `expect(new Set(janelas).size).toBeGreaterThanOrEqual(2)`, e `:262`, `expect(coberturaUnica.length).toBeGreaterThan(0)`, calculado varrendo os 7 dias em passos de 30 min e contando quantos corretores cobrem cada instante. Validade de cada janela asseverada em `:239` (`expect(minutesOf(c.workHoursEnd!)).toBeGreaterThan(minutesOf(c.workHoursStart!))`)
- [x] Leads do seed nascem sem responsável, exceto os que já têm reunião agendada — `seed.test.ts:273,275`, bicondicional: `expect(lead.assignedUserId).toBeNull()` quando `meetingAt === null` e `expect(lead.assignedUserId).not.toBeNull()` quando não, mais duas asserções de que os dois lados existem na base (senão o laço passaria vazio)
- [x] Duas execuções seguidas produzem o mesmo estado — o teste de idempotência existente (`snapshotIds`) passou a incluir `users` e `tenant_members`, então o determinismo agora cobre também os ids novos
- [x] Gate full passa — `npm test`: **731 passed**, 61 arquivos; `tsc --noEmit` 0
- [x] Contagem de testes: 731 (727 + 4)

**Janelas escolhidas** (constantes nomeadas no seed): manhã seg-sex 08:00-14:00, tarde seg-sex 13:00-19:00, sábado 09:00-13:00. A sobreposição das duas primeiras é deliberada (13:00-14:00 tem dois candidatos, que exercita o desempate por carga), e as bordas 08:00-13:00 e 14:00-19:00 têm candidato único — que é o insumo que a Phase 6 precisa.

**Decisão de execução — `TenantDef.brokers` virou `TenantDef.members`.** A lista de corretores por tenant não conseguia expressar administrador e gestor. O campo `phone`, que já tinha ficado sem destino na T11 (`users` não tem telefone), saiu junto com a reescrita do tipo — não era código morto adjacente, era um campo do tipo que esta task reescreve.

**Nota — o administrador do seed não tem senha.** SEED-01 AC3 abre exceção só para "o administrador criado pelo comando de bootstrap". O seed cria o administrador do vínculo, mas em convite pendente; quem dá credencial é `npm run db:create-admin` (T8), como a AC manda.

**Tests**: integration
**Gate**: full

**Commit**: `feat(seed): cria usuarios com papeis e janelas de trabalho`

---

### Phase 4: Papéis, permissões e escopo

### T15: Matriz de permissões pura ✅

**What**: Criar a função pura que decide se um conjunto de papéis pode executar uma ação sobre um recurso, com união de permissões para papéis acumulados.
**Where**: `src/lib/permissions.ts`
**Depends on**: T14
**Reuses**: mesmo padrão de função pura sem I/O de `src/lib/broker-assignment.ts`
**Requirement**: `PERM-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `can(roles, resource, action)` implementa a matriz do `context.md` inteira — `src/lib/permissions.ts`, 3 papéis × 6 recursos × 2 ações
- [x] `parseRoles` lê o formato do plugin (string separada por vírgula) — **absorvida** de `src/server/auth/session.ts` (T7 registrou a dívida). Uma implementação só: `session.ts` importa e reexporta, então `create-admin.ts` e os 4 testes de `session.test.ts:214-231` seguem intactos sobre a função movida
- [x] Papéis acumulados resultam na **união** das permissões — `src/lib/__tests__/permissions.test.ts:94` (`expect(can(["corretor","gestor"], "configuracoes", "escrever")).toBe(true)`) e `:100` (`expect(can(["corretor","administrador"], "usuarios", "escrever")).toBe(true)` logo depois de provar que só corretor devolve `false`). Mais dois casos de contorno: ordem dos papéis não muda o resultado, e acumular **não** concede o que nenhum dos dois concede
- [x] Teste cobre cada papel × cada recurso, 1:1 com as ACs de `PERM-01` — `permissions.test.ts:51`, `expect(can([role], resource, action)).toBe(expected)` varrendo as **36** combinações contra a tabela do `context.md` transcrita no arquivo; nenhuma célula fica sem verificação, nem as concedidas nem as negadas. Mais asserções nomeadas por AC: AC1 em `:64`, AC2 em `:73-74`, AC3 em `:84-85`
- [x] Gate quick passa — `npm test`: **775 passed**, 62 arquivos; `tsc --noEmit` 0
- [x] Contagem de testes: 775 (731 + 44)

**Decisão de modelagem — "tudo" × "própria carteira" é escopo, não ação.** A tabela do `context.md` diz "tudo" para gestor e "própria carteira" para corretor nas mesmas três telas. As duas concedem ler (e escrever, em Pipeline e Chats); o que estreita o corretor aos leads dele é o `LeadScope` na DAL (SCOPE-01, T17), nunca esta matriz. Misturar as duas coisas aqui faria a matriz decidir escopo sem ter o dado para isso.

**Decisão — Dashboard não tem `escrever` para ninguém.** Não existe escrita em Dashboard em lugar nenhum do produto. Conceder a alguém seria inventar permissão sem recurso; o teste assevera a negativa para os três papéis.

**Decisão — corretor não lê Configurações.** A AC3 diz "sem escrita em Documentos **nem acesso a Configurações**". "Acesso" inclui leitura, então `configuracoes` fica vazio para corretor, e não só sem `escrever`.

**Nota — sem `Commit:` na definição da task.** T15, T24 e T26 saíram do planejamento sem mensagem de commit especificada. Composta seguindo a convenção do lote: `feat(permissoes): adiciona matriz de permissoes por papel`.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(permissoes): adiciona matriz de permissoes por papel`

---

### T16: `requirePermission` e log de negativa ✅

**What**: Adicionar à guarda a recusa server-side por permissão, com log estruturado de usuário, imobiliária e recurso negado.
**Where**: `src/server/auth/session.ts`
**Depends on**: T15
**Reuses**: `verifySession()` da T7 e `can()` da T15
**Requirement**: `PERM-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Operação fora das permissões do vínculo ativo é recusada no servidor, mesmo chamada diretamente — `src/server/__tests__/actions.test.ts:1068`, `expect(result.error).toBe("Sem permissão para escrever configuracoes.")`, e `:1071` provando que **nada foi gravado** (`expect(after!.name).toBe(before!.name)`, mais `agentName` e `supportedModality`). Segundo recurso em `:1085`, `expect(result.error).toBe("Sem permissão para escrever documentos.")` com a lista de categorias inalterada. Os testes chamam a action **diretamente**, que é o ataque exato da AC5
- [x] Cada recusa emite log estruturado com usuário, imobiliária ativa e recurso — `actions.test.ts:1102-1105`: `expect(log.userId).toBe(SESSION_USER.id)`, `expect(log.tenantId).toBe(activeTenantId)`, `expect(log.resource).toBe("configuracoes")`, mais `userEmail`, `action` e `roles`. O log é uma linha JSON em `console.warn`, parseada no teste — não basta ter sido chamado, o conteúdo é asseverado campo a campo. Contraprova em `:1120`, `expect(warn).not.toHaveBeenCalled()` numa operação permitida (senão o teste passaria com um log emitido em toda requisição)
- [x] Teste chama uma server action protegida com sessão de corretor e assevera a recusa — 2 recusas + 3 concessões: gestor edita Configurações e Documentos (`:1132`, AC1), e `["corretor","gestor"]` acumulado passa a poder editar Configurações (AC4 exercitada **no servidor**, não só na função pura)
- [x] Gate full passa — `npm test`: **781 passed**, 62 arquivos; `tsc --noEmit` 0
- [x] Contagem de testes: 781 (775 + 6)

**Decisão de execução — a decisão de permissão foi separada da resolução de sessão.** `requirePermission(resource, action)` é a guarda pública (design.md), mas todo o comportamento mora em `authorizeOrThrow(context, resource, action)`: checa a matriz, emite o log, lança `PermissionDeniedError`. A separação não é estética — é o que permite exercitar a recusa **real** com uma sessão de corretor controlada. Sem ela, o teste teria de reimplementar a decisão dentro da mock e estaria testando a mock.

**Consequência — a mock de sessão de `actions.test.ts` virou PARCIAL.** Era `vi.mock("../auth/session", () => ({ verifySession }))`, substituindo o módulo inteiro. Agora usa `importActual` e sobrescreve só `verifySession` (identidade fabricada) e `requirePermission` — esta última porque a versão real chama a `verifySession` do próprio módulo, e chamada interna de ESM nenhuma mock de módulo intercepta. A decisão, a matriz e o log que rodam nos testes são os de produção. As 44 asserções pré-existentes do arquivo continuam intactas: o papel padrão segue `administrador`, restaurado em `afterEach`.

**Arquivo novo — `src/server/actions/permission.ts` (12 linhas).** `denyIfForbidden(resource, action)` traduz o `throw` da guarda no `{ ok: false, error }` que toda server action do CRM já devolve. Vive na camada de action, e não em `auth/session.ts`, por dois motivos: quem escolhe transformar recusa em resultado é a action, e o import cruzando a fronteira de módulo é o que mantém a decisão substituível no teste.

**Escopo protegido nesta task**: as 6 actions de Documentos (`documentos`/`escrever`) e a de Configurações (`configuracoes`/`escrever`) — exatamente os dois recursos que a `PERM-01` AC3 nega ao corretor e que o Independent Test da spec nomeia. As actions de Usuários nascem já protegidas na T20.

**Tests**: integration
**Gate**: full

**Commit**: `feat(auth): recusa server-side por permissao com log`

---

### T17: `LeadScope` em toda leitura de lead ✅

**What**: Substituir `tenantId: string` por `LeadScope` nas funções de leitura de lead da DAL, aplicando o filtro de responsável junto com o de imobiliária, e cobrir com teste de vazamento entre corretores.
**Where**: `src/server/data/index.ts`
**Depends on**: T16
**Reuses**: `src/server/data/__tests__/isolation.test.ts`, que já é o teste de vazamento entre tenants — ganha a dimensão corretor
**Requirement**: `SCOPE-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Toda função de leitura de lead recebe `LeadScope` — **9 funções** trocaram `tenantId: string` por `scope: LeadScope`: `getLeads`, `getLead`, `getRecentLeads`, `getConversations`, `getMessages`, `getConversationSummaries`, `getDashboardKpis`, `getLeadVolumeSeries`, `getLeadDistributions`. A rede funcionou como projetada: `npx tsc --noEmit` passou de 0 para **125 erros**, um por call site esquecido, e voltou a 0 só depois de todos serem resolvidos um a um. Nenhum call site ficou com um `tenantId` solto porque nenhum compilaria
- [x] Corretor lê apenas os próprios leads em Pipeline, Chats e Dashboard — `src/server/data/__tests__/isolation.test.ts:350` (Pipeline: `expect(doA.map((l) => l.id)).toEqual([leadDeAId])`, mais o `not.toContain` cruzado nos dois sentidos), `:385` (Chats: `expect(resumosA.map((c) => c.id)).toEqual([conversaDeAId])` e `:393`, `expect(await getMessages(scopeOf(corretorAId), conversaDeBId)).toEqual([])`), `:407-408` (Dashboard: `leadCount` 3 no escopo amplo contra 1 para cada corretor, mais volume, distribuições e leads recentes)
- [x] Lead de outro corretor pedido pelo identificador responde como inexistente, sem revelar que existe — `isolation.test.ts:362`, `expect(pedidoPeloA).toBeNull()`, precedido da prova de que o lead EXISTE (lido pelo escopo amplo) e seguido de `:366`, `expect(pedidoPeloA).toEqual(inexistente)`: a resposta é indistinguível de um id que nunca existiu
- [x] Lead sem responsável é visível para administrador e gestor, invisível para quem só tem papel corretor — `isolation.test.ts:372`, `expect(amplo.map((l) => l.id)).toContain(leadSemDonoId)` com `toHaveLength(3)`, contra `not.toContain` e `getLead(...)` `null` no escopo do corretor
- [x] Teste de vazamento com **dois corretores da mesma imobiliária** — fixture própria: uma imobiliária, dois corretores, 3 leads (um de cada, um sem dono), 2 conversas com mensagem. Os quatro critérios acima são cobertos por essa mesma fixture, nas 4 asserções de escopo
- [x] Gate full passa — `npm test`: **786 passed**, 62 arquivos; `tsc --noEmit` 0; lint 0 erros
- [x] Contagem de testes: 786 (781 + 5)

**Decisão — `LeadScope` mudou de casa para `src/lib/lead-scope.ts`.** Nasceu em `src/server/auth/session.ts` (T7), mas a DAL passou a precisar do tipo, e importá-lo da guarda arrastaria `next/headers` e o better-auth para dentro de toda leitura (e quebraria os testes de DAL, que não montam request scope). O módulo novo não tem nenhuma dependência; a guarda o reexporta, porque é ela que produz o valor.

**Decisão — `serviceScope(tenantId)` para o contrato.** `/api/v1/**` autentica por credencial de serviço e o agente não tem carteira (SEC-01, caminho independente por desenho). Em vez de um `{ tenantId, assignedUserId: null }` solto espalhado, existe uma função nomeada e documentada: todo ponto que lê lead sem filtro de responsável precisa dizer em voz alta por quê. Usada em 3 lugares de produção (`patchLead`, rota de opt-out, `getLeadMessages`) e nas asserções de estado persistido dos testes.

**Nota — `getLeadMessages` continua recebendo `tenantId`.** É função exclusiva do contrato (`GET /api/v1/leads/{id}/messages`), não do CRM; internamente já chama `getLead(serviceScope(tenantId), ...)`. Dar-lhe um `LeadScope` sugeriria um escopo de carteira que aquele caminho nunca terá.

**Consequência — as 3 páginas de lead já saíram fiadas nesta task.** Pipeline, Chats e Dashboard passaram a chamar `getLeadScope()` porque, sem isso, não compilavam. A T18 herda a fiação pronta e fica com a navegação por permissão.

**Tests**: integration
**Gate**: full

**Commit**: `feat(dal): aplica escopo de carteira em toda leitura de lead`

---

### T18: Escopo e permissão nas páginas e na navegação ✅

**What**: Fiar `getLeadScope()` nas cinco páginas do CRM e ocultar da navegação os itens que o vínculo ativo não pode acessar.
**Where**: `src/components/shell/sidebar.tsx`
**Depends on**: T17
**Reuses**: as próprias páginas e a `Sidebar` — recomposição in-place
**Requirement**: `SCOPE-01`, `PERM-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] As cinco páginas passam o escopo resolvido pela guarda, nunca um `tenantId` solto — Pipeline, Chats e Dashboard chamam `getLeadScope()` (fiadas na T17, que não compilava sem isso); Documentos e Configurações não leem lead e usam `getActiveTenantId()`, que desde a T9 é `verifySession().tenantId`. Nenhuma das cinco tem `tenantId` de origem que não seja a guarda
- [x] Corretor não vê Configurações na navegação — `src/components/shell/sidebar.tsx`: cada item de `NAV_ITEMS` carrega o `resource` da matriz e a lista é filtrada por `can(roles, item.resource, "ler")`. Com `configuracoes: []` para corretor (T15), o item some. Os papéis vêm de `verifySession()` no layout do CRM
- [x] Ocultar é cosmético: a recusa continua valendo se a rota for acessada direto — a página de Configurações passou a chamar `requirePermission("configuracoes", "ler")`; a negativa vira `notFound()`, o mesmo desfecho de recurso de outra imobiliária (spec.md — Edge Cases), e emite o log da AC6 no caminho
- [x] Self-check Astryx cumprido — grep limpo de `<div>`, `style={{}}`, `.css` e `@apply` nos três arquivos tocados; a mudança de UI é só um `filter` sobre a lista já existente, nenhum componente ou valor novo
- [x] Gate de build passa — 786 testes, lint 0 erros (2 warnings pré-existentes), `npm run build` exit 0, `tsc --noEmit` 0
- [x] Contagem de testes: 786 (inalterada — `Tests: none` por camada, como previsto na matriz)

**Nota — "nem Usuários na navegação" fica vacuosamente cumprido.** A tela de Usuários nasce na T22; não existe rota `/usuarios` hoje, e acrescentar um item de menu apontando para um 404 seria pior do que não ter. O mecanismo já está pronto: basta a T22 acrescentar `{ label: "Usuários", href: "/usuarios", resource: "usuarios" }` a `NAV_ITEMS` e o filtro faz o resto — `usuarios: []` para gestor e corretor (T15) já garante que só administrador verá.

**Decisão de escopo — recusa de página em Configurações.** A `PERM-01` AC3 diz "sem escrita em Documentos **nem acesso a Configurações**", e "acesso" inclui leitura. Sem a checagem na página, um corretor que digitasse a URL leria a configuração do agente (não conseguiria salvar, pela T16, mas leria). Documentos **não** recebe recusa de página: corretor tem leitura ali por especificação.

**Tests**: none — componentes React e páginas, camada "none" na matriz; escopo e recusa são cobertos por T16 e T17
**Gate**: build

**Commit**: `feat(shell): navegacao por permissao do vinculo ativo`

---

### Phase 5: Gestão de usuários

### T19: Adaptador de e-mail ✅

**What**: Criar o adaptador Resend para convite e redefinição de senha, que devolve sucesso ou falha e nunca lança.
**Where**: `src/server/auth/email.ts`
**Depends on**: T18
**Reuses**: nada — serviço externo novo
**Requirement**: `USER-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `sendInvitationEmail` e `sendResetPasswordEmail` devolvem resultado, nunca lançam — `src/server/auth/__tests__/email.test.ts:62` (`expect(result).toEqual({ ok: true, id: "email_123" })`), `:84` (`await expect(sendInvitationEmail(INVITE)).resolves.toEqual({ ok: false, error: "fetch failed" })` com o SDK LANÇANDO), `:118` e `:131` para o reset
- [x] Falha do provedor é um caminho de retorno testado, não uma exceção — `:78`, `expect(result).toEqual({ ok: false, error: "Domínio não verificado" })` (o SDK devolve `{ data: null, error }`) e `:131` (`"Limite excedido"`)
- [x] Chave do Resend lida de variável de ambiente, nunca em texto no repositório — `:106`, `expect(mocks.constructedWith).toHaveBeenCalledWith("re_chave_vinda_do_ambiente")` depois de trocar `process.env.RESEND_API_KEY`; ambiente sem chave é falha de retorno e **nada é enviado** (`:97`, `expect(mocks.send).not.toHaveBeenCalled()`)
- [x] Gate full passa — `npm test`: 794 passed, 63 arquivos
- [x] Contagem de testes: 794 (786 + 8)

**Decisão de execução — ausência de chave é falha de provedor, não pré-condição.** Não há conta Resend configurada (risco registrado no design.md, decisão do usuário de seguir assim). `RESEND_API_KEY` ausente devolve `{ ok: false }` com mensagem que instrui a reenviar, em vez de lançar ou barrar o build: o convite continua criando o usuário (USER-01 AC4) e o administrador continua nascendo pelo bootstrap de linha de comando (SEED-01 AC5). Nenhum e-mail sai até alguém colocar uma chave real em produção.

**Nota de teste — o SDK é mockado em 100% dos casos.** Nenhum teste desta suíte bate na API do Resend: não há conta, e um teste dependente de rede externa deixaria de ser determinístico (`fileParallelism: false` já indica que a suíte é sensível a I/O real). O que se prova é o contrato do adaptador.

**Dependência nova**: `resend@^6.22.1` em `package.json`. `.env.example` ganhou `RESEND_API_KEY` e `RESEND_FROM`.

**Tests**: integration
**Gate**: full

**Commit**: `feat(auth): adiciona adaptador de email para convites`

---

### T20: Ações de convite e papéis ✅

**What**: Criar as server actions de convidar, reenviar convite e alterar papéis de um vínculo.
**Where**: `src/server/actions/users.ts`
**Depends on**: T19
**Reuses**: padrão de server action de `src/server/actions/documents.ts` (imobiliária sempre resolvida no servidor, nunca vinda do `input`)
**Requirement**: `USER-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
Evidência em `src/server/__tests__/users-actions.test.ts`:

- [x] Convite cria usuário em estado pendente e dispara o e-mail — `:221` `expect(credentials).toHaveLength(0)` (pendente é literalmente "sem linha de credencial em `accounts`", o mesmo estado do seed), `:228` `expect(member!.inviteState).toBe("pendente")`, `:237` `expect(sent.url).toContain(invitations[0].id)` (o e-mail carrega O token emitido, não um link qualquer)
- [x] E-mail que já é usuário do sistema ganha vínculo novo em vez de segundo usuário — `:258` `expect(rows).toHaveLength(1)` (um usuário só com aquele e-mail) e `:265` `expect(memberships).toHaveLength(2)`, com o papel de cada imobiliária asseverado separadamente
- [x] E-mail que já pertence à imobiliária ativa é recusado com mensagem própria — `:288` `expect(result.error).toBe("Este e-mail já pertence a esta imobiliária.")` e `:294` `expect(memberships).toHaveLength(1)` (nada foi escrito)
- [x] Falha de envio mantém o usuário criado e oferece reenviar — `:316` `expect(result.warning).toContain("Reenviar convite")` com `emailSent: false` e o usuário lido de volta do banco em convite pendente
- [x] Reenviar emite token novo e invalida o anterior — `:355` `expect(antigo.status).toBe("cancelado")`, `:356` `expect(novo.status).toBe("pending")`, `:357` `expect(lastInvitationEmail().url).toContain(novo.id)`
- [x] Alterar papéis vale na requisição seguinte, sem relogin — `:399` `expect(depois.context.roles).toEqual(["corretor","gestor"])` resolvido pela guarda REAL (`resolveAuthContext`) com **o mesmo cookie** de antes da alteração, sem nenhum `signIn` no meio
- [x] Alteração que deixaria a imobiliária sem administrador ativo é recusada — `:418` mensagem exata e `:426` `expect(row.role).toBe("administrador")` (nada gravado). Contraprova em `:452`: com outro administrador ativo, o mesmo rebaixamento **passa** — sem ela, um "recusa sempre" passaria no teste
- [x] Todas as ações recusadas para quem não é administrador — gestor recusado nas TRÊS actions (`:472`, `:478`, `:487`) com `"Sem permissão para escrever usuarios."`, mais a prova de que nada foi escrito (`:499` papel intacto, usuário e convite inexistentes); corretor recusado em `:515`
- [x] Gate full passa — `npm test`: 806 passed, 64 arquivos; `tsc --noEmit` 0
- [x] Contagem de testes: 806 (794 + 12)

**Decisão de escopo — a camada de dados entrou junto.** A task declara `Where: src/server/actions/users.ts`, mas toda action do CRM chama `src/server/data/index.ts` (nenhuma fala com o drizzle direto). Manter o padrão exigiu a seção "Gestão de usuários" na DAL: `getTenantMembers`, `getTenantMemberById`, `findUserByEmail`, `createPendingUser`, `createMembership`, `getMembership`, `setMemberRoles`, `countActiveAdministrators`, `createInvitation`, `getInvitation`. `getInvitation` nasce aqui porque `createInvitation` já define o formato do token; quem a consome é a T23.

**Decisão — o token do convite é o id da linha de `tenant_invitations`.** Uuid v4 gerado pelo banco, sem segundo campo de token para manter em sincronia. Reenviar é uma transação só: os convites pendentes daquele e-mail naquela imobiliária passam a `cancelado` e o novo nasce `pending` — o link antigo morre no mesmo instante em que o novo existe, que é o que a AC5 pede.

**Nota — nenhuma invalidação de cache de papel foi necessária (AC8).** A guarda lê `tenant_members` a cada requisição; o papel novo já vale na seguinte por construção. O teste prova isso sobre uma sessão real emitida antes da alteração, e não sobre a mock.

**Nota de localização de teste**: a matriz aponta `src/server/__tests__/actions.test.ts` para a camada de server actions. O arquivo novo é `src/server/__tests__/users-actions.test.ts` — mesmo diretório e mesmo estilo de harness; separado porque a mock de sessão daquele arquivo fixa a PRIMEIRA imobiliária do seed, e estas actions precisam de imobiliárias-fixture próprias (inclusive uma com um único administrador).

**Tests**: integration
**Gate**: full

**Commit**: `feat(usuarios): adiciona acoes de convite e papeis`

---

### T21: Desativação com destino da carteira ✅

**What**: Criar a server action de desativação que exige a escolha do destino dos leads ativos: transferir para um corretor, redistribuir pela política, ou manter com sinalização.
**Where**: `src/server/actions/deactivate.ts`
**Depends on**: T20
**Reuses**: a política de atribuição existente para a opção de redistribuir
**Requirement**: `USER-02`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
Evidência em `src/server/__tests__/deactivate-actions.test.ts`:

- [x] Desativar com leads ativos exige uma das três escolhas — `:219` `expect(result.escolhaDeCarteiraObrigatoria).toBe(true)` com `leadsAtivos: 1`, e a prova de que a recusa não escreveu nada: `:222` vínculo ainda ativo, `:223` lead ainda com o mesmo responsável
- [x] Transferir move todos os leads ativos numa única operação — `:260`/`:261` os dois ativos (um `em_qualificacao`, um `escalado_humano`) passam para o destino, `:258` `leadsReatribuidos: 2`
- [x] Redistribuir recalcula a carga a cada lead — `:308-310`, `expect(await assigneeOf(l1)).toBe(b.userId)`, `l2` → A, `l3` → B. A alternância só acontece se a carga for recontada entre um lead e outro: com carga fixa, os três cairiam em B
- [x] Manter preserva a atribuição e sinaliza responsável inativo — `:341` atribuição intacta e `:348` `expect(card.brokerDeactivatedAt).not.toBeNull()` lido por `getLeads` no escopo amplo (o sinal que o Pipeline exibe para administrador e gestor), com `:347` provando que o nome continua lá
- [x] Leads não ativos nunca mudam de responsável, em nenhuma das três — transferir `:263`, manter `:342`, sem carteira `:371`
- [x] Sem leads ativos, desativa direto e não pergunta — `:369` `{ ok: true, leadsAtivos: 0 }` **sem `destino` no input** e `:370` vínculo desativado
- [x] Corretor de destino desativado durante a operação faz a transferência inteira ser recusada — `:420` `expect(transferencia).toEqual({ ok: false, reason: "destino-indisponivel" })`, com a ordem que importa: o destino é lido como ATIVO na confirmação e só então desativado, antes da escrita. `:434-436`: nenhum lead moveu **e** a origem não foi desativada
- [x] Último administrador ativo não consegue se desativar — `:459` vínculo intacto, com a mensagem exata; contraprova em `:472-473` (com dois administradores, desativar um passa)
- [x] Usuário desativado não loga e sai das listas de atribuição, mantendo o nome no histórico — `:517`/`:520` some de `getBrokers` e `getBrokerLoads`; `:526` `expect(depois).toMatchObject({ ok: false, reason: "sem-vinculo" })` com a MESMA sessão emitida antes da desativação; `:532` o lead histórico continua nomeado com ele
- [x] Gate full passa — `npm test`: 817 passed, 65 arquivos; `tsc --noEmit` 0; lint 0 erros; `npm run build` exit 0 (rodado a mais porque a task tocou um componente React)
- [x] Contagem de testes: 817 (806 + 11)

**SPEC_DEVIATION — "não loga" é por vínculo, não global.** `USER-01` AC10 diz "recusar o login dele". Login é global e usuário é multi-tenant (AD-021): recusar o login de quem foi desativado numa imobiliária tiraria dele o acesso à outra em que continua ativo. O que a implementação faz é recusar o **acesso àquela imobiliária** — a guarda já lê só vínculos com `deactivatedAt` nulo, então a sessão perde o tenant na requisição seguinte e, se era o único vínculo, o usuário cai em `/sem-acesso` sem nenhum dado renderizado. **Razão**: preservar a decisão de conta única multi-imobiliária, que é a razão de existir do vínculo.

**Decisão de execução — a transferência é uma transação com o destino travado.** `transferCarteiraAndDeactivate` abre a transação travando o vínculo do destino (`select … for update`, exigindo ativo e com papel corretor) antes de mover qualquer lead, e desativa a origem na mesma transação. É isso que dá sentido à AC7: uma desativação concorrente do destino ou espera esta transação, ou já está visível — e, se estiver, nada acontece. Um `UPDATE` guardado sem lock deixaria o caso "destino desativado no meio" dependente de sorte de escalonamento.

**Consequência — três listas de atribuição passaram a filtrar vínculo desativado.** `getBrokers`, `getBrokerLoads` e a subquery de validação de `updateLeadBroker` compartilham agora `IS_ASSIGNABLE_BROKER` (papel corretor **e** `deactivatedAt` nulo), a dívida que a T12 deixou registrada. `getLeads` continua fazendo o join com `users`, então o nome do desativado permanece no histórico.

**Consequência — `LeadWithBroker` ganhou `brokerDeactivatedAt`.** Derivado do vínculo por LEFT JOIN (único por usuário × imobiliária, então não duplica linha), sem coluna nova em `leads`: a atribuição em si continua intacta, como a AC4 exige. O card do Kanban passou a exibir `Token` laranja `"<nome> · inativo"` no lugar do avatar — sem isso, "manter" ficaria indistinguível de atendimento em curso na única tela onde a AC4 pede visibilidade.

**Nota de escopo — `getDeactivationPreviewAction` nasceu aqui.** O edge case das reuniões futuras é da T22 (tela), mas a leitura é server-side e pertence a esta camada; `:585`/`:587` provam que a confirmação separa carteira ativa de reunião futura e que reunião passada não entra.

**Tests**: integration
**Gate**: full

**Commit**: `feat(usuarios): desativacao com destino da carteira`

---

### T22: Tela de usuários ✅ (verificada visualmente)

**What**: Criar a página de gestão de usuários, listando membros, papéis e estado do convite, com os controles das ações das T20 e T21.
**Where**: `app/(crm)/usuarios/page.tsx`
**Depends on**: T21
**Reuses**: `astryx build` / `astryx template` antes de compor; padrão de lista densa em linhas (Table/List), nunca cards
**Requirement**: `USER-01`, `USER-02`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Lista mostra nome, e-mail, papéis, janela de trabalho e estado do convite — **verificado por requisição real** contra `npm run dev` apontado ao banco de teste (o único com usuários semeados), autenticado como administrador do Vale do Uberaba: o HTML de `/usuarios` contém os cabeçalhos `Janela de trabalho` e `Convite pendente`, os e-mails dos 5 membros da imobiliária (`helena.teixeira@…`, `marcos.silva@…`, …) e os papéis `Administrador`/`Corretor`
- [x] Desativação com leads ativos apresenta as reuniões futuras do corretor junto da escolha de destino — `DeactivateMemberDialog` lê `getDeactivationPreviewAction` ao abrir e só então apresenta o `RadioList` das três escolhas; a separação carteira ativa × reunião futura é asseverada em `src/server/__tests__/deactivate-actions.test.ts:585,587` (T21)
- [x] Página inteira recusada para quem não é administrador — **verificado como caminho de rota**, não como item escondido: logado como **gestor**, `GET /usuarios` responde **404** e o log do servidor registra a negativa estruturada (`{"event":"permissao-negada",…,"resource":"usuarios","action":"ler"}`); o mesmo gestor recebe **200** em `/pipeline`, e o administrador recebe **200** em `/usuarios`. O item de navegação acompanha: `href="/usuarios"` aparece no HTML do administrador e **não** aparece no do gestor
- [x] Self-check Astryx cumprido — dado denso em linhas, sem card por item: `Table` com `density="compact"`, `dividers="rows"`, dentro de **um** `Card padding={0}` (mesmo tratamento da tabela de Documentos); grep limpo de `<div>`, `<span>`, `style={{}}`, `.css`, `@apply` e valor cru em `app/(crm)/usuarios/page.tsx` e em `src/components/usuarios/`
- [x] Gate de build passa — `npm test` 817 passed, lint 0 erros (2 warnings pré-existentes em `n8n/`), `npm run build` exit 0 com a rota `/usuarios` listada, `tsc --noEmit` 0
- [x] Contagem de testes: 817 (inalterada — `Tests: none` por camada, como previsto na matriz)

**✅ VERIFICAÇÃO VISUAL REALIZADA** (extensão Claude in Chrome, dev server local apontado ao banco de teste). **A causa do bloqueio dos batches anteriores foi identificada**: há **dois** Chrome conectados à conta e o que estava selecionado não alcançava `localhost`. `list_connected_browsers` + `select_browser` no "Browser 1" resolveu — não era rede da máquina, era o browser errado. Capturas reais:
1. **Lista de usuários** (administrador do Vale do Uberaba e depois do Crivo Demo): linhas densas com nome + e-mail, `Token` de papel, janela de trabalho formatada (`Seg, Ter, Qua, Qui, Sex · 08:00–14:00`, `Sáb · 09:00–13:00`, `Não declarada`), situação com `StatusDot` (`Convite pendente` × `Ativo`) e menu `Ações` por linha.
2. **Item "Usuários" na barra lateral** visível para o administrador (e ausente para o corretor — ver T23).
3. **Diálogo Convidar usuário**: nome, e-mail e os três papéis com descrição, `Corretor` pré-marcado.
4. **Diálogo Desativar usuário** com carteira real: `Reuniões futuras já marcadas (1)` listando lead + data/hora **acima** de `Destino dos 3 leads ativos` com as três escolhas — que é exatamente o edge case da spec renderizado.

Nada pareceu "off" nas capturas. Único detalhe cosmético: a janela de trabalho de 5 dias quebra em duas linhas em uma das larguras de coluna — legível, sem sobreposição.

**Decisão de composição — reuso do padrão de Documentos, não de um template novo.** `npx astryx build` sugeriu o template `ide` (fora de propósito). A tabela de Documentos já é o padrão de dado denso do produto e foi reusada literalmente: colunas com `proportional`/`pixel`, ações por linha em `DropdownMenu`, diálogos separados por operação. Papéis são `Token` (categoria), situação é `StatusDot` + texto (estado), `Badge neutral` só para "Desativado" — a divisão que o AGENTS.md pede.

**Arquivos**: `app/(crm)/usuarios/page.tsx`, `src/components/usuarios/{users-table,invite-user-dialog,member-roles-dialog,resend-invite-dialog,deactivate-member-dialog}.tsx`, `src/components/usuarios/role-options.ts`, mais o item `Usuários` em `NAV_ITEMS` (`src/components/shell/sidebar.tsx`) — o filtro por permissão da T18 esconde o item de gestor e corretor sem nenhuma condição especial.

**Achado fora de escopo — `npm run db:create-admin` não roda mais por linha de comando.** Executado via `tsx`, ele quebra em `Error: This module cannot be imported from a Client Component module` porque importa `parseRoles` de `src/server/auth/session.ts`, que tem `import "server-only"`. Sob vitest o resolvedor do vite neutraliza esse import, então os testes da T8 continuam verdes — o CLI é que deixou de funcionar. Correção provável: importar `parseRoles` direto de `src/lib/permissions.ts` (a T15 tornou isso possível). **Não corrigido aqui**: é a T8, fora do escopo desta task.

**Tests**: none — página React, camada "none" na matriz; as ações são cobertas por T20 e T21
**Gate**: build

**Commit**: `feat(usuarios): adiciona tela de gestao de usuarios`

---

### T23: Tela de aceite de convite ✅

**What**: Criar a tela onde o convidado define a senha e ativa a conta.
**Where**: `app/convite/[token]/page.tsx`
**Depends on**: T22
**Reuses**: componentes de formulário da tela de login (T6)
**Requirement**: `USER-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
Evidência em `src/server/__tests__/accept-invitation.test.ts`:

- [x] Convite válido com senha nova ativa o usuário e cria a sessão dele — `:135` prova o estado inicial (`expect(antes).toHaveLength(0)`, nenhuma credencial), `:149` a credencial passa a existir, `:153` `expect(login.user.id).toBe(convidado.userId)` (a senha **funciona**, não só existe uma linha), `:160` sessão criada para ele e `:161` convite marcado `accepted`
- [x] Convite expirado ou já usado é recusado, com instrução de pedir novo convite — já usado em `:180` e expirado em `:205`, ambos com a mensagem exata `"Este convite não vale mais. Peça um novo convite ao administrador da imobiliária."`; `:186` prova que a segunda tentativa **não** trocou a senha e `:211` que o expirado não criou credencial nenhuma. Token inexistente devolve a mesma mensagem (`:219`) — os três casos são indistinguíveis para quem abre o link
- [x] Convite aberto por alguém já autenticado com outra conta encerra a sessão corrente antes de ativar — `:244` prova que a sessão da outra conta estava VIVA antes, `:257-258` `expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull()` depois, e `:265` que o convidado saiu com sessão própria. A asserção é sobre o estado do servidor, não sobre o cookie do cliente
- [x] Self-check Astryx cumprido — `Center` + `Card` + `VStack` + `FormLayout` + `TextInput` + `Button` + `EmptyState`, reusando a composição da tela de login (T6); grep limpo de `<div>`, `<span>`, `style={{}}`, `.css`, `@apply` e valor cru em `app/convite/[token]/page.tsx` e `src/components/auth/accept-invitation-form.tsx`
- [x] Gate full passa — `npm test`: **824 passed**, 66 arquivos; `tsc --noEmit` 0; lint 0 erros; `npm run build` exit 0 com a rota `/convite/[token]` listada
- [x] Contagem de testes: 824 (817 + 7)

**✅ VERIFICAÇÃO VISUAL REALIZADA — o edge case foi exercitado no navegador, não só em teste.** Com a sessão do **administrador do Crivo Demo aberta**, abri `/convite/<token>` e ativei a conta do convidado. Capturas reais: (1) a tela de aceite com o nome da imobiliária e o e-mail do convidado; (2) o Pipeline logo depois, com o rodapé da barra lateral mostrando **"Convidado de Verificacao"** no lugar do administrador — a sessão anterior foi encerrada e substituída — e a navegação já sem **Configurações** e sem **Usuários**, porque o convidado só tem papel corretor; (3) o mesmo link recarregado exibindo **"Convite indisponível"** com a instrução de pedir um novo convite. Bônus: a tela de login (T6, que nunca tinha sido olhada) e o estado de erro dela também foram capturados nesta sessão.

**Decisão de execução — quem já tem senha não define outra.** Um convite para a **segunda** imobiliária chega a alguém que já tem credencial (USER-01 AC2). Nesse caso o vínculo já nasceu com o convite e não há senha a definir: a action marca o convite como usado e devolve `needsLogin: true`, e a tela manda para o login. Trocar a senha dele por um link de convite seria uma redefinição disfarçada — um caminho de tomada de conta que a spec nunca pediu. Coberto em `:296-301`, incluindo a prova de que a senha antiga continua valendo.

**Nota de implementação — a ativação usa o adaptador interno do better-auth.** `auth.$context.internalAdapter.linkAccount({ providerId: "credential", issuer: createLocalAccountIssuer("credential"), password: await ctx.password.hash(...) })`. O `setPassword` da biblioteca exige sessão (`sensitiveSessionMiddleware`), e quem aceita um convite é justamente quem ainda não tem uma; `signUpEmail` não serve porque o usuário já existe desde o convite. A sessão sai de `signInEmail` logo depois, com o cookie aplicado pelo `nextCookies()`.

**Consequência — `Invitation` ganhou `isUsable`.** A validade (pendente **e** dentro do prazo) é resolvida na camada de dados. O primeiro desenho lia `Date.now()` dentro do render do RSC e o lint do compilador React recusou (`Cannot call impure function during render`) — o relógio agora é lido no servidor, fora do render, e página e action consomem a mesma decisão.

**Tests**: integration
**Gate**: full

**Commit**: `feat(usuarios): adiciona tela de aceite de convite`

---

### Phase 6: Agenda e atribuição

### T24: Função pura de janela de trabalho ✅

**What**: Criar as funções puras de cobertura de instante e de intervalo, e a validação da janela declarada.
**Where**: `src/lib/work-window.ts`
**Depends on**: T23
**Reuses**: lógica e convenção de `n8n/src/business-hours.mjs` (dias ISO 1-7, `HH:MM`, America/Sao_Paulo)
**Requirement**: `AGENDA-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
Evidência em `src/lib/__tests__/work-window.test.ts`:

- [x] `coversInterval` exige contenção **integral** — reunião que começa no minuto de fim da janela não é coberta — `:88` `expect(coversInterval(MANHA, 24/08 14:00, 14:30)).toBe(false)` com a janela terminando 14:00. Os três vizinhos da borda provam que não é um "false sempre": `:68` reunião começando **no** minuto de início é coberta, `:78` reunião terminando **no** minuto de fim é coberta (está inteira dentro), `:98` reunião que transborda o fim em 15 min não é
- [x] `coversInstant` cobre o escalonamento — `:23` dentro do dia e da faixa é `true`, `:27` o minuto de início é `true` (inclusivo), `:31` o minuto de fim é `false` (exclusivo, mesma escolha de `isSlotWithinBusinessHours`), `:40` sábado às 10:00 é `false` numa janela seg-sex
- [x] `validateWorkWindow` recusa fim não posterior ao início e recusa nenhum dia selecionado, apontando o campo — `:157` `toEqual({ ok: false, field: "workHoursEnd", message: "O horário de fim precisa ser posterior ao de início." })` para fim **igual** ao início, `:168` para fim anterior; `:172` `toEqual({ ok: false, field: "workDays", message: "Selecione ao menos um dia da semana." })`. As asserções são sobre o objeto inteiro, não sobre `ok` falso
- [x] Janela ausente é tratada como indisponível sempre — `:52` `expect(coversInstant(null, …)).toBe(false)` e `:139` `expect(coversInterval(null, …)).toBe(false)`, ambos num instante/intervalo que a janela `MANHA` cobriria (`:23` e `:58` são o contraste)
- [x] Testes 1:1 com as ACs de `AGENDA-01` e as edge cases de borda de janela — AC2 em `:151` (dias 1-7 + `00:00`/`23:59` aceitos), `:180`/`:183` (dia 8 e dia 0 recusados), `:189`/`:192` (`"9:00"` e `"25:00"` recusados) e `:47-48` (o instante é lido em America/Sao_Paulo: `10:59Z` = 07:59 local é `false`, `11:00Z` = 08:00 local é `true` — lido como UTC, o primeiro daria `true`); AC3 em `:157`/`:168`; AC4 em `:172`; AC5 em `:52`/`:139`; edge case de borda em `:68`/`:78`/`:88`
- [x] Gate quick passa — `npm test`: **847 passed**, 67 arquivos
- [x] Contagem de testes: 847 (824 + 23)

**Decisão de execução — o parâmetro de janela é `WorkWindow | null`, não `WorkWindow`.** O design assina `coversInstant(window: WorkWindow, at: Date)`, mas a AC5 exige que corretor sem janela declarada seja indisponível sempre. Aceitar `null` na própria função é o que impede o call site de decidir isso por conta própria: `BrokerCandidate.window` já é `WorkWindow | null` no design, e sem isso cada chamador precisaria lembrar de tratar o nulo antes. Uma regra, um lugar.

**Decisão — intervalo que atravessa a virada do dia nunca é coberto** (`:127`). A janela é declarada por dia da semana; sem essa checagem, uma reunião 23:50→00:20 numa janela `08:00-23:59` passaria (início ≥ 08:00 e fim `"00:20"` ≤ `"23:59"` são ambos verdadeiros como comparação de string). É consequência direta de "integralmente contido na janela", não regra nova.

**Nota — sem `Commit:` na definição da task.** Como em T15, composta na convenção do lote.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agenda): adiciona funcao pura de janela de trabalho`

---

### T25: Janela de trabalho na tela ✅ (server action; UI adiada — ver nota)

**What**: Adicionar a edição da janela de trabalho, pelo próprio corretor e por administrador/gestor para qualquer corretor.
**Where**: `src/server/actions/work-window.ts`
**Depends on**: T24
**Reuses**: `validateWorkWindow` da T24 e o padrão de server action de `documents.ts`
**Requirement**: `AGENDA-01`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
Evidência em `src/server/__tests__/work-window-actions.test.ts`:

- [x] Corretor salva a própria janela; administrador e gestor salvam a de qualquer corretor, com o mesmo efeito — o próprio corretor em `:160-162` (`expect(saved.workDays).toEqual([1,2,3,4,5])`, `workHoursStart` `"08:00"`, `workHoursEnd` `"14:00"` lidos de volta do banco, não do retorno da action); administrador em `:179-181` (`toEqual([6])`, `"09:00"`, `"13:00"`); gestor em `:199-201` (`toEqual([2,4])`, `"13:00"`, `"19:00"`). O gestor é o caso que separa esta regra de `usuarios/escrever`, que é exclusivo do administrador
- [x] Usuário sem esses papéis tentando salvar a janela de outro é recusado no servidor — `:216`, `expect(result).toEqual({ ok: false, error: "Sem permissão para editar a janela de trabalho de outro usuário." })` com a action chamada **diretamente** por uma sessão de corretor, e `:222` `expect(depois).toEqual(antes)` provando que a janela do alvo não mudou
- [x] Entrada inválida é recusada com o campo apontado — `:237` `toEqual({ ok: false, field: "workHoursEnd", error: "O horário de fim precisa ser posterior ao de início." })` (AC3) e `:258` `toEqual({ ok: false, field: "workDays", error: "Selecione ao menos um dia da semana." })` (AC4); `:243` e `:264` provam que nenhuma das duas gravou
- [x] Gate full passa — `npm test`: **854 passed**, 68 arquivos; `tsc --noEmit` 0
- [x] Contagem de testes: 854 (847 + 7)

**Decisão de execução — a guarda desta action NÃO é a matriz de permissões.** AGENDA-01 AC6 dá a edição da janela de terceiros a administrador **e gestor**; `usuarios/escrever` é exclusivo do administrador (PERM-01 AC2). Acrescentar um recurso `agenda` à matriz mudaria a tabela que a T15 transcreveu 1:1 do `context.md` (e o teste que varre as 36 combinações). A regra mora na própria action: `isSelf` OU papel administrador/gestor. A negativa emite a mesma linha estruturada `permissao-negada` das demais (PERM-01 AC6), com `resource: "janela-de-trabalho"`.

**⚠️ Escopo entregue — server action, sem tela.** O título da task diz "na tela", mas os quatro critérios de "Done when" são todos server-side, o `Where` é o arquivo da action, e a instrução do batch é explícita: nenhuma tela nova nesta fase, nenhuma verificação visual. A ação existe, está coberta e recusa corretamente; **o controle na tela de Usuários (e a edição pelo próprio corretor) ainda não existe** — a janela continua sendo exibida em `/usuarios` (T22) e escrita pelo seed (T14). Ligar o diálogo é trabalho visual e exige captura real (regra do usuário), então fica registrado aqui como pendência do lote em vez de entrar sem conferência.

**Nota de escopo — a camada de dados entrou junto**, como na T20: `setMemberWorkWindow(tenantId, memberId, window)` em `src/server/data/index.ts`, escopada ao tenant na mesma sentença de `UPDATE` (molde de `setMemberRoles`) — um `memberId` de outra imobiliária nunca é alterado, asseverado em `:279-280`.

**Tests**: integration
**Gate**: full

**Commit**: `feat(agenda): edicao da janela de trabalho do corretor`

---

### T26: Filtros de disponibilidade na política de atribuição ✅

**What**: Estender `broker-assignment.ts` com os filtros de candidatos por agenda, preservando `assignBroker` como desempate.
**Where**: `src/lib/broker-assignment.ts`
**Depends on**: T25
**Reuses**: `assignBroker` e seus testes existentes — **estender, não substituir**; `coversInterval`/`coversInstant` da T24
**Requirement**: `ATRIB-02`, `ATRIB-03`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
Evidência em `src/lib/__tests__/broker-availability.test.ts`:

- [x] `selectForMeeting` filtra por janela cobrindo o intervalo e exclui quem tem reunião sobreposta — `:44` `expect(selected.map(b => b.id)).toEqual(["manha"])` numa reunião 10:00-10:30 com um candidato de janela manhã e outro de tarde; `:57` exclui quem não declarou janela; `:77` `toEqual(["livre"])` com o outro candidato tendo reunião 10:15-10:45; `:100` a reunião **encostada** (termina 10:00 e outra começa 10:30) NÃO exclui — sem esse caso, um filtro que rejeitasse qualquer reunião no dia passaria igual; `:110` `toEqual([])` no sábado, que é o insumo do `sem-corretor-disponivel` da T28
- [x] `selectForEscalation` filtra por janela cobrindo o instante e **devolve todos** quando o filtro esvazia — `:167` só quem está em janela às 09:00; `:198` com o instante fora de toda janela (sábado 22:00) devolve os **três** candidatos, inclusive o que nunca declarou janela, e `:203` `expect(assignBroker(selected)).toBe("tarde")` prova que a escolha degradada é a de menor carga entre todos; `:215` mostra que a degradação não vaza para o caso normal (quem não declarou janela fica de fora enquanto houver alguém em janela); `:219-220` lista vazia continua vazia e `assignBroker` devolve `null` (AC4 — imobiliária sem corretor ativo)
- [x] `assignBroker` continua intacta, com seus testes atuais passando sem alteração — `src/lib/broker-assignment.ts` **não foi tocado** (`git diff` vazio no arquivo) e os 5 testes de `src/lib/__tests__/broker-assignment.test.ts` seguem verdes sem uma linha alterada, inclusive o de pureza (`expect(source).not.toMatch(/\bimport\b/)`)
- [x] Desempate segue determinístico: carga → `createdAt` → `id` — `:135-140`: os três candidatos cobrem 13:15-13:45 (a faixa em que manhã e tarde se sobrepõem), e `expect(assignBroker(selected)).toBe("leve-antigo")` escolhe entre os dois de carga 2 o de `createdAt` mais antigo. `:185` repete a leitura para o escalonamento. O `id` exato, nunca "algum dos dois"
- [x] Testes 1:1 com as ACs de `ATRIB-02` e `ATRIB-03` — AC2 em `:44`, AC3 em `:140`, AC6 em `:77`/`:100`, insumo da AC5 em `:110`; ATRIB-03 AC2 em `:167`/`:185`, AC3 em `:198`/`:203`, AC4 em `:219`. Mais `:150`, que assevera que o candidato devolvido **não** carrega janela nem reuniões — a lista de candidatos não sai da regra (AD-018)
- [x] Gate quick passa — `npm test`: **866 passed**, 69 arquivos; `tsc --noEmit` 0
- [x] Contagem de testes: 866 (854 + 12)

**SPEC_DEVIATION — os filtros nasceram em `src/lib/broker-availability.ts`, não dentro de `broker-assignment.ts`.** O design manda estender `broker-assignment.ts`, e os filtros dependem de `work-window.ts` (design.md — Dependencies). Só que o teste de pureza que o lote-7 deixou naquele módulo assevera literalmente que o arquivo **não contém nenhum `import`** (`broker-assignment.test.ts:49`). Acrescentar o import exigido pelo design faria aquele teste falhar — e o critério desta mesma task diz que os testes atuais de `assignBroker` passam **sem alteração**. Enfraquecer aquela asserção para acomodar a implementação é exatamente o que a disciplina de teste proíbe. **Razão**: um módulo novo satisfaz as duas exigências ao mesmo tempo — `assignBroker` continua intacto e sem dependências, e os filtros ficam num arquivo cujo nome é o que ele faz ("filtros de disponibilidade"). `BrokerCandidate` estende `BrokerLoad`, e o desempate continua sendo o `assignBroker` do lote-7, importado sem alteração.

**Decisão — sobreposição é meio-aberta `[start, end)`.** Reunião que termina 10:00 não conflita com uma que começa 10:00, mesma convenção de borda de `coversInstant` e de `isSlotWithinBusinessHours`. Sem isso, slots consecutivos de 30 min (a granularidade do produto) se excluiriam mutuamente e um corretor só poderia ter uma reunião por dia.

**Nota — sem `Commit:` na definição da task.** Como em T15 e T24, composta na convenção do lote.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(atribuicao): filtra candidatos por janela e reuniao`

---

### T27: Atribuição na DAL e índice de conflito ✅

**What**: Criar as funções de acesso a dados que montam os candidatos e persistem a escolha, com índice único no banco impedindo dois leads no mesmo corretor e intervalo.
**Where**: `src/server/data/index.ts`
**Depends on**: T26
**Reuses**: a query agregada de `getBrokerLoads`; a disciplina de índice único parcial de `leads_tenant_id_external_id_idx`
**Requirement**: `ATRIB-02`, `ATRIB-03`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
Evidência em `src/server/data/__tests__/assignment.test.ts`:

- [x] `getBrokerCandidates` devolve carga, janela e reuniões de cada corretor ativo, numa query agregada — `:148-151`: `expect(candidates[0].activeLeads).toBe(2)` (o `qualificado_agendado` do mesmo corretor não conta, mesma regra de `getBrokerLoads`), `expect(candidates[0].window).toEqual(MANHA)` e `expect(candidates[0].meetings).toEqual([{ start: SLOT, end: SLOT + 30min }])`. Mais: `:162` janela nula quando não declarada, `:173` `activeLeads: 0` pelo LEFT JOIN, `:186-188` vínculo desativado e gestor fora dos candidatos (é o edge case "janela cobre mas está desativado"), `:215-218` isolamento — o MESMO usuário vinculado a duas imobiliárias não traz para cá nem a reunião nem a carga da vizinha
- [x] `assignBrokerForMeeting` e `assignBrokerForEscalation` persistem a escolha atomicamente — uma `UPDATE` só, com o responsável, o `meetingAt` e o resto do patch juntos: `:243-245` (`assignedUserId`, `meetingAt` e `status` lidos de volta do banco) e `:424-426` no escalonamento (`assignedUserId`, `status` e `statusChangedBy: "agente"` na mesma escrita). `:239-240` prova que a escolha é a de janela, não a de menor carga: o corretor da tarde tem vínculo mais antigo e nenhuma carga, e ainda assim não é escolhido para as 10:00
- [x] Índice único no banco impede duas reuniões do mesmo corretor no mesmo intervalo — `:286` exercita o índice por **escrita direta**, sem passar por nenhuma checagem de aplicação: `await expect(db.update(leads).set({ assignedUserId, meetingAt: SLOT })...).rejects.toThrow()`. `:314` é a contraprova de que o índice é por intervalo e não por corretor: o mesmo corretor 30 min depois grava normalmente
- [x] Dois agendamentos concorrentes: exatamente um confirma, provado por teste concorrente — `:333` `expect(confirmados).toHaveLength(1)` sobre um `Promise.all` de dois agendamentos disputando o único corretor elegível, e `:342` a mesma verdade lida do banco (`toHaveLength(1)` para `(corretor, instante)`). O **código** que o perdedor recebe tem teste próprio e determinístico em `:345`: uma transação aberta reserva o slot e segura o lock, o concorrente escolhe o mesmo corretor (a reserva não confirmada é invisível em read committed) e trava no índice — `:395` `expect(bloqueou).toBe(true)` prova, por `pg_stat_activity`, que ele estava de fato **bloqueado** antes da liberação (sem isso a corrida degeneraria numa leitura tardia), `:396` `toEqual({ ok: false, reason: "conflito-de-agenda" })` e `:399-401` que ele não gravou nada
- [x] Imobiliária sem corretor ativo grava o escalonamento com lead sem responsável, sinalizado — `:440` `toMatchObject({ ok: true, brokerId: null })` numa imobiliária só com gestor e corretor desativado, `:443-444` status `escalado_humano` gravado com `assignedUserId` nulo. O sinal é o próprio par (escalado + sem responsável), que o card do Kanban já exibe como "Sem responsável" para administrador e gestor (T13) — nenhuma coluna nova
- [x] Lead que já tem responsável e passa a escalado **não** é reatribuído — `:460`/`:463-464`: o responsável atual é preservado e devolvido, mesmo existindo um corretor ocioso (carga 0) que a política escolheria se a regra não existisse
- [x] Gate full passa — `npm test`: **880 passed**, 70 arquivos. Rodado também o gate de build, porque a task altera schema: `tsc --noEmit` 0, lint 0 erros (2 warnings pré-existentes em `n8n/`), `npm run build` exit 0
- [x] Contagem de testes: 880 (866 + 14)

**Decisão de schema — `leads_assigned_user_id_meeting_at_idx`, único parcial em `(tenant_id, assigned_user_id, meeting_at)`**, com `where meeting_at is not null and assigned_user_id is not null`. Mesma disciplina de `leads_tenant_id_external_id_idx`: parcial porque o lead deste lote nasce órfão e sem reunião, e essas linhas nunca podem colidir entre si. Como o slot do produto é de 30 minutos alinhados (spec.md — Assumptions), "mesmo `meeting_at`" **é** "mesmo intervalo"; sobreposição parcial (14:00 × 14:15) continua sendo responsabilidade do filtro `selectForMeeting`, que exclui quem já tem reunião sobreposta. Aplicado aos DOIS bancos (`npx drizzle-kit push` e `--config drizzle-test.config.ts`) — nenhum dado existente violava o índice.

**Decisão — a atribuição entra na `UPDATE` que já existia, em vez de numa segunda escrita.** `UpdateLeadFromAgentInput` ganhou `assignedUserId`, e as duas funções chamam `updateLeadFromAgent` com o patch do chamador mais o responsável escolhido. É o que dá sentido à AC1 do ATRIB-03 ("na mesma operação que grava o status") e ao `conflito-de-agenda`: a violação do índice acontece na mesma sentença que gravaria o status, então nada fica gravado pela metade. O campo é interno — `LeadPatchDto` (o payload do agente) não o tem, então nada que venha da rede o alcança.

**Decisão — o agendamento escolhe sempre pela disponibilidade, mesmo com o lead já tendo responsável.** A ATRIB-02 AC2 é incondicional, e o Success Criteria do lote diz "toda reunião agendada tem responsável cuja janela cobre o horário". Preservar um responsável que não atende naquele horário violaria as duas coisas. O escalonamento é o oposto (AC5 preserva explicitamente) — as duas regras são diferentes de propósito.

**Nota de execução — `meetings` vem de subconsulta correlacionada, não de um segundo JOIN.** Dois LEFT JOINs em `leads` (um para carga, outro para reuniões) multiplicariam as linhas e inflariam o `count`. O agrupamento é pela PK do vínculo (`tenant_members.id`), o que deixa o Postgres derivar as demais colunas por dependência funcional.

**Tests**: integration
**Gate**: full (mais o gate de build, por alterar schema)

**Commit**: `feat(dal): atribuicao por agenda com indice de conflito`

---

### T28: Fiação no contrato ✅

**What**: Ligar a atribuição em `patchLead`, adicionar os códigos de erro estáveis, e remover a atribuição na criação do lead.
**Where**: `src/server/integration/leads.ts`
**Depends on**: T27
**Reuses**: `problem()` + `ProblemCode` (AD-013); as validações de transição e trava humana já existentes em `patchLead`
**Requirement**: `ATRIB-02`, `ATRIB-03`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
Evidência de rota em `src/server/integration/__tests__/routes/leads-patch-atribuicao.test.ts`:

- [x] `createAgentLead` deixa de atribuir corretor — lead nasce sem responsável — `src/server/data/__tests__/broker-assignment.test.ts:255`, `expect(lead.assignedUserId).toBeNull()` sobre a MESMA fixture do lote-7 (três corretores com cargas 3/1/1 e vínculos de datas diferentes): o corretor que a política escolheria continua existindo, a criação é que não escolhe mais ninguém. `:293-294` prova que a reentrega idempotente não apaga nem troca um responsável que chegou depois
- [x] Agendamento escolhe o responsável e **devolve ao chamador** o corretor escolhido, sem expor a lista de candidatos — `:178` `expect(body.assignedBroker).toEqual({ name: "Corretora Manhã", email: manhaEmail })` e `:194-195` a escrita persistida (`assignedUserId` e `meetingAt`). A metade negativa da AC4 tem asserção própria em `:189-191`: o payload inteiro (`JSON.stringify(body)`) **não contém** o e-mail do outro corretor, nem o id dele, nem o id interno do escolhido — a lista de candidatos não sai do CRM (AD-018) e a chave primária do usuário continua fora do contrato
- [x] Nenhum corretor cobre o horário → `problem+json` com `code: "sem-corretor-disponivel"`, sem criar a reunião — `:208-211` (409, `content-type: application/problem+json`, `code`) e `:215-218`: `meetingAt` nulo, `assignedUserId` nulo, status intacto **e** `executiveSummary` nulo — o resto do patch também não entrou, que é a atomicidade da INT-04.5 preservada no caminho novo
- [x] Conflito de agenda → `code: "conflito-de-agenda"` — `:269`, com `:266` `expect(bloqueou).toBe(true)` provando por `pg_stat_activity` que a requisição concorrente esteve de fato **bloqueada no índice** (sem isso o teste poderia estar medindo uma leitura tardia), e `:278-279` que só existe uma reunião naquele corretor e instante, a do vencedor
- [x] Escalonamento sem responsável atribui na mesma operação que grava o status — `:293-294` (200 com `assignedBroker`) e `:297-299` (status `escalado_humano` **e** `assignedUserId` preenchido com um dos corretores da imobiliária, lidos do banco). O caso sem corretor ativo é `:317-318`/`:321-322`: escalonamento gravado, `assignedBroker` ausente do payload e lead sem responsável (ATRIB-03 AC4)
- [x] Trava humana permanece com o mesmo `code` de hoje, inalterada — `:338` `expect(body.code).toBe("lead-travado-por-humano")` num lead movido por humano, e `:341-343` provam que a recusa acontece **antes** de qualquer atribuição: nem responsável, nem status, nem `escalationReason` foram gravados. A ordem de validação de `patchLead` não foi tocada
- [x] Testes de rota cobrem feliz + cada código de erro novo + as edge cases listadas — 6 casos de rota: feliz do agendamento, `sem-corretor-disponivel`, `conflito-de-agenda`, feliz do escalonamento, escalonamento sem corretor ativo, trava humana. As edge cases de borda de janela (T24) e de corretor desativado no instante do agendamento (T27 `:186-188`) são cobertas nas camadas onde a regra mora, sem duplicar cenário
- [x] Gate full passa — e também o de build, por fechar a fase: `npm test` **886 passed**, 71 arquivos; `npm run lint` 0 erros (2 warnings pré-existentes em `n8n/`); `npm run build` exit 0; `npx tsc --noEmit` 0
- [x] Contagem de testes: 886 (880 + 6)

**Atualização de testes do lote-7 — substituição 1:1, nunca redução.** `ATRIB-02` AC1 e a AD-022 revogam explicitamente a política de `ATRIB-01` ("lead nasce com corretor"), então dois testes de `src/server/data/__tests__/broker-assignment.test.ts` descreviam comportamento que a spec nova proíbe. Nenhum foi removido nem pulado: o arquivo continua com **9 testes**. O primeiro manteve a fixture inteira e trocou o desfecho para `toBeNull()`, com comentário dizendo o que ele asseverava antes. O de reentrega manteve o invariante que de fato importa (idempotência por `externalId` não reatribui) e ganhou discriminação nova: o responsável passa a ser atribuído **depois** da criação — como o agendamento faz — e a reentrega tem de preservá-lo (`:293-294`), com o corretor de menor carga como contraprova.

**Decisão de contrato — `assignedBroker` é `{ name, email }`, sem id.** `ATRIB-02` AC4 manda devolver o corretor escolhido, e a AC8 precisa do e-mail para convidá-lo ao evento. A spec (Assumptions) diz que a coluna de responsável não aparece no payload do contrato: devolver o `users.id` reintroduziria pela resposta a chave interna que o rename tirou de vista. A chave só aparece quando ESTA operação atribuiu alguém — patch sem agendamento nem escalonamento responde exatamente como antes.

**Decisão — ordem dos caminhos de escrita: agendamento antes de escalonamento.** Um patch com `meetingAt` e status ao mesmo tempo escolhe o caminho do agendamento, que é o mais exigente (janela cobrindo o intervalo inteiro). As validações que já existiam (transição, trava humana, motivo obrigatório) rodam **antes** dos dois, inalteradas.

**Decisão — as duas recusas novas são 409.** Mesma família das demais recusas de regra de negócio desta rota (`transicao-invalida`, `lead-travado-por-humano`): conflito com o estado atual, não payload malformado.

**⚠️ Pendência registrada — `docs/integration/openapi.yaml` e o guia de integração não foram atualizados.** Os dois códigos novos e o campo `assignedBroker` existem no código e nos testes, mas não na documentação do contrato; nenhum teste detecta essa divergência (`openapi.test.ts` valida os *paths*, não os códigos de erro). A T29 consome exatamente isso do lado do n8n — atualizar a doc é trabalho de meia página e cabe naquela fase, ou num passo próprio antes dela. Fora do `Done when` desta task, por isso não foi feito aqui.

**Tests**: integration
**Gate**: full (mais o de build, por fechar a Phase 6)

**Commit**: `feat(contrato): atribuicao no agendamento e no escalonamento`

---

### Phase 7: Fluxo n8n e ambiente

### T29: `tool-agendar-reuniao` com corretor convidado ✅

**What**: Inverter a ordem do sub-workflow — `PATCH` no CRM primeiro, criação do evento depois — e incluir o corretor devolvido como convidado do evento.
**Where**: `n8n/workflows/tool-agendar-reuniao.ts`
**Depends on**: T28
**Reuses**: o nó de tratamento que já devolve `aviso` ao agente quando CRM e Calendar divergem
**Requirement**: `ATRIB-02`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `PATCH` acontece antes da criação do evento e o corretor devolvido entra como convidado, pelo e-mail — a ordem é propriedade do grafo, não das funções puras, então ganhou teste próprio de topologia: `n8n/workflows/__tests__/tool-agendar-reuniao.test.ts:71-73`, `expect(downstreamOf(PATCH)).toContain(CRIAR_EVENTO)` **e** `expect(downstreamOf(CRIAR_EVENTO)).not.toContain(PATCH)` (as duas metades — só a primeira passaria também num grafo cíclico), mais `:77-78` `expect(branchTargets(PATCH, 0)).toEqual([INTERPRETAR])`. O convidado: `n8n/src/__tests__/agendamento.test.ts:41`, `expect(resultado.convidados).toEqual(["corretora.manha@imobiliaria-a.com.br"])`, e a fiação até o nó do Calendar em `tool-agendar-reuniao.test.ts:117-119`, `expect(additionalFields.attendees).toBe("={{ $('Code: interpretar resposta do CRM').first().json.convidados }}")`
- [x] `code: "sem-corretor-disponivel"` faz o agente oferecer outro horário, sem criar evento — `agendamento.test.ts:53-56` (`crmConfirmou` false, `reason` preservado, `convidados` vazio) e `:126-128` `expect(recusa.orientacao).toBe("Nenhum corretor da imobiliária atende nesse horário. A reunião NÃO foi marcada: ofereça outro horário ao lead.")`. Que a recusa **não cria evento** é topológico: `tool-agendar-reuniao.test.ts:95-96` (`branchTargets(DECISAO, 1)` é o nó de recusa) e `:102-103`, `expect(alcancavel).not.toContain(CRIAR_EVENTO)` **e** `expect(alcancavel.size).toBe(0)` — o ramo de recusa é terminal, não desemboca em nada
- [x] Evento criado com CRM já atualizado, ou `aviso` explícito quando divergirem — nunca silencioso — `agendamento.test.ts:158` `expect(resposta.aviso).toBeNull()` no caminho feliz e `:172-174` o texto exato do aviso quando o CRM gravou e o Calendar falhou, com `expect(resposta.crmAtualizado).toBe(true)` e `expect(resposta.meetLink).toBeNull()` na mesma asserção de estado
- [x] `n8n/generated/` regenerado a partir da fonte (AD-014: UI nunca editada à mão) — `node scripts/n8n-inline.mjs`; `git diff --stat` mostra `n8n/workflows/tool-agendar-reuniao.ts` e `n8n/generated/tool-agendar-reuniao.ts` com o **mesmo** delta (194 linhas cada). Nenhum outro arquivo de `generated/` mudou
- [x] Gate de build passa — `npx vitest run` 908 passed / 73 arquivos; `npm run lint` 0 erros (2 warnings pré-existentes em `n8n/`); `npm run build` exit 0; `npx tsc --noEmit` 0
- [x] Contagem de testes: 908 (886 + 22)

**Decisão de execução — a decisão saiu do `jsCode` para `n8n/src/agendamento.mjs`.** O nó final antigo montava a resposta em JavaScript solto dentro do workflow, sem teste. Com a inversão, a decisão ficou maior (confirmou? quem convidar? qual recusa? qual aviso?) e passou a valer o padrão do resto do fluxo: função pura em `n8n/src/`, testada em vitest, inlinada por marcador. Três funções, três nós: `interpretarPatchAgendamento` (lê a resposta do PATCH), `montarRecusaAgendamento` (devolve o motivo ao agente) e `montarRespostaAgendamento` (devolve o resultado, com o aviso da divergência).

**Decisão — `fullResponse` + `neverError` no nó do PATCH.** Sem eles, um 409 do contrato vira erro de nó e o corpo `problem+json` **não chega** ao nó seguinte: o `code` estável que a AD-013 garante ficaria inacessível justo no caminho que a AC5 descreve. Com os dois, a recusa chega como saída regular (`{statusCode, body, headers}`) e `interpretarPatchAgendamento` lê o `code`. `retryOnFail` continua valendo para falha de transporte; um 409 não é retentado, que é o correto (a resposta não vai mudar). `onError: continueRegularOutput` fica como última rede: falha de rede depois das 3 tentativas cai em `reason: "falha-ao-atualizar-crm"`, nunca em silêncio.

**Decisão — confirmação exige as duas metades.** `crmConfirmou` só é verdadeiro com `statusCode === 200` **e** `status === "qualificado_agendado"`. Um 200 com qualquer outro status não cria evento (`agendamento.test.ts:87-93`). Sem a segunda metade, uma resposta 200 de um patch que não agendou nada produziria um evento no Calendar sem reunião no CRM — exatamente a divergência que esta task existe para fechar.

**Decisão — corretor sem e-mail não vira convidado, mas continua na resposta.** `normalizarCorretor` preserva o corretor quando só um dos dois campos veio; `convidados` só recebe e-mail não vazio. O contrato hoje sempre devolve os dois (`AssignedBroker`), mas apagar o responsável da resposta do agente por falta de e-mail seria perder informação que o CRM de fato decidiu.

**Nota de escopo — `agenda_envios` com `meetLink` vazio.** Agora que o evento pode falhar depois do CRM já ter gravado, a linha do lembrete pode nascer sem link (`|| ''` na expressão). O lembrete degradado é reportado ao agente pelo `aviso` e, no envio, pelo `crivo-agente-erros` que já existe. Redesenhar a fila de lembretes para esse caso está fora do `Done when`.

**⚠️ Risco de parâmetro não verificável nesta task — `attendees`.** O nome e o formato do campo de convidados do nó Google Calendar (`additionalFields.attendees`, `string` com `multipleValues: true`, aceitando array de e-mails) foram conferidos contra a fonte oficial do nó (`packages/nodes-base/nodes/Google/Calendar/EventDescription.ts`), não adivinhados. O que **não** dá para provar aqui: `validateWorkflow` do SDK roda sem schema de nó neste ambiente (`getSchemaBaseDirs()` devolve `[]`), então validação de parâmetro contra o schema real é trabalho da T30, via MCP. Mesma observação para `options.response.response.fullResponse/neverError`, conferido contra `HttpRequestV3.node.ts`.

**Nota de localização de teste.** `n8n/workflows/__tests__/` é diretório novo. A Test Coverage Matrix não tem linha para topologia de workflow, e o critério de ordem não é expressável na camada `n8n/src/`; a alternativa era declarar o critério principal da task sem evidência. O teste lê o mesmo `toJSON()` que o inliner leva para `n8n/generated/`, e falha se a ordem antiga voltar.

**Tests**: unit
**Gate**: build

**Commit**: `feat(agente): agenda reuniao com corretor convidado`

---

### T30: Publicar o fluxo na instância ✅

**What**: Publicar os workflows alterados na instância n8n, alinhando antes o modelo declarado na fonte ao que a instância roda.
**Where**: `n8n/generated/`
**Depends on**: T29
**Reuses**: procedimento de publicação e conferência já documentado no `n8n/README.md`
**Requirement**: `ATRIB-02`

**Tools**:
- MCP: n8n (publicação e histórico de versão)
- Skill: NONE

**Done when**:
- [x] **Antes de publicar**: fonte alinhada ao modelo que a instância roda — confirmado ao vivo antes de qualquer publicação: o nó `Gemini Chat Model` de `crivo-agente-principal` (`0B1nqjODu7xuYYKF`) roda `models/gemini-3.5-flash-lite`, enquanto `n8n/workflows/principal.ts:1262` dizia `models/gemini-3.5-flash`. A **fonte foi alinhada à instância**, com comentário explicando por quê. A migração para `gpt-5-nano` **não** foi aplicada: é decisão de produto e ninguém a tomou nesta sessão; a task oferece as duas opções e a que não inventa escopo é alinhar. `crivo-agente-principal` **não foi republicado** (nada além do modelo mudou nele, e o modelo agora já casa) — o alinhamento existe para que a próxima publicação de `principal.ts` não reverta o modelo sem querer
- [x] Publicado e conferido por `get_workflow_history`: a versão `autosaved: false` mais nova é a sua e é igual ao `activeVersionId` — `crivo-tool-agendar-reuniao` (`2qCs6rPzmeOqan65`) tem **2 versões, ambas `autosaved: false`**: a nova `488b60eb-a35c-4457-a4f9-0c06751f4868` ("T29: PATCH no CRM antes do evento, corretor convidado") e a anterior `41112232-...` (T17, lote-7). O `publish_workflow` devolveu `activeVersionId: 488b60eb-...` — **idêntico** à versão nova. Nenhuma versão autosaved entre as duas: a armadilha do lote-7 não se repetiu
- [x] `n8n/generated/` idêntico ao export da instância — conferido campo a campo em `get_workflow_details` depois do update: 14 nós e 10 entradas de conexão iguais às do `toJSON()` do arquivo gerado (topologia, posições, `options.response.response.fullResponse/neverError` no PATCH, `additionalFields.attendees`, `onError` do nó de Calendar, `meetLink ... || ''` na Data Table, e o corpo dos 3 Code nodes com `agendamento.mjs` inlinado). A prova mais forte não é textual e sim comportamental: as duas execuções abaixo rodaram **o código publicado** e devolveram exatamente o que os testes unitários do repositório asseveram
- [x] Id da execução de verificação registrado nas notas — **duas** execuções, ids **1721** e **1722** (ver notas). **Nenhum workflow scratch foi criado**, então não havia nada a arquivar: a lição L-016 (arquivar destrói a execução junto) não chegou a se aplicar, e as duas execuções seguem consultáveis na instância
- [x] Gate de build passa — `npx vitest run` 908 passed / 73 arquivos; `npm run lint` 0 erros (2 warnings pré-existentes); `npx tsc --noEmit` 0; `npm run build` exit 0
- [x] Contagem de testes: 908 (inalterada em relação a T29, como previsto — `Tests: none`)

**Evidência de execução — as duas metades da regra, no fluxo publicado.** `test_workflow` fixa trigger, nós com credencial e HTTP Request; os Code e o If **executam de verdade**. Foi o suficiente para exercitar a decisão nova sem criar evento no Calendar nem tocar no CRM:

| Execução | Cenário | O que provou |
| -------- | ------- | ------------ |
| **1721** | `PATCH` fixado em `409 {code:"sem-corretor-disponivel"}` | `Code: interpretar resposta do CRM` recebeu a saída do PATCH (`source.previousNode` = o nó do PATCH — a ordem invertida, na instância) e devolveu `{crmConfirmou:false, reason:"sem-corretor-disponivel", convidados:[]}`; o If saiu pelo ramo falso (`main[0]` **vazio**, `main[1]` com o item); a recusa devolveu a orientação de oferecer outro horário; `lastNodeExecuted` é o nó de recusa. **`Google Calendar: criar evento (Meet)` e a Data Table não aparecem em `runData`** — só em `pinData`: não executaram. O sentinela `NAO-DEVE-SER-CRIADO` que plantei no pin do evento não aparece em lugar nenhum da saída |
| **1722** | `PATCH` fixado em `200` com `assignedBroker` | `convidados: ["corretora.manha@triangulo.com.br"]` — o e-mail do corretor devolvido pelo CRM vira convidado; o If saiu pelo ramo verdadeiro (`main[1]` vazio); o nó de recusa não executou; a resposta final foi `{ok:true, corretor:{...}, meetLink:"...", crmAtualizado:true, eventoCriado:true, aviso:null}` |

Juntas, as duas cobrem os dois ramos do `CRM confirmou o agendamento?` e provam que o `agendamento.mjs` inlinado **parseia e roda** na instância — o risco real de transcrição ao aplicar 21 operações por MCP.

**⚠️ Aviso de schema aceito de propósito — `attendees`.** O `update_workflow` devolveu `INVALID_PARAMETER: Field "parameters.additionalFields.attendees" has wrong type: expected array, got string`. É estático: o campo é `string` com `multipleValues: true` (guarda um array), e o valor é a expressão de campo inteiro `={{ ... .convidados }}`, que o n8n resolve para o array em runtime. A alternativa que calaria o aviso — array literal com um elemento `join(',')` — **regride o caso defensivo**: com `convidados` vazio o elemento vira `""`, o nó monta `[{email:''}]` e o Google recusa o evento; com a expressão de campo inteiro, vazio resolve para `[]` e o evento é criado sem convidado. Comportamento acima de cosmética de tipo. **O que fica sem prova**: nenhuma das duas execuções resolve esse parâmetro (o nó do Calendar é fixado por `test_workflow`), então a resolução do array só se confirma numa execução real contra o Google Calendar — primeira reunião agendada de verdade depois da T31.

**Nota — `n8n/generated/principal.ts` mudou junto.** Só a linha do modelo (e o comentário). É o mesmo commit porque é a pré-condição de publicação que esta task declara, não um "while I'm here".

**Tests**: none — publicação de artefato já testado na T29; a verificação é execução real registrada
**Gate**: build

**Commit**: `chore(agente): publica fluxo com atribuicao por agenda`

---

### T31: Reseed e limpeza do ambiente de teste ✅ (reseed e bootstrap rodados pelo usuário; conferidos aqui)

**What**: Rodar o reseed, executar o bootstrap de administrador e purgar a memória do agente das chaves de teste.
**Where**: `docs/integration/`
**Depends on**: T30
**Reuses**: `npm run db:seed` e o comando da T8
**Requirement**: `SEED-01`

**Tools**:
- MCP: n8n (acesso ao Postgres da instância para a purga)
- Skill: NONE

**Done when**:
- [x] **Reseed executado; os 3 tenants, usuários, papéis e janelas presentes** — rodado **pelo usuário** (ver nota de divisão de trabalho abaixo) e conferido aqui por consulta read-only ao banco real: os 3 slugs (`crivo-demo`, `triangulo`, `vale-uberaba`); em **cada** imobiliária 1 gestor, 3 corretores e 2 administradores (o do seed mais a conta do usuário); os 3 corretores de cada imobiliária com `work_hours_start` preenchido (SEED-01 AC1/AC2). Leads: **17 sem responsável e 8 com** — exatamente a forma que a AC7 pede (só os que já nascem com reunião têm dono). Antes do reseed eu já havia confirmado que o schema estava em dia (`brokers` inexistente, `leads.assigned_user_id`, as 6 tabelas de autenticação, o índice `leads_assigned_user_id_meeting_at_idx` da T27), então nenhum `drizzle-kit push` foi necessário
- [x] **Bootstrap de administrador executado para a conta do usuário, vinculada às 3 imobiliárias** — rodado **pelo usuário** (o comando recebe a senha como argumento, e definir a senha de acesso dele não é trabalho de agente). Conferido: `tostamatias@gmail.com` aparece com `imobiliarias: 3` e `credenciais: 1` — um usuário só, vinculado às três, com senha gravada. Os 3 administradores do seed seguem com `credenciais: 0`, ou seja, em convite pendente, que é o que a SEED-01 AC3 exige (só o administrador do bootstrap tem senha)
- [x] `n8n_chat_histories` purgada nas chaves de teste (`tenantSlug:waId`) — **já estava vazia**: execução **1724** (`SELECT session_id, count(*) ... GROUP BY session_id`) devolveu **zero linhas**. A purga era um no-op neste ambiente; nada foi apagado porque nada havia. A tabela existe (a consulta teria errado se não existisse)
- [ ] Primeira mensagem seguinte no número de teste abre conversa nova, com lead novo no CRM — **bloqueado pela credencial acima**, e depende de uma mensagem real no WhatsApp, que só uma pessoa manda. Tudo o que estava sob controle daqui está verificado: memória vazia (1724), e a linha de `conversa_estado` da chave de teste (`triangulo` / `553499532444`) com `leadId` **nulo**, `fase: "encerrada"` e `perguntadosJson`/`aberturasJson` vazios (1725) — nenhum ponteiro velho para lead. `lastInboundAt` é 2026-08-22, mais de 12h atrás, então `isSessionExpired` já trata a próxima mensagem como sessão nova. Falta só o header da credencial e a mensagem
- [x] Procedimento registrado em `docs/integration/` — `docs/integration/reset-ambiente.md`, novo: ordem obrigatória dos passos e o porquê dela, pré-requisito de schema com as consultas de conferência, reseed, bootstrap, atualização da credencial do n8n, purga da memória, limpeza de `conversa_estado`, checklist final, e o estado medido hoje
- [x] Gate de build passa — `npx vitest run` 908 passed / 73 arquivos; `npm run lint` 0 erros (2 warnings pré-existentes); `npx tsc --noEmit` 0; `npm run build` exit 0
- [x] Contagem de testes: 908 (inalterada — `Tests: none`)

**⚠️ PENDÊNCIA ABERTA — a credencial de serviço do n8n não autentica.** O reseed rotacionou a chave de serviço, e a credencial `httpHeaderAuth` "Crivo - chave de servico" (`YhGcdfGtdEBBU9YP`) ainda não está válida. Medido, não suposto: execução **1731** (workflow-escrutínio `Manual Trigger → HTTP GET /api/v1/settings` com a credencial e `X-Crivo-Tenant: triangulo`, o mesmo procedimento do `n8n/README.md` §12.2) respondeu **401** com `detail: "Formato do header Authorization inválido. Use 'Bearer <chave>'."`.

O `detail` é específico e aponta o conserto: a recusa é de **formato**, não de chave revogada — o valor gravado na credencial está sem o prefixo `Bearer `. O campo precisa conter `Bearer <chave de serviço>`, com o espaço, não apenas a chave. Enquanto isso não for corrigido, toda chamada do agente ao CRM responde 401 e o `crivo-agente-erros` é quem vai avisar.

(A execução **1730** é a primeira tentativa e não vale como evidência: `create_workflow_from_code` **não liga credencial em nó HTTP Request** — o retorno diz isso explicitamente —, então aquele nó rodou sem credencial nenhuma. A credencial foi ligada por `setNodeCredential` e só então a execução 1731 mediu o que interessa. Os dois ids ficam registrados; o workflow foi arquivado depois, na ordem da L-016.)

**Nota — divisão de trabalho nesta task.** Dois passos ficaram com o usuário e foram rodados por ele: o `npm run db:seed` (apagar-e-recriar num banco que serve o deploy no ar é operação destrutiva remota, que a aprovação do plano não cobre — regra de blast radius do `implement.md` §8; e o comando revoga a chave de serviço na mesma transação em que gera a nova, sem a ordem segura do §12.3) e os três `npm run db:create-admin` (a senha vai como argumento). O que coube aqui: conferir o schema antes, escrever o procedimento, conferir o resultado depois, e medir o estado da credencial.

**Histórico do bloqueio original (mantido para rastreabilidade):**

1. **`npm run db:seed` no banco real.** É apagar-e-recriar toda tabela de domínio num banco que serve um deploy no ar, e a aprovação do plano não é aprovação da operação destrutiva remota (regra de blast radius do `implement.md` §8). O agravante é específico deste comando: o seed **rotaciona a chave de serviço e revoga a antiga na mesma transação**, então não existe a ordem segura do `n8n/README.md` §12.3 ("chave nova → confirma → revoga a velha"). Rodá-lo derruba o agente na hora, e só uma pessoa reergue: a chave nova sai em claro **uma única vez no stdout** e precisa ser colada na credencial `httpHeaderAuth` "Crivo - chave de servico" pela UI do n8n — trabalho humano por AD-014, e sem ferramenta MCP de credencial que permitisse outra coisa. A chave também não pode ser transportada num resumo ou arquivo (regra do próprio `n8n/README.md` §4).
2. **`npm run db:create-admin -- <slug> <email> <senha>`.** Escolher e gravar a senha de acesso do usuário num app publicado não é coisa que eu deva fazer sozinho. Sem esse passo o reseed deixa o CRM logável por ninguém: todos os usuários do seed nascem em convite pendente, sem linha em `accounts` (SEED-01 AC3) — por isso os dois passos andam juntos, nessa ordem, e ficam para o usuário.

`docs/integration/reset-ambiente.md` é o roteiro exato dos dois, com os slugs (`crivo-demo`, `triangulo`, `vale-uberaba`) e a conferência de cada etapa.

**Nota — nenhuma leitura destrutiva foi feita às cegas.** Toda a inspeção rodou por consulta read-only: no CRM, um script `tsx` descartado depois; na instância n8n, um workflow temporário `Manual Trigger → Postgres (executeQuery) → Data Table (get)` (`scratch-t31-inspecionar-memoria`, `CPDO5Qat5pBUh7xQ`). **Os ids 1724 e 1725 foram registrados antes de arquivar** (L-016 — arquivar destrói as execuções junto); o workflow foi arquivado em seguida e nada ficou pendurado na instância.

**Nota — 2 linhas inertes em `conversa_estado`.** `test-tenant-lote6c` e `test-tenant-lote6c-turnlimit`, resíduo de fixture do lote-6c, com slugs que não resolvem em `tenant_config`. É a pendência (2) herdada do lote-7, não uma descoberta nova — deixadas intactas, fora do `Done when` desta task.

**Tests**: none — operação de ambiente; o comportamento do seed é coberto pela T14
**Gate**: build

**SPEC_DEVIATION — mensagem de commit.** A task especifica `chore(ambiente): reseed e purga da memoria de teste`. O commit não contém reseed nenhum, e a purga foi um no-op — o que ele contém é o procedimento escrito. Usar a mensagem planejada gravaria no histórico uma afirmação falsa sobre o que aquele commit fez, que é justamente o que `git log`/`bisect` depois acredita. Mensagem usada: `docs(ambiente): registra procedimento de reset de ambiente`. **Razão**: a regra de descrição do `implement.md` ("Description references what was DONE, not what was planned") vale sobre o texto planejado quando os dois se contradizem. Quando o usuário rodar o reseed, o commit que fechar esta task pode usar a mensagem original.

**Commit**: `docs(ambiente): registra procedimento de reset de ambiente` (planejado: `chore(ambiente): reseed e purga da memoria de teste` — ver desvio acima)

---

### Phase 8: Recuperação de senha e fechamento

### T32: Recuperação de senha ✅

**What**: Implementar o fluxo de redefinição de senha por e-mail.
**Where**: `app/recuperar-senha/page.tsx`
**Depends on**: T31
**Reuses**: adaptador de e-mail da T19 e o fluxo nativo do better-auth
**Requirement**: `AUTH-02`

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] E-mail cadastrado recebe link válido por 1 hora — `src/server/auth/__tests__/reset-password.test.ts:88` `expect(url.pathname).toBe("/recuperar-senha")` (o link vai para a NOSSA tela, não para o callback interno da biblioteca), `:94` `expect(verification!.value).toBe(createdUserIds[0])` (o token do e-mail é o token gravado, para aquele usuário) e `:98-99` a validade medida na linha de `verifications`: `expect(validadeMs).toBeGreaterThan(59 * 60 * 1000)` e `toBeLessThanOrEqual(60 * 60 * 1000 + 30_000)`
- [x] E-mail inexistente vê a **mesma** confirmação do caso de sucesso — `:113` `expect(inexistente).toEqual(cadastrado)`, comparando a resposta inteira dos dois casos. E o silêncio é real, não só igual na aparência: `:117` `expect(enviados).toHaveLength(0)` (nenhum e-mail saiu) e `:127` `expect(orfaos).toHaveLength(0)` (nenhum token foi criado para a conta que não existe)
- [x] Link válido grava a senha nova, se invalida e encerra as demais sessões do usuário — as quatro metades, no mesmo teste: senha nova entra (`:146` `expect(login.user.email).toBe(email)`), senha antiga não entra mais (`:150-152` `rejects.toThrow()`), o link não serve duas vezes (`:156` `expect(reuso.body?.code).toBe("INVALID_TOKEN")`) e as sessões que existiam **antes** da troca sumiram (`:164` `expect(depois.filter((s) => idsAntigos.includes(s.id))).toHaveLength(0)`, com duas sessões abertas de propósito antes, asseveradas em `:137`)
- [x] Link usado ou expirado é recusado, com opção de pedir outro — "usado" está no teste acima; "expirado" tem teste próprio, envelhecendo a linha de `verifications` em vez de esperar 1 hora: `:180` `expect(expirado.body?.code).toBe("INVALID_TOKEN")`, mais `:186` provando que a senha em vigor **não** mudou com a tentativa recusada. A "opção de pedir outro" é a tela: verificada no navegador (abaixo), com o link "Pedir um novo link"
- [x] Self-check Astryx cumprido — grep limpo de `<div>`/`<span>` de layout, `style={{}}`, `.css`, `@apply` e valor cru nos três arquivos novos. Composição só com componentes da lib (`Card`, `Center`, `VStack`, `FormLayout`, `TextInput`, `Button`, `Banner`, `Link`, `Heading`, `Text`); props confirmadas por `npx astryx component Link` antes de usar
- [x] Gate full passa — `npx vitest run` 912 passed / 74 arquivos; e também o de build: `npm run lint` 0 erros (2 warnings pré-existentes), `npx tsc --noEmit` 0, `npm run build` exit 0 (a rota `/recuperar-senha` aparece no manifesto)
- [x] Contagem de testes: 912 (908 + 4)

**✅ VERIFICAÇÃO VISUAL REALIZADA — e desta vez alcançou o dev server local.** Ao contrário das T6/T10 (Batch 1) e da T22 (Batch 3), a extensão Claude in Chrome conseguiu abrir `http://localhost:3000` nesta sessão. Os quatro estados da tela foram vistos renderizados, não deduzidos:

| Estado | URL | O que apareceu |
| ------ | --- | -------------- |
| Pedido | `/recuperar-senha` | "Recuperar senha", campo de e-mail, botão "Enviar link", "Voltar para o login" |
| Confirmação | idem, após enviar `nao-existe-t32@fixture.test` | Banner verde com o texto único da AC2 ("Se este e-mail estiver cadastrado…"), sem qualquer pista de que a conta não existe |
| Redefinição | `/recuperar-senha?token=…` | "Definir senha nova", os dois campos de senha e o aviso de que as outras sessões serão encerradas |
| Link inválido | idem, após enviar com token inexistente | Banner vermelho e os dois caminhos de saída: "Pedir um novo link" e "Voltar para o login" (AC4) |

Também conferi que a tela é **alcançável**: o link "Esqueci minha senha" aparece no card de login.

O e-mail usado na verificação foi um endereço inexistente de propósito: o better-auth retorna cedo para conta desconhecida, então nenhuma mensagem real saiu pelo Resend durante a conferência.

**Nota de execução — digitação sintética não entra em `TextInput` controlado.** O primeiro envio falhou em silêncio: `computer:type` não disparou o `onChange` do componente, e o formulário submeteu vazio. Trocado por `form_input` (escrita no DOM, que o React enxerga). Registrado porque vale para qualquer verificação visual futura de formulário Astryx neste projeto.

**Decisão de escopo — o link no login entrou.** `AUTH-02` não tem AC pedindo o link, mas a user story é o corretor redefinir a senha **sozinho**, e uma tela sem porta de entrada não faz isso. São 4 linhas em `login-form.tsx` (arquivo da T6), o mínimo para o fluxo existir de fato.

**Achado de biblioteca — `forgetPassword` não existe no better-auth 1.7.** O nome do endpoint core é `POST /request-password-reset` (`auth.api.requestPasswordReset`); `forget-password` sobrou apenas como prefixo do plugin `email-otp`, que este produto não usa. Escrito primeiro com o nome antigo e corrigido depois de conferir a rota no pacote instalado — registrado porque o nome antigo é o que aparece em quase toda documentação de terceiros.

**Decisão — `resetPasswordTokenExpiresIn: 3600` declarado, mesmo sendo o default.** A AC1 diz "1 hora". Deixar implícito no default da biblioteca faria uma atualização dela mudar o requisito sem ninguém perceber.

**Tests**: integration
**Gate**: full

**Commit**: `feat(auth): adiciona recuperacao de senha`

---

### T33: Rastreabilidade final ✅

**What**: Fechar a rastreabilidade da spec, subindo os 11 requirement IDs para o estado real e registrando as evidências.
**Where**: `.specs/features/lote-8-usuarios-papeis-atribuicao/spec.md`
**Depends on**: T32
**Reuses**: padrão de fechamento dos lotes 3–7
**Requirement**: todos

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Cada requirement ID mapeado às tasks que o implementaram, com status atualizado — a tabela de `spec.md` ganhou a coluna **Tasks** no lugar de **Phase**: os 11 IDs apontam para as tasks que de fato os implementaram (ex.: `ATRIB-02` → T12, T26, T27, T28, T29, T30; `SEED-01` → T8, T11, T12, T13, T14, T31), e o status subiu de `Pending` para `Implementing`
- [x] Linha de Coverage refletindo o total real — `11 total, 11 mapeadas a tasks (100%)`, com o gate do fechamento junto (912 testes / 74 arquivos, lint 0 erros, build exit 0, `tsc` 0)
- [x] `spec.md` e `tasks.md` adicionados ao repositório com `git add -f` — ver o commit desta task; o resto de `.specs/` continua gitignored
- [x] Gate de build passa
- [x] Contagem de testes: 912 (inalterada em relação a T32 — `Tests: none`)

**Decisão — nenhum ID foi marcado `Verified`.** O ladder de status termina em `Verified`, e é tentador carimbar isso ao fim do último commit. Mas `Verified` é do Verifier, que é um agente independente e ainda não rodou: o valor do carimbo vem justamente de autor ≠ verificador. O estado honesto ao fim da execução é `Implementing` — código escrito, gate verde, evidência por task registrada. Quem rodar o Verifier sobe os 11 de uma vez, ou devolve gaps.

**Decisão — as ressalvas foram para a spec, não só para o `tasks.md`.** Quatro pontos abertos (UI da janela de trabalho na AGENDA-01, o `SPEC_DEVIATION` de rate limit por IP na AUTH-01, o desfecho ponta a ponta da SEED-01 travado pela credencial do n8n, e a resolução de `attendees` na ATRIB-02) ficam listados por ID em **Ressalvas conhecidas**, logo abaixo da tabela. O Verifier lê a spec como fonte de verdade: enterrar essas ressalvas só nas notas das tasks faria ele redescobrir cada uma como se fosse falha nova.

**Tests**: none — documentação
**Gate**: build

**Commit**: `docs(lote-8): fecha rastreabilidade`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8

Phase 1:  T1 → T2 → T3
Phase 2:  T4 → T5 → T6 → T7 → T8 → T9 → T10
Phase 3:  T11 → T12 → T13 → T14
Phase 4:  T15 → T16 → T17 → T18
Phase 5:  T19 → T20 → T21 → T22 → T23
Phase 6:  T24 → T25 → T26 → T27 → T28
Phase 7:  T29 → T30 → T31
Phase 8:  T32 → T33
```

A execução é estritamente sequencial — não há paralelismo dentro de uma fase.

**Empacotamento previsto (~7 tasks por worker, fases inteiras, corte só em fronteira de fase):**

| Batch | Fases | Tasks |
| ----- | ----- | ----- |
| 1 | Phase 1 + Phase 2 | T1–T10 (10) |
| 2 | Phase 3 + Phase 4 | T11–T18 (8) |
| 3 | Phase 5 | T19–T23 (5) |
| 4 | Phase 6 | T24–T28 (5) |
| 5 | Phase 7 + Phase 8 | T29–T33 (5) |

33 tasks → 5 workers sequenciais. Batch 1 fica em 10 porque a Phase 2 é uma cadeia única de dependência (o plugin precede o proxy, que precede o login, que precede a guarda) e o corte só pode cair em fronteira de fase.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 arquivo de teste | ✅ Granular |
| T2 | 1 módulo de config | ✅ Granular |
| T3 | 1 coluna | ✅ Granular |
| T4 | 1 arquivo de schema (3 modelos coesos do mesmo plugin) | ⚠️ OK — coeso |
| T5 | 1 arquivo | ✅ Granular |
| T6 | 1 tela | ✅ Granular |
| T7 | 1 módulo | ✅ Granular |
| T8 | 1 script | ✅ Granular |
| T9 | 1 componente | ✅ Granular |
| T10 | 1 tela | ✅ Granular |
| T11 | 1 arquivo de schema | ✅ Granular |
| T12 | 1 módulo de DAL | ✅ Granular |
| T13 | componentes de exibição de corretor | ⚠️ OK — coeso |
| T14 | 1 arquivo de seed | ✅ Granular |
| T15 | 1 função pura | ✅ Granular |
| T16 | 1 função na guarda | ✅ Granular |
| T17 | 1 módulo de DAL | ✅ Granular |
| T18 | navegação + fiação das páginas | ⚠️ OK — coeso |
| T19 | 1 adaptador | ✅ Granular |
| T20 | 1 módulo de actions | ✅ Granular |
| T21 | 1 action | ✅ Granular |
| T22 | 1 tela | ✅ Granular |
| T23 | 1 tela | ✅ Granular |
| T24 | 1 função pura | ✅ Granular |
| T25 | 1 action | ✅ Granular |
| T26 | 2 funções no mesmo arquivo | ✅ Granular |
| T27 | 1 módulo de DAL + 1 índice | ⚠️ OK — coeso |
| T28 | 1 módulo de contrato | ✅ Granular |
| T29 | 1 sub-workflow | ✅ Granular |
| T30 | publicação | ✅ Granular |
| T31 | operação de ambiente | ✅ Granular |
| T32 | 1 fluxo | ✅ Granular |
| T33 | documentação | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (corpo) | Diagrama mostra | Status |
| ---- | ------------------ | --------------- | ------ |
| T1 | None | — | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 (fase anterior) | fronteira de fase | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 (fase anterior) | fronteira de fase | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 (fase anterior) | fronteira de fase | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 (fase anterior) | fronteira de fase | ✅ Match |
| T20 | T19 | T19 → T20 | ✅ Match |
| T21 | T20 | T20 → T21 | ✅ Match |
| T22 | T21 | T21 → T22 | ✅ Match |
| T23 | T22 | T22 → T23 | ✅ Match |
| T24 | T23 (fase anterior) | fronteira de fase | ✅ Match |
| T25 | T24 | T24 → T25 | ✅ Match |
| T26 | T25 | T25 → T26 | ✅ Match |
| T27 | T26 | T26 → T27 | ✅ Match |
| T28 | T27 | T27 → T28 | ✅ Match |
| T29 | T28 (fase anterior) | fronteira de fase | ✅ Match |
| T30 | T29 | T29 → T30 | ✅ Match |
| T31 | T30 | T30 → T31 | ✅ Match |
| T32 | T31 (fase anterior) | fronteira de fase | ✅ Match |
| T33 | T32 | T32 → T33 | ✅ Match |

Nenhuma dependência aponta para fase posterior.

---

## Test Co-location Validation

| Task | Camada criada/modificada | Matriz exige | Task diz | Status |
| ---- | ------------------------ | ------------ | -------- | ------ |
| T1 | função pura (`src/lib`) | unit | unit | ✅ OK |
| T2 | config de auth + schema | integration | integration | ✅ OK |
| T3 | schema + seed | integration | integration | ✅ OK |
| T4 | schema + plugin | integration | integration | ✅ OK |
| T5 | `proxy.ts` | none | none | ✅ OK |
| T6 | tela + rota de auth | integration | integration | ✅ OK |
| T7 | guarda de sessão | integration | integration | ✅ OK |
| T8 | script de bootstrap | integration | integration | ✅ OK |
| T9 | componente + resolução de tenant | integration | integration | ✅ OK |
| T10 | componente React | none | none | ✅ OK |
| T11 | schema | none | none | ✅ OK |
| T12 | DAL | integration | integration | ✅ OK |
| T13 | componentes React | none | none | ✅ OK |
| T14 | seed | integration | integration | ✅ OK |
| T15 | função pura | unit | unit | ✅ OK |
| T16 | guarda de permissão | integration | integration | ✅ OK |
| T17 | DAL | integration | integration | ✅ OK |
| T18 | componentes e páginas | none | none | ✅ OK |
| T19 | adaptador de e-mail | integration | integration | ✅ OK |
| T20 | server actions | integration | integration | ✅ OK |
| T21 | server action | integration | integration | ✅ OK |
| T22 | página React | none | none | ✅ OK |
| T23 | tela + fluxo de ativação | integration | integration | ✅ OK |
| T24 | função pura | unit | unit | ✅ OK |
| T25 | server action | integration | integration | ✅ OK |
| T26 | função pura | unit | unit | ✅ OK |
| T27 | DAL + índice | integration | integration | ✅ OK |
| T28 | contrato e rotas | integration | integration | ✅ OK |
| T29 | camada de decisão do agente | unit | unit | ✅ OK |
| T30 | publicação de artefato | none | none | ✅ OK |
| T31 | operação de ambiente | none | none | ✅ OK |
| T32 | tela + fluxo de auth | integration | integration | ✅ OK |
| T33 | documentação | none | none | ✅ OK |

Nenhum `Tests: none` é adiamento de teste: em todos os casos a matriz classifica a camada como "none" (schema, componente React, `proxy.ts`, operação, documentação), e o comportamento correspondente é coberto por uma task da mesma fase ou anterior — nunca posterior.
