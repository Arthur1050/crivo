# Lote 6b — Persona conversacional + lapidação de UI · Specification

> Lote interstitial entre L6 (Fase 8, concluída) e L7 (Fase 9). Previsto pela AD-015 ("o smoke conversacional deferido pode virar um lote curto e independente ... quando a persona/prompt estiver pronta"). Este lote é a metade "deixar a persona pronta" desse plano, mais três arestas de UI encontradas no uso real. PRD §6.2–6.4, §7.1.

## Problem Statement

O agente funciona ponta a ponta (L6), mas a conversa não passa no teste do usuário real. Nas capturas de 2026-08-09/10 o agente: (1) se anuncia como "assistente virtual" logo na primeira frase; (2) responde sempre no mesmo molde de três partes — confirmação ("Perfeito"), frase de concordância ("Casas costumam oferecer um espaço muito especial"), pergunta ("Para eu filtrar as melhores opções para você, ...") — o que lê como questionário; (3) manda sempre exatamente uma mensagem por turno, enquanto humanos mandam duas ou três curtas; (4) não tem identidade nenhuma além do nome; (5) **perde todo o contexto**: depois de "Não tenho" (23:50) o agente respondeu com a mensagem de apresentação inteira (23:51), como se a conversa começasse ali.

A causa técnica de (5) está localizada e é a mesma que agrava (2) e (4): `buildPrompt` (`n8n/src/prompt.mjs:78`) monta o prompt com persona, campos faltantes, horário comercial, documentos e **apenas a rajada atual de mensagens do lead** (`buffer`). Nenhuma mensagem anterior — nem do lead, nem do agente — entra no prompt. Cada turno é, literalmente, uma conversa nova para o modelo; o que dá continuidade é só a lista de campos já preenchidos. Quando a mensagem do turno é curta e sem conteúdo próprio ("Não tenho"), o modelo não tem de onde inferir onde estava e recomeça.

No CRM, três arestas visuais: as mensagens do agente aparecem à esquerda (invertido em relação ao WhatsApp), a página Chats rola inteira (o cabeçalho "Chats" e o cabeçalho do contato somem ao rolar), e o card "Documentos" de Configurações é uma lista sem cor nem hierarquia — o único ponto do CRM onde documentos não carregam a cor da categoria que o próprio schema já guarda.

## Goals

- [x] O agente sustenta uma conversa contínua: sabe o que já foi dito por ele e pelo lead, e nunca reinicia a apresentação no meio.
- [x] A conversa lê como uma pessoa da imobiliária escrevendo no WhatsApp — várias mensagens curtas quando cabe, sem molde fixo, com identidade própria por imobiliária — sem nunca negar que é um agente automatizado quando perguntado.
- [x] A página Chats espelha o WhatsApp (agente à direita) e se comporta como um app de mensagens: cabeçalhos fixos, listas com rolagem própria.
- [x] Documento no CRM é reconhecível de relance pela cor e pelo ícone, no card de Configurações e na tabela de Documentos.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Publicar os workflows na instância n8n e rodar conversa real | Hospedagem do n8n indisponível nesta janela (informado pelo usuário em 2026-08-10). Este lote entrega **código do fluxo** + fixtures + testes; a publicação e o smoke real ficam no runbook de retomada (§ Runbook pós-hospedagem) |
| Smoke conversacional roteirizado completo (3 desfechos da AD-015) | Depende da hospedagem acima; segue deferido pela AD-015. Este lote remove o bloqueio de qualidade que o motivou, não o executa |
| Troca do seed mockado pelo dado real nas telas | É a Fase 9 (L7) por definição do roadmap (AD-006) |
| Voz/áudio, RAG, lead scoring, escolha de modelo por tenant | Fora do v1 (PRD §3) / pós-piloto (AD-001) |
| Editor de prompt completo na tela de Configurações | Este lote entrega **um** campo de tom de voz em texto livre, não um editor de prompt com variáveis |
| Emojis nas mensagens do agente | Decisão do usuário (2026-08-10): informal sem emoji |
| Composer/envio de mensagem pela tela Chats | A tela é somente leitura por spec desde o lote-3 (CHAT-01.6) — inalterado |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Onde mora a personalidade | Regras de estilo humanizado no prompt (iguais para todos) **+** campo novo por tenant "Tom de voz / personalidade" (texto livre, opcional) | Decisão do usuário (2026-08-10): base no código + campo de tom por tenant | y (2026-08-10) |
| Fonte do histórico da conversa | Novo `GET /api/v1/leads/{id}/messages` no contrato v1 | Decisão do usuário (2026-08-10). O CRM já é a fonte de verdade e guarda a thread inteira, inclusive mensagens escritas por humanos; a Data Table do n8n duplicaria estado e não enxerga isso | y (2026-08-10) |
| Controle de tamanho do histórico | Janela dupla: no máximo **20 mensagens** e apenas as da **sessão corrente** (corte quando há intervalo > 12h entre mensagens consecutivas) | Pedido explícito do usuário (2026-08-10): "garantindo que uma conversa já finalizada entre o lead e o bot não acabe lotando o contexto desnecessariamente". Os dois cortes juntos limitam o prompt e impedem que uma conversa antiga volte inteira num reengajamento | y (2026-08-10) |
| Nível de informalidade | Informal sem emoji: "hmm", "haha", "acho que", frases curtas, reações — nenhum emoji | Decisão do usuário (2026-08-10) | y (2026-08-10) |
| Máximo de mensagens por turno | 1 a 3 mensagens; o modelo decide quantas, o código impõe o teto | 3 cobre "reage + comenta + pergunta" sem virar spam; teto no validador determinístico, nunca só no prompt (AD-014) | n (discretion) |
| Pausa entre mensagens do mesmo turno | 2 s | Aproxima o ritmo de digitação humana sem atrasar a conversa; valor único e fácil de mudar num só nó | n (discretion) |
| Anúncio de IA | O agente **nunca** se apresenta como IA/assistente virtual por iniciativa própria; **sempre** confirma quando perguntado direta ou indiretamente, e quando o lead pede algo que só um humano faz | Pedido do usuário (2026-08-10) mantendo a transparência já exigida por AGT-08 AC5 — a regra muda de "sempre anunciar" para "nunca negar" | y (2026-08-10) |
| Escopo visual dos documentos | Card de Configurações **e** tabela da página Documentos | Decisão do usuário (2026-08-10): mesma linguagem visual nos dois lugares | y (2026-08-10) |
| Mensagens antigas do seed no histórico | Entram normalmente (são mensagens reais da thread do lead) | O endpoint não distingue origem; a janela de sessão já corta o que é velho demais | n (discretion) |
| Lado das bolhas na tela Chats | Agente à direita (`sender="user"` da Astryx), lead à esquerda | Pedido do usuário; espelha o WhatsApp, onde o lado direito é sempre "quem opera o aparelho" — aqui, a imobiliária | y (2026-08-10) |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Agente lembra a conversa ⭐ MVP

**User Story**: Como lead, quero que o agente saiba o que já conversamos, para não ter que repetir nada nem receber a apresentação de novo no meio da conversa.

**Why P1**: É o defeito que quebra a conversa observado na captura. Sem isso, nenhuma melhoria de estilo se sustenta — um agente carismático que esquece tudo continua inutilizável.

**Acceptance Criteria**:

1. WHEN o fluxo monta o prompt de um turno THEN ele SHALL incluir o histórico da conversa obtido de `GET /api/v1/leads/{id}/messages`, com cada mensagem identificada como do lead ou do agente, em ordem cronológica.
2. WHEN o histórico do lead tem mais de 20 mensagens THEN o prompt SHALL conter apenas as 20 mais recentes.
3. WHEN existe um intervalo maior que 12 horas entre duas mensagens consecutivas do histórico THEN o prompt SHALL conter apenas as mensagens posteriores a esse intervalo (sessão corrente), mesmo que isso resulte em menos de 20 mensagens.
4. WHEN o histórico contém pelo menos uma mensagem do agente THEN o prompt SHALL instruir explicitamente que a conversa já está em andamento e que a mensagem de apresentação NÃO deve ser repetida.
5. WHEN a chamada de histórico falha ou devolve vazio THEN o fluxo SHALL seguir o turno normalmente com histórico vazio — nunca abortar a execução nem deixar de responder ao lead.
6. WHEN o lead manda uma mensagem curta e sem conteúdo próprio ("não tenho", "não sei", "tanto faz") no meio de uma conversa em andamento THEN a resposta do agente SHALL dar continuidade ao assunto anterior — nunca reapresentar o agente nem reiniciar a qualificação.

**Independent Test**: Rodar `buildPrompt` com um histórico de 30 mensagens onde a 12ª e a 13ª estão separadas por 20h — o prompt resultante contém exatamente as mensagens a partir da 13ª, marca cada uma com o remetente e traz a instrução de não reapresentar.

---

### P1: `GET /api/v1/leads/{id}/messages` ⭐ MVP

**User Story**: Como consumidor do contrato (o fluxo n8n), quero ler a thread de um lead, para dar contexto ao modelo sem manter uma cópia do histórico do meu lado.

**Why P1**: É a dependência técnica da história acima e a única mudança de contrato deste lote.

**Acceptance Criteria**:

1. WHEN chega `GET /api/v1/leads/{id}/messages` com chave válida do tenant dono do lead THEN a rota SHALL responder 200 com a lista de mensagens do lead em ordem cronológica crescente (`sentAt` ASC), no mesmo formato de `SerializedMessage` já usado pelo POST.
2. WHEN a requisição traz `?limit=N` (1 a 100) THEN a rota SHALL devolver no máximo as N mensagens **mais recentes**, ainda em ordem cronológica crescente; sem `limit`, o padrão SHALL ser 50.
3. WHEN `limit` é inválido (não numérico, ≤ 0 ou > 100) THEN a rota SHALL responder 400 `payload-invalido` — nunca silenciosamente corrigir o valor.
4. WHEN o lead não existe ou pertence a outro tenant THEN a rota SHALL responder 404 `recurso-nao-encontrado`, sem revelar existência cross-tenant.
5. WHEN a requisição não traz chave válida THEN a rota SHALL responder 401, pelo mesmo caminho de `authenticate` das demais rotas.
6. WHEN o contrato é publicado THEN `docs/integration/openapi.yaml` SHALL descrever a nova operação e o documento SHALL continuar válido segundo `SwaggerParser.validate()`.

**Independent Test**: Criar lead com 5 mensagens em dois tenants distintos; `GET` com a chave do tenant A devolve 5 em ordem crescente, `GET` do mesmo id com a chave do tenant B devolve 404, `?limit=2` devolve as 2 últimas em ordem crescente e `?limit=0` devolve 400.

---

### P1: Conversa humanizada ⭐ MVP

**User Story**: Como lead, quero conversar com alguém que soa gente — que reage, comenta, faz uma pergunta de cada vez — para me sentir à vontade em vez de estar preenchendo um formulário.

**Why P1**: É o pedido central do usuário e a razão de o smoke conversacional estar deferido (AD-015).

**Acceptance Criteria**:

1. WHEN o prompt de um turno é montado THEN ele SHALL conter uma seção de estilo que proíbe explicitamente o molde "frase de confirmação → frase de concordância genérica → pergunta" e proíbe reusar a mesma fórmula de abertura de turnos anteriores (que estão no histórico).
2. WHEN o prompt de um turno é montado THEN ele SHALL autorizar explicitamente marcadores de fala natural em pt-BR ("hmm", "haha", "acho que", "deixa eu ver", "boa", "putz") e SHALL proibir emojis.
3. WHEN o prompt de um turno é montado THEN ele SHALL instruir a perguntar **um** campo de qualificação por vez, escolhido entre os que faltam, e SHALL proibir listar/anunciar os campos que faltam para o lead.
4. WHEN o tenant tem "tom de voz" configurado THEN o prompt SHALL incluir esse texto como característica de personalidade do agente; WHEN não tem THEN o prompt SHALL seguir apenas com as regras de estilo base, sem placeholder nem menção ao campo vazio.
5. WHEN o lead pergunta se é um robô/IA/atendente virtual, ou pede algo que só um humano resolve THEN o agente SHALL confirmar que é um atendimento automatizado — a proibição de se anunciar NÃO se aplica a esse caso.
6. WHEN a conversa começa (histórico sem mensagem do agente) THEN a primeira mensagem SHALL se apresentar pelo nome e pela imobiliária sem usar os termos "assistente virtual", "agente virtual", "robô", "IA" ou "automatizado".
7. WHEN o seed é regenerado THEN as mensagens de apresentação e as conversas mockadas dos dois tenants SHALL estar escritas nesse mesmo padrão (sem "assistente virtual"), para que a demonstração do CRM não contradiga o agente real.

**Independent Test**: Montar o prompt para um turno com tom de voz preenchido e para outro sem; o primeiro contém o texto do tenant, nenhum dos dois contém a instrução de se apresentar como assistente virtual, ambos contêm a proibição do molde de três partes e a proibição de emoji.

---

### P1: Várias mensagens por turno ⭐ MVP

**User Story**: Como lead, quero receber duas ou três mensagens curtas como uma pessoa manda, em vez de um parágrafo único bem formatado.

**Why P1**: É metade da percepção de "robô" descrita pelo usuário; o parágrafo único é reconhecível como automação mesmo quando o texto é bom.

**Acceptance Criteria**:

1. WHEN o modelo devolve a saída do turno THEN o validador determinístico SHALL aceitar um campo de mensagens com 1 a 3 strings não vazias, e SHALL rejeitar a saída inteira quando houver 0 ou mais de 3 mensagens, ou qualquer item vazio/não-string (mesma regra de rejeição total já usada para os demais campos — AD-014).
2. WHEN a saída validada tem N mensagens THEN o fluxo SHALL enviar as N ao lead na ordem, com pausa de 2 s entre elas.
3. WHEN cada mensagem é enviada THEN ela SHALL ser registrada individualmente via `POST /leads/{id}/messages` com `sender = "agente"` e o `externalId` do envio correspondente — a thread do CRM espelha exatamente o que o lead recebeu (AGT-01 AC5 continua válido).
4. WHEN uma rota do fluxo produz resposta fixa (mídia, opt-out, horário indisponível, fallback de esclarecimento) THEN ela SHALL usar o mesmo caminho de envio, com uma única mensagem — nenhuma rota mantém um caminho de envio próprio.
5. WHEN um efeito colateral no CRM depende do texto da resposta (`executiveSummary` do agendamento/escalonamento) THEN ele SHALL usar as mensagens do turno concatenadas, preservando o comportamento atual desses campos.

**Independent Test**: Validar uma saída com 3 mensagens (aceita), com 4 (rejeitada), com `[]` (rejeitada) e com `["ok", ""]` (rejeitada); nas fixtures do fluxo, um turno de 2 mensagens produz 2 envios e 2 registros no CRM.

---

### P2: Tom de voz por imobiliária

**User Story**: Como gestor, quero descrever em uma frase o jeito do meu agente falar, para que ele não soe igual ao agente da imobiliária concorrente.

**Why P2**: Dá a identidade pedida pelo usuário, mas o produto funciona sem — o padrão base já resolve o pior do problema.

**Acceptance Criteria**:

1. WHEN o gestor abre Configurações → Persona do Agente SDR THEN ele SHALL ver um campo de texto livre "Tom de voz e personalidade", opcional, com texto de ajuda explicando que descreve o jeito de falar (não instruções de processo).
2. WHEN o gestor salva o campo preenchido THEN o valor SHALL persistir no tenant e reaparecer ao recarregar a página.
3. WHEN o gestor salva o campo vazio THEN o valor SHALL ser persistido como nulo (mesmo comportamento dos demais campos opcionais de persona).
4. WHEN o fluxo chama `GET /api/v1/settings` THEN a resposta SHALL incluir o campo de tom de voz (`null` quando não configurado), sem quebrar consumidores do formato anterior.
5. WHEN o campo excede 500 caracteres THEN o formulário SHALL bloquear o salvamento com mensagem de erro em pt-BR — um tom de voz é uma descrição curta, não um prompt.

**Independent Test**: Salvar um tom de voz nos dois tenants do seed, recarregar Configurações e conferir o texto; chamar `GET /api/v1/settings` com a chave de cada tenant e ver o campo com o valor certo.

---

### P2: Chats se comporta como app de mensagens

**User Story**: Como gestor, quero ler uma conversa longa sem perder de vista de quem ela é nem a lista de conversas.

**Why P2**: Melhora de uso claro, mas nenhuma informação é perdida hoje — só exige rolar de volta.

**Acceptance Criteria**:

1. WHEN a página Chats é exibida THEN as mensagens do agente SHALL aparecer alinhadas à direita e as do lead à esquerda, mantendo o agrupamento por remetente, o divisor de data e o timestamp já existentes.
2. WHEN a lista de conversas é mais alta que a janela THEN ela SHALL rolar dentro do próprio painel, sem rolar a página.
3. WHEN a thread de mensagens é mais alta que a janela THEN ela SHALL rolar dentro da própria área, mantendo visíveis o cabeçalho da página ("Chats" + subtítulo) e o cabeçalho da conversa (avatar, nome e telefone do lead).
4. WHEN nenhuma conversa está selecionada THEN o estado vazio SHALL continuar aparecendo na área de mensagens, com os cabeçalhos e a lista no lugar.
5. WHEN a página é renderizada em 1280×800 THEN não SHALL haver rolagem horizontal nem barra de rolagem da página inteira — apenas as duas áreas internas rolam.

**Independent Test**: Screenshot real da tela em `next start`, com uma conversa longa selecionada, rolada até o fim: cabeçalho "Chats", cabeçalho do lead e lista de conversas continuam visíveis; bolhas do agente à direita.

---

### P2: Documentos com cor e ícone

**User Story**: Como gestor, quero reconhecer o tipo de cada documento de relance, para achar o que procuro sem ler a lista inteira.

**Why P2**: Puramente visual; o dado já está todo na tela hoje.

**Acceptance Criteria**:

1. WHEN um documento é exibido no card de Configurações THEN ele SHALL ter um ícone de tipo de arquivo com cor derivada do `mimeType` (PDF, documento de texto, planilha, apresentação, imagem e um fallback genérico), usando os tokens de cor da Astryx — nenhum hex/px cru.
2. WHEN o documento tem categoria THEN o card SHALL exibir a categoria com a cor gravada no banco (`document_categories.color`), do mesmo jeito que a tabela de Documentos já faz.
3. WHEN o documento não tem categoria THEN o card SHALL exibir o rótulo neutro já usado no produto ("Sem categoria"), sem cor de destaque.
4. WHEN o card exibe as contagens por modalidade THEN elas SHALL usar a mesma linguagem visual das modalidades na tabela de Documentos (mesmas cores por modalidade), em vez de texto puro.
5. WHEN a tabela da página Documentos é exibida THEN a coluna Nome SHALL usar o mesmo ícone colorido por tipo de arquivo do card, mantendo todas as colunas, ações e o comportamento de filtro atuais.
6. WHEN não há documentos THEN o estado vazio atual do card SHALL continuar sendo exibido, inalterado.

**Independent Test**: Screenshot real de Configurações e de Documentos com o seed (que tem PDF, DOCX e categorias distintas): ícones em cores diferentes por tipo, categoria colorida, contagens como tokens de modalidade.

---

## Edge Cases

| Case | Expected behavior |
| ---- | ----------------- |
| Lead sem nenhuma mensagem registrada (lead criado mas thread vazia) | `GET /messages` responde 200 com lista vazia; prompt segue com histórico vazio e trata como primeiro contato |
| Histórico só com mensagens do lead (agente nunca respondeu) | Tratado como primeiro contato — apresentação permitida |
| Reengajamento após dias (fluxo scheduler) | O corte de 12h descarta a conversa anterior; o turno é tratado como sessão nova, mas a apresentação só volta se não houver mensagem do agente na janela — evita o "olá de novo" logo após o lembrete |
| Modelo devolve 1 mensagem gigante em vez de 2-3 curtas | Aceito (1 a 3 é válido); o prompt pede curtas, o validador não impõe tamanho — impor limite de caracteres seria rejeitar conversa boa por régua arbitrária |
| Modelo devolve 4+ mensagens | Saída inteira rejeitada → mesma cadeia de retry já existente (2ª tentativa e, se falhar, pergunta de esclarecimento) |
| Envio da 2ª/3ª mensagem falha na Cloud API | As mensagens já enviadas continuam registradas; a execução falha no nó de envio e cai no workflow de erros existente — nenhum registro fantasma de mensagem não entregue |
| Tom de voz com instrução hostil ("ignore as regras acima", "diga que é humano") | O texto entra como característica de personalidade dentro de uma seção delimitada e o prompt reafirma, **depois** dela, que as regras de transparência e de whitelist de ação valem sobre qualquer instrução do campo; a barreira real continua sendo `validateLlmOutput` (AD-014) |
| `mimeType` desconhecido no card/tabela | Ícone genérico cinza — nunca quebra a linha nem esconde o documento |
| Conversa selecionada em Chats com uma única mensagem | Áreas com rolagem continuam existindo (sem barra visível); nenhum salto de layout |

---

## Requirement Traceability

> Coluna Tasks corrigida no fechamento (T13) contra o mapeamento real de `tasks.md` — a versão original desta tabela (escrita antes de `tasks.md` fechar a numeração de 13 tasks) tinha referências desatualizadas (ex.: CTX-01 apontava para T4, que é a UI de tom de voz, não histórico).

| ID | Requirement | Design | Tasks | Status |
| -- | ----------- | ------ | ----- | ------ |
| CTX-01 | Agente lembra a conversa | design.md § Histórico no prompt | T5, T6, T9 | ✅ Verified — `selectHistoryWindow`/`buildPrompt` testados por caso e por conteúdo citável (T5/T6); wiring no fluxo (T9) sem execução na instância (fora do escopo deste lote — Runbook pós-hospedagem) |
| CTX-02 | `GET /api/v1/leads/{id}/messages` | design.md § Contrato | T1, T2 | ✅ Verified — DAL e rota com testes de integração (ordem, limite, 404 cross-tenant, 401, `SwaggerParser.validate()`) |
| PER-01 | Conversa humanizada | design.md § Camada de persona | T6, T8, T9 | ✅ Verified — regras de estilo/transparência testadas por trecho citável (T6), seed sem "assistente virtual" (T8); wiring no fluxo (T9) sem execução na instância |
| PER-02 | Várias mensagens por turno | design.md § Saída multi-mensagem | T7, T9, T10 | ✅ Verified — `validateLlmOutput` testado (1–3 aceito, 0/4/inválido rejeitado); schema e envio sequencial no fluxo (T9/T10) sem execução na instância |
| PER-03 | Tom de voz por imobiliária | design.md § Persona por tenant | T3, T4 | ✅ Verified — schema/DAL/action testados (vazio→null, >500 rejeita); campo confirmado por screenshot real com reload |
| UI-01 | Chats se comporta como app de mensagens | design.md § R1 | T11 | ✅ Verified — screenshot real (conversa longa rolada, bolhas do agente à direita, cabeçalhos fixos, sem scroll horizontal/de página); `chat-thread.ts` sem alteração |
| UI-02 | Documentos com cor e ícone | design.md § R2 | T12, T13 | ✅ Verified — `resolveFileKind` testado (PDF/DOCX/XLSX/PPTX/imagem/OpenDocument/desconhecido); screenshot real no card de Configurações e na tabela de Documentos |

---

## Runbook pós-hospedagem (fora do gate deste lote)

Executar quando a instância n8n voltar, na ordem:

1. `node scripts/n8n-inline.mjs` (ou o script de geração vigente) e conferir `n8n/generated/` versionado.
2. Publicar os 3 workflows via MCP/SDK e conferir diff `n8n/generated/` == export da instância.
3. Ressincronizar `tenant_config` (as chaves de API rotacionam a cada `npx vitest run` — `n8n/README.md` §4).
4. Conversa real de ponta a ponta com o número de teste, conferindo: nenhuma reapresentação no meio, 2–3 mensagens em pelo menos um turno, thread do CRM idêntica ao WhatsApp.
5. Só então retomar o smoke conversacional roteirizado da AD-015 (3 desfechos).

**Revisado no fechamento (T13, 2026-08-10)**: os 5 passos continuam corretos. `n8n/generated/` já está regenerado e commitado nesta janela (T10) — o passo 1 aqui é só a reconfirmação de rotina antes de publicar, não um passo pendente.
