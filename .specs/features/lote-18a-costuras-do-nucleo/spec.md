# Lote 18a — Costuras do núcleo — Specification

**Context**: `.specs/features/lote-18a-costuras-do-nucleo/context.md`
**Decisão de arquitetura**: AD-052 (`.specs/STATE.md`)
**Commit de base**: `bf5e646`

## Problem Statement

O app de lojas de materiais (L19) precisa dos mesmos recursos do Krivo em outro mercado. Hoje o código
mistura os dois assuntos: `src/server/data/index.ts` conhece o papel `corretor`, `leads` carrega campos
de financiamento, o agente fala de imóveis e os símbolos estão em português. Copiar o repositório
duplicaria toda correção futura. Este lote separa o núcleo do vertical da imobiliária dentro do pacote
único, sem mudar o que o Krivo faz, para que o L18b só precise mover pastas.

## Goals

- [ ] Um teste falha quando código do núcleo importa o vertical ou usa um termo de imobiliária fora da
      lista de transição.
- [ ] Um vertical de teste, sem catálogo, sem agendamento e sem segmentos, passa pelas peças do núcleo.
- [ ] O Krivo continua igual: `openapi.yaml` sem diferença, JSON dos 9 workflows idêntico ao da base,
      DDL sem mudança e suíte completa verde.
- [ ] Nenhum identificador de código está em português, fora de `n8n/` e da lista de transição, e os valores gravados continuam os mesmos.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Workspaces, `packages/*` e `apps/*` | L18b |
| Mudar valor gravado, coluna, enum ou tabela no banco | L18c, com autorização |
| Mudar o `/api/v1` ou republicar workflow | L18c, com autorização |
| Renomear vocabulário em `n8n/src/*.mjs` e `n8n/workflows/*.ts` | Muda o JSON publicado; L18c |
| Renomear pastas de rota, URLs e parâmetros de query | Muda o que o navegador vê; L18c |
| Mover a qualificação para tabela 1:1 | L18c; aqui só a costura de acesso |
| App de materiais e catálogo de produtos | L19 |
| Mudar texto, layout ou URL de tela | O Krivo não muda neste lote |
| Mudar o projeto `vitrine/` | Projeto próprio (AD-041); os identificadores dele entram no L18c |
| Corrigir as dívidas registradas do L17 | Sem relação com a costura |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Quando o inglês entra | Símbolos no L18a; valores gravados e do fio no L18c | Separa renomeação de mudança de dado e mantém os testes de valor como prova | y |
| Forma da troca de valor | Constante nomeada por valor gravado, em módulo único, sem camada de tradução em tempo de execução | Sem código novo no caminho de dados, e a troca do L18c fica numa edição só | y |
| Valores de domínio do vertical (`modality`, `property_type`, `property_kind`, `property_status`, `motivation`, `credit_status`, `storefront_layout`) | Em inglês: constante nomeada no L18a e valor trocado no L18c | Decisão do usuário: "Em código: sempre em inglês" | y |
| Vocabulário de `context.md` | Como está lá | O usuário liberou o Design sem objeção à lista | y |
| Símbolos internos em português (`normalizarBaseDaVitrine`, `interpretarPatchAgendamento`) | Todos em inglês, fora de `n8n/` | Decisão do usuário: "Em código: sempre em inglês" | y |
| Comentários na checagem de termos | Fora da checagem; comentário que cita símbolo renomeado é corrigido (L-063) | Comentário em português é regra do `CLAUDE.md`, que a decisão do inglês não emendou | y |
| Pastas de rota, URLs e parâmetros de query (`/imoveis`, `?pasta=`) | Em inglês no L18c, com redirecionamento permanente das URLs antigas | São código e o navegador os mostra fora do layout; o redirecionamento preserva links salvos | y |
| Texto do prompt do agente | Continua em português, no vertical | Produz as mensagens que o cliente lê, e foi calibrado nesse idioma | y |
| Limite da checagem de identificadores | Lista de palavras em português, sobre identificadores, sem detectar idioma | Detector de idioma daria falso positivo; a lista cresce quando o Verifier achar um caso | y |
| Igualdade do agente | `n8n/generated/` sem diferença de texto em relação à base | As marcações novas somem na geração, e o texto idêntico implica o JSON idêntico | y |
| Escopo do L18a em produção | O merge publica na Vercel sem mudança de comportamento; banco e n8n ficam intocados | Decisão do usuário: alterar produção só no L18c | y |
| Specs do L18b e do L18c | Escritos depois do fechamento do lote anterior | Dependem do que este lote revelar | y |
| Local do vertical durante o L18a | `src/verticals/imobiliaria/` e `n8n/verticals/imobiliaria/`; o núcleo fica onde está | Move só o necessário, e o L18b move o resto usando o mapa de fronteira | y |

**Open questions:** none - tudo resolvido ou registrado acima.

---

## User Stories

### P1: Fronteira verificável ⭐ MVP

**User Story**: Como desenvolvedor, quero que a separação entre núcleo, vertical e app seja checada por
máquina, para que ela não se degrade sem ninguém perceber.

**Why P1**: Sem essa checagem, o L18b moveria pastas sem garantia de que o núcleo está limpo.

**Acceptance Criteria**:

**BOUND-01 — Mapa de fronteira**

1. The system SHALL manter um arquivo versionado único que classifica cada arquivo de `src/`, `app/`, `n8n/`, `scripts/`, `workflows/` e `proxy.ts` como `core`, `vertical` ou `app`, fora arquivos de teste, que seguem o arquivo testado.
2. The system SHALL registrar no mapa o pacote de destino de cada arquivo `core`, entre `@core/db`, `@core/server`, `@core/agent`, `@core/client` e `@core/vertical-kit`.
3. IF um arquivo desses caminhos não estiver classificado THEN the system SHALL falhar o teste de fronteira citando o caminho do arquivo.
4. IF o mapa citar um arquivo que não existe THEN the system SHALL falhar o teste de fronteira citando o caminho.

**BOUND-02 — Direção dos imports**

1. IF um arquivo `core` importar um arquivo `vertical` ou `app` THEN the system SHALL falhar o ESLint com erro em `no-restricted-imports`.
2. IF um arquivo `core` importar um arquivo `vertical` ou `app` THEN the system SHALL falhar o teste de fronteira citando os dois caminhos.
3. IF um arquivo `vertical` importar um arquivo `app` THEN the system SHALL falhar o teste de fronteira citando os dois caminhos.
4. IF um arquivo `core` de `@core/client` importar `server-only` ou um arquivo de `@core/server` THEN the system SHALL falhar o teste de fronteira.

**BOUND-03 — Termos de mercado**

1. IF código ou texto literal de um arquivo `core` contiver `imovel`, `imóve`, `imobili`, `corretor`, `broker`, `property`, `reuni`, `meeting`, `creci`, `storefront`, `vitrine`, `financiamento`, `krivo`, em qualquer caixa, fora da lista de transição THEN the system SHALL falhar o teste de fronteira citando arquivo e linha.
2. The system SHALL ignorar comentários nessa checagem.
3. WHEN um comentário citar um símbolo renomeado neste lote THEN the system SHALL trazer o nome novo nesse comentário, conferido por `git grep` do nome antigo.

**BOUND-04 — Lista de transição**

1. The system SHALL manter as exceções da BOUND-03 em um arquivo único, em que cada entrada traz arquivo, termo, motivo e o lote que a remove.
2. The system SHALL restringir essa lista a colunas e valores gravados, campos do `/api/v1` e módulos de `n8n/` que dependem do L18c.
3. IF uma entrada da lista não corresponder a nenhuma ocorrência no arquivo citado THEN the system SHALL falhar o teste de fronteira.

**Independent Test**: Acrescentar a um arquivo `core` um import de `src/verticals/imobiliaria/` e, em outra rodada, a palavra `corretor` num literal: as duas rodadas falham citando o arquivo.

---

### P1: Comportamento preservado ⭐ MVP

**User Story**: Como dono do produto, quero publicar este lote sem que ninguém perceba, para refatorar sem
risco para o que já funciona.

**Why P1**: É a condição do usuário para o lote poder ir ao `main`, já que um merge publica na Vercel.

**Acceptance Criteria**:

**KEEP-01 — Contrato de integração**

1. The system SHALL manter `docs/integration/openapi.yaml` sem diferença em relação a `bf5e646`.
2. The system SHALL responder no `/api/v1` com os mesmos nomes de campo e os mesmos valores de `bf5e646`, provado pelos testes de rota existentes com as asserções de valor inalteradas.
3. The system SHALL aceitar no `/api/v1` os mesmos corpos que aceitava em `bf5e646`, com os mesmos códigos de problema.

**KEEP-02 — Agente**

1. WHEN `node scripts/n8n-inline.mjs` rodar para o vertical da imobiliária THEN the system SHALL produzir os 9 arquivos de `n8n/generated/` sem diferença de texto em relação a `bf5e646`.
2. IF um arquivo gerado diferir da referência THEN the system SHALL falhar o teste citando o nome do arquivo e a primeira linha diferente.
3. The system SHALL guardar a lista de hashes de referência de `n8n/generated/` sem alteração depois do commit que a cria, provado por `git log` desse caminho.

**KEEP-03 — Banco**

1. The system SHALL derivar do schema o mesmo conjunto de tabelas, colunas, tipos, índices, checks e enums de `bf5e646`, provado pela comparação com uma foto normalizada do schema de `bf5e646`.
2. The system SHALL rodar `npm run db:push:test` sobre o banco de teste sem nenhuma mudança pendente.
3. The system SHALL manter as views e os papéis que o projeto `vitrine/` lê sem diferença.

**KEEP-04 — Testes e qualidade**

1. The system SHALL terminar com `npm test` sem falha, com pelo menos os 250 arquivos e 4041 testes de `bf5e646`.
2. WHEN um teste existente for alterado neste lote THEN the system SHALL restringir a alteração a nome de símbolo, caminho de import ou entrega do vertical, sem mudar valor esperado.
3. The system SHALL manter inalterado todo valor literal gravado ou do fio afirmado pelos testes existentes.
4. The system SHALL terminar com `npx tsc --noEmit` sem aumentar a contagem de erros de `bf5e646`.
5. The system SHALL terminar com ESLint em 0 erros e no máximo os 9 avisos de linha de base.
6. The system SHALL concluir `next build` contra o banco de teste sem erro.

**KEEP-05 — Telas**

1. The system SHALL mostrar em Dashboard, Pipeline, Chats, Documentos, Imóveis, Configurações, Usuários e Login o mesmo conteúdo de `bf5e646`, provado por captura de tela real de cada página na base e no fim do lote, usando `npm run dev:test`.
2. The system SHALL manter as mesmas URLs de tela.
3. The system SHALL manter para cada papel os mesmos itens de menu de `bf5e646`.

**KEEP-06 — Produção intocada**

1. The system SHALL executar este lote sem comando contra o banco de produção, sem publicar workflow no n8n e sem alterar variável ou projeto na Vercel.

**Independent Test**: Rodar `git diff bf5e646 -- docs/integration/openapi.yaml n8n/generated/`, a comparação do schema e `npm test`: nenhuma diferença e nenhuma falha.

---

### P1: Vocabulário em inglês ⭐ MVP

**User Story**: Como desenvolvedor do app de materiais, quero o núcleo em termos genéricos e em inglês, para
não ter de ler `corretor` para atribuir um pedido a um vendedor.

**Why P1**: É regra do usuário para todos os recursos, e o L18c depende dela.

**Acceptance Criteria**:

**VOCAB-01 — Módulo de vocabulário**

1. The system SHALL expor em um módulo do núcleo uma constante nomeada em inglês para cada valor gravado ou do fio de status de lead, papel, fase do agente, `sender`, `status_actor`, saúde da integração, `document_status`, `human_send_state` e código de problema, com as chaves de `context.md`.
2. The system SHALL expor em um módulo do vertical da imobiliária as constantes de `modality`, `property_type`, `property_kind`, `property_status`, `motivation`, `credit_status` e `storefront_layout`.
3. The system SHALL dar a cada constante o valor gravado hoje, por exemplo `ROLE.attendant` igual a `"corretor"`.
4. IF um arquivo `core`, `vertical` ou `app` fora de `n8n/` usar um desses valores em português como literal fora dos módulos de vocabulário e do texto de tela THEN the system SHALL falhar o teste de fronteira citando arquivo e linha.
5. The system SHALL derivar dos valores dos módulos os tipos `LeadStatus`, `Role` e `AgentPhase`, de modo que um `Record` tipado por eles quebre a compilação quando faltar um valor (L-029).
6. The system SHALL expressar por constante os predicados SQL que hoje têm papel literal, como `HAS_BROKER_ROLE` e `HAS_ADMIN_ROLE`, com o mesmo SQL gerado.

**VOCAB-02 — Símbolos do agendamento e da atribuição**

1. The system SHALL renomear as propriedades de `meetingAt`, `meetingAttended`, `meetingDays`, `meetingHoursStart` e `meetingHoursEnd` no schema e nos tipos do núcleo para os nomes de `context.md`, mantendo os nomes de coluna atuais.
2. The system SHALL renomear os módulos e as funções `broker-*` e `selectForMeeting` do núcleo para termos de `assignee` e `appointment`.
3. The system SHALL traduzir `appointmentAt` para `meetingAt` na borda do `/api/v1`, em leitura e em escrita.

**VOCAB-03 — Permissões**

1. The system SHALL usar as ações `read` e `write` e os recursos `dashboard`, `pipeline`, `chats`, `documents`, `settings` e `users` na matriz do núcleo.
2. The system SHALL conceder a cada papel exatamente as permissões de `bf5e646`, provado por teste que percorre a matriz antiga e a nova célula por célula.

**ENG-01 — Identificadores em inglês**

1. IF um identificador de arquivo não teste de `src/`, `app/`, `scripts/` ou `workflows/` contiver palavra da lista de termos em português THEN the system SHALL falhar o teste de fronteira citando arquivo, linha e identificador.
2. The system SHALL ignorar nessa checagem comentários, texto JSX e texto literal.
3. The system SHALL renomear para inglês os arquivos e as pastas de código em português fora de `app/`, como `src/components/usuarios/`.
4. The system SHALL manter fora dessa checagem somente o que a lista de transição citar: pastas de rota, nomes de campo do fio e `n8n/`.

**Independent Test**: Trocar `ROLE.attendant` para outro valor em uma cópia local e ver falhar só os testes que afirmam o valor gravado, sem nenhum erro de compilação no núcleo.

---

### P1: Contrato do vertical ⭐ MVP

**User Story**: Como desenvolvedor do app de materiais, quero um contrato tipado do que um vertical precisa
informar, para saber o que preencher sem ler o núcleo inteiro.

**Why P1**: É a costura central: sem ele, o núcleo continua dependendo da imobiliária.

**Acceptance Criteria**:

**VERT-01 — `defineVertical`**

1. The system SHALL expor `defineVertical` em `@core/vertical-kit`, com os campos `id`, `brand`, `resources`, `appointments`, `qualification` e `documentSegments`, e manter as peças do agente em manifesto separado, fora do bundle do navegador.
2. The system SHALL manter `@core/vertical-kit` sem import de outro arquivo de `core`, `vertical` ou `app`, salvo o módulo de vocabulário.
3. IF `defineVertical` receber `id` vazio ou um recurso com o mesmo nome de um recurso do núcleo THEN the system SHALL lançar erro na carga, nomeando o campo.
4. IF um recurso do vertical não declarar permissões para os três papéis THEN the system SHALL falhar a compilação.
5. The system SHALL exigir que o núcleo receba o vertical por parâmetro ou por fábrica chamada pelo app, nunca por import.

**VERT-02 — Vertical da imobiliária**

1. The system SHALL definir o vertical do Krivo em `src/verticals/imobiliaria/` com `id` igual a `"imobiliaria"`, `appointments` ligado, o recurso `catalog` e os segmentos `novo`, `usado` e `ambos`.
2. The system SHALL levar para esse vertical a marca que hoje está fixa no núcleo (`Krivo`, `urn:krivo:problem:`, `X-Krivo-Tenant`), mantendo os valores atuais.
3. The system SHALL fazer o app do Krivo passar esse vertical a toda peça do núcleo que o exige.

**VERT-03 — Vertical de teste**

1. The system SHALL manter nos testes um vertical sem catálogo, sem agendamento e sem segmentos, com marca diferente de `Krivo`.
2. WHEN esse vertical passar pelas peças de lead, conversa, mensagem, documento, permissão e LGPD THEN the system SHALL concluir cada operação sobre o banco de teste, sem erro e sem referência a catálogo, agendamento ou segmento.
3. WHEN uma resposta de problema for gerada com esse vertical THEN the system SHALL usar a marca dele no campo `type`.

**Independent Test**: Rodar só os testes do vertical de teste contra o banco de teste, com todos os arquivos `vertical` da imobiliária fora do grafo de imports do teste.

---

### P1: Permissões compostas ⭐ MVP

**User Story**: Como desenvolvedor de um vertical, quero acrescentar um recurso próprio à matriz, para não
editar o núcleo quando meu app tiver uma tela a mais.

**Why P1**: `imoveis` está hoje na matriz do núcleo.

**Acceptance Criteria**:

**ACCESS-01 — Matriz por composição**

1. The system SHALL expor uma fábrica que compõe a matriz do núcleo com os recursos do vertical e devolve `can(roles, resource, action)`.
2. The system SHALL retirar `imoveis` da matriz do núcleo e declarar `catalog` no vertical da imobiliária, com as mesmas permissões de `imoveis`.
3. IF `can` receber um recurso que nem o núcleo nem o vertical declaram THEN the system SHALL recusar a permissão.
4. WHEN o vertical de teste compuser a matriz THEN the system SHALL não conceder `catalog` a nenhum papel.

**Independent Test**: Chamar a fábrica com os dois verticais e comparar a matriz resultante com a de `bf5e646`.

---

### P1: Qualificação atrás de costura ⭐ MVP

**User Story**: Como desenvolvedor de um vertical, quero definir os campos que meu agente coleta, para o lead
de uma loja não carregar `creditStatus`.

**Why P1**: É o maior conhecimento de mercado dentro do núcleo.

**Acceptance Criteria**:

**QUAL-01 — Acesso pelo vertical**

1. The system SHALL definir no vertical da imobiliária o parser, a serialização e a leitura e escrita de `modality`, `region`, `budgetCents`, `propertyType`, `purchaseHorizon`, `motivation`, `creditStatus` e `chainedOperation`.
2. The system SHALL fazer as peças de lead do núcleo tratar esses campos como um objeto opaco fornecido pelo vertical.
3. The system SHALL manter as colunas em `leads` neste lote, listadas na lista de transição com remoção no L18c.
4. WHEN o `POST /leads` ou o `PATCH /leads/{id}` receber um desses campos THEN the system SHALL gravá-lo e validá-lo como em `bf5e646`.

**QUAL-02 — Consumidores**

1. The system SHALL obter do vertical os campos de qualificação usados por `src/server/reengagement/context.ts` e `src/server/data/index.ts`.
2. WHERE o vertical não define qualificação the system SHALL ler e gravar leads sem esses campos, e o `PATCH` com um deles SHALL responder o mesmo problema de campo inválido que `parseLeadPatch` devolve hoje.

**Independent Test**: Criar e atualizar um lead pelo vertical de teste sem qualificação, e verificar pelos testes atuais de `/api/v1/leads` que a imobiliária responde igual a `bf5e646`.

---

### P1: Agendamento opcional ⭐ MVP

**User Story**: Como desenvolvedor de um vertical, quero ligar ou desligar o agendamento, para usar visita
técnica ou retirada, ou nenhum dos dois.

**Why P1**: Decisão do usuário: fica no núcleo, opcional e com termos genéricos.

**Acceptance Criteria**:

**APPT-01 — Chave do agendamento**

1. WHERE `appointments` está ligado the system SHALL manter marcação, conflito de agenda, lembrete, comparecimento e seleção de responsável como em `bf5e646`.
2. WHERE `appointments` está desligado the system SHALL recusar no `PATCH /leads/{id}` o campo de horário, com o mesmo problema de campo inválido que `parseLeadPatch` devolve hoje.
3. WHERE `appointments` está desligado the system SHALL permitir que o status do lead vá de `engaged` para `goal_reached` sem horário marcado.
4. WHERE `appointments` está desligado the system SHALL devolver lista vazia nas consultas de agendamentos pendentes e nas métricas de comparecimento.
5. The system SHALL definir o texto que nomeia o agendamento fora do núcleo; o núcleo devolve códigos, e o app os traduz.

**Independent Test**: Rodar os testes de lead e de agenda com os dois verticais.

---

### P1: Catálogo e vitrine no vertical ⭐ MVP

**User Story**: Como desenvolvedor do app de materiais, quero que imóveis fiquem fora do núcleo, para construir
produtos sem herdar `property_kind`.

**Why P1**: O catálogo é o recurso mais específico do mercado.

**Acceptance Criteria**:

**CAT-01 — Catálogo**

1. The system SHALL classificar como `vertical` o schema de `properties`, os módulos `src/server/actions/properties.ts`, `src/server/integration/properties.ts` e `src/server/integration/property-filters.ts`, a rota `app/api/v1/properties` e o benchmark que depende deles.
2. The system SHALL exportar do núcleo o schema das tabelas `core` e do vertical o schema de `properties` e `tenant_storefronts`, compostos em um único schema para o Drizzle, sem mudar o DDL.

**CAT-02 — Vitrine**

1. The system SHALL classificar como `vertical` o código de vitrine de `src/lib/storefront*.ts`, `src/server/storefront/`, `src/server/data/storefront.ts` e `src/server/actions/storefront.ts`.
2. The system SHALL manter o comportamento da AD-050: card "Em breve" e `saveStorefrontAction` como estão.

**Independent Test**: Rodar os testes de imóveis, vitrine e isolamento da vitrine depois da mudança, com as asserções de valor inalteradas.

---

### P1: Agente genérico ⭐ MVP

**User Story**: Como desenvolvedor do app de materiais, quero gerar os workflows informando persona, tools e
fases, para não copiar as 2.253 linhas de `principal.ts`.

**Why P1**: O agente é o produto; sem isso, o L19 copia o workflow.

**Acceptance Criteria**:

**AGENT-01 — Gerador por parâmetro**

1. The system SHALL gerar os workflows a partir de fontes genéricas e dos blocos e módulos do manifesto do agente do vertical.
2. The system SHALL levar para `n8n/verticals/imobiliaria/` o `system-message.mjs`, o `phase.mjs`, o `reengagement-prompt.mjs`, as definições de tool com texto de mercado e o corpus de benchmark, sem mudar o texto gerado.
3. WHERE `appointments` está desligado the system SHALL gerar os workflows sem a tool de agendamento e sem o ramo de lembrete do `scheduler`.
4. WHEN os workflows forem gerados para o vertical de teste THEN the system SHALL produzir um JSON em que nenhum nó cite `imóve`, `imobili`, `corretor` ou `buscar_imoveis`.

**AGENT-02 — Inline**

1. The system SHALL fazer `node scripts/n8n-inline.mjs` resolver marcadores `__INLINE(<arquivo>)__` nas pastas genérica e do vertical, e aceitar `--vertical <id>` e `--out <pasta>`, com a imobiliária e `n8n/generated/` como padrão.
2. IF o mesmo nome de arquivo existir nas duas pastas THEN the system SHALL falhar a geração, citando o nome.
3. The system SHALL manter a geração determinística: duas execuções sobre a mesma árvore produzem bytes idênticos, como cobre `scripts/__tests__/n8n-inline.test.ts`.

**Independent Test**: Gerar os workflows com os dois verticais; os da imobiliária ficam sem diferença, e os do vertical de teste não têm tool de agendamento nem termo de imobiliária.

---

### P2: Segmentos de documento

**User Story**: Como desenvolvedor de um vertical, quero segmentar documentos só se fizer sentido para o meu
mercado, porque uma loja não tem `novo` e `usado`.

**Why P2**: `documents.modality` é obrigatório hoje, mas o L19 pode começar com um único valor padrão.

**Acceptance Criteria**:

**SEG-01 — `segment` definido pelo vertical**

1. The system SHALL usar o símbolo `segment` nas peças de documento do núcleo, com a coluna `modality` mantida.
2. The system SHALL filtrar o contexto de documentos do agente pelos segmentos do vertical, com o mesmo resultado de `bf5e646` para a imobiliária.
3. WHERE o vertical não define segmentos the system SHALL listar e entregar ao agente todos os documentos do tenant.

**Independent Test**: Rodar os testes de contexto de documentos com os dois verticais.

---

## Edge Cases

- IF um arquivo novo entrar em um caminho classificado sem classificação THEN the system SHALL falhar o teste de fronteira.
- IF um arquivo for renomeado junto com mudança de conteúdo THEN the system SHALL separar as duas coisas em commits diferentes, para preservar o histórico.
- WHEN `core.autocrlf` estiver ligado no Windows THEN the system SHALL produzir o mesmo JSON de referência, com a normalização que `scripts/n8n-inline.mjs` já faz.
- IF um script de `scripts/` ou de `src/db/` usar um símbolo renomeado THEN the system SHALL atualizá-lo no mesmo commit, mesmo fora do `tsc` padrão.
- IF `n8n/generated/` mudar THEN the system SHALL não publicar nada: a regra do `CLAUDE.md` contra publicar os gerados da `main` continua valendo.
- IF a suíte de outra sessão estiver rodando THEN the system SHALL não iniciar outra sobre o mesmo banco de teste (L-033).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| BOUND-01 | P1: Fronteira verificável | Execute | Implementing |
| BOUND-02 | P1: Fronteira verificável | Execute | Implementing |
| BOUND-03 | P1: Fronteira verificável | Execute | Implementing |
| BOUND-04 | P1: Fronteira verificável | Execute | Implementing |
| KEEP-01 | P1: Comportamento preservado | Tasks | In Tasks |
| KEEP-02 | P1: Comportamento preservado | Execute | Implementing |
| KEEP-03 | P1: Comportamento preservado | Execute | Implementing |
| KEEP-04 | P1: Comportamento preservado | Tasks | In Tasks |
| KEEP-05 | P1: Comportamento preservado | Tasks | In Tasks |
| KEEP-06 | P1: Comportamento preservado | Tasks | In Tasks |
| VOCAB-01 | P1: Vocabulário em inglês | Execute | Implementing |
| VOCAB-02 | P1: Vocabulário em inglês | Tasks | In Tasks |
| VOCAB-03 | P1: Vocabulário em inglês | Tasks | In Tasks |
| ENG-01 | P1: Vocabulário em inglês | Tasks | In Tasks |
| VERT-01 | P1: Contrato do vertical | Tasks | In Tasks |
| VERT-02 | P1: Contrato do vertical | Tasks | In Tasks |
| VERT-03 | P1: Contrato do vertical | Tasks | In Tasks |
| ACCESS-01 | P1: Permissões compostas | Tasks | In Tasks |
| QUAL-01 | P1: Qualificação atrás de costura | Tasks | In Tasks |
| QUAL-02 | P1: Qualificação atrás de costura | Tasks | In Tasks |
| APPT-01 | P1: Agendamento opcional | Tasks | In Tasks |
| CAT-01 | P1: Catálogo e vitrine no vertical | Tasks | In Tasks |
| CAT-02 | P1: Catálogo e vitrine no vertical | Tasks | In Tasks |
| AGENT-01 | P1: Agente genérico | Tasks | In Tasks |
| AGENT-02 | P1: Agente genérico | Tasks | In Tasks |
| SEG-01 | P2: Segmentos de documento | Tasks | In Tasks |

**Coverage:** 26 total, 26 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] O teste de fronteira e o ESLint passam, e a lista de transição só traz itens do L18c.
- [ ] O vertical de teste passa pelas peças de lead, conversa, mensagem, documento, permissão e LGPD no banco de teste.
- [ ] `openapi.yaml` sem diferença, `n8n/generated/` sem diferença e DDL igual ao de `bf5e646`.
- [ ] `npm test` sem falha, com pelo menos 4041 testes, e nenhuma asserção de valor gravado ou do fio alterada.
- [ ] Capturas de tela na base e no fim do lote mostram as 8 páginas iguais.
- [ ] Verifier independente com veredito PASS.
