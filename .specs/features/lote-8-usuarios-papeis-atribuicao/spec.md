# Lote 8 — Usuários, papéis e atribuição por agenda Specification

## Problem Statement

O CRM não tem autenticação nenhuma: `src/server/tenant.ts` resolve a imobiliária ativa por um cookie (`crivo_tenant`) alimentado por um seletor no shell, sem `middleware.ts`, sem sessão, sem usuário. Quem abrir a URL de produção vê o funil, as conversas e os documentos de qualquer uma das três imobiliárias — o isolamento multi-tenant que a AD-002 protege no modelo de dados não existe na porta de entrada. Ao mesmo tempo, "corretor" é apenas um cadastro (`brokers`: nome, telefone, e-mail) que recebe lead por menor carga na criação (`src/lib/broker-assignment.ts`), sem login, sem papel e sem agenda — então o lead cai em alguém que pode não ter horário livre quando a reunião for marcada, e a "autoria humana" que a AD-017 pressupõe não tem a quem apontar. A Fase 10 (L9) instrumenta métricas do piloto, e quem opera o piloto são usuários reais da imobiliária: sem eles, não há a quem atribuir número nenhum.

## Goals

- [ ] O CRM inteiro fica atrás de login; nenhuma rota de aplicação responde a requisição não autenticada.
- [ ] A imobiliária ativa passa a vir do vínculo do usuário autenticado, não de um cookie que qualquer um escolhe.
- [ ] Administrador, gestor e corretor existem como papéis com permissões distintas e verificáveis; o corretor enxerga só a própria carteira.
- [ ] O administrador cria, convida, promove e desativa os demais usuários da imobiliária pelo próprio CRM.
- [ ] O corretor responsável por um lead passa a ser escolhido no momento do agendamento, entre quem tem janela de trabalho livre no horário acordado com o lead.
- [ ] Nenhum lead escalado para humano chega ao Pipeline sem responsável.

## Out of Scope

Explicitamente excluído. Documentado para evitar scope creep.

| Feature | Reason |
| ------- | ------ |
| Atendimento humano pelo Chats (corretor responde o lead pelo CRM) | Decisão do usuário no discuss deste lote: vira lote próprio. Exige envio via WhatsApp Cloud API a partir do CRM, autoria humana nas mensagens e interação com a trava humana da AD-018 — meio lote sozinho. A premissa da AD-017 segue sem implementação. |
| Página de Agenda em formato calendário | Decisão do usuário: nasce junto com o vínculo de conta Google, para já mostrar compromissos internos e externos em vez de uma primeira versão que depois troca de fonte. |
| Vínculo opcional de conta Google por usuário e login com Google | Mesmo pacote futuro. Este lote usa exclusivamente janela de trabalho declarada no CRM. |
| Auto-cadastro, onboarding self-service e billing | AD-001: o piloto é negociado diretamente com dois clientes-âncora. Usuário nasce por convite de um administrador, nunca por cadastro público. |
| Papéis customizados por imobiliária | Os três papéis (administrador, gestor, corretor) são fixos no produto. Papel definido pelo cliente exigiria editor de permissões — productização de SaaS, não piloto. |
| Permissão por lead individual ou por equipe/regional | A visibilidade tem exatamente dois níveis: toda a imobiliária (administrador, gestor) ou a própria carteira (corretor). Estrutura de equipes é modelo novo sem demanda dos dois pilotos. |
| Autenticação de dois fatores (2FA/MFA) | Superfície de segurança acima do que um piloto de duas imobiliárias exige; better-auth suporta adicionar depois sem redesenho. |
| Trilha de auditoria completa (log de toda ação de todo usuário) | Este lote registra apenas negativa de permissão e a autoria já existente em `statusChangedBy`. Auditoria completa é feature própria. |
| Atribuição por região ou especialidade do corretor | O usuário selecionou exclusivamente horário/turno como preferência do lead. Região por corretor exigiria campos que não existem. |
| Baselines reais e instrumentação de métricas do piloto | Fase 10 (L9), o lote seguinte pela AD-020. |
| Migração de dado existente (corretores, leads, conversas) | Não há dado real a preservar: todo lead do banco é seed determinístico ou conversa de teste do próprio autor do projeto, e `seed.ts` já faz delete-and-insert de tudo. Escrever migração para dado descartável só deixaria resíduo de estrutura no código. |

---

## Assumptions & Open Questions

Toda ambiguidade está resolvida ou registrada aqui — nada fica silenciosamente indefinido.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Biblioteca de autenticação | better-auth, com e-mail + senha e sessão em cookie | Já listada como stack opcional aprovada no roadmap; é o padrão do ecossistema Next para auth própria com banco próprio, e traz rate limit de login, expiração de sessão e fluxo de recuperação prontos | y |
| Provedor de envio de e-mail do convite | Resend | Padrão de mercado no ecossistema Next/Vercel, free tier suficiente para o piloto e integração direta com better-auth. É o único componente externo novo do lote; trocar depois é substituir um adaptador | n |
| Bootstrap do primeiro administrador de uma imobiliária | Comando de linha executado por quem opera a plataforma (mesma família do `npm run db:seed`), nunca tela pública | AD-001: não há onboarding self-service. Alguém precisa existir antes de poder convidar, e esse alguém não pode nascer de um formulário aberto na internet | n |
| Semântica de papéis acumuláveis | União de permissões — o papel mais permissivo vence, nunca o mais restritivo | É o comportamento que o usuário espera ao acumular cargos (um gestor que também atende como corretor não pode perder acesso ao funil por acumular o papel menor) | n |
| Identidade do usuário no sistema | O e-mail é único globalmente, não por imobiliária | Decorre direto do modelo multi-tenant escolhido: a mesma pessoa atuando em duas imobiliárias tem uma conta só, que é justamente o motivo pelo qual o usuário rejeitou o modelo de conta por tenant | n |
| Destino dos corretores já cadastrados | Nenhuma migração: `brokers` é removida do schema e os corretores renascem pelo seed como usuários com papel corretor e convite pendente | Não há dado real a preservar (confirmado pelo usuário em 2026-08-23) e `seed.ts` já faz delete-and-insert de tudo com UUID determinístico. Migrar dado descartável só deixaria resíduo de estrutura | y |
| Nome da coluna de responsável em `leads` | Renomeada de `broker_id` para `assigned_user_id`, referenciando `users.id` | Sem migração a preservar, manter `broker_id` apontando para `users` seria exatamente o resíduo de estrutura que o usuário pediu para evitar. A coluna nunca sai do CRM — não aparece no payload do contrato v1 nem em nenhum lugar do n8n — então o rename é interno | n |
| Estado do ambiente de teste após o lote | O reseed apaga as 3 conversas reais de teste do lote-7; a memória do agente em `n8n_chat_histories` precisa ser purgada nas chaves de teste junto com o reseed | A memória é chaveada por `tenantSlug:waId`, não pelo id do lead: sem a purga o agente segue lembrando de uma conversa que o CRM não tem mais, e a semeadura de cold start da AD-019 não dispara porque a memória não está vazia | n |
| Como a preferência de horário do lead chega à atribuição | Não há campo novo de preferência: o agente já negocia com o lead um horário concreto antes de agendar (T19: 18/08 14h–14h30). Esse horário acordado **é** a preferência, e é o insumo da escolha do corretor | Evita inventar captura de "turno" quando a conversa real já produz data e hora exatas; e mantém uma verdade só sobre quando a reunião acontece | n |
| Quem escolhe o corretor no agendamento | O CRM, server-side, no mesmo endpoint que registra o agendamento — o agente informa o horário e recebe de volta o corretor escolhido; a lista de corretores nunca é exposta ao modelo | AD-018: quem detém a regra decide. A regra de atribuição é do CRM, e manter a escolha fora da discrição do modelo evita a classe de defeito que a AD-018 fecha | n |
| Granularidade do slot de reunião | 30 minutos, alinhado ao início da hora ou à meia hora | É o que o fluxo já produz hoje (14h–14h30 no T19); qualquer outra granularidade exigiria mudar o `tool-agendar-reuniao` sem ganho | n |
| Fuso horário da janela de trabalho | America/Sao_Paulo, sem timezone armazenado — mesma convenção de `meetingDays`/`meetingHoursStart` do tenant | Convenção já estabelecida do produto; introduzir timezone por usuário agora seria divergir do que o fluxo n8n já interpreta | n |
| Onde o evento do Google Calendar é criado | Continua no calendário único da imobiliária; o corretor atribuído entra no evento como convidado, pelo e-mail dele | Agenda por corretor chega no pacote Google futuro. Convidar por e-mail dá visibilidade ao corretor hoje sem exigir credencial por pessoa | n |
| Regra de atribuição no escalonamento sem qualificação | Menor carga ativa entre os corretores cujo horário de trabalho declarado cobre o instante do escalonamento; se nenhum estiver em janela, menor carga entre todos os corretores ativos; empate desfeito por `createdAt` e depois `id`, como hoje | Preserva o desempate determinístico que o lote-7 já testa, e degrada para a regra atual em vez de deixar o lead órfão — que é exatamente o que o usuário pediu para evitar | n |
| Duração da sessão e política de senha | Padrões do better-auth: sessão de 7 dias e senha de no mínimo 8 caracteres | Escolher números próprios sem requisito de segurança do cliente seria inventar política; os padrões da biblioteca são defensáveis e revisáveis num lote de endurecimento | n |
| Validade do convite | 7 dias; reenviar invalida o token anterior | Janela padrão da indústria, curta o bastante para que um e-mail vazado envelheça e longa o bastante para um corretor que só abre e-mail no fim de semana | n |
| Efeito da desativação sobre a conta | O usuário nunca é apagado: perde acesso e sai das listas de atribuição, mas segue nomeado no histórico dos leads que atendeu | Apagar destruiria a rastreabilidade de quem atendeu o quê — a mesma perda de governança que o PRD aponta como dor | n |
| Quem edita a janela de trabalho de um corretor | O próprio corretor edita a sua; administrador e gestor editam a de qualquer corretor da imobiliária | O gestor precisa conseguir corrigir a agenda de quem está de férias ou não usa o sistema; o corretor precisa de autonomia no dia a dia | n |
| Autenticação do contrato de integração (`/api/v1/**`) | Inalterada — segue na credencial de serviço com `X-Crivo-Tenant` (SEC-01 do lote-7). Login de usuário e credencial de serviço são caminhos independentes | O agente não é um usuário e não tem papel; misturar os dois reabriria a superfície que o lote-7 fechou | n |
| Visibilidade do tenant de demonstração (`Crivo Demo`) | Passa a depender de vínculo: aparece apenas para usuários vinculados a ele | Com login, existe finalmente a quem esconder — a justificativa original ("não há a quem esconder") caducou | n |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

### P1: O CRM fica atrás de login ⭐ MVP

**User Story**: Como gestor de uma imobiliária-piloto, quero que só quem tem conta acesse o CRM, para que o funil e as conversas dos meus clientes não fiquem abertos na internet.

**Why P1**: É a fundação do lote inteiro — papel, permissão, carteira e autoria só existem depois que existe um usuário autenticado. É também a correção de uma exposição real em produção hoje.

**Acceptance Criteria**:

1. WHEN uma requisição sem sessão válida atinge qualquer rota sob `/(crm)` THEN o sistema SHALL responder com redirecionamento para a tela de login, sem renderizar nenhum dado da imobiliária.
2. WHEN um usuário envia e-mail e senha corretos na tela de login THEN o sistema SHALL criar uma sessão e redirecionar para o Pipeline da imobiliária ativa dele.
3. IF as credenciais enviadas estão incorretas THEN o sistema SHALL responder com a mesma mensagem genérica de falha para e-mail inexistente e senha errada, sem revelar qual dos dois falhou.
4. IF mais de 10 tentativas de login falham para o mesmo e-mail em 1 minuto THEN o sistema SHALL recusar novas tentativas desse e-mail até o fim da janela.
5. WHEN um usuário autenticado aciona sair THEN o sistema SHALL invalidar a sessão e redirecionar para a tela de login.
6. WHILE existe uma sessão válida o sistema SHALL expor o nome e o e-mail do usuário autenticado no shell do CRM.
7. The system SHALL manter as rotas do contrato de integração (`/api/v1/**`) autenticadas exclusivamente pela credencial de serviço, sem exigir nem aceitar sessão de usuário.

**Independent Test**: Abrir `/pipeline` sem sessão cai no login; logar com um usuário do seed entra no Pipeline; `curl` no contrato v1 com a chave de serviço continua respondendo 200.

---

### P2: Usuário recupera a própria senha

**User Story**: Como corretor, quero redefinir minha senha sozinho, para não depender do administrador toda vez que eu esquecer.

**Why P2**: Não bloqueia o piloto — o administrador consegue reenviar convite — mas sem isso todo esquecimento vira chamado. Usa o mesmo provedor de e-mail que o convite já exige, então o custo marginal é pequeno.

**Acceptance Criteria**:

1. WHEN um usuário solicita recuperação informando um e-mail cadastrado THEN o sistema SHALL enviar um e-mail com link de redefinição válido por 1 hora.
2. IF o e-mail informado não existe THEN o sistema SHALL exibir a mesma confirmação de envio exibida no caso de sucesso, sem revelar se a conta existe.
3. WHEN um link de redefinição válido é usado com uma senha nova THEN o sistema SHALL gravar a nova senha, invalidar o link e encerrar as demais sessões daquele usuário.
4. IF o link de redefinição já foi usado ou expirou THEN o sistema SHALL recusar a redefinição e oferecer solicitar um novo link.

**Independent Test**: Pedir recuperação para um usuário do seed, abrir o link do e-mail, trocar a senha e confirmar que a senha antiga não entra mais.

---

### P1: O usuário pertence a uma ou mais imobiliárias ⭐ MVP

**User Story**: Como corretor que atua em duas imobiliárias, quero uma conta só que alcance as duas, para não manter dois logins e dois cadastros da mesma pessoa.

**Why P1**: Define de onde vem a imobiliária ativa depois do login. Sem isso o seletor de tenant continua sendo um campo livre — a exposição que a story de login fecha na porta voltaria pela janela.

**Acceptance Criteria**:

1. The system SHALL representar o vínculo entre usuário e imobiliária como uma relação própria, com papéis atribuídos por vínculo, permitindo o mesmo usuário em mais de uma imobiliária com papéis distintos em cada.
2. WHEN um usuário vinculado a exatamente uma imobiliária faz login THEN o sistema SHALL definir essa imobiliária como ativa sem apresentar seletor.
3. WHILE o usuário autenticado tem vínculo com mais de uma imobiliária o sistema SHALL exibir no shell um seletor contendo exclusivamente as imobiliárias vinculadas a ele.
4. IF o cookie de imobiliária ativa aponta para uma imobiliária sem vínculo com o usuário autenticado THEN o sistema SHALL ignorar o cookie e usar o primeiro vínculo do usuário.
5. WHEN o usuário troca a imobiliária ativa pelo seletor THEN o sistema SHALL passar a resolver toda leitura e escrita subsequente no escopo daquela imobiliária e com os papéis daquele vínculo.
6. IF um usuário autenticado não tem nenhum vínculo com imobiliária THEN o sistema SHALL apresentar uma tela informando ausência de acesso, sem renderizar dado de nenhuma imobiliária.

**Independent Test**: Vincular a mesma conta às três imobiliárias do seed, logar, alternar pelo seletor e ver Pipeline distinto em cada; forçar o cookie para uma imobiliária sem vínculo e confirmar que ela não é usada.

---

### P1: Administrador gerencia os usuários da imobiliária ⭐ MVP

**User Story**: Como administrador da imobiliária, quero criar, convidar, promover e desativar os usuários da minha equipe, para operar o CRM sem depender de quem mantém a plataforma.

**Why P1**: É a capacidade que dá nome ao lote. Sem ela, todo usuário novo é um chamado, e o piloto não escala nem para duas imobiliárias.

**Acceptance Criteria**:

1. WHEN um administrador convida um e-mail informando nome e ao menos um papel THEN o sistema SHALL criar o usuário com vínculo à imobiliária ativa em estado de convite pendente e enviar o e-mail de convite.
2. IF o e-mail convidado já pertence a um usuário do sistema THEN o sistema SHALL adicionar um vínculo daquele usuário com a imobiliária ativa em vez de criar um segundo usuário.
3. IF o e-mail convidado já tem vínculo com a imobiliária ativa THEN o sistema SHALL recusar o convite informando que o usuário já pertence à imobiliária.
4. IF o envio do e-mail de convite falha THEN o sistema SHALL manter o usuário criado em convite pendente e oferecer reenviar o convite, sem desfazer a criação.
5. WHEN um administrador reenvia um convite THEN o sistema SHALL emitir um token novo e invalidar o token anterior daquele convite.
6. WHEN o convidado abre um convite válido e define uma senha THEN o sistema SHALL ativar o usuário e criar a sessão dele.
7. IF um convite expirado ou já utilizado é aberto THEN o sistema SHALL recusar a ativação e instruir o convidado a pedir um novo convite ao administrador.
8. WHEN um administrador altera os papéis de um vínculo THEN o sistema SHALL aplicar os novos papéis à próxima requisição daquele usuário, sem exigir que ele saia e entre de novo.
9. IF a alteração deixaria a imobiliária sem nenhum administrador ativo THEN o sistema SHALL recusar a alteração informando que a imobiliária precisa de ao menos um administrador.
10. WHILE um usuário está desativado o sistema SHALL recusar o login dele e excluí-lo de toda lista de atribuição de lead, mantendo o nome dele nos leads que já atendeu.

**Independent Test**: Convidar um e-mail novo, aceitar o convite em aba anônima, promover a gestor, tentar rebaixar o último administrador (recusado) e desativar o convidado.

---

### P1: A desativação de um corretor decide o destino da carteira ⭐ MVP

**User Story**: Como administrador, quero decidir o que acontece com os leads de um corretor no momento em que o desativo, para que nenhum cliente fique sem atendimento por causa de um desligamento.

**Why P1**: É a transição de estado onde a carteira se perde na prática. Desativar sem essa decisão recria, dentro do produto, exatamente a perda de governança que o PRD levanta como dor.

**Acceptance Criteria**:

1. WHEN um administrador aciona a desativação de um usuário que tem leads ativos atribuídos THEN o sistema SHALL exigir a escolha entre transferir a carteira para um corretor específico, redistribuir pela política de atribuição, ou manter os leads com o usuário desativado.
2. WHEN a escolha é transferir para um corretor específico THEN o sistema SHALL atribuir todos os leads ativos daquele usuário ao corretor escolhido numa única operação.
3. WHEN a escolha é redistribuir pela política THEN o sistema SHALL reatribuir cada lead ativo pela mesma regra de escalonamento, com a carga recalculada a cada lead.
4. WHEN a escolha é manter THEN o sistema SHALL preservar a atribuição e marcar esses leads como sob responsável inativo, visível para administrador e gestor no Pipeline.
5. The system SHALL preservar em qualquer das três escolhas a atribuição histórica de leads não ativos, que nunca é alterada pela desativação.
6. IF a desativação é acionada para um usuário sem nenhum lead ativo THEN o sistema SHALL desativar diretamente, sem perguntar destino de carteira.
7. IF o corretor escolhido para receber a carteira é desativado durante a operação THEN o sistema SHALL recusar a transferência inteira, sem transferir lead nenhum.

**Independent Test**: Desativar um corretor com leads nas três escolhas possíveis (em bases separadas) e conferir Pipeline e histórico em cada caso.

---

### P1: Cada papel enxerga e faz exatamente o que lhe cabe ⭐ MVP

**User Story**: Como gestor, quero que corretor, gestor e administrador tenham alcances diferentes no CRM, para que a configuração do agente e a base de usuários não fiquem ao alcance de quem só atende lead.

**Why P1**: Papel sem permissão aplicada é rótulo. É também o que o Verifier consegue atacar diretamente, e o que sustenta a story da carteira do corretor.

**Acceptance Criteria**:

1. The system SHALL conceder a administrador e a gestor leitura de Dashboard, Pipeline e Chats de toda a imobiliária ativa, e escrita em Documentos e Configurações do agente.
2. The system SHALL restringir a gestão de usuários, papéis e convites exclusivamente ao papel administrador.
3. The system SHALL conceder ao papel corretor leitura somente dos documentos de contexto, sem escrita em Documentos nem acesso a Configurações.
4. WHERE um usuário acumula mais de um papel no vínculo ativo o sistema SHALL conceder a união das permissões dos papéis acumulados.
5. IF um usuário aciona uma operação fora das permissões do vínculo ativo THEN o sistema SHALL recusar a operação no servidor, mesmo que o controle não estivesse visível na tela.
6. WHEN uma operação é recusada por permissão THEN o sistema SHALL registrar em log estruturado o usuário, a imobiliária ativa e o recurso negado.
7. The system SHALL ocultar da navegação os itens correspondentes a permissões que o vínculo ativo não possui.

**Independent Test**: Logar como corretor e confirmar que Configurações e Usuários somem da navegação; chamar a server action de editar configurações diretamente com essa sessão e receber recusa.

---

### P1: O corretor enxerga só a própria carteira ⭐ MVP

**User Story**: Como gestor, quero que cada corretor veja apenas os leads dele, para que a carteira da imobiliária não saia inteira pela porta quando alguém se desliga.

**Why P1**: É a dor nomeada no PRD ("perda da carteira quando o corretor sai") e o padrão de mercado dos CRMs de venda. Também é a regra que o Verifier precisa provar com vazamento zero.

**Acceptance Criteria**:

1. WHILE o vínculo ativo tem apenas o papel corretor o sistema SHALL restringir o Pipeline aos leads cujo responsável é o usuário autenticado.
2. WHILE o vínculo ativo tem apenas o papel corretor o sistema SHALL restringir Chats às conversas de leads cujo responsável é o usuário autenticado.
3. WHILE o vínculo ativo tem apenas o papel corretor o sistema SHALL calcular os indicadores do Dashboard apenas sobre os leads cujo responsável é o usuário autenticado.
4. IF um usuário com apenas o papel corretor requisita diretamente um lead de outro corretor pelo identificador THEN o sistema SHALL responder como recurso inexistente, sem revelar que o lead existe.
5. The system SHALL manter os leads ainda sem responsável visíveis para administrador e gestor, e invisíveis para quem tem apenas o papel corretor.
6. The system SHALL aplicar o filtro de carteira na camada de acesso a dados, de modo que nenhuma leitura de lead ocorra sem o escopo de imobiliária e de responsável resolvidos juntos.

**Independent Test**: Com dois corretores da mesma imobiliária, confirmar que cada um vê só os próprios cards no Pipeline, números diferentes no Dashboard, e recebe recurso inexistente ao pedir o lead do outro pela URL.

---

### P1: Corretor tem janela de trabalho declarada ⭐ MVP

**User Story**: Como corretor, quero declarar em que dias e horários eu atendo, para não receber reunião marcada em horário que eu não trabalho.

**Why P1**: É o insumo sem o qual a atribuição por agenda não existe. É a metade "agenda" do lote.

**Acceptance Criteria**:

1. WHEN um corretor salva a própria janela de trabalho THEN o sistema SHALL gravar os dias da semana atendidos e o horário de início e fim do atendimento.
2. The system SHALL aceitar dias da semana no intervalo de 1 (segunda) a 7 (domingo) e horários no formato `HH:MM`, interpretados em America/Sao_Paulo.
3. IF o horário de fim informado não é posterior ao de início THEN o sistema SHALL recusar o salvamento informando o campo inválido.
4. IF nenhum dia da semana é selecionado THEN o sistema SHALL recusar o salvamento informando que ao menos um dia é obrigatório.
5. WHILE um corretor está sem janela de trabalho declarada o sistema SHALL tratá-lo como indisponível em qualquer horário para efeito de atribuição por agenda.
6. WHEN um administrador ou gestor salva a janela de trabalho de outro corretor THEN o sistema SHALL gravá-la com o mesmo efeito de quando o próprio corretor a salva.
7. IF um usuário sem o papel administrador ou gestor tenta salvar a janela de trabalho de outro usuário THEN o sistema SHALL recusar a operação no servidor.

**Independent Test**: Declarar seg-sex 9h-18h para um corretor, tentar salvar fim anterior ao início (recusado) e salvar a janela de outro corretor como gestor.

---

### P1: O lead ganha responsável no agendamento, por agenda e horário acordado ⭐ MVP

**User Story**: Como lead, quero que a reunião que eu marquei caia com um corretor que realmente atende naquele horário, para não ser remarcado depois por indisponibilidade.

**Why P1**: É o comportamento central do lote e a razão pela qual a atribuição sai da criação do lead. Substitui a política atual de menor carga na criação (ATRIB-01 do lote-7).

**Acceptance Criteria**:

1. The system SHALL deixar de atribuir corretor no momento da criação do lead pelo contrato de integração; o lead nasce sem responsável.
2. WHEN o agendamento de uma reunião é registrado com data e hora THEN o sistema SHALL escolher o responsável entre os corretores ativos da imobiliária cuja janela de trabalho declarada cobre integralmente o intervalo de 30 minutos da reunião.
3. WHEN mais de um corretor cobre o horário da reunião THEN o sistema SHALL escolher o de menor carga de leads ativos, desempatando por data de cadastro ascendente e depois por identificador ascendente.
4. WHEN o responsável é escolhido no agendamento THEN o sistema SHALL devolver ao chamador o corretor escolhido, sem nunca expor a lista de corretores candidatos.
5. IF nenhum corretor ativo cobre o horário solicitado THEN o sistema SHALL recusar o agendamento com um código de erro estável que distinga essa causa das demais, sem criar a reunião.
6. IF o corretor escolhido já tem outra reunião registrada que se sobrepõe ao mesmo intervalo THEN o sistema SHALL excluí-lo dos candidatos daquele horário.
7. IF dois agendamentos concorrentes disputam o mesmo corretor no mesmo intervalo THEN o sistema SHALL confirmar apenas um deles e recusar o outro com o código de conflito, nunca registrar os dois.
8. WHEN a reunião é confirmada THEN o sistema SHALL incluir o corretor escolhido como convidado do evento no calendário da imobiliária, pelo e-mail dele.

**Independent Test**: Com dois corretores de janelas diferentes, agendar num horário coberto só por um e confirmar quem recebeu; agendar fora de toda janela e receber a recusa específica.

---

### P1: Lead escalado para humano nunca fica órfão ⭐ MVP

**User Story**: Como gestor, quero que todo lead escalado para atendimento humano já chegue com responsável, para que ninguém dependa de eu olhar o funil para descobrir que alguém está esperando.

**Why P1**: Sem atribuição na criação, o escalonamento antes da qualificação é o buraco exato por onde um lead sumiria — e, com corretor vendo só a própria carteira, ele ficaria invisível para todos menos o gestor.

**Acceptance Criteria**:

1. WHEN um lead sem responsável passa para o status escalado para humano THEN o sistema SHALL atribuir um corretor responsável na mesma operação que grava o status.
2. WHEN a atribuição por escalonamento ocorre THEN o sistema SHALL escolher o corretor ativo de menor carga entre aqueles cuja janela de trabalho cobre o instante do escalonamento.
3. IF nenhum corretor ativo está dentro da janela de trabalho no instante do escalonamento THEN o sistema SHALL escolher o corretor ativo de menor carga entre todos, em vez de deixar o lead sem responsável.
4. IF a imobiliária não tem nenhum corretor ativo THEN o sistema SHALL registrar o escalonamento mesmo assim, com o lead sem responsável e sinalizado como pendente de atribuição para administrador e gestor.
5. WHEN um lead que já tem responsável passa para escalado para humano THEN o sistema SHALL preservar o responsável atual, sem reatribuir.
6. The system SHALL manter a trava humana existente inalterada: o lead escalado continua recusando escrita do agente com o mesmo código de erro estável.

**Independent Test**: Escalar um lead novo dentro do horário comercial e fora dele, e conferir o responsável em cada caso; escalar numa imobiliária sem corretor ativo e ver o lead sinalizado.

---

### P1: O seed nasce com usuários, papéis e agenda ⭐ MVP

**User Story**: Como quem mantém a plataforma, quero que `npm run db:seed` produza um ambiente já logável, com administrador, gestor e corretores em cada imobiliária, para poder exercitar papéis e atribuição sem cadastrar nada à mão.

**Why P1**: Com `brokers` removida do schema, o seed é o único caminho por onde corretor passa a existir. Sem ele, nem a atribuição por agenda nem o teste de vazamento entre corretores têm sujeito.

**Acceptance Criteria**:

1. WHEN o seed é executado THEN o sistema SHALL criar, em cada imobiliária, ao menos um usuário administrador, um gestor e dois corretores com janela de trabalho declarada.
2. The system SHALL criar os corretores do seed com janelas de trabalho distintas entre si, de modo que exista ao menos um horário coberto por apenas um deles.
3. WHEN o seed é executado THEN o sistema SHALL deixar os usuários criados em convite pendente, sem credencial de acesso definida, exceto o administrador criado pelo comando de bootstrap.
4. WHILE um usuário está em convite pendente o sistema SHALL mantê-lo elegível a receber lead e reunião normalmente.
5. WHEN o comando de bootstrap é executado para uma imobiliária e um e-mail THEN o sistema SHALL criar ou promover esse usuário a administrador dela, com senha definida, sem depender de envio de e-mail.
6. The system SHALL manter o seed determinístico e reproduzível, produzindo o mesmo estado a cada execução.
7. The system SHALL produzir todos os leads do seed sem responsável atribuído, exceto os que já nascem com reunião agendada.

**Independent Test**: Rodar `npm run db:seed`, executar o bootstrap, logar como administrador e ver os corretores criados com janelas diferentes na tela de usuários.

---

## Edge Cases

- IF o último administrador ativo de uma imobiliária tenta desativar a si mesmo THEN o sistema SHALL recusar a operação informando que a imobiliária precisa de ao menos um administrador.
- IF um usuário perde o papel corretor enquanto ainda tem leads atribuídos THEN o sistema SHALL preservar os leads atribuídos a ele e excluí-lo de novas atribuições.
- IF um corretor é desativado com reuniões futuras já marcadas THEN o sistema SHALL listar essas reuniões na confirmação de desativação, para que a escolha de destino de carteira seja feita com elas à vista.
- IF a sessão expira enquanto o usuário preenche um formulário THEN o sistema SHALL recusar o envio e redirecionar para o login, sem gravação parcial.
- IF um usuário autenticado numa imobiliária requisita um recurso de outra imobiliária pelo identificador THEN o sistema SHALL responder como recurso inexistente.
- WHEN um convite é aberto por alguém já autenticado com outra conta THEN o sistema SHALL encerrar a sessão corrente antes de ativar a conta convidada.
- IF a janela de trabalho de um corretor cobre o horário mas ele está desativado no instante do agendamento THEN o sistema SHALL excluí-lo dos candidatos.
- WHEN uma reunião é agendada exatamente no minuto de início ou de fim da janela de trabalho THEN o sistema SHALL considerar coberto apenas o intervalo integralmente contido na janela.

---

## Requirement Traceability

| Requirement ID | Story | Tasks | Status |
| -------------- | ----- | ----- | ------ |
| AUTH-01 | P1: O CRM fica atrás de login | T2, T5, T6, T7 | ✅ Verified |
| AUTH-02 | P2: Usuário recupera a própria senha | T32 | ✅ Verified |
| TENANT-01 | P1: O usuário pertence a uma ou mais imobiliárias | T3, T4, T7, T9, T10 | ✅ Verified |
| USER-01 | P1: Administrador gerencia os usuários da imobiliária | T19, T20, T22, T23 | ✅ Verified (com `SPEC_DEVIATION` na AC10) |
| USER-02 | P1: A desativação de um corretor decide o destino da carteira | T21, T22 | ✅ Verified |
| PERM-01 | P1: Cada papel enxerga e faz exatamente o que lhe cabe | T15, T16, T18 | ✅ Verified |
| SCOPE-01 | P1: O corretor enxerga só a própria carteira | T1 (pré-condição), T17, T18 | ✅ Verified |
| AGENDA-01 | P1: Corretor tem janela de trabalho declarada | T24, T25 (+ fix pós-Verifier: UI) | ✅ Verified |
| ATRIB-02 | P1: O lead ganha responsável no agendamento, por agenda e horário acordado | T12, T26, T27, T28, T29, T30 | ✅ Verified (AC8 parcial — depende de reunião real) |
| ATRIB-03 | P1: Lead escalado para humano nunca fica órfão | T26, T27, T28 | ✅ Verified |
| SEED-01 | P1: O seed nasce com usuários, papéis e agenda | T8, T11, T12, T13, T14, T31 | ✅ Verified (1 critério de ambiente aberto) |

**ID format:** `[CATEGORY]-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 11 total, **11/11 Verified (100%)**. As 33 tasks do lote mais 3 commits pós-Verifier (`33f09d9` fix do CLI de bootstrap; `d1430af` UI da janela de trabalho, gap 1; `1b41ca1` rate limit por e-mail, gap 2) estão com gate verde: **915 testes** em 75 arquivos, `npm run lint` 0 erros, `npm run build` exit 0, `npx tsc --noEmit` 0.

O Verifier independente (author ≠ verifier) rodou e retornou **PASS** — evidência completa em `validation.md` (75/75 ACs com citação `file:line`, sensor de discriminação 4/4 mutantes mortos). Dos 2 gaps Major que o Verifier levantou, os dois foram corrigidos depois (ver Ressalvas abaixo); os demais são parciais/de ambiente, não de código, e seguem registrados como tal.

`ATRIB-02` retoma deliberadamente a numeração da categoria `ATRIB` do lote-7: `ATRIB-01` ("lead real nasce com corretor responsável") é **substituída** por `ATRIB-02` deste lote, que move a atribuição da criação para o agendamento.

### Ressalvas conhecidas, por ID

Registradas aqui para que o Verifier as trate como gap conhecido, não como descoberta:

- **AGENDA-01** — a T25 entregou a server action e **a UI entrou depois**, como fix do Major #1 do Verifier. Administrador e gestor editam a janela de qualquer corretor pela ação de linha da tabela de Usuários (AC6); o próprio corretor edita a sua pelo rodapé da sidebar (AC1), que é a única superfície do CRM que ele alcança — Configurações e Usuários são vedadas ao papel dele pela matriz de permissões. Um diálogo só serve as duas, sobre a mesma `saveWorkWindowAction`.
- **AUTH-01** — a tela de login da T6 ficou sem verificação visual no Batch 1 (a extensão de navegador não alcançava o dev server na época). **Isso foi fechado agora**: a verificação da T32 abriu `/login` no navegador e o card renderiza corretamente, com o link "Esqueci minha senha". A T6 carregava um `SPEC_DEVIATION` vivo (rate limit do AC4 chaveado por **IP + rota**, não por e-mail). **Fechado**: o limite por e-mail entrou em `src/server/auth/login-attempts.ts` + `hooks` do better-auth, com contador no Postgres (`login_attempts`), provado por `src/server/auth/__tests__/login-attempts.test.ts` — 10 falhas do mesmo e-mail vindas de 10 IPs diferentes recusam a 11ª. O limite por IP continua ligado; os dois cobrem classes de ataque diferentes.
- **SEED-01** — o reseed e o bootstrap foram executados **pelo usuário** e conferidos por consulta ao banco (3 imobiliárias, papéis, janelas, 17 leads sem dono e 8 com). Fica aberto o desfecho ponta a ponta da T31: a credencial de serviço do n8n está com o valor **sem o prefixo `Bearer `** e responde 401, então "primeira mensagem no número de teste abre conversa nova" não pôde ser provado.
- **ATRIB-02** — a resolução do parâmetro `attendees` do nó do Google Calendar (expressão de campo inteiro que devolve array) não é exercitável por `test_workflow`, que fixa nós com credencial. Só uma reunião agendada de verdade fecha essa metade da AC8; as duas execuções da T30 (1721/1722) provam todo o resto da regra no fluxo publicado.
- **Fora de escopo por decisão registrada** — o smoke conversacional roteirizado segue deferido pela AD-015, e não é dívida deste lote.

---

## Success Criteria

- [ ] Nenhuma rota de aplicação em produção responde com dado de imobiliária a uma requisição sem sessão — verificável por requisição sem cookie a cada uma das cinco páginas do CRM.
- [ ] Um corretor logado não consegue, por tela nem por chamada direta, ler um lead que não é dele — provado por tentativa deliberada, não por ausência do botão.
- [ ] A imobiliária consegue adicionar e remover um usuário da equipe inteiramente pelo CRM, sem intervenção de quem mantém a plataforma.
- [ ] Toda reunião agendada após este lote tem responsável cuja janela de trabalho declarada cobre o horário da reunião.
- [ ] Nenhum lead escalado para humano fica sem responsável enquanto a imobiliária tiver ao menos um corretor ativo.
- [ ] `npm run db:seed` seguido do comando de bootstrap produz um ambiente logável, com os três papéis exercitáveis, sem nenhum cadastro manual.
