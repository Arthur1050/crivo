# Arquivamento do L16c

Fechamento em 2026-10-19 (T0 a T18). A prova real (T10 a T13) foi feita com a loja de demonstração `krivo-demo` (dados fictícios, a pedido do usuário); a loja piloto real segue sem vitrine por falta de CRECI. **Veredito: PASS na 6ª verificação independente** (Opus 5.5, `a96609c`) em [validation.md](validation.md). Histórico: a 1ª reprovou por estado externo (projeto `vitrine` sem variáveis e agendador do n8n despublicado); a 2ª deu PASS com ressalvas (`1008ecf`); a 3ª reprovou (`1c88662`) porque o aviso de revalidação do CRM falhava em produção (`TypeError`) e o registro tinha afirmado o contrário; o usuário aceitou o aviso (R14) e o cache da vitrine (R15) como ressalvas e as duas foram resolvidas no mesmo dia (R14: a `VITRINE_PUBLIC_URL` do CRM estava sem `https://`; R15: `use cache: remote`, AD-048); a 4ª e a 5ª deram PASS com ressalvas e a 6ª, PASS.
Spec e o relatório vigente permanecem neste diretório; o design é comum ao L16 e fica em
[../lote-16-vitrine-publica/design.md](../lote-16-vitrine-publica/design.md).

Arquivo histórico: [../../archive/lote-16c-vitrine-ativacao/](../../archive/lote-16c-vitrine-ativacao/).

- [tasks.md](../../archive/lote-16c-vitrine-ativacao/tasks.md): T0 a T18, com a marcação de cada task e as notas de pendência de T10 a T13.
- [EXECUTE-PROMPT.md](../../archive/lote-16c-vitrine-ativacao/EXECUTE-PROMPT.md): instruções da execução (janelas A, B e C, regras de produção, fechamento).

O `validation.md` guarda, por task, a autorização do usuário, o comando, a saída sem segredo e o rollback de cada ação externa. As capturas da prova real (catálogo e item em desktop e 375 px, prévia do WhatsApp) estão em [capturas/](capturas/); o frescor F15 (≤ 2,9 s) e a prévia F17 estão medidos no `validation.md`. Foram feitas com a loja de demonstração, porque a ativação de uma loja exige CRECI e o usuário ainda não tem.

**Em produção:** schema da vitrine, views e papel `krivo_vitrine` (T1 a T5); CRM com o código do L16a e do L16b (T6); renomeação para Krivo (T15 a T18); projeto `vitrine` na Vercel, domínio público `vitrine-kappa-tawny.vercel.app` (T7); variáveis e redeploy do CRM (T8, T9). **Loja ativa:** só a de demonstração `krivo-demo` (dados fictícios; rollback no `validation.md`). A loja piloto real (`triangulo`) continua sem vitrine.

**Depois do fechamento (2026-10-19, tudo no `validation.md`):** R15 corrigida com `use cache: remote` (AD-048); aviso de revalidação do CRM endurecido (AD-049); `ignoreCommand` por `vercel.json` na vitrine e no CRM; `VITRINE_DATABASE_URL` removida do projeto do CRM. O estado vigente e as pendências estão no Handoff do `STATE.md` e na linha do L16c do `INDEX.md`.

**Não apague `scratch/n8n-antes/`** (fora do git): o histórico de versões dos workflows do n8n foi podado e o rollback da T16 depende dos JSONs de lá.

Política: [STATE.md § AD-029](../../STATE.md#ad-029). Índice: [INDEX.md](../INDEX.md).
