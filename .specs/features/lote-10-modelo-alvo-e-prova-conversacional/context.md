# Lote 10 — Modelo alvo e prova conversacional: Context

**Gathered:** 2026-09-05
**Spec:** `.specs/features/lote-10-modelo-alvo-e-prova-conversacional/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Trocar o modelo do agente conversacional para `gpt-5-nano`, reverificar tool calling, e produzir
a prova conversacional roteirizada que a AD-015 deferiu em 2026-08-09 — fechando AGT-04
(agendamento), AGT-05 (escalonamento) e LGPD-03 (opt-out ponta a ponta). Sem tool nova e sem
mudança no gate: qualquer diferença observada no smoke tem que ser atribuível ao modelo.

---

## Implementation Decisions

### A. A troca de modelo é incondicional, com rollback nomeado

- A troca acontece; não há A/B conversacional formal (dobraria o custo do lote e o julgamento
  seria subjetivo de qualquer forma).
- Uma **bateria de tool calling** roda **antes** do smoke e funciona como gate: as 5 tools
  exercitadas, mais o caso de enum inválido em `registrar_qualificacao` que já aconteceu de
  verdade na execução 462 (o agente precisa seguir sem travar).
- Se a bateria reprovar, o nó volta para `models/gemini-3.5-flash-lite`, o motivo é registrado, e
  o smoke roda no Gemini. O lote fecha de qualquer jeito — o que não pode acontecer é fechar com
  um agente pior e um smoke bonito.

### B. A barra de aprovação do smoke é o desfecho, não o estilo

- Critério de cada cenário: **o estado final no CRM** (`reuniao_agendada`, `escalado_humano`,
  `optedOutAt` preenchido). Qualidade da fala é registrada como observação.
- Estilo ruim vira fix task; nunca trava o cenário.
- Roteiro versionado em `n8n/smoke/roteiro.md` — turnos esperados, não falas literais.
- Evidência por cenário: id da execução n8n + captura de tela do CRM + (no agendamento) link do
  evento no Google Calendar.

### C. O 2º número é condicional, nunca bloqueante

- O smoke fecha com **um tenant** (`triangulo`, único com `tenant_config` populada hoje).
- O 2º número homologado + a linha de `tenant_config` do Vale do Uberaba entram como fase própria,
  marcada como **evidência de campo condicional**: se o número estiver homologado dentro da janela
  de Execute, roda; se não, vira pendência nomeada e **não segura** AGT-04/05 nem LGPD-03.
- Motivo: o prazo do painel Meta não é controlável, e o L15 já registra que a publicação do app
  Meta é o que libera números e destinatários reais.

### D. Os 3 cenários são separados por reset versionado

**Achado que motivou a decisão** (`n8n/src/gate.mjs:67-72`): `optedOutAt` e
`status === "escalado_humano"` são **terminais** — os dois roteiam para `somente-registrar` para
sempre. Como `externalId` do lead é o `waId` e o `POST /leads` é idempotente, **um número de teste
= um lead por tenant**. Rodar "escalar" trava o lead e o cenário de opt-out seguinte nunca alcança
o agente. Isso nunca apareceu antes porque nenhum dos três cenários chegou a rodar de verdade.

- Entre um cenário e o próximo, um **procedimento de reset versionado** apaga o lead do smoke, a
  linha correspondente de `conversa_estado` e a sessão em `n8n_chat_histories`.
- Ganho colateral: três cold starts limpos exercitam a semeadura de memória (MEM-03), que até hoje
  só tem evidência estrutural.
- Escrever no banco de produção é aceitável aqui: os dois tenants-piloto são fictícios e o
  `STATE.md` registra que nenhum dado do banco é real.
- Alternativa descartada: uma conversa contínua com os três desfechos encadeados (desfazendo o
  escalonamento pelo Kanban, opt-out por último). Evita a cirurgia no banco, mas embola a evidência
  dos três ACs numa thread só, e a AD-015 pede três conversas, não três desfechos numa conversa.

### E. Ajuste de prompt está dentro do lote, limitado

- `gpt-5-nano` é outra família de modelo; instrução que o Gemini seguia pode escorregar, e a
  persona da AD-016 (sem emoji, teto de 3 mensagens, nunca se anunciar como IA) é exatamente o tipo
  de regra que varia entre famílias.
- Ajustar `n8n/src/system-message.mjs` / `n8n/src/voice.mjs` é permitido **só como fix task depois
  de uma rodada de smoke reprovada**, com o desvio registrado.
- **Nunca** redesenhar a persona: a AD-016 continua sendo a especificação do estilo.
- O isolamento que o roadmap pede é sobre **tool nova e gate**, não sobre a redação do prompt.

### Agent's Discretion

- Tenant da bateria de tool calling e formato do lead de descarte.
- Parâmetros do nó `lmChatOpenAi` (temperature / reasoning), resolvidos no Design contra o schema
  real do nó — nunca inventados.
- Estrutura interna do `roteiro.md` e do procedimento de reset.
- Como a paridade publicado ↔ `n8n/generated/` é conferida (a ferramenta, não o requisito).

### Declined / Undiscussed Gray Areas → Assumptions

- **Item 5 do roadmap (VOZ-03 AC4)**: o roadmap já decide "doc, não código". Registrado como
  assumption na spec — reconciliar a doc com o comportamento real (silêncio no estouro de
  `maxIterations`), sem construir o envio de fallback.
- **Item 6 do roadmap (`n8n/README.md` §4)**: correção documental, sem decisão de produto.
- **Cobertura de modalidade (novo/usado, AD-003)** no roteiro: assumption do agente — o caminho de
  qualificação é o mesmo; modalidade muda contexto, não desfecho.

---

## Specific References

- **Fatos verificados nesta discussão**, que mudam o escopo em relação ao roadmap:
  1. **O item 2 do roadmap está obsoleto.** `n8n/workflows/principal.ts:1269` (e o `generated/`
     idêntico) já declara `models/gemini-3.5-flash-lite`, alinhado à instância no lote-8 T30. O que
     sobra de real é provar que **publicado == `generated/`** antes de tocar o nó — passo do item 1,
     não item próprio. Com a migração, o nó Gemini desaparece e o item 2 morre junto.
  2. **A credencial OpenAI foi criada pelo usuário durante esta discussão**: `OpenAI account`,
     tipo `openAiApi`, id `bGnmNn5iFH4sBCoo` (confirmada via `list_credentials`). É esse o nome que
     vai em `newCredential(...)` na fonte.
  3. As 3 Data Tables estão de pé (`tenant_config`, `conversa_estado`, `agenda_envios`), com
     `tenant_config` sem nenhuma coluna de chave desde o lote-7 (só `phoneNumberId`, `tenantSlug`,
     `calendarId`).
- **Regra de ouro herdada (AD-014)**: a UI do n8n nunca é editada à mão. A troca do modelo é uma
  edição em `n8n/workflows/principal.ts` → `node scripts/n8n-inline.mjs` → publicação via MCP.
- **Precedente de evidência**: o `n8n/README.md` §§10-12 é o formato de registro já usado para
  evidência real (execução, id, o que foi e o que não foi provado). O smoke segue esse padrão.

---

## Deferred Ideas

- **Fallback de esclarecimento ativo** no estouro de `maxIterations` (a opção (b) da recomendação do
  Verifier do lote-6c: contador de regeneração real + envio dedicado). Este lote reconcilia a doc;
  construir o envio é escopo novo.
- **Bateria de tool calling como suíte de regressão permanente** rodada a cada troca de modelo.
  Este lote a roda uma vez, como gate; transformá-la em CI é outro escopo.
- **Comparação formal de qualidade entre modelos** (A/B conversacional com rubrica). Descartado em A.
