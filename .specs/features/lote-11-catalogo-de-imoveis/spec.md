# Catálogo de imóveis — Specification

## Problem Statement

Hoje o agente conversacional **não sabe nada sobre o inventário** da imobiliária. A única fonte de
conhecimento que ele consulta é `consultar_documentos`, e `ContextDocument.content` é `null`
hardcoded (`src/server/integration/context.ts:22`) — na prática o agente recebe o **título do
arquivo**. Quando o lead faz a pergunta mais frequente de uma qualificação ("quais opções de 3
quartos até 500 mil no Santa Maria?"), o agente não tem como responder sem inventar.

Não existe tabela de imóveis no schema, e a necessidade foi declarada por um dono de imobiliária
real (usuário, 2026-09-04) — o único item do backlog inteiro com demanda de cliente, não inferida.

## Goals

- [ ] A imobiliária cadastra, edita e publica imóveis no CRM, com o corretor de captação registrado
      em cada um.
- [ ] O agente responde a pergunta de inventário com **consulta SQL determinística** — resposta
      exata, barata, sem alucinação — através da tool `buscar_imoveis`.
- [ ] Os três desfechos já provados no lote-10 (qualificar→agendar, escalar, opt-out) continuam
      passando depois da tool nova entrar no fluxo.
- [ ] O dado nasce com os dois campos de que o L16 depende (publicação e referência legível), para
      que a vitrine não precise migrar dado existente.

## Out of Scope

Explicitamente excluído. Documentado para impedir scope creep.

| Feature | Reason |
| --- | --- |
| Vitrine pública do catálogo | É o L16 inteiro (AD-025), projeto Next separado com usuário de banco SELECT-only. Este lote produz o dado; nenhuma superfície pública nasce aqui. |
| `revalidateTag` disparado pelo CRM ao publicar/despublicar/vender | Pertence ao L16 — não existe app pública para revalidar antes dele. |
| Upload real de foto e storage de binário | L12 item 1. Este lote guarda **URL externa**; a migração para storage é aditiva (AD-004). |
| Preview/download de arquivo | L12 item 5, mesma razão. |
| Relação imóvel↔lead, registro de interesse por unidade | Fora do modelo por decisão do usuário (2026-09-04): traria a questão de comissão para dentro do escopo técnico. `leads` não é tocado por este lote. |
| Ampliar `propertyTypeEnum` (a enum de qualificação) | Arrastaria `parsers.ts`, o rótulo de `n8n/src/phase.mjs:33` e a republicação do workflow, mudando o que o agente pergunta ao lead. O catálogo ganha enum própria. |
| Busca vetorial / RAG sobre descrição de imóvel | Consulta estruturada é estritamente melhor para a pergunta da qualificação. Fica no L-RAG condicional (L12 item 4). |
| Histórico de preço, propostas, reserva com prazo | Não pedidos. Um imóvel guarda o preço atual e um status. |
| Alterar o gate `n8n/src/gate.mjs` ou a política de campos de `phase.mjs` | A tool nova é aditiva ao AI Agent; a máquina determinística de fase e de opt-out não muda. |

---

## Assumptions & Open Questions

Toda ambiguidade está resolvida ou registrada aqui — nada fica silenciosamente indefinido.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Origem dos filtros da tool | `tenantSlug` sempre por expressão do fluxo; os critérios de busca (bairro, faixa de preço, quartos, tipo, modalidade) vêm do modelo via `$fromAI` | A AD-018 restringe **identidade** ao fluxo, não critério de busca — o modelo é o único que sabe o que o lead acabou de pedir. Precedente idêntico já publicado: `registrar_qualificacao` usa `$fromAI` para o valor do campo e expressão do fluxo para `leadId` | y |
| Quantos imóveis a tool devolve | No máximo 3 por chamada | É resposta de WhatsApp, não listagem. Mais de 3 vira parede de texto e força o modelo a resumir, que é onde ele inventa | y |
| Ordenação do resultado | `updatedAt` decrescente, `id` crescente como desempate | Determinística (testável) e favorece inventário fresco, que é o que o corretor empurra. O desempate por `id` segue a convenção de determinismo já usada em `broker-assignment` (lote-7/AD-022) | y |
| O agente saber que existem mais opções | O payload carrega o total de imóveis que casaram com o filtro, além dos ≤3 devolvidos | Sem o total, o agente afirma "tenho 3 opções" quando há 20 — erro factual causado pelo formato do payload, não pelo modelo | y |
| Resultado vazio | A tool devolve lista vazia com total 0, e o system message obriga o agente a declarar a ausência | Lista vazia sem instrução é exatamente a condição em que o modelo preenche a lacuna sozinho | y |
| Moeda e unidade no banco | Preço em centavos (`bigint`), área em metros quadrados inteiros | `leads.budgetCents` já é `bigint` em centavos (`src/db/schema.ts:147`) — usar o mesmo tipo evita conversão na comparação com o orçamento do lead. É a lição `L-019`: usar o identificador já gravado, nunca um suposto | y |
| Moeda na fronteira do contrato | A rota `/api/v1` recebe filtro de preço em **reais inteiros** e devolve o preço **já formatado** em pt-BR; centavos nunca atravessam a fronteira | Pedir centavos ao modelo é convidar erro de ordem de grandeza ("500 mil" → `500000` em vez de `50000000`), silencioso e na pergunta mais frequente da qualificação. Devolver o valor formatado tira do modelo a tarefa de formatar moeda. Mesma disciplina do achado do lote-10 `evidencia.md` §15.4: a forma do payload decide o comportamento, não a instrução | y |
| Transição de status do imóvel | Livre entre `disponivel`, `reservado` e `vendido`, sem tabela de transições permitidas | Diferente de `leads`, o imóvel não tem trava humana nem ator agente — só gestor e administrador escrevem, e um imóvel volta de `reservado` para `disponivel` rotineiramente. A visibilidade é **derivada** (`disponivel` E `publicado`), então nenhum estado precisa de guarda para sumir do agente | y |
| Ciclo de vida e expiração | Nenhum. Imóvel não expira e não entra na rotina de cron de retenção | `vendido` é estado, não expiração; o dado do imóvel não é dado pessoal e não carrega a obrigação de TTL que `documents` carrega (DOC-07) | y |
| Rate limit da rota nova | Nenhum próprio — herda o contrato de serviço existente (chave de serviço + `X-Crivo-Tenant`, SEC-01) | Nenhuma rota `/api/v1` tem rate limit próprio hoje; criar um só para esta seria inconsistência sem motivo | y |
| Exclusão de imóvel | Exclusão real, não soft delete | Nada referencia imóvel (não há relação com lead, por decisão de modelagem), então não há dado órfão possível. Despublicar já é o caminho para "tirar do ar sem perder" | y |
| Endereço no CRM | O CRM guarda e mostra logradouro, número e complemento; só a rota `/api/v1` não os devolve | O corretor precisa do endereço para atender; o lead não deve recebê-lo antes da reunião. A separação é por camada, não por ausência do dado | y |

**Open questions:** none — todas resolvidas no discuss (`context.md`) ou registradas acima.

---

## User Stories

### P1: Cadastro de imóveis no CRM ⭐ MVP

**User Story**: Como gestor de uma imobiliária, quero cadastrar e manter o inventário de imóveis no
CRM, com o corretor de captação em cada um, para que a imobiliária tenha uma fonte única do que está
à venda.

**Why P1**: É o dado. Sem ele não existe nem tool nem vitrine.

**Acceptance Criteria**:

1. The system SHALL persistir imóvel em tabela própria com `tenant_id` obrigatório referenciando `tenants`, e toda leitura e escrita SHALL ser filtrada pelo tenant ativo (AD-002).
2. The system SHALL guardar por imóvel: tipo, modalidade (`modalityEnum` existente), logradouro, número, complemento, bairro, cidade, UF, preço em centavos, área em metros quadrados, quartos, banheiros, vagas, status, descrição, referência, publicação, captador, `createdAt` e `updatedAt`.
3. The system SHALL exigir corretor de captação em todo imóvel, como chave estrangeira para `users.id`.
4. IF o captador informado não for membro ativo da mesma imobiliária THEN o sistema SHALL recusar a escrita e SHALL NOT criar nem alterar a linha.
5. WHEN um imóvel for criado THEN o sistema SHALL atribuir a ele uma referência legível única dentro da imobiliária.
6. WHILE um imóvel existir, sua referência SHALL permanecer imutável.
7. IF duas criações concorrentes gerarem a mesma referência no mesmo tenant THEN o índice único do banco SHALL rejeitar a segunda, e a segunda operação SHALL NOT gravar linha parcial.
8. WHEN o gestor editar um imóvel THEN o sistema SHALL gravar a alteração e atualizar `updatedAt`.
9. WHEN o gestor excluir um imóvel THEN o sistema SHALL remover a linha, e nenhuma outra tabela SHALL ficar com referência órfã.
10. The system SHALL usar uma enum própria de tipo de imóvel para o catálogo.
11. The system SHALL manter `propertyTypeEnum` inalterada em valores e em todos os seus consumidores.

**Independent Test**: com um usuário gestor, cadastrar um imóvel completo, editá-lo, e ver a linha no
banco com `tenant_id`, captador e referência preenchidos; tentar salvar com um captador de outra
imobiliária e receber recusa.

---

### P1: Permissão e navegação ⭐ MVP

**User Story**: Como administrador, quero que só quem administra o inventário possa alterá-lo, para
que o que o agente cita ao lead não dependa de quem tem acesso ao CRM.

**Why P1**: A tela sem permissão é uma superfície de escrita aberta a todo corretor da imobiliária.

**Acceptance Criteria**:

1. The system SHALL registrar `imoveis` como recurso na matriz de permissões (`src/lib/permissions.ts`), concedendo `ler` e `escrever` a administrador e a gestor, e apenas `ler` a corretor.
2. WHEN um corretor abrir a tela de imóveis THEN o sistema SHALL exibir o inventário completo da imobiliária em modo leitura, sem nenhum controle de criação, edição ou exclusão.
3. IF um corretor disparar uma operação de escrita sobre imóvel THEN o servidor SHALL recusá-la, independentemente de o controle estar visível na interface.
4. WHILE o usuário não tiver `ler` em `imoveis`, o item de menu correspondente SHALL NOT aparecer na navegação.
5. The system SHALL manter a decisão de permissão como função pura, consumida tanto pela navegação quanto pelo servidor.
6. The system SHALL NOT introduzir escopo por captador análogo ao `LeadScope` — o corretor enxerga o inventário inteiro da imobiliária.

**Independent Test**: entrar como corretor e confirmar leitura sem controles de escrita; chamar a
operação de escrita diretamente e receber recusa; entrar como gestor e ver os controles.

---

### P1: Publicação, status e fotos ⭐ MVP

**User Story**: Como gestor, quero controlar o que está disponível e o que está publicado, para que
um imóvel vendido saia da boca do agente na mesma ação em que sai do ar.

**Why P1**: É o par de campos que decide a visibilidade — e é do que o L16 vai depender.

**Acceptance Criteria**:

1. The system SHALL guardar o status do imóvel em `disponivel`, `reservado` ou `vendido`, e a publicação como estado booleano independente do status.
2. WHEN o gestor alterar status ou publicação THEN o sistema SHALL gravar a alteração sem exigir nenhuma transição intermediária.
3. The system SHALL definir "visível ao público" como a conjunção `status = disponivel` E `publicado = verdadeiro`, e essa definição SHALL ser a única usada por qualquer consumidor externo ao CRM.
4. The system SHALL guardar as fotos como lista ordenada de URLs externas.
5. The system SHALL NOT persistir nenhum byte de imagem.
6. IF uma URL de foto não começar com `http://` ou `https://` THEN o sistema SHALL recusar a escrita indicando o campo.
7. The system SHALL limitar a lista de fotos a 12 URLs por imóvel.

**Independent Test**: publicar um imóvel disponível e confirmar que ele aparece na consulta do
contrato; marcá-lo como vendido e confirmar que sumiu, sem despublicá-lo.

---

### P1: Validação de entrada ⭐ MVP

**User Story**: Como gestor, quero que o CRM recuse dado impossível no cadastro, para que o agente
nunca cite um imóvel de 0 m² ou de preço negativo ao lead.

**Why P1**: O dado deste lote é lido em voz alta por um agente para um cliente real.

**Acceptance Criteria**:

1. IF o preço em centavos não for inteiro maior que zero THEN o sistema SHALL recusar a escrita indicando o campo.
2. IF a área em metros quadrados não for inteiro maior que zero THEN o sistema SHALL recusar a escrita indicando o campo.
3. IF quartos, banheiros ou vagas forem negativos ou não inteiros THEN o sistema SHALL recusar a escrita indicando o campo.
4. IF bairro, cidade, UF, tipo, modalidade ou status estiverem presentes e vazios no payload THEN o sistema SHALL recusar a escrita indicando o campo.
5. IF um campo obrigatório estiver ausente do payload de criação THEN o sistema SHALL recusá-lo pela mesma regra do campo vazio, e SHALL NOT tratar ausência como "manter valor atual".
6. The system SHALL limitar a descrição a 4000 caracteres.
7. IF qualquer validação falhar THEN o sistema SHALL NOT gravar nenhuma parte do imóvel.

**Independent Test**: submeter cada campo inválido isoladamente e confirmar recusa por campo, com o
banco inalterado.

---

### P1: Rota de consulta do contrato de integração ⭐ MVP

**User Story**: Como agente conversacional, quero consultar o inventário publicado da imobiliária por
critério, para responder ao lead com dado exato em vez de inventar.

**Why P1**: É a ponte entre o dado e o agente — sem ela o CRUD não tem consumidor de produção.

**Acceptance Criteria**:

1. WHEN a rota de busca de imóveis receber requisição autenticada com `X-Crivo-Tenant` válido THEN o sistema SHALL devolver apenas imóveis daquela imobiliária que satisfaçam `status = disponivel` E `publicado = verdadeiro`.
2. The system SHALL aceitar como filtros opcionais modalidade, tipo, bairro, cidade, preço máximo em reais inteiros, preço mínimo em reais inteiros e número mínimo de quartos, combinando por conjunção os filtros presentes.
3. WHEN nenhum filtro for informado THEN o sistema SHALL devolver os imóveis visíveis da imobiliária sob a mesma ordenação e o mesmo limite.
4. The system SHALL devolver no máximo 3 imóveis por chamada, ordenados por `updatedAt` decrescente com `id` crescente como desempate.
5. The system SHALL incluir na resposta a contagem total de imóveis que casaram com o filtro, mesmo quando maior que o número de imóveis devolvidos.
6. The system SHALL devolver por imóvel exclusivamente referência, tipo, modalidade, bairro, cidade, UF, preço já formatado em Real brasileiro, área em metros quadrados, quartos, banheiros e vagas.
7. The system SHALL NOT incluir na resposta logradouro, número, complemento, descrição nem qualquer URL de foto.
8. The system SHALL NOT incluir na resposta nenhum campo do corretor de captação — id, nome, telefone ou e-mail.
9. IF um parâmetro de filtro tiver valor inválido para o seu tipo THEN o sistema SHALL responder `400` em `application/problem+json` com `code` `payload-invalido`.
10. IF a requisição não trouxer chave de serviço válida ou `X-Crivo-Tenant` reconhecido THEN o sistema SHALL recusá-la pelo mesmo caminho das demais rotas `/api/v1`, sem cair em nenhum tenant default (SEC-01).
11. WHEN a rota receber método diferente do método de leitura THEN o sistema SHALL responder `405` em `problem+json`.
12. The system SHALL registrar toda resposta igual ou superior a `400` desta rota em `integration_refusals` pelo wrapper único de rota, com o export marcado como instrumentado (AD-023).

**Independent Test**: chamar a rota com chave de serviço e tenant válidos e conferir o corte de
visibilidade, o limite de 3, o total, e a ausência de endereço e de captador no corpo; repetir com
tenant de outra imobiliária e confirmar que nenhum imóvel vaza.

---

### P1: Tool `buscar_imoveis` no fluxo do agente ⭐ MVP

**User Story**: Como lead no WhatsApp, quero perguntar o que a imobiliária tem no meu critério e
receber opções reais, para decidir se vale agendar uma visita.

**Why P1**: É o valor declarado pelo cliente-âncora — "o agente não sabe nada".

**Acceptance Criteria**:

1. The system SHALL expor a busca ao AI Agent como tool nomeada `buscar_imoveis`, no mesmo padrão de nó HTTP já usado por `consultar_documentos`.
2. The system SHALL preencher o cabeçalho de tenant da tool por expressão do fluxo.
3. The system SHALL NOT permitir que a imobiliária consultada seja escolhida pelo modelo.
4. WHERE o modelo fornecer critérios de busca, o sistema SHALL passá-los como parâmetros de consulta declarados, um parâmetro por critério.
5. IF a rota responder erro THEN a tool SHALL entregar o erro ao agente sem abortar a execução, e o turno SHALL terminar com resposta ao lead.
6. WHEN a busca não retornar nenhum imóvel THEN o agente SHALL informar ao lead que não há imóvel casando com o critério, e SHALL NOT citar imóvel algum.
7. The system SHALL instruir o agente a citar apenas os campos devolvidos pela tool, sem prometer endereço exato nem nome do corretor de captação ao lead.
8. The system SHALL remover da fronteira de capacidade do system message as cláusulas "não busca imóveis" e "não informa preços".
9. The system SHALL manter na fronteira de capacidade a cláusula que proíbe o agente de mandar fotos e arquivos.
10. The system SHALL manter `n8n/src/gate.mjs` e a política de campos de `n8n/src/phase.mjs` sem alteração funcional.
11. The system SHALL manter as 5 tools existentes registradas, e a contagem de nós e de conexões do workflow SHALL refletir exatamente a adição da tool nova.
12. WHEN o workflow for publicado na instância THEN o sistema SHALL conferir o hash do artefato publicado contra o gerado a partir do repositório antes de ativar.
13. WHEN o lead demonstrar dúvida, incerteza ou comparações prolongadas sem avanço THEN o system message SHALL orientar um convite consultivo para reunião sem exigir escolha ou aprovação de um imóvel, e SHALL orientar respeito à recusa do convite.
14. WHEN o lead informar um critério novo ou alterar o que procura THEN o system message SHALL orientar a busca com os critérios informados, mesmo que seja um único critério, e SHALL NOT exigir buscas repetidas antes de atender um pedido de reunião ou um aceite de horário.
15. WHEN o lead cumprimentar e perguntar como o atendente está THEN o system message SHALL orientar resposta à cortesia e apresentação natural, e SHALL NOT orientar pergunta de qualificação nesse mesmo turno se nenhum pedido foi trazido.
16. WHEN o agente citar uma opção real THEN o system message SHALL exigir referência e preço de cada imóvel citado, usando os valores devolvidos pela tool.
17. IF o agendamento falhar por indisponibilidade técnica THEN o system message SHALL orientar que a reunião ainda não está confirmada, SHALL NOT prometer confirmação ou aviso automático futuro, e SHALL NOT tratar a falha como horário ocupado nem pedir alternativas de horário por esse motivo.
18. WHEN o agente propuser um horário em qualquer fase THEN o system message SHALL exigir aguardar o aceite antes de chamar agendar_reuniao, e SHALL NOT tratar interesse por imóvel, dúvida ou agradecimento como aceite de horário.
19. WHEN uma busca válida retornar vazio com bairro flexível THEN o system message SHALL orientar UMA busca alternativa automática no mesmo turno omitindo apenas bairro, SHALL preservar tipo, modalidade, orçamento, quartos e cidade confirmada, e SHALL NOT retirar bairro obrigatório nem mudar os critérios gravados do lead.
20. WHEN a expansão também retornar vazio ou não couber ampliar bairro THEN o system message SHALL orientar convite consultivo nessa mesma resposta, SHALL NOT pedir preço ou quartos para refinar um conjunto já vazio, e SHALL NOT repetir combinação ou expansão já consultada para adiar o convite.
21. WHERE o agente montar argumentos de buscar_imoveis THEN o prompt e a descrição da tool SHALL orientar omitir filtros desconhecidos sem strings vazias ou zero, usar cidade confirmada sem /UF e bairro real sem termos de proximidade, e SHALL informar que a tool não calcula distância ou adjacência.
22. WHEN uma opção anterior informar cidade ou uma consulta retirar bairro THEN o system message SHALL proibir inferir a cidade desejada do lead dessa opção, SHALL exigir localização real de cada alternativa e explicação da ampliação para outros bairros, e SHALL NOT afirmar proximidade sem informação confiável.
23. WHEN uma consulta falhar tecnicamente THEN o system message e a descrição da tool SHALL distinguir falha de resultado vazio, e SHALL NOT orientar inventar ausência de imóveis.
24. WHEN apresentar um imóvel THEN o system message SHALL orientar linhas separadas em uma mensagem na ordem tipo/modalidade e referência, bairro e cidade/UF, quartos/banheiros/vagas, área e preço, SHALL usar apenas campos e valores devolvidos, e SHALL separar eventual pergunta ou convite em outra mensagem respeitando três mensagens por turno, sem emoji, tabela ou markdown.

**Segunda emenda aprovada em 2026-09-14**: AC19–24 concretizam
`AJUSTE-PROATIVIDADE-PROPOSTO.md`, aprovada pelo usuário para implementação local.
Não criam geografia, parser, renderer determinístico ou estado adicional. As ACs
verificam instruções; proatividade, momento do convite e legibilidade do modelo
continuam dependendo de nova conversa real após publicação autorizada.

**Emenda aprovada em 2026-09-14**: AC13–18 registram a revisão em
`AJUSTE-PROMPT-PROPOSTO.md`, aprovada pelo usuário após a conversa real. A exigência
absoluta da T30 de buscar antes de propor qualquer reunião é substituída pela AC14.
Busca continua disponível e proativa; escolha de imóvel não condiciona reunião.
Essas ACs provam instruções do prompt por teste, não garantem obediência do modelo:
PROVA-02 continua dependendo de conversa real após a nova publicação.

**Independent Test**: rodar o workflow contra um lead de descarte pedindo um critério que casa e um
que não casa, e conferir os dois turnos.

---

### P2: Prova conversacional da tool nova

**User Story**: Como responsável pelo produto, quero a tool nova provada por conversa real, para que
o inventário citado ao lead tenha evidência e não julgamento.

**Why P2**: Não é MVP funcional, mas a AD-027 nomeia "nova tool" como caso de uso obrigatório do
protocolo — e o lote-10 mostrou que 11 defeitos reais só apareceram por conversa real.

**Acceptance Criteria**:

1. The system SHALL acrescentar ao roteiro versionado `n8n/smoke/roteiro.md` um cenário de consulta de inventário, descrito como intenção de turno e nunca como fala literal (AD-027).
2. The system SHALL nomear no checklist de limpeza os alvos a resetar antes do cenário, na ordem n8n→CRM, com linha de confirmação antes de o cenário começar.
3. WHEN o cenário for executado por conversa real THEN o agente SHALL citar ao lead ao menos um imóvel existente no catálogo daquela imobiliária, com referência e preço batendo com a linha do banco.
4. WHEN o lead pedir um critério que nenhum imóvel satisfaz THEN o agente SHALL declarar a ausência ao lead, e nenhum imóvel SHALL ser citado nesse turno.
5. The system SHALL registrar, para cada rodada do cenário, o id da execução n8n e a captura da conversa.
6. The system SHALL aprovar ou reprovar o cenário exclusivamente pelo desfecho observado, mantendo observações de qualidade de fala em seção separada que não reprova sozinha (AD-027).
7. WHEN o cenário de qualificar→agendar do lote-10 for repetido após a entrada da tool THEN o lead SHALL terminar em `qualificado_agendado` com responsável atribuído.

**Independent Test**: executar o cenário novo e o de regressão pelo roteiro e conferir os dois
desfechos no CRM.

---

### P3: Seed do catálogo

**User Story**: Como quem desenvolve o produto, quero imóveis no seed determinístico, para que a tela
e a tool tenham dado para exercitar sem depender de cadastro manual.

**Why P3**: Conveniência de desenvolvimento e de teste, não valor de produto.

**Acceptance Criteria**:

1. WHEN o seed for executado THEN o sistema SHALL criar imóveis para cada imobiliária do seed, com captador entre os usuários daquela imobiliária.
2. The system SHALL produzir no seed ao menos um imóvel de cada combinação de status e publicação necessária para exercitar o corte de visibilidade.
3. WHEN o seed for executado duas vezes sobre banco limpo THEN o sistema SHALL produzir o mesmo conjunto de imóveis nas duas execuções.

**Independent Test**: rodar o seed duas vezes sobre banco limpo e comparar as linhas.

---

## Edge Cases

- IF o preço mínimo informado for maior que o preço máximo THEN o sistema SHALL responder `400` `payload-invalido`, e SHALL NOT devolver lista vazia silenciosamente.
- IF um filtro de preço não for inteiro positivo em reais THEN o sistema SHALL responder `400` `payload-invalido`, e SHALL NOT interpretá-lo como centavos.
- IF o número mínimo de quartos for zero ou negativo THEN o sistema SHALL responder `400` `payload-invalido`.
- WHEN o filtro de bairro for informado com diferença de caixa ou de acento THEN o sistema SHALL casar o imóvel mesmo assim.
- IF a imobiliária não tiver nenhum imóvel cadastrado THEN a rota SHALL responder lista vazia com total zero, e SHALL NOT responder erro.
- IF a imobiliária não tiver nenhum imóvel cadastrado THEN a tela SHALL distinguir "nenhum imóvel cadastrado" de "nenhum imóvel casa com o filtro atual", como a tela de Documentos já faz.
- IF o captador de um imóvel for desativado da imobiliária THEN o imóvel SHALL permanecer válido e visível, e o sistema SHALL NOT recusar leituras por causa disso.
- IF a exclusão de um usuário for tentada enquanto ele for captador de algum imóvel THEN o sistema SHALL recusá-la, preservando a integridade da chave estrangeira.
- WHEN o número de imóveis que casam com o filtro for exatamente 3 THEN o total devolvido SHALL ser 3 e a lista SHALL ter 3 itens.
- WHEN o número de imóveis que casam com o filtro for exatamente 4 THEN a lista SHALL ter 3 itens e o total devolvido SHALL ser 4.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| IMOV-01 | P1: Cadastro de imóveis no CRM | Design | In Design |
| IMOV-02 | P1: Cadastro de imóveis no CRM | Design | In Design |
| IMOV-03 | P1: Cadastro de imóveis no CRM | Design | In Design |
| IMOV-04 | P1: Permissão e navegação | Design | In Design |
| IMOV-05 | P1: Publicação, status e fotos | Design | In Design |
| IMOV-06 | P1: Publicação, status e fotos | Design | In Design |
| IMOV-07 | P1: Validação de entrada | Design | In Design |
| BUSCA-01 | P1: Rota de consulta do contrato de integração | Design | In Design |
| BUSCA-02 | P1: Rota de consulta do contrato de integração | Design | In Design |
| BUSCA-03 | P1: Rota de consulta do contrato de integração | Design | In Design |
| BUSCA-04 | P1: Tool `buscar_imoveis` no fluxo do agente | Design | In Design |
| BUSCA-05 | P1: Tool `buscar_imoveis` no fluxo do agente | Execute | T34 publicada; nova prova real pendente |
| PROVA-01 | P2: Prova conversacional da tool nova | Design | In Design |
| PROVA-02 | P2: Prova conversacional da tool nova | Design | In Design |
| SEEDIM-01 | P3: Seed do catálogo | Design | In Design |

**Coverage:** 15 IDs no total, 0 mapeados a tasks (a fase Tasks ainda não foi executada).

### Mapa de cobertura

Cada ID acima, contra os critérios de aceite que ele carrega.

| Requisito | Cobre |
| --- | --- |
| IMOV-01 | Cadastro AC1, AC2, AC8, AC9 — a entidade, os campos e o ciclo de escrita, escopados por `tenant_id` |
| IMOV-02 | Cadastro AC3, AC4 — captador obrigatório e restrito a membro ativo da mesma imobiliária |
| IMOV-03 | Cadastro AC5, AC6, AC7, AC10, AC11 — referência única e imutável com a trava no banco, e a enum própria do catálogo |
| IMOV-04 | Permissão AC1–AC6 — matriz, leitura do corretor, recusa no servidor, item de menu, ausência de escopo por captador |
| IMOV-05 | Publicação AC1, AC2, AC3 — status, flag e a definição única de visibilidade |
| IMOV-06 | Publicação AC4, AC5, AC6, AC7 — fotos como URL externa, com validação e teto |
| IMOV-07 | Validação AC1–AC7 e os Edge Cases de payload |
| BUSCA-01 | Rota AC1, AC2, AC3, AC10, AC11, AC12 — contrato, filtros, autenticação, método e instrumentação |
| BUSCA-02 | Rota AC4, AC5 e os Edge Cases de fronteira 3 e 4 — limite, ordenação determinística e total |
| BUSCA-03 | Rota AC6, AC7, AC8, AC9 — payload mínimo, ausência de endereço e de captador, recusa de filtro inválido |
| BUSCA-04 | Tool AC1, AC2, AC3, AC4, AC11, AC12 — o nó, a origem dos parâmetros, a paridade do workflow e a conferência de hash |
| BUSCA-05 | Tool AC5–10 e AC13–24 — erro, resultado vazio, citação, fronteira/gate, busca proativa, convite sem escolha, cortesia, falha sem promessa, aceite explícito, expansão limitada, filtros válidos e apresentação em linhas |
| PROVA-01 | Prova AC1, AC2, AC5, AC6 — roteiro, checklist de limpeza, evidência e barra por desfecho |
| PROVA-02 | Prova AC3, AC4, AC7 — os dois desfechos do cenário novo e a regressão do cenário do lote-10 |
| SEEDIM-01 | Seed AC1, AC2, AC3 |

---

## Success Criteria

- [ ] Um gestor cadastra um imóvel completo pelo CRM e ele aparece no banco com `tenant_id`,
      captador e referência preenchidos, sem intervenção manual no banco.
- [ ] Um corretor abre a mesma tela e não encontra nenhum caminho de escrita, nem na interface nem
      chamando a operação diretamente.
- [ ] A rota de busca devolve, para duas imobiliárias distintas com a mesma chave de serviço,
      conjuntos disjuntos de imóveis — nenhum vazamento entre tenants.
- [ ] Em conversa real, o agente cita ao lead um imóvel cuja referência e preço batem com a linha do
      banco, e declara ausência quando nenhum imóvel casa com o critério.
- [ ] O cenário qualificar→agendar do lote-10, repetido depois da tool nova entrar, termina em
      `qualificado_agendado` com responsável atribuído.
- [ ] O piso de testes do projeto sobe monotonicamente e o gate build completo passa em cada task.
