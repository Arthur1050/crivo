# Lote 16c — Vitrine, ativação em produção — Specification

**Context**: `.specs/features/lote-16-vitrine-publica/context.md`
**Design**: `.specs/features/lote-16-vitrine-publica/design.md`
**Depende de**: L16a e L16b fechados com Verifier PASS

## Problem Statement

O L16a e o L16b entregam código testado localmente, mas nada disso existe em produção: as colunas,
as views, o papel `krivo_vitrine`, o segundo projeto na Vercel e as variáveis dos dois lados. Cada
uma dessas ações é externa, difícil de desfazer em parte e exige autorização explícita do usuário no
momento (auditoria do L14b § 7, item 7). Este lote faz essas ações uma por task, com rollback, e
prova a vitrine funcionando com dado real.

## Goals

- [ ] A vitrine da imobiliária piloto responde em produção, com o papel de banco provado restrito.
- [ ] Um imóvel marcado como reservado no CRM some da vitrine, e o tempo até sumir fica medido e
      registrado.
- [ ] Toda ação externa tem autorização, saída e rollback registrados em `validation.md`.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Domínio próprio, DNS, certificado | Fora do L16 |
| Qualquer mudança de código de produto | Código é do L16a/L16b; defeito encontrado vira fix task no lote de origem ou lote novo |
| Indexação, sitemap | `noindex` (AD-043) |
| `ignoreCommand` no projeto do CRM | Ideia adiada (context.md) |
| Escrita do executor em dado de produção (imóveis, configurações) | Feita pelo usuário pela tela do CRM |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Quem cria o projeto da Vercel e as variáveis | Usuário, pelo painel | Envolve segredo e senha do papel; o executor nunca vê nem digita | n |
| Quem define a senha do papel em produção | Usuário, no editor SQL do Neon, com `ALTER ROLE ... PASSWORD` | O script nunca recebe senha de produção | n |
| Quem gera o segredo de revalidação | Usuário, com o comando local indicado na task (32 bytes aleatórios) | O executor não vê o valor | n |
| Ordem | Gate → schema → views/papel → conferência do papel → preparo da renomeação na Vercel → Full → push → troca do cabeçalho no n8n → SQL da marca → conferência → projeto e variáveis da vitrine → configuração real → prova | Código que lê as colunas não pode ir antes delas; a vitrine não pode subir antes das views; o CRM renomeado (AD-047) só pode ficar em produção com o n8n e o banco já ajustados | y |
| Coordenação da renomeação para Krivo (AD-047) | Feita neste lote, antes de o código de `main` ficar em produção: variável nova do alerta criada antes do push (usuário), cabeçalho `X-Krivo-*` trocado nas versões já publicadas do n8n logo depois do deploy (executor, com autorização por workflow), SQL da marca em produção (executor, com autorização) | O push de `main` implanta o CRM na Vercel e a renomeação muda o contrato e a variável; sem coordenação o agente do n8n é recusado (401), o alerta do operador deixa de sair e o schema da vitrine não existe | y — usuário, 2026-10-17: opção (a) da auditoria de publicação, executor via MCP no n8n |
| Imobiliária da prova | A imobiliária piloto, configurada pelo usuário | É o cliente real | n |
| Medição do frescor | Segundos entre salvar no CRM e a página refletir, em 3 tentativas | Prova F15; o pior caso esperado é 5 min | n |
| Rollback do deploy | Redeploy do deployment anterior pela Vercel; vitrine: pausar o projeto | Padrão do L15 | n |

**Open questions:** none — registradas acima para confirmação na revisão.

---

## User Stories

### P1: Gate de produção ⭐ MVP

**User Story**: Como responsável pelo produto, quero confirmar os limites da plataforma antes de
criar qualquer coisa.

**Why P1**: Auditoria do L14b § 7, item 4.

**Acceptance Criteria**:

1. WHEN o lote começar THEN o executor SHALL registrar F14 e F16 do design com a fonte consultada e a data.
2. IF F14 não se confirmar THEN o executor SHALL parar o lote e avisar o usuário antes de qualquer ação externa.
3. IF F16 não se confirmar THEN o projeto da vitrine SHALL ficar sem `ignoreCommand`.

**Independent Test**: `validation.md` § Gate com F14 e F16, fonte e data.

---

### P1: Banco de produção ⭐ MVP

**User Story**: Como responsável pelo produto, quero o schema, as views e o papel em produção, provados.

**Why P1**: A vitrine não funciona sem eles, e o papel é a fronteira de segurança.

**Acceptance Criteria**:

1. WHEN o schema for aplicado em produção THEN o executor SHALL mostrar antes o plano do `drizzle-kit` e SHALL parar se houver mudança além de `tenant_storefronts`, dos dois enums novos e de `properties.featured`.
2. WHEN o schema for aplicado THEN o executor SHALL conferir em `pg_constraint` os dois checks de `tenant_storefronts` e aplicá-los pelo SQL da vitrine se faltarem.
3. WHEN as views e o papel forem aplicados em produção THEN o script SHALL rodar sem definir senha.
4. WHEN o usuário definir a senha do papel THEN o executor SHALL conferir por consulta de catálogo que o papel tem só os dois grants, `default_transaction_read_only = on` e não é membro de `neon_superuser` (F18).
5. IF a conferência do papel falhar THEN o executor SHALL parar e aplicar o rollback do papel antes de qualquer deploy.
6. The executor SHALL registrar para cada ação a autorização, a saída e o rollback.

**Independent Test**: `validation.md` com o plano, a saída e o resultado das consultas de catálogo.

---

### P1: Projetos e variáveis ⭐ MVP

**User Story**: Como responsável pelo produto, quero a vitrine como segundo projeto na Vercel e o CRM
sabendo onde avisá-la.

**Why P1**: Sem isso não há deploy.

**Acceptance Criteria**:

1. WHEN o projeto da vitrine for criado THEN ele SHALL ter Root Directory `vitrine` e o mesmo repositório do CRM.
2. The system SHALL ter no projeto da vitrine, em Production, `VITRINE_DATABASE_URL` com o papel `krivo_vitrine`, `VITRINE_REVALIDATE_SECRET` e `VITRINE_PUBLIC_URL`.
3. The system SHALL ter no projeto do CRM, em Production, `VITRINE_PUBLIC_URL` e `VITRINE_REVALIDATE_SECRET` com o mesmo segredo da vitrine.
4. The executor SHALL NOT ler, digitar nem registrar o valor de nenhuma dessas variáveis.

**Independent Test**: o usuário confirma os nomes das variáveis presentes nos dois projetos.

---

### P1: Publicação ⭐ MVP

**User Story**: Como responsável pelo produto, quero o código do L16a e do L16b em produção sem
trailer de atribuição.

**Why P1**: AD-014.

**Acceptance Criteria**:

1. WHEN o push for pedido THEN o executor SHALL antes rodar a suíte completa uma vez e auditar `origin/main..HEAD` e `origin/main` inteiro por trailer de atribuição.
2. IF a suíte falhar fora das instabilidades conhecidas ou a auditoria achar trailer THEN o executor SHALL NOT fazer o push.
3. WHEN o push for feito THEN o executor SHALL registrar o hash, a lista de commits e os dois deployments.

**Independent Test**: `validation.md` com o resultado da suíte, da auditoria e dos deployments.

---

### P1: Renomeação para Krivo em produção ⭐ MVP

**User Story**: Como responsável pelo produto, quero o CRM renomeado (AD-047) em produção sem quebrar o
agente do n8n, o alerta do operador nem os logos.

**Why P1**: O push de `main` implanta o CRM; contrato (`X-Krivo-*`), variável do alerta e assets mudaram
de nome, e o n8n e o banco de produção ainda usam os nomes antigos (auditoria de publicação, 2026-10-17).

**Acceptance Criteria**:

1. WHEN o push do código for pedido THEN o usuário SHALL ter criado antes, no Production do CRM, `KRIVO_OPERATOR_ALERT_EMAIL` com o mesmo valor da variável antiga (mantida até a conferência) e ajustado o nome de exibição de `RESEND_FROM`.
2. WHEN o deployment do CRM novo estiver pronto THEN o executor SHALL, na mesma janela, trocar `X-Crivo-*` por `X-Krivo-*` somente nas versões já publicadas dos workflows do n8n que chamam o contrato, guardando antes o JSON publicado de cada um.
3. The executor SHALL NOT publicar os arquivos gerados da branch principal (o L14b não pode ser ativado) nem criar ou ativar workflow, subscription ou credencial.
4. IF uma versão publicada tiver diferença além da troca de marca THEN o executor SHALL parar e reportar.
5. WHEN a troca no n8n for feita THEN o executor SHALL conferir que `versionId` e `activeVersionId` coincidem em cada workflow e que uma execução real do agente chama o CRM sem resposta 401.
6. WHEN o CRM novo estiver em produção THEN o executor SHALL, com autorização, aplicar `scripts/brand/rename-to-krivo.sql` depois de mostrar as linhas afetadas e gravar os valores anteriores como rollback; IF o papel `crivo_vitrine` existir THEN o executor SHALL parar.
7. WHEN o novo nome da variável do alerta estiver em uso THEN só o usuário SHALL remover a variável antiga; até lá ela SHALL ficar.
8. The executor SHALL registrar a janela entre o deployment pronto e o fim da troca no n8n, e para cada ação a autorização, a saída e o rollback.

**Independent Test**: `validation.md` com a lista de workflows, as versões antes e depois, a saída do SQL e uma execução real sem 401.

---

### P1: Prova real ⭐ MVP

**User Story**: Como responsável pelo produto, quero ver a vitrine da imobiliária piloto funcionando
e medir o frescor.

**Why P1**: Sem prova real não há entrega (AD-027 por analogia).

**Acceptance Criteria**:

1. WHEN a imobiliária piloto estiver configurada e ativa pelo usuário THEN o executor SHALL capturar, pela extensão do Chrome, o catálogo e um item, em desktop e celular.
2. WHEN o usuário marcar um imóvel visível como reservado no CRM THEN o executor SHALL medir em segundos quanto a página do item leva para mostrar a página de não encontrado, em 3 tentativas, e registrar.
3. IF alguma medição passar de 300 segundos THEN o executor SHALL registrar F15 como não confirmada e reportar ao usuário.
4. WHEN o usuário colar o link de um item num chat do WhatsApp THEN a prévia SHALL mostrar título e imagem, registrada por captura do usuário (F17).
5. WHEN a página for pedida THEN a resposta SHALL conter `X-Robots-Tag: noindex, nofollow`.
6. The executor SHALL NOT escrever em dado de produção; toda mudança de imóvel ou configuração SHALL ser feita pelo usuário pela tela do CRM.

**Independent Test**: `validation.md` com capturas, medições e a prévia.

---

### P2: Documentação

**User Story**: Como quem planeja o próximo lote, quero o roadmap e o índice atualizados.

**Why P2**: Fechamento.

**Acceptance Criteria**:

1. WHEN a prova real terminar THEN o executor SHALL marcar o L16 como executado no `ROADMAP-POS-PILOTO.md` e acrescentar L16a, L16b e L16c ao `features/INDEX.md`.

**Independent Test**: diff dos dois arquivos.

---

## Edge Cases

- IF o deploy da vitrine falhar THEN o executor SHALL registrar o erro do build e SHALL NOT tentar corrigir código neste lote.
- IF o CRM subir antes do schema por engano THEN o rollback SHALL ser o redeploy do deployment anterior do CRM.
- IF a imobiliária piloto não tiver CRECI em mãos THEN a prova real SHALL ficar pendente no Handoff, e as Phases anteriores SHALL continuar válidas.
- IF o contrato do n8n for recusado entre o deployment do CRM e a troca do cabeçalho THEN o executor SHALL registrar o início e o fim dessa janela; o rollback SHALL ser republicar o JSON guardado e, se preciso, o redeploy do deployment anterior do CRM.
- IF o cron do alerta ainda não tiver rodado com a variável nova THEN a remoção da variável antiga SHALL ficar pendente no Handoff com a data do próximo cron.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| ATIV-01 | P1: Gate de produção — AC1–AC3 | Tasks | In Tasks |
| ATIV-02 | P1: Banco de produção — AC1–AC6 | Tasks | In Tasks |
| ATIV-03 | P1: Projetos e variáveis — AC1–AC4 | Tasks | In Tasks |
| ATIV-04 | P1: Publicação — AC1–AC3 | Tasks | In Tasks |
| ATIV-05 | P1: Prova real — AC1–AC6 e Edge Cases | Tasks | In Tasks |
| ATIV-06 | P2: Documentação — AC1 | Tasks | In Tasks |
| ATIV-07 | P1: Renomeação para Krivo em produção — AC1–AC8 e Edge Cases | Tasks | In Tasks |

**Coverage:** 7 total, 7 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] A vitrine da imobiliária piloto responde em produção com a identidade dela.
- [ ] O papel de produção tem só os dois grants, provado por consulta.
- [ ] O tempo de saída de um imóvel reservado está medido; o pior caso não passa de 5 min.
