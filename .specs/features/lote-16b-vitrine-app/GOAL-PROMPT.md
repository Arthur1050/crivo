# GOAL-PROMPT — Lote 16b, uma meta por janela

> Arquivo transitório (camada 5 do `features/INDEX.md`): o fechamento do lote o apaga.

Como usar:

- Uma janela nova do Claude Code por meta, na raiz do projeto, em **Claude Sonnet 5.5, esforço `medium`**. Nunca `xhigh` nem `max`.
- Cole o bloco da janela inteiro, começando por `/goal`. As instruções completas estão no `EXECUTE-PROMPT.md` do lote; a meta só diz quando a janela terminou.
- A janela B só começa com a A concluída, e a C só com a B concluída.
- Cada meta trata um gatilho de parada como meta cumprida. Sem isso, a janela ficaria insistindo num ponto que só você resolve.
- As metas pedem a evidência **mostrada na conversa** (saída de comando), para a conclusão poder ser conferida pelo que está escrito, sem depender de afirmação.

---

## Janela A — T0 a T12

```
/goal Execute a janela A do lote 16b do Crivo seguindo `.specs/features/lote-16b-vitrine-app/EXECUTE-PROMPT.md` (leia-o inteiro antes de começar, ative a skill `tlc-spec-driven` e responda em português). A meta está cumprida quando, com a evidência mostrada na conversa: (1) T0 a T12 estão marcadas como concluídas em `tasks.md`, um commit por task, e `git log --oneline` aparece com esses commits, nenhum com `Co-Authored-By`, "Generated with" ou marca de atribuição; (2) a saída do gate de cada task aparece: testes da task verdes e build gate sem erro novo; (3) o resultado do gate da T0 (F8 a F13 e F19) está registrado no `validation.md` do lote; (4) o Handoff do `STATE.md` está atualizado e commitado; (5) `git status --short` aparece só com os 4 arquivos que o usuário já tinha modificados. A meta também está cumprida, e o trabalho deve parar, se ocorrer um gatilho de parada e ele tiver sido relatado ao usuário uma única vez, com a evidência: F8, F10 ou o segundo caminho da F13 falhando na T0; a mesma task falhando duas vezes no gate pelo mesmo motivo; qualquer mudança de escopo, de AC ou de decisão; qualquer ação que tocaria produção; bloqueio externo que só o usuário resolve. Nunca: push, ação em produção, começar a T13, enfraquecer, pular ou apagar teste, citar o arquivo de variáveis do ambiente local.
```

## Janela B — T13 a T21

```
/goal Execute a janela B do lote 16b do Crivo seguindo `.specs/features/lote-16b-vitrine-app/EXECUTE-PROMPT.md` (leia-o inteiro antes de começar, ative a skill `tlc-spec-driven`, responda em português e confira antes, pelo Handoff do `STATE.md` e pelo `git log`, que a T12 está commitada). A meta está cumprida quando, com a evidência mostrada na conversa: (1) T13 a T21 estão marcadas como concluídas em `tasks.md`, um commit por task, sem `Co-Authored-By`, "Generated with" ou marca de atribuição; (2) a última execução de `npm run vitrine:e2e` aparece verde, com as asserções de cada task de rota acrescentadas e nenhuma asserção anterior alterada; (3) o build gate da última task aparece sem erro novo; (4) as capturas reais das tasks de tela estão salvas e commitadas em `.specs/features/lote-16b-vitrine-app/capturas/`, feitas pela extensão do Chrome, as de 375 px no quadro de 375 px, com a largura de rolagem medida e registrada no `validation.md`; (5) o Handoff do `STATE.md` está atualizado e commitado e `git status --short` aparece só com os 4 arquivos que o usuário já tinha modificados. A meta também está cumprida, e o trabalho deve parar, se ocorrer um gatilho de parada e ele tiver sido relatado ao usuário uma única vez, com a evidência: a mesma task falhando duas vezes no gate pelo mesmo motivo; extensão do Chrome indisponível para uma captura exigida (sem captura, a UI não é alterada); qualquer mudança de escopo, de AC ou de decisão; qualquer ação que tocaria produção; bloqueio externo que só o usuário resolve. Nunca: push, ação em produção, começar a T22, rodar `vitrine:e2e` junto com outro teste, enfraquecer, pular ou apagar teste, citar o arquivo de variáveis do ambiente local.
```

## Janela C — T22 a T26 e fechamento

```
/goal Execute a janela C do lote 16b do Crivo, com o fechamento do lote, seguindo `.specs/features/lote-16b-vitrine-app/EXECUTE-PROMPT.md` (leia-o inteiro antes de começar, ative a skill `tlc-spec-driven`, responda em português e confira antes, pelo Handoff do `STATE.md` e pelo `git log`, que a T21 está commitada). A meta está cumprida quando, com a evidência mostrada na conversa: (1) T22 a T26 estão marcadas como concluídas em `tasks.md`, um commit por task, sem `Co-Authored-By`, "Generated with" ou marca de atribuição; (2) a Full aparece verde: `npm test` e depois `npm run vitrine:e2e`, nunca juntos; (3) um Verifier novo e independente, em Claude Opus 5.5, deu PASS, com o sensor em cópia isolada e os alvos mínimos do EXECUTE-PROMPT, e `validate_state.py` saiu com 0; (4) as lições candidatas do lote foram decididas por um agente Claude Opus 5.5 (AD-045) e o resultado está commitado, ou está registrado que não houve candidata; (5) `tasks.md` e `EXECUTE-PROMPT.md` estão arquivados (AD-029), `GOAL-PROMPT.md` apagado, e o Handoff do `STATE.md` atualizado mantendo a pendência do índice de categoria para o L16c; (6) `git status --short` aparece só com os 4 arquivos que o usuário já tinha modificados e o relatório final lista tasks e hashes, Full e e2e, veredito do Verifier, decisões de lições, capturas e pendências. A meta também está cumprida, e o trabalho deve parar, se ocorrer um gatilho de parada e ele tiver sido relatado ao usuário uma única vez, com a evidência: a mesma task falhando duas vezes no gate pelo mesmo motivo; Verifier ainda em FAIL depois de 3 rodadas de correção; falha da Full fora das instabilidades conhecidas listadas no EXECUTE-PROMPT; extensão do Chrome indisponível para uma captura exigida; qualquer mudança de escopo, de AC ou de decisão; qualquer ação que tocaria produção; bloqueio externo que só o usuário resolve. Nunca: push, ação em produção, começar o L16c, enfraquecer, pular ou apagar teste, citar o arquivo de variáveis do ambiente local.
```
