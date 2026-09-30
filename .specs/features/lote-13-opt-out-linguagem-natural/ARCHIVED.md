# Arquivos arquivados deste lote

Movidos para `.specs/archive/lote-13-opt-out-linguagem-natural/` em 2026-09-30. Saíram da zona de
busca ativa porque são registros de execução já encerrada. As menções a `tasks.md` em
`validation.md` apontam para o arquivo movido.

- `tasks.md` — T1–T19 com a evidência de cada task, incluindo as quatro medições de falso positivo
  (T2/T12), a publicação do agente por operações (T13), o benchmark do teto de contexto (T16) e a
  correção do ciclo 1 do Verifier (T19)
- `EXECUTE-PROMPT.md`
- `medicao-opt-out-2026-09-29.json`, `-v2.json`, `-v3.json` — medições REPROVADAS (7, 5 e 2 falsos
  positivos), mantidas como histórico da calibração do prompt
- `medicao-opt-out-2026-09-29-v4.json` — medição APROVADA (84/84 explícitas, 0 falso positivo), a
  que destrava a publicação: `scripts/opt-out-measurement.ts` procura o relatório aprovado em
  `features/` e em `archive/` (decisão D4 em `design.md`)
- `benchmark-contexto-2026-09-30.json` — métricas do teto de contexto depois do classificador (só
  métricas, nenhum corpus). Substituída pela medição da D11
- `benchmark-contexto-2026-09-30-d11.json` — teto de contexto remedido depois da D11 (execuções
  2749–2763); é a vigente em produção
- `tasks.md` também traz a T20 (D11) e o fechamento da T18

Nada foi apagado: os relatórios contêm só frases do corpus versionado em
`n8n/fixtures/opt-out-corpus.json`, sem texto de lead real.

Política de fechamento: `../../STATE.md` § AD-029. Organização geral: `../INDEX.md`.
