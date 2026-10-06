# T14 — leituras autorizadas de consumo e classificação

PASS pelo root: regate Full exit0, 5/5 arquivos, 79/79 testes, 67,57s,
início 2026-10-03 07:38:11 America/Sao_Paulo (import2,03s/tests64,76s).
São 18 novos e 61 regressões: whatsapp18 + conversation-reads9 +
statuses-attach9 + analytics-contract29 + channels14. Comando:
`node node_modules/vitest/vitest.mjs run src/server/data/__tests__/whatsapp.test.ts src/server/data/__tests__/conversation-reads.test.ts src/server/whatsapp/__tests__/statuses-attach.test.ts src/server/whatsapp/__tests__/analytics-contract.test.ts src/server/whatsapp/__tests__/channels.test.ts`.
Código/testes congelados. ESLint direcionado exit0, sem avisos. Root mediu
lint de fase exit0, zero erros e cinco avisos anteriores; build exit0 Next
16.2.11; tsc pós-build exit2, mesmas 50 linhas error TS da fase1, delta vazio.
Whole npm test fresco exit1, 158/159 arquivos e 2612/2614 testes, 399,96s;
somente os dois timeouts históricos DOCLIM autorizados. Todas as 142 adições
da fase2 passaram, sem falha nova. Fase fechada sob essa ressalva em
[phase-2-verification.md](phase-2-verification.md), sem declarar Whole verde.
Não há delta de schema ou contrato externo.

Full com resultado recuperável exit1, 78/79 testes, 4/5 arquivos, 71,25s, início 2026-10-03
07:32:40 America/Sao_Paulo. Fixture humana do cenário seis classificações
não preenchia authorName obrigatório; afterAll também deixou o órfão
intencional bloquear a FK ao excluir canais. Correções restritas à fixture:
authorName/authorUserId humanos e exclusão de recibos somente tenantA/B antes
dos canais. Seis estados esperados agora são literais independentes. Constraint,
implementação e asserts preservados; regate acima passou. Não é SPEC_DEVIATION.

Uma execução anterior perdeu o handle 96618; o root confirmou processo
encerrado pelo OS e não atribui contagem/exit a esse run sem resultado. Após
diagnóstico, o root recuperou exclusivamente as fixtures T14 dos dois runs:
quatro tenants e quatro usuários identificados por nome/slug/email/timestamps
próprios. Uma transação na branch base test removeu dois órfãos, 38 canais,
quatro tenants e quatro usuários, isError=false; postcounts0/0/0/0. Não houve
cleanup global, alteração de dados de outros workers ou acesso à produção.

AuthContext é o contexto interno existente, produzido pela guarda da sessão;
SessionScope no Design era seu nome conceitual. A DAL usa a matriz can e o
LeadScope real, confere tenant do contexto/escopo e restringe carteira. Settings
recusadas retornam []; conversa não autorizada retorna null; classificações
não autorizadas retornam []. O chamador não escolhe tenant/carteira no payload.

Número da conversa vem de leads.whatsappPhoneNumberId, identidade persistida
pelo recebimento e já usada no envio humano. Ausência não é preenchida com
telefone pessoal, WhatsApp geral do tenant ou canal de uma mensagem histórica.
Snapshot exige tenant/número/revisão/fuso/início/fim correntes, propriedade e
capacidade comprovadas no cadastro. Falha recente de transporte/credencial
conserva um snapshot corrente válido; nenhuma leitura acessa token ou Graph.
QueriedAt é o corte queryEnd, enquanto stale usa lastSuccessAt com limite
estrito >60min. Exatamente 60min conserva stale=false. O teste usa corte
10:59:53Z e sucesso 11:00Z, distinguindo cobertura e conclusão.

Classificação usa mensagem de saída e recibo vinculado por tenant, número,
wamid e messageId. Recibo órfão não é associado só pelo wamid. Sem recibo,
saída aceita identificada fica pending; legado sem identidade fica unavailable.
Fatos históricos permanecem mesmo quando Analytics/propriedade do cadastro
deixa de estar disponível. Inbound não recebe DTO de cobrança. DTOs contêm
somente as propriedades explicitadas no Design, sem WABA, credencial, lease ou
payload bruto. Rótulos são os valores explícitos de PRECO-01.

## Adequação forward e reverse

`test` significa src/server/data/__tests__/whatsapp.test.ts. `expected(row)`
é fixture literal independente em test:42: state available, mês outubro de
2026, used999, remaining1, queriedAt11:45Z, stale/updateFailed=false e
estimated=true; não é importada da implementação. As linhas abaixo mapeiam
todos os 18 cenários, seus asserts complementares e o resultado esperado de
volta aos mesmos ACs. Não há teste anterior removido, pulado ou enfraquecido.

| AC / cenário | file:line + expressão de asserção | Esperado da spec/Design | Reverse |
| --- | --- | --- | --- |
| USO-03 AC1; USO-02 AC3/7, admin/gestor | test:65 `expect(await getSettingsUsage(context("administrador"), options)).toContainEqual(expected(row))`; test:66 mesmo assert gestor | DTO completo mensal, corte da consulta distinto do sucesso, saldo estimado | Manter: papéis autorizados |
| USO-03 AC2/3, corretor | test:70 `expect(await getConversationUsage(context("corretor"), conv.id, options)).toEqual(expected(row))`; test:71 Settings `toEqual([])` | Agregado apenas da conversa autorizada; nenhuma configuração | Manter: carteira e permissão |
| USO-03 AC3; L14B-01 AC1, carteira alheia/sem responsável | test:77 consumo `toBeNull()`; test:78 classificações `toEqual([])` para brokerB e null | Nenhum dado de conversa fora da carteira | Manter: ausência de autorização |
| USO-03 AC5; L14B-01 AC1, tenant | test:83 conversa `toBeNull()`; test:84 classificações `toEqual([])`; test:85 Settings tenantB `toEqual([])`; test:87 contexto/escopo divergentes `toBeNull()` | Troca de tenant não reutiliza dados anteriores; contexto incoerente recusa | Manter: tenant em toda leitura |
| USO-01 AC2; USO-03 AC5, dois números | test:92 DTO first999/1; test:94 `toEqual({ ...expected(second), used: 1001, remaining: 0 })`; test:96 Settings contém ambos DTOs | Valores separados por número, substituição ao mudar canal, restante truncado em zero sem truncar V | Manter: identidade e fórmula |
| USO-03 AC4; USO-04 AC3, unknown | test:100 `toEqual({ state: "unknown-number", label: "Número da conversa não identificado" })` | Nunca usar saldo de outro número nem mensagem histórica como inferência | Manter: origem conhecida |
| USO-01 AC6; USO-02 AC5/8, mês novo | test:104 consumo em 01/nov `toEqual({ state: "unavailable", label: "Consumo indisponível" })` | Nenhum volume do mês anterior | Manter: período corrente |
| USO-02 AC3/4; USO-04 AC3, limite stale | test:109 DTO `queriedAt: "2026-10-02T10:59:53.000Z"` com stale=false; test:110 mesmo DTO com stale=true após +1ms | >60min desde sucesso; corte da consulta permanece separado | Manter: limite literal |
| USO-02 AC6; L14B-01 AC7, falha recente/credencial ausente | test:116 `toEqual({ ...expected(row), updateFailed: true })` | Conserva último snapshot válido e consulta, sem zero ou leitura de token | Manter: falha não apaga sucesso |
| USO-02 AC5, sem snapshot/sem sucesso | test:120 e test:122 `toEqual({ state: "unavailable", label: "Consumo indisponível" })` | Ausência de sucesso não é zero | Manter: indisponibilidade |
| USO-01 AC2; L14B-01 AC2/4, zero e DTO | test:127 `toEqual({ ...expected(row), used: 0, remaining: 1000 })`; test:128 keys literais; test:129 JSON `not.toContain(row.wabaId!)` | Zero explícito é válido; DTO só contém campos aprovados | Manter: zero explícito e segredo servidor |
| USO-01 AC8; USO-02 AC8, revisão/propriedade | test:134 e test:136 consumo `toEqual({ state: "unavailable", label: "Consumo indisponível" })` | Snapshot anterior/incompatível não autoriza saldo | Manter: cadastro e revisão |
| USO-01 AC1/6; USO-02 AC8, Amman/Atenas | test:142 consumo `toEqual({ state: "unavailable", label: "Consumo indisponível" })` | Mesmo início 21Z não comprova fuso/fim; Amman termina21Z, Atenas22Z | Manter: identidade completa do período |
| USO-03 AC2/5; L14B-01 AC1, canal foreign | test:146 consumo `toEqual({ state: "unavailable", label: "Consumo indisponível" })`; test:147 Settings tenantB `toContainEqual(expected(row))` | Canal só fornece snapshot para seu próprio tenant | Manter: tenant/canal |
| PRECO-01 AC1–7; USO-04 AC6, seis classificações/inbound | test:161 `expect(await getMessageClassifications(context("corretor"), conv.id)).toEqual(expectedRows.sort((a, b) => a.messageId.localeCompare(b.messageId)))`, estados literais em test:152 e rótulos em test:153; inbound fora do resultado | Mesmos fatos para agente/humano, seis estados explícitos, sem rótulo inbound | Manter: projeção factual |
| PRECO-01 AC4/5; L14B-01 AC1/5, legado/órfão | test:167 DTO pending para identidade aceita e unavailable para legado; órfão free_service não altera DTO | Sem inferência de gratuidade ou associação sem vínculo completo | Manter: correlação restrita |
| USO-04 AC6; PRECO-01 AC1, histórico | test:175 `toEqual([{ messageId: msg.id, state: "paid-service", label: "Tarifável — confirmado pela Meta" }])` após cadastro desativado | Fato histórico não depende da capacidade de Analytics atual | Manter: classificação persistida |
| USO-03 AC1/2/7; L14B-01 AC4, sem Graph/N+1 | test:182 Pool.query `toHaveBeenCalledTimes(1)` Settings; test:183 duas queries conversa; test:185 50 saídas pending; test:186 thread uma query e fetch `not.toHaveBeenCalled()`; test:187 keys literais | Custo constante de leitura em lote; nenhum transporte, somente DTOs | Manter: leitura independente de sincronização |

Fixtures/teardown próprios e Postgres real com TEST_DATABASE_URL. Spy Pool.query
delega as queries reais; não é mock de banco nem prova de concorrência.
Esta tarefa não disputa locks. Claims/CAS foram provados independentemente em
T13. Nenhum gate factual externo é satisfeito por esses dados sintéticos.
UI/refresh/tick e verifier final continuam nas tarefas posteriores.
USO-03 AC7 tem aqui somente a leitura em lote dos fatos persistidos; o ciclo
de refresh da thread exige T59/T62. USO-04 AC3 tem DTO unknown/stale; texto de
aviso/renderização exige T57/T62. L14B-01 AC7 prova leitura independente de
Graph/credencial; envio humano continua em seu caminho e exige suas próprias
provas nas tarefas de integração. Nenhum AC integral de UI é antecipado.
