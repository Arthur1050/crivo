# L14b — evidência da fase 2 / lote B

Fase 2/lote B concluídos sob a ressalva autorizada dos dois timeouts históricos.
T8–T14 implementadas em sequência, cada uma após gate/revisão/commit anterior.
Todas as 142 adições passaram; a suíte completa não é integralmente verde.
T14 integra o commit deste registro. São 14/68 tarefas locais concluídas;
T15–T68 e verifier independente da feature permanecem pendentes.

| Task | Commit | Gate medido pelo root |
| --- | --- | --- |
| T8 — reducer e classificação | `ceb372e` | Quick 1 arquivo, 28/28, exit0, 225ms; 28 novos |
| T9 — ingestão autenticada | `de613fd` | Full 5 arquivos, 75/75, exit0, 61,79s; 16 novos + 59 regressões |
| T10 — vínculo outgoing | `1105338` | Full 5 arquivos, 70/70, exit0, 85,52s; 9 novos + 61 regressões |
| T11 — contrato/período/volume | `67b60a4` | Quick 2 arquivos, 56/56, exit0, 548ms; Full auxiliar schemaUsage 11/11, exit0, 31,18s; 28 normalizador + 3 schema novos |
| T12 — adapter Graph versionado | `a46f1df` | Quick 4 arquivos, 86/86, exit0, 1,51s; 18 novos + 68 regressões |
| T13 — lease/CAS e orçamento | `fe09623` | Regate Full 5 arquivos, 93/93, exit0, 122,64s; 20 sync + 2 aliases novos e 71 regressões |
| T14 — DAL autorizada/DTO | Commit deste registro | Regate Full 5 arquivos, 79/79, exit0, 67,57s; 18 novos + 61 regressões |

As 142 adições são 28 + 16 + 9 + 31 + 18 + 22 + 18. Somadas às 70 da fase1,
totalizam 212 adições L14b, todas passando na execução completa fresca.
Adequação forward/reverse, file:line, expressão e esperado da spec em
[T8](t8-verification.md), [T9](t9-verification.md), [T10](t10-verification.md),
[T11](t11-verification.md), [T12](t12-verification.md),
[T13](t13-verification.md) e [T14](t14-verification.md).
Nenhum teste anterior foi excluído, pulado ou enfraquecido.

## Checks frescos da fase

| Check | Resultado real do root |
| --- | --- |
| Full T14 e regressões | Exit0, 5/5 arquivos, 79/79 testes, 67,57s; início 2026-10-03 07:38:11 America/Sao_Paulo |
| npm test | Exit1, 158/159 arquivos, 2612/2614 testes, 399,96s; início 2026-10-03 07:39:57 America/Sao_Paulo; somente os dois timeouts históricos |
| npm run lint | Exit0, zero erros e os mesmos cinco avisos anteriores |
| npm run build | Exit0, Next16.2.11, avisos históricos BetterAuth; sem valores de segredo |
| tsc --noEmit pós-build | Exit2, exatamente 50 linhas error TS; comparação com as 50 anteriores retorna delta vazio |
| validate_spec/tasks --strict | Zero erros e zero avisos no fechamento T14 |
| check_commit / whitespace | Passaram localmente no fechamento T14 |

As únicas falhas da suíte completa foram actions.test.ts:1337 e :1349,
DOCLIM-01 AC8, timeout30000ms. O usuário determinou registrar para resolução
posterior e continuar este lote; os testes permanecem ativos com os mesmos
asserts e limites. Nenhuma falha nova ou diferente apareceu. A ressalva
autoriza fechar o lote, sem declarar a suíte completa verde. A diferença para
o baseline 2400/2402 é de 212 testes adicionados, e para fase1 2470/2472 é142.

## Correções e evidência recuperável

T9 teve primeiro Full 74/75: PIDs iguais obtidos em autocommit eram uma
medição inválida sob PgBouncer transaction mode. Fixture passou a medir PIDs
dentro de duas transações reais independentes, mantendo asserts de PIDs
distintos, dois locks e resultados; regate75/75. T13 teve primeiro gate92/92
válido; revisão final achou guarda de fuso/fim faltante no snapshot. Correção
e caso Amman/Atenas levaram ao regate93/93, sem conversão do histórico.

T14 teve Full recuperável78/79 e falha no afterAll: fixture humana sem
authorName obrigatório e recibo órfão intencional não removido antes do canal.
Fixtures corrigidas sem alterar constraint/implementação/asserts; estados
esperados ficaram literais independentes. O root recuperou somente os quatro
tenants/quatro usuários desses runs, confirmados pelos identificadores,
nomes/slugs/emails/timestamps próprios; removeu dois órfãos, 38 canais, quatro
tenants e quatro usuários em uma transação test, isError=false, postcounts
zero. Run anterior com handle96618 perdido foi confirmado terminal pelo OS;
não recebeu exit/contagem inventados. Regate79/79 e leitura SQL posterior
confirmaram zero fixtures de leitura na branch base test.

Correção auxiliar T11 do CHECK civil, necessária para USO-01 mês inteiro:
aceitar primeiro instante de meia-noite repetida ou inexistente, sem perder
hora inicial de Havana/Amman. SQL exato t11-schema.sql substituiu somente o
CHECK em cinco transações de teste, com hash/alvos/precheck em
[test-schema-activation.md](test-schema-activation.md). T6 SQL histórico foi
preservado. Main/produção excluídas. T13 também corrigiu aliases ISO por
predicate canônico compartilhado: UK/GB e BU/MM não são países disjuntos.
Essas correções cumprem o contrato aprovado; nenhuma SPEC_DEVIATION.

## Limites da entrega

Postgres real, fixtures próprias e teardown restrito provam ingestão, vínculo,
períodos, cadência e autorização. Disputas T9/T13 usam backends independentes
medidos dentro de BEGIN e locks observados. Leitura DAL mede queries reais:
Settings1, conversa2, thread50saídas1, Graph0. Nenhum saldo vem de contagem
local de mensagens/webhook. DTOs não contêm WABA, token ou payload bruto.

Provas reais permanecem parciais, conforme
[analytics-account-observation.md](analytics-account-observation.md).
Conta conhecida é de teste; diagnóstico Graph v25 comprovou shape básico e
filtro por número normalizado, sem comprovar produção, vínculo tenant/número,
IANA da conta, cobertura mensal integral, paginação ou semântica de zero.
MONTHLY vazio coexistiu com DAILY/HALF_HOUR não zero; vazio não é zero.
Adapter/configuração real continuam fechados por padrão; fixtures sintéticas
não concedem capacidade de produção. Transporte HMAC/serializer/seleção
efetiva de status instalado permanece gate factual, sem contorno do browser
developers.facebook.com anteriormente negado.

T14 oferece DTOs autorizados, enquanto UI/refresh/tick/wiring/retention e a
retomada contextual seguem nas tarefas posteriores. Não houve ativação real,
publicação n8n, envio WhatsApp, push ou deploy deste lote. Logs/scripts
*.local.* ficam fora do commit; STATE é mantido pelo root. Este worker não
criou subagentes; verifier independente permanece obrigatório após T68.
