# Lote 16a — Validação

## Registro do gate de viabilidade (T0, 2026-10-09)

Executado na branch `test` do Neon (banco de teste, AD-033), como `neondb_owner` (sem superusuário). Papel de prova `crivo_vitrine_gate`, criado e removido na mesma execução; schema `vitrine` de prova criado e removido. Nenhuma URL, senha ou chave foi impressa ou registrada: a senha do papel de prova era aleatória, só existiu em memória e em arquivo temporário apagado.

| ID | Fato | Fonte e comando (sem credencial) | Resultado |
| --- | --- | --- | --- |
| F1 | Papel criado por SQL fica isolado | `create role ... login password ...` pelo dono; `pg_has_role(papel, 'neon_superuser', 'member')`; `pg_auth_members`; `information_schema.role_table_grants`; `has_table_privilege(papel, tabela, 'select')` nas 25 tabelas de `public`; login real e `select` em 9 tabelas | **Passou.** Membro de `neon_superuser`: não. Associações a papéis: 0. Grants em `role_table_grants` antes de grant explícito: 0. Tabelas de `public` com `SELECT`: 0 de 25. `rolsuper`, `rolcreaterole`, `rolcreatedb`, `rolbypassrls`: todos falsos. `SELECT` em `leads`, `messages`, `conversations`, `users`, `sessions`, `accounts`, `tenants`, `properties`, `tenant_api_keys`: `42501` em todas. |
| F2 | Papéis são por branch | `select count(*) from pg_roles where rolname = ...` na base e nos 4 workers | **Passou.** O papel criado na `test` não existe em nenhum dos 4 workers (`test-worker-1` a `4`). Aplicar o SQL por alvo é necessário e basta; T10 já prevê isso. |
| F3 | O papel faz login pelo pooler com a URL base trocando usuário e senha | `new Client(url com usuário e senha trocados).connect()`; `select current_user` | **Passou.** O host da URL base é `-pooler`; `current_user` = papel de prova. T7 e T9 usam o mesmo endpoint. |
| F4 | `default_transaction_read_only`, `statement_timeout` e `security_barrier` aceitos | `show server_version`; `alter role ... set ...`; `show` em sessão nova; escrita; `create view ... with (security_barrier = true)` e `pg_class.reloptions` | **Passou.** Postgres 17.11. Sessão do papel: `default_transaction_read_only = on`, `statement_timeout = 5s`; `create table` recusado com `25006`; `reloptions = {security_barrier=true}`. |
| F5 | `drizzle-kit push` ignora o schema `vitrine`; alterar coluna usada por view falha | Push real na branch `test` com `vitrine.gate_v` (view sobre `public.properties`) presente; `alter table ... alter column neighborhood type varchar(500)` numa transação revertida | **Passou nos dois pontos.** O push não citou o schema `vitrine` (`schemaFilter: ["public"]`). O `alter` com a view presente falhou com `0A000 cannot alter type of a column used by a view or rule`. Confirma a ordem drop → push → apply do design (T10). |
| F7 | `after()` funciona em Server Action no Next 16.2.11 | `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`, linha 8 | **Passou.** A doc lista "Server Functions" entre os usos permitidos. |

### Achado do gate (não bloqueia, afeta T1 e T10)

O `drizzle-kit push` na branch `test` termina com `error: relation "leads_tenant_id_id_idx" already exists` (`42P07`) **e código de saída 0**, com ou sem a view de prova presente. É a quirk já registrada no Handoff do L15 (o `push` não enxerga índices únicos e tenta recriá-los) somada ao L-068 (saída 0 com falha). Consequências para o lote:

- A T1 não pode confiar no código de saída do push nem na ausência de erro: confere o estado final em `pg_constraint` e `information_schema.columns` em todos os alvos.
- A T10 precisa de conferência de estado final (já prevista) e não pode tratar saída 0 como sucesso.
- Se o erro abortar as instruções que vêm depois do índice, a T1 detecta pela conferência e corrige a causa antes de seguir.

### Linha de base do `tsc`

`npx tsc --noEmit -p .` na `main` em `803ef9c`, antes de qualquer mudança do lote: **50 erros** (saída 1), todos preexistentes (o lote 14b registrou o mesmo total). Critério do build gate nas tasks de código: nenhum erro novo além desses 50, e nenhum nos arquivos que a task altera.

### Estado após o gate

Papel `crivo_vitrine_gate` removido (`pg_roles` = 0) e schema `vitrine` inexistente na base de teste. Workers não foram tocados. Nada fora dos bancos de teste.
