# L14b — Baseline de execução

Data: 2026-10-02. Branch: `main`. Planejamento aprovado: `c65b186`.
Nenhuma implementação do L14b existia ao executar os comandos abaixo.

| Gate | Resultado observado |
| --- | --- |
| `validate_spec.py spec.md --strict` | 0 erros, 0 avisos |
| `validate_tasks.py tasks.md --strict` | 0 erros, 0 avisos |
| Whitespace do planejamento | PASS após remover uma linha vazia final do prompt |
| `npm run lint` | exit 0; 0 erros, 5 avisos anteriores |
| `npm run build` | exit 0; Next 16.2.11, build e geração de rotas concluídos |
| `tsc --noEmit` | exit 1; 50 erros anteriores, nenhum código novo do lote |
| `npm test`, primeira execução com rede autorizada | exit 1; 144/145 arquivos e 2395/2402 testes passaram; 7 timeouts no cron de retenção |
| Reexecução isolada do cron de retenção | exit 0; 1/1 arquivo e 10/10 testes passaram em 16,41s |
| Reexecução completa nas branches de worker | exit 1; 144/145 arquivos e 2400/2402 testes passaram em 311,36s; somente os dois timeouts históricos de DOCLIM-01 AC8 |

## Evidência e interpretação

Os sete timeouts estão em
`src/server/integration/__tests__/routes/cron-expire-documents.test.ts:138`,
`:151`, `:177`, `:221`, `:263`, `:271` e `:303`, no limite de 30s.
O mesmo arquivo passou integralmente na branch-base isolada, sem alteração de
código, asserção ou timeout. A diferença entre os ambientes permanece em investigação.
Na repetição completa, os testes do cron passaram. As únicas falhas restantes
foram os dois testes históricos em `src/server/__tests__/actions.test.ts:1337`
e `:1349`, ambos por timeout de 30s. Esse resultado não autoriza ignorar
falhas nos gates posteriores.

## Pendência antes de T1

O Execute permanece sem implementação. Foi solicitada orientação ao usuário
para investigar e corrigir os dois timeouts anteriores em commit separado,
preservando asserções e limites. A pergunta segue o passo 8 do prompt aprovado;
não é uma nova aprovação geral de spec, tarefas ou workers.

Há uma hipótese de latência, ainda não comprovada: a reconciliação em
`src/server/documents/repository.ts:496` faz um UPDATE por documento, e a
restauração do helper em `src/server/__tests__/actions.test.ts:1325` repete
um UPDATE por documento. Uma correção precisa manter o estado final de cada
documento, o escopo do tenant e a transação, além de passar a suíte original.
Nenhum destes trechos foi alterado nesta sessão.

A primeira tentativa dentro do sandbox recusou conexões Postgres com `EACCES`.
Ela foi descartada como baseline do produto. A execução autorizada usou as branches
de worker existentes e a configuração de `TEST_DATABASE_URL`; nenhuma migração,
seed manual ou limpeza global foi executada.

O primeiro build dentro do sandbox falhou por acesso negado na resolução de módulos.
A repetição autorizada terminou com exit 0. O build emitiu avisos de configuração
de better-auth; o sucesso de compilação não prova configuração operacional de produção.

Logs locais completos ficam nos arquivos `baseline-*.local.log`, sem inclusão nos
commits. O diagnóstico de tipos está em `baseline-types.local.log`. Os quatro
arquivos de `n8n/generated/` inicialmente reportados pelo Git apresentaram diff de
conteúdo vazio (`git diff --quiet` com exit 0); houve somente normalização de fim
de linha pelo ferramental existente.

Nenhum teste foi removido, enfraquecido ou pulado pela execução do L14b.
