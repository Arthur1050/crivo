# Lote 6 — Agente n8n + WhatsApp · Context

**Gathered:** 2026-08-05
**Spec:** `.specs/features/lote-6-agente-n8n-whatsapp/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Fluxo de qualificação conversacional construído no **n8n** (instância do usuário, projeto pessoal), conectado à **WhatsApp Business Cloud API oficial** (app Meta já criado, modo dev, número de teste), consumindo e alimentando o **contrato v1 do CRM em produção na Vercel** (lote-5). Entrega: recepção de mensagens via webhook da Meta, mapeamento número→tenant, agente LLM (Gemini) com qualificação distinta por modalidade, sincronização de leads/mensagens/status/opt-out com o CRM, agendamento com Google Calendar + link do Meet, lembrete de reunião, escalonamento para humano — com o workflow **versionado como código no repo** e verificável. Fora do CRM (nenhuma tela muda), exceto uma extensão pequena do contrato (leitura de settings do tenant).

---

## Implementation Decisions

### 1. Conectividade WhatsApp (real neste lote)

- App Meta **já criado** pelo usuário (modo dev); token de acesso em posse dele.
- **Número de teste da Cloud API** (grátis, até 5 destinatários verificados) — nenhum número real de imobiliária neste lote.
- O **webhook da Meta é a porta de entrada do fluxo**: "URL de callback" = URL de produção do webhook no n8n; "Verificar token" = string nossa; a verificação GET (`hub.challenge`) e os POSTs de evento são tratados pelo trigger do n8n.
- App não publicado → só eventos de números de teste/testers chegam. Suficiente para a Fase 8; publicação do app é assunto do piloto real (Fase 9+).

### 2. LLM

- **Gemini**, via credencial `googlePalmApi` já existente na instância n8n do usuário.
- Nó de modelo **isolado/troca fácil** — trocar de modelo não pode exigir redesenho do fluxo.
- Escolha de modelo pela imobiliária + sistema de créditos → **Deferred Ideas** (productização pós-piloto, AD-001).

### 3. API do CRM consumida em produção (Vercel)

- Projeto `crivo` na Vercel, produção READY no commit do lote-5. URL base: `https://crivo-arthur1050s-projects.vercel.app`.
- **Ajuste aplicado nesta sessão (autorizado pelo usuário)**: Vercel Authentication estava em `all_except_custom_domains` e bloquearia n8n + webhook; alterada para **Only Preview Deployments** via conector. Verificado: `GET /api/v1/context` sem chave responde `401 application/problem+json` (`nao-autenticado`) — API pública e falando o contrato.
- Pré-requisitos que o Execute ainda valida: `DATABASE_URL` (Neon) e `CRON_SECRET` no projeto Vercel; banco de produção seedado; **API keys usadas pelo n8n = as impressas pelo seed DESSE banco** (seed rotaciona chaves — guia de integração §1).

### 4. Estado conversacional

- **Memória simples no n8n sincronizada com o CRM** (palavras do usuário).
- Estado leve da conversa (campos já coletados, última pergunta, fase da conversa) em **Data Table do n8n**, chaveado por tenant + `wa_id`.
- **CRM segue fonte de verdade**: todo campo qualificado é persistido via `PATCH /leads/{id}` (upsert parcial); em cold start / perda de memória, o fluxo reconstrói o essencial via `POST /leads` idempotente (devolve `200` com o lead existente, incluindo `optedOutAt`).

### 5. Agendamento (detalhado pelo usuário)

- Cria **evento no Google Calendar da conta da imobiliária** (credencial Google no n8n) **com link do Meet**, além de gravar `meetingAt` + `status=qualificado_agendado` no CRM.
- O agente **pergunta ao lead se quer o evento no calendário dele também**: se sim → coleta o e-mail e adiciona como convidado; se não → só confirma dia e hora pelo WhatsApp.
- **Próximo do dia/hora, o agente reenvia mensagem confirmando a reunião e compartilhando o link do Meet** (lembrete).

### 6. Forma da entrega e verificação

- Workflow(s) **versionados como código no repo** (JSON em `n8n/`), criados/atualizados na instância via SDK/MCP do n8n — o publicado e o versionado devem ser o mesmo artefato.
- Testes de contrato/fixtures no repo (payloads reais da Meta, respostas do CRM) como evidência verificável pelo Verifier.

### Agent's Discretion

- Janela de debounce/agrupamento de mensagens consecutivas do lead antes de chamar o LLM.
- Estrutura interna da memória (colunas da Data Table), engenharia de prompts e mecânica de extração de campos.
- Mecânica de retry/backoff nas chamadas ao CRM e desenho do workflow de erro (padrão já existente na instância: Error Trigger → e-mail via Gmail).
- Estrutura do diretório `n8n/` no repo e tooling de sync (export/import).
- Timing exato do lembrete (default proposto: 1h antes; ver Assumptions na spec).

### Declined / Undiscussed Gray Areas → Assumptions

(Registradas com default + rationale na spec, seção Assumptions & Open Questions.)

- Mídia recebida (áudio/imagem/documento, incl. comprovante de renda) **não é persistida** no v1 do fluxo — agente agradece e segue; contrato não tem endpoint de upload de documento de lead.
- Conta Google **única (do usuário)** para o Calendar na Fase 8 — 1 credencial por tenant fica para o piloto real.
- Lembrete fora da janela de 24h da Meta exige **template message** aprovada — criada no app Meta como parte do lote.
- ~~Reunião marcada em horário comercial fixo~~ → **promovida a decisão do usuário (2026-08-05)**: o horário comercial é **configurável pela imobiliária na tela de Configurações do CRM** (CONF-05) e exposto ao fluxo via `GET /api/v1/settings`; fallback seg–sex 9h–18h quando não configurado. Checagem de conflito no Calendar mantida.

---

## Specific References

- "Talvez a gente até possa incluir a opção da imobiliária escolher o modelo na plataforma […] Eu já estava pensando em trabalhar com algum sistema de créditos" — motivação direta do Deferred Idea de créditos/modelo por tenant.
- "elas mesmas terão que ter um numero no whatsapp business onde de alguma forma pelo CRM irão vincular o numero delas com o meu agente?" — respondido: modelo alvo é 1 número dedicado por imobiliária (número registrado na Cloud API sai do app do celular), mapeado por `phone_number_id` → tenant; vínculo self-service pelo CRM = Embedded Signup (deferred).
- Lembrete de reunião "compartilhando o link do meet" — o link do Meet é parte do evento e da mensagem de lembrete.

---

## Deferred Ideas

- **Escolha de modelo LLM por imobiliária + sistema de créditos** (billing/consumo) — pós-piloto.
- **Embedded Signup** — imobiliária vincula o próprio número WhatsApp Business pelo CRM.
- **Endpoint de upload de documento de lead** (comprovante de renda via WhatsApp → documents com TTL) — hoje sem rota no contrato.
- **Publicação do app Meta** (business verification) — necessária só quando números/destinatários reais entrarem (Fase 9/piloto).
- **Tela de sugestões/notificações do agente** (herdada do L5) — rejeições 409 estruturadas já a suportam.
