# Lote 9 — Instrumentação de Métricas do Piloto Specification

## Problem Statement

O Dashboard já roda inteiramente sobre dado real desde o lote-7 — não sobrou mock a substituir. O que falta é o que torna aqueles números defensáveis numa reunião com a imobiliária. O baseline pré-piloto tem colunas no schema (`tenants.baseline_*`) e é exibido em `kpi-tiles.tsx`, mas **nenhuma tela o preenche**: só o seed escreve, e lote-7 e lote-8 empurraram explicitamente "baselines reais por tenant" para cá. A taxa de comparecimento tem cálculo correto e controle de escrita, mas nada nunca pede a resposta — a única forma de marcar presença é abrir o lead no Pipeline, então o KPI tende a ficar vazio para sempre. E o CRM é cego para o modo de falha que já mordeu duas vezes: uma chamada recusada do agente não deixa rastro nenhum (`problem.ts` responde e a requisição evapora), de modo que "nenhum lead novo hoje" e "todas as chamadas recusadas hoje" são exatamente o mesmo silêncio na tela — foi assim que a credencial do n8n sem prefixo `Bearer` passou despercebida.

## Goals

- [ ] Cada imobiliária-piloto tem baseline registrado pela própria equipe, e os 5 KPIs do Dashboard comparam contra ele na mesma unidade do período selecionado.
- [ ] A taxa de comparecimento deixa de ser estruturalmente vazia: toda reunião encerrada cobra a confirmação de quem a atendeu, com prazo para prescrever.
- [ ] Uma chamada recusada do contrato de integração passa a deixar rastro, e administrador/gestor conseguem distinguir "o agente está quieto" de "o agente está sendo recusado" sem abrir log de servidor.
- [ ] A reunião de piloto tem um artefato levável, gerado do próprio CRM, sem dependência nova no projeto.

## Out of Scope

Explicitamente excluído. Documentado para impedir alargamento de escopo.

| Feature | Reason |
| ------- | ------ |
| Alerta ativo (e-mail/WhatsApp) quando a integração cai | Este lote põe o sinal na tela. Notificação ativa é canal novo, com opt-in, destinatário e política de silenciamento próprios — lote próprio. |
| Log de sucesso do `/api/v1` (volume e latência por rota) | Decisão do usuário: persistir só recusas. Gravar todo caminho quente exige política de retenção própria e não responde nenhuma pergunta do piloto. |
| Export CSV da base bruta de leads | O artefato da reunião é o comparativo, não a base. Registrado em Deferred Ideas do `context.md`. |
| Baseline versionado por período | Decisão do usuário: snapshot único. Baseline pré-piloto é o número de antes do produto entrar — re-levantamento é outra feature. |
| Visão cross-tenant de saúde para o operador da plataforma | O produto não tem hoje nenhuma superfície de operador acima do tenant (AD-002); criar uma é lote próprio. |
| Ranking ou dashboard por corretor | Métrica individual muda a política de uso do produto dentro da imobiliária; nada no roadmap pede isso agora. |
| Prova ponta-a-ponta do round-trip real (SEED-01) e do `attendees` do Google Calendar (ATRIB-02 AC8) | Evidência de campo pendente do lote-8, não defeito de código. Depende de conversa real acontecer no número de teste, não de implementação. |

---

## Assumptions & Open Questions

Toda ambiguidade está resolvida ou registrada aqui — nada fica silenciosamente indefinido.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Formato do relatório do piloto (área cinzenta D, não discutida) | Rota imprimível do Dashboard com KPIs do período vs. baseline e CSS de impressão; PDF gerado pelo navegador, sem dependência nova | O projeto não tem lib de PDF nem de planilha (`package.json`), e o artefato da reunião é o comparativo já calculado. Adicionar dependência para gerar o que o navegador já imprime não se paga | n |
| Regra de normalização do baseline mensal | Baseline mensal dividido por 30 e multiplicado pelos dias do período selecionado, com o valor normalizado escrito por extenso no tile | Uniformiza os cinco tiles sob o filtro de período que já existe; escrever o valor normalizado impede que o número leia como inventado | y |
| Limiar de "integração com problema" | Nenhuma chamada bem-sucedida do agente nas últimas 24h **ou** qualquer recusa nas últimas 24h | Sinal binário e legível para quem opera a imobiliária, não um SLA. 24h cobre uma noite inteira sem alarme falso | y |
| Quem edita o baseline | Quem tem `configuracoes:escrever` — administrador e gestor | Matriz de permissões já existente (`src/lib/permissions.ts`); nenhum recorte novo de acesso é criado por este lote | y |
| Recusa sem tenant identificável (chave inválida, `tenant-nao-identificado`) | Gravada sem tenant e exibida no bloco de saúde de todas as imobiliárias, rotulada como recusa anterior à identificação, sem nenhum dado do payload | É o modo de falha mais provável (credencial errada) e o que motivou a frente; escondê-lo por falta de tenant tornaria o painel cego justamente onde ele precisa enxergar. Nenhum dado de lead atravessa | n |
| Conteúdo gravado na recusa | Apenas rota, método, status HTTP, `code` do problem+json, instante e tenant quando conhecido | A tabela é sinal operacional, não auditoria de conteúdo. Payload pode conter dado pessoal do lead, e o produto tem disciplina de LGPD em todo o resto | y |
| Reuniões já encerradas antes deste lote | Entram na lista de pendências se estiverem dentro da janela de 14 dias | A prescrição conta do fim da reunião, não da data de implantação; qualquer outra regra exigiria marcar linhas com a data do deploy | n |
| Retry do agente após recusa gera duas linhas | Sim, append-only, sem deduplicação | Duas recusas seguidas são sinal (o agente está insistindo contra uma porta fechada), não duplicata a suprimir | y |
| Confirmação de presença repetida ou revertida | Idempotente por valor e reversível; última escrita vence, sem erro | `setMeetingAttendance` já se comporta assim; corretor que erra o clique precisa poder corrigir, e o KPI lê o estado, não o histórico | y |

**Open questions:** none — todas resolvidas ou registradas na tabela acima.

---

## User Stories

### P1: A imobiliária registra o próprio baseline pré-piloto ⭐ MVP

**User Story**: Como gestor da imobiliária-piloto, quero registrar no CRM os números que eu tinha antes do agente entrar, para que a comparação exibida no Dashboard seja a minha realidade e não um valor de seed.

**Why P1**: É a frente adiada nominalmente por lote-7 e lote-8 para este lote. Sem ela, os cinco tiles comparam contra `null` ou contra mock, e o Dashboard não sustenta a conversa de piloto que a Fase 10 existe para preparar.

**Acceptance Criteria**:

1. WHEN um usuário com permissão de escrita em Configurações abre a tela THEN o sistema SHALL apresentar campos de baseline para os cinco KPIs: volume mensal de leads, tempo médio até a primeira resposta em minutos, taxa de qualificação, taxa de escalonamento e taxa de comparecimento.
2. WHEN esse usuário salva valores válidos de baseline THEN o sistema SHALL persistir os cinco valores na imobiliária ativa e refletir os novos valores no Dashboard na leitura seguinte.
3. IF um campo de volume ou de minutos recebe valor não inteiro ou negativo THEN o sistema SHALL recusar o salvamento e apontar o campo inválido, sem gravar nenhum dos cinco valores.
4. IF um campo de percentual recebe valor fora do intervalo de 0 a 100 THEN o sistema SHALL recusar o salvamento e apontar o campo inválido, sem gravar nenhum dos cinco valores.
5. WHEN um campo de baseline é salvo vazio THEN o sistema SHALL persistir ausência de baseline para aquele KPI, mantendo os demais inalterados.
6. IF um usuário sem permissão de escrita em Configurações tenta salvar baseline THEN o sistema SHALL recusar a operação no servidor, independentemente do que a interface exibe.
7. The system SHALL manter cada baseline como valor único por imobiliária, sem histórico por período.

**Independent Test**: Logar como gestor, preencher os cinco baselines em Configurações, recarregar o Dashboard e ver os cinco valores refletidos; tentar salvar 120 num percentual e ver a recusa com nada gravado.

---

### P1: O Dashboard compara o período contra o baseline na mesma unidade ⭐ MVP

**User Story**: Como gestor acompanhando o piloto, quero que a comparação com o baseline valha para o período que eu escolhi, para não precisar fazer regra de três de cabeça para saber se estamos melhores ou piores.

**Why P1**: Hoje o tile de volume mostra `Baseline: N/mês` sem delta porque baseline mensal e período arbitrário não se comparam — e o usuário decidiu normalizar. Sem isso, dois dos cinco tiles ficam mudos justamente nos recortes curtos que o piloto mais usa.

**Acceptance Criteria**:

1. WHEN o Dashboard exibe o tile de volume com baseline registrado THEN o sistema SHALL comparar o volume do período contra o baseline mensal normalizado para a duração do período selecionado, exibindo a diferença.
2. WHILE um tile exibe comparação com baseline normalizado o sistema SHALL exibir também o valor normalizado utilizado, em texto legível.
3. The system SHALL exibir comparação com baseline nos cinco tiles de KPI sempre que o baseline correspondente estiver registrado.
4. IF o baseline de um KPI não está registrado e o usuário tem permissão de escrita em Configurações THEN o sistema SHALL exibir, no lugar da comparação, um convite para registrar o baseline com link para Configurações.
5. IF o baseline de um KPI não está registrado e o usuário não tem permissão de escrita em Configurações THEN o sistema SHALL exibir apenas a indicação de baseline indisponível, sem convite nem link.
6. IF o valor apurado de um KPI é indisponível no período THEN o sistema SHALL exibir o baseline registrado sem calcular diferença.

**Independent Test**: Com baseline de 60 leads/mês e filtro de 7 dias, o tile mostra a comparação contra 14 e diz que comparou contra 14; logado como corretor sem baseline registrado, o mesmo tile mostra só a indicação de indisponível.

---

### P1: A reunião encerrada cobra a confirmação de comparecimento ⭐ MVP

**User Story**: Como corretor, quero ver na minha primeira tela quais reuniões já aconteceram e ainda não respondi, para confirmar em um clique em vez de caçar lead por lead no Pipeline.

**Why P1**: A taxa de comparecimento é um dos KPIs que a Fase 10 existe para instrumentar, e hoje ela é estruturalmente vazia — o cálculo está certo, mas nada nunca pede a resposta.

**Acceptance Criteria**:

1. WHEN uma reunião agendada atinge o instante de encerramento THEN o sistema SHALL passar a listá-la como pendente de confirmação de comparecimento.
2. WHILE existem reuniões pendentes de confirmação o sistema SHALL exibi-las no Dashboard em bloco próprio, posicionado abaixo dos indicadores, dos gráficos e da tabela de leads recentes.
3. The system SHALL restringir as reuniões listadas ao escopo de leitura de leads do usuário autenticado, de modo que o corretor veja apenas as da própria carteira.
4. WHEN o usuário confirma comparecimento ou ausência de uma reunião pendente THEN o sistema SHALL registrar o resultado no lead correspondente e remover a reunião da lista de pendências.
5. IF o usuário registra um resultado de comparecimento para uma reunião fora do seu escopo de leitura THEN o sistema SHALL recusar a operação no servidor.
6. IF a mesma reunião recebe dois registros de comparecimento THEN o sistema SHALL manter o último valor registrado, sem erro.
7. WHILE não existe nenhuma reunião pendente o sistema SHALL exibir estado vazio explícito no lugar do bloco, sem sugerir falha.

**Independent Test**: Ajustar uma reunião do seed para ter terminado há uma hora, abrir o Dashboard como o corretor dono e ver a pendência; confirmar presença e ver a taxa de comparecimento mudar no mesmo período.

---

### P1: O contrato de integração deixa rastro de toda recusa ⭐ MVP

**User Story**: Como administrador, quero que uma chamada recusada do agente fique registrada, para que uma credencial errada ou um payload inválido não fiquem invisíveis até alguém desconfiar.

**Why P1**: É a instrumentação real que a Fase 1 adiou para cá e o ponto cego que causou o incidente da credencial n8n sem prefixo `Bearer`. Sem o registro, a superfície de saúde da próxima story não tem o que mostrar.

**Acceptance Criteria**:

1. WHEN uma requisição a uma rota sob `/api/v1` é respondida com status igual ou maior que 400 THEN o sistema SHALL registrar a recusa com rota, método HTTP, status, código do problema e instante.
2. WHERE o tenant da requisição foi identificado o sistema SHALL registrar também a imobiliária correspondente na recusa.
3. IF o tenant da requisição não pôde ser identificado THEN o sistema SHALL registrar a recusa sem imobiliária, preservando os demais campos.
4. The system SHALL registrar exclusivamente metadados da recusa, nunca corpo da requisição, conteúdo de mensagem ou dado pessoal do lead.
5. IF o registro da recusa falha THEN o sistema SHALL responder ao chamador a mesma resposta de erro que responderia sem instrumentação, sem transformar a falha de registro em erro adicional.
6. WHEN a mesma recusa se repete em requisições sucessivas THEN o sistema SHALL registrar uma linha por requisição, sem deduplicar.
7. The system SHALL manter inalterados o corpo, o status e os cabeçalhos das respostas de erro do contrato de integração.

**Independent Test**: Chamar `/api/v1/leads` com chave inválida e ver uma linha de recusa sem tenant; chamar com chave válida e payload inválido e ver uma linha com tenant e código `payload-invalido`; conferir que as duas respostas HTTP continuam idênticas às de hoje.

---

### P1: Administrador e gestor enxergam a saúde da integração ⭐ MVP

**User Story**: Como gestor, quero distinguir "ninguém escreveu hoje" de "o agente está sendo recusado", para saber se o problema é do mercado ou da instalação.

**Why P1**: É a pergunta que o piloto faz toda vez que os números caem, e hoje ela só se responde abrindo log de servidor — que a imobiliária não tem como abrir.

**Acceptance Criteria**:

1. WHILE o usuário autenticado tem permissão de leitura em Configurações o sistema SHALL exibir no Dashboard um bloco de saúde da integração, posicionado abaixo do bloco de reuniões pendentes.
2. IF o usuário autenticado não tem permissão de leitura em Configurações THEN o sistema SHALL omitir o bloco de saúde da integração inteiro.
3. The system SHALL apresentar no bloco o instante da última atividade bem-sucedida recebida do agente e a contagem de recusas das últimas 24 horas.
4. IF não houve nenhuma atividade bem-sucedida do agente nas últimas 24 horas ou houve ao menos uma recusa nas últimas 24 horas THEN o sistema SHALL apresentar o bloco em estado de problema.
5. WHILE nenhuma dessas condições vale o sistema SHALL apresentar o bloco em estado saudável, mantendo a mesma posição na página.
6. The system SHALL restringir as recusas exibidas às da imobiliária ativa, acrescidas das recusas sem imobiliária identificada.
7. WHEN o bloco exibe recusas THEN o sistema SHALL identificá-las pelo código do problema e pela rota, sem exibir nenhum dado de lead.

**Independent Test**: Provocar uma recusa por chave inválida, abrir o Dashboard como gestor e ver o bloco em estado de problema com a contagem; abrir como corretor e não ver bloco nenhum.

---

### P1: As escritas do Pipeline respeitam a carteira do corretor ⭐ MVP

**User Story**: Como administrador, quero que um corretor não consiga alterar lead fora da própria carteira nem sabendo o identificador dele, para que o isolamento por carteira valha na escrita e não só na leitura.

**Why P1**: Lacuna encontrada durante o design deste lote. A SCOPE-01 do lote-8 fechou o isolamento de carteira na leitura, mas as três escritas do Pipeline (`updateLeadStatusAction`, `updateLeadBrokerAction`, `setMeetingAttendanceAction`) escopam apenas por imobiliária. A confirmação de comparecimento já precisava ser corrigida pela PRES-01 AC5; o usuário decidiu fechar a classe inteira no mesmo lote em vez de deixar duas irmãs abertas por mais um ciclo.

**Acceptance Criteria**:

1. The system SHALL escopar toda escrita de lead originada no Pipeline pelo escopo de leitura de leads do usuário autenticado, além da imobiliária ativa.
2. IF um usuário tenta alterar o status de um lead fora do seu escopo THEN o sistema SHALL recusar a operação e responder lead não encontrado, sem alterar nenhum dado.
3. IF um usuário tenta trocar o corretor responsável de um lead fora do seu escopo THEN o sistema SHALL recusar a operação e responder lead não encontrado, sem alterar nenhum dado.
4. IF um usuário tenta registrar comparecimento de um lead fora do seu escopo THEN o sistema SHALL recusar a operação e responder lead não encontrado, sem alterar nenhum dado.
5. WHILE o usuário tem papel de administrador ou gestor o sistema SHALL permitir essas três escritas sobre qualquer lead da imobiliária ativa, sem estreitamento.

**Independent Test**: Autenticado como corretor A, chamar cada uma das três actions com o id de um lead da carteira do corretor B e ver as três recusas, com o lead de B inalterado; repetir como gestor e ver as três operações concluírem.

---

### P2: As recusas registradas têm ciclo de vida

**User Story**: Como responsável pela plataforma, quero que o registro de recusas não cresça sem fim, para que a instrumentação não vire um passivo de armazenamento e de LGPD.

**Why P2**: Não bloqueia a leitura de saúde no dia 1, mas o produto tem disciplina de ciclo de vida em todo o resto (TTL de documentos, opt-out) e uma tabela sem dono contradiz isso.

**Acceptance Criteria**:

1. WHEN a rotina diária de manutenção executa THEN o sistema SHALL remover todo registro de recusa com mais de 30 dias.
2. The system SHALL executar essa remoção na mesma rotina agendada que já expira documentos, sem introduzir novo agendamento.
3. IF a remoção de recusas falha THEN o sistema SHALL concluir a expiração de documentos da mesma execução, reportando a falha no resultado.
4. WHEN a rotina executa sem nenhuma recusa vencida THEN o sistema SHALL concluir sem erro, reportando zero remoções.

**Independent Test**: Inserir recusas com 31 e com 29 dias, executar a rotina de cron e ver que só a de 31 dias sumiu.

---

### P2: O piloto tem um relatório levável à reunião

**User Story**: Como gestor, quero levar para a reunião com a imobiliária uma página com os números do período contra o baseline, para conduzir a conversa sem projetar o CRM ao vivo.

**Why P2**: É a metade "preparação para a demo/piloto" do nome da fase, mas depende de baseline e comparação já existirem — sem as duas primeiras stories, não há o que imprimir.

**Acceptance Criteria**:

1. WHEN um usuário com permissão de leitura em Configurações acessa a rota de relatório com um período THEN o sistema SHALL apresentar os cinco KPIs do período, cada um ao lado do baseline registrado, identificando a imobiliária e o intervalo de datas.
2. The system SHALL calcular os números do relatório com a mesma fonte e o mesmo período usados pelo Dashboard, sem recálculo divergente.
3. WHILE o relatório está sendo impresso o sistema SHALL omitir navegação, filtros e controles interativos, preservando apenas o conteúdo do relatório.
4. IF o usuário não tem permissão de leitura em Configurações THEN o sistema SHALL recusar o acesso à rota de relatório.
5. The system SHALL gerar o relatório sem nenhuma dependência de terceiros adicional no projeto.

**Independent Test**: Abrir a rota de relatório com período de 30 dias, conferir que os cinco números batem com o Dashboard no mesmo período e que a pré-visualização de impressão do navegador mostra só o relatório.

---

### P3: As consultas de KPI param de carregar o lead inteiro

**User Story**: Como quem mantém o CRM, quero que a apuração dos KPIs leia apenas as colunas que usa, para que o custo do Dashboard não cresça com o tamanho do texto dos leads.

**Why P3**: Dívida registrada nominalmente para esta fase no `design.md` do lote-7. Inofensiva no volume atual (dezenas de linhas), então não bloqueia nada — mas este é o lote que instrumenta métricas, e é aqui que ela cabe.

**Acceptance Criteria**:

1. WHEN a apuração de KPIs do Dashboard consulta os leads do período THEN o sistema SHALL selecionar exclusivamente as colunas usadas na agregação, sem trazer resumo executivo, motivo de escalonamento ou demais campos não agregados.
2. The system SHALL preservar exatamente os mesmos valores de KPI apurados antes da mudança, para os mesmos dados e o mesmo período.

**Independent Test**: Inspecionar o SQL gerado pela consulta de KPIs e confirmar a ausência das colunas de texto longo; a suíte de KPIs existente continua verde sem alteração de expectativa.

---

## Edge Cases

- IF o período selecionado tem duração menor que um dia THEN o sistema SHALL normalizar o baseline pela duração real do período, sem arredondar para zero.
- IF o baseline de um KPI é zero THEN o sistema SHALL tratar zero como valor registrado, nunca como ausência de baseline.
- WHEN uma reunião pendente completa 14 dias desde o encerramento THEN o sistema SHALL removê-la da lista de pendências sem registrar comparecimento nem ausência.
- IF um lead com reunião pendente perde o responsável THEN o sistema SHALL manter a reunião visível para administrador e gestor, fora da carteira de qualquer corretor.
- IF a rota recusada não existe no contrato (`rota-inexistente`) THEN o sistema SHALL registrar a recusa com a rota efetivamente chamada.
- WHEN não há nenhuma recusa nem nenhuma atividade registrada para a imobiliária ativa THEN o sistema SHALL apresentar o bloco de saúde em estado de problema, indicando ausência de atividade em vez de silêncio ambíguo.
- IF o relatório é acessado para um período sem nenhum lead THEN o sistema SHALL apresentar o relatório com os KPIs indisponíveis e os baselines registrados, sem erro.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| BASE-01 | P1: A imobiliária registra o próprio baseline pré-piloto | Tasks: T1, T3, T22, T23, T24, T25, T26 | Implementing |
| BASE-02 | P1: O Dashboard compara o período contra o baseline na mesma unidade | Tasks: T4, T27, T28, T34 | Implementing |
| PRES-01 | P1: A reunião encerrada cobra a confirmação de comparecimento | Tasks: T4, T19, T20, T21 | Implementing |
| PRES-02 | P1: A reunião encerrada cobra a confirmação (prescrição em 14 dias) | Tasks: T4, T19 | Implementing |
| SCOPE-02 | P1: As escritas do Pipeline respeitam a carteira do corretor | Tasks: T18 | Implementing |
| SAUDE-01 | P1: O contrato de integração deixa rastro de toda recusa | Tasks: T2, T5, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T34 | Implementing |
| SAUDE-02 | P1: Administrador e gestor enxergam a saúde da integração | Tasks: T4, T6, T29, T30 | Implementing |
| SAUDE-03 | P2: As recusas registradas têm ciclo de vida | Tasks: T7, T32 | Implementing |
| REL-01 | P2: O piloto tem um relatório levável à reunião | Tasks: T33 | Implementing |
| PERF-01 | P3: As consultas de KPI param de carregar o lead inteiro | Tasks: T31 | Implementing |

**ID format:** `[CATEGORY]-[NUMBER]`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 10 total, 10 mapeados a tasks (34 tasks), 0 sem mapeamento. Todas as 34 tasks implementadas e commitadas; status sobe para `Verified` após o Verifier retornar PASS (mesmo padrão do lote-8).

---

## Success Criteria

- [ ] As duas imobiliárias-piloto têm os cinco baselines preenchidos por um usuário real, não pelo seed.
- [ ] Um corretor confirma comparecimento a partir do Dashboard, sem abrir o Pipeline, e a taxa muda no mesmo período.
- [ ] Uma recusa provocada de propósito no contrato aparece no bloco de saúde em menos de um recarregamento de página.
- [ ] O relatório do período imprime em uma página, com os cinco KPIs ao lado dos cinco baselines.
- [ ] A suíte de testes continua monotônica: nenhum teste existente é enfraquecido, removido ou tem expectativa reduzida.
