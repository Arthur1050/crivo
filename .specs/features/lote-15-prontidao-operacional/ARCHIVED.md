# Arquivamento do L15

Fechamento local em 2026-10-07, com **PASS com ressalvas** do Verifier Opus em [validation.md](validation.md).
Spec, Design e o relatório vigente permanecem neste diretório.

Arquivo histórico: [../../archive/lote-15-prontidao-operacional/](../../archive/lote-15-prontidao-operacional/).

- [tasks.md](../../archive/lote-15-prontidao-operacional/tasks.md): T0 a T16, as duas fix tasks do Verifier (F1, F2) e os hashes de cada commit. **T14 está `Pending` ali de propósito** (ver abaixo).
- [EXECUTE-PROMPT.md](../../archive/lote-15-prontidao-operacional/EXECUTE-PROMPT.md): instruções da execução, com a divisão em janelas A, B e C e a tabela de ações externas.

**Pendente no fechamento (não bloqueia o arquivamento):**

- **T14**: ler o log `[manutencao] alerta` da primeira manutenção de produção com o alerta
  (`integrationAlertFailed: false`, `integrationAlertEvaluated` igual ao número de tenants, hoje 3).
- **F2** do gate: provar que o cron `/api/cron/expire-documents` executa em produção. O plano Hobby da
  Vercel guarda só 1 h de log, então a leitura precisa cair entre 03:00 e ~04:50 UTC.

As duas dependem da mesma leitura de logs. Foi agendada uma leitura de sessão para 2026-10-08 03:22 UTC;
se ela não ocorrer, é só repetir depois de uma execução do cron. Quando ocorrer, registrar o resultado em
`validation.md` § Gate e fechar a T14 no `tasks.md` arquivado.

Política: [STATE.md § AD-029](../../STATE.md#ad-029). Índice: [INDEX.md](../INDEX.md).
