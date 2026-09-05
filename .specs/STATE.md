# STATE

## Decisions

### AD-001
- **Decision**: MVP é piloto pago negociado diretamente com dois clientes-âncora (imobiliárias de Uberaba/MG) — sem billing multi-cliente nem onboarding self-service.
- **Reason**: Validar o produto com sinal real (uso e números) antes de productizar como SaaS.
- **Trade-off**: Funcionalidades de self-service e cobrança ficam fora do v1; retrabalho futuro aceito conscientemente.
- **Scope**: Todo o produto (todas as fases do roadmap).
- **Date**: 2026-08-01
- **Status**: active

### AD-002
- **Decision**: Arquitetura multi-tenant com `tenant_id` presente no modelo de dados desde o primeiro schema, mesmo operando com apenas dois clientes.
- **Reason**: A visão pós-MVP é SaaS multi-tenant self-service; adicionar tenancy depois exigiria migração de todo o modelo.
- **Trade-off**: Pequeno overhead de modelagem e filtragem em toda query desde o dia 1.
- **Scope**: Modelo de dados, camada de acesso a dados, contrato de integração (todas as fases).
- **Date**: 2026-08-01
- **Status**: active

### AD-003
- **Decision**: Suporte às modalidades imóveis novos E usados desde o MVP, com lógicas de qualificação distintas por modalidade.
- **Reason**: Ambas as imobiliárias-piloto atuam nas duas modalidades; um MVP de modalidade única não seria adotado.
- **Trade-off**: Maior complexidade no fluxo de qualificação e no contexto do agente já no v1.
- **Scope**: Agente conversacional, contexto por tenant, telas de configuração e pipeline.
- **Date**: 2026-08-01
- **Status**: active

### AD-004
- **Decision**: CRM construído inteiro com dados mockados primeiro (mock-first), atrás de um contrato de integração explícito; a troca pelo dado real do agente (Fase 9) é substituição de fonte de dados, nunca redesenho de telas.
- **Reason**: O fluxo real do agente (n8n + WhatsApp) ainda não existe — nenhuma conta criada, nenhum teste feito.
- **Trade-off**: Esforço extra em desenhar interface/contrato antes de existir consumidor real.
- **Scope**: Todas as telas do CRM (Fases 1–6), contrato da Fase 7, substituição na Fase 9.
- **Date**: 2026-08-01
- **Status**: active

### AD-005
- **Decision**: Stack obrigatória: Next.js, componentes da lib Astryx, Zustand, hospedagem Vercel. Opcionais avaliados por fase: Drizzle ORM, Neon Postgres, better-auth. Antes de construir qualquer tela do zero, checar template Astryx pronto (`kanban-board`, `ai-chat`); Shadcn autorizado parcialmente para gráficos se Astryx não cobrir.
- **Reason**: Requisito de implementação definido no PRD (§7.6, §7.8).
- **Trade-off**: Dependência de lib de componentes específica; avaliação de template adiciona um passo antes de cada tela.
- **Scope**: Todas as fases do CRM.
- **Date**: 2026-08-01
- **Status**: active

### AD-006
- **Decision**: O roadmap de 10 fases é executado em 8 lotes sequenciais, cada lote = um ciclo completo da skill tlc-spec-driven (Specify → Design → Tasks → Execute): L1=[F1], L2=[F2+F3], L3=[F4+F6], L4=[F5], L5=[F7], L6=[F8], L7=[F9], L8=[F10].
- **Reason**: Agrupamento por coesão funcional e dependências, respeitando o orçamento de ~7-8 tasks por batch de execução da skill; F2+F3 são acopladas (Configurações linka Documentos), F4+F6 consomem os mesmos dados de leads/conversas e têm templates Astryx prontos.
- **Trade-off**: Lotes com 2 fases podem acionar oferta de sub-agentes se tasks.md exceder o orçamento de um batch.
- **Scope**: Sequenciamento de todo o roadmap.
- **Date**: 2026-08-01
- **Status**: amended by AD-020

### AD-007
- **Decision**: Padrão de consumo de dados do CRM: RSC-first — Server Components chamam a camada de acesso a dados (`src/server/data/*`) diretamente; tenant ativo em cookie (`crivo_tenant`) como fonte de verdade, espelhado em Zustand no client; Cache Components do Next 16 desabilitado (render dinâmico por request).
- **Reason**: Menos código, credenciais/queries fora do bundle client, dado sempre fresco — e o cookie é o único mecanismo de persistência de tenant legível pelo servidor.
- **Trade-off**: Telas interativas (Kanban drag-drop, chat) precisarão combinar RSC para carga inicial + client components com server actions para mutação.
- **Scope**: Todas as telas do CRM (Fases 2–6); a Fase 7 pode introduzir route handlers para o contrato externo sem alterar este padrão interno.
- **Date**: 2026-08-01
- **Status**: amended by AD-021 (cai só a metade "tenant ativo em cookie como fonte de verdade": a fonte passa a ser o `activeOrganizationId` da sessão autenticada. RSC-first, DAL direta e Cache Components desabilitado continuam ativos e inalterados)

### AD-008
- **Decision**: Lucide-Animated (https://lucide-animated.com/) é a lib de ícones oficial do projeto. Ícones são instalados individualmente via shadcn CLI (`npx shadcn@latest add "https://lucide-animated.com/r/<nome>.json"`) como componentes locais em `src/components/icons/` (client components, dependência `motion`); nenhuma outra lib de ícones nem SVG ad-hoc é permitida. Páginas já criadas recebem retrofit (Lote 3); novas páginas usam desde o início.
- **Reason**: Projeto começou sem lib de ícones definida; usuário definiu o padrão em 2026-08-02.
- **Trade-off**: Ícones são client components (animação via Motion) — sempre folhas na árvore RSC; dependência `motion` adicionada ao bundle.
- **Scope**: Todo o CRM, a partir do Lote 3.
- **Date**: 2026-08-02
- **Status**: superseded by AD-011 (2026-08-03)

### AD-009
- **Decision**: Recharts é a lib de gráficos oficial do projeto, sempre tematizada via hook `useTheme` da Astryx (tokens em JS — nenhum hex cru), em client components. Padrão derivado do template oficial `dashboard` da Astryx (a lib não tem componentes de gráfico próprios; confirmado via CLI em 2026-08-02). O fallback Shadcn autorizado no PRD §7.8 fica dispensado.
- **Reason**: AD-005 exige checar Astryx primeiro; o caminho sancionado pelo próprio template da Astryx é Recharts + tokens.
- **Trade-off**: Gráficos são sempre client components; dependência `recharts` no bundle.
- **Scope**: Dashboard (Lote 4 / Fase 5) e qualquer gráfico futuro (Fase 10).
- **Date**: 2026-08-02
- **Status**: active

### AD-010
- **Decision**: A lib Astryx é mantida como lib de componentes do CRM (Shadcn descartada) e o produto adota o shell SideNav-only (identidade do tenant no header da sidebar via `SideNavHeading`, sem TopNav) como padrão. Redesign das telas é feito por recomposição in-place sobre os componentes/DAL existentes — nunca rebuild por template.
- **Reason**: Validação técnica (2026-08-02, CLI `astryx component/template` + https://astryx.atmeta.com) confirmou que 100% dos layouts de referência do usuário são compostos com componentes existentes da lib — o gap das telas atuais é de uso/composição, não de capacidade da lib. O usuário valoriza sair do padrão visual Shadcn do mercado. A própria doc da Astryx desaconselha SideNavHeading + TopNav simultâneos.
- **Trade-off**: Fidelidade à referência limitada aos tokens padrão da Astryx (sem theming custom por ora); dependência da lib segue (mitigada por `swizzle` para casos extremos).
- **Scope**: Todas as telas do CRM, desta feature em diante.
- **Date**: 2026-08-02
- **Status**: active

### AD-011
- **Decision**: `lucide-react` é a lib de ícones oficial do projeto, importada direto do pacote (`import { HomeIcon } from "lucide-react"`). Substitui a AD-008: nenhum ícone é mais vendorizado em `src/components/icons/`, e a dependência `motion` sai do projeto. Movimento passa a ser responsabilidade da camada de transição de estado do `globals.css` (tokens `--duration-*`/`--ease-*` da Astryx), não de cada ícone.
- **Reason**: Decisão do usuário (2026-08-03) por ícones estáticos padrão. Além da preferência: os componentes do lucide-animated envolviam o `<svg>` num `<div>`, violando o self-check Astryx do AGENTS.md — só passavam por serem arquivos vendorizados. A troca eliminou 2.371 linhas e 0 wrappers restaram.
- **Trade-off**: Perde-se a animação de traço no hover dos ícones; o feedback de hover passa a vir do container (item de navegação, botão), que é o padrão de produto sério e custa uma transição de 175ms em vez de um componente Motion por ícone.
- **Scope**: Todo o CRM, a partir de 2026-08-03.
- **Date**: 2026-08-03
- **Status**: active

### AD-012
- **Decision**: `@astryxdesign/core/tailwind-theme.css` é importado no `globals.css` na ordem de layers documentada pela lib. Utilities token-backed (`text-blue-vivid`, `bg-surface`, …) são o escape hatch sancionado quando não existe prop de componente para o efeito desejado — nunca hex/px cru, nunca `style={{}}`.
- **Reason**: O AGENTS.md já mandava usar essas utilities, mas a ponte nunca tinha sido importada, então elas não existiam — o que forçou todo o CRM a ser feito só com props de componente e deixou casos como "cor por KPI" sem saída idiomática (`NavIcon` só aceita a prop `icon`).
- **Trade-off**: Depender dos nomes de classe da ponte; mapas literais são obrigatórios porque o Tailwind v4 só gera a utility que encontra escaneando o código-fonte (string interpolada não funciona).
- **Scope**: Todas as telas do CRM.
- **Date**: 2026-08-03
- **Status**: active

### AD-013
- **Decision**: `application/problem+json` (RFC 9457) com extensão `code` (identificador estável da regra violada, ex.: `transicao-invalida`, `lead-travado-por-humano`) é o formato de erro padrão de toda API HTTP externa do produto — não só do lote-5. Implementado uma vez em `src/server/integration/problem.ts` (`problem()` + `ProblemCode`) e reusado por todas as rotas `/api/v1/*` e `/api/cron/*`.
- **Reason**: Delegado ao agente no discuss do L5 ("você decide"); consolidado no Execute porque o padrão se provou consistente nas 7 rotas do contrato e é vendor-neutral/portável para o futuro microserviço (requisito de desacoplamento do usuário, INT-08).
- **Trade-off**: Qualquer API HTTP externa futura do produto deve adotar `problem.ts` (ou equivalente) para ficar consistente; não se aplica a erros internos de RSC/server actions (fora do escopo desta AD).
- **Scope**: Toda API HTTP externa do produto, a partir do lote-5.
- **Date**: 2026-08-03
- **Status**: active

### AD-014
- **Decision**: Nenhum commit deste repositório pode incluir a trailer `Co-Authored-By: Claude ...` (nem qualquer outra marca de autoria/atribuição do Claude, ex.: "Generated with Claude Code") na mensagem. O passo de apendar essa trailer, presente por padrão no fluxo de commit do harness, deve ser omitido deliberadamente em todo `git commit` feito neste repositório.
- **Reason**: Preferência explícita do usuário (2026-08-05), reafirmada após reescrever os 83 commits do histórico remoto (`filter-branch` + `push --force` em `origin/main`) especificamente para remover essas trailers (e a pasta `.specs`) — reintroduzi-las contradiria o motivo da reescrita.
- **Trade-off**: Diverge do template padrão de commit do harness Claude Code; exige checar a mensagem antes de cada commit para garantir que a trailer não foi incluída.
- **Scope**: Todos os commits deste repositório, doravante (não retroativo — histórico já reescrito).
- **Date**: 2026-08-05
- **Status**: active

### AD-014
- **Decision**: Todo trabalho de n8n do produto é **workflow-as-code**: fonte no repo (`n8n/workflows/` em código SDK + camada de decisão determinística pura em `n8n/src/` com testes vitest), publicação gerada de forma reproduzível (`n8n/generated/` → instância via MCP/SDK), UI do n8n nunca editada à mão. Efeitos colaterais (escritas no CRM, eventos de calendário, envios de mensagem) **nunca são decididos autonomamente por LLM** — toda saída de modelo passa por validação determinística (whitelist dos enums do contrato) antes de produzir qualquer efeito.
- **Reason**: Verificabilidade (Verifier evidence-or-zero exige artefato versionado e testável) e compliance (LGPD/trava humana/máquina de estados são invariantes de código, não instruções de prompt). Escolha da Abordagem A no design do lote-6, delegada pelo usuário ("você decide") em 2026-08-05.
- **Trade-off**: Mais plumbing que um AI Agent autônomo com tools; conversa depende da qualidade do prompt, não da autonomia do agente; sync repo↔instância é um passo a mais.
- **Scope**: Todo fluxo n8n do produto (Fases 8–10 e além).
- **Date**: 2026-08-05
- **Status**: superseded by AD-018 (parcial — só a metade "efeitos colaterais nunca decididos autonomamente por LLM"; a metade workflow-as-code em si — fonte no repo, `n8n/generated/` reproduzível, UI nunca editada à mão — continua ativa e preservada literalmente por AD-018)

### AD-015
- **Decision**: O smoke conversacional roteirizado do lote-6 (T13 original: 3 conversas reais no WhatsApp — qualificar→agendar, escalar, opt-out — com screenshots do CRM e evidência do evento no Calendar) é **deferido para um lote futuro dedicado**, a ser especificado quando a qualidade das respostas do agente (Gemini + prompt) estiver madura o suficiente para sustentar um roteiro de demonstração. T13 é reduzido, para efeito de fechamento deste lote, ao que não depende de conversação real: gate build final (`vitest`+`lint`+`build`), diff `n8n/generated/` == export da instância, e atualização honesta da rastreabilidade (spec.md/tasks.md) refletindo o que foi de fato provado hoje — execução real única (round-trip completo via webhook, sem roteiro), execuções via MCP com fixtures, e o sensor de discriminação de nível de nó (T11) — não os 3 desfechos completos do roteiro original.
- **Reason**: Decisão explícita do usuário (2026-08-09): "o agente ainda não está legal para gerar exemplos de conversação" e "esse lote já se estendeu mais do que o necessário". O lote extrapolou o escopo planejado com uma sessão extensa de depuração ao vivo (webhook/subscribed_apps da Meta, nono dígito brasileiro, referências quebradas de Switch em 6 nós) — trabalho não previsto no tasks.md original, mas necessário para a conectividade real funcionar. Fechar agora evita alongar ainda mais uma sessão já longa; a validação conversacional completa fica para quando o prompt/persona estiver pronto para isso.
- **Trade-off**: AGT-04 (agendamento), AGT-05 (escalonamento) e o desfecho ponta-a-ponta de LGPD-03 (opt-out) ficam sem prova de execução real completa neste lote — só evidência técnica (execução MCP + testes + 1 round-trip real sem roteiro). O Verifier deste lote deve tratar isso como gap conhecido e esperado, não como falha de cobertura a ser re-testada às pressas. A Fase 9 (L7, troca do mock pelo dado real) ou um lote interstitial dedicado precisa incorporar esse smoke antes do piloto real com imobiliárias.
- **Scope**: Fechamento do lote-6-agente-n8n-whatsapp; rastreabilidade de AGT-04/05 e LGPD-03 (desfecho ponta-a-ponta) até o lote futuro que assumir o smoke conversacional.
- **Date**: 2026-08-09
- **Status**: active

### AD-016
- **Decision**: A regra de transparência do agente é **invertida** em relação ao lote-6: ele **nunca** se anuncia como IA/assistente virtual/robô por iniciativa própria (nem na apresentação), e **sempre** confirma quando perguntado direta ou indiretamente, ou quando o lead pede algo que só um humano resolve. O estilo de conversa é informal pt-BR **sem emoji**, com marcadores de fala natural autorizados ("hmm", "haha", "acho que"), proibição explícita do molde "confirmação → concordância genérica → pergunta" e uma pergunta de qualificação por turno. A saída do modelo passa a ser **1 a 3 mensagens** por turno (teto imposto no validador determinístico, nunca só no prompt).
- **Reason**: Decisão do usuário (2026-08-10) a partir de conversa real capturada: o agente lia como questionário e se anunciava como "assistente virtual" na primeira frase. A transparência exigida por AGT-08 AC5 continua intacta na metade "nunca negar" — muda só a iniciativa.
- **Trade-off**: Conversa depende mais da qualidade do prompt e menos de um molde previsível; respostas ficam menos uniformes entre execuções. O teto de 3 mensagens e a proibição de emoji são convenções do produto que qualquer lote futuro precisa preservar.
- **Scope**: Todo o agente conversacional (prompt, validador, fluxo) e o seed de demonstração do CRM, a partir do lote-6b.
- **Date**: 2026-08-10
- **Status**: active

### AD-017
- **Decision**: O histórico de conversa que alimenta o prompt do agente vem **do CRM, pelo contrato** (`GET /api/v1/leads/{id}/messages`) — nunca de uma transcrição paralela nas Data Tables do n8n. A janela é dupla e cumulativa: no máximo **20 mensagens** e apenas as da **sessão corrente** (corte no primeiro intervalo > 12h entre mensagens consecutivas).
- **Reason**: Decisão do usuário (2026-08-10), com o controle de tamanho pedido explicitamente ("garantindo que uma conversa já finalizada não acabe lotando o contexto"). O CRM já é a fonte de verdade e guarda a thread inteira, inclusive mensagens escritas por humanos pela tela — uma cópia no n8n divergiria.
- **Trade-off**: Uma chamada HTTP a mais por turno e uma rota a mais no contrato v1 para manter. Em compensação, o agente enxerga o que o corretor humano escreveu no CRM, o que uma transcrição local nunca daria.
- **Scope**: Fluxo do agente e contrato de integração, a partir do lote-6b.
- **Date**: 2026-08-10
- **Status**: amended by AD-019 (cai o teto de 20 mensagens; a busca pelo contrato continua, agora como regra de semeadura da memória em cold start, não mais como janela de prompt)

### AD-018
- **Decision**: Tool boundary substitui validação pré-efeito no fluxo do agente: o LLM decide **quando** chamar uma tool; quem decide **o que é permitido** é quem já detém a regra — o contrato do CRM (server-side), quando a regra já existe lá, ou um sub-workflow determinístico, quando a tool compõe múltiplos efeitos. Restam exatamente **dois invariantes duros** fora de qualquer discrição do modelo: opt-out/LGPD (detectado em `n8n/src/gate.mjs`, antes do agente — nenhuma tool de opt-out é exposta ao modelo) e trava humana (`status = escalado_humano`, dupla proteção: gate roteia para `somente-registrar` antes do agente, e o CRM recusa server-side com `409 lead-travado-por-humano`). Todo o resto passa a ser validação de engenharia comum, que degrada ou regenera em vez de bloquear.
- **Reason**: Nó AI Agent + memória + tools é o padrão de mercado (decisão do usuário, 2026-08-14) para o miolo conversacional, superando a cadeia hand-rolled (LLM Chain + retry + Switch de ação + `sendReply1/2/3`) que produziu os defeitos reais da conversa de 2026-08-13. Um agente que decide QUAL tool chamar é estruturalmente incompatível com a redação original da AD-014 ("nenhum efeito colateral decidido autonomamente por LLM") — esta AD emenda essa metade, preservando o que de fato importava nela: nenhum efeito colateral acontece sem passar por validação determinística, não importa onde essa validação mora.
- **Trade-off**: Parte da camada de decisão pura testada em vitest (`n8n/src/validate-llm.mjs`) morreu junto com o output parser estruturado — a barreira de enums que ela fazia já era redundante com a validação server-side do CRM (AD-013, `code` estável). Cobertura de teste do miolo encolhe deliberadamente (69 testes removidos nas Fases 1/5 deste lote); o que sobra em `n8n/src/` (`phase.mjs`, `voice.mjs`, `session.mjs`, `system-message.mjs`) continua testado, e o comportamento dos nós nativos/sub-workflows é coberto por execução real via MCP, não por vitest.
- **Scope**: Todo fluxo n8n do produto que use nó AI Agent, a partir do lote-6c.
- **Date**: 2026-08-14
- **Status**: active

### AD-019
- **Decision**: A memória conversacional do agente (`n8n_chat_histories`, nó `memoryPostgresChat`, Postgres da própria instância n8n) é **cache derivado** — o CRM continua fonte de verdade da thread (tela Chats, LGPD, corretor). Duas obrigações decorrem disso: purga da memória no opt-out (no mesmo ramo em que o opt-out já é registrado no CRM) e semeadura da memória a partir de `GET /api/v1/leads/{id}/messages` em cold start (memória vazia + histórico disponível no CRM dentro da janela de 12h). Cai o teto de 20 mensagens da AD-017 — a regra passa a ser só o corte de sessão de 12h, com `contextWindowLength: 50` como salvaguarda técnica contra sessão patologicamente longa, nunca como política.
- **Reason**: Memória própria sobrevive a restart/redeploy da instância n8n, ao contrário de Simple Memory (volátil) — decisão do usuário (2026-08-14): "não precisamos nos limitar às 20 mensagens, podemos apenas levar em consideração o corte de 12h". O teto de 20 da AD-017 era vestígio do desenho anterior, que remontava o histórico por HTTP a cada turno; com memória persistente e o corte de 12h como regra real de tamanho de sessão, o teto fixo deixou de fazer sentido.
- **Trade-off**: A thread passa a existir em dois lugares (CRM e `n8n_chat_histories`) — qualquer purga de sessão precisa lembrar dos dois, e uma cópia desatualizada é possível se um dos dois falhar isoladamente. A tabela de memória divide o mesmo Postgres com as tabelas operacionais do n8n (execuções, credenciais, workflows), competindo por disco e sendo restaurada junto num backup — sem política de retenção adicional além do corte de 12h.
- **Scope**: Fluxo do agente conversacional e contrato de integração, a partir do lote-6c.
- **Date**: 2026-08-14
- **Status**: active

### AD-020
- **Decision**: O roadmap ganha um lote interstitial novo — **L8, usuários/perfis/papéis por tenant** (administrador/gestor/corretor, papéis acumuláveis, permissões por cargo, administrador gerenciando os demais) **+ atribuição de lead por disponibilidade de agenda dos corretores e preferência do lead** — posicionado **entre a Fase 9 (L7, este lote) e a Fase 10**. Renumeração: L7 = Fase 9 (inalterado), L8 = usuários/papéis (novo), L9 = Fase 10 (era L8). A AD-006 é emendada por esta decisão.
- **Reason**: Decisão explícita do usuário no discuss do lote-7 (registrada em `context.md` — Specific References e Deferred Ideas): a Fase 10 instrumenta métricas do piloto, e quem opera o piloto são usuários reais da imobiliária — métricas sem usuário real para atribuí-las não fazem sentido antes desse lote. Atendimento humano pelo Chats (autoria humana) e atribuição por agenda dependem do mesmo modelo de usuário, então os dois ficam de fora da Fase 9 em vez de inflar este lote — instrução explícita do usuário: "se isso for deixar o lote muito grande, jogue para um lote mais adiante".
- **Trade-off**: A Fase 10 passa a rodar um lote mais tarde do que a sequência original da AD-006; todo lote a partir do L8 fica deslocado em uma posição frente ao roadmap original.
- **Scope**: Sequenciamento do roadmap, a partir do lote-7.
- **Date**: 2026-08-22
- **Status**: active

### AD-021
- **Decision**: A autenticação do CRM é **better-auth com o plugin `organization` mapeado sobre a tabela `tenants` existente** (`schema.organization.modelName = "tenants"`; `member` → `tenant_members`; `invitation` → `tenant_invitations`). Decorrem três convenções permanentes: (1) **usuário é multi-tenant** — o vínculo usuário↔imobiliária é entidade própria com papéis por vínculo, gravados no formato nativo do plugin (string separada por vírgula), e a imobiliária ativa passa a ser o `activeOrganizationId` da sessão, não mais o cookie `crivo_tenant`; (2) **corretor é sempre um usuário** — `brokers` sai do schema e a coluna de responsável em `leads` é renomeada de `broker_id` para `assigned_user_id`, referenciando `users.id`; a convergência acontece por **reseed determinístico, sem script de migração**, porque nenhum dado do banco é real (confirmado pelo usuário em 2026-08-23) e migrar dado descartável só deixaria resíduo de estrutura; (3) a porta de entrada é `proxy.ts` (Next 16 deprecou `middleware.ts`) fazendo **apenas checagem otimista do cookie**, com a autorização real na Data Access Layer via `verifySession()` memoizada com `cache()`, e o escopo de leitura de lead trafegando como tipo obrigatório (`LeadScope`) para que um call site esquecido não compile em vez de vazar. O contrato de integração (`/api/v1/**`) fica fora disso: segue na credencial de serviço com `X-Crivo-Tenant` (SEC-01), como caminho de autenticação independente.
- **Reason**: O plugin `organization` já entrega convite, papéis acumuláveis, organização ativa na sessão e access control por par recurso-ação — pesquisa da doc oficial em 2026-08-23 confirmou o mapeamento `modelName`/`fields` sobre tabelas existentes e os múltiplos papéis por membro. Abordagem escolhida pelo usuário entre três apresentadas, coerente com a preferência dele por padrão de mercado sobre solução caseira; mapear sobre `tenants` mantém a imobiliária como identidade única, que é do que o isolamento da AD-002 depende. better-auth já constava como opcional aprovada na AD-005.
- **Trade-off**: A tabela central do domínio passa a carregar o schema de um plugin (`slug` vira NOT NULL; entram `logo` e `metadata`), e uma atualização do plugin pode exigir migração numa tabela de domínio. O cookie `crivo_tenant` deixa de ser fonte de verdade e o Zustand passa a espelhar a sessão. Se o better-auth não sustentar `uuid` como id contra o schema real, a abordagem precisa voltar ao usuário antes de prosseguir — risco registrado no `design.md` do lote-8 com task de espinha dedicada.
- **Scope**: Autenticação, modelo de usuários e isolamento multi-tenant de todo o produto, a partir do lote-8. Emenda a AD-007 na metade do cookie.
- **Date**: 2026-08-23
- **Status**: active

### AD-022
- **Decision**: O corretor responsável por um lead é escolhido **no agendamento**, nunca na criação. O lead nasce sem responsável e permanece assim durante a qualificação; quando a reunião é registrada, o CRM escolhe server-side, entre os corretores ativos cuja janela de trabalho declarada cobre integralmente o intervalo de 30 minutos da reunião, o de menor carga ativa — mantendo o desempate determinístico do lote-7 (`createdAt` e depois `id`). Como rede de segurança, um lead que passa para `escalado_humano` **sem responsável** recebe um na mesma operação que grava o status (menor carga entre quem está em janela naquele instante; se ninguém estiver, menor carga entre todos). A disponibilidade vem exclusivamente de janela de trabalho declarada no CRM, por vínculo usuário↔imobiliária. A lista de corretores nunca é exposta ao modelo: o agente informa o horário e recebe de volta quem ficou.
- **Reason**: Decisão explícita do usuário no discuss do lote-8, incluindo a rede de segurança do escalonamento ("quando o lead for escalado para um humano antes de qualificar, o sistema atribui um responsável para que ele não fique órfão"). A atribuição por carga na criação (ATRIB-01, lote-7) escolhia o corretor antes de existir qualquer informação sobre quando o lead pode se reunir — o horário só emerge durante a conversa. Manter a escolha no CRM, e não no modelo, é a mesma disciplina da AD-018: quem detém a regra decide.
- **Trade-off**: Durante toda a qualificação o lead não tem dono e, com o corretor enxergando apenas a própria carteira, fica visível só para administrador e gestor. `ATRIB-01` do lote-7 — requisito `✅ Verified` — passa a descrever comportamento que não existe mais; a rastreabilidade daquele lote não é reescrita, mas `ATRIB-02` do lote-8 a substitui explicitamente. Agendamentos concorrentes sobre o mesmo corretor e intervalo passam a depender de índice único no banco para não duplicar.
- **Scope**: Política de atribuição de lead de todo o produto, a partir do lote-8. Substitui a política de ATRIB-01 (lote-7).
- **Date**: 2026-08-23
- **Status**: active

### AD-023
- **Decision**: Toda resposta ≥ 400 de `/api/v1` é registrada em `integration_refusals` por um wrapper único de rota (`withIntegrationRoute`), com `after()` fora do caminho da resposta — grava-se exclusivamente metadado de transporte (rota, método, status, `code`, instante, tenant quando conhecido), nunca corpo nem dado pessoal; retenção de 30 dias na rotina de cron já existente (`/api/cron/expire-documents`). O caminho de sucesso não é registrado.
- **Reason**: Uma chamada recusada do agente não deixava rastro nenhum antes deste lote (`problem.ts` respondia e a requisição evaporava) — foi exatamente o modo de falha do incidente da credencial `httpHeaderAuth` sem prefixo `Bearer` (lote-8). `after()` lança fora de request scope do Next (`node_modules/next/dist/server/after/after.js:12-19`, `E468`); todo teste de rota do projeto chama handlers direto no vitest sem esse escopo, então o wrapper precisou de `try/catch` com fallback síncrono — verificado no planejamento como a única condição de parada do lote, e confirmado na execução: nunca se materializou.
- **Trade-off**: Persistir só recusas (não o caminho de sucesso) significa que "saúde da integração" é sempre inferida (última atividade + recusas), nunca uma métrica de volume/latência direta — decisão consciente do usuário para não abrir política de retenção nova. Toda rota nova sob `/api/v1` precisa lembrar de usar `withIntegrationRoute` — mitigado por teste de varredura (T17) que falha se um export não estiver marcado `INSTRUMENTED`.
- **Scope**: Contrato de integração, a partir do lote-9.
- **Date**: 2026-08-30
- **Status**: active

### AD-024
- **Decision**: O baseline pré-piloto é snapshot único por imobiliária nas colunas `baseline_*` de `tenants` (cinco campos, nullable), preenchido por quem tem `configuracoes:escrever`. Toda comparação no produto (tiles do Dashboard, relatório) normaliza o baseline mensal para a duração do período exibido (`÷ 30 × dias`), sempre mostrando o valor normalizado por extenso — nunca só o número mensal cru contra um período diferente.
- **Reason**: O schema já tinha três das cinco colunas desde o lote-4, mas nenhuma tela as preenchia — só o seed escrevia um valor mockado, e comparar baseline mensal contra período arbitrário sem normalizar deixava os tiles mudos ou enganosos nos recortes curtos que o piloto mais usa. Decisão do usuário: snapshot único (não versionado por período) — baseline pré-piloto é por definição o número de antes do produto entrar.
- **Trade-off**: Sem histórico de baseline por período — um re-levantamento futuro sobrescreve o valor anterior sem rastro. Os cinco baselines dos tenants-piloto nascem nulos (o seed não inventa mais valor mockado) e só passam a existir quando um usuário real da imobiliária os preenche — ato humano, não do código, e é um dos Success Criteria da spec.
- **Scope**: Métricas do piloto, a partir do lote-9.
- **Date**: 2026-08-30
- **Status**: active

### AD-025
- **Decision**: A vitrine pública do catálogo (L16) é um **projeto Next separado** do CRM, com `next.config.ts` próprio (`cacheComponents: true`, PPR, ISR) e sem `proxy.ts` de autenticação. É **somente leitura**: nenhum formulário, nenhuma escrita, nenhum PII — o botão de interesse abre `wa.me` do agente com mensagem pré-preenchida citando a referência do imóvel. Lê o mesmo Postgres através de um **usuário de banco distinto, com `GRANT SELECT` restrito à tabela de imóveis e às colunas de identidade visual de `tenants`**. Frescor quase real: `use cache` + `cacheLife('minutes')` + `cacheTag('tenant:<slug>:catalogo')`, com `revalidateTag` disparado pelo CRM ao publicar, despublicar ou marcar vendido. Roteamento por **path** (`/c/<slug>`) nesta etapa; domínio próprio por imobiliária fica para evolução posterior.
- **Reason**: Três fatos verificados em 2026-09-05 decidiram contra manter no mesmo projeto. (1) `cacheComponents` é flag **global** do `next.config.ts`, não por rota: a vitrine precisa dela e o CRM a tem desligada pela AD-007 — no mesmo projeto seria emendar a AD-007 para o produto inteiro (PPR default + `<Activity>`, obrigando reauditar a renderização de 12 lotes verificados) ou cair no modelo de cache anterior. (2) O `proxy.ts` tem matcher pega-tudo (`/((?!api|_next/static|_next/image|.*\..*).*)`) — todo visitante anônimo atravessaria a máquina de auth, e a exceção necessária na regex é um ponto de falha que, errado para o outro lado, expõe rota do CRM. (3) Um usuário de banco SELECT-only converte o isolamento de *disciplina de código* para *privilégio de banco*: se a app pública tentar ler `leads`, o Postgres recusa, independente do bug.
- **Trade-off**: Dois deploys, dois envs e conhecimento do schema em dois lugares (mitigável publicando o subset de tipos ou duplicando as duas tabelas, que mudam pouco). Burocracia adiantada, visível e limitada, preferida ao custo difuso e permanente de uma fronteira mantida só por revisão de código. A vitrine não pode reusar a DAL do CRM — o que é o ponto, não um efeito colateral.
- **Scope**: Toda a superfície pública do produto, a partir do L16. Não altera o CRM nem o contrato `/api/v1`. **Não emenda a AD-010**: `<Theme>` da Astryx é provider React com escopo por subárvore e `defineTheme` gera a paleta a partir de um accent — personalização por tenant em runtime é o caminho já sancionado pelo `CLAUDE.md` (`astryx theme`), não theming custom.
- **Date**: 2026-09-05
- **Status**: active

## Handoff

### Estado atual (2026-09-05) — lote-10 PLANEJADO, não executado

**Lote 10 (`lote-10-modelo-alvo-e-prova-conversacional`) — planejamento fechado e aprovado nesta
janela; Execute NÃO começou.** Specify → Design → Tasks completos (`validate_spec` 0/0,
`validate_tasks` 0 erros), 25 tasks em 8 fases, `EXECUTE-PROMPT.md` escrito. Commit `22b520d`.
A execução acontece em janela separada, pelo `EXECUTE-PROMPT.md`.

**Três achados do planejamento que mudam o escopo em relação ao roadmap:**

1. **O item 2 do roadmap L10 está obsoleto.** `n8n/workflows/principal.ts:1269` (e o `generated/`
   idêntico) já declara `models/gemini-3.5-flash-lite` — a divergência fonte × instância foi
   fechada no lote-8 T30. O item vira uma checagem de paridade publicado == `generated/` antes de
   tocar o nó (MOD-03).
2. **Os 3 cenários da AD-015 não rodam em sequência sem limpeza entre eles.** `n8n/src/gate.mjs:67-72`
   é terminal em `optedOutAt` e `escalado_humano`, e o lead é idempotente por `externalId` (=`waId`):
   um número de teste = um lead por tenant. Rodar escalar trava o lead e o cenário de opt-out nunca
   alcança o agente. É a explicação de por que a AD-015 nunca foi executada. **Decisão do usuário
   (2026-09-05)**: a limpeza dos três alvos (lead no CRM, linha de `conversa_estado`, sessão em
   `n8n_chat_histories`) é feita **à mão por ele** — o lote entrega o checklist que nomeia os alvos,
   não o código que os apaga.
3. **O modelo alvo é `gpt-5.4-nano-2026-03-17`**, não o `gpt-5-nano` que o roadmap nomeava. A
   listagem real da conta OpenAI (via MCP, `searchModels`) mostra as duas gerações disponíveis;
   snapshot datado em vez de alias flutuante, pela reprodutibilidade da prova conversacional.

**Confirmado ao vivo no planejamento** (não reconferir do zero no Execute — está no `design.md` §
Pesquisa): nó `@n8n/n8n-nodes-langchain.lmChatOpenAi` v1.3; `model` é resource locator, não string;
`reasoningEffort` disponível só para `gpt-5.*`/`o[3-9]`, e `temperature` fica de fora (Responses API
é o default do nó); credencial `OpenAI account` (`openAiApi`, `bGnmNn5iFH4sBCoo`) criada pelo usuário
nesta janela; não existe ferramenta MCP para apagar linha de Data Table; `conversations.leadId` e
`messages.conversationId` são FK sem `onDelete`.

**Duas AD ficam para o fechamento do Execute, deliberadamente**: AD-026 (modelo alvo) só pode ser
escrita depois do veredito da bateria de tool calling — se o rollback disparar, o modelo que ficou é
o Gemini e uma AD escrita antes estaria mentindo. AD-027 (protocolo de prova conversacional) encerra
a AD-015, que passa a `superseded by AD-027`.

**Estado do repositório**: branch `main`, HEAD `22b520d`, `origin/main` em `d550b79` — **1 commit
local pendente de push** (só artefatos de planejamento; push não autorizado nesta janela).
**Piso de testes**: 1015 em 81 arquivos, a confirmar por medição na T1.
**Next step**: abrir janela nova e colar o `EXECUTE-PROMPT.md` do lote-10.
**Blockers**: nenhum para começar. O 2º número homologado na Meta (MTN-01) segue pendente e é
condicional por decisão — não bloqueia AGT-04/05 nem LGPD-03.

### Estado do lote 9 (2026-08-30)

**Lote 9 (`lote-9-metricas-piloto`) — EXECUTADO E VERIFICADO. Verifier: PASS.** 34/34 tasks `Done`, mais 2 commits avulsos pós-Verifier (`53be6d0`, fix visual de i18n; `1ca82e1`, fecha o gap de cobertura do sensor). `validation.md` escrito, `validate_state.py` exit 0. Rastreabilidade da spec fechada em `0c56715` (10/10 requirement IDs `✅ Verified`). Execução em 4 batch workers sequenciais (Phases 1+2 / 3+4 / 5+6 / 7+8) + fechamento (T34) pelo orquestrador, dentro desta mesma janela — o `EXECUTE-PROMPT.md` previa uma janela separada, mas a execução acabou acontecendo aqui. Piso de testes confirmado antes de T1 com `npx vitest run`: **915 passed / 75 arquivos** (não os 912/74 herdados na documentação do lote-8 — duas correções pós-Verifier do lote-8, `d1430af`/`1b41ca1`, já tinham subido o número; usado o piso real, como a própria task mandava). Piso final, confirmado pelo orquestrador de forma independente a cada batch (nunca só aceito do relatório do worker): **1014 passed / 81 arquivos**, monotônico em toda a execução, mais 1 commit de fix pós-verificação visual que não alterou contagem de teste (gate build).

**Interrupções por limite de sessão da API**: o Batch 2 foi interrompido uma vez no meio da T14 e retomado via `SendMessage` com o estado reconciliado contra `git log`/`git status` — nenhum trabalho perdido, mesmo padrão do lote-8. O Batch 3 terminou toda a implementação mas parou antes de escrever o resumo final (estava esperando sua própria rodada de teste em background); retomado só para obter o resumo — os commits já estavam corretos.

**Autorização concedida durante a execução**: o schema aditivo (2 colunas nullable + `integration_refusals`) só tinha sido empurrado para `TEST_DATABASE_URL` pelos workers — o banco real de dev/produção (o mesmo do deploy Vercel) ficou desatualizado até o orquestrador pedir autorização explícita e rodar `npx drizzle-kit push` contra ele, para poder fazer a verificação visual real das 4 superfícies novas de UI. Usuário autorizou. Nenhum dado foi reseeded — só schema (DDL), nenhuma linha alterada.

**1 achado real da verificação visual, corrigido**: o bloco "Saúde da integração" (T29) usava `Timestamp format="auto"` da Astryx para os carimbos de tempo relativo, que renderiza em inglês ("3 days ago") — inconsistente com o resto do CRM (a lib crava essas strings, sem ponto de extensão de locale). O projeto já tinha a correção pronta (`src/components/shared/relative-time.tsx`, criada em lote anterior justamente para este caso, usada por Chats/Pipeline). Corrigido pelo orquestrador (commit `53be6d0`, fora do ciclo de nenhuma task específica — achado durante a verificação visual mandatória, não durante a implementação), confirmado visualmente depois do fix.

**Verificação visual real** (extensão Chrome, não o painel embutido, conforme regra do projeto): confirmadas as 4 superfícies novas — bloco "Reuniões a confirmar" (estado vazio), formulário de baseline em Configurações (5 campos, save funcionando, erro de validação testado interativamente), tiles do Dashboard com baseline normalizado e convite condicionado à permissão, bloco "Saúde da integração" (edge case de ausência de atividade lendo como problema, confirmado ao vivo — 3 dias sem atividade e 0 recusas ainda mostra "Problema detectado"), e a rota `/relatorio` (sem shell, 5 KPIs batendo com o Dashboard no mesmo período).

**Condição de parada do lote nunca se confirmou**: o wrapper `withIntegrationRoute` (T8) com `after()` em `try/catch` + fallback síncrono funcionou nos 6 route files sem precisar do Plano B (gravação sempre síncrona) — nenhum teste de rota mudou de expectativa. **O Verifier confirmou isso empiricamente**: a mutação 3 do sensor de discriminação removeu o `try/catch` e reproduziu exatamente o `E468` previsto pelo `design.md`, matando 5/8 testes de `route.test.ts` — prova de que a mitigação é real, não decorativa.

**Verifier (sub-agente independente, `.specs/features/lote-9-metricas-piloto/validation.md`) — PASS.** Gate re-executado de forma independente: 1014 passed / 0 failed / 81 arquivos (bateu exatamente com o número reportado pelo orquestrador). Spec-anchored check: 10/10 requirement IDs com evidência `file:line` + outcome batendo com a spec; camadas de UI (`none` na Test Coverage Matrix do próprio projeto — zero `.test.tsx` no repo) fechadas por inspeção direta de código + a verificação visual já registrada aqui, mesmo precedente aceito no lote-8. Sensor de discriminação: 4 mutações injetadas (normalização de baseline, `assignedTo(scope)` numa escrita do Pipeline, o fallback do `after()`, o corte de 30 dias da purga) — 3 mortas na hora, 1 sobreviveu (o limite exato de 30 dias nunca era exercitado, só 29/31; comportamento de produção já estava correto). Corrigido pelo orquestrador em `1ca82e1` (1 asserção nova, sem tocar as existentes), confirmado com rodada completa antes de subir a rastreabilidade. Rodado em worktree scratch (nunca `git stash`), porcelain da árvore real confirmado idêntico ao baseline depois — o próprio Verifier notou que tentou editar `spec.md` por engano durante a análise e reverteu via `git checkout` ao perceber que isso ultrapassava seu escopo read-only.

**Desvios documentados task a task em `tasks.md`** (nenhum fora do escopo da própria task): T3 zerou baseline também no tenant de demonstração (`tasks.md` autoritativo dizia "todos os tenants semeados", não só os pilotos, como uma frase do `design.md` sugeria); T18 achou um call site não documentado (`deactivateMemberAction`) e escopou corretamente com `assignedUserId: null` (escopo de imobiliária inteira, correto para redistribuição de carteira inteira); T27 tornou `periodDays`/`canEditSettings` opcionais com default no próprio commit (T28 wireia os valores reais no commit seguinte, sem quebrar o build isolado de T27); T29 resolve `resolveIntegrationHealth` dentro do próprio componente (RSC puro) em vez de no chamador, e usa `List`/`ListItem` em vez de `Table` para manter o componente 100% server-side.

**Estado do repositório**: branch `main`, HEAD `0c56715` — push feito (`9039776..0c56715`, fast-forward, 37 commits), **`origin/main` sincronizado**. Working tree limpa fora dos untracked pré-existentes (`public/crivo_*.png`, `skills-lock.json`) e do ruído de fim de linha em `n8n/src/phase.mjs` (`git diff` vazio) — confirmado repetidamente ao longo da execução, nunca um desses arquivos foi commitado. Nenhum deploy explícito disparado por este agente; a Vercel segue configurada para redeploy automático em push a `main` (mesmo padrão dos lotes anteriores) — confirmar o resultado do deploy antes de considerar produção atualizada.

**Baselines dos tenants-piloto preenchidos com dado fictício (2026-08-30, pós-fechamento)**: as duas imobiliárias-piloto são fictícias e não têm número real de campo a levantar — usuário autorizou explicitamente preencher com dado fictício em vez de deixar nulo. Preenchido direto no banco real via script de uso único (`scripts/fill-pilot-baselines.ts`, rodado e apagado — não é código do produto): `vale-uberaba` (45 leads/mês, 180min, 18%/12%/55%) e `triangulo` (60 leads/mês, 150min, 20%/15%/60%). `crivo-demo` (não é tenant-piloto) ficou de fora, mantém os valores mockados antigos (19/240/22, sem os 2 campos novos). Confirmado por leitura direta pós-escrita. Isso resolve o único Success Criteria da spec que dependia de ato humano — mas com dado de demonstração, não real; se o piloto virar produção de verdade com imobiliárias reais, esses valores precisam ser substituídos.

**Dívidas herdadas do lote-7/lote-8, não tocadas por este lote**: opt-out por linguagem natural; duas linhas inertes em `conversa_estado`; ausência de helper de revogação de chave de serviço por label na DAL; Vale do Uberaba sem `tenant_config` (falta 2º número homologado); L4 Fix 2 e L5 Fix 1 seguem abertos; migração do modelo do agente para `gpt-5-nano` (fonte segue alinhada ao `gemini-3.5-flash-lite` da instância); `n8n/README.md §4` obsoleto, não corrigido; `openapi.yaml` sem `assignedBroker` nem os 2 códigos de erro do lote-8; `RESEND_FROM` a confirmar na Vercel; SEED-01 (round-trip real) e ATRIB-02 AC8 seguem como evidência de campo em aberto, não como defeito.

**Piso de testes**: 1015 em 81 arquivos (1014 do Execute + 1 do fix pós-Verifier).
**In-progress**: nenhum. Lote fechado.
**Next step**: nenhum lote formal restante — Fase 10 (lote-9) era a última fase do roadmap original de 10 fases (`Roadmap - Fases Épicas.md`); as duas dívidas nomeadas para esta fase (projeção de KPI do lote-7, observabilidade real da fase-1) foram fechadas aqui (PERF-01 e a família SAUDE-01/02/03). O roadmap planejado (F1–F9 via L1–L7, usuários/papéis via L8, F10 via L9) está **100% executado**. Trabalho futuro é escopo novo — dívidas herdadas (lista abaixo) ou features fora do roadmap original, a definir pelo usuário via nova rodada de Specify.
**Blockers**: nenhum.

### Lote 8 (encerrado)

- **Lote 8 (`lote-8-usuarios-papeis-atribuicao`) — EXECUTADO E VERIFICADO. Verifier: PASS.** 33/33 tasks `Done`, mais 1 commit avulso (`33f09d9`, bug real do CLI `db:create-admin` encontrado no Batch 3). `validation.md` escrito, `validate_state.py` exit 0. Rastreabilidade da spec fechada na T33 (11/11 requirement IDs `Verified`).
- **Execução real**: 5 batch workers sequenciais (Phases 1+2 / 3+4 / 5 / 6 / 7+8), cada um interrompido por limite de sessão da API pelo menos uma vez e retomado via `SendMessage` com contexto preservado — nunca perdeu trabalho, sempre reconciliado contra `git log`/`git status` antes de continuar. Piso de testes 693 → **912** (+219), monotônico, confirmado de forma independente pelo orquestrador a cada batch (nunca só aceito do relatório do worker).
- **Achado de processo, não do código**: o `n8n/README.md §4` descrevia um risco de `vitest run` rotacionar chaves de API reais — confirmado como **obsoleto**: o guard em `src/db/index.ts:9-11` (`process.env.VITEST` → `TEST_DATABASE_URL`) já neutraliza isso; nenhum `vitest run` do lote tocou o banco real. A única rotação real veio do `npm run db:seed` explícito (Batch 1/T3, e depois o reseed final do usuário no fechamento da T31). README não foi atualizado — pendência de doc menor.
- **Verifier — sensor de discriminação**: 4 mutações injetadas em código de alto risco (`LeadScope`/isolamento de carteira, `coversInterval`, degradação do escalonamento, união de permissões), **4 mortas, 0 sobreviventes**. Rodado em worktree scratch, nunca `git stash`, porcelain da árvore real confirmado idêntico ao baseline depois.
- **6 desvios registrados e re-verificados pelo Verifier como reais** (detalhe em `validation.md` e na rastreabilidade da spec): slug `vale-uberaba` mantido (T3); rate limit de login por IP em vez de e-mail (T6, `AUTH-01` AC4 — limitação nativa do better-auth); `USER-01` AC10 lido como recusa de acesso à imobiliária, não login global (T21, coerente com AD-021); filtros de disponibilidade em `src/lib/broker-availability.ts` em vez de dentro de `broker-assignment.ts` (T26, preserva o teste de pureza do lote-7); mensagem de commit da T31 reflete que não houve reseed naquele commit; `openapi.yaml`/guia de integração não documentam `assignedBroker` nem os 2 códigos novos de erro (T29).
- **Os 2 gaps do Verifier foram corrigidos depois, em fix tasks próprias**: (1) `AGENDA-01` ganhou UI real (`d1430af`) — corretor edita a própria janela pelo rodapé da sidebar (única superfície que ele alcança), administrador/gestor editam a de qualquer corretor pela ação de linha em Usuários; verificado visualmente em produção, as duas superfícies funcionam e pré-carregam o estado real. (2) `AUTH-01` AC4 ganhou rate limit por e-mail (`1b41ca1`), complementar ao limite por IP já existente, contador em tabela `login_attempts` no Postgres (serverless não sustenta memória de processo) — sensor de discriminação próprio confirmou a recusa (não falha de credencial). Rastreabilidade da spec subida para `Verified` em todos os 11 IDs (`9039776`).
- **Susto de ambiente pós-lote, resolvido**: `BETTER_AUTH_SECRET` nunca tinha sido configurada na Vercel (só existia no `.env` local) — better-auth caía no "default secret" e o login em produção falhava silenciosamente (mascarava também a falha de reset de senha, que nunca chegava a chamar o Resend). Usuário adicionou `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL` na Vercel e redeployou; login e reset confirmados funcionando. **Lição para o próximo lote**: ao introduzir uma env var nova em `.env.example`, checar explicitamente se ela precisa ir para a Vercel também — não só a mais óbvia (foi só isso que ficou registrado ao fechar o Batch 5, e essa faltou).
- **Domínio de e-mail real**: usuário verificou `usekrivo.online` no Resend (sending enabled, região sa-east-1). O adaptador (`src/server/auth/email.ts:28`) ainda usa `onboarding@resend.dev` como default se `RESEND_FROM` não estiver setado — confirmar se `RESEND_FROM` está configurado na Vercel apontando para o domínio verificado.
- **Lições distiladas**: L-017 a L-022 (5 `spec_deviation` + 1 `ac_gap`), todas `candidate`, recurrence 1 — disponíveis via `lessons.py list --status candidate`.
- **Pendência real, fora do código, ainda aberta**: credencial `httpHeaderAuth` "Crivo - chave de serviço" no n8n foi corrigida pelo usuário (prefixo `Bearer` adicionado), mas o critério "primeira mensagem no número de teste abre conversa nova" (T31) segue sem prova ponta-a-ponta — nenhuma conversa real aconteceu desde o fix ainda. As execuções do scheduler seguem verdes, mas nenhuma amostra recente chegou a chamar `/api/v1` de fato (parou antes, por falta de `tenant_config` de teste).
- **ATRIB-02 AC8** — resolução do parâmetro `attendees` do Google Calendar só se confirma numa reunião agendada de verdade; segue não exercitado.
- **Ambiente real**: resemeado pelo usuário (`npm run db:seed` + `npm run db:create-admin` × 3 tenants). Workflow `crivo-tool-agendar-reuniao` publicado na instância n8n via MCP (versão `488b60eb…`, conferida contra `activeVersionId`). Deploy de produção em dia com `main` (`https://crivo-plum.vercel.app`, projeto Vercel `crivo`) — **`origin/main` sincronizado, sem commits pendentes de push**.
- **In-progress**: nenhum. Lote fechado, incluindo os 2 fix tasks pós-Verifier.
- **Next step**: iniciar o próximo lote do roadmap (Fase 10 / L9, métricas do piloto, pela AD-020) quando o usuário decidir.
- **Blockers**: nenhum para o próximo lote. SEED-01 (round-trip real) e ATRIB-02 AC8 seguem como evidência em aberto, não como defeito.
- **Pendências herdadas do lote-7** (inalteradas, nenhuma tocada neste lote): (1) opt-out por linguagem natural; (2) 2 linhas inertes em `conversa_estado`; (3) sem helper de revogação de chave de serviço por label na DAL; (4) Vale do Uberaba sem `tenant_config` (falta 2º número homologado); (5) L4 Fix 2 e L5 Fix 1 seguem abertos; (6) migração do modelo do agente para `gpt-5-nano` segue de pé, não aplicada (fonte alinhada ao `gemini-3.5-flash-lite` da instância em vez disso, na T30).
