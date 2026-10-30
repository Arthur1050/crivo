# Lote 17 — Pastas de documentos — Specification

**Design**: `.specs/features/lote-17-pastas-de-documentos/design.md`
**Tasks**: `.specs/features/lote-17-pastas-de-documentos/tasks.md`
**Decisão de produto**: AD-051 (`.specs/STATE.md`)
**Rascunho visual**: `.specs/features/lote-17-pastas-de-documentos/rascunho/` (fora do build)

## Problem Statement

A página de Documentos virou um gerenciador de arquivos em 2026-10-22, mas sem pastas: todo arquivo
da imobiliária cai numa lista única, e a única forma de organizar é a categoria, que é uma etiqueta e
não um lugar. Com dezenas de contratos, tabelas e materiais de lançamento, a equipe precisa guardar
cada arquivo num lugar, abrir esse lugar por link e enviar arquivo direto para ele. Este lote cria as
pastas por tenant, de ponta a ponta: banco, camada de dados, actions, permissões e página.

## Goals

- [ ] Um gestor cria, renomeia e exclui pastas, move documentos entre elas e envia arquivo direto
      numa pasta aberta, sem sair da página de Documentos.
- [ ] A pasta abre por URL (`/documentos?pasta=<id>`) e mostra só os arquivos dela, com busca e
      "Filtrar e ordenar" funcionando dentro dela.
- [ ] Nenhuma leitura ou escrita de pasta cruza tenant, provado por teste de banco com linha de outro
      tenant; um corretor (`documentos: ler`) vê e abre pastas e é recusado em toda escrita.
- [ ] O contexto que o agente recebe não muda quando um documento troca de pasta.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Subpastas, mover pasta para dentro de pasta | AD-051: um nível só |
| Agente do WhatsApp enxergar a pasta (contexto, `/api/v1/*`, `openapi.yaml`, `n8n/`) | AD-051 |
| Seleção múltipla de documentos na interface, arrastar e soltar | A action aceita vários ids (contrato pronto), mas a interface move pelo menu de um documento, como pede o escopo; seleção múltipla é lote próprio |
| Permissão por pasta (pasta privada, pasta só de um corretor) | A matriz por papel (`documentos: ler/escrever`) continua sendo a única regra |
| Cor ou ícone por pasta | A cor é da categoria (AD-051: a categoria continua sendo a etiqueta colorida) |
| Mudança na matriz de permissões | `documentos` já separa leitura e escrita |
| Aplicar o schema em produção, `drizzle-kit` contra produção, `db:seed` em produção | O usuário aplica `scripts/document-folders/schema.sql` em produção antes do merge final em `main` (design § Schema) |
| Documentos sintéticos no seed | O seed não cria documento desde o L12 (exigem upload real); as pastas do seed nascem vazias |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Pasta substitui ou convive com categoria | Convive: pasta é o lugar, categoria é a etiqueta; no máximo uma de cada por documento | Decisão do usuário, AD-051 item 1 | y |
| Profundidade | Um nível; documento sem pasta fica na raiz ("Sem pasta") | Decisão do usuário, AD-051 item 2 | y |
| O agente enxerga a pasta | Não; nada muda no contexto, na API v1 nem no n8n | Decisão do usuário, AD-051 item 3 | y |
| Excluir pasta com documentos | A pasta some e os documentos voltam para a raiz, depois de uma confirmação que mostra quantos arquivos serão movidos | Decisão do usuário, AD-051 item 4 | y |
| O que "Todos os arquivos" lista na raiz | Todos os documentos do tenant, de todas as pastas e sem pasta (comportamento de hoje); a visão em lista ganha a coluna "Pasta" | O título promete todos; mover um arquivo para uma pasta não pode fazê-lo sumir da lista principal | n |
| Como ver só os documentos sem pasta | Item "Sem pasta" no submenu "Pasta" de "Filtrar e ordenar", só na raiz, gravando `pasta=sem-pasta` na URL | A camada de dados precisa do filtro "sem pasta" (escopo); o menu de filtros é onde os outros filtros já vivem | n |
| Formato do parâmetro `pasta` | UUID da pasta abre a pasta; `sem-pasta` é o filtro da raiz; qualquer outro valor é pasta inexistente | Um só parâmetro, e um valor que não é UUID nunca chega ao banco (evita o 500 de cast de UUID registrado no L14) | n |
| Última atualização da pasta | Maior valor entre `document_folders.updated_at` e o `uploaded_at` mais recente dos documentos não excluídos dela; `updated_at` muda ao criar, renomear e quando um documento entra ou sai da pasta (mover ou editar) | Derivado, sem coluna nova em `documents`; cobre envio, mudança de pasta e renomeação | n |
| Exclusão de documento e última atualização | Excluir um documento não muda a última atualização da pasta (ele só deixa de contar) | Mudar isso exigiria tocar `tombstoneDocument`, fora do escopo; a contagem e o tamanho já refletem a exclusão | n |
| Regras do nome da pasta | As da categoria: `validateName` com o rótulo "Nome da pasta" (1 a 120 caracteres depois de tirar os espaços das pontas), único por tenant sem diferenciar maiúsculas | Escopo: "como em `document_categories`" | n |
| Ordem das pastas | Alfabética em português (`Intl.Collator("pt-BR", { sensitivity: "base" })`), empate pelo id | Previsível; acento e maiúscula não podem jogar "Ágape" para o fim | n |
| Teto de pastas por tenant | Nenhum | Sem pedido; o volume do piloto é de dezenas | n |
| Mover vários documentos | Tudo ou nada: se um id não for encontrado, nenhum documento muda; de 1 a 100 ids distintos | Movimento parcial deixaria o usuário sem saber o que mudou | n |
| `movedCount` | Quantidade de documentos cuja pasta de fato mudou (já estar no destino não conta) | É o número que interessa a quem confirma | n |
| Onde o rótulo de data é calculado | No servidor (página), passado pronto ao componente cliente | Evita o descompasso de hidratação já visto no `Timestamp` (L12, ideias adiadas) | n |
| Pasta inexistente na URL | Página responde 200 com o estado "Pasta não encontrada", sem `notFound()` | L-073; a mesma resposta para pasta de outro tenant não revela que o id existe | n |
| Pasta excluída durante um upload em curso | O documento é gravado sem pasta (a FK da intenção zera o `folder_id`) | Sem perda do arquivo; a regra da FK já resolve | n |
| Pastas do seed | Seis pastas do rascunho em cada tenant do seed, todas vazias | O seed não cria documentos desde o L12 | n |
| Mudança de schema em produção | SQL idempotente em `scripts/document-folders/schema.sql`, o mesmo que o `db:push:test` aplica e confere nos bancos de teste; o usuário o aplica em produção | `drizzle-kit push` derruba índice de expressão e aborta com saída 0 (L-068, L-070); provar no teste o SQL que vai para produção | n |

**Open questions:** none — as quatro decisões de produto estão na AD-051; o resto está registrado acima como suposição, para o usuário aprovar junto com o PR.

---

## User Stories

### P1: Pastas no banco e na camada de dados ⭐ MVP

**User Story**: Como gestor, quero que cada documento possa morar numa pasta da minha imobiliária,
para organizar o acervo por assunto sem perder a categoria.

**Why P1**: Sem o modelo e a leitura isolada por tenant, nada do resto existe.

#### PMOD-01 — Modelo de pastas

**Acceptance Criteria**:

1. The system SHALL persistir pastas na tabela `document_folders` com `id` (UUID), `tenant_id`, `name`, `created_at` e `updated_at`, e `tenant_id` referenciando `tenants` com exclusão em cascata.
2. The system SHALL recusar no banco uma segunda pasta do mesmo tenant cujo nome seja igual ao de outra ignorando maiúsculas e minúsculas, pelo índice único `document_folders_tenant_id_lower_name_idx` em `(tenant_id, lower(name))`.
3. The system SHALL aceitar o mesmo nome de pasta em tenants diferentes.
4. The system SHALL guardar a pasta do documento em `documents.folder_id`, anulável, referenciando `document_folders(id)` com `on delete set null`.
5. The system SHALL guardar a pasta escolhida no envio em `document_upload_intents.folder_id`, anulável, referenciando `document_folders(id)` com `on delete set null`.
6. WHEN uma pasta é apagada no banco THEN o sistema SHALL deixar `folder_id` nulo nos documentos e nas intenções de upload que a referenciavam, sem apagar nenhum deles.
7. WHEN um tenant é apagado THEN o sistema SHALL apagar as pastas dele em cascata.

#### PBANCO-01 — Schema nos bancos de teste e pronto para produção

**Acceptance Criteria**:

1. The system SHALL ter em `scripts/document-folders/schema.sql` toda a mudança de schema do lote, idempotente e numa transação, com nomes de tabela, coluna, índice e FK iguais aos que o Drizzle gera a partir de `src/db/schema.ts`.
2. WHEN `npm run db:push:test` roda THEN o sistema SHALL aplicar `schema.sql` em cada alvo depois do `drizzle-kit push` e antes da conferência final.
3. IF depois da aplicação algum alvo não tiver a tabela `document_folders`, as colunas `documents.folder_id` e `document_upload_intents.folder_id`, as três FKs com a regra de exclusão desta spec, o índice `document_folders_tenant_id_lower_name_idx` ou o índice `document_categories_tenant_id_lower_name_idx` THEN o `db:push:test` SHALL listar cada item ausente e sair com código diferente de 0, sem tocar nos alvos seguintes.
4. WHEN `schema.sql` é aplicado duas vezes seguidas no mesmo banco THEN o sistema SHALL terminar sem erro e com o mesmo estado.

#### PLER-01 — Leitura das pastas

**Acceptance Criteria**:

1. WHEN as pastas de um tenant são listadas THEN o sistema SHALL devolver só as pastas desse tenant, cada uma com `id`, `name`, `fileCount`, `totalSizeBytes` e `lastActivityAt`.
2. The system SHALL contar em `fileCount` e somar em `totalSizeBytes` só os documentos da pasta, do mesmo tenant, com `deleted_at` nulo.
3. The system SHALL calcular `lastActivityAt` como o maior valor entre `document_folders.updated_at` e o `uploaded_at` mais recente dos documentos não excluídos da pasta.
4. WHEN uma pasta não tem documento não excluído THEN o sistema SHALL devolvê-la com `fileCount` 0, `totalSizeBytes` 0 e `lastActivityAt` igual ao `updated_at` dela.
5. The system SHALL ordenar as pastas por nome com `Intl.Collator("pt-BR", { sensitivity: "base" })`, com empate decidido pelo `id` em ordem crescente.
6. WHEN uma pasta é pedida por id com o tenant dono THEN o sistema SHALL devolver `{ id, name }`.
7. IF a pasta pedida por id não existir ou for de outro tenant THEN o sistema SHALL devolver `null`, sem lançar erro.
8. IF o id pedido não for um UUID THEN o sistema SHALL devolver `null` sem consultar o banco.

#### PFILT-01 — Filtro de documentos por pasta

**Acceptance Criteria**:

1. WHEN documentos são listados com o filtro `{ kind: "pasta", folderId }` THEN o sistema SHALL devolver só os documentos não excluídos do tenant com `folder_id` igual a `folderId`.
2. WHEN documentos são listados com o filtro `{ kind: "sem-pasta" }` THEN o sistema SHALL devolver só os documentos não excluídos do tenant com `folder_id` nulo.
3. WHEN documentos são listados sem filtro de pasta THEN o sistema SHALL devolver os documentos não excluídos do tenant de todas as pastas e os sem pasta.
4. WHEN o filtro de pasta vem junto com modalidade, categoria e busca por nome THEN o sistema SHALL aplicar os quatro ao mesmo tempo.
5. IF o filtro aponta para uma pasta de outro tenant THEN o sistema SHALL devolver lista vazia.
6. The system SHALL incluir `folderId` em cada documento da listagem do CRM.

**Independent Test**: com o banco de teste, criar duas pastas em dois tenants, documentos dentro e fora delas, e conferir contagem, tamanho, última atualização, filtros e a lista vazia do outro tenant.

---

### P1: Escrever pastas e mover documentos ⭐ MVP

**User Story**: Como gestor, quero criar, renomear e excluir pastas e trocar a pasta de um documento,
para manter o acervo organizado conforme ele cresce.

**Why P1**: Sem escrita, a pasta é só leitura de dado que ninguém consegue criar.

#### PCRIAR-01 — Criar pasta

**Acceptance Criteria**:

1. WHEN um usuário com `documentos: escrever` cria uma pasta com nome válido THEN o sistema SHALL gravá-la no tenant ativo da sessão com o nome sem espaços nas pontas e devolver `{ ok: true, folder: { id, name } }`.
2. IF o nome, sem espaços nas pontas, for vazio ou tiver mais de 120 caracteres THEN o sistema SHALL devolver `{ ok: false, code: "nome-invalido" }` com a mensagem de `validateName(nome, "Nome da pasta")`, sem gravar.
3. IF já existir no tenant uma pasta com o mesmo nome ignorando maiúsculas e minúsculas THEN o sistema SHALL devolver `{ ok: false, code: "nome-duplicado", error: "Já existe uma pasta com esse nome." }`, sem gravar.
4. WHEN duas criações com o mesmo nome no mesmo tenant chegam ao mesmo tempo THEN o sistema SHALL gravar uma e devolver `nome-duplicado` para a outra, sem lançar erro.

#### PREN-01 — Renomear pasta

**Acceptance Criteria**:

1. WHEN um usuário com `documentos: escrever` renomeia uma pasta do tenant ativo com nome válido THEN o sistema SHALL gravar o nome sem espaços nas pontas, atualizar `updated_at` e devolver `{ ok: true, folder: { id, name } }`.
2. WHEN o nome novo difere do atual só em maiúsculas e minúsculas THEN o sistema SHALL aceitar a troca.
3. IF o nome novo já pertencer a outra pasta do tenant ignorando maiúsculas e minúsculas THEN o sistema SHALL devolver `{ ok: false, code: "nome-duplicado" }` sem alterar nenhuma pasta.
4. IF o nome novo for inválido THEN o sistema SHALL devolver `{ ok: false, code: "nome-invalido" }` sem alterar nenhuma pasta.
5. IF a pasta não existir, for de outro tenant ou o id não for UUID THEN o sistema SHALL devolver `{ ok: false, code: "pasta-nao-encontrada", error: "Pasta não encontrada." }` sem alterar nenhuma pasta.
6. The system SHALL manter na pasta renomeada todos os documentos que estavam nela.

#### PEXC-01 — Excluir pasta

**Acceptance Criteria**:

1. WHEN um usuário com `documentos: escrever` exclui uma pasta do tenant ativo THEN o sistema SHALL apagar a pasta, deixar sem pasta os documentos e as intenções de upload que estavam nela e devolver `{ ok: true, movedToRootCount }` com a quantidade de documentos não excluídos que estavam na pasta.
2. The system SHALL manter todos os outros campos dos documentos movidos para a raiz, inclusive `status`, categoria e `deleted_at`.
3. IF a pasta não existir, for de outro tenant ou o id não for UUID THEN o sistema SHALL devolver `{ ok: false, code: "pasta-nao-encontrada" }` sem alterar nenhuma linha.
4. WHEN o usuário pede a exclusão na interface THEN o sistema SHALL abrir uma confirmação com o título `Excluir a pasta "<nome>"?` e a descrição "Os N arquivos dela voltam para Sem pasta." (N > 1), "O arquivo dela volta para Sem pasta." (N = 1) ou "A pasta está vazia." (N = 0), com N igual ao `fileCount` exibido.
5. WHEN o usuário cancela a confirmação THEN o sistema SHALL manter a pasta e os documentos.
6. WHEN a pasta excluída é a que está aberta na página THEN o sistema SHALL levar o usuário para `/documentos`.

#### PMOVER-01 — Mover documentos

**Acceptance Criteria**:

1. WHEN um usuário com `documentos: escrever` move de 1 a 100 documentos do tenant ativo para uma pasta do tenant THEN o sistema SHALL gravar a pasta em todos eles e devolver `{ ok: true, movedCount }` com a quantidade de documentos cuja pasta mudou.
2. WHEN o destino da movimentação é `null` THEN o sistema SHALL deixar os documentos sem pasta.
3. WHEN a pasta de pelo menos um documento muda THEN o sistema SHALL gravar o instante da operação em `updated_at` da pasta de destino e de cada pasta de origem.
4. The system SHALL tratar ids repetidos na lista como um só.
5. IF a lista vier vazia, tiver mais de 100 ids distintos ou algum id que não é UUID THEN o sistema SHALL devolver `{ ok: false, code: "selecao-invalida", error: "Selecione de 1 a 100 documentos." }` sem alterar nenhuma linha.
6. IF a pasta de destino não existir, for de outro tenant ou o id não for UUID THEN o sistema SHALL devolver `{ ok: false, code: "pasta-nao-encontrada" }` sem alterar nenhum documento.
7. IF algum documento da lista não existir, estiver excluído ou for de outro tenant THEN o sistema SHALL devolver `{ ok: false, code: "documento-nao-encontrado", error: "Documento não encontrado." }` e nenhum documento da lista SHALL mudar.
8. IF a pasta de destino for excluída ao mesmo tempo que a movimentação THEN o sistema SHALL terminar com um destes dois desfechos: a movimentação conclui antes e a exclusão leva os documentos para a raiz, ou a movimentação devolve `pasta-nao-encontrada`; nunca erro lançado.
9. The system SHALL manter `status`, texto extraído e elegibilidade de contexto do documento movido, sem reprocessá-lo.
10. WHEN o usuário com `documentos: escrever` escolhe "Mover para pasta" no menu de um documento THEN o sistema SHALL abrir um diálogo com a opção "Sem pasta" e as pastas do tenant, com a pasta atual do documento selecionada, e mover o documento ao confirmar.

#### PEDIT-01 — Pasta na edição do documento

**Acceptance Criteria**:

1. WHEN o diálogo "Editar documento" abre THEN o sistema SHALL mostrar o campo "Pasta" com a pasta atual do documento selecionada, ou vazio com o texto "Sem pasta" quando ele não tem pasta.
2. WHEN a edição é salva com outra pasta THEN o sistema SHALL gravar a pasta junto com os demais campos na mesma transação e atualizar `updated_at` das pastas de origem e de destino.
3. WHEN `updateDocumentAction` recebe `folderId: null` THEN o sistema SHALL deixar o documento sem pasta.
4. WHEN `updateDocumentAction` é chamada sem o campo `folderId` THEN o sistema SHALL manter a pasta atual do documento.
5. IF `updateDocumentAction` recebe `folderId` de pasta inexistente, de outro tenant ou que não é UUID THEN o sistema SHALL devolver `{ ok: false, error: "Pasta não encontrada." }` sem gravar nenhum campo.

**Independent Test**: com o banco de teste e a sessão simulada como nos testes de action, criar,
renomear e excluir pastas, mover documentos e editar a pasta de um documento, conferindo o banco
antes e depois, inclusive com ids de outro tenant.

---

### P1: Permissões e isolamento ⭐ MVP

**User Story**: Como administrador, quero que o corretor veja e abra as pastas mas não as altere, e
que nenhuma imobiliária enxergue ou altere pasta de outra.

**Why P1**: Multi-tenant (AD-002) e a matriz por papel (PERM-01) valem para todo recurso novo.

#### PPERM-01 — Permissões

**Acceptance Criteria**:

1. The system SHALL exigir `documentos: escrever` em criar, renomear e excluir pasta e em mover documento, revalidando permissão e tenant ativo dentro de cada action.
2. IF um usuário só com `documentos: ler` chama uma dessas actions THEN o sistema SHALL devolver `{ ok: false, code: "sem-permissao" }` com a mensagem da guarda de permissão, sem alterar nenhuma linha.
3. The system SHALL exigir `documentos: ler` para listar pastas e abrir uma pasta, pela mesma guarda que a página já usa.
4. WHILE o usuário não tem `documentos: escrever` the system SHALL esconder "Nova pasta", "Renomear", "Excluir" e "Mover para pasta".
5. WHILE o usuário não tem `documentos: escrever` the system SHALL oferecer "Abrir pasta" e "Copiar link" no menu da pasta.
6. The system SHALL resolver o tenant de toda leitura e escrita de pasta pela sessão, nunca por campo da entrada.

#### PAGENTE-01 — O agente não enxerga a pasta

**Acceptance Criteria**:

1. The system SHALL manter sem mudança neste lote `src/server/integration/context.ts`, as rotas de `app/api/v1/`, `openapi.yaml` e tudo em `n8n/`.
2. WHEN um documento elegível é movido para uma pasta, entre pastas ou para a raiz THEN o sistema SHALL devolver em `getDirectDocumentContext` para o tenant o mesmo resultado de antes da movimentação.

---

### P1: Página de Documentos com pastas ⭐ MVP

**User Story**: Como corretor ou gestor, quero ver as pastas da imobiliária, abrir uma pelo cartão ou
por link e trabalhar só com os arquivos dela.

**Why P1**: É a entrega que o usuário vê; o rascunho da grade já existe.

#### PRAIZ-01 — Raiz de Documentos

**Acceptance Criteria**:

1. WHILE nenhuma pasta está aberta the system SHALL mostrar a seção "Pastas", com a quantidade de pastas ("1 pasta" ou "N pastas") e um cartão por pasta do tenant, antes da seção "Todos os arquivos".
2. The system SHALL mostrar em cada cartão o nome, a quantidade ("1 arquivo" ou "N arquivos", inclusive "0 arquivos"), o rótulo de última atualização e o tamanho total por `formatFileSize`.
3. The system SHALL montar o rótulo de última atualização no servidor, no fuso `America/Sao_Paulo`: "Atualizada agora" (menos de 1 min, ou data futura), "Atualizada há N min" (de 1 a 59 min), "Atualizada há N h" (60 min ou mais, no mesmo dia), "Atualizada ontem" (dia anterior), "Atualizada em D de mmm." (antes de ontem, mesmo ano) e "Atualizada em D de mmm. de AAAA" (outro ano).
4. WHEN o usuário clica num cartão de pasta THEN o sistema SHALL navegar para `/documentos?pasta=<id>`.
5. The system SHALL oferecer em cada cartão um menu com "Abrir pasta" e "Copiar link" e, para quem tem `documentos: escrever`, "Renomear" e "Excluir".
6. WHILE nenhuma pasta está aberta the system SHALL listar em "Todos os arquivos" os documentos de todas as pastas e os sem pasta.
7. The system SHALL mostrar na visão em lista a coluna "Pasta" com o nome da pasta do documento ou "Sem pasta".
8. WHILE nenhuma pasta está aberta the system SHALL oferecer em "Filtrar e ordenar" o submenu "Pasta" com "Todas" e "Sem pasta", em que "Sem pasta" grava `pasta=sem-pasta` na URL e lista só documentos sem pasta.
9. WHEN um usuário com `documentos: escrever` confirma "Nova pasta" com um nome válido THEN o sistema SHALL criar a pasta e mostrar o cartão dela na grade sem recarga manual da página.
10. IF criar ou renomear devolver erro THEN o diálogo SHALL mostrar a mensagem do erro no campo "Nome da pasta" e continuar aberto.

#### PABRIR-01 — Pasta aberta

**Acceptance Criteria**:

1. WHEN a URL tem `pasta=<id>` de uma pasta do tenant THEN o sistema SHALL mostrar o caminho "Documentos / <nome da pasta>", com "Documentos" levando a `/documentos`, e listar só os documentos dessa pasta.
2. WHILE uma pasta está aberta the system SHALL esconder a seção "Pastas" e o submenu "Pasta" de "Filtrar e ordenar".
3. WHILE uma pasta está aberta the system SHALL aplicar busca, modalidade, categoria, ordem e visão só aos documentos dela, mantendo `pasta` na URL a cada mudança.
4. **Emendado por decisão do usuário em 2026-10-30.** Texto original preservado: “WHILE uma pasta está aberta the system SHALL levar "Limpar filtros" para `/documentos?pasta=<id>`.” Regra vigente: WHILE uma pasta está aberta the system SHALL fazer o item "Limpar filtros" do menu "Filtrar e ordenar" remover somente `modalidade` e `categoria`, mantendo `pasta`, `q`, `ordem` e `visao`, como na raiz; o link "Limpar filtros" do estado vazio (PVAZIO-01 AC3) SHALL levar exatamente para `/documentos?pasta=<id>`, via `clearFiltersHref`.
5. WHILE uma pasta está aberta the system SHALL usar o nome da pasta como título da seção de arquivos, com o menu da pasta ("Copiar link" e, para quem escreve, "Renomear" e "Excluir") ao lado.

#### PUPLOAD-01 — Envio dentro da pasta

**Acceptance Criteria**:

1. WHILE uma pasta está aberta, WHEN o usuário envia um arquivo pelo botão de envio da página THEN o sistema SHALL gravar o documento nessa pasta.
2. WHILE uma pasta está aberta the system SHALL mostrar no diálogo de envio o texto `Será salvo na pasta "<nome>".`
3. WHEN o envio é feito na raiz THEN o sistema SHALL gravar o documento sem pasta.
4. The system SHALL aceitar no payload do envio o campo opcional `folderId` (string ou `null`), guardá-lo na intenção de upload e levá-lo ao documento quando o envio é confirmado, pelo callback do provedor ou pela finalização do navegador.
5. IF o `folderId` do payload não for string nem `null` THEN a rota de envio SHALL responder 400 com `{ "error": "upload_payload_invalid" }`.
6. IF o `folderId` do payload apontar para pasta inexistente, de outro tenant ou não for UUID THEN a rota de envio SHALL responder 404 com `{ "error": "upload_folder_not_found" }`, sem criar intenção de upload.
7. WHEN a rota responde `upload_folder_not_found` THEN o diálogo de envio SHALL mostrar "A pasta escolhida não existe mais. Recarregue a página e envie de novo."
8. IF a pasta for excluída depois da reserva e antes da confirmação do envio THEN o sistema SHALL gravar o documento sem pasta.

#### PLINK-01 — Copiar link da pasta

**Acceptance Criteria**:

1. WHEN o usuário escolhe "Copiar link" THEN o sistema SHALL copiar `<origem da página>/documentos?pasta=<id>` para a área de transferência e mostrar o aviso "Link copiado".
2. IF a cópia para a área de transferência falhar THEN o sistema SHALL mostrar o aviso de erro "Não foi possível copiar o link."

#### PVAZIO-01 — Estados vazios

**Acceptance Criteria**:

1. WHILE o tenant não tem pastas the system SHALL mostrar na seção "Pastas" o estado "Nenhuma pasta ainda" com a descrição "Crie uma pasta para organizar os arquivos." para quem tem `documentos: escrever` e "As pastas criadas pela equipe aparecem aqui." para quem só lê.
2. WHEN a pasta aberta não tem documentos e nenhum filtro nem busca está ativo THEN o sistema SHALL mostrar "Esta pasta está vazia" com "Envie um arquivo ou mova documentos para cá." para quem escreve e "Nenhum arquivo nesta pasta." para quem só lê.
3. WHEN a pasta aberta tem documentos e o filtro ou a busca não encontra nenhum THEN o sistema SHALL mostrar "Nenhum resultado encontrado" com o link "Limpar filtros".
4. IF `pasta` não for UUID nem `sem-pasta`, ou apontar para pasta inexistente ou de outro tenant, THEN o sistema SHALL responder com HTTP 200 e o estado "Pasta não encontrada", com a descrição "Esta pasta não existe ou foi excluída." e o link "Voltar para Documentos", sem lista de documentos, sem busca e sem botões de envio e de nova pasta.
5. The system SHALL mostrar o mesmo estado e o mesmo texto para pasta inexistente e para pasta de outro tenant.

**Independent Test**: com `npm run dev:test` e o banco de teste, capturar a raiz com pastas, a pasta
aberta, os diálogos, os estados vazios e a largura de 375 px.

---

### P2: Dados de exemplo

**User Story**: Como desenvolvedor, quero pastas no seed para ver a grade sem cadastrar nada à mão.

**Why P2**: Ajuda a demonstração e as capturas; o produto funciona sem ele.

#### PSEED-01 — Seed de pastas

**Acceptance Criteria**:

1. WHEN `runSeed` roda THEN o sistema SHALL apagar todas as linhas de `document_folders` e inserir, para cada tenant do seed, as pastas "Contratos", "Lançamentos", "Documentação legal", "Financiamento", "Tabelas de preço" e "Treinamento da equipe", com id determinístico `id("folder:<tenant>:<chave>")`.
2. WHEN `runSeed` roda duas vezes seguidas THEN o sistema SHALL terminar com as mesmas pastas e os mesmos ids.

---

## Edge Cases

- IF o nome tem só espaços THEN o sistema SHALL tratá-lo como vazio (`nome-invalido`) (PCRIAR-01 AC2).
- WHEN o nome tem exatamente 120 caracteres depois de tirar os espaços das pontas THEN o sistema SHALL aceitá-lo; com 121, SHALL recusá-lo (PCRIAR-01 AC2).
- IF a mesma pasta é renomeada para o próprio nome atual THEN o sistema SHALL devolver `ok: true` (PREN-01 AC1).
- IF um documento excluído (`deleted_at` preenchido) estava na pasta THEN o sistema SHALL não contá-lo em `fileCount` nem em `movedToRootCount` (PLER-01 AC2, PEXC-01 AC1).
- WHEN uma pasta tem mais de 2 GiB somados THEN o sistema SHALL devolver `totalSizeBytes` exato como `number` (seguro até 2^53 bytes) (PLER-01 AC1).
- WHEN `pasta=sem-pasta` e outra pasta é escolhida no filtro THEN o sistema SHALL manter um só valor de `pasta` na URL (PRAIZ-01 AC8).
- IF o mesmo documento aparece duas vezes na lista de movimentação THEN o sistema SHALL movê-lo uma vez e contá-lo uma vez (PMOVER-01 AC4).
- IF todos os documentos da lista já estão na pasta de destino THEN o sistema SHALL devolver `{ ok: true, movedCount: 0 }` sem mudar `updated_at` de nenhuma pasta (PMOVER-01 AC1, AC3).
- IF o usuário exclui a pasta aberta THEN o sistema SHALL levar para `/documentos`, sem mostrar "Pasta não encontrada" (PEXC-01 AC6).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| PMOD-01 | P1: Pastas no banco e na camada de dados | Tasks | Pending |
| PBANCO-01 | P1: Pastas no banco e na camada de dados | Tasks | Pending |
| PLER-01 | P1: Pastas no banco e na camada de dados | Tasks | Pending |
| PFILT-01 | P1: Pastas no banco e na camada de dados | Tasks | Pending |
| PCRIAR-01 | P1: Escrever pastas e mover documentos | Tasks | Pending |
| PREN-01 | P1: Escrever pastas e mover documentos | Tasks | Pending |
| PEXC-01 | P1: Escrever pastas e mover documentos | Tasks | Pending |
| PMOVER-01 | P1: Escrever pastas e mover documentos | Tasks | Pending |
| PEDIT-01 | P1: Escrever pastas e mover documentos | Tasks | Pending |
| PPERM-01 | P1: Permissões e isolamento | Tasks | Pending |
| PAGENTE-01 | P1: Permissões e isolamento | Tasks | Pending |
| PRAIZ-01 | P1: Página de Documentos com pastas | Tasks | Pending |
| PABRIR-01 | P1: Página de Documentos com pastas | Tasks | Pending |
| PUPLOAD-01 | P1: Página de Documentos com pastas | Tasks | Pending |
| PLINK-01 | P1: Página de Documentos com pastas | Tasks | Pending |
| PVAZIO-01 | P1: Página de Documentos com pastas | Tasks | Pending |
| PSEED-01 | P2: Dados de exemplo | Tasks | Pending |

**ID format:** `P<ÁREA>-NN`.

**Coverage:** 17 requisitos, 17 mapeados para tasks em `tasks.md`, 0 sem task.

---

## Success Criteria

- [ ] Os 17 requisitos com evidência no `validation.md` do Verifier independente, e o sensor de discriminação sem mutante vivo nos alvos obrigatórios do design.
- [ ] Capturas reais da raiz, da pasta aberta, dos diálogos, dos estados vazios e da largura de 375 px.
- [ ] `npx tsc --noEmit -p .` com 0 erros e `npx eslint .` com 0 erros e no máximo 9 avisos ao fim de cada PR.
- [ ] Nenhuma mudança em `src/server/integration/context.ts`, `app/api/v1/`, `openapi.yaml` e `n8n/` no diff `lote-17...origin/main`.
