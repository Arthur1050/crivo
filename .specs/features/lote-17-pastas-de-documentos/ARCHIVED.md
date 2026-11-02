# Arquivamento do L17

Fechamento local em 2026-11-02, com **PASS** do Verifier no 4º ciclo em [validation.md](validation.md).
Spec, design, contexto e o relatório vigente permanecem neste diretório.

Arquivo histórico: [../../archive/lote-17-pastas-de-documentos/](../../archive/lote-17-pastas-de-documentos/).

- [tasks.md](../../archive/lote-17-pastas-de-documentos/tasks.md): T1 a T38, com os registros de execução e das correções de cada ciclo.

As capturas reais das telas ficam em [capturas/](capturas/), junto do `validation.md` que as cita. O rascunho visual
(`rascunho/`) foi apagado: a grade virou `src/components/documents/folders-grid.tsx`, os dados de exemplo viraram
`src/components/documents/__tests__/folder-fixtures.ts` e `FOLDER_DEFS` no seed. Ele continua no histórico do Git.

**Ainda não está em produção:** `scripts/document-folders/schema.sql` e o merge em `main` dependem de autorização do usuário.

Política: [STATE.md § AD-029](../../STATE.md#ad-029). Índice: [INDEX.md](../INDEX.md).
