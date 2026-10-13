# Arquivamento do L16b

Fechamento local em 2026-10-13 (T0 a T26 e fixes F1 a F4), com **PASS** da 5ª verificação independente (Opus 5.5, HEAD `dff1775`) em [validation.md](validation.md). As verificações 2 a 4 reprovaram por prova parcial e pela VOG AC1 (decidida pelo usuário, opção a) e foram fechadas nas rodadas F2 a F4.
Spec e o relatório vigente permanecem neste diretório; o design é comum ao L16 e fica em
[../lote-16-vitrine-publica/design.md](../lote-16-vitrine-publica/design.md).

Arquivo histórico: [../../archive/lote-16b-vitrine-app/](../../archive/lote-16b-vitrine-app/).

- [tasks.md](../../archive/lote-16b-vitrine-app/tasks.md): T0 a T26 com os hashes de cada commit; as fixes F1 (`6b2d670`), F2 (`06a9175`), F3 (`be4d776`) e F4 (`dff1775`) estão no `validation.md`.
- [EXECUTE-PROMPT.md](../../archive/lote-16b-vitrine-app/EXECUTE-PROMPT.md): instruções da execução (janelas A, B e C, ciclo por task, fechamento).

As capturas reais das telas (T16 a T25) ficam em [capturas/](capturas/), junto do `validation.md` que as cita.
O `GOAL-PROMPT.md` (metas de `/goal` por janela) era transitório e foi apagado no fechamento.

**Não ficou nada em produção:** a vitrine só roda contra a branch de teste. O projeto na Vercel, as variáveis e a
ativação são o L16c.

Política: [STATE.md § AD-029](../../STATE.md#ad-029). Índice: [INDEX.md](../INDEX.md).
