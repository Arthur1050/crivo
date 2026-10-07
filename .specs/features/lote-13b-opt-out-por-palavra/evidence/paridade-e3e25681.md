# T1 — Paridade do principal publicado com 0688deb

**Veredito: EQUIVALENTE. Lote segue.** Verificado em 2026-10-07, somente leitura (MCP n8n `get_workflow_details`).

| Item | Valor |
| --- | --- |
| Workflow | `0B1nqjODu7xuYYKF` (crivo-agente-principal), ativo, não arquivado |
| `versionId` = `activeVersionId` | `e3e25681-8cd1-4ea3-bc38-33d373cf6b80` |
| Nós | 73 publicados, 73 no gerado de `0688deb`; nenhum nó só de um lado |
| sha256 de `n8n/generated/principal.ts` @0688deb (CRLF→LF) | `05d41b5b659c46edfe2e3c6a10f699b100224e9e1471a0c686d91211d8a5b9df` |
| sha256 de `n8n/workflows/principal.ts` @0688deb (CRLF→LF) | `5d99f3cd6d85ac041e3676a4a79d7b0782df1d6e4e8cae68e613f9b05f8e2aac` |

## Método

O gerado de `0688deb` foi extraído do git e carregado com `toJSON()` do SDK; o publicado veio da instância. Comparação por nó (`parameters`, `type`, `typeVersion`, `onError`, retries etc.) com o publicado necessariamente ⊇ gerado, mais comparação das conexões.

## Resultado

Divergências brutas existem (o digest direto não bate), mas todas são normalização do n8n na instalação, nenhuma é comportamento:

- **Valores padrão acrescentados pelo n8n** em 17 nós: `language`, `mode`, `resource`, `returnAll`, `method`, `contentType`, `conditions[].condition`, `options` vazio, `version` de condições.
- **Valor vazio descartado**: `options.messageStatusUpdates: []` do trigger não existe no publicado (equivale ao padrão `{}`).
- **Credenciais**: o gerado leva `credentials: {}`; a instância resolve as credenciais reais.
- **Escape de regex**: em `Code: finalizar opt-out` o gerado tem `/[\u0300-\u036f]/g` e o publicado tem os caracteres combinantes literais (mesmo conjunto; 5658 contra 5668 caracteres só por isso). É o único texto de `jsCode` que difere, e só nesse trecho.
- **Conexões**: idênticas em 72 de 73 origens; `Postgres Chat Memory` tem os mesmos 6 destinos em ordem diferente.

Nenhum nó, parâmetro funcional, `jsCode` (fora o escape) ou aresta existe só de um lado. O publicado `e3e25681` equivale ao gerado de `0688deb`.
