# Lote 14 — Humano no laço — Especificação

**Status:** Aprovada (2026-10-01), com as emendas D1–D5 do Design aprovadas no mesmo dia
**Data:** 2026-10-01

## Problem Statement

O agente escala para humano (`status = escalado_humano`) e para de responder, mas o humano não tem
por onde responder: a tela de Chats é somente leitura (`src/components/chats/message-thread.tsx`,
"Sem `ChatComposer`") e o CRM não envia nada pelo WhatsApp. Também não existe forma de um corretor
entrar numa conversa que o agente ainda conduz, nem de devolvê-la ao agente depois. A premissa da
AD-017 ("o agente enxerga o que o corretor humano escreveu no CRM") descreve algo que nunca
aconteceu, porque não há como escrever. O lote-13 deixou para este lote o opt-out registrado por
humano: com o humano conduzindo, um pedido de parar só chega ao corretor, que não tem como
registrá-lo.

## Goals

- [ ] Um corretor assume uma conversa, responde pelo CRM e o lead recebe a mensagem no WhatsApp, numa conversa real.
- [ ] Nenhuma mensagem do agente chega a um lead enquanto um humano conduz a conversa.
- [ ] Depois da devolução, o agente responde coerente com o que o corretor disse, sem tratar a fala do corretor como fala do lead.
- [ ] O corretor registra o opt-out de um lead pelo CRM, com o mesmo efeito jurídico do caminho do agente.
- [ ] O `openapi.yaml` volta a descrever o contrato real, e uma divergência futura de códigos de erro ou de remetentes quebra a suíte.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Reengajamento gratuito escrito pelo agente antes de a janela de 24h fechar, substituindo o template pago `reengajamento` | Decisão do usuário (2026-10-01): vira o **L14b**, com a emenda da AD-019 que ele exige. Este lote só garante que o scheduler não reengaja uma conversa conduzida por humano (SILENCIO-01). |
| Template aprovado para o humano escrever fora da janela de 24h | Decisão do usuário: fora da janela o composer bloqueia e explica. Template exige aprovação da Meta, uma dependência externa. |
| Link do drawer do Pipeline para a conversa | Já entregue no lote-3 (PIPE-04, `lead-detail-panel.tsx:488-504`, ✅ Verified). O item 3 do roadmap fecha sem trabalho novo. |
| Indicador de quem conduz no drawer do Pipeline e no card do Kanban | Este lote mostra a condução na tela onde se conversa (Chats). Deferido em `context.md`. |
| Anexos, mídia, áudio e figurinhas no composer | Texto puro neste lote. |
| Status de entrega e de leitura (tiques) das mensagens humanas | Exige processar os eventos `statuses` da Meta no fluxo; fora do lote. |
| Notificação ao corretor de mensagem nova e contador de não lidas | Não existe dinâmica de notificações no produto; deferido. |
| Classificador de opt-out em linguagem natural nas conversas conduzidas por humano | O humano lê a mensagem e tem o botão de opt-out (OPTHUM-01); a palavra exata continua funcionando (SILENCIO-01 AC3). |
| Histórico de quem assumiu e devolveu cada conversa | Auditoria completa (#14) foi descartada no roadmap. A marca guarda só o estado atual. |
| Atribuir o lead a quem assume | Assumir não muda o responsável. A atribuição continua sendo a da AD-022. |
| Reverter um opt-out | Segue deferido no lote-13. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here; nothing remains silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Ritmo da discussão | Guiado | Default da skill; o usuário respondeu duas decisões por vez. | y |
| Modelo de condução | Marca de condução humana no lead, separada do `status`. O lead é **conduzido por humano** quando tem a marca **ou** está em `escalado_humano`; caso contrário, é **conduzido pelo agente** | Decisão do usuário. A coluna do Kanban não muda ao assumir, e as taxas de qualificação e de escalonamento (`src/server/data/index.ts:954-961`, calculadas pelo status) não são distorcidas. | y |
| Janela de 24h nas conversas conduzidas por humano | O CRM mostra quanto falta para a janela fechar; depois de fechada, o composer bloqueia e explica | Decisão do usuário. O contato gratuito antes de 24h vale só nas conversas do agente (L14b). | y |
| Devolver ao agente | Sim. Na primeira mensagem do lead depois da devolução, o agente reconstrói a memória a partir do CRM, inclusive com as mensagens do humano | Decisão do usuário; é o que torna verdadeira a premissa da AD-017. | y |
| Opt-out registrado pelo humano | Sim, com botão e caixa de confirmação; envia ao lead a confirmação do lote-13 quando a janela está aberta | Decisão do usuário; fecha o item que o lote-13 deferiu para o L14. | y |
| Reengajamento gratuito antes de 24h | Escrito pelo agente a partir do contexto, substitui o template `reengajamento`, em lote próprio (L14b) | Decisão do usuário. | y |
| Lead em `escalado_humano` | Já é conduzido por humano, sem precisar da marca: o composer aparece direto | O gate já cala o agente nesse status (`n8n/src/gate.mjs:70`). Exigir "Assumir" seria um clique sem efeito. | agent |
| Efeito de assumir sobre o lead | Não altera `status`, `statusChangedBy` nem `assignedUserId` | Consequência da decisão do usuário (condução separada do status) e da AD-022 (quem atribui é o CRM, no agendamento ou no escalonamento). | agent |
| Efeito de devolver sobre o lead | Remove a marca; `escalado_humano` volta para `em_qualificacao`; os outros status ficam; `statusChangedBy` passa a nulo | Sem liberar a trava humana o agente não consegue agendar depois da devolução: `agendar_reuniao` envia `status: qualificado_agendado` (`n8n/workflows/tool-agendar-reuniao.ts:227`) e o CRM recusa com `lead-travado-por-humano` quando `statusChangedBy = humano` (`src/server/integration/leads.ts:151-153`). Devolver é a decisão humana explícita de entregar o controle. | agent |
| Turno do agente em andamento quando a marca é gravada | O agente consulta a condução do lead antes de cada envio e não envia se o lead já é conduzido por humano ou tem opt-out; falha da consulta bloqueia o envio | O debounce de 10 s e o turno do modelo abrem uma janela real de corrida, justamente quando o lead está ativo, que é quando um corretor entra. Na dúvida, calar: o humano vê a thread e responde. | agent |
| Lembrete de reunião durante a condução humana | Continua sendo enviado | É aviso da reunião, não fala do agente na conversa. | agent |
| Atualização da tela | Com a conversa aberta e a aba visível, mensagens novas e mudanças de condução aparecem em até 10 s sem recarregar; com a aba oculta, nenhuma consulta periódica | Sem isso o corretor não vê a resposta do lead. Consulta periódica mantém o padrão RSC-first (AD-007) sem infraestrutura de tempo real. | agent |
| Identificação do humano para o lead | O texto vai exatamente como digitado (sem espaços nas pontas), sem prefixo, assinatura ou nome | O corretor se apresenta do jeito dele; uma assinatura automática muda o tom da conversa sem pedido do usuário. No CRM a bolha mostra o nome do autor. | agent |
| Tamanho e formato | Só texto, de 1 a 4.096 caracteres | 4.096 é o limite de corpo de texto da Cloud API. | agent |
| Gravação da mensagem humana | Só depois de a Meta aceitar o envio, com o id devolvido pela Meta como `externalId`; com falha, nada é gravado e o texto fica no campo | É a mesma ordem do agente (`tool-responder-lead.ts`: envia, depois registra), e a thread nunca mostra uma mensagem que o lead não recebeu. | agent |
| Duplo envio | Cada envio carrega uma chave de idempotência; a mesma chave chama a Meta e grava uma vez só | Duplo clique e reenvio por rede instável são os modos de falha comuns de um composer. | agent |
| Tempo máximo de espera pela Meta | 15 s | Acima disso o corretor precisa de resposta; o texto fica no campo para nova tentativa. | agent |
| Botão de opt-out | Disponível em qualquer lead sem opt-out no escopo do usuário, conduzido por humano ou pelo agente | O gestor que lê um pedido que o classificador não pegou precisa do mesmo botão; não há risco novo, porque o efeito é o mesmo de `POST /leads/{id}/opt-out`. | agent |
| Confirmação do opt-out pelo humano | O texto do OPTMSG-01 do lote-13, enviado só com a janela aberta, gravado como mensagem `humano` do autor; falha do envio não desfaz o registro | O registro jurídico é o opt-out, e a confirmação é um esforço adicional. Mesmo texto para os dois caminhos, porque diz só o que o sistema cumpre. | agent |
| Purga depois do opt-out pelo CRM | Memória do agente e colunas de qualificação/persona de `conversa_estado` purgadas em até 20 min (emenda D2) | Paridade com MEM-04 (AD-019). O lead pode nunca mais escrever, então a purga não pode depender de uma mensagem dele; a varredura do scheduler roda a cada 15 min, e o pior caso soma a duração do tick. | agent |
| `sender: humano` no contrato | Recusado em `POST /api/v1/leads/{id}/messages` com `400 payload-invalido` | Mensagem humana nasce só pela tela, com autor autenticado. A credencial de serviço do agente não pode fabricar autoria humana. | agent |
| Mensagens humanas na memória reconstruída | Do lado da imobiliária, identificadas como escritas pelo corretor, nunca como fala do lead | Se o modelo as ler como fala do lead, responde a si mesmo; se as ler como dele, pode contradizer o corretor sem saber. | agent |
| Fala da equipe repetida pelo agente (emenda D12, 2026-10-01) | O system message autoriza o agente a repetir ao lead o que a equipe já informou nas notas `system`, inclusive característica de imóvel, sem `buscar_imoveis`, sem acrescentar nada e sem contradizer a equipe | Na prova real (T40, 6b) o agente leu a nota do corretor e recusou repetir "3 vagas", porque as regras de inventário mandam citar dado de imóvel só da tool. Decisão do usuário: emendar o system message. | y |
| Assumir sem caixa de confirmação | Um clique | A ação é reversível por "Devolver ao agente". O opt-out, que é irreversível, tem confirmação. | agent |
| Caminho técnico do envio pelo CRM | **CRM direto na Cloud API** (Graph API v25.0), com o token de usuário do sistema em `WHATSAPP_ACCESS_TOKEN` na Vercel e o número de resposta aprendido por lead a partir do `POST /leads` do n8n (AD-035; emenda D5) | Escolha do usuário no Design entre CRM direto e webhook do n8n: o humano continua falando com o n8n fora do ar, o erro da Meta chega cru e o envio é testável em vitest. Custo aceito: o token existe em dois cofres. | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Assumir a conversa ⭐ MVP

**User Story**: Como corretor ou gestor, quero assumir uma conversa que o agente está conduzindo, para responder eu mesmo sem que o agente fale junto.

**Why P1**: Sem condução humana explícita, o composer e o agente falariam ao mesmo tempo com o lead.

**Acceptance Criteria**:

1. WHEN um usuário com `chats:escrever` aciona "Assumir conversa" num lead do seu escopo, sem `optedOutAt` e conduzido pelo agente THEN the system SHALL gravar no lead a marca de condução humana com o id desse usuário e o instante da ação.
2. WHEN a marca é gravada THEN the system SHALL manter `status`, `statusChangedBy` e `assignedUserId` do lead com os mesmos valores de antes da ação.
3. IF o lead está fora do escopo do usuário (lead de outra carteira para quem só tem o papel corretor, ou lead de outro tenant) THEN the system SHALL recusar a ação e manter o lead sem a marca.
4. IF o usuário não tem a permissão `chats:escrever` THEN the system SHALL recusar a ação e manter o lead sem a marca.
5. IF o lead tem `optedOutAt` THEN the system SHALL recusar a ação e manter o lead sem a marca.
6. IF o lead já tem a marca THEN the system SHALL manter o usuário e o instante da marca existente.
7. WHILE o lead está em `escalado_humano` the system SHALL tratá-lo como conduzido por humano sem exigir a marca.
8. The Chats SHALL exibir o controle "Assumir conversa" somente para lead conduzido pelo agente, sem `optedOutAt`, a usuário com `chats:escrever`.

**Independent Test**: Assumir uma conversa de lead em `qualificado_agendado` e comprovar a marca gravada, o lead ainda na coluna de agendados e as taxas do Dashboard inalteradas.

---

### P1: Calar o agente enquanto o humano conduz ⭐ MVP

**User Story**: Como corretor que assumiu a conversa, quero que o agente não envie nada ao lead, para que o lead converse com uma voz só.

**Why P1**: É a garantia que dá sentido a assumir. Sem ela o lead recebe duas vozes.

**Acceptance Criteria**:

1. WHILE o lead tem a marca de condução humana, WHEN chega uma mensagem do lead (texto ou mídia) que não é a palavra exata de opt-out THEN the system SHALL gravar a mensagem no CRM e não enviar ao lead nenhuma mensagem do agente.
2. The gate SHALL encaminhar para `somente-registrar` toda mensagem de lead com a marca de condução humana que não seja a palavra exata de opt-out, com a mesma precedência de `escalado_humano`.
3. WHILE o lead tem a marca, WHEN o lead envia exatamente `sair` ou `parar` THEN the system SHALL gravar `optedOutAt` e enviar a confirmação única de opt-out do lote-13.
4. IF a marca é gravada enquanto um turno do agente está em andamento THEN the system SHALL NOT enviar ao lead nenhuma mensagem do agente cujo envio comece depois da gravação da marca.
5. IF a consulta da condução do lead feita antes de um envio do agente falha THEN the system SHALL NOT enviar essa mensagem do agente.
6. WHILE o lead é conduzido por humano the scheduler SHALL NOT enviar mensagem de reengajamento a esse lead.
7. WHILE o lead tem a marca the scheduler SHALL NOT escalar esse lead por silêncio.
8. WHILE o lead tem a marca, WHEN o horário de um lembrete de reunião do lead chega THEN the scheduler SHALL enviar o lembrete como hoje.
9. IF o contrato recebe `status` ou `meetingAt` em `PATCH /api/v1/leads/{id}` para um lead com a marca de condução humana THEN the system SHALL responder `409` com `code: lead-conduzido-por-humano` sem gravar nenhum campo do patch. <!-- emenda D3 (Design, 2026-10-01) -->

**Independent Test**: Com a conversa assumida, o lead escreve três mensagens; o CRM grava as três, o n8n roda `somente-registrar` nas três execuções e nenhuma mensagem do agente sai.

---

### P1: Responder pelo CRM ⭐ MVP

**User Story**: Como humano que conduz a conversa, quero escrever ao lead pelo Chats e que ele receba no WhatsApp, para atender sem sair do CRM.

**Why P1**: É o buraco que o lote existe para fechar.

**Acceptance Criteria**:

1. WHILE o lead é conduzido por humano, não tem `optedOutAt` e a janela de 24h está aberta, WHEN um usuário com `chats:escrever` e o lead no escopo envia um texto THEN the system SHALL entregar o texto ao WhatsApp do lead a partir do número de WhatsApp da imobiliária do lead.
2. WHEN a Meta aceita o envio THEN the system SHALL gravar a mensagem na conversa do lead com remetente `humano`, o id do usuário autor, o instante do envio e o id de mensagem devolvido pela Meta como `externalId`.
3. The system SHALL enviar ao lead o texto digitado sem espaços nas extremidades e sem prefixo, assinatura ou nome do autor.
4. IF o texto, sem espaços nas extremidades, está vazio ou tem mais de 4.096 caracteres THEN the system SHALL recusar o envio sem chamar a Meta.
5. IF o lead é conduzido pelo agente THEN the system SHALL recusar o envio sem chamar a Meta.
6. IF o lead tem `optedOutAt` THEN the system SHALL recusar o envio sem chamar a Meta.
7. IF o lead está fora do escopo do usuário ou o usuário não tem `chats:escrever` THEN the system SHALL recusar o envio sem chamar a Meta.
8. IF o número de WhatsApp da imobiliária pelo qual o lead escreveu não é conhecido do CRM THEN the system SHALL recusar o envio sem chamar a Meta e exibir que o número ainda não foi registrado para esse lead. <!-- emenda D1 (Design, 2026-10-01): o número é aprendido por lead, não configurado por imobiliária -->
9. IF a Meta recusa o envio ou não responde em 15 s THEN the system SHALL NOT gravar a mensagem, SHALL exibir o motivo em português e SHALL manter o texto no campo.
10. IF a Meta aceita o envio e a gravação da mensagem falha THEN the system SHALL registrar em log um evento com tenant, lead e id da Meta, sem o conteúdo da mensagem, e SHALL exibir que a mensagem foi entregue ao lead mas não ficou registrada.
11. WHEN o mesmo envio chega duas vezes com a mesma chave de idempotência THEN the system SHALL chamar a Meta uma única vez e gravar uma única mensagem.
12. WHEN o envio termina com sucesso THEN the Chats SHALL limpar o campo e exibir a mensagem na thread sem esperar a próxima atualização periódica.
13. IF o token de envio do WhatsApp não está configurado no CRM ou a Meta o recusa THEN the system SHALL NOT gravar a mensagem e SHALL exibir que o envio pelo WhatsApp não está configurado. <!-- emenda D1: desdobra o caso de credencial do AC8 original -->

**Independent Test**: Assumir uma conversa do lead de descarte, enviar "Oi, aqui é a Ana, corretora" pelo Chats e comprovar a mensagem no WhatsApp do número de teste e na thread com remetente `humano` e o nome do autor.

---

### P1: Respeitar a janela de 24h do WhatsApp ⭐ MVP

**User Story**: Como corretor, quero saber quanto tempo tenho para responder e por que não consigo depois, em vez de uma falha sem explicação.

**Why P1**: Fora da janela a Meta recusa texto livre; sem a regra no CRM, todo envio tardio vira erro opaco.

**Acceptance Criteria**:

1. The system SHALL considerar a janela de 24h aberta quando a mensagem mais recente com remetente `lead` da conversa tem menos de 24 horas, e fechada quando tem 24 horas ou mais, ou quando a conversa não tem mensagem do lead.
2. WHILE a janela está aberta e o lead é conduzido por humano, the Chats SHALL exibir quanto falta para a janela fechar, em horas e minutos.
3. WHILE a janela está fechada, the Chats SHALL exibir o campo de envio desabilitado, com o aviso de que o WhatsApp só permite responder até 24 horas depois da última mensagem do lead e o instante em que a janela fechou.
4. IF um envio chega ao servidor com a janela fechada THEN the system SHALL recusar sem chamar a Meta.
5. WHEN chega uma mensagem nova do lead com a janela fechada THEN the Chats SHALL reabrir o campo de envio na próxima atualização periódica, sem recarregar a página.
6. IF a Meta recusa um envio por janela expirada THEN the system SHALL exibir o mesmo aviso de janela fechada do AC3.

**Independent Test**: Com um lead cuja última mensagem tem 24 h exatas, o campo aparece desabilitado com o aviso; com 23 h 59 min, aparece habilitado com "fecha em 0 h 1 min".

---

### P1: Ver a conversa com autoria e atualização automática ⭐ MVP

**User Story**: Como humano que conduz a conversa, quero ver quem escreveu cada mensagem e receber a resposta do lead na tela, para conversar sem recarregar a página.

**Why P1**: Sem atualização automática o corretor não vê a resposta; sem autoria, a thread mistura humano e agente.

**Acceptance Criteria**:

1. The thread SHALL exibir as mensagens com remetente `humano` do lado da imobiliária, com estilo visual distinto das mensagens do agente e com o nome do usuário autor.
2. WHILE uma conversa está aberta e a aba do navegador está visível, the Chats SHALL exibir mensagens novas de qualquer remetente e mudanças de condução em até 10 segundos, sem recarregar a página.
3. WHILE a aba do navegador está oculta, the Chats SHALL NOT consultar o servidor periodicamente.
4. The thread header SHALL exibir quem conduz a conversa: o agente (pelo nome configurado da imobiliária), o nome do usuário que assumiu, ou "Escalado para humano" quando o lead está em `escalado_humano` sem a marca.
5. The conversation list SHALL marcar visualmente as conversas conduzidas por humano.
6. The Chats page subtitle SHALL contar as conversas no WhatsApp sem afirmar que todas são conduzidas pelo agente.
7. IF o autor de uma mensagem `humano` perdeu o vínculo com a imobiliária THEN the thread SHALL continuar exibindo o nome desse autor na mensagem.

**Independent Test**: Com a conversa aberta em duas abas de usuários diferentes, uma mensagem enviada numa aba aparece na outra em até 10 s, do lado da imobiliária, com o nome do autor.

---

### P1: Devolver a conversa ao agente ⭐ MVP

**User Story**: Como humano que resolveu o que precisava, quero devolver a conversa ao agente e que ele continue sabendo o que eu disse.

**Why P1**: Decisão do usuário; é o que fecha a premissa da AD-017.

**Acceptance Criteria**:

1. WHEN um usuário com `chats:escrever` e o lead no escopo aciona "Devolver ao agente" num lead conduzido por humano e sem `optedOutAt` THEN the system SHALL remover a marca de condução humana do lead.
2. WHEN a devolução ocorre com o lead em `escalado_humano` THEN the system SHALL mudar o status do lead para `em_qualificacao`.
3. WHEN a devolução ocorre com o lead em `em_qualificacao` ou `qualificado_agendado` THEN the system SHALL manter o status do lead.
4. WHEN a devolução ocorre THEN the system SHALL gravar `statusChangedBy` nulo no lead.
5. WHEN o lead envia a primeira mensagem depois da devolução THEN the system SHALL responder pelo agente com a memória reconstruída a partir do CRM, contendo as mensagens da sessão corrente de todos os remetentes, inclusive as do humano e as do lead recebidas enquanto o humano conduzia.
6. The memória reconstruída SHALL apresentar as mensagens `humano` ao modelo como fala do lado da imobiliária, identificada como escrita pelo corretor, e nunca como fala do lead.
7. WHEN o lead envia a segunda mensagem depois da devolução THEN the system SHALL usar a memória do agente sem reconstruí-la de novo.
8. IF o lead tem `optedOutAt` ou o usuário não o tem no escopo THEN the system SHALL recusar a devolução e manter a marca e o status.
9. The Chats SHALL exibir o controle "Devolver ao agente" somente para lead conduzido por humano, sem `optedOutAt`, a usuário com `chats:escrever`.

**Independent Test**: Assumir, escrever pelo CRM "o apartamento da Rua X tem 3 vagas", devolver; o lead pergunta "quantas vagas mesmo?" e o agente responde 3, sem dizer que foi o lead quem informou.

---

### P1: Registrar o opt-out pelo CRM ⭐ MVP

**User Story**: Como humano que lê um pedido de parar, quero registrar o opt-out do lead pelo CRM, para que o pedido tenha o mesmo efeito jurídico do registrado pelo agente.

**Why P1**: É o item de compliance que o lote-13 deferiu para cá; com o humano conduzindo, o classificador não roda.

**Acceptance Criteria**:

1. WHEN um usuário com `chats:escrever` e o lead no escopo confirma "Registrar opt-out" num lead sem `optedOutAt` THEN the system SHALL gravar `optedOutAt` no lead pela mesma regra de domínio de `POST /api/v1/leads/{id}/opt-out`.
2. The system SHALL exigir, antes do registro, uma confirmação explícita que informa que o lead não receberá mais mensagens e que a ação não pode ser desfeita pela tela.
3. WHEN o opt-out é registrado com a janela de 24h aberta THEN the system SHALL enviar ao lead exatamente uma mensagem com o texto de confirmação do OPTMSG-01 do lote-13 e gravá-la na conversa com remetente `humano` e o usuário autor.
4. WHEN o opt-out é registrado com a janela de 24h fechada THEN the system SHALL gravar `optedOutAt` sem enviar mensagem ao lead.
5. IF o envio da confirmação falha THEN the system SHALL manter `optedOutAt` gravado e exibir que a confirmação não foi entregue ao lead.
6. WHEN o opt-out é registrado pelo CRM THEN the system SHALL purgar a sessão do lead em `n8n_chat_histories` e as colunas de qualificação e persona do lead em `conversa_estado` em até 20 minutos. <!-- emenda D2 (Design, 2026-10-01): a varredura roda a cada 15 min; o pior caso é a cadência mais a duração do tick -->
7. WHILE o lead tem `optedOutAt` the Chats SHALL exibir a conversa somente para leitura, com a data do opt-out, sem campo de envio e sem os controles de assumir, devolver e registrar opt-out.
8. IF o usuário não tem o lead no escopo ou não tem `chats:escrever` THEN the system SHALL recusar o registro e manter `optedOutAt` nulo.

**Independent Test**: Registrar o opt-out do lead de descarte pelo CRM e comprovar `optedOutAt` preenchido, uma confirmação no WhatsApp, a sessão vazia em `n8n_chat_histories` em até 20 min e silêncio do agente na mensagem seguinte do lead.

---

### P2: Contrato documentado e protegido contra divergência

**User Story**: Como quem integra ou reimplementa o contrato (INT-08), quero que o `openapi.yaml` descreva o que a API faz, e que a suíte avise quando ele divergir.

**Why P2**: O contrato está defasado desde o lote-8 e este lote muda remetentes e a representação do lead.

**Acceptance Criteria**:

1. The `openapi.yaml` SHALL documentar `assignedBroker` na resposta de `PATCH /leads/{id}`.
2. The test suite SHALL falhar quando o enum `ProblemCode` do `openapi.yaml` não tiver exatamente os mesmos valores de `ProblemCode` em `src/server/integration/problem.ts`.
3. The test suite SHALL falhar quando o enum `Sender` do `openapi.yaml` não tiver exatamente os mesmos valores de `senderEnum` em `src/db/schema.ts`.
4. The `openapi.yaml` SHALL documentar os campos de condução humana que a representação do lead expõe ao agente.
5. WHEN `POST /api/v1/leads/{id}/messages` recebe `sender: humano` THEN the system SHALL responder `400 payload-invalido` sem gravar a mensagem.
6. The `openapi.yaml` SHALL documentar que `sender: humano` aparece em `GET /leads/{id}/messages` e é recusado em `POST /leads/{id}/messages`.
7. The `openapi.yaml` SHALL documentar `GET /leads/{id}`, `GET /memory-resets` e o campo opcional `whatsappPhoneNumberId` de `POST /leads`. <!-- emenda D4 (Design, 2026-10-01) -->

**Independent Test**: Remover `conflito-de-agenda` do enum do `openapi.yaml` faz a suíte falhar; restaurar faz passar.

---

### P3: Cobrir o 413 e o JSON inválido de `POST /api/v1/leads` (L5 Fix 1)

**User Story**: Como mantenedor do contrato, quero teste dedicado para os dois caminhos de erro que só têm prova por leitura de código.

**Why P3**: Lacuna de evidência herdada do lote-5, sem defeito de comportamento.

**Acceptance Criteria**:

1. WHEN `POST /api/v1/leads` recebe um corpo maior que `MAX_BODY_BYTES` THEN the system SHALL responder `413` com `code: corpo-grande-demais`.
2. WHEN `POST /api/v1/leads` recebe um corpo que não é JSON válido THEN the system SHALL responder `400` com `code: payload-invalido`.

**Independent Test**: Os dois testes novos em `leads-post.test.ts` passam e falham ao remover a checagem correspondente da rota.

---

### P1: Provar por conversa real ⭐ MVP

**User Story**: Como responsável pelo produto, quero ver o humano no laço funcionando no WhatsApp de verdade antes de dar o lote por fechado.

**Why P1**: A AD-027 exige prova conversacional para toda mudança no fluxo do agente, e este lote muda o gate, o envio e a memória.

**Acceptance Criteria**:

1. The roteiro `n8n/smoke/roteiro.md` SHALL ganhar, no formato da AD-027 (intenção de turno, estado final exigido, limpeza entre cenários), os cenários: (a) assumir, responder pelo CRM e receber a resposta do lead sem recarregar; (b) devolver e o agente retomar usando um fato que só o corretor disse; (c) registrar opt-out pelo CRM; (d) `sair` durante a condução humana.
2. WHEN cada cenário termina THEN the evidence SHALL registrar o estado final no CRM, os ids das execuções do n8n conferidos com `get_execution` e as capturas de tela do CRM.
3. WHILE o cenário (a) roda the evidence SHALL mostrar zero mensagens do agente enviadas depois da marca, conferidas na thread do CRM e nas execuções `somente-registrar`.
4. The evidence SHALL incluir a captura do campo de envio bloqueado para um lead cuja última mensagem tem 24 horas ou mais.
5. The cenário SHALL ser aprovado ou reprovado pelo estado final no CRM e no WhatsApp; observações de fala ficam em seção separada e nunca reprovam sozinhas.

**Independent Test**: `n8n/smoke/evidencia.md` § Lote 14 com os quatro cenários aprovados, ids conferidos e capturas.

---

### P1: Registrar decisões e documentação ⭐ MVP

**User Story**: Como quem planeja os próximos lotes, quero as decisões deste lote registradas onde o projeto as procura.

**Why P1**: O `CLAUDE.md` proíbe contradizer AD ativa sem emendá-la, e este lote muda a trava humana (AD-018) e a semeadura da memória (AD-019).

**Acceptance Criteria**:

1. The `STATE.md` SHALL registrar uma AD com o modelo de condução (marca separada do status, conduzido por humano = marca ou `escalado_humano`, devolução libera a trava e reconstrói a memória), e SHALL marcar a AD-018 e a AD-019 com `amended by` nas cláusulas emendadas.
2. The `STATE.md` SHALL registrar a AD do caminho técnico de envio pelo CRM decidida no Design.
3. The `ROADMAP-POS-PILOTO.md` SHALL registrar o L14b com as decisões do usuário de 2026-10-01 (texto escrito pelo agente, antes de a janela fechar, só nas conversas do agente, substituindo o template) e SHALL marcar o item 3 do L14 como entregue no lote-3 (PIPE-04).
4. The `n8n/README.md` SHALL documentar a rota `somente-registrar` para a marca de condução humana, a consulta de condução antes do envio do agente e a reconstrução da memória depois da devolução.

**Independent Test**: As ADs novas existem em `STATE.md` com `amended by` nas AD-018 e AD-019, e `validate_spec.py` passa.

---

## Edge Cases

- WHEN o lead escreve enquanto o humano digita THEN the Chats SHALL exibir a mensagem do lead na próxima atualização periódica, sem limpar o texto em edição.
- WHEN dois usuários enviam ao mesmo lead quase ao mesmo tempo THEN the system SHALL entregar e gravar as duas mensagens, exibidas na ordem do instante de envio.
- IF um usuário envia de uma aba desatualizada depois que outro devolveu a conversa ao agente THEN the system SHALL recusar o envio (ENVIO-01 AC5) e a tela SHALL passar a mostrar a condução do agente.
- WHEN o lead em `qualificado_agendado` é assumido THEN the system SHALL mantê-lo na coluna de agendados e continuar enviando o lembrete da reunião.
- WHEN a devolução ocorre e o intervalo entre as mensagens passa de 12 horas THEN the system SHALL reconstruir a memória só com a sessão corrente, pela regra de sessão da AD-019.
- WHEN o texto contém formatação do WhatsApp (`*negrito*`, `_itálico_`) THEN the system SHALL enviá-lo sem alteração.
- IF o lead manda mídia sem texto com a conversa conduzida por humano THEN the system SHALL gravar a mensagem e não enviar a resposta fixa da rota `midia`.
- WHEN o lead é assumido e devolvido várias vezes na mesma sessão THEN the system SHALL reconstruir a memória na primeira mensagem do lead depois de cada devolução.

---

## Implicit-Requirement Dimensions Sweep

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | Texto de 1 a 4.096 caracteres sem espaços nas pontas (ENVIO-01 AC4); `sender: humano` recusado no contrato (CONTRATO-01 AC5). |
| Failure / partial-failure states | Meta recusa ou estoura 15 s: nada gravado, texto preservado (ENVIO-01 AC9). Meta aceita e gravação falha: log sem conteúdo e aviso (AC10). Confirmação de opt-out falha sem desfazer o registro (OPTHUM-01 AC5). |
| Idempotency / retry / duplicate handling | Chave de idempotência por envio (ENVIO-01 AC11); assumir de novo preserva a marca original (ASSUMIR-01 AC6); opt-out repetido não aparece (OPTHUM-01 AC7). |
| Auth boundaries & rate limits | `chats:escrever` + `LeadScope` em toda ação (ASSUMIR-01 AC3/AC4, ENVIO-01 AC7, DEVOLVER-01 AC8, OPTHUM-01 AC8); credencial de serviço não cria autoria humana (CONTRATO-01 AC5). Rate limit N/A: envio por digitação humana, muito abaixo do limite por número da Cloud API. |
| Concurrency / ordering | Turno do agente em andamento não envia depois da marca (SILENCIO-01 AC4); envios simultâneos ordenados pelo instante (Edge Cases); aba desatualizada é recusada pelo servidor (Edge Cases). |
| Data lifecycle / expiry | Janela de 24h com fronteira exata (JANELA-01 AC1); purga da memória em até 20 min depois do opt-out pelo CRM (OPTHUM-01 AC6); corte de sessão de 12h na reconstrução (Edge Cases). A marca não tem histórico (Out of Scope). |
| Observability | Mensagens humanas gravadas com autor e `externalId` da Meta (ENVIO-01 AC2); evento de log para entrega sem gravação (AC10); execuções `somente-registrar` identificam o silêncio do agente (HUMPROVA-01 AC3). Recusas do contrato seguem em `integration_refusals` (AD-023). |
| External-dependency failure | Meta fora ou lenta (ENVIO-01 AC9); número da imobiliária não configurado (AC8); consulta de condução falha bloqueia o envio do agente (SILENCIO-01 AC5). |
| State-transition integrity | Assumir não mexe no status (ASSUMIR-01 AC2); o contrato recusa status e reunião de lead com a marca (SILENCIO-01 AC9); devolver tira `escalado_humano` para `em_qualificacao` e libera a trava (DEVOLVER-01 AC2–AC4); opt-out é terminal (OPTHUM-01 AC7). |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| ASSUMIR-01 | P1: Assumir a conversa | T2, T3, T4, T5, T8, T18, T32, T40 | ✅ Verified |
| SILENCIO-01 | P1: Calar o agente enquanto o humano conduz | T3, T9, T10, T21, T23, T25, T26, T39, T40 | ✅ Verified |
| ENVIO-01 | P1: Responder pelo CRM | T2, T6, T8, T15, T16, T18, T20, T23, T33, T34, T38, T40 | ✅ Verified |
| JANELA-01 | P1: Respeitar a janela de 24h do WhatsApp | T4, T6, T15, T16, T31, T33, T34, T40 | ✅ Verified |
| THREAD-01 | P1: Ver a conversa com autoria e atualização automática | T2, T4, T7, T28, T29, T30, T31, T32, T34, T40 | ✅ Verified |
| DEVOLVER-01 | P1: Devolver a conversa ao agente | T1, T2, T3, T4, T5, T8, T11, T12, T18, T22, T24, T27, T32, T39, T40 | ✅ Verified |
| OPTHUM-01 | P1: Registrar o opt-out pelo CRM | T1, T4, T5, T12, T17, T18, T27, T32, T34, T39, T40 | ✅ Verified |
| CONTRATO-01 | P2: Contrato documentado e protegido contra divergência | T8, T9, T11, T12, T13, T36 | ✅ Verified |
| CONTRATO-02 | P3: Cobrir o 413 e o JSON inválido de `POST /api/v1/leads` (L5 Fix 1) | T14 | ✅ Verified |
| HUMPROVA-01 | P1: Provar por conversa real | T19, T37, T38, T40 | ✅ Verified com ressalva (capturas da T40 não versionadas; validation.md ciclo 2) |
| HUMDOC-01 | P1: Registrar decisões e documentação | AC1–AC3 cumpridos no planejamento (AD-034, AD-035, `amended by` em AD-018/AD-019, L14b no roadmap); AC4: T35 | ✅ Verified |

**Coverage:** 11 total, 11 mapped to tasks, 0 unmapped. 11 verificados pelo Verifier independente (ciclo 2, PASS, 15/15 mutantes mortos).

---

## Success Criteria

- [x] Numa conversa real, um corretor assume, responde pelo CRM, o lead recebe no WhatsApp e a resposta do lead aparece no Chats em até 10 s, sem recarregar.
- [x] Zero mensagens do agente enviadas ao lead entre assumir e devolver, no cenário (a) da prova.
- [x] Depois de devolver, o agente responde usando um fato que só o corretor escreveu.
- [x] O opt-out registrado pelo CRM grava `optedOutAt`, envia uma confirmação e esvazia a memória do agente em até 20 min.
- [x] A suíte falha quando `ProblemCode` ou `Sender` divergem entre código e `openapi.yaml`.
