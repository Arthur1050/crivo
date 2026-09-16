# Reparo de `updatedAt` em imóveis

## Decisão

`updateProperty` usará o relógio do PostgreSQL para preencher `updatedAt`.

## Problema

`createProperty` recebe `updatedAt` de `DEFAULT now()` no banco. O update atual envia `new Date()` do processo da aplicação. No banco de teste Neon, o relógio do banco estava 21 ms à frente do processo: após uma espera de 5 ms, o update gravou um instante anterior ao da criação. O teste `avança updatedAt (happy path)` falha mesmo com a atualização de `areaSqm` aplicada.

## Escopo

- Alterar somente a atribuição de `updatedAt` em `updateProperty`.
- Preservar os campos mutáveis, o filtro por tenant e os no-ops existentes.
- Manter a asserção de monotonicidade do teste.

## Implementação

O update emitirá `now()` no PostgreSQL, junto dos valores do patch. O banco passa a ser a única fonte de tempo para criação e atualização da tabela `properties`.

## Verificação

1. Executar o teste isolado de propriedades.
2. Confirmar que os 25 testes passam, incluindo a asserção de que `updatedAt` avança.
3. Executar lint e build antes de retomar o baseline do Lote 12.

## Fora de escopo

- Alterar o relógio, timezone, schema ou demais funções de atualização.
- Enfraquecer a espera ou a asserção do teste.
