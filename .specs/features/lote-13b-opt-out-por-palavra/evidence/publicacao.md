# T8 — Publicação do hotfix e arquivamento da medição

Executado em 2026-10-07 com autorização explícita do usuário no chat (publicar, arquivar, push do branch de hotfix).

| Item | Valor |
| --- | --- |
| Workflow | `0B1nqjODu7xuYYKF` (crivo-agente-principal) |
| Versão anterior (rollback) | `e3e25681-8cd1-4ea3-bc38-33d373cf6b80`, salva em `rollback-e3e25681.json` |
| Versão publicada | `ddb63ae8-f02f-4e6a-a1b6-3cb05d4b229b` |
| `versionId` = `activeVersionId` (L-032) | sim, lido depois da publicação |
| Nós | 65 (eram 73); um único `lmChatOpenAi` (`OpenAI Chat Model`), nenhum `textClassifier` |
| Fonte | branch `hotfix/opt-out-so-sair`, commit `fea3306`, sobre `0688deb`; branch enviado ao origin |
| `crivo-medicao-opt-out` (`n5iAMCl5nSM6jA6U`) | arquivado |

## Como foi aplicado

`update_workflow` por operações: `Code: gate` com o `jsCode` do gerado de `fea3306`, remoção dos 8 nós do classificador e do opt-out em linguagem natural, e a conexão `Code: memória pronta` → `Code: montar system message e marcar campo perguntado`. Depois `publish_workflow` do rascunho `ddb63ae8`.

## Conferência antes de publicar

O rascunho foi lido de volta e comparado com o gerado de `fea3306` (publicado ⊇ gerado, conexões com ordem normalizada): mesmos 65 nós, conexões iguais. Divergências de texto só em `jsCode` e todas de serialização do n8n: escape de regex em `Code: finalizar opt-out` e quebra de linha final removida em dois Code nodes; os três são idênticos aos da versão `e3e25681`. Os avisos de validação do n8n (`SUBNODE_NOT_CONNECTED` dos Memory Managers e `builtInTools` do modelo) já existiam na versão anterior.

Correção ao T1: aquela comparação listou só os 40 primeiros conflitos e escondeu as duas quebras de linha finais. A conclusão de equivalência não muda.

## Rollback

`restore_workflow_version` para `e3e25681`, ou recriar a partir de `rollback-e3e25681.json`.
