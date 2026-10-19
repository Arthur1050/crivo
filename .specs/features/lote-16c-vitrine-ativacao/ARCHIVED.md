# Arquivamento do L16c

Fechamento em 2026-10-19 (T0 a T18, com a prova real T10 a T13 **pendente**), com **PASS com ressalvas** da 2ª verificação independente (Opus 5.5, HEAD `1008ecf`) em [validation.md](validation.md). A 1ª verificação reprovou por estado externo (projeto `vitrine` sem variáveis e agendador do n8n despublicado) e foi fechada com as notas datadas do próprio `validation.md`.
Spec e o relatório vigente permanecem neste diretório; o design é comum ao L16 e fica em
[../lote-16-vitrine-publica/design.md](../lote-16-vitrine-publica/design.md).

Arquivo histórico: [../../archive/lote-16c-vitrine-ativacao/](../../archive/lote-16c-vitrine-ativacao/).

- [tasks.md](../../archive/lote-16c-vitrine-ativacao/tasks.md): T0 a T18, com a marcação de cada task e as notas de pendência de T10 a T13.
- [EXECUTE-PROMPT.md](../../archive/lote-16c-vitrine-ativacao/EXECUTE-PROMPT.md): instruções da execução (janelas A, B e C, regras de produção, fechamento).

O `validation.md` guarda, por task, a autorização do usuário, o comando, a saída sem segredo e o rollback de cada ação externa. Não há capturas neste lote: a prova real (capturas de catálogo e item, frescor F15, prévia do WhatsApp F17) depende de uma loja ativa, que exige CRECI.

**Em produção:** schema da vitrine, views e papel `krivo_vitrine` (T1 a T5); CRM com o código do L16a e do L16b (T6); renomeação para Krivo (T15 a T18); projeto `vitrine` na Vercel, domínio público `vitrine-kappa-tawny.vercel.app` (T7); variáveis e redeploy do CRM (T8, T9). **Não está em produção:** nenhuma loja ativa (`tenant_storefronts` vazia).

**Não apague `scratch/n8n-antes/`** (fora do git): o histórico de versões dos workflows do n8n foi podado e o rollback da T16 depende dos JSONs de lá.

Política: [STATE.md § AD-029](../../STATE.md#ad-029). Índice: [INDEX.md](../INDEX.md).
