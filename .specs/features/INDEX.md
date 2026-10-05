# Índice dos lotes executados

Mapa de entrada para `.specs/features/`. Uma linha por lote: o que entregou, os requisitos que
carregou, o veredito do Verifier e o que ficou em aberto. **Leia daqui antes de abrir qualquer
arquivo de lote** — o objetivo deste índice é que você carregue 8 KB em vez de 1,3 MB para
descobrir onde está o que você procura.

Roadmap original (`../Roadmap - Fases Epicas.md`): 10 fases, executadas em 9 lotes + 3
interstitiais. **100% executado** em 2026-08-30 (`STATE.md` § Handoff).

Trabalho futuro: `../ROADMAP-POS-PILOTO.md` — lotes 10 a 16 a partir do backlog deferido e das
frentes novas (catálogo de imóveis, vitrine pública), com o que foi descartado e por quê. **L10,
L11, L12 e L13 já foram executados** (linhas abaixo); L14–L16 seguem propostos.

---

## Como este diretório está organizado

Os artefatos de cada lote têm meias-vidas muito diferentes. A organização reflete isso:

| Camada | Arquivos | Papel | Onde |
| --- | --- | --- | --- |
| 1 — Vivos | `../STATE.md`, `../LESSONS.md`, `../lessons.json`, PRD, Roadmap | Decisões ativas e auto-melhoria. Consultados em toda sessão. | `.specs/` |
| 2 — Durável | `spec.md`, `context.md` | Requisitos EARS + rastreabilidade; decisões do usuário e o que foi **rejeitado** (é daqui que sai o backlog). | `.specs/features/<lote>/` |
| 3 — Histórico | `design.md`, `validation.md` | Arquitetura no momento X e evidência do Verifier. Envelhecem: quando o código muda, o código vira a verdade. | `.specs/features/<lote>/` |
| 4 — Arquivado | `tasks.md`, `EXECUTE-PROMPT.md`, evidência detalhada e anexos úteis | Log de execução, instruções de janelas encerradas e provas consultadas apenas sob demanda. Valor principal já destilado para `validation.md`, `STATE.md` e o `git log`. | `.specs/archive/<lote>/` |
| 5 — Transitório | Propostas intermediárias, lembretes de operação, rascunhos e evidências substituídas | Servem somente durante a execução. São apagados no fechamento depois da consolidação nos artefatos duráveis; continuam recuperáveis pelo histórico Git. | Removidos do checkout |

Cada diretório de lote tem um `ARCHIVED.md` apontando para os arquivos movidos. A varredura de
fechamento segue a AD-029 e reconcilia todas as referências depois da movimentação.

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
| `lote-10-modelo-alvo-e-prova-conversacional` | — (novo, pós-piloto, `ROADMAP-POS-PILOTO.md` L10) | 09-09 | ✅ PASS | MOD-01…03, SMK-01…06, DOC-01/02, MTN-01 | Modelo trocado para `gpt-5.4-nano-2026-03-17` confinado a um nó (AD-026), bateria de tool calling APROVADA, os três desfechos da AD-015 provados por conversa real (AGT-04/AGT-05/LGPD-03 fechados no lote-6), protocolo de prova conversacional (AD-027), AD-015 encerrada (`superseded by AD-027`), Finding 1 do lote-6c fechado, `n8n/README.md §4` corrigido | MTN-01 **não verificado, sem caminho disponível** — `vale-uberaba` é tenant fictício, sem número para homologar (não é pendência temporária); limpeza manual não verificável por ferramenta; dívidas herdadas listadas em `STATE.md` § Handoff |
| `lote-11-catalogo-de-imoveis` | — (novo, pós-piloto, `ROADMAP-POS-PILOTO.md` L11) | 09-14 | ✅ PASS | IMOV-01…07, BUSCA-01…05, PROVA-01/02, SEEDIM-01 | Catálogo multi-tenant no CRM, CRUD e permissões por papel, seed determinístico, `GET /api/v1/properties`, tool `buscar_imoveis` publicada e validada por conversa real; agente busca alternativas com iniciativa, apresenta opções legíveis e convida para reunião sem exigir escolha prévia | Storage/conteúdo/preview de documentos continuam no L12; vitrine pública continua no L16; switch de exibição do catálogo e antecedência mínima do agendamento permanecem deferidos em `context.md` |
| `lote-12-conteudo-de-documentos` | — (novo, pós-piloto, `ROADMAP-POS-PILOTO.md` L12) | 09-26 | ✅ PASS (ciclo 3) | DOCBIN-01, DOCTXT-01, DOCCTX-01, DOCLIM-01, DOCVIEW-01, DOCLIFE-01, DOCPROVA-01 | Binário real em Vercel Private Blob (AD-030), extração de PDF/DOCX/TXT/MD/CSV por Vercel Workflow com estado terminal, prévia e download isolados por tenant, exclusão e expiração com remoção física, contexto integral via `POST /api/v1/context` (GET removido), teto de contexto medido por benchmark e admissão fail-closed (AD-031), gatilho mensurável de RAG, log de processamento sem conteúdo; agente responde com fatos dos documentos sem citá-los e sem inventar política (prova por WhatsApp) | Oferta de corretor repetida após recusa (barreira determinística adiada); teste de harness da exaustão real do Workflow; capturas do papel corretor (T23–T27); 59 erros de `tsc` em testes; plano Vercel comercial antes de clientes pagantes; demais itens em `context.md` § Ideias adiadas |
| `lote-13-opt-out-linguagem-natural` | — (novo, pós-piloto, `ROADMAP-POS-PILOTO.md` L13) | 09-30 | ✅ PASS (ciclo 2) + T18 aprovada | OPTMED-01, OPTREG-01, OPTAMB-01, OPTSEG-01, OPTKEY-01, OPTMSG-01, OPTPROVA-01, OPTDOC-01 | Text Classifier de três faixas (explícita/ambígua/fora) depois da memória, com a última fala do agente como contexto; medição de falso positivo com barra dura antes de publicar (4 rodadas, v4 APROVADA: 84/84 explícitas, 0 falso positivo) e trava determinística que rebaixa explícita para ambígua; publicação travada pelo hash do classificador aprovado; pedido explícito grava `opted_out_at` pelo mesmo `POST /leads/{id}/opt-out` + purga de memória, com confirmação só do que o sistema cumpre; só o pedido explícito descadastra (a pergunta ao lead ambíguo foi removida na D11, depois da prova real); `sair`/`parar` seguem determinísticos, inclusive em `escalado_humano`; teto de contexto remedido | T18 (prova por WhatsApp) APROVADA depois da D11; `DOCLIM-01 AC8` intermitente por timeout na suíte paralela; reverter opt-out, opt-out natural em `escalado_humano` e origem do opt-out no CRM em `context.md` § Deferred Ideas |
| `lote-14-humano-no-laco` | — (novo, pós-piloto, `ROADMAP-POS-PILOTO.md` L14) | 10-01 | ✅ PASS (ciclo 2) + T40 aprovada | ASSUMIR-01, SILENCIO-01, ENVIO-01, JANELA-01, THREAD-01, DEVOLVER-01, OPTHUM-01, CONTRATO-01, CONTRATO-02, HUMPROVA-01, HUMDOC-01 | Condução humana como marca separada do status (AD-034): assumir, responder pelo CRM com envio direto pela Cloud API (AD-035) e reserva idempotente por compare-and-set, janela de 24h que bloqueia e explica, thread com autoria humana e atualização sem recarregar, devolver ao agente com a memória refeita a partir do CRM (fala do corretor como nota `system`, emenda D12 para o agente poder repeti-la), opt-out pela tela com purga pela varredura D do scheduler; gate `somente-registrar` e releitura do lead antes de cada envio do agente; contrato `openapi.yaml` com teste de paridade; prova por WhatsApp aprovada nos 4 casos; teto de contexto remedido sem mudança | Capturas da T40 não versionadas (ressalva aceita); filtro de lembretes do scheduler sem limite inferior; erro de hidratação do divisor de data, layout do Chats em celular e possível 500 com id não UUID em `context.md` § Deferred Ideas; reengajamento gratuito no L14b |
| `lote-14b-reengajamento-contextual` | 1–9 (pós-piloto L14b) | 10-05 | Execute; Verifier/sensor em curso | REEN-01…05, PRECO-01/02, USO-01…04, L14B-01, PROVA-01 | 64/68 tarefas locais: episódios/locks/contexto/ponte, entrega/correlação, snapshots condicionados, workflows e classificação por mensagem; suíte 3580/3580 | Quatro tarefas de consumo UI adiadas para L14c; conta real/instalação/HMAC/Analytics e texto efetivo do modelo sem prova; nenhum saldo presumido; lote sem PASS independente |

---

## Onde está o backlog

Os **28 itens deferidos** durante as execuções estão nas seções `## Deferred Ideas` de cada
`context.md`. Os `#N` da tabela acima referenciam a numeração consolidada usada na sessão de
2026-08-30. Concentração por tema:

- **Produtização/SaaS**: `lote-6/context.md` (créditos, Embedded Signup, verificação Meta)
- **Telas do CRM**: `lote-2`, `lote-3`, `lote-5`, `lote-8` (documentos, composer humano, sugestões do agente, pacote Google)
- **Agente/n8n**: `lote-6c`, `lote-7` (RAG, queue mode, opt-out natural, troca de modelo)
- **Métricas**: `lote-9` (alerta ativo, baseline versionado, ranking por corretor)

Lotes pós-piloto: `lote-10`, `lote-11` e `lote-13` em `## Deferred Ideas`; `lote-12` em `## Ideias adiadas`
(barreira da oferta de corretor, teste de harness do Workflow, Blob isolado no `dev:test`, vazão do
teto, i18n da Astryx, hidratação do `Timestamp`, erros de `tsc` em testes). Esses itens não entram
na contagem de 28 acima, que é a consolidação de 2026-08-30.

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
