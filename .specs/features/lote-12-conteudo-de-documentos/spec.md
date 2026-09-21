# Lote 12 — Conteúdo de documentos chega ao agente — Especificação

**Status:** Aprovada — tarefas aprovadas, pronta para execução  
**Data:** 2026-09-15

## Problem Statement

O CRM aceita documentos de contexto, mas hoje descarta o binário e guarda somente nome, tipo e tamanho. O contrato devolve `content: null`, portanto a imobiliária pode cadastrar uma política ou um regulamento sem que o agente receba uma única linha desse conhecimento. O lote 12 fecha essa lacuna para conteúdo não-inventário, com armazenamento privado, extração rastreável, consumo seguro pelo agente e ciclo de vida coerente entre banco e arquivo.

## Goals

- [ ] Fazer um arquivo suportado de até 10 MB percorrer upload, armazenamento, extração e uso pelo agente sem perder isolamento por imobiliária.
- [ ] Tornar visível o estado real de processamento e permitir recuperar falhas de extração sem reenviar o arquivo.
- [ ] Entregar ao agente todo o corpus elegível sem truncamento silencioso e aplicar um teto seguro, medido e reproduzível.
- [ ] Permitir que usuários autorizados visualizem o texto extraído e baixem o original intacto.
- [ ] Remover metadado, conteúdo extraído e binário de forma coerente na exclusão manual e na expiração LGPD.

## Out of Scope

| Feature | Reason |
| --- | --- |
| OCR de PDF escaneado ou imagem | O lote cobre somente texto nativo dos formatos já aceitos. |
| Busca vetorial, embeddings ou RAG | Só será planejada se o corpus real ultrapassar o teto medido neste lote. |
| Conteúdo de inventário de imóveis | O lote 11 já entrega catálogo estruturado e consulta SQL determinística. |
| Vitrine pública do catálogo | Permanece no lote 16, conforme AD-025. |
| Novos formatos ou arquivos acima de 10 MB | O lote preserva o contrato atual de entrada. |
| Versionamento ou substituição de binário | Para trocar conteúdo, o usuário envia um novo arquivo e exclui o anterior. |
| Notificações pré-expiração | Ideia registrada para a futura dinâmica de notificações. |
| Ativação manual e reordenação da prioridade do corpus | A prioridade será automática e determinística por antiguidade. |
| Antivírus externo | O piloto é controlado; formatos executáveis continuam recusados e o download será sempre como anexo. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here; nothing remains silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Ritmo da discussão | Guiado | O usuário aprovou defaults seguros e uma decisão por vez. | y |
| Processamento | Assíncrono, com estados `processando`, `pronto`, `falha` e `fora_do_agente` | Extração pode durar mais que a interação de upload e precisa expor falhas e retomada. | y |
| Formatos | PDF, DOCX, TXT, Markdown e CSV, até 10 MB | Preserva o contrato já validado; o usuário confirmou texto nativo sem OCR. | y |
| PDF escaneado ou conteúdo vazio | Falha `nenhum texto extraível`; original permanece baixável | Não inventa texto e mantém o arquivo recuperável. | y |
| Conteúdo enviado ao agente | Todos os documentos prontos, não expirados e compatíveis com a modalidade | Mantém injeção direta completa até a medição justificar RAG. | y |
| Semântica de `pergunta` | Parâmetro obrigatório do contrato, sem filtragem semântica no L12 | Estabiliza a interface futura sem simular relevância que ainda não existe. | y |
| Excesso de corpus | Preservar original e extração; marcar o documento novo como `fora_do_agente` | Evita truncamento silencioso e não remove conhecimento que já sustentava o agente. | y |
| Prioridade após liberar espaço | Documentos já prontos permanecem; bloqueados retornam do mais antigo para o mais recente | Política determinística aprovada pelo usuário. | y |
| Preview | Texto extraído dentro do CRM para `pronto` e `fora_do_agente` | Mostra exatamente o conteúdo gerenciável que poderia chegar ao agente. | y |
| Download | Original intacto desde que o storage conclua, inclusive em `processando` e `falha` | Permite recuperar o arquivo mesmo quando a extração não produz texto. | y |
| Duplicata | Bloquear a mesma impressão digital dentro do tenant; permitir mesmo nome com bytes diferentes | Impede contexto repetido sem transformar nome em identidade. | y |
| Validade | Opcional no upload e na edição; sem validade por padrão | Torna a política existente utilizável sem expirar conhecimento por surpresa. | y |
| Momento da expiração | Bloqueio imediato no instante; exclusão física pela rotina diária em até 24 horas | Separa indisponibilidade de acesso da manutenção eventual. | y |
| Permissões | Administrador/gestor escrevem; corretor apenas lê, visualiza e baixa | Reutiliza a matriz vigente de `documentos`. | existing |
| Isolamento | Hash, objeto, conteúdo, status, preview e download sempre escopados pelo tenant autorizado | Segue AD-002 e AD-021; igualdade de hash entre tenants não revela existência. | existing |
| Storage | Vercel Private Blob em Frankfurt, acessado por uma abstração de storage; o banco mantém chaves opacas e metadados | Adequado ao baixo volume inicial sem fechar a rota de migração futura. | y |
| Plano Vercel | Hobby apenas para desenvolvimento e validação não comercial; plano compatível com uso comercial antes de clientes pagantes | Evita operar o SaaS comercialmente fora dos termos do plano gratuito. | y |
| Teto seguro | Benchmark do modelo/workflow publicado com margem para prompt, histórico, pergunta e tools | Um número abstrato sem o consumidor real não seria reproduzível. | agent |
| Falha parcial | Compensação ou retomada determinística; nenhum órfão utilizável ou vazamento cross-tenant | Storage, banco e processamento não oferecem transação única. | agent |
| Observabilidade | Registrar IDs, tenant, estado, etapa, duração e erro sanitizado; nunca binário nem texto extraído | Diagnóstico não deve criar uma segunda cópia do conteúdo. | agent |
| Exclusão manual | Imediata e permanente após confirmação; remove linha, extração e original | Preserva a interação já existente e evita resíduos. | agent |
| Malware | Sem scanner externo; formatos executáveis recusados e download como anexo | Escopo de piloto controlado sem ampliar dependências externas. | agent |
| Notificação antes da exclusão | Adiada; preservar nome e instante exato de expiração | A ideia depende de uma dinâmica de notificações que ainda não existe. | y |

**Open questions:** none — todas as decisões foram confirmadas ou receberam default e rationale acima.

---

## User Stories

### P1: Armazenar o arquivo real com segurança ⭐ MVP

**User Story**: Como administrador ou gestor, quero enviar um documento real para que ele possa ser processado sem sair do escopo da minha imobiliária.

**Why P1**: Sem o binário não existe conteúdo para extrair, visualizar, baixar ou entregar ao agente.

**Acceptance Criteria**:

1. WHEN um usuário com `documentos:escrever` envia PDF, DOCX, TXT, Markdown ou CSV válido de 1 byte até 10 MB THEN the system SHALL armazenar o original em área privada do tenant e criar exatamente um registro em estado `processando`.
2. IF o arquivo tem zero bytes, excede 10 MB, usa formato não aceito ou contradiz o tipo declarado THEN the system SHALL recusar o envio sem criar registro nem objeto persistente.
3. IF o usuário não possui `documentos:escrever` THEN the system SHALL recusar o upload sem ler nem armazenar o binário.
4. WHEN dois uploads concorrentes contêm o mesmo binário no mesmo tenant THEN the system SHALL aceitar no máximo um e identificar o documento já existente na outra resposta.
5. IF o mesmo binário existe somente em outro tenant THEN the system SHALL permitir o upload sem revelar a existência, o nome ou o identificador do documento externo.
6. WHEN dois arquivos têm o mesmo nome e conteúdo diferente THEN the system SHALL permitir dois registros distintos no mesmo tenant.
7. IF o armazenamento falha antes da criação do registro THEN the system SHALL informar que o upload falhou e deixar zero registro persistente.
8. IF a criação do registro falha depois do armazenamento THEN the system SHALL remover o objeto recém-criado ou registrá-lo para compensação automática, sem expô-lo em listagem, preview, download ou contexto.
9. WHEN o armazenamento do original termina THEN the system SHALL disponibilizar o download ao usuário com `documentos:ler`, mesmo enquanto o estado for `processando`.
10. The system SHALL calcular a identidade de duplicata por tenant e por impressão digital dos bytes, nunca apenas pelo nome ou metadados declarados.

**Independent Test**: Enviar fixtures válidas e inválidas para dois tenants, incluindo concorrência e falha injetada, e comprovar um único objeto/registro elegível sem vazamento entre tenants.

### P1: Extrair e reprocessar texto nativo ⭐ MVP

**User Story**: Como gestor, quero acompanhar a extração e corrigir uma falha para que somente conteúdo realmente legível seja usado pelo agente.

**Why P1**: O texto extraído é o elo ausente entre o upload atual e o contexto conversacional.

**Acceptance Criteria**:

1. WHEN um documento `processando` contém texto nativo válido THEN the system SHALL extrair o texto, persistir o resultado vinculado ao tenant e mudar o estado para `pronto` ou `fora_do_agente` conforme o teto do corpus.
2. WHEN o formato é PDF, DOCX, TXT, Markdown ou CSV THEN the system SHALL produzir texto Unicode legível sem alterar palavras, números ou sinais presentes no conteúdo fonte.
3. IF o PDF é somente imagem ou o resultado normalizado não contém nenhum caractere visível THEN the system SHALL mudar o estado para `falha` com a razão `nenhum texto extraível`.
4. IF o extrator lança erro, excede seu tempo limite ou fica indisponível THEN the system SHALL mudar o estado para `falha`, preservar o original e mostrar uma mensagem que não exponha caminhos, credenciais ou stack trace.
5. WHILE o documento está `processando` or `falha` the system SHALL excluir seu texto do contexto do agente.
6. WHEN um administrador ou gestor solicita nova tentativa para um documento `falha` THEN the system SHALL reutilizar o original armazenado, mudar o estado para `processando` e iniciar exatamente uma nova execução.
7. WHEN duas solicitações concorrentes tentam reprocessar o mesmo documento THEN the system SHALL iniciar no máximo uma execução e devolver o mesmo estado observável às duas solicitações.
8. IF um corretor tenta reprocessar um documento THEN the system SHALL recusar a ação e preservar conteúdo, original e estado.
9. WHEN a nova tentativa conclui com texto legível THEN the system SHALL substituir o erro anterior pelo estado resultante e tornar o preview do texto disponível.
10. The system SHALL registrar etapa, duração, identificadores e erro sanitizado de cada processamento sem registrar o binário nem o texto extraído nos logs.

**Independent Test**: Processar uma fixture textual por formato, um PDF somente imagem, uma falha e duas tentativas concorrentes; verificar estados, texto, retry e ausência de conteúdo em logs.

### P1: Entregar o corpus elegível ao agente ⭐ MVP

**User Story**: Como imobiliária, quero que o agente receba as políticas e regras cadastradas para responder com base no conhecimento real do meu negócio.

**Why P1**: Este é o resultado de produto que justifica armazenamento e extração.

**Acceptance Criteria**:

1. WHEN o contrato de contexto é chamado com tenant autorizado, modalidade `novo`, `usado` ou `ambos` e uma `pergunta` não vazia THEN the system SHALL devolver o conteúdo integral de todos os documentos `pronto`, não expirados e compatíveis com a modalidade.
2. WHEN a modalidade pedida é `novo` THEN the system SHALL incluir documentos `novo` e `ambos` e excluir documentos exclusivamente `usado`.
3. WHEN a modalidade pedida é `usado` THEN the system SHALL incluir documentos `usado` e `ambos` e excluir documentos exclusivamente `novo`.
4. WHEN a modalidade pedida é `ambos` THEN the system SHALL incluir documentos `novo`, `usado` e `ambos` sem duplicar nenhum documento.
5. WHILE um documento está `processando`, `falha` or `fora_do_agente` the system SHALL excluí-lo do corpus entregue.
6. IF um documento atinge `expiresAt` antes da rotina diária THEN the system SHALL excluí-lo imediatamente do contexto, mesmo que o registro e o objeto ainda existam.
7. IF não existe documento elegível THEN the system SHALL devolver uma coleção vazia sem erro e sem reutilizar conteúdo de outro tenant.
8. WHEN a mesma modalidade e corpus são consultados com perguntas diferentes THEN the system SHALL devolver o mesmo conjunto ordenado de documentos no lote 12, pois `pergunta` ainda não filtra semanticamente.
9. IF `pergunta` está ausente ou vazia depois de `trim` THEN the system SHALL recusar a chamada com erro de validação definido no contrato.
10. The system SHALL separar cada documento no contexto com identificador e nome suficientes para o agente atribuir a origem sem misturar os textos.
11. The system SHALL ordenar o corpus pronto do upload mais antigo para o mais recente, com identificador como desempate determinístico.
12. IF a autenticação de serviço ou o tenant da chamada é inválido THEN the system SHALL recusar a leitura sem devolver metadado, texto, contagem ou indício de documentos.
13. WHEN o workflow conversacional solicita contexto THEN the system SHALL encaminhar a pergunta real do lead e disponibilizar ao modelo o conteúdo retornado antes de gerar a resposta.

**Independent Test**: Criar documentos com modalidades, estados, validades e tenants distintos; chamar o contrato em `novo`, `usado` e `ambos` com duas perguntas e comprovar conjunto, ordem, ausência de duplicação, isolamento e conteúdo recebido pelo workflow.

### P1: Aplicar o teto seguro sem truncamento silencioso ⭐ MVP

**User Story**: Como operador do piloto, quero saber o limite real da injeção direta e impedir que o agente receba um corpus incompleto sem aviso.

**Why P1**: A injeção direta só é segura se seu limite for medido e convertido em regra observável.

**Acceptance Criteria**:

1. WHEN o benchmark do lote é executado THEN the system SHALL registrar o modelo e o workflow publicados, a data, os tamanhos de corpus, os tokens de entrada, a latência observada e o custo estimado de cada faixa.
2. WHEN o teto seguro é calculado THEN the system SHALL reservar capacidade para prompt do sistema, histórico de conversa, pergunta do lead e chamadas de ferramenta, documentando a fórmula e a margem usadas.
3. The system SHALL persistir tetos explícitos e reproduzíveis para os corpora `novo`, `usado` e `ambos` de cada tenant, expressos na mesma unidade usada para admitir documentos.
4. The system SHALL considerar um documento `pronto` somente quando ele couber integralmente em todos os corpora de consulta dos quais sua modalidade participa.
5. WHEN um novo texto faria qualquer corpus elegível exceder seu teto THEN the system SHALL preservar original e texto, marcar somente esse documento como `fora_do_agente` e manter todos os documentos previamente `pronto` no corpus.
6. IF um único documento excede sozinho qualquer teto aplicável THEN the system SHALL marcá-lo como `fora_do_agente` sem truncar seu texto e sem remover o original.
7. WHILE um documento está `fora_do_agente` the system SHALL mostrar no CRM a razão do estado e permitir preview do texto e download do original.
8. WHEN exclusão, expiração ou mudança de modalidade libera capacidade THEN the system SHALL reavaliar os documentos `fora_do_agente` do mais antigo para o mais recente e promover todo documento que caiba integralmente em todos os tetos aplicáveis.
9. IF o documento mais antigo fora do agente não cabe e um posterior cabe THEN the system SHALL manter o mais antigo fora e avaliar os posteriores na ordem, sem ultrapassar nenhum teto.
10. The system SHALL nunca cortar o texto de um documento nem retornar um subconjunto não sinalizado para satisfazer o teto.
11. WHEN o modelo, o workflow ou a composição fixa do prompt muda THEN the system SHALL sinalizar o benchmark como desatualizado até que o teto seja medido novamente.
12. WHEN um corpus real ultrapassa o teto THEN the system SHALL registrar esse fato como gatilho mensurável para o lote condicional de RAG, sem ativar busca vetorial neste lote.

**Independent Test**: Configurar um teto pequeno, processar documentos em sequência e verificar bloqueio, preservação, preview, promoção automática, encaixe posterior e zero truncamento.

### P1: Visualizar e baixar com o mesmo isolamento ⭐ MVP

**User Story**: Como usuário autorizado, quero conferir o texto que o agente pode usar e recuperar o arquivo original sem acessar documentos de outra imobiliária.

**Why P1**: A imobiliária precisa auditar a fonte do agente e conservar acesso ao original enviado.

**Acceptance Criteria**:

1. WHEN um usuário com `documentos:ler` abre um documento `pronto` THEN the system SHALL mostrar dentro do CRM o texto extraído integral associado àquele documento.
2. WHEN um usuário com `documentos:ler` abre um documento `fora_do_agente` THEN the system SHALL mostrar o texto extraído e um aviso de que o limite de conteúdo impede seu uso pelo agente.
3. WHILE um documento está `processando` or `falha` the system SHALL ocultar a ação de preview textual e explicar o estado atual.
4. WHEN um usuário com `documentos:ler` solicita download de um original armazenado e não expirado THEN the system SHALL entregar os mesmos bytes enviados com nome seguro e disposição de anexo.
5. IF o usuário pede preview ou download de um documento de outro tenant THEN the system SHALL responder como documento inexistente sem revelar nome, tipo, estado, tamanho ou validade.
6. IF o usuário não possui `documentos:ler` THEN the system SHALL recusar preview e download sem gerar URL ou token reutilizável.
7. IF o documento está expirado, excluído ou não possui objeto válido THEN the system SHALL recusar preview e download com mensagem segura e sem retornar conteúdo parcial.
8. WHEN o acesso ao original usa uma URL temporária THEN the system SHALL limitar a URL ao documento autorizado e fazê-la expirar em no máximo 5 minutos.
9. The system SHALL renderizar o preview como texto inerte, sem executar HTML, Markdown ativo, macro, script ou link automático proveniente do arquivo.

**Independent Test**: Visualizar e baixar como gestor e corretor, tentar escrita como corretor e repetir preview/download com outro tenant, documento expirado e conteúdo com HTML/script literal.

### P1: Excluir linha, texto e arquivo como uma unidade ⭐ MVP

**User Story**: Como gestor, quero definir validade ou excluir um documento para que nenhuma cópia utilizável permaneça no agente ou no storage.

**Why P1**: Persistir o binário sem estender o ciclo de vida existente criaria retenção invisível e incoerente.

**Acceptance Criteria**:

1. WHEN um administrador ou gestor cria ou edita um documento THEN the system SHALL aceitar uma data futura de validade ou o valor explícito `sem validade`.
2. IF a validade informada não é uma data válida ou não está no futuro THEN the system SHALL recusar a gravação e preservar a validade anterior, o conteúdo e o original.
3. WHEN `expiresAt` é alcançado THEN the system SHALL bloquear contexto, preview e download daquele documento no mesmo instante lógico.
4. WHEN a rotina diária encontra documento com `expiresAt` menor ou igual ao instante da execução THEN the system SHALL remover registro, texto extraído e original em até 24 horas após a expiração.
5. IF a exclusão do original falha durante a expiração THEN the system SHALL manter ou criar uma pendência de remoção e tentar novamente sem tornar o documento acessível.
6. WHEN um administrador ou gestor confirma a exclusão manual THEN the system SHALL tornar imediatamente inacessíveis o registro, o texto e o original e concluir ou enfileirar a remoção física.
7. IF a exclusão manual é solicitada por corretor THEN the system SHALL recusar a ação e preservar registro, texto e original.
8. IF duas exclusões concorrentes atingem o mesmo documento THEN the system SHALL produzir o mesmo estado final ausente sem restaurar objeto ou conteúdo.
9. IF uma tentativa de processamento termina depois que o documento foi excluído ou expirou THEN the system SHALL descartar o resultado e nunca recriar nem reativar o documento.
10. WHEN uma remoção física pendente é concluída THEN the system SHALL apagar a pendência e registrar somente identificadores e resultado sanitizados.
11. The system SHALL aplicar exclusão e expiração ao tenant proprietário sem afetar documentos, objetos ou contagens de outro tenant.

**Independent Test**: Expirar e excluir fixtures com storage bem-sucedido, falha injetada e processamento atrasado; verificar inacessibilidade imediata, retry da remoção e ausência final em banco e storage.

### P1: Provar o percurso real até a resposta do agente ⭐ MVP

**User Story**: Como responsável pelo produto, quero uma prova ponta a ponta de que um fato existente somente em documento chega à resposta do agente.

**Why P1**: Testes isolados não demonstram que storage, extração, contrato e workflow publicado estão conectados.

**Acceptance Criteria**:

1. WHEN uma fixture de tenant contém um fato exclusivo em documento `pronto` THEN the system SHALL entregar esse fato pelo contrato de contexto e torná-lo disponível ao workflow conversacional publicado.
2. WHEN um lead pergunta pelo fato exclusivo THEN the system SHALL responder de forma compatível com o texto do documento sem inventar valor contraditório.
3. IF o mesmo documento pertence a outro tenant THEN the system SHALL responder sem usar nem revelar o fato exclusivo externo.
4. WHILE o documento está `processando`, `falha`, `fora_do_agente` or expirado the system SHALL responder sem usar o fato exclusivo desse documento.
5. WHEN a prova real é concluída THEN the system SHALL registrar identificadores verificáveis da execução, estados observados e resposta, sem copiar credenciais ou o corpus integral para a evidência.

**Independent Test**: Enviar um documento de teste, aguardar `pronto`, conversar com o agente publicado e repetir os controles cross-tenant e de estado inelegível.

## Edge Cases

- IF o navegador repete o envio após perder a resposta THEN the system SHALL convergir para um único documento pelo hash do binário.
- IF o nome do arquivo contém caminho, controle ou caractere inválido para cabeçalho THEN the system SHALL armazenar um nome seguro sem alterar os bytes do original.
- IF a extração produz somente espaços, controles ou marcação vazia THEN the system SHALL tratar o resultado como `nenhum texto extraível`.
- IF o documento muda de modalidade e deixa de disputar capacidade no corpus anterior THEN the system SHALL recalcular os conjuntos afetados sem ultrapassar o teto de nenhum deles.
- IF storage ou extrator fica indisponível temporariamente THEN the system SHALL falhar de forma observável e permitir retomada sem duplicar o documento.
- IF uma URL temporária é reutilizada depois de expirar THEN the system SHALL negar o download.
- IF o cron roda exatamente no instante `expiresAt` THEN the system SHALL incluir o documento na remoção, cobrindo a fronteira `expiresAt <= now`.
- IF um documento vencido ainda aguarda remoção física THEN the system SHALL permanecer inacessível em todos os caminhos de leitura.

## Implicit-Requirement Dimensions Sweep

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | DOCBIN-01 e DOCLIFE-01 fixam formatos, faixa de tamanho, coerência de tipo, validade e pergunta não vazia. |
| Failure / partial-failure states | DOCBIN-01, DOCTXT-01 e DOCLIFE-01 exigem compensação, estados observáveis e remoção pendente. |
| Idempotency / retry / duplicate handling | Hash por tenant, unicidade concorrente, retry único de extração e exclusão idempotente estão cobertos. |
| Auth boundaries & rate limits | A matriz existente governa leitura/escrita; URLs temporárias são curtas. Rate limit adicional é N/A porque o CRM autenticado mantém os controles atuais e o lote não cria API pública. |
| Concurrency / ordering | Upload duplicado, retry, exclusão tardia e promoção por antiguidade têm resultados determinísticos. |
| Data lifecycle / expiry | DOCLIFE-01 cobre bloqueio imediato, cron em até 24 horas e retry de remoção física. |
| Observability | DOCTXT-01, DOCLIM-01 e DOCLIFE-01 registram medição e falhas sem conteúdo sensível. |
| External-dependency failure | Falhas de storage e extração produzem compensação, pendência ou retry sem documento parcialmente utilizável. |
| State-transition integrity | `processando` só segue para `pronto`, `fora_do_agente` ou `falha`; exclusão/expiração são terminais e resultado tardio é descartado. |

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| DOCBIN-01 | P1: Armazenar o arquivo real com segurança | T1, T3–T9, T17, T23, T29, T31–T32, T37 | Implementing — T1, T3–T9, T17 complete; T23 implementado, evidência visual em T32 |
| DOCTXT-01 | P1: Extrair e reprocessar texto nativo | T1–T4, T10–T15, T25–T26, T30, T32, T37 | Implementing — T1–T4, T10–T15 complete |
| DOCCTX-01 | P1: Entregar o corpus elegível ao agente | T4, T12, T20–T22, T28, T33, T35–T37 | Implementing — T4, T12, T20–T22 complete |
| DOCLIM-01 | P1: Aplicar o teto seguro sem truncamento silencioso | T3–T4, T12–T13, T20, T24–T25, T27, T32, T34, T37 | Implementing — T3–T4, T12–T13 complete |
| DOCVIEW-01 | P1: Visualizar e baixar com o mesmo isolamento | T6–T7, T15–T18, T23–T25, T27, T29, T32, T37 | Implementing — T6–T7, T15–T18 complete |
| DOCLIFE-01 | P1: Excluir linha, texto e arquivo como uma unidade | T3–T8, T13, T15, T17–T19, T23, T25, T27, T31–T32, T37 | Implementing — T3–T8, T13, T15, T17–T19 complete; T23 implementado, evidência visual em T32 |
| DOCPROVA-01 | P1: Provar o percurso real até a resposta do agente | T21, T28, T33, T35–T37 | Implementing — T21 complete |

**Coverage:** 7 requisitos, 7 mapeados para tasks, 0 sem cobertura; execução em andamento (Batch 1, T1–T6, concluído).

## Success Criteria

- [ ] Um arquivo textual de cada formato suportado chega ao estado final esperado e pode ser baixado byte a byte igual ao original.
- [ ] Um fato existente somente em documento `pronto` aparece numa resposta real do agente do tenant correto e não aparece nos controles inelegível e cross-tenant.
- [ ] O benchmark publica um teto reproduzível com tokens, latência, custo estimado, margem e identidade do modelo/workflow.
- [ ] Nenhum cenário de upload, retry, expiração ou exclusão deixa conteúdo acessível sem registro autorizado ou objeto permanente sem compensação.
- [ ] Preview e download obedecem à matriz de papéis e retornam inexistente para tentativas cross-tenant.
- [ ] O gate automatizado, a prova conversacional e o Verifier independente encerram o lote com PASS.
