# L14b — Alvos de aplicação do esquema de teste

Data: 2026-10-02. Projeto Neon: `green-queen-03125718`.
Identidades verificadas por leitura do MCP Neon (`list_branches` e
`list_branch_computes`) e pelos endpoints de `test-workers.local.json`.

| Branch | Branch ID | Endpoint |
| --- | --- | --- |
| test | br-silent-sound-avgm9pzu | ep-holy-rice-avsjapng |
| test-worker-1 | br-bitter-shadow-av4b7tc3 | ep-sweet-unit-av3jrr1c |
| test-worker-2 | br-green-king-avpjjuqy | ep-lively-voice-avoata4u |
| test-worker-3 | br-late-tooth-avwq2eja | ep-spring-violet-avzg1d4j |
| test-worker-4 | br-muddy-hat-avwr7gcf | ep-sparkling-queen-avhozxok |

Os quatro workers são filhos de `test`. O host local de `TEST_DATABASE_URL`
resolve para o endpoint da branch `test`, banco `neondb`, e é diferente do
host de `DATABASE_URL`. Valores de credenciais não foram registrados.

`scripts/test-db-push.ts` lê somente `TEST_DATABASE_URL` e deriva os quatro
workers pelo resolvedor existente; `drizzle-test.config.ts` não faz fallback
para `DATABASE_URL`. A aplicação exige revisão do diff da tarefa atual e
autorização específica, conforme `EXECUTE-PROMPT.md`.

A branch `main` (`br-proud-wind-av7m0aq2`) está excluída deste plano de teste.
Não há autorização de migração de produção, reset de branch, seed manual,
limpeza global ou alteração de credenciais.

## Aplicações

T2 (`whatsapp_channels`) aplicada nos cinco alvos conforme registro abaixo.
Qualquer novo delta exige revisão e autorização específicas; T3 e posteriores
ainda não foram autorizadas ou aplicadas. Registrar cada diff e resultado aqui.

### T2 aplicada nas cinco branches autorizadas

Baseline local: T1 `63f6dbc`. Proposta em [t2-schema.sql](t2-schema.sql), gerada
offline pelas APIs instaladas `generateDrizzleJson` e `generateMigration` do
Drizzle Kit 0.31.10. Snapshot anterior exclui somente os dois exports novos
(`whatsappChannels`, `whatsappAccountKindEnum`); o diff de `schema.ts` contra HEAD
contém somente essas adições. A geração não abriu conexão ou leu credencial.

Delta: 5 statements, CREATE enum, CREATE tabela, FK nova para tenants com cascade
e dois índices únicos novos (global do número e tenant/número para FKs futuras).
A tabela inclui checks de revisão positiva, lease UUID/prazo pareados e consumo
habilitado somente com account_kind=production, provas ownership/Analytics e
WABA/fuso/número Analytics preenchidos. Fuso IANA deve vir de prova primária e é
validado no resolvedor T7; texto não vazio no banco não confirma um fuso real.
O campo account_kind distingue prova de produção, conta de teste e desconhecida,
sem inferir produção do nome da conta.

Não há DROP, alteração de tabela existente, seed, atualização de dados, remoção
de branch ou escrita de env. O schema não armazena token de acesso; usage_sync_token
é somente o UUID de coordenação de lease. Os cinco alvos da tabela acima são o
escopo autorizado; main/produção ficaram excluídas. Resposta literal do usuário ao pedido específico: “Autorizo aplicar a T2 nas cinco branches de teste”.
O pedido identificou este SQL, projeto green-queen-03125718 e os cinco alvos da tabela.
O usuário autorizou especificamente esta aplicação; o orquestrador aplicou o hash revisado em cinco transações MCP,
todas com isError=false, uma por branch da tabela de alvos.

Testes preparados: 8 cenários em
`src/db/__tests__/schema-whatsapp-channels.test.ts` (defaults, unicidade global
entre tenants, FK inválida, configuração/teste/desconhecida recusada, provas
completas, revisão, lease e exclusão isolada). Fixtures usam dois tenants próprios;
sem limpeza global. Gate Full em Postgres real passou: 2 arquivos, 13/13 testes, exit0, 23,46s
(T2=8, schema-humano=5). T2 completa; sem alteração nos testes anteriores.
A tentativa sandbox connect EACCES foi descartada como limitação do ambiente,
e o resultado válido veio da execução escalada autorizada pelo orquestrador.

Revisão root: SQL e diff conferidos; SHA256 de `t2-schema.sql`:
`43d9b90c4e9f5fa826d316d002ebe4c732b4fbf0d1f7967931aa3ae605b0be91`.
Leitura MCP `run_sql` em cada um dos cinco alvos confirmou
`to_regclass('public.whatsapp_channels') IS NULL` e ausência do enum
`public.whatsapp_account_kind`. Solicitação específica enviada ao usuário para
aplicar exatamente esse SQL, em transação por branch; autorização concedida e
aplicação concluída nos cinco alvos (test e test-worker-1/2/3/4).
Essa leitura não mudou schema nem dados. Não usar um push geral para aplicar
alterações de drift fora do delta revisado.

Diagnóstico local `tsc --noEmit`: 50 erros herdados, nenhum em schema/T1/T2.
Whitespace passou. Esses checks não substituem o gate Full.
