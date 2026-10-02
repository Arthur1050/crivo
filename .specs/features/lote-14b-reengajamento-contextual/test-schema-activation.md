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

T2 e T3 aplicadas nos cinco alvos conforme registros abaixo. A autorização
posterior ampla cobre as tarefas do L14b; cada novo delta continua sujeito a
revisão de SQL/alvos e gate real. T4 e posteriores ainda não foram aplicadas.
Registrar cada diff e resultado aqui.

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

### T3 aplicada nas cinco branches autorizadas

Baseline: T2 `f281a2f`. Proposta em [t3-schema.sql](t3-schema.sql), delta offline
Drizzle Kit 0.31.10 entre schema do HEAD (git show) e schema local. Seis statements:
enum agent_phase, tabela lead_agent_state, dois índices únicos tenant/id nas
tabelas existentes leads/messages e duas FKs compostas novas. Sem DROP, mudança
de coluna, atualização de linha ou aplicação em produção.

Índices são adicionados antes das FKs no SQL de aplicação, porque PostgreSQL
exige o alvo unique já criado; os statements gerados foram apenas reordenados,
sem alterar o delta. O CHECK usa literais SQL dos oito nomes canônicos de
phase.mjs, sem placeholders de parâmetros em DDL. PK tenant/lead garante estado
único, enum aceita as três fases e null; revisão positiva e até oito campos
conhecidos são constraints. Aberturas/reset permanecem metadados mínimos.

Propriedade de tenant da lead e da mensagem é garantida pelas FKs; âncora
corrente da mesma lead é validada pela consulta sob lock da T16, como no Design.
Não afirmar que a FK tenant/message resolve associação a outra lead do mesmo
tenant. Cascade remove projeção derivada ao excluir lead/âncora.

Sete cenários de integração preparados em schema-agent-state.test.ts: estado
único, lead de outro tenant, fase nullable, enum inválido/fases válidas, limite
8/9 e nomes desconhecidos, âncora ausente/estrangeira, revisão/reset/aberturas.
Fixtures próprias, sem limpeza global. Gate Full real pelo root passou: 3 arquivos,
20/20 testes, exit0, 42,78s (T3=7, canais=8, humano=5). T3 concluída.
Regressões afetadas: schema-humano.test.ts e schema-whatsapp-channels.test.ts.
Tipos locais: exatamente os 50 erros herdados, nenhum em T3/novo import phase.

Escopo solicitado continua exclusivamente as cinco branches na tabela acima,
sem main/produção. Autorização posterior do usuário: “Eu autorizo qualquer tarefa
que demandar da minha aprovação. Não interrompa a execução nesses casos, eu
autorizo tudo”. Após revisão do delta e dos alvos, root aplicou exatamente o hash
abaixo em cinco transações MCP (test e test-worker-1 a test-worker-4), todas
isError=false. Nenhuma aplicação em main/produção.

Revisão root: SQL de seis statements conferido; SHA256:
`3e17c8b1c1bc0b00d474f73dd5b767cd26d697366e7cd0eadb4488930d5fdb68`.
Leitura MCP em cada um dos cinco alvos confirmou ausência de lead_agent_state,
agent_phase e dos índices leads_tenant_id_id_idx/messages_tenant_id_id_idx.
O teste de asked_fields usa os oito nomes explícitos da política aprovada,
evitando que a expectativa seja calculada pela mesma expressão do schema.
A autorização ampla posterior concedeu a aplicação das tarefas do L14b; revisão
e cinco aplicações T3 concluídas. As leituras prévias foram somente diagnóstico.

Revisão local adicional: ESLint de `src/db/schema.ts` e
`src/db/__tests__/schema-agent-state.test.ts` passou com exit0 e nenhuma saída.
Esse resultado confirma o lint dos arquivos novos; não substitui o gate Postgres.

### T4 revisada, aplicada e validada nas cinco branches de teste

Baseline: T3 `08f6fc6`. Delta offline em [t4-schema.sql](t4-schema.sql), gerado
por Drizzle Kit 0.31.10 entre o schema desse HEAD e o local, sem conexão ou leitura
de credencial. SHA256:
`304cf2cc203259e22bbb387c1a9a4e23101fa3d59699f2186e896e2aaf233442`.
Treze statements: enum reengagement_state, tabela reengagement_episodes com cinco
CHECKs, quatro índices (um unique, dois parciais) e sete FKs compostas.
Nenhuma mudança de objetos existentes, DROP ou atualização de dados.

Chave tenant/lead/canal/âncora exclui reset e revisão. Claims e prazos de despacho
são pareados; os cinco estados posteriores à autorização exigem marcador;
aceites exigem acceptedAt e wamid não vazio. T4 não afirma imutabilidade de UPDATE
arbitrário nem uma chamada externa; esses contratos pertencem aos serviços.

Âncora/canal usam NO ACTION. As quatro referências nullable a mensagens também
usam NO ACTION composto; T63/T64 limparão somente os UUIDs antes da exclusão,
preservando tenant/chave/state/dispatchAuthorizedAt/wamid. Não usar SET NULL do
par composto nem cascade para excluir só saída ou âncora. Exclusão integral da
lead tem cascade explícito, diferente de expiração de metadados temporários.
Não há cópia do histórico. Propriedade da mesma lead dentro do tenant continua
exigindo consulta da conversa nos serviços, como na T3.

Dez cenários preparados em schema-reengagement.test.ts: unicidade/reset,
propriedade lead/canal/âncora, claims, oito estados/erros, reset após recusa ou
incerteza, escalonamento independente, tenant das referências opcionais,
limpeza de referências sem rearmar, exclusão isolada bloqueada e revisões.
Fixtures próprias de dois tenants; limpeza começa pelos próprios episódios.
ESLint dos dois arquivos passou exit0; whitespace passou. Tsc preserva exatamente
50 erros herdados, nenhum no schema/teste T4. Full real pelo root passou: quatro
arquivos, 30/30 testes, exit0, 98,13s (T4=10, agent-state=7, canais=8, humano=5).
Comando: `node node_modules/vitest/vitest.mjs run src/db/__tests__/schema-reengagement.test.ts src/db/__tests__/schema-agent-state.test.ts src/db/__tests__/schema-whatsapp-channels.test.ts src/db/__tests__/schema-humano.test.ts`.
T4 concluída, sem modificar testes anteriores; Build de fase permanece T7.

Aplica-se a autorização ampla posterior já registrada para o L14b. Alvos são
exclusivamente test e test-worker-1/2/3/4 da tabela; main/produção excluídas.
Root revisou o SQL de treze statements e os dez cenários. Leitura MCP confirmou
ausência de reengagement_episodes e reengagement_state nos cinco alvos. Aplicou
exatamente o hash acima em cinco transações MCP, todas isError=false. Nenhuma
aplicação em main/produção. Os testes conectaram a branch test real; as cinco
aplicações MCP não são cinco execuções da suíte. Full exclusivamente pelo root,
resultado acima. Autor e verifier do fechamento global continuam distintos.

### T5 revisada, aplicada e validada

Baseline: T4 `6110042`. Delta offline Drizzle Kit 0.31.10 em
[t5-schema.sql](t5-schema.sql), SHA256:
`11d4848e7f80cc936189651e9426b3a5cba641336795dcf9f0489fb4b832d082`.
Oito statements: enum de classificação, tabela receipts, coluna messages
whatsapp_phone_number_id nullable sem default/backfill/FK de Analytics, dois
índices receipts, unique de identidade em messages e duas FKs compostas novas.
Somente delta aditivo; nenhum DROP, alteração de dados ou envio externo.

Statements gerados são reordenados para ADD COLUMN antes do unique que a usa,
e índices antes de FKs. Conteúdo dos statements não muda. FK de correlação usa
tenant/canal/wamid/messageId e cascade na exclusão da mensagem, sem transformar
recibo vinculado em órfão. Legado/humano sem canal continua válido. FK de canal
confiável restringe receipts, sem impedir escrita de mensagens humanas.

CHECKs: órfão com expiração/vinculado sem expiração; firstSeenAt<=lastSeenAt;
conflito exige unavailable; wamid não vazio. Campos nullable de evidência não
fabricam gratuidades: o reducer T8/T9, não o schema, decidirá a classificação.
Não há payload bruto, conteúdo, recipient_id ou telefone pessoal no recibo.

Oito cenários preparados em schema-whatsapp-receipts.test.ts. ESLint dos dois
arquivos exit0; whitespace passou; tsc preserva os 50 erros herdados, nenhum T5.
Root revisou o delta; MCP confirmou ausência de tabela, enum, coluna e índice
novos nos cinco alvos. O hash acima foi aplicado exatamente em cinco transações
MCP, todas isError=false. A autorização ampla já cobre a aplicação L14b nos cinco
alvos test/test-worker-1/2/3/4 da tabela, excluindo main/produção.
Full real T5 + T4 + T3 + canais + humano exclusivamente pelo root passou: cinco
arquivos, 38/38 testes, exit0, 116,46s (T5=8, T4=10, T3=7, canais=8, humano=5).
Comando: `node node_modules/vitest/vitest.mjs run src/db/__tests__/schema-whatsapp-receipts.test.ts src/db/__tests__/schema-reengagement.test.ts src/db/__tests__/schema-agent-state.test.ts src/db/__tests__/schema-whatsapp-channels.test.ts src/db/__tests__/schema-humano.test.ts`.
Os testes conectaram a branch test real; cinco aplicações não são cinco execuções
da suíte. T5 concluída, sem mudança de testes anteriores; Build de fase fica T7.
