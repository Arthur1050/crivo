# Lote 7 — Dado real ponta a ponta (Fase 9) Specification

## Problem Statement

O CRM foi construído inteiro sobre dado mockado (AD-004) e o agente conversacional já fala com leads reais pelo WhatsApp (lotes 6/6b/6c), mas as duas metades nunca operaram juntas: os 50 leads de seed dividem Kanban, Chats e Dashboard com os poucos leads reais, e três campos que o dashboard do piloto precisa (`first_response_at`, `broker_id`, `meeting_attended`) **só são escritos pelo seed** — nenhum lead vindo do contrato os recebe. Na prática, o KPI-carro-chefe do PRD ("tempo médio de primeira resposta") e a taxa de comparecimento ficariam permanentemente vazios no piloto real, e todo lead escalado chegaria sem corretor responsável. Além disso, a AD-015 deixou pendurado o smoke conversacional dos três desfechos (qualificar→agendar, escalar, opt-out), que nunca foi exercitado ponta a ponta.

## Goals

- [ ] Os dois tenants-piloto (Triângulo Imóveis, Vale do Uberaba) operam **só com dado real**; a demonstração comercial passa a viver num tenant próprio.
- [ ] Todo lead criado pelo contrato nasce com corretor responsável e recebe `first_response_at` na primeira resposta do agente — os KPIs do dashboard passam a ter valor real, não nulo.
- [ ] O comparecimento à reunião tem um caminho de escrita no CRM (hoje não tem nenhum).
- [ ] Os três desfechos da conversa estão provados por execução real, com evidência verificável (screenshot do CRM + id de execução n8n confirmado + evento no Calendar).
- [ ] A chave de API do tenant deixa de existir em texto claro numa Data Table do n8n.

## Out of Scope

Explicitamente excluído. Documentado para evitar scope creep.

| Feature | Reason |
| ------- | ------ |
| Atendimento humano pelo Chats (corretor responde o lead pelo CRM) | Não selecionado pelo usuário no discuss deste lote. O corretor que recebe um lead escalado segue atendendo pelo WhatsApp próprio. Contradiz a premissa da AD-017 ("mensagens escritas por humanos pela tela"), que segue sem implementação — registrado como Assumption. |
| Usuários, perfis e papéis (administrador / gestor / corretor) com permissões por cargo | Decisão do usuário no discuss: vira lote próprio (novo L8, antes da Fase 10). Exige autenticação, que o produto não tem (AD-001); papéis sem login não existem. |
| Atribuição de corretor por disponibilidade de agenda + preferência do lead | Mesmo lote futuro. Exige uma credencial Google por corretor, que o `n8n/README.md` §2.3 classifica como productização de piloto real — o setup atual tem uma conta só para os dois tenants. |
| Baselines reais por tenant (`baseline_*`) | Fase 10 (instrumentação de métricas). Neste lote os tenants-piloto ficam com baseline nulo em vez de mockado. |
| Segundo número de teste do WhatsApp / smoke no tenant Vale do Uberaba | Só o Triângulo Imóveis tem `tenant_config` real na instância n8n. Conseguir e homologar um segundo número na Meta é logística externa, não trabalho de código. |
| Migração das linhas de seed já existentes para o tenant de demonstração | O seed é determinístico e reprodutível; recriar é mais simples e mais seguro que um script de migração one-shot para dado sem valor. |
| Coluna de autoria em `meeting_attended` (quem marcou o comparecimento) | Não há tabela de usuários; a autoria só passa a existir no lote de usuários/papéis. |

---

## Assumptions & Open Questions

Toda ambiguidade está resolvida ou registrada aqui — nada fica silenciosamente indefinido.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| O que exatamente é "o mock" que a Fase 9 substitui | Só dado de **lead** (leads, conversas, mensagens). Configuração do tenant — corretores, categorias, documentos, horário comercial, tom de voz — permanece semeada nos tenants-piloto | Documento e horário comercial são contexto que o agente consome via `GET /api/v1/context` e `/settings`; esvaziá-los deixaria o agente sem contexto justo no smoke. O que polui Kanban/Dashboard/Chats é lead fictício, não configuração | y |
| Destino dos 50 leads de seed já existentes nos 2 tenants-piloto | Apagados pelo reseed; o dataset rico renasce no tenant `Crivo Demo` | Seed determinístico e reprodutível (`id(...)` derivado de chave estável); migrar linhas sem valor custaria um script one-shot | n |
| Visibilidade do tenant `Crivo Demo` no seletor de tenants | Visível para todos, sem flag | Não existe autenticação (AD-001) — não há a quem esconder; o nome já denuncia que é demonstração | n |
| Definição de `first_response_at` | Instante (`sent_at`) da **primeira** mensagem com `sender = "agente"` daquele lead, gravado uma única vez e nunca sobrescrito | É a definição que o dashboard já assume ao calcular `firstResponseAt - firstContactAt`; gravar uma vez torna a operação idempotente sob reentrega de mensagem | n |
| Desempate da regra "menor carga ativa" | `created_at` do corretor, ascendente; persistindo empate, `id` ascendente | Precisa ser determinístico para o teste conseguir asseverar um resultado exato | n |
| Corretor escolhido sob criação concorrente de dois leads | A contagem de carga é lida no momento da criação; dois leads simultâneos podem cair no mesmo corretor | Carga é uma aproximação, não uma cota; serializar a criação de lead por causa disso custaria mais do que resolve | n |
| Tenant sem nenhum corretor cadastrado | O lead é criado mesmo assim, com `broker_id` nulo | Atribuição nunca pode fazer a entrega de lead falhar — o contrato (INT-02) promete criação idempotente, não corretor | n |
| Estados do controle de comparecimento | Três: pendente (`null`), compareceu (`true`), não compareceu (`false`) — o gestor pode voltar para pendente | O KPI já distingue "sem confirmação" (excluído do denominador) de confirmado; um controle de dois estados perderia essa distinção | n |
| Quando o controle de comparecimento aparece | Só quando `meeting_at` está preenchido **e** já passou | Marcar comparecimento de reunião futura não tem significado | n |
| Remoção de corretor de um lead já atribuído | Não oferecida — o seletor lista os corretores do tenant e sempre resulta em um corretor atribuído | Lead sem dono é o problema que este lote resolve; reintroduzi-lo por um clique seria contraditório | n |
| Significado de "status real do agente" na sidebar (SHELL-01) | Derivado do dado do próprio CRM: instante da última mensagem `sender = "agente"` do tenant | O CRM não pode consultar a instância n8n sem violar o desacoplamento de INT-08; o dado do CRM responde a pergunta que interessa ("o agente está atendendo?") sem acoplar nada | n |
| Mecanismo concreto de SEC-01 (chave fora de texto claro) | Não fixado na spec — o resultado é fixado, o mecanismo é decidido no Design com pesquisa na doc do n8n | Não sei hoje se o n8n permite escolher credencial por expressão; escolher o mecanismo agora seria fabricar API. O Design decide entre credencial por tenant e credencial de serviço + resolução de tenant server-side | n |
| Tenant e número usados no smoke conversacional | Triângulo Imóveis, com o número de teste já homologado | É o único tenant com `tenant_config` real na instância | n |
| A premissa da AD-017 de "mensagens escritas por humanos pela tela" | Segue sem implementação; o agente continua enxergando só as mensagens que ele mesmo trocou | Atendimento humano pelo Chats ficou fora deste lote (ver Out of Scope) — registrado para não parecer que a AD-017 está cumprida | n |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Dado de demonstração sai dos tenants-piloto ⭐ MVP

**User Story**: Como gestor de uma imobiliária-piloto, quero que o CRM mostre só os leads que realmente conversaram com o agente, para que Kanban, Chats e Dashboard digam a verdade sobre a minha operação.

**Why P1**: É a definição literal da Fase 9. Sem isso, três leads reais ficam afogados em cinquenta fictícios e nenhum número do dashboard significa nada.

**Acceptance Criteria**:

1. WHEN o seed é executado THEN o sistema SHALL criar três tenants: `Crivo Demo` com o dataset completo de demonstração, e os dois tenants-piloto sem nenhum lead, conversa ou mensagem.
2. The system SHALL semear nos tenants-piloto a configuração completa do tenant — corretores, categorias de documento, documentos, horário comercial, tom de voz e chave de API — exatamente como antes.
3. WHEN o seed é executado THEN o sistema SHALL deixar `baseline_leads_per_month`, `baseline_first_response_minutes` e `baseline_lead_to_meeting_pct` nulos nos dois tenants-piloto, mantendo-os preenchidos no tenant `Crivo Demo`.
4. WHILE um tenant não tem nenhum lead, o Dashboard SHALL exibir os KPIs sem valor numérico inventado (zero ou traço, nunca `NaN`) e cada gráfico e a tabela de leads recentes SHALL exibir seu estado vazio.
5. WHILE um tenant não tem nenhum lead, o Pipeline SHALL exibir as três colunas com estado vazio e a tela de Chats SHALL exibir o estado vazio da lista de conversas.
6. WHEN o seletor de tenants é aberto THEN o sistema SHALL listar os três tenants, com `Crivo Demo` entre eles.

**Independent Test**: rodar `npm run db:seed`, abrir Dashboard, Pipeline e Chats no tenant Triângulo Imóveis (tudo vazio, sem erro) e no tenant `Crivo Demo` (dataset completo).

---

### P1: Primeira resposta do agente marca o relógio ⭐ MVP

**User Story**: Como gestor, quero ver o tempo médio de primeira resposta dos leads reais, para provar o ganho que o agente trouxe contra o baseline humano.

**Why P1**: É o KPI-carro-chefe do PRD e hoje é estruturalmente inatingível para lead real — nenhum caminho de escrita preenche o campo.

**Acceptance Criteria**:

1. WHEN uma mensagem com `sender = "agente"` é ingerida para um lead cujo `first_response_at` é nulo THEN o sistema SHALL gravar `first_response_at` com o `sent_at` daquela mensagem, na mesma transação da ingestão.
2. WHEN uma mensagem com `sender = "agente"` é ingerida para um lead que já tem `first_response_at` THEN o sistema SHALL preservar o valor existente.
3. WHEN uma mensagem com `sender = "lead"` é ingerida THEN o sistema SHALL deixar `first_response_at` inalterado.
4. IF a mensagem ingerida é uma reentrega descartada por idempotência THEN o sistema SHALL deixar `first_response_at` inalterado.

**Independent Test**: criar lead pelo contrato, ingerir uma mensagem do lead e depois duas do agente; conferir que `first_response_at` é igual ao `sent_at` da primeira mensagem do agente e que o KPI do dashboard deixa de ser nulo.

---

### P1: Lead real nasce com corretor responsável ⭐ MVP

**User Story**: Como gestor, quero que todo lead que chega pelo agente já tenha um corretor responsável, para que um escalonamento tenha destinatário e a carga fique distribuída.

**Why P1**: Hoje só o seed atribui corretor; todo lead real nasce órfão, inclusive os escalados para humano.

**Acceptance Criteria**:

1. WHEN um lead é criado pelo contrato num tenant que tem ao menos um corretor THEN o sistema SHALL atribuir o corretor com o menor número de leads ativos (status `em_qualificacao` ou `escalado_humano`) daquele tenant.
2. WHEN dois ou mais corretores empatam em leads ativos THEN o sistema SHALL escolher o de `created_at` mais antigo e, persistindo o empate, o de menor `id`.
3. IF o tenant não tem nenhum corretor cadastrado THEN o sistema SHALL criar o lead assim mesmo, com `broker_id` nulo, sem erro.
4. WHEN a criação do lead é descartada por idempotência (`external_id` repetido) THEN o sistema SHALL preservar o corretor já atribuído, sem reatribuir.
5. The system SHALL manter a decisão de atribuição numa função pura, sem I/O, que recebe a lista de corretores e as contagens de carga e devolve o corretor escolhido.

**Independent Test**: com três corretores e cargas 5/2/2, criar um lead pelo contrato e conferir que foi para o corretor de carga 2 mais antigo; repetir a entrega com o mesmo `external_id` e conferir que o corretor não mudou.

---

### P1: Gestor troca o corretor pelo CRM ⭐ MVP

**User Story**: Como gestor, quero trocar o corretor responsável por um lead direto no painel do lead, porque a distribuição automática não conhece férias, especialidade nem combinado interno.

**Why P1**: A atribuição automática sem escape manual é uma decisão irreversível tomada por uma regra que ignora o contexto do escritório.

**Acceptance Criteria**:

1. WHEN o painel de detalhe de um lead é aberto THEN o sistema SHALL exibir um seletor com os corretores do tenant ativo e o corretor atual selecionado.
2. WHEN o gestor escolhe outro corretor THEN o sistema SHALL persistir `broker_id` e refletir o novo nome no card do lead no Kanban sem recarregar a página.
3. IF o corretor escolhido não pertence ao tenant ativo THEN o sistema SHALL recusar a alteração e deixar `broker_id` inalterado.
4. WHILE o tenant não tem nenhum corretor cadastrado, o painel SHALL exibir o campo de corretor como indisponível em vez de um seletor vazio.

**Independent Test**: abrir um lead, trocar o corretor, fechar o painel e conferir o nome novo no card do Kanban; tentar a mesma ação com um `brokerId` de outro tenant e conferir a recusa.

---

### P1: Comparecimento à reunião é registrado no CRM ⭐ MVP

**User Story**: Como corretor, quero marcar se o lead compareceu à reunião, para que a taxa de comparecimento do piloto exista.

**Why P1**: `meeting_attended` não tem nenhum caminho de escrita no produto — o card do dashboard ficaria em branco durante todo o piloto.

**Acceptance Criteria**:

1. WHILE um lead tem `meeting_at` preenchido e já passado, o painel de detalhe SHALL exibir um controle de comparecimento com os três estados: pendente, compareceu, não compareceu.
2. WHEN o corretor escolhe um estado THEN o sistema SHALL persistir `meeting_attended` como `null`, `true` ou `false` conforme o estado escolhido, escopado ao tenant ativo.
3. WHILE o lead não tem `meeting_at` preenchido, ou `meeting_at` ainda está no futuro, o painel SHALL exibir o comparecimento como somente leitura, sem controle editável.
4. WHEN `meeting_attended` passa de `null` para `true` ou `false` THEN a taxa de comparecimento do Dashboard SHALL passar a contar aquele lead no denominador.

**Independent Test**: agendar um lead com reunião no passado, marcar "compareceu", conferir a taxa no Dashboard mudando de vazia para 100%; marcar um segundo lead como "não compareceu" e conferir 50%.

---

### P1: Chave de API do tenant sai do texto claro ⭐ MVP

**User Story**: Como responsável pelo produto, quero que a chave que autoriza o agente a escrever no CRM não fique legível em texto claro numa Data Table, antes de números reais de imobiliária entrarem no ar.

**Why P1**: Risco R1 do `n8n/README.md` §3, nomeado ali como pré-requisito de piloto real. Qualquer pessoa com acesso de leitura à instância n8n hoje lê a chave e escreve no CRM de qualquer tenant.

**Acceptance Criteria**:

1. The system SHALL deixar de armazenar a chave de API de qualquer tenant em coluna de Data Table do n8n.
2. WHEN o fluxo do agente chama qualquer rota `/api/v1/*` THEN o sistema SHALL continuar autenticando e resolvendo o tenant correto, sem alteração no comportamento observável do contrato.
3. IF a autenticação da chamada falha THEN a rota SHALL responder `401` em `application/problem+json` conforme AD-013, como hoje.
4. The system SHALL registrar no `n8n/README.md` o procedimento humano de rotação da chave sob o mecanismo novo.

**Independent Test**: inspecionar a Data Table `tenant_config` e confirmar ausência da chave; disparar uma execução real do fluxo e confirmar escrita bem-sucedida no CRM do tenant certo.

---

### P1: LGPD verificável com dado real ⭐ MVP

**User Story**: Como responsável pelo produto, quero ver os mecanismos de LGPD funcionando sobre dado real, porque até agora eles só foram exercitados por teste unitário e fixture.

**Why P1**: O roadmap condiciona a testabilidade real de LGPD à Fase 9. Entrar num piloto com clientes reais sem essa prova é assumir risco jurídico sem evidência.

**Acceptance Criteria**:

1. WHEN um lead real pede para não receber mais mensagens THEN o sistema SHALL gravar `opted_out_at` naquele lead e exibir o indicador de opt-out no painel de detalhe.
2. WHILE um lead tem `opted_out_at` preenchido, o fluxo do agente SHALL não enviar nenhuma mensagem para aquele lead, mesmo que ele volte a escrever.
3. WHEN o opt-out é registrado THEN o sistema SHALL purgar a memória conversacional daquele lead em `n8n_chat_histories`, deixando zero linhas para a sessão.
4. WHEN a rota de expiração de documentos é executada em produção THEN o sistema SHALL marcar como expirado todo documento cujo prazo venceu e reportar a contagem por tenant.
5. WHEN o agente lê o contexto do tenant após a expiração THEN o sistema SHALL não incluir nenhum documento expirado na resposta.

**Independent Test**: conduzir o opt-out por conversa real, conferir indicador no CRM, contar zero linhas na memória, reenviar mensagem e confirmar silêncio; disparar a rota de expiração e conferir contagem e ausência do documento no contexto.

---

### P1: Os três desfechos provados por conversa real ⭐ MVP

**User Story**: Como responsável pelo produto, quero os três desfechos da conversa demonstrados em conversas reais com evidência verificável, para entrar no piloto sabendo que o caminho inteiro funciona.

**Why P1**: É a dívida que a AD-015 registrou explicitamente e apontou para a Fase 9. Nenhum dos três desfechos jamais rodou ponta a ponta.

**Acceptance Criteria**:

1. WHEN a conversa roteirizada de qualificação é conduzida pelo WhatsApp real THEN o sistema SHALL levar o lead a `qualificado_agendado` com resumo executivo preenchido, corretor atribuído e um evento correspondente criado no Google Calendar.
2. WHEN a conversa roteirizada de escalonamento é conduzida THEN o sistema SHALL levar o lead a `escalado_humano` com motivo preenchido e SHALL não enviar mais nenhuma mensagem do agente àquele lead.
3. WHEN a conversa roteirizada de opt-out é conduzida THEN o sistema SHALL registrar `opted_out_at` e silenciar o agente para aquele lead.
4. The system SHALL registrar cada desfecho com evidência de três origens independentes: screenshot real da tela do CRM, id de execução do n8n confirmado por consulta à instância, e o artefato externo do desfecho quando existir (evento no Calendar).
5. IF um id de execução do n8n é citado como evidência THEN o autor SHALL confirmá-lo por consulta à instância antes de escrevê-lo, nunca de memória da sessão.

**Independent Test**: `validation.md` do lote contém, para cada um dos três roteiros, o screenshot, o id de execução confirmado e o estado final do lead no CRM.

---

### P2: Sidebar mostra atividade real do agente

**User Story**: Como gestor, quero que o card do agente na sidebar reflita a atividade real, para não olhar uma frase fixa que diz "qualificando leads" quando o agente está parado há dois dias.

**Why P2**: Não bloqueia o piloto, mas hoje a sidebar afirma uma coisa que o produto não sabe se é verdade.

**Acceptance Criteria**:

1. WHILE existe alguma mensagem do agente no tenant ativo, a sidebar SHALL exibir o instante relativo da última mensagem do agente, em português.
2. WHILE não existe nenhuma mensagem do agente no tenant ativo, a sidebar SHALL exibir um subtítulo de estado ocioso, sem inventar atividade.
3. The system SHALL derivar esse estado exclusivamente de dado do próprio CRM, sem nenhuma chamada à instância n8n.

**Independent Test**: abrir o CRM no tenant `Crivo Demo` (mensagens recentes → instante relativo) e num tenant-piloto recém-semeado (sem mensagem → estado ocioso).

---

## Edge Cases

- IF o reseed roda contra o banco de produção por engano THEN o sistema SHALL falhar alto — a suíte de testes exige `TEST_DATABASE_URL` e nunca usa `DATABASE_URL`.
- WHEN um lead real é criado num tenant cujo único corretor foi removido THEN o sistema SHALL criar o lead com `broker_id` nulo e o card SHALL degradar sem exibir corretor.
- IF o seletor de corretor recebe um id inexistente THEN o sistema SHALL recusar a alteração sem lançar erro não tratado na tela.
- WHEN a reunião de um lead é reagendada para o futuro depois do comparecimento já marcado THEN o sistema SHALL preservar o valor de `meeting_attended` já registrado.
- IF a instância n8n está fora do ar durante o smoke THEN o autor SHALL registrar o desfecho como não provado, nunca inferir sucesso a partir do estado do CRM.
- WHEN o tenant `Crivo Demo` está ativo THEN o sistema SHALL tratá-lo como qualquer outro tenant, sem caminho especial de código.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| REAL-01 | P1: Dado de demonstração sai dos tenants-piloto | T2, T6 | Implementing |
| KPI-01 | P1: Primeira resposta do agente marca o relógio | T5, T19 | Implementing |
| ATRIB-01 | P1: Lead real nasce com corretor responsável | T3, T4, T19 | Implementing |
| ATRIB-02 | P1: Gestor troca o corretor pelo CRM | T7, T8, T9, T10 | Implementing |
| KPI-02 | P1: Comparecimento à reunião é registrado no CRM | T7, T8, T9, T10 | Implementing |
| SEC-01 | P1: Chave de API do tenant sai do texto claro | T1, T12–T18 | Implementing |
| PRIV-01 | P1: LGPD verificável com dado real | T21, T22 | Implementing |
| SMOKE-01 | P1: Os três desfechos provados por conversa real | T19, T20, T21 | Implementing |
| SHELL-01 | P2: Sidebar mostra atividade real do agente | T7, T11 | Implementing |

**ID format:** `[CATEGORY]-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 9 total, 9 mapeadas a tasks, 0 sem mapeamento. Todas com evidência real registrada em `tasks.md` (Phases 1–4) e nas notas de T17/T19/T20/T21/T22; status sobe para **Verified** só depois do Verifier (author ≠ verifier) escrever `validation.md`.

---

## Success Criteria

- [ ] Abrir Dashboard, Pipeline e Chats num tenant-piloto recém-semeado não mostra nenhum lead fictício e nenhuma tela quebra.
- [ ] Um lead criado pelo contrato tem corretor e, após a primeira resposta do agente, `first_response_at` preenchido — verificado no banco e no card do KPI.
- [ ] A taxa de comparecimento do Dashboard sai de vazia para um número depois que um comparecimento é marcado pela tela.
- [ ] `tenant_config` no n8n não contém nenhuma chave de API legível, e o fluxo continua escrevendo no CRM.
- [ ] `validation.md` contém os três desfechos com screenshot + id de execução confirmado + artefato externo.
