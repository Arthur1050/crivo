# Fase 1 — Fundação Técnica Context

**Gathered:** 2026-08-01
**Spec:** `.specs/features/fase-1-fundacao/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Fundação do CRM mock-first: stack obrigatória (Astryx, Zustand) instalada, schema multi-tenant no Neon Postgres via Drizzle com seed de dados mockados de 2 imobiliárias fictícias, camada de acesso a dados isolada por tenant, e app shell com sidebar (5 rotas placeholder) + seletor de tenant fake. Nenhuma tela funcional, nenhuma integração real.

---

## Implementation Decisions

### Persistência dos dados mockados

- Neon Postgres + Drizzle ORM desde a Fase 1 — banco real, dados fictícios via seed.
- Racional confirmado com o usuário: a Fase 9 troca quem ESCREVE no banco (agente via contrato da Fase 7), não o storage; alinha com AD-002 (`tenant_id` desde o schema).

### Autenticação

- SEM better-auth nesta fase. Seletor de tenant fake (dev-only) para navegar como cada imobiliária.
- Auth real entra em fase posterior, antes do piloto com dados reais.

### Fonte da lib Astryx

- Usuário delegou: "acesse https://astryx.atmeta.com/docs/getting-started e decida por conta".
- Decidido a partir das docs oficiais: pacotes npm `@astryxdesign/core` + `@astryxdesign/theme-neutral` + `@astryxdesign/cli`; `npx astryx init` (não-interativo); imports CSS do tema no globals; CLI `astryx component` / `astryx template --list` para explorar catálogo antes de construir telas.

### Escopo do app shell

- Fase 1 INCLUI o app shell: layout com sidebar (Configurações, Documentos, Pipeline, Chats, Dashboard), rotas placeholder identificando área + tenant ativo.
- Tenant ativo em estado global Zustand com persistência (localStorage).

### Agent's Discretion

- Entidades e volumes exatos do seed (~20–30 leads/tenant, distribuição pelos 3 status, conteúdo das conversas mockadas).
- Estrutura interna da camada de acesso a dados (naming, organização de módulos), desde que toda função exija `tenant_id`.
- Escolha de componentes Astryx específicos para o shell.

### Declined / Undiscussed Gray Areas → Assumptions

- Conta/connection string do Neon: usuário fornece `DATABASE_URL` antes do Execute (registrado como bloqueio na spec). Fallback aceito: Postgres local com a mesma URL de conexão em `.env`.

---

## Specific References

- Roadmap: "fundação onde todas as telas seguintes se apoiam" — shell mínimo, sem antecipar conteúdo das Fases 2–6.
- AGENTS.md: ler `node_modules/next/dist/docs` antes de escrever código (Next.js 16.2.11 tem breaking changes vs. conhecimento prévio).

---

## Deferred Ideas

None — discussion stayed within feature scope.
