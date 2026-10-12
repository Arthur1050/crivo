# Arquivamento do L16b

Execução concluída em 2026-10-12 (T0 a T26 e fixes F1 a F3). A verificação final está **pendente**: o [validation.md](validation.md) tem a reverificação aprovada depois da F1, três verificações independentes seguintes reprovadas (as duas primeiras por prova parcial, fechada na F2 e na F3; a 4ª por VOG AC1 na página de imóvel indisponível e por três provas parciais ainda abertas), e a decisão do usuário sobre VOG AC1.
Spec e o relatório vigente permanecem neste diretório; o design é comum ao L16 e fica em
[../lote-16-vitrine-publica/design.md](../lote-16-vitrine-publica/design.md).

Arquivo histórico: [../../archive/lote-16b-vitrine-app/](../../archive/lote-16b-vitrine-app/).

- [tasks.md](../../archive/lote-16b-vitrine-app/tasks.md): T0 a T26 com os hashes de cada commit; as fixes F1 (`6b2d670`), F2 (`06a9175`) e F3 (`be4d776`) estão no `validation.md`.
- [EXECUTE-PROMPT.md](../../archive/lote-16b-vitrine-app/EXECUTE-PROMPT.md): instruções da execução (janelas A, B e C, ciclo por task, fechamento).

As capturas reais das telas (T16 a T25) ficam em [capturas/](capturas/), junto do `validation.md` que as cita.
O `GOAL-PROMPT.md` (metas de `/goal` por janela) era transitório e foi apagado no fechamento.

**Não ficou nada em produção:** a vitrine só roda contra a branch de teste. O projeto na Vercel, as variáveis e a
ativação são o L16c.

Política: [STATE.md § AD-029](../../STATE.md#ad-029). Índice: [INDEX.md](../INDEX.md).
