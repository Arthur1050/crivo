# Lote 12 — Validação da Phase 2

**Data**: 2026-09-16  
**Escopo**: somente T7–T12 — Entrada, storage e extração. Este relatório não declara a feature inteira concluída.  
**Diff auditado**: `16e4685..d4fe4d8`  
**Verificador**: subagente independente (autor ≠ verificador)

---

## Veredito

**PASS ✅** — A correção `7647b13` fecha o desvio de T11: o preflight de DOCX agora lê contagem, tamanhos e limites a partir do central directory, que é a fonte autoritativa quando a entrada usa data descriptor. ZIP64 é rejeitado de modo conservador pelos valores-sentinela do EOCD, antes de qualquer extração.

## Conclusão das tarefas

| Task | Implementação | Resultado da validação |
| --- | --- | --- |
| T7 | ✅ | ✅ Adapter privado, stream e deleção idempotente verificados. |
| T8 | ✅ | ✅ Reserva autorizada, hash server-side e compensação verificados. |
| T9 | ✅ | ✅ Pathname opaco e callback assinado verificados. |
| T10 | ✅ | ✅ Decoder estrito e normalização mínima verificados. |
| T11 | ✅ | ✅ Central directory cobre data descriptors; ZIP64 é recusado com `limite_estrutural`. |
| T12 | ✅ | ✅ Envelope canônico, bytes e admissão foram verificados. |

## Checagem ancorada na especificação — escopo da Phase 2

| Resultado exigido | Evidência de implementação e asserção | Resultado |
| --- | --- | --- |
| Upload privado, limitado a chave/MIME/tamanho, sem URL persistível | `src/server/documents/vercel-blob-storage.ts:54-79`; `src/server/documents/__tests__/vercel-blob-storage.test.ts:51-73` verifica grant privado, TTL, MIME, tamanho e sem overwrite. | ✅ |
| Permissão antes de token/objeto; integridade calculada no servidor; falha compensa | `src/server/documents/uploads.ts:192-229,254-319`; `src/server/documents/__tests__/uploads.test.ts:147-171,273-342` verifica ausência de token para corretor, hash divergente, remoção e falha de insert. | ✅ |
| Callback não confia no pathname ou payload do navegador | `app/api/documents/upload/route.ts:109-173`; `src/server/documents/__tests__/upload-route.test.ts:102-107,152-165` verifica chave reservada e negativa de permissão/callback inválido. | ✅ |
| Texto textual preserva Unicode, quebra interna e rejeita binário/invisível | `src/server/documents/text.ts:12-45`; `src/server/documents/__tests__/text.test.ts:10-75`. | ✅ |
| PDF/DOCX/TXT/Markdown/CSV respeitam limites estruturais; DOCX acima de 50 MiB é recusado | `src/server/documents/extraction.ts:45-71` localiza o EOCD e soma os tamanhos não compactados do central directory. `src/server/documents/__tests__/extraction.test.ts:64-72` cobre data descriptor cujo header local contém tamanho zero. | ✅ |
| Contexto mede exatamente o JSON retornável; não trunca e admite somente corpus que cabe | `src/server/documents/context-budget.ts:37-96`; `src/server/documents/__tests__/context-budget.test.ts:8-27`. | ✅ |

## Correção verificada

`7647b13` substituiu a leitura sequencial de local file headers por uma varredura limitada do EOCD e do central directory. O preflight agora:

- rejeita EOCD ausente, diretório truncado, entradas acima de 2.000 e offsets incoerentes;
- soma o `uncompressedSize` de cada cabeçalho central — inclusive quando o bit 3 deixa o header local com tamanho zero;
- trata os sentinelas ZIP64 do EOCD (`0xffff`) como estrutura fora do formato aceito, retornando `limite_estrutural` antes de chamar `mammoth`.

Verificação independente após a correção:

| Checagem | Resultado |
| --- | --- |
| `npx vitest run src/server/documents/__tests__/extraction.test.ts` | ✅ 1 arquivo, 21 testes. |
| ZIP com data descriptor exatamente em 50 MiB, extractor simulado | ✅ aceito. |
| ZIP com data descriptor em 50 MiB + 1 byte, extractor simulado | ✅ recusado como `limite_estrutural`. |
| ZIP64 com contadores-sentinela no EOCD, extractor simulado | ✅ recusado como `limite_estrutural`. |

## Gate de build

| Comando | Resultado |
| --- | --- |
| `npm test` | ✅ 99 arquivos, 1.491 testes aprovados, 0 falhas, 717,16 s. |
| `npm run lint` | ✅ código zero; 5 warnings preexistentes fora do diff da Phase 2. |
| `npm run build` | ✅ aprovado. Better Auth emitiu warnings de secret/base URL de ambiente durante static generation, sem falha de build. |

Não houve remoção de testes: a baseline da Phase 1 era 1.373 testes; a suíte atual tem 1.491 (+118).

## Correção de integração do seed

`d4fe4d8` ajusta o seed para remover `document_upload_intents` antes de `documents`, respeitando a nova FK introduzida pela entrada idempotente. O teste isolado de seed passou com 30 testes, e a suíte final passou em série sem concorrência com outros processos que usam o mesmo banco de teste.

## Sensor de discriminação

Sensor executado em worktree temporário `C:\Users\user\AppData\Local\Temp\crivo-phase2-sensor-20260916`, removido ao final. O `git status --porcelain` da árvore real estava vazio antes e depois.

| Mutação | Arquivo | Resultado |
| --- | --- | --- |
| Aceitar hash diferente do intent | `src/server/documents/uploads.ts:289` | ✅ Morta por 9 falhas em `uploads.test.ts`, incluindo upload válido e hash divergente. |
| Repassar pathname controlado pelo navegador | `app/api/documents/upload/route.ts:136` | ✅ Morta por 3 falhas em `upload-route.test.ts`. |
| Rejeitar imagem PDF exatamente em 16 MP | `src/server/documents/extraction.ts:117` | ✅ Morta por `accepts image at 16 MP`. |
| Quebrar compatibilidade de modalidade | `src/server/documents/context-budget.ts:31` | ✅ Morta por 3 falhas em `context-budget.test.ts`. |

O teste direcionado do sensor terminou com 16 falhas esperadas para os quatro mutantes, comprovando que essas asserções discriminam comportamentos errados. A mutação inicial na checagem binária foi descartada por ser equivalente: a segunda validação pós-decode ainda recusa os mesmos controles; ela não foi usada como evidência de cobertura.

## Qualidade

| Checagem | Estado |
| --- | --- |
| Mudanças cirúrgicas e sem escopo alheio | ✅ |
| Contratos de storage sem URLs/tokens em retornos de domínio | ✅ |
| Autorização e integridade cobertas por testes de rota/domínio | ✅ |
| Limites estruturais de DOCX cobrem data descriptors e rejeitam ZIP64 sem ambiguidade | ✅ |
| Diretrizes documentadas seguidas | ✅ `AGENTS.md` e `tlc-spec-driven`. |

## Próximo passo

O gap P1 foi fechado. Após a correção do seed, os gates finais foram executados em série: `npm test` passou com 99 arquivos e 1.491 testes em 717,16 s; lint e build também passaram. A correção adicional foi exercitada pelo teste direcionado e pelas três entradas adversariais registradas neste relatório.
