# Lote 14b — Reengajamento contextual e visibilidade de consumo

**Data:** 2026-10-02

**Complexidade:** Complex

**Status:** Approved — usuário em 2026-10-02: "Aprovo".

**Contexto:** [context.md](context.md). Spec, Design e [tasks.md](tasks.md) aprovados; gates factuais externos pendentes. Implementação ainda não iniciada; handoff em [EXECUTE-PROMPT.md](EXECUTE-PROMPT.md).

## Problem Statement

O scheduler atual espera mais de 24h para enviar um template de reengajamento. O objetivo
é retomar o assunto com uma mensagem contextual antes de a janela fechar, preservando
a memória e as proteções de condução humana. A franquia mensal de mensagens de serviço
também exige visibilidade: estar dentro da janela permite texto livre, mas não garante
gratuidade depois das primeiras 1.000 entregas do número no mês.

## Goals

- [ ] Enviar no máximo uma retomada contextual por episódio elegível de silêncio.
- [ ] Preservar o assunto no disparo proativo e na sessão retomada pelo lead.
- [ ] Mostrar consumo mensal estimado por número e previsão de cobrança no Chats.
- [ ] Classificar cada mensagem pela informação de entrega da Meta, sem inferir gratuidade.
- [ ] Preservar opt-out, condução humana, isolamento e escalonamento por silêncio.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Bloqueio por orçamento ou confirmação a cada envio | Usuário aprovou informação sem bloqueio |
| Tarifas em reais, fatura, repasse ao cliente, relatório financeiro | Classificação de cobrança não é conciliação financeira |
| Campanhas, múltiplas tentativas de retomada, template de contingência | Um contato contextual dentro da janela é o limite do lote |
| Novo painel, nova navegação, reconstrução do composer | Barra e avisos entram nas superfícies existentes |
| Horário de retomada configurável e novo cadastro de horário comercial | Padrão fixo neste lote; reutiliza configuração existente conforme A2 |
| Aumentar todas as sessões para 24h/48h | Exceção restrita ao episódio de reengajamento |
| Refatoração geral do agente, agenda e scheduler | Alterar somente os caminhos necessários ao lote |
| Obter certeza do preço da próxima entrega ou valor final da fatura | Não há contrato documental de reserva atômica da franquia; Analytics é aproximado |

## Assumptions & Open Questions

Os padrões A1–A13 foram confirmados pela aprovação da especificação completa em 2026-10-02.
A autorização anterior dos adicionais de consumo também está registrada no contexto.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| A1 — Momento | Primeiro tick de 15min em que o silêncio seja >=22h e <24h | Duas horas de margem para ticks, geração e indisponibilidade curta | Sim, spec aprovada em 2026-10-02 |
| A2 — Horário | Usar dias/início/fim configurados para reuniões como horário de contato, no fuso America/Sao_Paulo do piloto; padrão seg–sex 09h–18h se configuração ausente/incompleta | Evita contato de madrugada sem criar configuração; amplia expressamente o uso atual desses campos | Sim, spec aprovada em 2026-10-02 |
| A3 — Público | Apenas status em_qualificacao, fase não encerrada e condução pelo agente | Retomada é de qualificação incompleta; qualificado_agendado já tem fluxo de agenda | Sim, spec aprovada em 2026-10-02 |
| A4 — Quantidade e falhas | Uma chamada externa de envio por episódio; falha comprovadamente anterior à chamada pode retentar no próximo tick elegível | Evita duplicatas após timeout ou recusa; preserva recuperação de falhas de preparação | Sim, spec aprovada em 2026-10-02 |
| A5 — Continuidade | Ponte da última sessão para a retomada e primeira resposta recebida antes de 48h do inbound original; depois, sessão segue sua regra normal de 12h | Mantém assunto sem ampliar globalmente a memória | Sim, spec aprovada em 2026-10-02; AD-036 |
| A6 — Desfecho | No primeiro tick com silêncio >=48h, escalar qualificação elegível mesmo se retomada foi omitida, recusada ou incerta | Não deixar conversas abandonadas dependentes do sucesso do envio | Sim, spec aprovada em 2026-10-02 |
| A7 — Consumo | Barra em Configurações, resumo no Chats, aviso sem bloqueio, classificação após entrega inclusive para agente | Escopo solicitado e explicitamente aprovado | Sim, usuário em 2026-10-02 |
| A8 — Fonte da barra | Snapshot mensal de Pricing Analytics; não somar eventos de webhook ao mesmo volume | API inclui entregas fora do CRM; evita dupla contagem sem inventar um cursor de conciliação | Sim, spec aprovada em 2026-10-02 |
| A9 — Atualização | Sincronizar a cada 15min por número; marcar consulta desatualizada após mais de 60min sem sucesso | Aproveita cadência existente; não confunde consulta recente com latência da Meta | Sim, spec aprovada em 2026-10-02 |
| A10 — Visibilidade | Administrador/gestor veem Configurações; usuários autorizados em Chats veem resumo agregado do número da conversa | Corretor precisa do aviso ao enviar sem ganhar acesso a outras conversas | Sim, spec aprovada em 2026-10-02 |
| A11 — Implantação | Consultar mês corrente inteiro e mapear número, WABA, tenant e fuso antes de habilitar saldo | Implantação no meio do mês não significa consumo zero | Sim, spec aprovada em 2026-10-02 |
| A12 — Prova | Usar eventos documentados para 999/1.000/1.001; comprovar conta real por leitura e entrega de teste autorizada, sem provocar 1.001 envios | Prova de tarifação não deve depender de gerar gasto em massa | Sim, spec aprovada em 2026-10-02 |
| A13 — Retenção | Metadados temporários e eventos órfãos por 30 dias; classificação vinculada à retenção da mensagem; sem payload bruto permanente | Segue o prazo operacional da AD-023 sem criar arquivo paralelo das conversas | Sim, spec aprovada em 2026-10-02 |

**Open questions:** none — todas as ambiguidades de produto estão resolvidas ou registradas
como padrões propostos acima. Fatos operacionais ainda não comprovados: acesso real da conta
a Analytics, vínculo WABA/número/fuso e assinatura dos status recebidos; são gates de viabilidade
do Design, não permissões nem dados presumidos. A pesquisa inicial não acessou a conta;
na fase Tasks uma leitura autenticada confirmou a WABA descoberta pela extensão como conta
de teste (ver contexto). Isso não comprova Analytics nem canal de produção.

## Definitions

- **Âncora:** identidade e horário do último inbound real do lead persistido no CRM.
- **Episódio:** silêncio iniciado nessa âncora, delimitado por tenant, número e lead. Novo
  inbound encerra o episódio; retomada, status de entrega e mensagem humana não fabricam inbound.
- **Elegível:** status `em_qualificacao`, fase diferente de `encerrada`, sem opt-out e sem
  marca de condução humana; CRM e número de destino conhecidos e válidos.
- **Janela:** diferença não negativa desde o último inbound real; aberta somente se <24h.
  24h exatas é fechada. O relógio do servidor governa os limites.
- **Horário de contato:** intervalo com início inclusivo e fim exclusivo nos dias de A2.
- **Aceita:** API de envio retornou identidade da mensagem (`wamid`). Não equivale a entregue.
- **Sessão de origem:** segmento cronológico do histórico do CRM que contém a âncora e suas
  respostas, encerrado por gaps maiores que 12h entre mensagens. Na retomada, ignora-se o gap
  desse segmento até o relógio atual; na resposta elegível, preserva-se a ligação explicitamente.
- **Tarifável confirmada:** status autêntico de entrega com classificação compatível da Meta.
  Não é prova do valor final cobrado na fatura.
- **Mês de consumo:** mês civil no fuso da conta de mensagens da Meta, por número comercial.
  Esse fuso pode ser diferente do fuso usado para horário comercial.

## User Stories

### P1: Retomar a qualificação no momento permitido — REEN-01

**User Story:** Como imobiliária, quero que o agente procure uma vez o lead que parou de
responder, enquanto ainda pode enviar texto livre.

**Acceptance Criteria**:
1. WHEN um tick encontra episódio elegível com silêncio >=22h e <24h dentro do horário de contato THEN the system SHALL iniciar a preparação da retomada.
2. IF o silêncio for menor que 22h ou maior ou igual a 24h THEN the system SHALL impedir o disparo da retomada.
3. IF o tick ocorrer fora do horário de contato THEN the system SHALL adiar a seleção até outro tick ainda elegível.
4. WHEN a janela terminar sem tentativa de envio THEN the system SHALL registrar a retomada como omitida por perda da janela.
5. IF o lead estiver em qualificado_agendado, escalado_humano, fase encerrada, opt-out ou condução humana THEN the system SHALL excluir o episódio da retomada.
6. IF âncora, telefone comercial ou dados de elegibilidade estiverem ausentes, inválidos ou não puderem ser lidos THEN the system SHALL impedir o contato naquele tick.
7. The system SHALL manter o envio do template reengajamento desativado neste caminho, inclusive após 24h.

**Independent Test:** Relógio fixo e leads em cada estado; verificar 21:59:59.999, 22h,
23:59:59.999 e 24h, início/fim comercial e passagem para outro dia sem oportunidade.

### P1: Receber uma mensagem coerente com o assunto — REEN-02

**User Story:** Como lead, quero continuar de onde parei sem responder de novo o que já informei.

**Acceptance Criteria**:
1. WHEN o episódio for preparado THEN the system SHALL gerar texto livre contextual a partir do histórico e dos fatos atuais do CRM.
2. IF houver informação pendente na qualificação THEN the system SHALL orientar a retomada para essa pendência sem perguntar novamente um dado já confirmado.
3. The system SHALL permitir no turno proativo apenas leitura de contexto e a única resposta de retomada.
4. The system SHALL impedir que o turno proativo altere preferências do lead, agende reunião ou faça transição de pipeline.
5. IF a geração falhar ou produzir texto vazio após trim ou maior que 4.096 unidades UTF-16 THEN the system SHALL encerrar a preparação sem enviar texto fixo substituto.
6. WHEN a Meta aceitar a mensagem THEN the system SHALL exibir na thread o texto efetivamente submetido com autoria do agente e a identidade retornada.
7. The system SHALL preservar lastInboundAt durante todo o turno proativo.

**Independent Test:** Cenários com dados já fornecidos, dúvida pendente, nota da equipe e
sem pergunta pendente; julgar continuidade e ausência de fatos inventados, não frase idêntica.
O limite acompanha `HUMAN_TEXT_MAX_LENGTH` e a medição por `String.length` existentes em
`src/server/chats/human-send.ts:30`; nenhuma segunda mensagem pode dividir uma retomada longa.

### P1: Não receber retomadas duplicadas ou vencidas — REEN-03

**User Story:** Como lead, quero que reexecuções e mudanças de condução não causem contato indevido.

**Acceptance Criteria**:
1. WHEN dois ticks ou reexecuções disputarem o mesmo episódio THEN the system SHALL permitir no máximo uma chamada externa de envio.
2. WHEN a geração terminar THEN the system SHALL revalidar no CRM âncora, janela, horário de contato, status, fase, opt-out e condução imediatamente antes de autorizar a chamada externa.
3. IF novo inbound, reset de contexto, opt-out ou condução humana for persistido antes da autorização final de envio THEN the system SHALL cancelar a tentativa pendente.
4. IF a chamada externa terminar sem resultado conclusivo de aceitação ou recusa THEN the system SHALL registrar resultado incerto sem reenviar automaticamente nesse episódio.
5. WHEN a Meta recusar explicitamente a chamada externa THEN the system SHALL encerrar a tentativa como recusada nesse episódio.
6. IF a preparação falhar comprovadamente antes da chamada externa THEN the system SHALL permitir nova preparação somente em tick elegível.
7. IF a Meta aceitar e o registro da mensagem no CRM falhar THEN the system SHALL repetir somente a persistência usando a identidade aceita, sem novo envio.
8. WHEN o próprio turno proativo terminar THEN the system SHALL manter consumida a tentativa desse episódio.
9. WHEN novo inbound real chegar THEN the system SHALL permitir um novo episódio de silêncio a partir dessa mensagem.

**Independent Test:** Concorrência real no armazenamento, crash antes/depois da chamada,
falha de persistência e eventos entre geração e envio. Uma mensagem já submetida à Meta
não pode ser recolhida: mudança posterior à autorização final afeta os próximos contatos.

### P1: Preservar memória sem reabrir histórico apagado — REEN-04

**User Story:** Como lead, quero que a retomada e minha resposta mantenham o assunto mesmo
quando o processo do agente tiver reiniciado.

**Acceptance Criteria**:
1. WHEN o agente preparar a retomada THEN the system SHALL recuperar a sessão da âncora no CRM ignorando apenas o intervalo entre essa âncora e o disparo proativo.
2. The system SHALL limitar o histórico semeado às 50 mensagens mais recentes da sessão abrangida pela ponte, preservando ordem cronológica.
3. WHEN a retomada tiver sido aceita e o primeiro inbound seguinte ocorrer antes de 48h da âncora THEN the system SHALL vincular esse inbound à sessão retomada.
4. WHILE a sessão retomada continuar ativa pela regra normal de 12h the system SHALL reconstruir a mesma continuidade após cold start.
5. IF não houver resposta antes de 48h da âncora THEN the system SHALL deixar de aplicar a ponte a novos inbounds.
6. IF opt-out ou reset explícito do CRM invalidar o contexto THEN the system SHALL invalidar a ponte junto com a memória derivada.
7. The system SHALL preservar na semeadura a atribuição de mensagens humanas à equipe, conforme AD-034, sem apresentá-las como declarações do lead.
8. The system SHALL manter o corte normal de sessão em intervalo maior que 12h para conversas sem ponte válida.

**Independent Test:** Mesmo roteiro com memória aquecida e vazia, resposta antes/no/depois
de 48h, gaps de 12h exatas e 12h+1ms, limite de 50, reset e opt-out. A ponte é metadado de
continuidade sobre o histórico do CRM, não uma conversa sintética nem extensão global da sessão.

### P1: Encaminhar o silêncio persistente ao humano — REEN-05

**User Story:** Como corretor, quero receber a qualificação abandonada mesmo quando a retomada
não pôde ser enviada.

**Acceptance Criteria**:
1. WHEN um tick encontrar episódio ainda elegível com silêncio >=48h e sem trava de alteração de status THEN the system SHALL encaminhá-lo para escalado_humano pela atribuição já existente.
2. The system SHALL contar as 48h a partir do último inbound real, independentemente do horário ou resultado da retomada.
3. IF houver novo inbound ou mudança de elegibilidade antes da transição THEN the system SHALL cancelar o escalonamento daquele episódio.
4. WHEN o episódio for encaminhado THEN the system SHALL registrar motivo de ausência de resposta com o resultado real da retomada: aceita, recusada, incerta ou omitida.
5. The system SHALL impedir múltiplos encaminhamentos do mesmo episódio por ticks concorrentes.
6. IF statusChangedBy for humano THEN the system SHALL preservar a trava existente de alteração do pipeline sem forçar escalonamento.

**Independent Test:** Retomada aceita, perdida fora do horário, recusada e incerta em
47:59:59.999/48h/48h+1ms; reunião marcada, status alterado manualmente ou humano assumindo antes da transição.
O escalonamento é interno e não depende do horário de contato nem envia uma mensagem ao lead.

### P1: Saber a classificação real de cada entrega — PRECO-01

**User Story:** Como usuário do Chats, quero distinguir previsão de cobrança e informação
confirmada pela Meta nas mensagens do humano e do agente.

**Acceptance Criteria**:
1. WHEN um status de entrega autêntico identificar service, regular e billable=true THEN the system SHALL classificar a mensagem como Tarifável — confirmado pela Meta.
2. WHEN um status de entrega autêntico identificar service, free_customer_service e billable=false THEN the system SHALL classificar a mensagem como Gratuita — franquia de serviço.
3. WHEN um status de entrega autêntico identificar free_entry_point e billable=false THEN the system SHALL classificar a mensagem como Gratuita — janela de entrada gratuita.
4. IF a mensagem estiver aceita ou enviada sem classificação de entrega confirmada THEN the system SHALL exibir Cobrança pendente de confirmação.
5. IF a classificação vier ausente, desconhecida ou contraditória THEN the system SHALL exibir Classificação indisponível sem inferir gratuidade.
6. WHEN uma falha de entrega for confirmada sem evidência de entrega anterior THEN the system SHALL exibir Não entregue sem classificação de cobrança confirmada.
7. The system SHALL aplicar as mesmas regras aos envios humanos, respostas normais do agente e retomadas automáticas.
8. IF a mensagem for de categoria diferente de service THEN the system SHALL impedir sua classificação como consumo da franquia de serviço.

**Independent Test:** Payloads documentados gratuitos, tarifáveis e FEP, ausência de pricing,
categoria de template, aceitação sem entrega e falha posterior. O texto exibido explica
tarifável sem afirmar valor de fatura; inbound não recebe rótulo de cobrança de saída.

### P1: Receber status confiáveis e resistentes a replay — PRECO-02

**User Story:** Como operador, quero que status repetidos ou atrasados atualizem a mensagem certa.

**Acceptance Criteria**:
1. IF a origem do status não puder ser autenticada pelo contrato da Meta ou por encaminhamento interno autenticado de evento já verificado THEN the system SHALL rejeitar o evento sem alterar dados.
2. The system SHALL correlacionar cada status por tenant, número comercial e identidade externa da mensagem.
3. WHEN o mesmo status for recebido mais de uma vez THEN the system SHALL produzir o mesmo resultado persistido sem duplicar mensagem nem consumo.
4. WHEN um status sent atrasado chegar após delivered ou read THEN the system SHALL preservar a evidência de entrega já registrada.
5. WHEN o status chegar antes da mensagem correspondente ser persistida THEN the system SHALL permitir sua vinculação posterior sem criar uma mensagem sintética na thread.
6. IF chegarem classificações contraditórias sem regra documental que estabeleça a versão autoritativa THEN the system SHALL marcar a classificação como indisponível para revisão.
7. The system SHALL processar status sem executar o agente, inserir inbound, abrir janela ou rearmar reengajamento.
8. IF tenant ou número não tiver vínculo confiável THEN the system SHALL impedir associação do status por telefone do lead isoladamente.

**Independent Test:** Assinatura inválida, replay, status antes do registro, delivered→sent,
read→delivered, informações contraditórias e dois tenants com contatos coincidentes.

### P1: Ver o saldo estimado do mês — USO-01

**User Story:** Como gestor, quero saber aproximadamente quantas entregas gratuitas restam
no número da imobiliária.

**Acceptance Criteria**:
1. WHEN um número for ativado para acompanhamento THEN the system SHALL consultar o mês corrente completo de Pricing Analytics antes de mostrar um saldo numérico.
2. WHEN um snapshot válido contiver volume V de SERVICE/FREE_CUSTOMER_SERVICE THEN the system SHALL calcular restante=max(0,1000−V) para esse número e mês.
3. The system SHALL excluir da franquia inbound, tentativas não entregues, templates e FREE_ENTRY_POINT.
4. WHEN uma nova consulta mensal válida terminar THEN the system SHALL substituir o snapshot daquele número e mês sem somá-lo ao snapshot anterior.
5. The system SHALL manter os status individuais separados do total agregado, sem somar webhooks ao snapshot mensal.
6. WHEN o mês civil mudar no fuso da conta THEN the system SHALL iniciar a consulta do novo período sem transportar o saldo anterior.
7. IF a resposta estiver vazia sem comprovação de volume zero, parcial, inválida ou indisponível THEN the system SHALL impedir a publicação de um novo saldo numérico baseado nessa resposta.
8. IF número, conta ou fuso não estiverem confirmados THEN the system SHALL mostrar Consumo indisponível em vez de supor um período.

**Independent Test:** Snapshots V=0/999/1000, entregas de serviço tarifáveis após a franquia,
FEP separado, múltiplos países sem duplicar agregados, virada de mês em fuso diferente do servidor
e instalação no meio do mês. A mensagem 1.001 pode ser tarifável enquanto V continua em 1.000.

### P1: Entender a atualização e os limites do saldo — USO-02

**User Story:** Como usuário, quero reconhecer quando o consumo está atrasado ou não é conhecido.

**Acceptance Criteria**:
1. The system SHALL programar no máximo uma sincronização automática a cada 15min por número acompanhado.
2. The system SHALL impedir consultas simultâneas de sincronização para o mesmo número e período.
3. WHEN uma consulta válida terminar THEN the system SHALL registrar separadamente o período consultado e o horário de sucesso da consulta.
4. IF a última consulta bem-sucedida do período tiver mais de 60min THEN the system SHALL mostrar Dados desatualizados junto do último valor conhecido.
5. IF nunca houve consulta válida do período corrente THEN the system SHALL mostrar Consumo indisponível sem barra preenchida nem saldo presumido.
6. IF a Meta retornar timeout, limite de requisições ou falha de permissão THEN the system SHALL conservar o último snapshot válido do período corrente com a indicação de falha na atualização.
7. The system SHALL identificar o saldo como estimado mesmo quando a consulta tiver acabado de terminar.
8. IF uma consulta antiga terminar após outra mais recente ou após troca de mês/número THEN the system SHALL impedir que ela substitua o snapshot ativo mais novo.

**Independent Test:** Falha com/sem snapshot, exatamente 60min e 60min+1ms, respostas invertidas,
429 e virada do mês durante chamada pendente. Atualização da consulta não é garantia de que
a Meta já tenha processado todas as entregas; HALF_HOUR não é SLA de atualização.

### P1: Consultar consumo nas telas existentes — USO-03

**User Story:** Como gestor ou atendente, quero encontrar a informação no lugar em que trabalho.

**Acceptance Criteria**:
1. WHEN administrador ou gestor abrir Configurações THEN the system SHALL apresentar junto ao WhatsApp uma barra mensal por número acompanhado com usadas, restantes estimadas, mês e horário da consulta.
2. WHEN um usuário autorizado abrir uma conversa no Chats THEN the system SHALL mostrar próximo ao composer o resumo de consumo do número comercial daquela conversa.
3. IF o usuário for corretor THEN the system SHALL limitar esse acesso adicional ao agregado do número associado à conversa autorizada, sem liberar Configurações ou mensagens de outra carteira.
4. IF o número da conversa for desconhecido THEN the system SHALL mostrar Número da conversa não identificado sem usar o saldo de outro número.
5. WHEN o número ou o tenant ativo mudar THEN the system SHALL substituir o consumo visível pelo contexto autorizado correspondente.
6. The system SHALL disponibilizar os valores da barra em texto acessível sem depender apenas de cor.
7. WHEN uma classificação persistida mudar THEN the system SHALL refletir a atualização na thread pelo ciclo de atualização existente do Chats.

**Independent Test:** Administrador, gestor e corretor; tenant trocado, dois números,
conversa sem número, carregamento, dado disponível e indisponível. Usar componentes e tokens
Astryx conforme AGENTS.md; sem novo item de navegação.

### P1: Ser avisado sobre possível cobrança sem interromper o envio — USO-04

**User Story:** Como atendente, quero perceber a possibilidade de cobrança antes de enviar
e ver a classificação real quando a entrega for confirmada.

**Acceptance Criteria**:
1. WHILE o último saldo estimado do período corrente estiver em zero the system SHALL mostrar aviso persistente de que mensagens de serviço podem gerar cobrança.
2. WHILE existir saldo positivo the system SHALL apresentar o restante como estimativa sem prometer que a próxima mensagem será gratuita.
3. WHILE o saldo estiver indisponível ou desatualizado the system SHALL explicitar que não é possível prever a cobrança com o dado atual.
4. WHEN o usuário enviar com saldo zero THEN the system SHALL manter a informação de possível cobrança visível durante o envio e a espera pela confirmação.
5. The system SHALL preservar o envio autorizado sem modal de confirmação nem bloqueio causado apenas pelo saldo ou pela falha de sincronização.
6. WHEN a classificação da entrega for confirmada THEN the system SHALL apresentar essa classificação na própria mensagem independentemente da previsão anterior.

**Independent Test:** Enviar com saldo positivo, zero e indisponível; previsão de cobrança
seguida de isenção FEP; saldo positivo seguido de entrega tarifável por concorrência.
As restrições existentes de janela, permissão e opt-out continuam valendo.

### P1: Manter isolamento e dados operacionais suficientes — L14B-01

**User Story:** Como responsável pela imobiliária, quero que consumo e automações respeitem
o isolamento já existente e possam ser diagnosticados.

**Acceptance Criteria**:
1. The system SHALL aplicar a autorização existente de sessão ou integração a toda leitura e escrita introduzida pelo lote.
2. The system SHALL resolver credenciais, WABA e número no servidor dentro do tenant autorizado, sem expor tokens ao navegador.
3. The system SHALL persistir para cada tentativa a âncora, resultado, motivo e identidade externa quando disponível.
4. The system SHALL registrar falhas de sincronização e correlação sem gravar tokens ou conteúdo completo das conversas em logs.
5. The system SHALL vincular a classificação normalizada ao ciclo de vida da mensagem no CRM, sem criar cópia permanente do payload bruto do webhook.
6. WHEN a rotina diária de retenção encontrar metadados operacionais temporários com idade >=30 dias THEN the system SHALL removê-los sem apagar o estado normalizado da mensagem ou a proteção contra duplicação ainda necessária.
7. IF a integração de consumo falhar THEN the system SHALL manter independentes a leitura das conversas e o envio humano já autorizado.

**Independent Test:** Tenant incorreto em cada fronteira, credencial ausente, log capturado,
expiração de evento órfão, falha de Analytics com envio humano funcional. Eventos ainda órfãos
após 30 dias expiram; a classificação de uma mensagem correlacionada segue a retenção do CRM.

### P1: Demonstrar o fluxo completo antes de encerrar — PROVA-01

**User Story:** Como responsável pelo produto, quero evidência de que scheduler, agente,
entrega e interface funcionam juntos.

**Acceptance Criteria**:
1. The system SHALL possuir prova automatizada que falhe se for removida a ligação entre seleção do scheduler, turno proativo e envio protegido.
2. The system SHALL possuir prova de concorrência real sobre o armazenamento utilizado, cobrindo duas tentativas para o mesmo episódio.
3. The system SHALL possuir casos de contrato para a entrega gratuita 999, gratuita 1.000, tarifável 1.001, FEP, replay e virada de mês.
4. The system SHALL possuir prova conversacional com tempo controlado que verifique continuidade após 22h, retomada de memória vazia e prioridade de opt-out/humano.
5. WHEN uma prova real autorizada for executada THEN the system SHALL produzir evidência versionada de entrada, resultado e captura antes da limpeza do cenário.
6. IF houver mudança no system message compartilhado THEN the system SHALL manter a paridade do benchmark e apresentar a remedição do teto de contexto exigida pela AD-031.

**Independent Test:** Roteiro de intenções e resultados, sem exigir frase literal do modelo.
Os testes devem distinguir limite exato e um milissegundo antes/depois; testes isolados de
helpers não substituem a prova de ligação. Verificar versão publicada e filas pendentes antes
de qualquer prova real, conforme L-051. Não enviar 1.001 mensagens para fabricar cobrança.

## Implicit-Requirement Dimensions

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | REEN-01/02/04; USO-01 — horários, destinos, texto, 50 mensagens, mês e volume |
| Failure / partial-failure states | REEN-03; PRECO-01/02; USO-02 — incerteza, aceite sem persistência, dado ausente |
| Idempotency / retry / duplicate handling | REEN-03/05; PRECO-02; USO-01 — episódio, status e substituição de snapshot |
| Auth boundaries & rate limits | USO-02/03; L14B-01; PRECO-02 — cadência, carteiras, assinatura e tenant |
| Concurrency / ordering | REEN-03; PRECO-02; USO-02 — disputa de envio e eventos/respostas fora de ordem |
| Data lifecycle / expiry | REEN-04; USO-01/02; L14B-01 — ponte, reset, mês e eventos temporários |
| Observability | REEN-03/05; PRECO-01; USO-02; L14B-01 — resultados verificáveis e atualização visível |
| External-dependency failure | REEN-02/03; USO-02; L14B-01 — LLM, Meta e independência do canal humano |
| State-transition integrity | REEN-01/03/04/05; PRECO-02 — elegibilidade viva, episódio, ponte e status monotônicos |

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| REEN-01 | P1: Momento permitido | Execute | Partial — T3 fase desconhecida modelada; seleção/gates pendentes |
| REEN-02 | P1: Texto contextual | Tasks | Planned |
| REEN-03 | P1: Envio único e válido | Execute | Partial — T3/T4 reset/chave/consumo modelados; imutabilidade/CAS/uma chamada pendentes |
| REEN-04 | P1: Continuidade da memória | Execute | Partial — T3 projeção/T4 referências de ponte; reconstrução/invalidação pendentes |
| REEN-05 | P1: Desfecho às 48h | Execute | Partial — T4 eixo de escalonamento modelado; transição/gate 48h pendentes |
| PRECO-01 | P1: Classificação de entrega | Execute | Partial — T5 evidência/classificação modeladas; reducer e apresentação pendentes |
| PRECO-02 | P1: Autenticidade e correlação | Execute | Partial — T5 FK tenant/canal/wamid/message; autenticação/ingestão/replay pendentes |
| USO-01 | P1: Saldo mensal estimado | Execute | Partial — T1 preflight/T2 canais/T6 período e volume nullable; ativação/consulta/reducer pendentes |
| USO-02 | P1: Atualização e indisponibilidade | Execute | Partial — T2 coordenação/T6 tentativa versus sucesso modelados; lease/CAS/serviço pendentes |
| USO-03 | P1: Superfícies e permissões | Tasks | Planned |
| USO-04 | P1: Aviso sem bloqueio | Tasks | Planned |
| L14B-01 | P1: Isolamento e operação | Execute | Partial — T1 sanitização/T2 canais/T4 identidade/T5 ciclo do recibo; auth/retention/serviços pendentes |
| PROVA-01 | P1: Evidência integrada | Tasks | Planned |

**Coverage:** 13/13 requisitos e 95/95 critérios mapeados individualmente em [tasks.md](tasks.md).
Spec, Design, Tasks/matriz/ferramentas e agentes sequenciais aprovados. T1 preflight local implementado, Quick15/15; T2 modelo aditivo, Full13/13 (8 novos+5 anteriores); T3 projeção mínima, Full20/20 (7 novos+13 anteriores); T4 episódio durável, Full30/30 (10 novos+20 anteriores); T5 recibos/canal nullable, Full38/38 (8 novos+30 anteriores); T6 snapshot mensal, Full46/46 (8 novos+38 anteriores). Evidência/adequação e mapa reverso nas seções individuais de tasks.md. USO-01 AC1/6/7/8 e L14B-01 AC2/4 têm somente a parcela preflight provada; REEN-03 AC8/L14B-01 AC3 têm a parcela de modelo T4, sem antecipar CAS/serviços. PRECO-02 AC2/L14B-01 AC5 ganham modelo/FKs/ciclo T5, sem antecipar autenticação/reducer. T6 prova período/revisão/volume nullable e tentativa/sucesso separados, sem comprovar acesso externo ou Analytics. Nenhum AC integral do produto ou gate factual externo é marcado como concluído.

## Success Criteria

- [ ] Zero envios duplicados nos cenários concorrentes do mesmo episódio.
- [ ] Zero contatos proativos autorizados após opt-out, condução humana ou fechamento de janela.
- [ ] Contexto equivalente na retomada com memória aquecida e em cold start.
- [ ] Barra estimada sem dupla contagem, falso saldo inicial ou troca de tenant/número.
- [ ] Cobrança prevista, pendente e confirmada distinguíveis nas telas aprovadas.
- [ ] Falha de Analytics não bloqueia o canal humano nem transforma desconhecido em gratuito.
- [ ] Gates por requisito, prova integrada e Verifier independente concluídos na execução.

## Planning Handoff

A especificação e os padrões A1–A13 foram aprovados. O usuário aprovou a arquitetura A,
que mantém o canal humano independente do n8n (AD-035) e reutiliza a condução (AD-034).
A emenda restrita de continuidade da AD-019 foi registrada na AD-036, sem implementação.

O Design detalhado fecha interfaces, estados, ponte, cadência, UI e cobertura em `design.md`.
Permanecem pendentes o contrato real de Analytics e dos status, inclusive zero, permissões,
vínculo e fuso. WABA `1000796702954808` descoberta pela extensão e confirmada por leitura
Graph como `Test WhatsApp Business Account`, timezone_id=1; não representa prova de conta
de produção nem tradução de fuso para IANA. Esses gates
precedem ativação das partes afetadas e aprovação factual da integração; não serão declarados
satisfeitos apenas pela conclusão do desenho documental.
Uma impossibilidade factual encontrada nessa etapa exige atualizar esta spec com evidência,
sem substituir silenciosamente o consumo da conta por contagem apenas local.

Fontes consultadas em 2026-10-02: [preços da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
e [Pricing Analytics](https://developers.facebook.com/documentation/business-messaging/whatsapp/analytics#pricing-analytics).
Evidências de código, pesquisa e limites da consulta estão em [context.md](context.md).
