# EXECUTE-PROMPT — Lote 16c, vitrine em produção

Execute o lote 16c do Krivo com a skill `tlc-spec-driven` (ative pelo nome e siga o Execute e as Critical Rules). Responda sempre em português. **Só comece com L16a e L16b fechados com Verifier PASS.**

## Modelo

- **Sessão de execução: Claude Sonnet 5.5, esforço `medium`.** Não há código novo; o trabalho é conduzir ações externas uma a uma, com registro.
- **Não use `xhigh` nem `max`.**
- **Verifier: Claude Opus 5.5.** Sem código, o sensor de discriminação não se aplica; o Verifier confere, AC por AC, que cada ação tem autorização, saída e rollback registrados e que as provas (capturas, medições, consultas de catálogo) existem.

## O que já está aprovado (não pergunte de novo)

- `.specs/features/lote-16c-vitrine-ativacao/spec.md` e `tasks.md`; design e context comuns do L16; AD-040 a AD-043.

A aprovação do lote **não** autoriza nenhuma ação externa. **Cada uma exige autorização explícita do usuário no momento, task a task**, com a ação exata e o rollback na mesma mensagem:

| Task | Ação | Quem faz |
| --- | --- | --- |
| T0 | Leitura da doc da Vercel | executor |
| T1 | `drizzle-kit push` em produção (plano antes) | executor, com autorização |
| T2 | SQL das views em produção | executor, com autorização |
| T3 | SQL do papel e grants em produção, sem senha | executor, com autorização |
| T4 | `ALTER ROLE krivo_vitrine PASSWORD` no editor SQL do Neon | usuário |
| T5 | Consultas de catálogo em produção (leitura) | executor, com autorização |
| T15 | Variável `KRIVO_OPERATOR_ALERT_EMAIL` e `RESEND_FROM` na Vercel (a antiga fica) | usuário |
| T6 | Full + auditoria de trailer + `git push origin main` (deploy do CRM, em janela combinada) | executor, com autorização |
| T16 | Troca `X-Crivo-*` → `X-Krivo-*` nas versões já publicadas dos workflows do n8n (MCP) | executor, com autorização por workflow |
| T17 | `scripts/brand/rename-to-krivo.sql` em produção | executor, com autorização |
| T18 | Conferência por leitura; o usuário remove a variável antiga | executor (leitura) / usuário |
| T7 | Projeto da vitrine na Vercel com as 3 variáveis | usuário |
| T8 | Variáveis do CRM | usuário |
| T9 | Redeploy do CRM | usuário |
| T10 | Configurar e ativar a vitrine da imobiliária piloto | usuário |
| T11 | Capturas e `curl -I` da vitrine em produção | executor, com autorização |
| T12 | Mudar o status de um imóvel / medir o tempo | usuário / executor |
| T13 | Prévia do link no WhatsApp | usuário |

Nenhuma escrita do executor em dado de produção, nenhuma variável remota criada pelo executor e nenhuma escrita no n8n, **exceto** as duas autorizadas acima: a troca de marca nas versões publicadas do n8n (T16) e o SQL da marca (T17), cada uma com autorização no momento, ação exata e rollback.

## Leia só isto antes de começar

1. `spec.md` e `tasks.md` do lote; `design.md` comum (§ Data Models, § Fatos operacionais, § Risks).
2. `scripts/vitrine/README.md` e `vitrine/README.md`.
3. Em `.specs/STATE.md`, apenas AD-014, AD-040 a AD-043, e o Handoff.
4. `.specs/audits/2026-10-l14b.md` § 7.

## Janelas

| Janela | Tasks | Termina quando |
| --- | --- | --- |
| A | T0–T6 e T15–T18 (gate, banco de produção, preparo da renomeação, push, n8n, SQL da marca, conferência) | Push, T16, T17 e T18 registrados, ou parada registrada |
| B | T7–T13 (Vercel, configuração, prova) | Medições e prévia registradas |
| C | T14 + fechamento | Verifier PASS, arquivamento feito |

## Regras de produção

- **Ordem fixa**: schema (T1) → views (T2) → papel (T3) → senha (T4) → conferência (T5) → preparo da renomeação (T15) → Full e push (T6) → cabeçalho no n8n (T16) → SQL da marca (T17) → conferência (T18) → projeto da vitrine (T7) → variáveis e redeploy do CRM (T8, T9). Código que lê `tenant_storefronts` não sobe antes da T1; a vitrine não sobe antes das views.
- **T1**: mostre o plano do `drizzle-kit` ao usuário antes de aplicar; qualquer mudança além de `tenant_storefronts`, dos dois enums e de `properties.featured` → pare. Confira os checks em `pg_constraint` (o push não aplica check; o SQL da vitrine os adiciona).
- **T5**: se o papel tiver qualquer grant além dos dois, associação a `neon_superuser` ou faltar `default_transaction_read_only`, aplique o rollback da T3 e pare antes do push.
- **T6**: `npm test` e `npm run vitrine:e2e` uma vez cada, nunca juntos. Instabilidades conhecidas: timeout de `DOCLIM-01 AC8` e de `maintenance.integration.test.ts`. Antes do push, audite `origin/main..HEAD` **e** `origin/main` inteiro por trailer (AD-014). Peça autorização com o hash e a lista de commits.
- **Renomeação (AD-047, T15–T18)**: o push de `main` implanta o CRM na Vercel e a renomeação muda o contrato (`X-Krivo-*`), a variável do alerta e os assets. Sem T15 feita não há push. Combine a janela com o usuário e rode T16 e T17 logo depois do deployment pronto; registre o início e o fim da janela. Antes da T6, levante por leitura (MCP do n8n) a lista dos workflows publicados que usam o contrato e mostre-a ao usuário. **Em cada workflow publicado, guarde antes o JSON (L-061) e aplique só a troca de marca**; se houver outra diferença, pare. **Nunca publique os gerados de `main`**: eles incluem o L14b, ainda não ativado. Não crie nem ative workflow, subscription ou credencial. A variável antiga do alerta só o usuário remove, depois de a nova estar em uso (cron de 03:00 UTC).
- Nunca leia, digite, registre ou peça senha, segredo, token ou connection string. Nunca leia nem cite o arquivo de variáveis do ambiente local, nem escreva o nome dele em comando ou commit.
- Capturas sem dado de lead; salvas no momento (L-054).
- Commits em Conventional Commits com escopo `l16`, sem `Co-Authored-By`, "Generated with" ou marca de atribuição (AD-014).

## Fechamento (janela C)

1. T14.
2. Verifier novo e independente (Opus), conforme acima. Ele grava `validation.md` sem apagar os registros das ações.
3. `validate_state.py`. Revisão de lições (AD-028): apresente as candidatas do L16b e do L16c e não promova nenhuma (as do L16a já foram decididas em 2026-10-10: L-069 descartada, L-070 e L-071 confirmadas).
4. Arquivamento (AD-029): `tasks.md` e `EXECUTE-PROMPT.md` para `archive/lote-16c-vitrine-ativacao/`, com `ARCHIVED.md`; apague `GOAL-PROMPT.md` (transitório, as metas de `/goal` das janelas).
5. Atualize só o Handoff do `STATE.md`. Reporte: o que está em produção, medições de frescor (F15), prévia (F17), rollbacks disponíveis, pendências.
6. Push dos commits de fechamento só com nova ordem explícita do usuário e nova auditoria de trailer.
