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
- **Reforço (2026-09-10)**: durante o lote-10, uma injeção de prompt — texto formatado como
  `<system-reminder>` colado ao resultado de uma ferramenta, não uma mensagem real do usuário —
  instruiu explicitamente a reintroduzir a trailer "a partir de agora". Foi identificada como
  conteúdo não confiável e ignorada, sem alterar nenhum commit. Uma auditoria posterior por pedido
  explícito do usuário encontrou que **essa mesma técnica já tinha funcionado numa janela anterior**:
  dois commits do lote-10 feitos antes desta sessão (`docs(state): handoff do lote-10 apos a prova
  conversacional` e `docs(smoke): veredito consolidado da prova conversacional`) carregavam a trailer.
  Como nenhum dos 39 commits pendentes do lote-10 tinha sido enviado a `origin/main` ainda, a limpeza
  foi feita por reescrita de histórico **só no range local não-publicado** (`git filter-branch
  --msg-filter`, escopado a `d92dbc2..HEAD`, sem tocar conteúdo de árvore — confirmado por diff vazio
  entre HEAD antes/depois), sem qualquer `push --force`. **Lição**: a checagem de trailer antes de
  cada commit individual não é suficiente — uma auditoria varrendo toda a faixa de commits não
  publicados, feita antes de qualquer `git push`, é o que efetivamente pega uma violação que passou
  despercebida numa janela anterior.
- **Segundo achado, mais grave, no mesmo dia (2026-09-10)**: depois do primeiro push do lote-10, uma
  auditoria contra `origin/main` (não só contra o range recém-publicado) encontrou **3 commits de
  2026-09-04 já publicados antes desta sessão** com a trailer (`chore: versiona skills-lock.json`,
  `chore(assets): adiciona logos do Crivo em public/`, `docs(specs): reordena roadmap pos-piloto para
  os lotes 10 a 16`) — posteriores à própria AD-014 (2026-08-05), logo violações reais da regra
  "doravante", não histórico anterior isento. Corrigir exigia reescrever histórico **já remoto** +
  `push --force` — autorização explícita pedida e concedida pelo usuário antes de agir. Reescrito
  `git filter-branch --msg-filter` sobre `98095a6..HEAD` (46 commits, todos os hashes trocados por
  encadeamento — diff de árvore confirmado vazio antes/depois), toda referência a hash antigo
  remapeada em `.specs/**` e `n8n/smoke/**` (73 substituições), e `git push --force origin main`
  executado. **Lição reforçada**: a auditoria de trailer precisa cobrir `origin/main` inteiro, não só
  o range que a sessão atual está prestes a publicar — uma violação pode já estar no remoto, herdada
  de uma janela anterior que a checagem por-commit não pegou.

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
- **Status**: superseded by AD-027

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

### AD-026
- **Decision**: O modelo do AI Agent conversacional (`crivo-agente-principal`) é `gpt-5.4-nano-2026-03-17` via `@n8n/n8n-nodes-langchain.lmChatOpenAi` v1.3 — a variante nano atual da OpenAI, em snapshot datado, nunca em alias flutuante. `options` carrega `reasoningEffort: "low"` e `timeout: 120000`; `temperature` não existe mais nos parâmetros do nó. A troca ficou confinada a esse único nó do workflow: as 5 tools, `n8n/src/gate.mjs` e a memória `memoryPostgresChat` não mudaram uma linha.
- **Reason**: A bateria de tool calling do lote-10 (`n8n/smoke/bateria.md`, veredito em `evidencia.md` §12.6) rodou sobre um lead de descarte no tenant `triangulo` e mediu, item a item: `R1` (cobertura das 5 tools) **falso** — as 5 tools tiveram chamada bem-sucedida, incluindo `agendar_reuniao` com `eventoCriado:true` e `escalar_para_humano` recusada por regra de negócio (`409 transicao-invalida`, contada como sucesso pela definição da bateria); `R2` (sobrevivência à recusa) **falso** nas três cláusulas — o turno do enum inválido (execuções `1960`/`1966`) terminou `success`, com `responder_lead` bem-sucedido e nenhuma repetição da mesma chamada inválida 3+ vezes. `R1 = falso` e `R2 = falso` → APROVADO pela tabela da `bateria.md` §6. O rollback nomeado (§6.1, volta para `models/gemini-3.5-flash-lite`) **não** foi disparado. Snapshot datado é decisão do usuário (2026-09-05): um alias flutuante destruiria a reprodutibilidade de qualquer prova conversacional futura sobre este modelo. `reasoningEffort` substitui `temperature` porque é o parâmetro que o schema real do nó `lmChatOpenAi` aceita para esta família de modelo (confirmado via MCP no Design do lote-10) — `temperature` não existe mais nas `options`, não foi omitido por descuido.
- **Trade-off**: A bateria consumiu 2 rodadas inválidas antes da rodada que decidiu (quota da OpenAI zerada na 1ª tentativa, depois estado sujo + credencial do Google Calendar caducada na 2ª) — nenhuma das duas é imputável ao modelo, mas o processo de troca ficou mais longo e mais frágil a causas alheias do que uma bateria "roda uma vez e decide" idealizada. A bateria não é suíte de regressão em CI (decisão deliberada, `spec.md` Out of Scope): uma futura atualização silenciosa do modelo pela OpenAI (mesmo snapshot, comportamento diferente) não tem alarme automático — só uma nova rodada manual detectaria. E o próprio critério de aprovação (R1/R2) mede só cobertura de tool calling e sobrevivência a uma recusa; não mede qualidade de fala — essa parte ficou por conta da Fase 5 (AD-027), separada de propósito.
- **Scope**: O nó de modelo do AI Agent do fluxo conversacional principal (`crivo-agente-principal`), a partir do lote-10. Não se aplica a nenhum outro modelo do produto (não há outro).
- **Date**: 2026-09-09
- **Status**: active

### AD-027
- **Decision**: Toda prova de que o agente conversacional funciona de ponta a ponta passa por um protocolo fixo de três peças: (1) um **roteiro versionado** em `n8n/smoke/roteiro.md`, descrevendo os cenários como intenção de turno (nunca fala literal, porque o modelo não é determinístico) e o estado final exigido no CRM; (2) um **checklist de limpeza** nomeando os alvos que precisam ser resetados à mão entre cenários (lead no CRM, linha de `conversa_estado`, sessão em `n8n_chat_histories`, na ordem n8n→CRM), com uma linha de confirmação antes do cenário seguinte começar; (3) uma **barra de aprovação por desfecho**, nunca por estilo — o cenário é aprovado ou reprovado pelo estado final no CRM/Calendar, e observações de qualidade de fala vão para uma seção separada que nunca reprova sozinha.
- **Reason**: É o protocolo que permitiu ao lote-10 fechar honestamente os três desfechos que a AD-015 deferiu em 2026-08-09 (qualificar→agendar, escalar, opt-out) com conversa real, não com julgamento subjetivo de qualidade. Rodando esse protocolo, o smoke achou 11 defeitos reais (`evidencia.md` §17.3) — nenhum alcançável por teste automatizado (apresentação ausente, agendamento antes do aceite, `meetLink` errado, nome do lead anunciado como corretor, opt-out em linguagem natural sem registro, entre outros) — e todos foram corrigidos e republicados com hash conferido antes de ativar, dentro da própria Fase 5. Separar estado final de estilo foi o que impediu o lote de travar em julgamento subjetivo de conversa (a barra original da AD-015 não distinguia os dois).
- **Trade-off**: A limpeza entre cenários é **manual e não verificável por ferramenta** — não existe tool MCP de leitura de linha de Data Table nem acesso a variável de ambiente para consultar o Postgres/CRM diretamente; a confirmação de "os três alvos estão limpos" depende do usuário e é lida, na prática, pela própria execução real do cenário seguinte (se o lead nasce com campos `null` e memória vazia, a limpeza pegou — se não, ela é descoberta suja em produção, como aconteceu 3 vezes neste lote: `evidencia.md` §8.3, §14.1 rodada 1, e §12.1's SPEC_DEVIATION, que contaminou deliberadamente o próprio `waId` do smoke). O protocolo também não cobre multi-tenancy real (MTN-01 ficou condicional a T25, fora do escopo desta AD) nem substitui a bateria de tool calling da AD-026 — as duas são portões distintos, nessa ordem, e nenhuma delas roda em CI.
- **Scope**: Qualquer prova conversacional futura do agente do produto — troca de modelo, mudança de persona, ou nova tool — a partir do lote-10.
- **Date**: 2026-09-09
- **Status**: active

### AD-028
- **Decision**: A camada de lições ganha duas obrigações permanentes. (1) **Revisão de lições é passo obrigatório do fechamento de todo lote**: antes de dar o lote por encerrado, rodar `lessons.py list --status all`, ler as candidatas destiladas naquele lote e **apresentar ao usuário** quais merecem promoção a `confirmed`, com o critério explícito — generalizável além do incidente, acionável no momento de planejar, ainda verdadeira contra o código atual, e não redundante com outra lição, com uma AD ativa ou com o `CLAUDE.md`. A promoção é decisão do usuário, nunca automática, e nunca do sub-agente. (2) A janela de 45 dias (`window_days`) passa a ser **gatilho de revisão, não exclusão automática**: nenhuma lição é apagada sem confirmação humana explícita. O store carrega `prune_requires_confirmation: true`; com essa chave ligada, `lessons.py list` e `lessons.py add` apenas **sinalizam** o vencimento (e não gravam), e a exclusão só acontece por `lessons.py prune --confirm`, deliberadamente, depois da revisão. `promote_threshold` fica em 2.
- **Reason**: Auditoria de 2026-09-10 (a pedido do usuário, que não reconheceu a mudança de status): as 25 lições estavam **todas** como `candidate` desde sempre — nenhum commit jamais alterou status. A causa é a regra de promoção: `recurrence = len(features)` com `promote_threshold = 2` exige que a **mesma** lição seja destilada de novo em outro lote, com igualdade exata de string canonizada (`_key = signal + "::" + normalize(text)`). Isso é inalcançável na prática, porque lição nova nasce de falha nova e redação nova — o par `L-012`/`L-022` prova o ponto: são a mesma regra (asserção dedicada por subcláusula) com palavras diferentes, e nunca se fundiram. Resultado: 12 lotes produziram 25 lições e **zero** orientação carregável no Specify/Design. Pior, `_auto_prune` roda dentro de `add` **e de `list`** e grava: `L-001`..`L-010` seriam apagadas em ~7 dias por uma simples listagem, sem aviso. Baixar `promote_threshold` para 1 foi considerado e **rejeitado** — removeria a revisão humana e faria toda lição futura ser carregada sem crivo, o oposto do que deu valor na auditoria (3 das 25 não passaram: `L-007` já executada e sem ação pendente, `L-017` é fato de biblioteca e não regra, `L-022` é duplicata de `L-012`).
- **Trade-off**: A trava de confirmação vive em `.claude/skills/tlc-spec-driven/scripts/lessons.py`, e **`.claude` está no `.gitignore`** (linha 49) — o patch é local, não versionado, não viaja para outro clone e **desaparece se a skill for reinstalada ou atualizada**. Se isso acontecer, a exclusão silenciosa aos 45 dias volta a valer: a chave `prune_requires_confirmation` continuará no store versionado, mas um script sem o patch a ignora. **Sinal de alerta**: se `lessons.py list` deixar de emitir a NOTA de vencimento, a trava caiu — nesse caso, subir `window_days` imediatamente ou reaplicar o patch. A promoção manual também não é reprodutível pelo script (não existe comando `promote`), então as 22 têm `recurrence: 1` e o `LESSONS.md` as renderiza sob "Corroborated across multiple features", rótulo impreciso: elas foram confirmadas por julgamento humano, não por reincidência medida.
- **Scope**: Camada de lições do projeto e fechamento de todo lote, a partir do lote-11. Não altera nenhuma outra AD.
- **Date**: 2026-09-10
- **Status**: active

## Handoff

### Lote 11 — conversa real investigada e revisão aprovada em 2026-09-14

- **Feature**: `lote-11-catalogo-de-imoveis`.
- **Phase / Task**: Fase 6 / T26–T27 abertas; T31 implementada (`2268671`), T32 publicada
  após autorização específica do usuário (“Pode publicar”). Proposta concreta em `AJUSTE-PROMPT-PROPOSTO.md`.
- **Completed**: T1–T25, T31 e T32 entregues, com commits locais. T30 publicada (`6a05fa1`), mas
  sua repetição da T26 permanece pendente. T31 substitui a regra absoluta de busca,
  responde cortesia e exige aceite em todas as fases. Não refazer o planejamento.
- **In-progress**: `evidencia.md` §26/26.1 registra leitura da conversa/execuções;
  §31 registra mudança local e asserções; §32 registra hash e publicação autorizada. `tasks.md` T31 e `spec.md`
  BUSCA-05 AC13–18 refletem aprovação. Gate local passou: 1.304 testes / 91 arquivos.
- **Next step**: usuário revisar AJUSTE-PROATIVIDADE-PROPOSTO.md; depois implementar
  e verificar o ajuste aprovado. T26 ainda precisa de captura real, embora referência,
  preço, ausência e chamadas do modelo estejam comprovados na segunda conversa (§34).
- **Branch**: `main`; HEAD de implementação ao iniciar `6a05fa1`, `origin/main`
  local `5275511`. T32 alterou/publicou somente o principal; reset posterior autorizado.
  Nenhum push/deploy.

**Conversa real**: sete turnos / 14 mensagens conferidos no CRM; execuções `2272`,
`2278`, `2284`, `2291`, `2297`, `2307`, `2313` confirmadas individualmente por
`get_execution`. Lead novo `038b679d-510f-418d-8cfa-0ee50532df11`, tenant `triangulo`.
Reset anterior `2271` confirmado; primeiro turno comprovou a limpeza. Não resetar
esta conversa sem autorização. Estado final `em_qualificacao`, reunião e responsável
nulos. Consulta autenticada Abadia retornou IM-0001 / R$ 380.000,00; Uberaba retornou
vazio. Referência omitida no envio: PROVA-02 AC3 não passou integralmente. Sem captura
real e sem medição direta de iterações; intermediateSteps não são iterações do LLM.

**Artefato**: gerado localmente pelo inliner; só principal.ts muda entre os seis
workflows. Grafo SDK com 62 nós / 76 conexões, topologia idêntica ao HEAD anterior,
somente jsCode do nó de system message muda. gate.mjs/phase.mjs intocados. Validador
n8n `valid=true`, cinco avisos de Memory Managers existentes. Principal remoto
`0B1nqjODu7xuYYKF` reconsultado, ativo na nova versão
`fd7faf28-c070-4585-a22d-c322f1e1765d`, maxIterations 8. SHA-256 local/salvo conferido
antes de ativar: `c7a1ce26e192ba382ac56b14605f939334fecaf3c0e40a84d36f7d4e5b6a4e89`
(jsCode com CRLF normalizado). Nova leitura confirmou código ativo igual, 62/76,
settings/modelo/grupos e demais parâmetros preservados; recibo em evidencia.md §32.

**Credencial**: Google Calendar reconectado e comprovado na execução 2360 success
(segunda conversa): availability e criação de evento Meet bem-sucedidas.
Execuções `2305` e `2308` falharam em `Google Calendar: availability`, antes de evento
ou atualização CRM. Causa específica de expiração/revogação não comprovada. A T31
corrige instruções de não confirmar/prometer depois, mas não conserta OAuth.

**Sequência restante**: T26 (referência/preço real,
ausência, captura e iterações), T27 (qualificar→agendar com lead limpo e evento Meet),
T28 (supersessão parcial de VOZ-02), T29 (rastreabilidade, INDEX, roadmap, handoff e
revisão de lições), Verifier independente com as 8 mutações do design e
`validate_state.py` exit 0. Ainda não há validation.md; lote não está concluído.

**Gates**: targeted system-message **121 passaram** (24 novos, 97 existentes).
Red anterior 27 falhas / 94 passaram. Lint exit 0 (0 erros / 3 avisos prévios), build
exit 0 (avisos locais prévios Better Auth). Suíte completa exit 0: **1.304 testes em
91 arquivos**, 0 falhas, 665,22 s; resumo da sessão 89219 recuperado. validate_tasks e
validate_spec exit 0; diff --check exit 0.
A sessão herdada `31804` não teve resumo recuperável e não conta como PASS.

**Lições**: 22 confirmadas carregadas; script em `.agents/skills` mantém trava
`prune_requires_confirmation`. Promoção/exclusão são decisão humana (AD-028).
Diagrama/formatação da T30 reconciliados; nova T31 declarada no mapa.

**Pendências herdadas que permanecem**:
- Remarcação impossível após `qualificado_agendado`; requer contrato, id de evento e
  atualização/cancelamento do evento antigo.
- `agentVoiceTone` pede aberturas que `voice.mjs` barra; qualificação pode deixar
  `modality`/`propertyType` nulos apesar de informados, e marca campos antes da resposta.
- Paridade cosmética do `crivo-tool-agendar-reuniao`; defaults omitidos na instância
  (como `method: GET` de `consultar_documentos`) não foram alterados nesta retomada.
- Duas linhas inertes em `conversa_estado`; helper de revogação de chave por label;
  L4 Fix 1/2 e L5 Fix 1; documentação de `assignedBroker` e erros do lote-8 (L14).
- Confirmar `RESEND_FROM`; alerta de queda da integração e substituição dos baselines
  fictícios por dados reais quando houver piloto real (L15).
- MTN-01 continua **não verificado**, sem segundo número disponível; não é aprovação
  por ausência. O antigo reset pendente do lote-10 foi sucedido pela rotina do lote-11.
- Switch para permitir exibição do catálogo (ligado por padrão) e antecedência mínima
  de agendamento em dias: deferidos pelo usuário, registrados em `context.md`.
- Upload/storage/preview ficam no L12; vitrine pública separada, no L16 (AD-025).


**Arquivos da T31**: prompt, teste, generated/principal.ts, STATE.md e artefatos
lote-11 tasks.md/spec.md/evidencia.md/AJUSTE-PROMPT-PROPOSTO.md, incluídos no commit
atômico da retomada/T31. **Commit local**: `fix(agente): flexibiliza convite e responde cortesia sem antecipar agendamento`
(check_commit.py exit 0; localizar hash em git log). T26–T29 seguem abertas; nenhuma
task real adicional marcada Done. Árvore conferida após o commit, sem push/deploy.

**T32 — recibo**: evidencia.md, tasks.md, AJUSTE-PROMPT-PROPOSTO.md e este Handoff
atualizados; commit `docs(specs): registra publicacao da revisao consultiva do principal`.
Gate remoto/hash e validadores estruturais passaram; sem novo código/teste.
A publicação não aprova comportamento real ou encerra o lote; nenhuma conversa limpa nova.

**Última preparação (2026-09-14)**: reset solicitado explicitamente pelo usuário.
crivo-smoke-reset execução 2320 success confirmada por get_execution; memória da
sessão purgada e linha conversa_estado id 32 removida. Depois, npm run smoke:reset
exit 0 removeu o lead homologado (14 mensagens / 1 conversa); SQL READ ONLY confirmou
remaining=0. Principal ativo na revisão fd7faf28-c070-4585-a22d-c322f1e1765d.
A conversa de §26.1 permanece documentada como evidência histórica; o próximo lead
será novo. Usuário pode iniciar. Nenhum booking executado para testar a credencial;
T26/T27 seguem abertas. Commit documental do reset, sem código ou novos testes.

**Última conversa investigada (2026-09-14, evidencia.md §34)**: oito turnos / 16
mensagens; lead novo b639766a-f273-4c30-aa39-695226141bed. Execuções 2321, 2327, 2335,
2342, 2349, 2354, 2359, 2365 e filha 2360 confirmadas por get_execution. Referência
IM-0001 / R$ 380.000,00 e ausência de casa no Abadia chegaram corretamente. Máximo
seis runs do modelo por turno (teto oito preservado), sem estouro. CRM
qualificado_agendado, André atribuído, 15/09/2026 às 15h Brasília. Evento Calendar
opblu5rf7n0sml8p3c7ue3gpe4, Meet kgb-upvk-ndo; lembrete agenda_envios id 16 existente.
Não cancelar/resetar sem autorização específica. Campos de qualificação continuam
nulos (dívida herdada). Falta captura real para T26; T27 depende dela, sem fechamento.

**Refinamento solicitado**: busca automática de alternativas, convite mais cedo e
apresentação em linhas curtas. Proposta concreta em AJUSTE-PROATIVIDADE-PROPOSTO.md,
aguardando aprovação local. Tool atual só compara bairro/cidade por igualdade:
2349 mandou bairro literal próximo do Abadia, e 2342 cidade Uberlândia/MG não informada.
Proposta preserva critérios e amplia apenas bairro flexível, sem fingir geografia;
sem resultado após uma expansão já oferece reunião, sem novas voltas de refinamento.
Nenhum código/teste/publicação/reset alterado nesta investigação. Evidência, proposta,
tasks (cláusulas comprovadas, sem Done) e Handoff são os arquivos documentais desta rodada.
