# Lote 17 — Pastas de documentos — Contexto de fechamento

**Spec:** [spec.md](spec.md). **Decisões de produto:** AD-051 (`.specs/STATE.md`).

As decisões do lote estão na AD-051 e nas Assumptions da spec. Este arquivo existe para o que ficou de fora, no formato em que o backlog dos lotes é mantido (`features/INDEX.md`).

## Deferred Ideas

- **Seleção múltipla de documentos e arrastar e soltar:** a action já aceita de 1 a 100 ids; falta a interface.
- **Subpastas:** fora por decisão do usuário (AD-051: um nível só).
- **Pasta no agente do WhatsApp:** contexto, `/api/v1/*`, `openapi.yaml` e `n8n/` não mudaram (AD-051).
- **Permissão por pasta; cor ou ícone por pasta:** fora do escopo; a matriz por papel continua sendo a única regra, e a cor é da categoria.
- **i18n da Astryx no CRM:** "Required" e "Optional" saem em inglês em todos os formulários, e o `Timestamp` usa o locale do navegador. Um catálogo pt-BR (`InternationalizationProvider`) tende a resolver os dois. "Pasta · Optional" é string nova deste lote, pedida por `design.md`, consistente com "Categoria · Optional".
- **Coluna Pasta com a pasta aberta:** redundante nessa tela e, em 1280 px, empurra "Tamanho" e o menu para uma rolagem dentro da tabela. Sugestão do Verifier: não passar `folderById` com a pasta aberta, em `src/components/documents/documents-browser.tsx`. Muda o que o AC pede, então espera o aval do usuário.

## Dívidas

- **`categoryId` de outro tenant:** `updateDocument` não verifica o tenant da categoria. É anterior ao lote; a pasta não repete o erro, porque a escrita lê a pasta com tenant e trava de chave.
- **Testes de reconciliação crescem com o banco:** `withGenerousCeiling` e a reconciliação atualizam linha a linha, então `src/server/__tests__/actions.test.ts` estoura 30 s quando a branch base de teste acumula documentos (5 timeouts com 147 ativos, dois deles em testes do L12). Depois de `seed.test.ts` passa. Detalhe em `validation.md`.
- **Diálogos de pasta sem `catch`:** com `finally` o botão destrava, mas uma exceção de rede não dá aviso. A spec não define o desfecho.
- **`before` lido fora da transação em `updateDocumentAction`:** numa edição concorrente, pode reconciliar uma vez a mais ou a menos, até a edição seguinte.
