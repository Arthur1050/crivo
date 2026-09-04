# Índice dos lotes executados

Mapa de entrada para `.specs/features/`. Uma linha por lote: o que entregou, os requisitos que
carregou, o veredito do Verifier e o que ficou em aberto. **Leia daqui antes de abrir qualquer
arquivo de lote** — o objetivo deste índice é que você carregue 8 KB em vez de 1,3 MB para
descobrir onde está o que você procura.

Roadmap original (`../Roadmap - Fases Epicas.md`): 10 fases, executadas em 9 lotes + 3
interstitiais. **100% executado** em 2026-08-30 (`STATE.md` § Handoff).

Trabalho futuro: `../ROADMAP-POS-PILOTO.md` — lotes 10 a 14 propostos a partir do backlog deferido,
com o que foi descartado e por quê.

---

## Como este diretório está organizado

Os seis artefatos de cada lote têm meias-vidas muito diferentes. A organização reflete isso:

| Camada | Arquivos | Papel | Onde |
| --- | --- | --- | --- |
| 1 — Vivos | `../STATE.md`, `../LESSONS.md`, `../lessons.json`, PRD, Roadmap | Decisões (AD-001…024) e auto-melhoria. Consultados em toda sessão. | `.specs/` |
| 2 — Durável | `spec.md`, `context.md` | Requisitos EARS + rastreabilidade; decisões do usuário e o que foi **rejeitado** (é daqui que sai o backlog). | `.specs/features/<lote>/` |
| 3 — Histórico | `design.md`, `validation.md` | Arquitetura no momento X e evidência do Verifier. Envelhecem: quando o código muda, o código vira a verdade. | `.specs/features/<lote>/` |
| 4 — Arquivado | `tasks.md`, `EXECUTE-PROMPT.md` | Log de execução task a task e instrução operacional de janelas já encerradas. Valor já destilado para `validation.md`, `STATE.md` e o `git log`. | `.specs/archive/<lote>/` |

Cada diretório de lote tem um `ARCHIVED.md` apontando para os arquivos movidos. Nada foi apagado.

---

## Lotes

| Lote | Fase(s) | Data | Verifier | Requisitos | Entregou | Aberto |
| --- | --- | --- | --- | --- | --- | --- |
| `fase-1-fundacao` | F1 | 08-02 | ✅ Ready | FUND-01…09 | Stack (Next 16 + Astryx + Drizzle/Neon), schema multi-tenant com `tenant_id` (AD-002), seed mockado, shell do CRM | — |
| `lote-2-configuracoes-documentos` | F2 + F3 | 08-02 | ⚠️ Issues | CONF-01…04, DOC-01…07 | Configurações da imobiliária, página de Documentos com categorias e `expiresAt` | Preview/download + storage real do binário (§ Deferidos #9) |
| `lote-3-pipeline-chats` | F4 + F6 | 08-02 | ✅ Ready | PIPE-01…04, CHAT-01, CAT-01/02, ICON-01/02 | Kanban de leads, tela de Chats, retrofit de ícones (AD-008, depois AD-011) | Link lead↔conversa, reordenação no Kanban, composer humano (#7, #11, #12) |
| `lote-4-dashboard` | F5 | 08-02 | ⚠️ Issues | DASH-01…07, INFRA-01 | 5 KPIs, séries de volume, distribuições, Recharts tematizado (AD-009) | **L4 Fix 1** (delta de baseline sem teste) e **Fix 2** (DASH-06 AC2 sem artefato) |
| `redesign-crm-astryx` | — (interstitial) | 08-03 | ✅ Ready | — | Recomposição visual de todas as telas, shell SideNav-only (AD-010), `tailwind-theme.css` (AD-012) | — |
| `lote-5-contrato-integracao` | F7 | 08-03 | ✅ Ready | INT-01…08, LGPD-01/02 | 7 rotas `/api/v1`, `problem+json` RFC 9457 (AD-013), OpenAPI, TTL de documentos, opt-out | **L5 Fix 1** (413/JSON inválido sem teste em `POST /leads`); tela de sugestões do agente (#6) |
| `lote-6-agente-n8n-whatsapp` | F8 | 08-09 | ✅ PASS | AGT-01…09, INT-01/09, CONF-05, LGPD-03 | Fluxo n8n workflow-as-code (AD-014), WhatsApp Cloud API, gate determinístico | **AD-015**: smoke conversacional roteirizado deferido — AGT-04/05 e LGPD-03 ponta a ponta sem prova (#17) |
| `lote-6b-persona-e-lapidacao` | — (interstitial) | 08-10 | ✅ Ready | PER-01…03, VOZ*, AGT-01/08, CTX-01/02, CHAT-01 | Persona pt-BR sem emoji, transparência invertida (AD-016), histórico pelo contrato (AD-017) | — |
| `lote-6c-agente-ai-agent-memoria-tools` | — (interstitial) | 08-15 | ✅ Ready c/ gap | AGN-01…05, MEM-01…04, QLF-01…03, VOZ-01…03, CTX-03, INT-08, OBS-01 | Nó AI Agent + tools (AD-018), memória Postgres como cache derivado (AD-019) | **Finding 1**: VOZ-03 AC4 promete fallback de esclarecimento; o fluxo degrada para silêncio. Reconciliar spec ou implementar o envio |
| `lote-7-dado-real-ponta-a-ponta` | F9 | 08-22 | ✅ Pronto | REAL-01, SEC-01, INT-02/08, ATRIB-01/02, KPI-01/02, PRIV-01, SHELL-01, SMOKE-01 | Mock → dado real, chaves de serviço, credencial `httpHeaderAuth` (fecha risco R1). Tem `HANDOFF.md` próprio | Opt-out por linguagem natural (#15), `gpt-5-nano` (#16), 2º número de teste (#21) |
| `lote-8-usuarios-papeis-atribuicao` | — (novo, AD-020) | 08-27 | ✅ Ready | AUTH-01/02, USER-01/02, PERM-01, SCOPE-01, TENANT-01, ATRIB-01…03, AGENDA-01, SEED-01, SEC-01 | better-auth + plugin `organization` (AD-021), papéis acumuláveis, atribuição no agendamento (AD-022) | Pacote Google + página de Agenda (#8), auditoria completa (#14), 2FA (#5) |
| `lote-9-metricas-piloto` | F10 | 08-30 | ✅ Ready | BASE-01/02, SAUDE-01…03, PRES-01/02, REL-01, PERF-01, SCOPE-01/02 | Baseline por imobiliária (AD-024), saúde da integração via `integration_refusals` (AD-023), rota `/relatorio` | Alerta ativo (#23), log de sucesso com latência (#25), export CSV (#22) |

---

## Onde está o backlog

Os **28 itens deferidos** durante as execuções estão nas seções `## Deferred Ideas` de cada
`context.md`. Os `#N` da tabela acima referenciam a numeração consolidada usada na sessão de
2026-08-30. Concentração por tema:

- **Produtização/SaaS**: `lote-6/context.md` (créditos, Embedded Signup, verificação Meta)
- **Telas do CRM**: `lote-2`, `lote-3`, `lote-5`, `lote-8` (documentos, composer humano, sugestões do agente, pacote Google)
- **Agente/n8n**: `lote-6c`, `lote-7` (RAG, queue mode, opt-out natural, troca de modelo)
- **Métricas**: `lote-9` (alerta ativo, baseline versionado, ranking por corretor)

Dívidas técnicas menores (linhas inertes em `conversa_estado`, `openapi.yaml` desatualizado,
`n8n/README.md §4` obsoleto, `RESEND_FROM`) estão em `STATE.md` § Handoff, não aqui.

---

## Lacuna conhecida: os `spec.md` dos lotes 2–5 não existem

`lote-2`, `lote-3`, `lote-4`, `lote-5` e `redesign-crm-astryx` **não têm `spec.md` em disco nem no
histórico do git** — a reescrita de histórico de 2026-08-05 (`filter-branch` que removeu `.specs`
do remoto) coincide com a ausência, e nenhum commit posterior os recriou. Os requisitos EARS
originais desses quatro lotes estão perdidos.

O que sobrevive: as **tabelas de rastreabilidade dentro dos `validation.md`** deles, que registram
cada requirement ID com o veredito do Verifier. É por isso que `validation.md` é camada 3
(preservado) e não camada 4 (arquivado) — para esses lotes, ele é o único registro formal de
requisito que restou. `lote-4` e `lote-5` também não têm `tasks.md`.
