# PRD — Agente de IA SDR para Imobiliárias (WhatsApp + CRM)

## 0. Propósito deste documento

Este PRD é o contexto-base para o planejamento de specs via skill `tlc-spec-driven` (fase Specify). Ele fica no nível de produto/visão — não tenta antecipar requisitos testáveis, IDs de rastreabilidade ou tabela de fora-de-escopo por feature; isso é trabalho do Specify, feature a feature, usando este documento como referência.

## 1. Contexto e problema

- 78% dos leads imobiliários no Brasil chegam via WhatsApp; responder em menos de 5 minutos multiplica a conversão em até 9x comparado a 1 hora.
- Corretores adotam o WhatsApp pessoal como "CRM paralelo" por causa da lentidão dos CRMs tradicionais (relatos de +5s de carregamento por tela) — isso causa perda de governança sobre o funil e perda da carteira quando o corretor sai da empresa.
- Portais (ZAP/VivaReal) sincronizam inventário por arquivo XML com até 24h de latência — o lead esfria antes do primeiro contato humano.
- Ferramentas brasileiras (Zenvia, Umbler Talk, SocialHub, Kenlo, Jetimob) resolvem infraestrutura de mensageria e CRM genérico, mas não oferecem um agente de IA nativo de qualificação para o setor. Ferramentas americanas (Structurely, Ylopo, Roof.ai, B.Claw) fazem isso, mas custam caro e sofrem queixas recorrentes de "uncanny valley" — a IA finge ser humana, é descoberta, e quebra a confiança do lead.

## 2. Objetivo do MVP

Validar, com dois clientes-âncora reais (duas imobiliárias de Uberaba/MG, ambas atuando em imóveis novos e usados), se um agente de IA consegue qualificar leads via WhatsApp de forma conversacional e agendar reuniões qualificadas com o corretor responsável — reduzindo o tempo de primeira resposta e aumentando a proporção de leads que chegam à reunião com informação completa.

### 2.1 Visão além do MVP (não construir agora, só para contexto de design)

Piloto pago com cliente-âncora → productizar o que for repetível → abrir como SaaS multi-tenant self-service para outras imobiliárias. Arquitetura deve ser pensada com `tenant_id` desde o schema mesmo operando hoje só com dois clientes.

### 2.2 Abordagem de construção

O CRM é construído primeiro, de ponta a ponta, com **dados mockados** — o fluxo real do agente (WhatsApp + n8n) ainda não existe, nenhuma conta/teste foi feito. O CRM precisa ser desenhado com um contrato de integração explícito (interface/API bem definida para leads, status de pipeline, alertas de escalonamento e contexto por tenant) para que a substituição dos dados mockados pelos dados reais do agente, mais adiante, não exija redesenho — só troca de fonte de dados atrás da mesma interface.

## 3. Fora de escopo (v1)

- Banco vetorial / pipeline de RAG completo (ver 7.3 — v1 usa filtragem direta, sem embeddings).
- Áudio sintético / IA por voz.
- Lead scoring preditivo.
- Integração automática em tempo real com portais (ZAP/VivaReal).
- Cobrança/billing multi-cliente — é piloto pago negociado diretamente, não onboarding self-service.
- Onboarding self-service para clientes além dos dois pilotos.

## 4. Usuários

- **Gestor/dono da imobiliária**: configura o agente, acompanha o pipeline de leads.
- **Corretor**: recebe leads qualificados/agendados, atua no handoff e na reunião.
- **Lead/cliente final**: conversa com o agente pelo WhatsApp.

## 5. Clientes-piloto

- Duas imobiliárias em Uberaba/MG, ambas atuando com imóveis novos e usados. Relação pessoal (amigos do fundador) — atenção ao viés de complacência: buscar sinal real (uso de fato, números) e não só boa vontade.
- Baseline de cada imobiliária (volume de leads/mês, tempo médio de resposta hoje, taxa atual de lead→reunião) ainda não coletado — a levantar na reunião de apresentação da demo.

## 6. Fluxo funcional principal

1. Lead entra em contato via WhatsApp (contato direto ou vindo de anúncio/portal).
2. O agente de IA inicia a qualificação de forma conversacional (não é um formulário com perguntas fixas em sequência).
3. O agente identifica cedo a modalidade de interesse do lead (novo, usado, ou aberto aos dois) e ajusta as perguntas seguintes de acordo — novo e usado têm lógicas de qualificação diferentes (financiamento direto com construtora vs. financiamento bancário/FGTS, horizonte de 24-36 meses de obra vs. urgência de visita física).
4. Campos qualificados pelo agente: região pretendida, orçamento, tipo (casa/apartamento), modalidade (novo/usado), horizonte de tempo da compra, motivação (investidor vs. morador), status de crédito (pré-aprovado vs. recurso próprio/FGTS), operação casada (compra depende de vender o imóvel atual — sim/não). Comprovante de renda é bônus opcional, nunca bloqueante para o agendamento.
5. Quando os campos obrigatórios estão completos, o agente agenda a reunião com o corretor responsável e registra os dados coletados no CRM.
6. Quando o agente não consegue qualificar (respostas incoerentes, lead fora do perfil, hostilidade, ausência de resposta), o CRM recebe um alerta para intervenção humana.
7. O handoff para o corretor sempre inclui um resumo executivo estruturado da conversa e, quando for escalonamento por falha, o motivo específico da falha — nunca o transcript bruto como única entrega.

## 7. Requisitos por área

### 7.1 Agente conversacional (WhatsApp)

- Extração conversacional dos campos de qualificação — o agente decide dinamicamente o que ainda falta perguntar, não segue um roteiro fixo.
- Tom humano, natural, caloroso, sem soar robótico ou decorado.
- O agente não nega ser uma IA/assistente virtual se perguntado diretamente — isso vale tanto para o produto real quanto para o protótipo de demonstração.
- Nome/persona do agente configurável por imobiliária.

### 7.2 CRM / Telas principais

- **Configurações**: nome da imobiliária, nome/persona do agente, modalidade suportada (novos/usados/ambos), e uma visualização substancial (não exaustiva) dos documentos de contexto, com link para a página de Documentos completa.
- **Documentos**: página dedicada à gestão completa dos documentos de contexto usados pelo agente (upload, organização, exclusão) — acessível a partir de Configurações.
- **Pipeline de leads (Kanban)**: quadro com colunas por status (em qualificação / qualificado e agendado / escalado para humano). Abrir um lead mostra o detalhe: resumo executivo da conversa e, quando aplicável, o motivo do escalonamento.
- **Chats**: visualização das conversas entre o agente e os leads, por imobiliária (mockadas até a Fase de integração real).
- **Dashboard**: KPIs operacionais do piloto (ver 7.7).

### 7.3 Contexto do agente (conhecimento por cliente)

- v1 sem banco vetorial: contexto filtrado por `tenant_id` + modalidade (novo/usado) e injetado diretamente no prompt da conversa.
- Acesso ao contexto isolado atrás de uma interface única (ex.: `getContext(tenant_id, modalidade, pergunta)`), permitindo trocar a implementação por busca vetorial (ex.: pgvector sobre o mesmo Postgres do CRM) no futuro sem alterar quem consome essa função.
- Documentos e contexto de um tenant nunca são acessíveis a outro tenant.

### 7.4 Compliance (LGPD)

- Papéis: a plataforma atua como Operadora de Dados; a imobiliária, como Controladora.
- Tratamento de opt-out (palavras como "SAIR"/"PARAR") interrompe qualquer disparo automático subsequente imediatamente.
- Documentos financeiros enviados por leads (ex.: comprovante de renda) têm TTL de 30–60 dias e exclusão automática programada.
- Isolamento estrito de dados entre tenants (ver 7.3).

### 7.5 Transparência do agente

- No produto real: configurável por imobiliária — é uma decisão de marca/posicionamento de cada cliente, não algo a impor.
- No protótipo/demo: tom o mais humano possível na fluidez e naturalidade da conversa, mas sem negar ser uma IA se perguntado diretamente.

### 7.6 Stack técnica (requisitos de implementação)

- **Obrigatórias**: Next.js (framework), componentes da lib Astryx, Zustand (gerenciamento de estado), hospedagem na Vercel.
- **Opcionais** (a critério de quem implementa, avaliar se cabe em cada fase): Drizzle ORM, Neon Postgres, better-auth.
- Outras stacks podem ser sugeridas durante a implementação quando fizer sentido para uma fase específica — não é uma lista fechada.

### 7.7 Dashboard — KPIs sugeridos

- Tempo médio até a primeira resposta ao lead.
- Volume de leads no período (total e por dia/semana).
- Taxa de qualificação (leads qualificados e agendados ÷ total de leads).
- Taxa de escalonamento para humano (saúde operacional do agente).
- Taxa de comparecimento à reunião agendada (depende de confirmação do corretor — não é algo que o agente sabe sozinho).
- Distribuição de leads por modalidade (novo/usado) e por motivação (investidor/morador).
- Comparação com o baseline pré-piloto de cada imobiliária, quando disponível.

Ponto de partida, não lista fechada — ajustar depois de ver o pipeline real rodando.

### 7.8 Templates Astryx a avaliar antes de construir do zero

A lib Astryx inclui templates prontos que provavelmente cobrem parte destas telas — checar antes de implementar componente customizado: `kanban-board` (Pipeline de leads) e `ai-chat` (tela de Chats). Se a Astryx não tiver componentes de gráfico para o Dashboard, uso parcial do Shadcn (ou outra lib que fizer sentido no momento da implementação) está autorizado.

## 8. Métricas de sucesso do piloto

- Tempo médio até a primeira resposta ao lead.
- Proporção de leads que chegam a uma reunião agendada com informação completa.
- Comparação com o baseline de cada imobiliária (a coletar na reunião da demo).

## 9. Riscos e hipóteses em aberto

- Pedir status de pré-aprovação de crédito cedo na conversa pode aumentar a taxa de abandono — a observar com os dois clientes-piloto.
- Tolerância de cada imobiliária ao grau de transparência do agente em produção — decisão caso a caso, não assumir uma resposta única.
- Estratégia de integração com portais (tempo real via webhook vs. atrás do ERP existente) — depende da tolerância operacional de cada cliente, não decidido.
- As estimativas de custo de LLM/infraestrutura do relatório de pesquisa de mercado citam uma fonte não verificável (URL desconhecida) — não usar esses números em projeção financeira sem recalcular com preços públicos de API (Meta, provedores de LLM).

## 10. Referências

- Relatório de pesquisa de mercado (Gemini Deep Research) anexado nesta sessão — usar com ressalva nas seções de custo e nas citações 27–30 (fontes desconexas do tema).
- Pesquisa inicial de mercado desta sessão: cases de SDR de IA no WhatsApp para imobiliárias, panorama de concorrentes, benchmarks de precificação, custos da API oficial do WhatsApp Business.

## 11. Próximos passos

- Registrar as decisões estratégicas centrais em `.specs/STATE.md` antes de iniciar o Specify: piloto pago com clientes-âncora, arquitetura com `tenant_id` desde o dia 1, as duas imobiliárias-piloto exigem suporte a novos e usados desde o MVP.
- Rodar Specify (`tlc-spec-driven`) feature a feature a partir deste documento, começando pelo fluxo do agente conversacional (seção 7.1) e pelo painel de configuração (seção 7.2).
