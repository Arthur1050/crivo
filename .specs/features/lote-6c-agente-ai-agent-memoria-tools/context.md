# Lote 6c — AI Agent, memória persistente e tools determinísticas · Context

**Gathered:** 2026-08-14
**Spec:** `.specs/features/lote-6c-agente-ai-agent-memoria-tools/spec.md`
**Status:** Ready for design
**Pace:** Rápido (escolha do usuário)

---

## Feature Boundary

Substituir o miolo conversacional de `n8n/workflows/principal.ts` — montar prompt num Code node → Basic LLM Chain com output parser e um segundo modelo replicado para retry → Switch de ação → cadeia rígida `sendReply1/2/3` + `Wait` — por **nó AI Agent + Postgres Chat Memory + tools determinísticas**, e corrigir a política de qualificação e as barreiras de persona que a conversa real de 2026-08-13 expôs.

O entorno permanece intocado: WhatsApp Trigger, normalização de evento, lookup de tenant, buffer/debounce, `gate.mjs` (incluindo opt-out), `clearBuffer`, o scheduler e o workflow de erros. A reescrita começa **depois** do gate e termina **antes** do `clearBuffer`.

---

## Implementation Decisions

### Arquitetura do turno

- Nó `@n8n/n8n-nodes-langchain.agent` v3.1 substitui o par LLM Chain + retry. Não sobra nenhum Basic LLM Chain no caminho.
- **Emenda à AD-014** (candidata a AD-018): o LLM decide **quando** chamar uma tool; a tool — sub-workflow determinístico — decide **o que é permitido** e recusa devolvendo erro nomeado ao agente. A invariante "nenhum efeito colateral sem validação determinística" sobrevive; muda apenas onde ela mora. `n8n/src/validate-llm.mjs` e `n8n/src/business-hours.mjs` são reaproveitados como barreira dentro das tools, não descartados.
- Modelo permanece Gemini. Trocar de modelo no mesmo lote seria variável confundidora — não se saberia se a melhora veio da arquitetura ou do modelo.

### Tools expostas ao agente (exatamente 5)

| Tool | Efeito | Barreira determinística |
| ---- | ------ | ----------------------- |
| `registrar_qualificacao` | `PATCH /api/v1/leads/{id}` | Whitelist dos enums do contrato (`validate-llm.mjs`) |
| `agendar_reuniao` | Cria evento no Google Calendar + atualiza status | Horário comercial resolvido do tenant + checagem de conflito antes de criar |
| `escalar_para_humano` | Atualiza status para `escalado_humano` | Transição válida segundo `TRANSITIONS` |
| `consultar_documentos` | `GET /api/v1/context` | — (somente leitura; falha degrada para lista vazia) |
| `responder_lead` | Envia balão no WhatsApp + registra no CRM | Contador que recusa a partir da 4ª chamada no turno |

- **Opt-out não é tool.** Continua determinístico em `n8n/src/gate.mjs`, executado antes do agente (LGPD-03). O modelo nunca tem a opção de decidir sobre descadastro.
- `responder_lead` como tool é o que aposenta a cadeia rígida de 3 estágios: o agente manda 1 a 3 balões naturalmente, e o teto vira contador na tool em vez de três nós hardcoded.

### Memória

- `@n8n/n8n-nodes-langchain.memoryPostgresChat` v1.4, `sessionIdType: customKey`, `sessionKey = {tenantSlug}:{waId}`.
- **O próprio Postgres do n8n**, no mesmo servidor da instância, por **conexão local** — nunca o banco do CRM. Três motivos: (1) a memória é lida e escrita a cada turno, e conexão local elimina o salto de rede desse caminho quente; (2) preserva o desacoplamento por contrato (INT-08) — o n8n nunca recebe credencial do banco do CRM; (3) o nó grava em formato próprio (`n8n_chat_histories`), que não é a forma da tabela `messages`, então apontar para o CRM não seria sequer possível.
- **Sem teto de 20 mensagens.** O corte de 12h é a regra; `contextWindowLength: 50` fica só como salvaguarda contra sessão patologicamente longa.
- **Emenda parcial à AD-017**: cai a metade "máximo 20 mensagens". Continua valendo "o histórico vem do CRM pelo contrato" — agora como regra de **semeadura/rehidratação** em cold start, não como janela de prompt.
- O CRM segue **fonte de verdade** da thread (tela Chats, LGPD, corretor); `n8n_chat_histories` é **cache derivado**. Duas obrigações que caem disso e viram requisito, não nota de rodapé: purga no opt-out (MEM-04) e semeadura em cold start (MEM-03).
- Ordem quando purga e semeadura coincidem no mesmo turno: **purgar primeiro, semear depois**.

### GA-1 · Campos obrigatórios (decisão do usuário)

- **Obrigatórios (3):** modalidade, região, tipo de imóvel.
- **Oportunistas (5):** orçamento, horizonte de compra, motivação, status de crédito, operação casada. Nunca perguntados; registrados se o lead falar espontaneamente.
- Racional: o corretor conduz a reunião com os 3; orçamento é a pergunta que mais trava lead cedo e foi exatamente onde a conversa real descarrilou.

### GA-2 · Recusa e "não sei" (aceito pelo usuário)

- **"Obrigatório" significa *perguntado uma vez*, não *preenchido*.**
- Campo perguntado é marcado em `conversa_estado.perguntadosJson` (coluna nova) independentemente de o lead responder, e nunca mais é perguntado.
- Campo vazio **não bloqueia** o agendamento. Quem fecha o vazio é o corretor na reunião.
- Com os 3 obrigatórios marcados como perguntados, `conversa_estado.fase` transiciona `qualificando` → `agendando` por função pura, e o system message muda com a fase. Não depende de o modelo "perceber" que terminou.

### GA-3 · Persona consultiva (aceito pelo usuário)

- O agente reage ao **conteúdo específico** do que o lead disse antes de qualquer pergunta, em vez de carimbar aprovação e emendar a próxima.
- Barreiras determinísticas, porque a regra equivalente já existe no prompt (`prompt.mjs:52`) e foi ignorada 4 vezes seguidas:
  - blacklist de abertura: "show", "boa", "perfeito", "entendido", "ótimo", "legal" como interjeição isolada;
  - anti-repetição: a abertura não pode coincidir com a de nenhum turno anterior do agente na sessão;
  - no máximo uma pergunta de qualificação por turno, e é permitido não perguntar nada.
- Rejeição → regenera informando o motivo, no máximo 2 tentativas, depois cai no fallback de esclarecimento que já existe.

### GA-4 · Fronteira de capacidade (aceito pelo usuário)

- O agente **não busca imóvel, não manda foto, não manda preço**. Quem faz isso é o corretor, na reunião.
- Quando o lead pede, ele reconhece abertamente e usa como ponte para agendar — **não escalona** por esse motivo.
- Barreira determinística: blacklist de promessa ("vou te enviar / mandar / puxar / buscar / separar as opções", "vou ver os valores") → rejeita e regenera.

### RabbitMQ — validado e descartado

Motivos reais pelos quais fluxos profissionais usam broker, checados um a um contra o que já existe aqui: ACK rápido do webhook já resolvido (o Trigger responde em `onReceived`); serialização por conversa parcialmente coberta por debounce + `checkStillLatest`; retry/DLQ já existe via `errorWorkflow` (`crivo-agente-erros`); escala horizontal no n8n se resolve com **queue mode/Redis**, não RabbitMQ. Com 2 tenants-piloto, adicionar um broker externo para operar é custo sem contrapartida. **Gatilho para revisitar:** FIFO estrito por lead com múltiplos workers, ou migração do agente para o microserviço INT-08.

### Agent's Discretion

Áreas onde o usuário não pediu forma específica e o agente decide no Design:

- Formato exato do `system message` por fase e a redação da persona consultiva.
- Shape dos argumentos de cada tool e o texto das mensagens de recusa devolvidas ao agente.
- Onde vive o registro de "já perguntei" (default: coluna `perguntadosJson` em `conversa_estado`, que já é chaveada por `tenantSlug`+`waId`).
- Estrutura de arquivos em `n8n/src/` para as funções puras novas (fase de conversa, barreiras de persona, política de campos).
- Se cada tool vira um sub-workflow separado ou um Tool Workflow único com roteamento interno.
- Valor exato de `maxIterations` do agente e da salvaguarda de janela (proposto: 50).

### Declined / Undiscussed Gray Areas → Assumptions

Nenhuma área cinzenta foi recusada — as quatro (GA-1 a GA-4) foram decididas. As decisões marcadas `n (discretion)` na tabela de Assumptions do `spec.md` são discricionárias do agente por natureza (valores de tuning e localização de estado), não gray areas não discutidas.

---

## Specific References

- **Evidência primária:** conversa real do WhatsApp de 2026-08-13 (prints fornecidos pelo usuário), posterior ao fix `a3cc1ea`. Defeitos citáveis: "Show." às 02:10, 02:14, 02:27, 02:32; "Boa." às 02:12, 02:26; orçamento perguntado 3× (02:14, 02:27, 02:32); região/bairros 2× (02:28, 02:33); promessa de buscar imóvel 2× (02:36, 04:51); lead escreve "Você tá me perguntando a mesma coisa dnv" (02:35) e "???" (04:50).
- **Padrão de referência citado pelo usuário:** templates de chatbot WhatsApp do n8n.io (4827, 4966, 3586) — AI Agent + memória + tools.
- **Guidance do próprio n8n** (`get_workflow_best_practices`, técnica `chatbot`): responder ao usuário **como tool** do agente em vez de usar a saída do agente, para permitir múltiplas respostas por turno. É exatamente o que aposenta a cadeia `sendReply1/2/3`.

---

## Deferred Ideas

- **Queue mode / Redis no n8n** — o caminho certo de escala horizontal quando o volume justificar. Fora deste lote.
- **RAG / vector store sobre os documentos do tenant** — resposta para corpus grande; o piloto tem poucos documentos curtos.
- **Troca ou tuning de modelo** — medível isoladamente depois que a arquitetura estabilizar; misturar no mesmo lote impede saber o que causou a melhora.
- **Smoke conversacional roteirizado (AD-015)** — segue deferido; este lote remove a segunda metade do bloqueio de qualidade que o motivou.
- **Migrar `apiKey` de Data Table (texto claro) para credencial HTTP Header Auth por tenant** — Risco R1 de `n8n/README.md` §3, herdado e ainda aberto.
