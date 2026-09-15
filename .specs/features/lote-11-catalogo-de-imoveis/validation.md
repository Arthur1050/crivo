# Catálogo de imóveis — Validation

## Validation: PASS ✅

**Date**: 2026-09-14
**Spec**: `.specs/features/lote-11-catalogo-de-imoveis/spec.md`
**Diff range**: `d47434eb2a0d11fee8683a484e8c6a7adf9d2d36..d8c135487aaf3f8293feb7fcf953c474de2bec16`
**Verifier**: independent sub-agent (author != verifier)

O lote implementa os 78 critérios da especificação. A prova combina asserções automatizadas, build, inspeção estrutural, publicação conferida e UAT real do WhatsApp. Não há lacuna de precisão nem mutante sobrevivente.

## Task Completion

| Tasks | Status | Notes |
| --- | --- | --- |
| T1–T28 | ✅ Done | Implementação, publicação e provas reais commitadas. |
| T29 | ⏳ Closure | Este relatório satisfaz o gate do Verifier; atualização final de índices, rastreabilidade e memória continua com o orquestrador. |
| T30–T36 | ✅ Done | Correções conversacionais, publicações e recibos commitados. |

## Spec-Anchored Acceptance Criteria

### P1 — Cadastro de imóveis no CRM

| AC | Spec-defined outcome | `file:line` + assertion/evidence | Result |
| --- | --- | --- | --- |
| CAD-1 | Toda leitura/escrita usa o tenant ativo; FK de tenant obrigatória. | `src/server/__tests__/properties-actions.test.ts:160` — `expect(row.tenantId).toBe(tenantId)`; `src/server/data/__tests__/properties.test.ts:185` — resultados A/B não contêm o id do outro tenant. | ✅ PASS |
| CAD-2 | A linha contém todos os campos enumerados e timestamps. | `src/db/schema.ts:634`–`src/db/schema.ts:683` define as colunas tipadas e `notNull`; `src/server/__tests__/properties-actions.test.ts:156`–`src/server/__tests__/properties-actions.test.ts:162` confirma criação persistida. O build TypeScript passou. | ✅ PASS |
| CAD-3 | Captador é FK obrigatória para `users.id`. | `src/db/schema.ts:644`–`src/db/schema.ts:648`; `src/server/__tests__/properties-actions.test.ts:161` — `expect(row.capturedByUserId).toBe(capturerId)`. | ✅ PASS |
| CAD-4 | Captador externo/inativo é recusado sem escrita. | `src/server/__tests__/properties-actions.test.ts:175` e `:183`; `:198` e `:206` — resultado falso e zero linhas. A mutação M5 foi morta por esses casos. | ✅ PASS |
| CAD-5 | Criação atribui referência legível única no tenant. | `src/server/data/__tests__/properties.test.ts:334`–`:335` — `sequence === 1` e `reference === "IM-0001"`; `:351`–`:352` repete a sequência por tenant. | ✅ PASS |
| CAD-6 | Referência permanece imutável. | `src/server/data/__tests__/properties.test.ts:474`–`:480` usa `@ts-expect-error` para impedir `sequence`/`reference` no patch; o build confirma a restrição de tipo. | ✅ PASS |
| CAD-7 | Colisão concorrente é rejeitada pelo índice sem linha parcial. | `src/server/data/__tests__/properties.test.ts:373`–`:406` — `await expect(insert).rejects` e `expect(rows).toHaveLength(1)`. | ✅ PASS |
| CAD-8 | Edição grava e avança `updatedAt`. | `src/server/data/__tests__/properties.test.ts:441`–`:447` — área vira 120 e timestamp fica maior. | ✅ PASS |
| CAD-9 | Exclusão remove a linha sem órfãos. | `src/server/__tests__/properties-actions.test.ts:356`–`:360` — sucesso, id ausente e revalidação; o schema não cria tabela dependente de imóvel. | ✅ PASS |
| CAD-10 | Catálogo usa enum própria. | `src/db/schema.ts:35` e `src/server/__tests__/validation.test.ts:467`–`:468` — cada `PropertyKind` é aceito. | ✅ PASS |
| CAD-11 | `propertyTypeEnum` permanece inalterada. | `src/db/schema.ts:24`–`:27`; inspeção do diff desde `d47434e` confirmou que o bloco antigo não mudou. Os consumidores de qualificação passaram no gate completo. | ✅ PASS |

### P1 — Permissão e navegação

| AC | Spec-defined outcome | `file:line` + assertion/evidence | Result |
| --- | --- | --- | --- |
| PERM-1 | Administrador/gestor leem e escrevem; corretor só lê. | `src/lib/permissions.ts:56`, `:65`, `:78`; `src/lib/__tests__/permissions.test.ts:54` — `expect(can(...)).toBe(expected)` para cada papel/recurso/ação. | ✅ PASS |
| PERM-2 | Corretor vê inventário inteiro sem criar/editar/excluir. | `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:52` e `:53` registram UAT final com ações somente para o gestor; `src/components/properties/properties-table.tsx:176` só adiciona ações quando `canWrite`. | ✅ PASS |
| PERM-3 | Escrita direta de corretor é recusada no servidor. | `src/server/__tests__/properties-actions.test.ts:448`–`:452`, `:469`–`:473`, `:487`–`:491`, `:510`–`:514`, `:533`–`:537` validam as cinco operações e preservam estado. | ✅ PASS |
| PERM-4 | Sem leitura, menu não aparece. | `src/components/shell/sidebar.tsx:159` — filtro `can(roles, resource, "ler")`; a decisão pura é coberta em `src/lib/__tests__/permissions.test.ts:54`. Build da navegação passou. | ✅ PASS |
| PERM-5 | A decisão de permissão é função pura compartilhada. | `src/lib/permissions.ts:89`; consumidores em `src/components/shell/sidebar.tsx:159` e `app/(crm)/imoveis/page.tsx:72`; matriz exaustiva em `src/lib/__tests__/permissions.test.ts:48`–`:60`. | ✅ PASS |
| PERM-6 | Corretor não recebe escopo por captador. | `app/(crm)/imoveis/page.tsx:84` busca apenas por tenant; `src/server/data/__tests__/properties.test.ts:103` exige que todas as linhas sejam do tenant sem filtro por usuário; UAT em `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:53` confirma a visão do corretor. | ✅ PASS |

### P1 — Publicação, status e fotos

| AC | Spec-defined outcome | `file:line` + assertion/evidence | Result |
| --- | --- | --- | --- |
| PUB-1 | Status tem três valores e publicação é booleano independente. | `src/db/schema.ts:48`, `:657`–`:658`; `src/server/__tests__/validation.test.ts:485`–`:486` aceita cada status. | ✅ PASS |
| PUB-2 | Status/publicação mudam livremente. | `src/server/__tests__/properties-actions.test.ts:389`–`:394` mantém `vendido` ao publicar; `:413`–`:417` altera status diretamente. | ✅ PASS |
| PUB-3 | Visibilidade externa é exclusivamente `disponivel AND publicado`. | `src/server/integration/__tests__/properties.test.ts:84`, `:91`, `:98`, `:105` cobrem as quatro combinações relevantes. M1 trocou `AND` por `OR` e foi morto por três asserções. | ✅ PASS |
| PUB-4 | Fotos são lista ordenada de URLs. | `src/db/schema.ts:676` usa array de texto; `src/server/__tests__/validation.test.ts:447`–`:452` preserva uma lista válida na fronteira de 12. | ✅ PASS |
| PUB-5 | Nenhum byte de imagem é persistido. | `src/db/schema.ts:676` contém somente `text(...).array()`; a inspeção do schema e o build confirmam ausência de coluna binária. | ✅ PASS |
| PUB-6 | URL sem HTTP(S) é recusada indicando o campo. | `src/server/__tests__/validation.test.ts:442`–`:445` — resultado falso para `www.exemplo.com/foto.jpg` e erro de fotos. | ✅ PASS |
| PUB-7 | Máximo de 12 fotos. | `src/server/__tests__/validation.test.ts:447`–`:461` aceita 12 e recusa 13. | ✅ PASS |

### P1 — Validação de entrada

| AC | Spec-defined outcome | `file:line` + assertion/evidence | Result |
| --- | --- | --- | --- |
| VAL-1 | Preço deve ser inteiro positivo e erro nomeia preço. | `src/server/__tests__/validation.test.ts:354`–`:371` recusa zero, negativo e fracionário; `:357` exige `"Preço"`. | ✅ PASS |
| VAL-2 | Área deve ser inteiro positivo e erro nomeia área. | `src/server/__tests__/validation.test.ts:389`–`:406`; `:392` exige `"Área"`. | ✅ PASS |
| VAL-3 | Quartos/banheiros/vagas devem ser inteiros não negativos. | `src/server/__tests__/validation.test.ts:415`–`:433` recusa -1 e 2,5, aceita zero e valida rótulos. | ✅ PASS |
| VAL-4 | Texto/enums presentes e vazios são recusados indicando o campo. | `src/server/__tests__/validation.test.ts:37`, `:118`, `:477`, `:495`, `:531` cobrem nome, modalidade, tipo, status e UF vazios; actions aplicam a mesma função para bairro/cidade. | ✅ PASS |
| VAL-5 | Obrigatório ausente em criação é recusado, sem semântica de patch. | `src/server/__tests__/properties-actions.test.ts:218`/`:221`, `:233`/`:236`, `:248`/`:251`, `:262`/`:265`. M6 tratou `kind` ausente como default e foi morto em `:218`. | ✅ PASS |
| VAL-6 | Descrição tem no máximo 4000 caracteres. | `src/server/__tests__/validation.test.ts:514`–`:522` aceita o limite e recusa limite + 1. | ✅ PASS |
| VAL-7 | Qualquer validação falha sem escrita parcial. | `src/server/__tests__/properties-actions.test.ts:175`–`:183`, `:218`–`:221`, `:233`–`:236`, `:248`–`:251`, `:262`–`:265` conferem erro e banco vazio. | ✅ PASS |

### P1 — Rota do contrato de integração

| AC | Spec-defined outcome | `file:line` + assertion/evidence | Result |
| --- | --- | --- | --- |
| ROTA-1 | Tenant autenticado recebe somente imóveis visíveis próprios. | `src/server/integration/__tests__/routes/properties-get.test.ts:158`–`:163` valida 200 e item; `:238`–`:241` exige conjuntos disjuntos; corte em `src/server/integration/__tests__/properties.test.ts:84`–`:105`. | ✅ PASS |
| ROTA-2 | Sete filtros opcionais combinam por conjunção. | `src/server/integration/__tests__/property-filters.test.ts:143`–`:161` compara todos os campos; `src/server/integration/__tests__/properties.test.ts:243`–`:271` exige somente o match integral. | ✅ PASS |
| ROTA-3 | Sem filtros usa mesmo corte, ordem e limite. | `src/server/integration/__tests__/property-filters.test.ts:14`–`:16` devolve `{ filters: {} }`; `src/server/integration/__tests__/routes/properties-get.test.ts:153`–`:163` cobre o happy path vazio de filtros. | ✅ PASS |
| ROTA-4 | Máximo 3, `updatedAt DESC`, `id ASC`. | `src/server/integration/__tests__/properties.test.ts:163`–`:177`, `:196`–`:222`. M2 e M3 foram mortos pelas asserções de limite e ordem. | ✅ PASS |
| ROTA-5 | `total` conta todos os matches, mesmo além da página. | `src/server/integration/__tests__/properties.test.ts:176`–`:177` exige total 4/lista 3. M7 substituiu total por `rows.length` e foi morto em `:176`. | ✅ PASS |
| ROTA-6 | DTO contém exclusivamente os onze campos permitidos e preço pt-BR. | `src/server/integration/__tests__/properties.test.ts:324`–`:335` exige preço formatado; `src/server/integration/properties.ts:13`–`:34` declara o DTO fechado. | ✅ PASS |
| ROTA-7 | DTO não contém endereço, descrição ou fotos. | `src/server/integration/__tests__/properties.test.ts:281`, `:287`, `:293`, `:299`, `:306`–`:308` tem uma asserção por campo proibido. M4 reintroduziu `street` e foi morto em `:281`. | ✅ PASS |
| ROTA-8 | DTO não contém nenhum dado do captador. | `src/server/integration/__tests__/properties.test.ts:316`–`:320` verifica id, rótulo, nome, telefone e e-mail separadamente. M4 também foi morto em `:316`. | ✅ PASS |
| ROTA-9 | Filtro inválido gera 400 `application/problem+json`, `payload-invalido`. | `src/server/integration/__tests__/routes/properties-get.test.ts:184`–`:187` exige os três valores. | ✅ PASS |
| ROTA-10 | Chave/tenant inválidos seguem SEC-01, sem default. | `src/server/integration/__tests__/routes/properties-get.test.ts:207`, `:212`–`:214`, `:219`–`:221` exige 401 e `tenant-nao-identificado`. | ✅ PASS |
| ROTA-11 | Método não GET gera 405 problem+json. | `src/server/integration/__tests__/routes/properties-get.test.ts:244`–`:250` itera POST/PUT/PATCH/DELETE e exige status, content type e código. | ✅ PASS |
| ROTA-12 | Toda resposta >=400 é registrada no wrapper instrumentado. | `src/server/integration/__tests__/routes/properties-get.test.ts:182`–`:195` exige linha `integration_refusals` com status 400/code; o gate de instrumentação também passou. | ✅ PASS |

### P1 — Tool `buscar_imoveis`

| AC | Spec-defined outcome | `file:line` + assertion/evidence | Result |
| --- | --- | --- | --- |
| BUSCA-1 | Tool HTTP v4.5 nomeada e ligada a GET `/properties`. | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:44`–`:50` exige tipo, versão, método e URL. | ✅ PASS |
| BUSCA-2 | Header tenant vem do fluxo. | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:83` — igualdade exata com expressão do `Code: gate`. | ✅ PASS |
| BUSCA-3 | Modelo não escolhe tenant. | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:84` — `not.toContain("$fromAI")` no header. | ✅ PASS |
| BUSCA-4 | Cada critério é parâmetro próprio vindo de `$fromAI`. | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:66`–`:74` itera os sete nomes e compara o conjunto exato. | ✅ PASS |
| BUSCA-5 | Erro chega ao agente, não aborta, e o lead recebe resposta. | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:91` exige `neverError === true`; execução real registrada em `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:140`–`:146` terminou `success` e chamou `responder_lead` após 404. | ✅ PASS |
| BUSCA-6 | Vazio é declarado sem citar imóvel. | `n8n/src/__tests__/system-message.test.ts:130`–`:131` exige as duas cláusulas; UAT em `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:978`–`:980` confirma resultado real vazio e fala sem imóvel. | ✅ PASS |
| BUSCA-7 | Agente cita só payload e não promete endereço/captador. | `n8n/src/__tests__/system-message.test.ts:136`–`:137`; DTO proibido é coberto em `src/server/integration/__tests__/properties.test.ts:281`–`:320`. | ✅ PASS |
| BUSCA-8 | Fronteira não diz “não busca” nem “não informa preços”. | `n8n/src/__tests__/system-message.test.ts:65`–`:66` usa duas asserções negativas. M8 reintroduziu a primeira frase e foi morto em `:65`. | ✅ PASS |
| BUSCA-9 | Proibição de fotos permanece. | `n8n/src/__tests__/system-message.test.ts:71` — `expect(message).toContain("NÃO manda fotos")`. | ✅ PASS |
| BUSCA-10 | `gate.mjs` e `phase.mjs` não mudam funcionalmente. | `git diff d47434e..d8c1354 -- n8n/src/gate.mjs n8n/src/phase.mjs` produziu zero linhas; suítes completas de gate/fase passaram. | ✅ PASS |
| BUSCA-11 | Cinco tools antigas permanecem; grafo reflete uma nova tool. | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:127`–`:137` exige as seis tools; `n8n/workflows/__tests__/principal-modelo.test.ts:135`–`:136` exige 62 nós/76 conexões. | ✅ PASS |
| BUSCA-12 | Publicação confere hash antes da ativação. | `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:97`–`:110` registra comparação inicial byte a byte; `:952`–`:963` registra um único caminho alterado, hash e versão ativa idêntica ao draft. | ✅ PASS |
| BUSCA-13 | Dúvida/indecisão permite convite sem escolha e recusa é respeitada. | `n8n/src/__tests__/system-message.test.ts:741`–`:749` tem asserções separadas para dúvida, demora, convite, recusa e busca vazia. | ✅ PASS |
| BUSCA-14 | Critério novo dispara busca; pedido/aceite não espera buscas repetidas. | `n8n/src/__tests__/system-message.test.ts:94`, `:107`, `:754`–`:755` exige cada parte. | ✅ PASS |
| BUSCA-15 | Cortesia é respondida e saudação isolada não coleta. | `n8n/src/__tests__/system-message.test.ts:722`–`:730` e `:735`–`:736`; UAT final em `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:817` registra resposta a “como vai”. | ✅ PASS |
| BUSCA-16 | Toda opção citada tem referência e preço reais. | `n8n/src/__tests__/system-message.test.ts:760`; UAT/SQL em `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:830`–`:832` confirma IM-0001 e R$ 380.000,00. | ✅ PASS |
| BUSCA-17 | Falha técnica não confirma, não inventa ocupação/promessa nem pede outro horário. | `n8n/src/__tests__/system-message.test.ts:777`–`:791` contém asserção própria para cada proibição e próximo passo. | ✅ PASS |
| BUSCA-18 | Proposta espera aceite; interesse/dúvida/agradecimento não agenda. | `n8n/src/__tests__/system-message.test.ts:765`–`:772` exige não aceite, encerramento e horário aceito nas duas fases. | ✅ PASS |
| BUSCA-19 | Vazio com bairro flexível gera uma expansão automática, preservando critérios e estado. | `n8n/src/__tests__/system-message.test.ts:799`–`:808` separa iniciativa, uma busca, critérios preservados, bairro obrigatório e não alteração do CRM. | ✅ PASS |
| BUSCA-20 | Segundo vazio, ou expansão inaplicável, convida no mesmo turno sem refinar/repetir. | `n8n/src/__tests__/system-message.test.ts:811`–`:821` exige as quatro cláusulas. | ✅ PASS |
| BUSCA-21 | Argumentos omitem desconhecidos, usam cidade/bairro válidos e não fingem geografia. | `n8n/src/__tests__/system-message.test.ts:824`–`:832`; descrição/7 argumentos cobertos em `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:99`–`:119`. | ✅ PASS |
| BUSCA-22 | Cidade não é inferida; expansão explica localização real sem alegar proximidade. | `n8n/src/__tests__/system-message.test.ts:835`–`:841` exige cada restrição. | ✅ PASS |
| BUSCA-23 | Falha técnica é distinta de vazio. | `n8n/src/__tests__/system-message.test.ts:844` e `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:122` cobrem prompt e descrição da tool. | ✅ PASS |
| BUSCA-24 | Imóvel usa linhas e ordem prescrita; pergunta separada; máximo 3; sem emoji/markdown. | `n8n/src/__tests__/system-message.test.ts:847`–`:858` possui asserção para formato, ordem, campos reais, separação e limites. | ✅ PASS |
| BUSCA-25 | Após pergunta entregue com `ok=true`, turno encerra; `ok=false` permite corrigir; complementares anteriores continuam. | `n8n/src/__tests__/system-message.test.ts:866`, `:870`, `:874`, `:878`, `:882`–`:883`, repetido para `qualificando` e `agendando`. M9 removeu o encerramento e foi morto por dois casos em `:866`. | ✅ PASS |

### P2 — Prova conversacional

| AC | Spec-defined outcome | `file:line` + assertion/evidence | Result |
| --- | --- | --- | --- |
| PROVA-1 | Roteiro versiona cenário por intenção, sem fala literal. | `n8n/smoke/roteiro.md:200`–`:223` descreve intenções e resultados observáveis. | ✅ PASS |
| PROVA-2 | Checklist limpa n8n e depois CRM, com confirmação. | `n8n/smoke/roteiro.md:297`–`:303` fixa a ordem; `:329` exige confirmação pela primeira execução; execução real está em `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:996`–`:1001`. | ✅ PASS |
| PROVA-3 | Conversa real cita imóvel do tenant com referência/preço iguais ao banco. | `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:978` e `:830`–`:832` cruzam execução 2327, IM-0001, R$ 380.000,00 e SQL read-only. | ✅ PASS |
| PROVA-4 | Critério sem match declara ausência e não cita imóvel. | `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:979`–`:980` registra execução 2335, `total=0` e fala sem imóvel. | ✅ PASS |
| PROVA-5 | Rodada registra ids n8n e captura da conversa. | `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:808`–`:822` registra os seis ids; `:863`–`:867` registra captura, hash e limite visual do artefato. | ✅ PASS |
| PROVA-6 | Aprovação usa desfecho; estilo fica separado. | `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:971`–`:980` registra PASS por desfecho e aprovação explícita do usuário; observação de repetição permanece separada em `:801`–`:806`. | ✅ PASS |
| PROVA-7 | Regressão termina `qualificado_agendado` com responsável. | `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:994`–`:1013` registra execução 2407, PATCH 200, status, `assigned_user_id`, evento e aceite do usuário. | ✅ PASS |

### P3 — Seed

| AC | Spec-defined outcome | `file:line` + assertion/evidence | Result |
| --- | --- | --- | --- |
| SEED-1 | Cada tenant recebe imóveis com captador membro ativo. | `src/db/__tests__/seed.test.ts:655`–`:693` itera todos os tenants e exige `activeMemberUserIds.has(capturedByUserId) === true`. | ✅ PASS |
| SEED-2 | Seed cobre as combinações necessárias de status/publicação. | `src/db/__tests__/seed.test.ts:666`–`:675` exige ao menos disponível/publicado e disponível/não publicado; o mesmo teste verifica reservado e vendido na continuação do bloco. | ✅ PASS |
| SEED-3 | Duas execuções limpas produzem o mesmo conjunto. | `src/db/__tests__/seed.test.ts:702`–`:731` compara quantidade e, por id, referência, preço e captador idênticos. | ✅ PASS |

**Status**: 78/78 critérios têm resultado definido e evidência. Zero spec-precision gaps.

## Edge Cases

| Edge case | Evidence | Result |
| --- | --- | --- |
| `precoMin > precoMax` | `src/server/integration/__tests__/property-filters.test.ts:86`–`:91`; rota em `routes/properties-get.test.ts:198`–`:202`. | ✅ |
| Preço não inteiro positivo em reais | `src/server/integration/__tests__/property-filters.test.ts:100`–`:122` exige recusa. | ✅ |
| Quartos mínimo zero/negativo | `src/server/integration/__tests__/property-filters.test.ts:132`–`:139` exige recusa. | ✅ |
| Bairro ignora caixa/acento | `src/server/integration/__tests__/properties.test.ts:230`–`:240`. | ✅ |
| Tenant sem imóvel devolve `[]`, total 0 | `src/server/integration/__tests__/properties.test.ts:137`–`:148`. | ✅ |
| Tela distingue catálogo vazio de filtro vazio | `app/(crm)/imoveis/page.tsx:63`–`:85`; build passou conforme matriz da camada React. | ✅ |
| Captador desativado não invalida leitura | `src/server/integration/__tests__/properties.test.ts:108`–`:125`. | ✅ |
| Usuário captador não pode ser excluído | `src/server/__tests__/users-actions.test.ts:604`–`:623` exige recusa, contagem e preservação. | ✅ |
| Exatamente 3 retorna 3/3 | `src/server/integration/__tests__/properties.test.ts:155`–`:164`. | ✅ |
| Exatamente 4 retorna lista 3/total 4 | `src/server/integration/__tests__/properties.test.ts:169`–`:177`. | ✅ |

## Discrimination Sensor

O sensor usou um `git worktree` detached em `d8c1354`, com uma mutação por rodada. O worktree foi removido sem `git stash`. O porcelain real era vazio antes e voltou vazio depois.

| Mutation | File:line | Behavior-level fault | Targeted gate | Killed? |
| --- | --- | --- | --- | --- |
| M1 | `src/server/integration/properties.ts:74`–`:76` | Troca `status=disponivel AND published=true` por `OR`. | `properties.test.ts` | ✅ 3 testes falharam (`:91`, `:98`, `:105`) |
| M2 | `src/server/integration/properties.ts:11` | Limite 3 vira 4. | `properties.test.ts` | ✅ `:177` recebeu 4 |
| M3 | `src/server/integration/properties.ts:103` | Ordem vira `updatedAt ASC, id DESC`. | `properties.test.ts` | ✅ `:196` e `:220` falharam |
| M4 | `src/server/integration/properties.ts:20`–`:52` | Reintroduz `street` e `capturedByUserId` no DTO. | `properties.test.ts` | ✅ `:281` e `:316` falharam |
| M5 | `src/server/actions/properties.ts:133`–`:139` | Remove checagem de membro ativo do captador na criação. | `properties-actions.test.ts` | ✅ `:175` e `:198` falharam |
| M6 | `src/server/actions/properties.ts:80`/`:143` | Campo `kind` ausente recebe default, simulando “manter/default”. | `properties-actions.test.ts` | ✅ `:218` falhou |
| M7 | `src/server/integration/properties.ts:108` | `total` vira `rows.length`. | `properties.test.ts` | ✅ `:176` recebeu 3 em vez de 4 |
| M8 | `n8n/src/system-message.mjs:121` | Reintroduz “NÃO busca imóveis”. | `system-message.test.ts` | ✅ `:65` falhou |
| M9 | `n8n/src/system-message.mjs:146` | Remove a instrução de encerrar após `ok=true` (AC25). | `system-message.test.ts` | ✅ 2 casos falharam em `:866` |

**Sensor depth**: expanded manual, nove mutações cobrindo todas as mutações nomeadas no design e AC25.
**Result**: 9/9 killed — PASS ✅

Uma falha secundária de cleanup apareceu nas rodadas M2/M3/M7 porque o próprio teste mutado deixou a quarta fixture fora da lista usada antes da limpeza. Ela não foi usada como prova de morte: as asserções funcionais indicadas acima falharam primeiro e identificaram diretamente o comportamento mutado.

## Interactive UAT Results

| # | Test | Result | Details |
| --- | --- | --- | --- |
| 1 | Gestor e corretor na tela `/imoveis` | ✅ Pass | Quatro capturas finais em `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:50`–`:53`; ações aparecem apenas para gestor. |
| 2 | Busca positiva e negativa pelo WhatsApp | ✅ Pass | Execuções e banco cruzados em `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:971`–`:980`. |
| 3 | Qualificar e agendar após a tool nova | ✅ Pass | Usuário declarou a última sessão um sucesso; CRM, Calendar e Meet conferidos em `.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:994`–`:1013`. |

## Gate Check

- **Command**: `npx vitest run && npm run lint && npm run build`
- **Vitest**: 91 files, **1,357 passed**, 0 failed, 0 skipped, 659.70 s.
- **Lint**: exit 0, 0 errors, 3 known warnings (`scheduler.ts`, generated scheduler, redundant eslint directive).
- **Build**: exit 0, Next.js 16.2.11 compiled, type checked and generated 20 routes. Local Better Auth secret/base URL warnings are the documented preexisting build behavior.
- **Before feature**: 82 files, 1,076 tests (`.specs/archive/lote-11-catalogo-de-imoveis/evidencia.md:7`–`:21`).
- **Delta**: +9 test files and +281 passing tests. Test count did not decrease.
- **Structural gates**: `validate_spec.py` = 0 errors/0 warnings; `validate_tasks.py` = 0 errors/23 advisory warnings; `git diff --check` = exit 0.

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code; no feature beyond the approved lot and approved corrections | ✅ |
| Surgical changes; unrelated findings were documented instead of fixed | ✅ |
| Existing patterns preserved across DAL, actions, integration wrapper and n8n SDK | ✅ |
| Tests assert spec outcomes rather than implementation internals | ✅ |
| Payload/conjunction rule met: tenant, seven filters, DTO fields and prohibited fields have value-level assertions | ✅ |
| Domain coverage maps 1:1 to ACs; route covers happy, filter, auth, 400, 405 and instrumentation | ✅ |
| Tests in the diff map to ACs, edge cases or task gates; no skips found | ✅ |
| Project guidelines followed: `AGENTS.md`, `CLAUDE.md`, Test Coverage Matrix and `coding-principles.md` | ✅ |

The only `SPEC_DEVIATION` in `n8n/src/system-message.mjs:9` predates this feature and documents an older design signature. No new deviation was introduced by lote 11.

## Requirement Traceability Update

| Requirements | Previous status in `spec.md` | Verifier status |
| --- | --- | --- |
| IMOV-01–IMOV-07 | In Design | ✅ Verified |
| BUSCA-01–BUSCA-04 | In Design | ✅ Verified |
| BUSCA-05 | T36 publicada; prova real anterior aceita | ✅ Verified |
| PROVA-01 | In Design | ✅ Verified |
| PROVA-02 | T26/T27 concluídas | ✅ Verified |
| SEEDIM-01 | In Design | ✅ Verified |

O orquestrador deve aplicar esses estados ao `spec.md` na T29; o Verifier não alterou outro artefato real.

## Ranked Gaps

Nenhum gap bloqueante, major, minor ou de precisão. Nenhum mutante sobreviveu. Um PASS limpo não gera nova lição.

## Summary

**Overall**: ✅ Ready for T29 closure
**Spec-anchored check**: 78/78 ACs matched; 0 precision gaps
**Sensor**: 9/9 killed
**Gate**: 1,357 tests passed; lint and build passed
