# Lote 5 — Contrato de Integração CRM ↔ Agente · Context

**Gathered:** 2026-08-03
**Spec:** `.specs/features/lote-5-contrato-integracao/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Interface (API HTTP) que o futuro fluxo do agente (n8n + WhatsApp, Fase 8) usará para: entregar leads qualificados, atualizar status no pipeline, alimentar a tela de Chats, registrar escalonamentos e ler o contexto/documentos do tenant — mais o desenho dos mecanismos LGPD (TTL de documentos, opt-out). Entrega **endpoints funcionais** (escrevendo no mesmo banco que o CRM lê) **+ documento de contrato**, sem tocar o fluxo n8n em si (Fase 8) nem substituir o seed mockado das telas (Fase 9).

---

## Implementation Decisions

### Natureza da entrega

- Endpoints funcionais no Next (route handlers) **+ documento de contrato** — a Fase 8 nasce apontando para uma API viva; a Fase 9 vira chaveamento de fonte.
- **Requisito explícito do usuário:** desacoplamento — se no futuro a API for trocada por um serviço externo (ex.: microserviço Python), o desacoplamento/reacoplamento deve ser fácil. O contrato é definido de forma implementation-agnostic (OpenAPI); handlers finos sobre uma camada de serviço portável; nenhum detalhe do Next vaza para payloads.

### Forma do contrato + auth

- **REST por recurso** sob `/api/v1`: leads (criar/atualizar), mensagens de conversa, leitura de contexto.
- **API key por tenant**: a chave identifica o tenant; nenhum payload carrega `tenant_id` (isolamento por construção, AD-002); chaves revogáveis por cliente.
- **Leitura de contexto (PRD §7.3): shape completo com content mockado** — o contrato já define o campo de conteúdo; hoje vem placeholder/null (mock-first, AD-004); a Fase 9 troca a fonte sem mudar o shape.
- Versionamento/erros: **delegado ao agente** ("você decide") — default escolhido: prefixo `/api/v1` + erros `application/problem+json` (RFC 9457), formato neutro de vendor. Registrado como assumption na spec.

### Transições de estado do pipeline

- **Só avanço + escalar**: agente pode `em_qualificacao → qualificado_agendado` e `em_qualificacao → escalado_humano`. Nunca regride nem tira lead de `escalado_humano` — destravar é ação humana no Kanban.
- **Humano vence — agente bloqueado**: depois que um humano altera o status pelo CRM, updates de **status** vindos do agente para esse lead são rejeitados (409); dados não-conflitantes (mensagens novas, campos de qualificação) continuam aceitos.
- **Upsert completo de qualificação**: o PATCH aceita status + todos os campos do PRD §6.4 (parciais permitidos; chave ausente não toca a coluna — padrão já pinado no SPG-1).
- **Update inválido → 409 + motivo** em problem+json com código da regra violada; nada é gravado. O fluxo n8n decide o que fazer com a rejeição.

### Agent's Discretion

- Formato exato de versionamento e corpo de erro (default: `/api/v1` + problem+json).
- Mecânica de idempotência/ordenação (área não selecionada para discussão — defaults na spec).
- Mecânica de enforcement do TTL e registro de opt-out (área não selecionada — defaults na spec).
- Armazenamento e formato das API keys, e como o seed as disponibiliza.
- Mecanismo interno de detecção de "humano mexeu" (coluna/flag — decisão de design).

### Declined / Undiscussed Gray Areas → Assumptions

- **Idempotência e ordem** — default do agente (ver Assumptions na spec): dedup por `externalId` fornecido pelo cliente em leads e mensagens; reentrega devolve o recurso existente sem duplicar; mensagens fora de ordem aceitas e ordenadas por `sentAt`.
- **LGPD: TTL e opt-out** — default do agente (ver Assumptions na spec): TTL enforced por job agendado (Vercel Cron → route handler protegido) + filtro de leitura no contexto; opt-out registrado via contrato com timestamp e exposto no CRM; o bloqueio de disparos é dever do agente consumidor, documentado no contrato.

---

## Specific References

- "Se futuramente eu quiser trocar toda essa parte da API para uma nova API (ex: micro-serviço feito em python), fique fácil o desacoplamento e o novo acoplamento" — requisito direto do usuário sobre a natureza da entrega.

---

## Deferred Ideas

- **Tela de sugestões/notificações do agente** (mencionada pelo usuário ao discutir a trava humana): ações do agente pendentes de aprovação humana — ex.: sugestão de mudança de status rejeitada pela trava vira item aprovável. Fora do escopo do L5; o contrato v1 apenas garante que rejeições 409 carregam código+motivo estruturados, para que essa tela futura possa consumi-los sem mudança de contrato.
