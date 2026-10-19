# Arquivamento do L16c

Fechamento em 2026-10-19 (T0 a T18; a prova real T10 a T13 foi feita com a loja de demonstração `krivo-demo`, dados fictícios, a pedido do usuário; a loja piloto real segue sem vitrine), com a 2ª verificação independente em **PASS com ressalvas** (Opus 5.5, HEAD `1008ecf`) e a **3ª em FAIL** (HEAD `1c88662`, limite de 3 voltas atingido) em [validation.md](validation.md): o aviso de revalidação do CRM falha em produção (`TypeError`) e o registro tinha afirmado que estava provado. Os textos foram corrigidos por notas datadas; o defeito do aviso é de configuração do usuário e o do cache da vitrine é um fix no L16b. A 1ª verificação reprovou por estado externo (projeto `vitrine` sem variáveis e agendador do n8n despublicado).
Spec e o relatório vigente permanecem neste diretório; o design é comum ao L16 e fica em
[../lote-16-vitrine-publica/design.md](../lote-16-vitrine-publica/design.md).

Arquivo histórico: [../../archive/lote-16c-vitrine-ativacao/](../../archive/lote-16c-vitrine-ativacao/).

- [tasks.md](../../archive/lote-16c-vitrine-ativacao/tasks.md): T0 a T18, com a marcação de cada task e as notas de pendência de T10 a T13.
- [EXECUTE-PROMPT.md](../../archive/lote-16c-vitrine-ativacao/EXECUTE-PROMPT.md): instruções da execução (janelas A, B e C, regras de produção, fechamento).

O `validation.md` guarda, por task, a autorização do usuário, o comando, a saída sem segredo e o rollback de cada ação externa. As capturas da prova real (catálogo e item em desktop e 375 px, prévia do WhatsApp) estão em [capturas/](capturas/); o frescor F15 (≤ 2,9 s) e a prévia F17 estão medidos no `validation.md`. Foram feitas com a loja de demonstração, porque a ativação de uma loja exige CRECI e o usuário ainda não tem.

**Em produção:** schema da vitrine, views e papel `krivo_vitrine` (T1 a T5); CRM com o código do L16a e do L16b (T6); renomeação para Krivo (T15 a T18); projeto `vitrine` na Vercel, domínio público `vitrine-kappa-tawny.vercel.app` (T7); variáveis e redeploy do CRM (T8, T9). **Loja ativa:** só a de demonstração `krivo-demo` (dados fictícios; rollback no `validation.md`). A loja piloto real (`triangulo`) continua sem vitrine.

**Não apague `scratch/n8n-antes/`** (fora do git): o histórico de versões dos workflows do n8n foi podado e o rollback da T16 depende dos JSONs de lá.

Política: [STATE.md § AD-029](../../STATE.md#ad-029). Índice: [INDEX.md](../INDEX.md).
