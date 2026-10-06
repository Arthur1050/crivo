# Lote 14b — Reengajamento contextual dentro da janela

**Gathered:** 2026-10-02
**Status:** Executed — PASS independente do fechamento local ajustado em 2026-10-06.
G1/G3/G4 e telas de consumo Deferred → L14c; G2 corrigida. Ver Deferred Ideas abaixo.
**Origem:** `../../ROADMAP-POS-PILOTO.md`, seção L14b; decisões do usuário registradas em `../lote-14-humano-no-laco/context.md`, seção Janela de 24h.

## Feature Boundary

O agente retoma uma conversa em silêncio antes de fechar a janela de atendimento de 24h,
com texto escrito a partir do assunto anterior. O contato substitui o template de
reengajamento e preserva a regra de um reengajamento por silêncio. Só se aplica a
conversas conduzidas pelo agente. O escalonamento por silêncio de 48h permanece.

O lote inclui continuidade da memória e um disparo do agente sem nova mensagem do lead.
O usuário aprovou aviso de cobrança no Chats e barra de franquia estimada em Configurações,
junto ao WhatsApp, com classificação confirmada após a entrega.
Não inclui reconstrução do composer humano, campanhas, vitrine ou prontidão operacional do L15.

## Premissa de custo revisada

O roadmap chamou o lote de "reengajamento gratuito" porque pressupunha mensagem livre
sempre gratuita dentro da janela. Na consulta de 2026-10-02, o
[FAQ oficial do WhatsApp Business](https://whatsappbusiness.com/resources/faq/), pergunta
"How much does it cost to use the WhatsApp Business Platform?", informa cobrança de
mensagens de serviço desde 2026-10-01, após as primeiras 1.000 por número comercial por mês.

A página comercial de preços ainda apresenta a descrição genérica anterior de gratuidade.
A documentação de desenvolvedores retornou HTTP 429 na consulta inicial, mas foi acessada
pelo navegador na continuação de 2026-10-02. A página técnica de preços, atualizada em
2026-09-30, confirma a franquia e documenta como o webhook distingue mensagens gratuitas
de tarifáveis. Não foi consultado o consumo real da conta. O lote não pode prometer custo
zero só porque envia antes de 24h.

**Decisão do usuário (2026-10-02):** aprovada a proposta de barra de saldo estimado em
Configurações, aviso no Chats sem bloquear o envio e classificação gratuita/tarifável após
a entrega, inclusive para mensagens automáticas. Aprovação explícita: "Certo. Siga com a sua
proposta", depois de apresentada a diferença entre previsão e confirmação da Meta.
Não foi solicitado bloqueio automático nem orçamento. A retomada não exige custo zero.

### Pesquisa de viabilidade do aviso e da barra

Fontes primárias consultadas no navegador, sem acesso à conta nem envio de mensagens:

- [Preços da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing),
  atualização de 2026-09-30: cobrança por entrega; franquia mensal por número; reset no fuso
  da conta de mensagens; exemplos de webhook gratuitos e tarifáveis.
- [Pricing Analytics](https://developers.facebook.com/documentation/business-messaging/whatsapp/analytics#pricing-analytics),
  atualização de 2026-09-14: `VOLUME`, `COST`, filtros por número, categoria e tipo de preço;
  dados de insights aproximados por variações de processamento.

| Pergunta | Evidência e limite |
| --- | --- |
| A mensagem entregue foi tarifável? | O status traz `pricing.category = service`, `pricing.type = regular` e `billable = true`. Dentro da franquia, `type = free_customer_service` e `billable = false`. A confirmação é posterior ao envio, na entrega. |
| A próxima mensagem certamente terá custo? | Não foi encontrado mecanismo de cotação ou reserva atômica da franquia antes do envio. Consumo conhecido permite previsão, mas entregas concorrentes, dados pendentes e exceções impedem uma promessa geral de certeza. |
| Quanto resta da franquia? | Proposta de cálculo: `max(0, 1000 - volume mensal SERVICE/FREE_CUSTOMER_SERVICE do número)`, reconciliado com a Meta. É saldo estimado, não campo de saldo em tempo real fornecido pela API. |
| Quais mensagens contam? | Mensagens de serviço entregues pelo número, incluindo agente e humano via API. Não contar inbound, tentativa recusada, template ou duplicação de evento. `FREE_ENTRY_POINT` é outra isenção e precisa ser separado da franquia. |
| Há valor monetário exato no webhook? | O objeto de preço identifica a regra/categoria; não fornece o valor final da fatura. `COST` é aproximado e pode não estar disponível quando a conta usa a linha de crédito de um parceiro. |

O campo `TIER` de Pricing Analytics se refere aos descontos de volume de autenticação/utilidade;
não representa um contador de saldo da franquia de 1.000 mensagens de serviço. A granularidade
`HALF_HOUR` é agregação de dados, não uma garantia de atualização a cada 30 minutos.

### Experiência aprovada pelo usuário (2026-10-02)

- Barra mensal por número em Configurações, junto ao WhatsApp: exemplo ilustrativo
  "780 / 1.000 gratuitas usadas · cerca de 220 restantes", com última atualização.
- Resumo próximo ao composer do Chats, para que o corretor veja a previsão antes de enviar.
- Ao esgotar a franquia conhecida, aviso persistente de que mensagens de serviço podem gerar
  cobrança; não bloquear nem abrir confirmação a cada mensagem.
- Na mensagem, separar "cobrança prevista" de "tarifável confirmado pela Meta" e de "pendente".
  A mesma distinção vale para mensagens automáticas do agente, sem depender de alguém estar online.
- Falha de sincronização mostra saldo desatualizado ou indisponível, nunca inventa saldo nem
  apresenta mensagem sem classificação como gratuita.

### Consequências técnicas para o Design

- O fluxo atual desabilita status no trigger (`n8n/workflows/principal.ts:101`) e descarta
  esses eventos no filtro (`principal.ts:135`) e no normalizador (`n8n/src/normalize-event.mjs:30`).
  O CRM guarda aceitação da API, não confirmação de entrega nem classificação de cobrança.
- Capturar status em caminho que não execute o agente, verificar autenticidade e mapear o número
  para tenant. Deduplicar por identidade da mensagem e tratar eventos atrasados/fora de ordem.
- Não contar a mesma entrega duas vezes ao consultar Analytics e receber webhooks. A spec
  propõe que a barra use somente o snapshot mensal da Meta, e que eventos alimentem a
  classificação individual; não há cursor documental que permita somá-los com segurança.
  Contagem apenas de reengajamentos ou apenas da tabela de mensagens seria incorreta.
- Consultar o mês completo na ativação; não supor franquia intacta porque o recurso acabou
  de ser implantado. Fechar o alinhamento de fuso, número, conta e permissões da integração.
- Provar os limites 999/1.000/1.001, envio recusado, entrega tardia, replay, isenção FEP,
  virada do mês, falha de sincronização e isolamento entre números/tenants.
- Validar a resposta real de `pricing_analytics` e os eventos recebidos pela conta antes de
  prometer a precisão da barra. Esta pesquisa confirmou o contrato documental, não o acesso real.

## Decisões herdadas e confirmadas

- Texto livre antes de fechar a janela, gerado pelo agente com contexto; sem texto fixo.
- Só o agente pode conduzir a conversa elegível; marca humana e `escalado_humano` impedem contato.
- O template `reengajamento` é substituído, sem uma segunda tentativa paga depois de 24h.
- Permanece um único reengajamento por episódio de silêncio e o escalonamento de 48h.
- CRM é a fonte de verdade; memória do n8n é cache derivado (AD-019).
- Opt-out, isolamento por tenant e releitura da condução antes do envio permanecem obrigatórios.
- Prova conversacional segue AD-027, com tempo simulado e evidências salvas antes da limpeza.

## Estado reconciliado

- Branch `main`, HEAD `acde7b5`, sem alterações locais antes deste planejamento.
- HEAD e referência local `origin/main` sem divergência; não houve consulta ao remoto.
- L14 encerrado; T1–T40 arquivadas, Verifier PASS no ciclo 2. Não há tarefa de execução a retomar.
- Ressalvas herdadas: dois timeouts conhecidos de `DOCLIM-01 AC8`, erros de tipos anteriores
  ao L14 e capturas não versionadas da prova daquele lote. Nenhum gate foi reexecutado aqui.
- Lições confirmadas carregadas pelo script da skill. A proteção da AD-028 contra exclusão
  automática está presente no script utilizado.

## Evidências do código

| Fonte | Comportamento observado | Consequência para o planejamento |
| --- | --- | --- |
| `n8n/workflows/scheduler.ts:45` | Varredura a cada 15 minutos | Especificar intervalo elegível, não prometer disparo em segundo exato |
| `n8n/workflows/scheduler.ts:349` | Seleciona silêncio maior que 24h e `reengaged = false` | A retomada precisa mudar de janela e revalidar a elegibilidade antes de enviar |
| `n8n/workflows/scheduler.ts:524` | Envia template e registra texto genérico no CRM | A thread deve guardar o texto efetivamente enviado pela nova retomada |
| `n8n/workflows/scheduler.ts:616` | Escala se `reengaged = true` e último inbound anterior a 48h | Definir o desfecho quando não houve envio antes de fechar a janela |
| `n8n/src/session.mjs:35` | Expira pelo intervalo maior que 12h desde o último inbound | A retomada por volta de 22h exige uma exceção explícita de continuidade |
| `n8n/src/session.mjs:63` | Semeadura também corta intervalos maiores que 12h | Alterar só a expiração não preservaria o assunto em cold start |
| `n8n/src/conduction.mjs:40` | Regra proativa recusa opt-out e condução humana | Reutilizar a mesma regra na seleção e na última checagem antes do envio |
| `n8n/workflows/principal.ts:326` | Buffer grava `lastInboundAt` no recebimento | Disparo proativo não pode simular mensagem do lead nem renovar sua janela |
| `n8n/workflows/principal.ts:2121` | Finalização do turno redefine `reengaged = false` | O caminho proativo precisa evitar rearmar a própria tentativa |

## Padrões confirmados na especificação

Complexidade **Complex**: memória compartilhada, efeitos externos, concorrência entre
inbound e scheduler, idempotência e alteração de política de sessão. Prevê spec completa,
design e tasks completos antes da execução. Não há quantidade de tasks fixada ainda.

O usuário recebeu a escolha de ritmo (Guiado, Rápido ou Detalhado). Sem preferência,
o padrão da skill é Guiado. Não há delegação de decisões novas registrada nesta sessão.

| Área | Padrão da spec, confirmado em 2026-10-02 | Alternativas e implicações |
| --- | --- | --- |
| Momento da retomada | Primeiro tick elegível a partir de 22h desde a última mensagem do lead; nunca enviar com janela fechada | 23h deixa menos margem; tornar configurável acrescenta uma configuração ao produto |
| Horário de contato | Reutilizar os dias/horários de reuniões do tenant, com o padrão existente seg–sex 09h–18h no fuso do piloto; perder a janela implica omitir o envio | Esses campos hoje limitam propostas de reunião; a aplicação ao contato é nova e está marcada como suposição A2 |
| Público | Qualificação incompleta: em_qualificacao e fase não encerrada, além das proteções de condução | Não herdar o filtro amplo atual que alcança qualificado_agendado |
| Continuidade | Ponte da sessão anterior para retomada aceita e resposta anterior a 48h da âncora; depois segue a regra normal de 12h, inclusive em cold start | Emenda restrita registrada na AD-036; não altera globalmente a duração das sessões |
| Falhas e 48h | Uma chamada externa por episódio; preparação pode repetir antes disso; resultado incerto não reenvia; escalar às 48h também quando não houve aceite | Evita duplicatas e conversa sem desfecho |
| Consumo | Snapshot mensal da Meta a cada 15min; consulta sem sucesso por mais de 60min fica desatualizada | Estimativa explícita e sem dupla contagem; não é SLA da Meta |

A pergunta opcional sobre 22h e horário comercial foi enviada antes da spec completa.
O usuário confirmou a especificação apresentada com "Aprovo" em 2026-10-02, incluindo
os padrões A1–A13. A tabela de suposições preserva os motivos e registra essa aprovação.

### Exploração de arquitetura

Recomendação A: manter o trigger WhatsApp atual como entrada verificada; encaminhar os status
ao CRM em ramo que não executa o agente. O CRM controla de forma durável os episódios e
envia a retomada depois da geração contextual pelo n8n, além de guardar classificação e
snapshots. Alternativa B: receber todos os eventos no CRM e encaminhar somente mensagens
do lead ao n8n por uma entrada autenticada. Ambas entregam a mesma spec; B reduz execuções
de status, mas exige trocar e provar o recebimento atual de mensagens.

Comparação, riscos e gates factuais em `design.md`. Arquitetura A confirmada pelo usuário
em 2026-10-02: “Aprovo. Siga com a recomendação”.
Na leitura MCP, o principal continua ativo em `e3e25681-8cd1-4ea3-bc38-33d373cf6b80`.
O retorno sanitizado apresentou `options: {}` no trigger, enquanto fonte e gerado registram
`messageStatusUpdates: []`: conferir a configuração efetiva antes da publicação; não houve
mudança remota. O schema nativo consultado permite selecionar `delivered` e `failed`.

### Pontos incorporados aos critérios de aceitação

- Definir limites exatos de tempo e casos imediatamente antes, no limite e depois dele (L-023).
- Definir estados de pipeline elegíveis: a spec antiga fala em qualificação incompleta,
  enquanto o filtro atual só exclui `fase = encerrada`. Não copiar essa diferença sem decisão.
- Cancelar tentativa pendente se chegar mensagem do lead, houver opt-out ou um humano assumir.
- Impedir dois ticks ou reexecuções de gerarem dois envios no mesmo episódio de silêncio.
- Registrar o texto real e a identidade da mensagem aceita, sem fabricar inbound ou sucesso.
- Definir efeitos permitidos no turno proativo: retomar contato não equivale a autorização
  para agendar uma reunião ou inventar nova preferência do lead.
- Definir o limite de continuidade da memória, cold start, reset pedido pelo CRM e resposta tardia.
- Provar que scheduler, disparo do agente e envio estão conectados, além dos testes isolados (L-026).
- Verificar antes da prova o workflow publicado e filas vencidas (L-051); salvar capturas (L-054).
- Se mudar o system message compartilhado, planejar paridade do benchmark e remedição (L-048).

## Próximo passo

A experiência de consumo está aprovada. A especificação completa foi produzida com 13 requisitos e 95 critérios,
incluindo janela, continuidade, falhas, classificação por entrega, barra, avisos e prova integrada.
`validate_spec.py --strict` passou com zero erros e zero avisos; `git diff --check` passou.
A spec e a arquitetura A foram confirmadas. Design detalhado produzido com interfaces,
estados duráveis, projeção mínima da fase no CRM, ponte warm/cold, consumo, UI e matriz de
cobertura. Usuário aprovou o Design e solicitou Tasks: “Aprovo. Vá para as tarefas”.
O plano em `../../archive/lote-14b-reengajamento-contextual/tasks.md` contém 68 tarefas em nove fases, testes co-localizados e os 95 ACs
mapeados individualmente. Tasks/matriz/ferramentas e agentes sequenciais posteriormente aprovados;
próximo passo: iniciar Execute em outra janela com `../../archive/lote-14b-reengajamento-contextual/EXECUTE-PROMPT.md`.
Nenhuma implementação iniciada.

### Evidência adicional do Design (2026-10-02)

- Verificada somente a presença do token local de envio, sem expor seu valor nos resultados;
  WABA não cadastrada no ambiente local nem encontrada na documentação do projeto.
  ID solicitado ao usuário por pergunta de informação, sem pedir token. Conta real ainda
  não consultada: vínculo, fuso, acesso, payload mensal e zero permanecem não comprovados.
- O código tem fase somente em conversa_estado, não no lead do CRM. Proposta técnica:
  projeção mínima versionada para revalidar a fase atomicamente com as demais condições.
  Ingestão e atribuição precisam de lock/execução transacional nos caminhos novos.
- Discovery Astryx executado pela instalação npx existente, sem instalar pacotes:
  build, templates de configurações/composer, ProgressBar/Banner/Token/Text e guia layout.
  Resumo fica fora do composer para permanecer visível na condução automática.
- Guia de Route Handlers do Next instalado lido. Sem código de produto ou mutation remota.
- Contrato de biz_opaque_callback_data não confirmado em fonte primária; excluído do desenho
  base. Despacho sem identidade recuperável mantém resultado incerto e nunca reenvia.

### Aprovação de Design e identificação pela extensão (2026-10-02)

- Usuário autorizou avançar para Tasks e buscar o ID no navegador com a extensão.
- O inventário da extensão Chrome mostrou as abas Meta Business Suite e Gerenciador do
  WhatsApp, com WABA `1000796702954808` nos parâmetros selected_asset_id/asset_id; a primeira
  especifica selected_asset_type=whatsapp-business-account. Business ID `402905505501945`
  é distinto do WABA; o phoneNumberId ainda não foi confirmado.
- Aba de referência: `https://business.facebook.com/latest/settings/whatsapp_account/?business_id=402905505501945&selected_asset_id=1000796702954808&selected_asset_type=whatsapp-business-account`.
- A seleção da aba falhou por timeout de CDP; não houve captura de pixels. O ID foi obtido
  do estado do navegador retornado pela extensão, sem acessar abas alheias ao projeto.
- Leitura autorizada com token servidor pela Graph v25.0 retornou HTTP200, ID
  `1000796702954808`, nome `Test WhatsApp Business Account` e `timezone_id=1`. Saída
  sanitizada, sem token. Não houve envio, escrita de env, publicação ou alteração de conta.
- É uma conta de teste: isso não prova tarifação real nem que seja o canal de produção.
  Tradução de timezone_id para IANA por fonte primária, vínculo número/tenant, Analytics,
  mês/zero e autenticidade da versão instalada continuam gates pendentes.
- Diretrizes de testes/configuração e oito testes existentes foram amostrados para a
  matriz de Tasks. Vitest, Postgres isolado, grafo SDK/Code nodes e DTO/render estático;
  comandos reais extraídos dos manifestos/scripts. Não foi inventado runner E2E nem
  threshold de cobertura. Nenhum teste do produto rodou nesta fase documental.

### Aprovação de Tasks e handoff (2026-10-02)

O usuário respondeu “Aprovo. Gere o prompt de execução para que a fase de execução seja
iniciado em outra janela de contexto” à proposta de tarefas, ferramentas e agentes por
lotes sequenciais. A aprovação cobre os 68 itens, matriz/gates, perfis S/R/N/U e oferta de
workers; não repetir essas confirmações na próxima janela. Gerado `../../archive/lote-14b-reengajamento-contextual/EXECUTE-PROMPT.md`.
Nenhuma tarefa executada, teste do produto rodado ou worker despachado nesta janela.
Commits locais de implementação autorizados pela aprovação; ações externas continuam
dependendo de autorização específica, conforme o escopo aprovado e a skill.

## Deferred Ideas

### L14c — ativação em produção e provas externas (2026-10-06)

Decisão explícita do usuário no fechamento: a conta WhatsApp de produção ainda não
existe. G1 (conta/canal e instalação real), G3 (status autênticos instalados) e G4
(Analytics real) de `validation.md` passam a **Deferred → L14c**, junto das telas
de consumo T57/T60/T61/T62 já adiadas. O fechamento do L14b verifica a entrega
local; não afirma ativação em produção nem converte fixtures em prova externa.

- G1: A11/A12 e parcelas de instalação/transporte dos requisitos REEN-01…05,
  L14B-01 e PROVA-01. L14c deve comprovar conta/número/tenant/fuso, versões e filas
  instaladas, handlers e entrega autorizada antes de ativar o caminho contextual.
- G3: PRECO-01 AC1/AC2/AC3/AC6/AC7, na parcela de origem e entrega reais, e
  PRECO-02 AC1, na autenticação instalada. Reducer, persistência, isolamento,
  replay e classificação local continuam entregues pelo L14b. L14c comprovará
  HMAC raw-body/assinatura inválida e o forwarder instalado até a thread.
- G4: USO-01 AC1, na consulta/ativação real do mês integral, e os vínculos de
  conta/número/fuso de L14B-01 AC2. L14c comprovará cobertura mensal, filtros,
  paginação e zero antes de habilitar Analytics e saldo.
- Telas: USO-01 AC8; USO-02 AC4/AC5/AC7; USO-03 AC1…AC6; USO-04 AC1…AC5,
  nas parcelas de UI. T57/T60/T61/T62 continuam adiadas; T58/T59 são PRECO.

G2 permanece no L14b: correção `b92caeb`, serialização `116b52b` e sensor de
identidade `e92035c` já entregues em T69/T70/T71. Conferir seus testes e a prova
histórica versionada, sem executar novamente modelo, WhatsApp ou serviço externo.
Não criar tarefas adicionais neste fechamento.

Nesta sessão não há publicação/alteração n8n, deploy, DDL de produção, envio
WhatsApp, leitura Graph nem workflow temporário. O usuário reverteu o scheduler
de produção à versão L14; não republicar. Consumo permanece indisponível com
adapter padrão ausente e sem saldo presumido. Nenhuma captura ou JSON novo entra
em commit; evidências não rastreadas permanecem locais. L14c depende da futura
conta de produção e de autorização específica para as ações externas.

### L14c — superfícies de consumo adiadas (2026-10-03)

Por instrução posterior do usuário, USO-03/USO-04 relativos a saldo, barra e
avisos de consumo (T57, T60, T61, T62) passam ao L14c. T58/T59 continuam
somente para classificação por entrega (PRECO), sem previsão de saldo.
Preflight real repetido: Graph v25.0 confirmou WABA `1000796702954808` como
conta de teste; GET phone_numbers HTTP200 confirmou um número, ID
`1321478747709350`. Pricing Analytics DAILY HTTP200 retornou apenas um ponto
parcial [1790838000,1790924400), SHA256
`cf034004d4f1a19dde5731ba777c16520d83ca0a311cc541d52771489e75bb93`.
Workflow ativo `0B1nqjODu7xuYYKF`, versão `e3e25681-8cd1-4ea3-bc38-33d373cf6b80`,
não expôs vínculo de conta/número de produção na leitura sanitizada. Somente a
conta de teste foi comprovada acessível; conta/número efetivos de produção,
tenant, IANA, cobertura mensal e zero permanecem não comprovados. Nenhum saldo
é presumido: código de consumo mantém adapter ausente/usageEnabled=false e
resultado “Consumo indisponível”. REEN, PRECO e provas locais continuam no L14b;
as parcelas externas G1/G3/G4 passam ao L14c pela decisão de 2026-10-06 acima.

### Falha anterior adiada na execução (2026-10-02)

Usuário: “Registre essa falha para que seja resolvido posteriormente. Por enquanto,
foque nas tasks desse lote e finalize elas”. Registrar para correção posterior os
timeouts de 30s de `DOCLIM-01 AC8` em `src/server/__tests__/actions.test.ts:1337`
e `:1349`. Baseline repetido: 2400/2402 testes; build/lint passaram. Evidência e
hipótese ainda não comprovada em [baseline.md](../../archive/lote-14b-reengajamento-contextual/baseline.md). Não alterar nem
pular esses testes neste lote. Prosseguir com as tarefas aprovadas, reportando
esses dois resultados como ressalva e exigindo os gates das mudanças do L14b.

Bloqueio por orçamento, cobrança ao cliente, relatório financeiro e tarifa em reais ficam fora
da proposta de barra e aviso. O usuário não solicitou essas capacidades.
As pendências do L14 permanecem no contexto daquele lote; não foram incorporadas ao L14b.
