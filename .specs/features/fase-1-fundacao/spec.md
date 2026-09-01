# Fase 1 — Fundação Técnica do CRM Specification

## Problem Statement

O CRM mock-first do agente SDR imobiliário não tem onde se apoiar: o projeto é um `create-next-app` zerado, sem a stack obrigatória (Astryx, Zustand), sem modelo de dados e sem navegação. Todas as telas das Fases 2–6 dependem de uma fundação com dados mockados multi-tenant e um shell navegável.

## Goals

- [ ] Stack obrigatória instalada e funcional: Astryx (componentes + tema), Zustand, deploy-ready para Vercel.
- [ ] Schema multi-tenant real (Neon Postgres + Drizzle) com `tenant_id` em todas as entidades de negócio, populado com seed de dados mockados de 2 imobiliárias fictícias.
- [ ] Camada de acesso a dados atrás de interface única sempre filtrada por tenant — o ponto onde a Fase 9 trocará mock por dado real sem redesenho.
- [ ] App shell navegável: sidebar com as 5 rotas futuras (Configurações, Documentos, Pipeline, Chats, Dashboard) como placeholders + seletor de tenant fake.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Autenticação real (better-auth) | Decidido no discuss: seletor de tenant fake basta para a fase de demo; auth entra antes do piloto com dados reais |
| Conteúdo funcional das 5 telas | Fases 2–6 (Lotes 2–4) |
| Contrato de integração CRM↔Agente | Fase 7 (Lote 5) |
| Integração WhatsApp / n8n | Fase 8 (Lote 6) |
| Mecanismos LGPD (TTL ativo, opt-out) | Desenhados na Fase 7; schema apenas reserva campos |
| Banco vetorial / RAG | Fora do v1 (PRD §3) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Persistência do mock | Neon Postgres + Drizzle desde a Fase 1, seed com dados fictícios | Escolha do usuário no discuss; alinha com AD-002 (tenant_id desde o schema); Fase 9 troca o escritor, não o storage | y |
| Auth na Fase 1 | Seletor de tenant fake (dev-only) | Escolha do usuário no discuss; velocidade de demo | y |
| Fonte da Astryx | Pacotes npm `@astryxdesign/core`, `@astryxdesign/theme-neutral`, `@astryxdesign/cli`; `npx astryx init` | Docs oficiais (astryx.atmeta.com); usuário delegou a decisão | y |
| Connection string do Neon | Usuário fornece `DATABASE_URL` (conta Neon) antes do Execute; fallback: Postgres local | Neon é serviço externo com conta própria — não posso criar a conta | **n — bloqueio do Execute** |
| Entidades do seed | tenants (2), corretores, leads (~20–30/tenant distribuídos pelos 3 status), conversas com mensagens, documentos de contexto | Volume suficiente para Kanban/Dashboard/Chats parecerem reais na demo; a critério do agente | n (discrição do agente) |
| Next.js 16.2.11 tem breaking changes | Ler `node_modules/next/dist/docs` antes de escrever qualquer código (Design/Execute) | Instrução obrigatória do AGENTS.md | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Modelo de dados multi-tenant com seed mockado ⭐ MVP

**User Story**: Como desenvolvedor das próximas fases, quero um schema multi-tenant populado com dados mockados realistas para que toda tela consuma dado estruturado desde o primeiro commit.

**Why P1**: Nada das Fases 2–6 existe sem isso; é a premissa mock-first do roadmap (AD-004).

**Acceptance Criteria**:

1. WHEN o schema é inspecionado THEN toda tabela de entidade de negócio (tenants, corretores, leads, conversas, mensagens, documentos) SHALL conter coluna `tenant_id` NOT NULL (exceto a própria `tenants`).
2. WHEN o seed é executado THEN o banco SHALL conter 2 tenants (imobiliárias fictícias) com corretores, leads nos 3 status do pipeline (`em_qualificacao`, `qualificado_agendado`, `escalado_humano`), conversas com mensagens e documentos de contexto associados.
3. WHEN o seed é executado uma segunda vez THEN o banco SHALL terminar no mesmo estado (idempotente — sem duplicatas).
4. WHEN um lead está em `qualificado_agendado` THEN ele SHALL ter os campos de qualificação do PRD §6.4 preenchidos (região, orçamento, tipo, modalidade, horizonte, motivação, status de crédito, operação casada) e um resumo executivo.
5. WHEN um lead está em `escalado_humano` THEN ele SHALL ter um motivo de escalonamento preenchido.
6. WHEN a coluna de status de lead ou modalidade recebe valor fora do enum THEN o banco SHALL rejeitar a escrita (constraint no schema).

**Independent Test**: Rodar o seed e verificar via query (ou Drizzle Studio) os dados dos 2 tenants com as invariantes acima.

---

### P1: Camada de acesso a dados isolada por tenant ⭐ MVP

**User Story**: Como desenvolvedor, quero acessar dados exclusivamente por uma interface que exige `tenant_id` para que o isolamento entre tenants seja estrutural e a troca mock→real (Fase 9) seja substituição de fonte.

**Why P1**: É o contrato interno que viabiliza AD-004 e a LGPD (isolamento estrito, PRD §7.4).

**Acceptance Criteria**:

1. WHEN qualquer função da camada de acesso é chamada THEN ela SHALL exigir `tenant_id` como parâmetro e retornar apenas registros daquele tenant.
2. WHEN a camada é consultada com o tenant A THEN nenhum registro do tenant B SHALL aparecer no resultado (verificado por teste automatizado).
3. WHEN uma tela futura precisar de leads, conversas, documentos ou config do tenant THEN ela SHALL obter tudo via essa camada — nenhum acesso direto ao Drizzle fora dela (verificável por convenção de módulo/export).

**Independent Test**: Teste automatizado consultando cada função com os 2 tenants do seed e afirmando disjunção total dos resultados.

---

### P1: App shell navegável com seletor de tenant ⭐ MVP

**User Story**: Como gestor da imobiliária (persona da demo), quero navegar entre as áreas do CRM e ver os dados da minha imobiliária para que a demo tenha esqueleto real desde já.

**Why P1**: Decidido no discuss — "a fundação onde todas as telas se apoiam"; lotes seguintes só preenchem conteúdo.

**Acceptance Criteria**:

1. WHEN o app abre THEN o sistema SHALL exibir um layout com sidebar contendo 5 itens de navegação (Configurações, Documentos, Pipeline, Chats, Dashboard) construído com componentes Astryx.
2. WHEN um item da sidebar é clicado THEN o sistema SHALL navegar para a rota correspondente exibindo uma página placeholder que identifica a área e o tenant ativo.
3. WHEN o tenant é trocado no seletor THEN o sistema SHALL refletir o novo tenant em toda a UI (estado global via Zustand) e os dados exibidos SHALL passar a ser exclusivamente do novo tenant.
4. WHEN o app é recarregado THEN o tenant ativo SHALL persistir (ex.: localStorage via Zustand persist).

**Independent Test**: Navegar pelas 5 rotas, trocar de tenant e verificar que o nome da imobiliária/dados exibidos mudam.

---

### P2: Projeto deploy-ready para Vercel

**User Story**: Como fundador, quero o projeto publicável na Vercel para que a demo seja acessível por link aos clientes-piloto.

**Why P2**: Requisito de stack (AD-005), mas a demo local satisfaz os lotes seguintes; deploy pode acontecer a qualquer momento.

**Acceptance Criteria**:

1. WHEN `next build` roda THEN o build SHALL completar sem erros com as env vars documentadas (`.env.example`).
2. WHEN o app roda em produção (build + start) THEN as 5 rotas e o seletor de tenant SHALL funcionar igual ao dev.

**Independent Test**: `npm run build && npm run start` local com `DATABASE_URL` apontando para o Neon.

---

## Edge Cases

- WHEN um tenant não tem leads/conversas/documentos THEN as consultas SHALL retornar coleções vazias (nunca erro) — placeholders exibem estado vazio.
- WHEN o banco está indisponível THEN o app SHALL exibir erro claro na área afetada em vez de crashar o shell.
- WHEN `DATABASE_URL` está ausente THEN o app SHALL falhar no startup com mensagem explícita apontando `.env.example`.
- WHEN a rota acessada não existe THEN o sistema SHALL exibir 404 padrão dentro do shell.

## Implicit-Requirement Dimensions (sweep — Large)

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | Enums/constraints no schema (status, modalidade, motivação); sem input de usuário nesta fase além do seletor de tenant |
| Failure / partial-failure | Banco indisponível → erro claro por área (edge case); seed transacional |
| Idempotency / retry | Seed idempotente (AC 1.3) |
| Auth boundaries | N/A because auth foi explicitamente adiada (discuss); seletor é dev-only sem fronteira de segurança |
| Concurrency / ordering | N/A because fase read-only com usuário único de demo; nenhuma escrita concorrente existe |
| Data lifecycle / expiry | Schema de documentos reserva campo de expiração (`expires_at` nullable); enforcement é Fase 7 — N/A executar agora |
| Observability | N/A because demo local/Vercel logs bastam nesta fase; instrumentação real é Fase 10 |
| External-dependency failure | Neon é a única dependência externa → coberta em Failure acima |
| State-transition integrity | Enum de status garante valores válidos; máquina de transições é responsabilidade do contrato (Fase 7) |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FUND-01 | P1: Modelo de dados (schema tenant_id) | Design | ✅ Verified |
| FUND-02 | P1: Modelo de dados (seed 2 tenants completo) | Design | ✅ Verified |
| FUND-03 | P1: Modelo de dados (seed idempotente) | Design | ✅ Verified |
| FUND-04 | P1: Modelo de dados (invariantes por status + enums) | Design | ✅ Verified |
| FUND-05 | P1: Camada de acesso (interface exige tenant_id) | Design | ✅ Verified |
| FUND-06 | P1: Camada de acesso (isolamento testado) | Design | ✅ Verified |
| FUND-07 | P1: App shell (sidebar 5 rotas, Astryx) | Design | ✅ Verified |
| FUND-08 | P1: App shell (seletor de tenant + Zustand + persist) | Design | ✅ Verified |
| FUND-09 | P2: Deploy-ready (build limpo + .env.example) | - | ✅ Verified |

**Coverage:** 9 total, 9 verified (see `.specs/features/fase-1-fundacao/validation.md` for evidence; FUND-04 and FUND-08 carry minor spec-precision notes, not gaps)

---

## Success Criteria

- [ ] App navegável nas 5 rotas com dados vindos do Neon, trocando de tenant sem vazamento de dados entre imobiliárias.
- [ ] Seed re-executável a qualquer momento deixando o banco em estado canônico.
- [ ] Teste automatizado de isolamento multi-tenant passando.
- [ ] `next build` limpo.
