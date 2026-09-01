# Roadmap de Fases Épicas — CRM Imobiliário (mock-first, agente integrado depois)

## Como usar este documento

Cada fase abaixo é uma definição macro, deliberadamente aberta — não uma spec. A ideia é alimentar cada uma, na ordem, ao `tlc-spec-driven` (comando Specify), usando o PRD (`PRD - Agente IA SDR Imobiliario.md`) como contexto de fundo. A própria skill decide, por fase, a profundidade necessária (Specify → Design → Tasks → Execute, auto-dimensionado) — este documento não antecipa isso.

Recomendação: rode as duas ou três primeiras fases manualmente (sem harness/automação por cima), para calibrar onde a skill precisa de você antes de pensar em automatizar o ciclo entre fases.

## Premissa que mudou o roadmap

O fluxo do agente (n8n + WhatsApp) ainda não existe — nenhuma conta criada, nenhum teste feito. Por isso o CRM é construído **inteiro com dados mockados primeiro**, com um contrato de integração explícito desde o início, para que a troca do mock pelos dados reais do agente seja uma substituição de fonte, não um redesenho.

## Stack técnica (vale para todas as fases do CRM)

- **Obrigatórias**: Next.js, componentes da lib Astryx, Zustand, hospedagem na Vercel.
- **Opcionais** (avaliar por fase): Drizzle ORM, Neon Postgres, better-auth.
- Sugestões de stack adicionais são bem-vindas quando fizer sentido numa fase específica.
- **Antes de construir qualquer tela do zero, checar se a Astryx já tem um template pronto.** Dois já identificados: `kanban-board` (Fase 4) e `ai-chat` (Fase 6). Se a Astryx não cobrir gráficos (Fase 5 — Dashboard), uso parcial do Shadcn ou outra lib sugerida no momento está autorizado.

## Restrições transversais

- **Isolamento multi-tenant**: `tenant_id` no modelo de dados desde a Fase 1, mesmo com dado mockado.
- **LGPD**: mecanismo (TTL de documentos, tratamento de opt-out) desenhado desde o contrato de integração (Fase 7), só fica *testável de verdade* a partir da Fase 9, quando dado real passa a fluir.

## Fases do CRM

### Fase 1 — Fundação técnica do CRM (stack + dados mockados)
Setup do projeto com a stack obrigatória, modelo de dados multi-tenant (`tenant_id` desde o schema) e seed de dados mockados representando leads, conversas e imobiliárias fictícias. Sem nenhuma integração real de WhatsApp ou agente nesta fase — é a fundação onde todas as telas seguintes se apoiam.
**Depende de:** nada.

As Fases 2 a 6 são telas que consomem o mesmo dado mockado da Fase 1 — podem ser construídas em qualquer ordem ou em paralelo entre si.

### Fase 2 — Configurações da imobiliária
Nome da imobiliária, nome/persona do agente, modalidade suportada (novos/usados/ambos), e uma visualização substancial (não exaustiva) dos documentos de contexto, com link para a página de Documentos completa (Fase 3).
**Depende de:** Fase 1.

### Fase 3 — Página de Documentos
Gestão completa dos documentos de contexto usados pelo agente: upload, organização, exclusão. Acessível a partir de Configurações (Fase 2) e como página própria.
**Depende de:** Fase 1.

### Fase 4 — Pipeline de leads (Kanban)
Quadro kanban com colunas por status (em qualificação / qualificado e agendado / escalado para humano). Abrir um lead mostra o detalhe: resumo executivo da conversa e, quando aplicável, o motivo do escalonamento. Avaliar o template `kanban-board` da Astryx antes de construir do zero.
**Depende de:** Fase 1.

### Fase 5 — Dashboard
KPIs operacionais do piloto sobre dado mockado (ver PRD, seção 7.7): tempo médio de primeira resposta, volume de leads no período, taxa de qualificação, taxa de escalonamento para humano, taxa de comparecimento à reunião, distribuição por modalidade e por motivação, comparação com baseline quando disponível. Se a Astryx não tiver componentes de gráfico, uso parcial do Shadcn (ou outra lib sugerida) está autorizado.
**Depende de:** Fase 1.

### Fase 6 — Chats
Visualização das conversas (mockadas nesta fase) entre o agente e os leads, por imobiliária. Avaliar o template `ai-chat` da Astryx antes de construir do zero.
**Depende de:** Fase 1.

### Fase 7 — Contrato de integração CRM ↔ Agente
Definição da interface (API/webhook) que o futuro fluxo do agente vai usar para: entregar leads qualificados, atualizar status no pipeline (Fase 4), alimentar a tela de Chats (Fase 6), disparar alertas de escalonamento e ler o contexto/documentos configurados na Fase 3. Esse contrato é o que permite trocar o mock pelo dado real sem redesenhar o CRM — e é onde os mecanismos de LGPD (TTL, opt-out) precisam ser desenhados, mesmo que só testáveis mais adiante.
**Depende de:** Fases 2 a 6.

### Fase 8 — Fluxo do agente no n8n + conectividade real com WhatsApp *(fora do CRM, mas destrava a Fase 9)*
Construção do fluxo de qualificação conversacional no n8n, conectado à API oficial do WhatsApp Business, consumindo e alimentando dados através do contrato da Fase 7. Não é uma fase de "criação do CRM" — é a contraparte externa que este roadmap precisa esperar antes da Fase 9.
**Depende de:** Fase 7.

### Fase 9 — Substituição do mock pelos dados reais
Troca dos dados mockados pelos dados reais entregues pelo agente via contrato da Fase 7, validando o CRM ponta a ponta (Kanban, Chats, Dashboard, Documentos) com um número de WhatsApp de teste. A partir daqui os mecanismos de LGPD desenhados na Fase 7 passam a ser testáveis de verdade.
**Depende de:** Fases 2 a 6, Fase 8.

### Fase 10 — Instrumentação de métricas e preparação para a demo/piloto
Dashboard (Fase 5) passa a refletir dados reais em vez de mockados; captura de tempo até a primeira resposta, taxa de qualificação e comparecimento à reunião para comparar com o baseline de cada imobiliária levantado na reunião de apresentação.
**Depende de:** Fase 9.

## Observação

As Fases 1 a 7 já dão um CRM navegável e demonstrável com dados mockados — inclusive para a demo com os dois clientes-piloto, se a Fase 8/9 (agente real) ainda não estiver pronta a tempo. Os "riscos e hipóteses em aberto" do PRD (seção 9) provavelmente geram `discuss.md` no Specify de mais de uma fase, principalmente na Fase 7 (contrato/estado) e na Fase 8 (chamadas externas).
