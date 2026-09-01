# Lote 8 — Usuários, papéis e atribuição por agenda Context

**Gathered:** 2026-08-23
**Spec:** `.specs/features/lote-8-usuarios-papeis-atribuicao/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Autenticação real no CRM (login, sessão, proteção de rotas), modelo de usuários multi-tenant com os papéis administrador / gestor / corretor e permissões aplicadas server-side, gestão de usuários pelo administrador (convite, papéis, desativação com destino da carteira), janela de trabalho declarada por corretor, e a mudança do momento da atribuição de lead — da criação para o agendamento, escolhendo entre quem tem agenda livre no horário acordado com o lead, com uma rede de segurança no escalonamento para que nenhum lead fique órfão.

Fica fora: atendimento humano pelo Chats, página de Agenda, vínculo de conta Google e login com Google.

---

## Implementation Decisions

### Autenticação

- Login completo com **better-auth**: e-mail + senha, sessão, `proxy.ts` protegendo o CRM inteiro (Next 16 deprecou `middleware.ts`), e **convite por e-mail** para o administrador criar gestor e corretor.
- A imobiliária ativa passa a vir do vínculo do usuário autenticado; o cookie continua existindo como mecanismo, mas é validado contra os vínculos reais e ignorado quando aponta para fora deles.
- O contrato de integração (`/api/v1/**`) fica **inalterado**: segue na credencial de serviço com `X-Crivo-Tenant` (SEC-01 do lote-7). Login de usuário e credencial de serviço são caminhos independentes.

### Modelo de usuário e imobiliária

- **Usuário multi-tenant**: o vínculo usuário↔imobiliária é entidade própria, com papéis por vínculo. Escolhido pelo usuário sobre o modelo de conta única por imobiliária, com o argumento de que um corretor atuando em duas casas precisaria de duas contas — e, no pacote Google futuro, de duas contas Google.
- Consequência boa e não planejada: a demo das três imobiliárias do seed continua funcionando sem "conta de operação" acima do tenant — basta que a conta de quem demonstra tenha os três vínculos.
- **Corretor é sempre um usuário.** `brokers` sai do schema; todo corretor tem papel corretor e credencial. Os corretores renascem pelo seed como usuários em convite pendente, e seguem elegíveis a receber lead e reunião antes de aceitar o convite.
- **Sem migração de dado** (decisão do usuário, 2026-08-23): nenhum lead do banco é real — são seed determinístico ou conversas de teste do próprio autor. A arquitetura é escrita como se nascesse agora, e o reseed é o caminho de convergência. Consequência direta: `leads.brokerId` é **renomeada** para `assignedUserId` em vez de manter o nome antigo apontando para `users` — o rename é barato porque a coluna nunca sai do CRM (ausente do contrato v1 e de todo o `n8n/`, verificado).
- O e-mail é a identidade global do usuário — único no sistema inteiro, não por imobiliária.

### Papéis e permissões

Papéis acumuláveis, com **união de permissões** (o mais permissivo vence).

| | Dashboard | Pipeline | Chats | Documentos | Configurações | Usuários |
| --- | --- | --- | --- | --- | --- | --- |
| **Administrador** | tudo | tudo | tudo | CRUD | editar | gerencia todos |
| **Gestor** | tudo | tudo | tudo | CRUD | editar | — |
| **Corretor** | própria carteira | própria carteira | própria carteira | leitura | — | — |

- **Gestor edita Configurações do agente e Documentos.** O que separa administrador de gestor é exclusivamente a gestão de usuários e papéis (decisão do usuário).
- Permissão é recusada **no servidor**, não apenas escondida na tela; a navegação oculta o que o vínculo ativo não pode acessar, mas a recusa não depende disso.
- Negativa de permissão gera log estruturado (usuário, imobiliária, recurso) — a única observabilidade nova do lote.

### Agenda e atribuição

- **Fonte da disponibilidade: janela de trabalho declarada no CRM** (dias ISO 1–7 + `HH:MM` início/fim, America/Sao_Paulo — mesmo formato de `meetingDays`/`meetingHoursStart` que o tenant já tem). Nada de Google neste lote.
- **Preferência do lead = horário/turno que ele pede.** Não há campo novo: o agente já negocia um horário concreto com o lead antes de agendar, e esse horário é o insumo da escolha do corretor.
- **O lead só ganha dono no agendamento** (decisão do usuário). Durante a qualificação ele fica sem responsável — e, por isso, invisível para quem tem apenas o papel corretor, visível para administrador e gestor.
- **Rede de segurança no escalonamento**: lead escalado para humano antes de qualificar recebe responsável na mesma operação que grava o status, para não ficar órfão. Regra: menor carga entre os corretores em janela naquele instante; se nenhum estiver em janela, menor carga entre todos.
- Quem escolhe o corretor é o **CRM, server-side**, no mesmo endpoint que registra o agendamento — o agente informa o horário e recebe de volta quem ficou. A lista de corretores nunca é exposta ao modelo (AD-018: quem detém a regra decide).
- O evento do Google Calendar continua no calendário único da imobiliária; o corretor atribuído entra como **convidado**, pelo e-mail.
- Isso **substitui** a política do lote-7 (`ATRIB-01`: menor carga na criação). `src/lib/broker-assignment.ts` já foi escrito como ponto de extensão exatamente para isto.

### Desativação de usuário

- Desativar um corretor com leads ativos **abre a escolha na hora** (decisão do usuário): transferir para um corretor específico, redistribuir pela política, ou manter como está com sinalização de responsável inativo.
- Usuário desativado nunca é apagado: perde acesso, sai das listas de atribuição, mas continua nomeado no histórico.

### Agent's Discretion

- **Escopo de leitura do corretor: só os próprios leads.** O usuário gostou tanto de "só os próprios" quanto de "próprios por padrão, com alternar" e delegou a decisão pedindo o padrão de mercado. Escolhido "só os próprios": é o default do Salesforce (OWD privado em Leads + hierarquia de papéis), do Pipedrive (grupos de visibilidade: dono + gestores) e dos CRMs imobiliários; e é o único dos dois que ataca a "perda da carteira quando o corretor sai" que o PRD levanta como dor — a opção com alternar organiza a tela mas não protege nada, porque a permissão de leitura ampla continua concedida.
- Provedor de e-mail do convite: **Resend** (padrão do ecossistema Next/Vercel, integração direta com better-auth).
- Bootstrap do primeiro administrador de uma imobiliária: comando de linha da mesma família do `npm run db:seed`, nunca tela pública (AD-001).
- Duração de sessão (7 dias), política de senha (mínimo 8) e validade de convite (7 dias) nos padrões da biblioteca, em vez de números inventados.
- Granularidade do slot de reunião: 30 minutos, que é o que o fluxo já produz hoje.
- Arquitetura escolhida entre três apresentadas: **plugin `organization` do better-auth mapeado sobre a `tenants` existente** (`modelName`/`fields`), em vez de tabelas paralelas ou vínculo caseiro — mantém a imobiliária como identidade única, que é do que o isolamento da AD-002 depende.
- Mesmo sem migração, o grep completo dos consumidores de `leads.brokerId` continua sendo a primeira task da fase que renomeia a coluna — é literalmente a lição L-015 do lote-7.

### Declined / Undiscussed Gray Areas → Assumptions

Nenhuma área cinzenta foi recusada. Tudo o que não foi decidido em conversa está registrado na tabela **Assumptions & Open Questions** da spec com default escolhido e justificativa — em especial: provedor de e-mail, bootstrap do primeiro administrador, semântica de papéis acumuláveis, destino dos corretores já cadastrados, nome da coluna de responsável em `leads`, estado do ambiente de teste após o reseed, granularidade do slot, fuso horário, local do evento no Calendar, regra de atribuição no escalonamento, duração de sessão e senha, validade do convite, efeito da desativação sobre a conta, quem edita a janela de trabalho de terceiros, e visibilidade do tenant `Crivo Demo`.

---

## Specific References

- **Padrão de mercado é critério explícito de decisão** do usuário quando ele delega uma escolha — foi assim que o escopo de leitura do corretor foi resolvido.
- O usuário levantou espontaneamente o cenário "corretor trabalha em duas imobiliárias" como argumento decisivo contra conta por imobiliária, incluindo a consequência sobre a conta Google no pacote futuro.
- O usuário pediu explicitamente que o lead escalado antes de qualificar **não fique órfão**, ao escolher "o lead só ganha dono no agendamento".

---

## Deferred Ideas

- **Pacote Google (lote futuro, pedido nesta conversa)**: vínculo *opcional* de conta Google por usuário, com duas vantagens vendidas na própria tela — controle maior sobre a agenda daquele usuário (considerando compromissos fora do CRM) e login com a conta Google — **mais uma página nova de Agenda**, onde o usuário vê todos os compromissos dele em layout de calendário. A página de Agenda foi deliberadamente adiada para nascer junto com esse vínculo, em vez de nascer com o dado do CRM e depois trocar de fonte.
- **Atendimento humano pelo Chats** (corretor responde o lead pelo CRM, mensagem gravada com autoria humana). Continua sendo o que fecha o buraco do escalonamento e cumpre a premissa da AD-017. Depois deste lote, a autoria humana finalmente tem usuário a quem apontar — a dependência que faltava.
- **Atribuição por região ou especialidade do corretor** — mencionada como opção de preferência do lead e não selecionada; exigiria cadastrar regiões e modalidades por corretor.
- **Auditoria completa** (log de toda ação de todo usuário) — este lote registra só negativa de permissão.
- **2FA/MFA** — better-auth suporta adicionar depois sem redesenho.
- Herdadas do lote-7 e ainda em aberto: opt-out por linguagem natural, baselines reais por tenant (Fase 10/L9), segundo número de teste do WhatsApp, migração do modelo do agente para `gpt-5-nano`.
