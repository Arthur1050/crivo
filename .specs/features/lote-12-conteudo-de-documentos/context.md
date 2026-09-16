# Lote 12 — Conteúdo de documentos chega ao agente — Contexto

**Coletado em:** 2026-09-15  
**Spec:** `.specs/features/lote-12-conteudo-de-documentos/spec.md`  
**Status:** Design aprovado — consolidado em `design.md`

---

## Limite da feature

O lote 12 transforma os documentos de contexto, hoje limitados a metadados, em uma fonte real de conhecimento não-inventário para o agente: armazena o arquivo original, extrai o texto, entrega o conteúdo pronto e não expirado ao fluxo conversacional, mede e aplica o teto seguro da injeção direta e permite visualizar o texto extraído e baixar o original no CRM.

O conteúdo deste lote cobre políticas de financiamento, documentação exigida, condições de pagamento, regulamentos e conhecimento equivalente. O catálogo estruturado de imóveis permanece no lote 11; busca vetorial/RAG fica condicionada à medição deste lote; a vitrine pública permanece no lote 16.

---

## Decisões de implementação

### Processamento e estados

- O processamento é assíncrono.
- Depois que o original é armazenado, o documento aparece como **Processando**.
- Somente documentos **Prontos** entram no contexto do agente.
- Falha de extração mantém o original armazenado, mostra **Falha** com uma explicação segura e oferece nova tentativa sem exigir outro upload.
- O download do original fica disponível assim que o armazenamento termina, inclusive nos estados **Processando** e **Falha**.
- O preview do texto fica disponível nos estados **Pronto** e **Fora do agente — limite de conteúdo excedido**. Não existe texto visualizável em **Processando** ou **Falha**.

### Formatos e extração

- O lote mantém os formatos já aceitos: PDF, DOCX, TXT, Markdown e CSV, com limite atual de 10 MB por arquivo.
- A extração cobre texto nativo desses formatos.
- PDF escaneado ou qualquer arquivo sem texto legível termina em **Falha — nenhum texto extraível**.
- OCR não faz parte deste lote.
- A implementação usará `unpdf` para PDF, `mammoth.extractRawText` para DOCX e decodificação controlada para TXT, Markdown e CSV.
- A normalização removerá BOM, unificará quebras de linha e aparará apenas as extremidades, preservando palavras, números, pontuação, delimitadores e quebras internas.
- Os limites técnicos iniciais serão: 500 páginas e imagens declaradas de até 16 megapixels em PDF; 2.000 entradas e 50 MiB descompactados em DOCX; 20 MiB de texto UTF-8 extraído; 45 segundos por tentativa e três tentativas automáticas para falhas transitórias.
- Binário e texto não serão transportados como entrada ou retorno entre etapas do Workflow; somente identificadores e métricas pequenas entrarão no histórico durável.

### Conteúdo entregue ao agente

- A injeção direta aceita consultas `novo`, `usado` e `ambos`: `novo` inclui documentos `novo + ambos`, `usado` inclui `usado + ambos`, e `ambos` inclui todos os documentos compatíveis.
- `getContext` passa a receber `pergunta`, mas o lote 12 não faz filtragem semântica: a pergunta prepara a interface estável que uma futura busca vetorial poderá implementar sem mudar consumidores.
- O sistema não trunca nem omite silenciosamente uma parte do corpus.
- O contrato externo passará a ser `POST /api/v1/context`, com corpo JSON contendo `modality` e a pergunta real do lead, evitando dados pessoais em URL; tenant e autenticação continuam fora do controle do modelo.
- A resposta terá envelope com `retrievalMode: direct`, coleção ordenada de documentos, `contentMode: full` e texto integral; a forma prepara uma futura implementação `rag` com excertos sem trocar o endpoint consumidor.
- O n8n enviará pergunta, modalidade e tenant a partir do estado determinístico de `Code: gate`; o agente continuará decidindo somente quando chamar a ferramenta.

### Teto de injeção direta

- O lote mede o teto seguro do corpus para o modelo e o workflow efetivamente publicados, registrando janela, custo e latência observados.
- Se a inclusão de um documento ultrapassar esse teto, o original e o texto extraído são preservados e o documento recebe o estado **Fora do agente — limite de conteúdo excedido**.
- Documentos que já estavam **Prontos** mantêm prioridade; um upload novo não os remove do agente.
- Quando houver espaço novamente, documentos fora do agente voltam automaticamente a **Pronto**, do upload mais antigo para o mais recente.
- O recálculo continua avaliando candidatos posteriores quando um documento mais antigo não cabe integralmente.
- Haverá tetos separados para as consultas `novo`, `usado` e `ambos`. Um documento só fica **Pronto** quando cabe em todos os corpora de consulta dos quais participa; caso contrário, fica integralmente fora do agente.
- `pergunta` será um parâmetro obrigatório da consulta, não uma modalidade nem um filtro semântico no lote 12.
- A unidade de admissão será o tamanho em bytes UTF-8 da resposta JSON canônica; o benchmark correlacionará essa medida com tokens reais reportados pelo modelo publicado.
- O teto final será o menor limite aprovado por qualidade e latência, margem da janela do modelo, transporte da Vercel e uma observação repetida da ferramenta.
- Modelo, workflow, system message, janela de memória ou catálogo de tools alterado marcará o benchmark como desatualizado sem ampliar automaticamente o teto anterior.
- Ultrapassar o teto medido é o gatilho objetivo para planejar o lote condicional de RAG; RAG não será implementado aqui.

### Persistência e transições

- O PostgreSQL guardará o texto extraído integral, além de metadados, status, hash verificado, tentativa vigente e chave opaca do original no Blob.
- Intenções de upload serão temporárias e invisíveis na listagem; somente o documento confirmado no Blob entrará em `documents`.
- Exclusão usará um tombstone interno para bloquear acesso e apagar o texto imediatamente, conservando a chave do Blob somente até a remoção física idempotente terminar.
- Toda conclusão de processamento exigirá correspondência entre documento, tentativa e estado esperado, além de documento ativo e não expirado; resultados atrasados serão no-op.

### Preview, download e permissões

- **Visualizar** abre dentro do CRM o texto extraído que o agente pode consumir, com aviso explícito quando o documento está fora do agente por limite.
- **Baixar original** entrega o binário intacto em uma ação separada.
- A matriz atual continua válida: administrador e gestor podem criar, editar, reprocessar e excluir; corretor pode listar, visualizar e baixar, sem escrita.
- Toda leitura e escrita permanece isolada pela imobiliária ativa e autorizada.
- A tabela continuará densa e ganhará estado textual com `StatusDot`; a validade mostrará data e hora exatas.
- O preview será carregado sob demanda em dialog fullscreen como texto puro inerte, nunca enviado junto da listagem nem interpretado como HTML ou Markdown.
- O download passará por route handler autenticado com streaming, `Content-Disposition: attachment`, `nosniff` e `Cache-Control: private, no-store`; nenhuma URL permanente ou credencial do Blob chegará ao cliente.
- O bloqueio imediato significa que nenhum novo acesso será autorizado após exclusão ou expiração; bytes já baixados ou um stream iniciado anteriormente não podem ser revogados retroativamente.

### Duplicação e ciclo de vida

- Uma impressão digital do binário impede o mesmo arquivo de ser cadastrado duas vezes na mesma imobiliária.
- Duplicata exata informa qual documento já existe e orienta a editar o registro existente.
- Arquivos com o mesmo nome e conteúdo diferente continuam permitidos.
- A validade passa a ser opcional no upload e na edição; **Sem validade** continua sendo o padrão.
- No instante de expiração, o documento deixa de entrar no contexto e de permitir preview/download.
- A rotina diária remove definitivamente o registro e o original expirados em até 24 horas.
- A exclusão manual continua imediata e permanente após a confirmação já existente, removendo registro e original.
- Exclusão e expiração usarão tombstone interno: acesso e texto somem primeiro, o Blob é removido de forma idempotente e a linha física só desaparece depois da confirmação; falhas externas permanecem inacessíveis e entram em retry.

### Storage e ambiente

- Os arquivos originais serão armazenados em um Vercel Private Blob localizado em Frankfurt.
- O upload será feito diretamente do navegador para o Blob, com autorização curta e limitada ao objeto esperado, evitando trafegar arquivos de até 10 MB pelo limite de corpo das Vercel Functions.
- O domínio acessará o Blob por uma interface de storage e persistirá somente chaves opacas e metadados do objeto, preservando uma rota de migração futura.
- Uma intenção curta de upload reservará `tenant + SHA-256` antes do envio; o navegador calculará o hash para resposta imediata e o processamento o recalculará sem confiar no cliente.
- O processamento assíncrono será executado por Vercel Workflow com semântica de pelo menos uma vez; transições condicionais por documento e tentativa impedirão que retries ou resultados atrasados corrompam o estado.
- O documento só ficará visível como **Processando** depois que o Blob confirmar o armazenamento do original.
- O Hetzner CX23 permanecerá fora do caminho de armazenamento e processamento deste lote; seguirá dedicado ao n8n e ao PostgreSQL do n8n.
- O plano Hobby será usado somente para desenvolvimento e validação não comercial. Um plano Vercel compatível com uso comercial será pré-requisito antes da entrada de clientes pagantes.

### Discrição do agente

- Definir a normalização técnica do texto sem alterar fatos, números ou a separação identificável entre documentos.
- Definir o benchmark reprodutível e a margem técnica do teto, preservando espaço para prompt do sistema, histórico, pergunta e chamadas de ferramenta.
- Definir mensagens curtas e seguras para falhas técnicas, sem expor credenciais, caminhos internos ou conteúdo extraído em logs.

### Áreas não discutidas convertidas em premissas

- Não haverá versionamento nem substituição do binário no lote 12; para trocar conteúdo, o usuário envia um novo arquivo e exclui o anterior.
- Não haverá antivírus externo no piloto controlado; formatos executáveis continuam recusados e downloads usarão disposição de anexo.
- Uma falha parcial entre storage, banco e processamento nunca ficará visível como documento utilizável; o Design deverá garantir compensação ou retomada determinística.
- O teto será específico do modelo/workflow publicado e deverá ser recalculável quando um deles mudar.

### Transição dos registros atuais

- Os documentos existentes foram criados pelo fluxo metadata-only e não possuem binário, texto extraído nem objeto recuperável.
- Esses registros serão descartados na migração do lote 12; categorias, tenant e configurações serão preservados.
- O seed deixará de criar documentos fictícios. Testes usarão fixtures isoladas e a verificação do produto fará uploads reais em ambiente conectado ao Blob.

---

## Referências específicas

- O preview deve mostrar o mesmo texto que pode chegar ao agente, não uma representação visual independente do arquivo.
- Conteúdo de inventário de imóveis não deve voltar a documentos; o lote 11 já o tornou estruturado e consultável por SQL.
- O arquivo fora do agente por limite deve permanecer gerenciável e legível no CRM, sem truncamento silencioso.

---

## Ideias adiadas

- Quando o produto tiver uma dinâmica de notificações, avisar os usuários responsáveis que o arquivo identificado será apagado permanentemente em determinado número de horas. O lote 12 preserva nome e instante exato de expiração para viabilizar esse aviso futuro, mas não cria notificações.
- OCR para PDFs escaneados.
- Busca vetorial/RAG, condicionada ao teto medido neste lote.
- Vitrine pública do catálogo, mantida no lote 16.
