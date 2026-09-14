# Catálogo de imóveis — Evidência

## §1 — Piso de testes (T1)

Medido em árvore limpa, nesta janela (2026-09-10), antes de qualquer mudança do lote-11 —
não copiado do Handoff do lote-10.

- `git status --porcelain` vazio antes da medição — confirmado.
- `npx vitest run`: **1076 testes passaram, 0 falharam, 82 arquivos de teste**.
- `npm run lint`: **0 erros, 3 avisos** — todos pré-existentes e esperados:
  - `n8n/generated/scheduler.ts:32:35` — `'ifElse' is defined but never used`
  - `n8n/workflows/scheduler.ts:32:35` — `'ifElse' is defined but never used`
  - `src/server/integration/__tests__/route-instrumentation.test.ts:60:7` — `Unused eslint-disable directive`
- `npm run build`: **exit 0**. Todas as rotas compilaram (20 rotas do app + proxy/middleware).
  Os `BetterAuthError`/warnings de `BETTER_AUTH_SECRET`/`baseURL` no log de build são ruído
  pré-existente da geração estática sem env de produção — não bloqueiam o build (exit 0) e não
  são deste lote.

Piso registrado: **1076 testes / 82 arquivos / lint 0 erros+3 avisos / build exit 0**. Este é o
número contra o qual toda task subsequente do lote-11 deve subir monotonicamente.

---

## §20 — Evidência visual da tela `/imoveis` (T20)

Capturas reais via `mcp__claude-in-chrome__*` (extensão Chrome), nunca o painel embutido nem
inspeção de DOM. Servidor: `npm run dev` (dev server local, porta 3000), banco de dev seedado com
`npm run db:seed`. Imagens em `.specs/features/lote-11-catalogo-de-imoveis/evidencia/`.

**Login real.** O seed só grava credencial (linha em `accounts`) para o administrador via
`npm run db:create-admin` — gestor e corretor nascem em estado de convite pendente, sem senha
(design.md). Para logar de verdade como gestor e como corretor, duas contas de teste
(`gestor.t20@local.test`, `corretor.t20@local.test`) foram criadas via
`POST /api/auth/sign-up/email` do próprio dev server e vinculadas ao tenant `vale-uberaba` com o
papel correspondente. As duas contas foram removidas do banco de dev ao final da captura — nenhum
usuário do seed foi tocado.

**Tema.** O app não tem toggle de tema — `astryx.css` resolve `light-dark()` pelo atributo
`data-theme` do `<html>` (`html[data-theme="light"] { color-scheme: light }` /
`[data-theme="dark"]`, `node_modules/@astryxdesign/theme-neutral/dist/theme.css:80-82`), e sem o
atributo segue `prefers-color-scheme` do SO — que nesta máquina é escuro. Setar
`document.documentElement.setAttribute('data-theme', 'light')` via `javascript_tool` força o mesmo
branch que o próprio app usaria se tivesse um toggle — não é alteração de UI, é a mesma chave que
o CSS do design system já expõe.

| # | Arquivo | Papel / tema | O que prova |
| --- | --- | --- | --- |
| 1 | `evidencia/t20-01-gestor-claro-catalogo.jpg` | Gestor, tema claro | Botão **Novo imóvel** e toda a barra de filtros visíveis no viewport capturado. A tabela tem mais colunas do que cabem nesse recorte — a barra de scroll horizontal no rodapé mostra isso — e a coluna **Ações** fica fora da área capturada nesta imagem. Ver #5 para a prova da coluna Ações. |
| 2 | `evidencia/t20-02-corretor-claro-catalogo.jpg` | Corretor, tema claro | Mesma tela, mesmo inventário (4 imóveis, os mesmos preços e status) — **sem** botão de criar. Este recorte, por si só, não distingue "coluna Ações ausente" de "coluna Ações fora da área capturada" (o mesmo corte de tabela que afeta #1); ver #6 para a distinção real. |
| 3 | `evidencia/t20-03-dialogo-cadastro-claro.jpg` | Gestor, tema claro | Diálogo **Novo imóvel** aberto (`property-form-dialog.tsx`, T17): Captador/Tipo/Modalidade/Status obrigatórios, switch de Publicado, nenhum campo de Referência (só existe na edição), campos de endereço opcionais. |
| 4 | `evidencia/t20-04-gestor-escuro-catalogo.jpg` | Gestor, tema escuro | A mesma tela do #1 com `data-theme="dark"` — confirma que a tabela, os badges de publicação e o `StatusDot` de status seguem os tokens de cor do tema escuro sem quebrar layout. Mesmo corte de tabela que #1 — coluna Ações também fora da área capturada aqui. |
| 5 | `evidencia/t20-01b-gestor-claro-acoes-visiveis.jpg` | Gestor, tema claro | Mesma tela do #1, tabela rolada horizontalmente até o fim (o monitor desta máquina é 1440px de largura — mais estreito que os 1600–1800px pedidos originalmente — então a rolagem, não o redimensionamento de janela, foi o jeito de trazer a coluna à vista). A coluna **Ações** aparece nas 4 linhas, cada uma com um botão "Ações" que abre `DropdownMenu` (editar/excluir) — prova real de `IMOV-04 AC1`. |
| 6 | `evidencia/t20-02b-corretor-claro-sem-acoes.jpg` | Corretor, tema claro | Mesma tela do #2, mesma rolagem até o fim. A última coluna visível é **Publicação** — não há coluna Ações nenhuma depois dela, nem vazia: `properties-table.tsx` só executa `columns.push({ key: "actions", ... })` quando `canWrite` é verdadeiro (`src/components/properties/properties-table.tsx:176-203`), então para o corretor a célula nunca é montada, não é apenas ocultada. Esta é a prova real de `IMOV-04 AC2`. |

**Desfecho:** as seis capturas confirmam o comportamento esperado por IMOV-01/IMOV-04/IMOV-05 —
gestor com controle completo (incluindo o menu de linha, #5), corretor em leitura pura sem a coluna
de ações existir no DOM (#6), diálogo único de cadastro/edição, e paridade visual entre os dois
temas. Nenhuma foi obtida por inspeção de DOM; todas são renderização real do dev server via login
de sessão real.

**Correção (mesma T20, registrada depois do commit original):** as capturas #1/#2/#4 originais não
mostravam a coluna Ações — ela ficava fora do viewport capturado, cortada pela barra de scroll
horizontal visível no rodapé das duas primeiras imagens — mas o texto desta tabela, na sua versão
anterior, afirmava que a captura 1 mostrava "coluna Ações (editar/excluir)" visível. Isso não era
verdade: a evidência provava apenas a diferença do botão "Novo imóvel" entre os dois papéis, não a
diferença do menu de linha que `IMOV-04 AC1`/`AC2` exige. As capturas #5 e #6 acima, tiradas com a
tabela rolada até o fim (mesma sessão, mesmas contas de teste, mesmo tema), fecham essa lacuna: #5
mostra o menu de linha para o gestor, #6 confirma pelo código (não só pela imagem) que ele não
existe para o corretor.

---

## §24 — Publicação de `crivo-agente-principal` com `buscar_imoveis` (T24)

Workflow `crivo-agente-principal` (`0B1nqjODu7xuYYKF`), via MCP `update_workflow` + `publish_workflow`
— nenhuma edição pela UI (AD-014).

**Operações aplicadas** (tradução mecânica do que `n8n/generated/principal.ts` já declarava):

1. `addNode` `buscar_imoveis` (`httpRequestTool` v4.5, `GET /api/v1/properties`, 7 critérios via
   `$fromAI`, `X-Crivo-Tenant` por expressão do fluxo, `neverError`)
2. `setNodeSettings` em `buscar_imoveis`: `retryOnFail: true`, `maxTries: 2`
3. `addConnection` `buscar_imoveis` → `AI Agent` em `ai_tool`
4. `setNodeSettings` em `consultar_documentos`: `retryOnFail: true`, `maxTries: 2` — a fonte já tinha
   isso certo desde o commit `a80760c` (lote-10), mas a instância nunca tinha sido republicada depois
   desse fix; ficou pendurado até esta publicação
5. `updateNodeParameters` em `Code: montar system message e marcar campo perguntado`: `jsCode`
   substituído pelo conteúdo inteiro gerado (remove as duas cláusulas da fronteira, acrescenta
   `buscar_imoveis` ao catálogo)

Um segundo `update_workflow` foi necessário: a primeira chamada passou a credencial de
`buscar_imoveis` só por nome (`{httpHeaderAuth: {name: "Crivo - chave de servico"}}`) e o MCP devolveu
`"note": "HTTP Request nodes (buscar_imoveis) were skipped during credential auto-assignment"` — a
credencial não foi atribuída. Corrigido com `setNodeCredential` explícito (`credentialId`
`YhGcdfGtdEBBU9YP`, resolvido via `list_credentials`).

**Conferência antes de ativar (BUSCA-04 AC12)**: comparação estrutural completa entre o publicado
(`get_workflow_details`) e o gerado (`n8n/generated/principal.ts` via `toJSON()`), node a node:

| Item | Publicado | Gerado | Bate? |
| --- | --- | --- | --- |
| Nós | 62 | 62 | ✅ |
| Conexões | 76 | 76 | ✅ |
| Nós só num dos dois lados | nenhum | nenhum | ✅ |
| `buscar_imoveis` — parâmetros | (dump completo) | (dump completo) | ✅ idênticos |
| `buscar_imoveis` — `retryOnFail`/`maxTries` | `true`/`2` | `true`/`2` | ✅ |
| `buscar_imoveis` — conexão | `ai_tool` → `AI Agent` idx 0 | idem | ✅ |
| `consultar_documentos` — `retryOnFail`/`maxTries` | `true`/`2` | `true`/`2` | ✅ |
| `Code: montar system message...` — `jsCode` | 32290 chars | 32290 chars | ✅ **idêntico byte a byte** |
| `OpenAI Chat Model` — parâmetros | (dump completo) | (dump completo) | ✅ idênticos (AD-026, zero linhas tocadas) |

**Um achado sem relação com este lote, registrado e não corrigido**: `consultar_documentos` publicado
nunca teve o campo `method` declarado explicitamente (nem antes nem depois desta publicação) — o
schema do node (`get_node_types`) documenta `method` com `@default GET`, e a tool sempre fez `GET` na
prática (provado pela bateria de tool calling do lote-10). Divergência estrutural sem efeito funcional,
anterior a este lote e fora do escopo de T24 (que é publicar o que T23 gerou) — registrado para não
sumir, não corrigido aqui.

**Ativação**: `publish_workflow` → `activeVersionId` **`ccc29639-6a1c-4a92-b98a-df55146eee87`**.
Confirmado por `get_workflow_details` pós-publicação: `active: true`, `isArchived: false`,
`versionId == activeVersionId`, 62 nós.

**Avisos de validação em ambas as chamadas de `update_workflow`**: os mesmos 5 `SUBNODE_NOT_CONNECTED`
sobre os nós `Chat Memory Manager: *` já registrados no lote-10 (`n8n/smoke/evidencia.md` §5.4) —
pré-existentes, não relacionados a esta publicação.

**Nenhum outro workflow tocado** — a dívida cosmética do `crivo-tool-agendar-reuniao` (paridade
fonte × instância, lote-10 `evidencia.md`/`§14.7`) fica como está, fora do escopo deste lote.

---

## §26 — Retomada da prova de inventário (2026-09-13)

**T26 continua pendente.** T1–T25 estão commitadas. A correção T30 está no commit
`6a05fa1`, mas falta repetir o cenário com conversa nova. O `STATE.md` ainda descrevia
o lote-10; a retomada foi reconciliada com Git, tasks e leituras reais dos dois sistemas.

### Tentativa anterior e correção publicada

`get_execution` confirmou a execução `2266` do principal, em `2026-09-12T23:16:19Z`.
O agente chamou `buscar_imoveis` com `tipo=apartamento` e `bairro=Abadia`, mas a tool
recebeu `404`, `code=rota-inexistente`. Depois, `responder_lead` enviou a mensagem
dizendo que a busca não carregou e propôs "hoje às 16:30", embora fosse 20:16 de sábado
no fuso do tenant. Essa execução não prova sucesso do catálogo: o workflow terminou
`success`, mas a chamada HTTP devolveu erro. Há dois intermediate steps nessa execução
(`buscar_imoveis`, `responder_lead`); não são evidência de iterações da nova rodada.

A T30 corrigiu a iniciativa de busca e as propostas de horário no prompt.
`get_workflow_details` confirmou o principal ativo na versão
`e0a4f1b7-bee3-4a7d-bf50-0e01c2b6a07f`, salva em `2026-09-13T07:39:32Z`, com
62 nós e `maxIterations: 8`. O código publicado do nó de system message corresponde
ao artefato local após normalizar CRLF para LF (35.693 caracteres locais, 35.365
publicados). Não é igualdade byte a byte. A instância omite defaults presentes no
SDK, como `method: GET` da busca e `hasOutputParser: false` do agente, e materializa
`builtInTools: {}` no modelo; a retomada não alterou nem republicou nenhum workflow.

### Estado inicial recuperado

- `get_execution` confirmou o reset `2271`, workflow `rgf3t1cVsd2q0X0f`, em
  `2026-09-13T07:41:32Z`: purga de memória retornou `success: true`; o nó seguinte
  apagou a linha 31 de `conversa_estado`, do alvo `triangulo:553499532444`.
- `search_executions` do principal não mostrou mensagens posteriores ao reset.
- Consulta SQL em transação `READ ONLY` no CRM confirmou ausência do lead desse
  `externalId` em `triangulo`. Nenhum reset ou reseed foi executado nesta retomada.
- A primeira mensagem real ainda precisa confirmar lead novo, memória vazia e fase
  inicial de qualificação. Sucesso do reset não substitui essa checagem do roteiro §9.

### Catálogo atual e rota publicada

Consulta SQL `READ ONLY` confirmou os quatro imóveis do tenant:

| Referência | Tipo / modalidade | Bairro / cidade | Preço | Status / publicação | Visível à tool |
| --- | --- | --- | --- | --- | --- |
| IM-0001 | apartamento / novo | Abadia / Uberlândia | R$ 380.000 | disponível / publicado | Sim |
| IM-0002 | casa / usado | Fabrício / Uberlândia | R$ 520.000 | disponível / não publicado | Não |
| IM-0003 | cobertura / novo | Leblon / Uberlândia | R$ 890.000 | reservado / publicado | Não |
| IM-0004 | sobrado / usado | Mercês / Uberlândia | R$ 610.000 | vendido / não publicado | Não |

Critério positivo preparado: apartamento na Abadia. Critério negativo preparado:
apartamento no bairro Centro, ausente desse catálogo. Não presumir Uberaba: a cidade
atualmente gravada para esses imóveis é Uberlândia.

Na URL que a tool usa, `OPTIONS /api/v1/properties` retornou `204` e `Allow` com
`GET`; uma rota inexistente de controle retornou `404 rota-inexistente`. `GET` sem
credencial retornou `401 nao-autenticado`, como esperado. Isso confirma que a rota
existe no deploy atual, mas não prova busca autenticada com a credencial do n8n.
Essa confirmação depende da próxima conversa. O conector Vercel não permitiu ler
o projeto (`403`); nenhum status de deployment foi inferido desse erro.

### Próximo passo

Usuário envia saudação e interesse genérico pelo próprio WhatsApp. Conferir primeiro
turno no n8n antes de pedir o critério positivo; depois executar o critério sem
resultado. Registrar referência/preço, ausência, campos não divulgados, chamadas do
modelo e captura real da conversa. T27, T28, T29 e o Verifier permanecem pendentes.

O gate estrutural da retomada encontrou o título `T30 (fix):` fora do formato aceito
pelo parser (`T30:`), fazendo sua dependência ser atribuída à T29. Corrigidos o título
e os mapas da T30, sem mudar o escopo aprovado. `validate_tasks.py`: exit 0, 30 tasks
reconhecidas; 15 avisos de `Tests: none`, correspondentes às camadas sem teste direto.

### Gates locais da retomada

- `npm run lint`: exit 0, 0 erros e os mesmos 3 avisos pré-existentes.
- `npm run build`: exit 0; `/imoveis` e `/api/v1/properties` aparecem entre as rotas
  compiladas. Avisos de Better Auth durante a coleta de páginas são os já registrados
  em §1; não equivalem a teste de login em produção.
- `git diff --check`: sem erro; seção Decisions do STATE preservada integralmente.
- `npx vitest run`: iniciado em 2026-09-13 às 22:38, ainda em execução ao registrar
  este snapshot. Resultado e contagem pendentes; não conta como gate aprovado.

---

## §26.1 — Conversa real de 2026-09-14: inventário funciona, prova ainda incompleta

**T26 permanece aberta.** O usuário conduziu sete turnos reais. A leitura do CRM em
transação `READ ONLY` confirmou 14 mensagens, lead novo `038b679d-510f-418d-8cfa-0ee50532df11`,
`status=em_qualificacao`, `meetingAt=null` e responsável nulo. Nenhum reset foi feito
depois da conversa, preservando a evidência. Todos os IDs abaixo foram confirmados
com `get_execution`, não apenas com a listagem.

| Execução | Mensagem do lead | Resultado observado |
| --- | --- | --- |
| 2272 | Boa tarde! Como vai? | Apresentou Lucas/Triângulo, mas ignorou “Como vai?” e pediu o que procura. Fase qualificando; 1 intermediate step. |
| 2278 | Procuro algo no bairro Abadia | Primeiro GET foi recusado (400) por filtros vazios/zero. Repetiu com somente bairro=Abadia, retornou IM-0001 por R$ 380.000,00; resposta enviada omitiu referência. 4 steps. |
| 2284 | E fora do bairro Abadia? | Pediu cidade, faixa de preço e quartos em vez de aproveitar para oferecer ajuda do corretor. Fase já agendando; 3 steps. |
| 2291 | Uberaba | Busca cidade=Uberaba retornou imoveis=[], total=0. Declarou ausência, mas perguntou se deve retirar limites de quartos/preço que não foram enviados. 3 steps. |
| 2297 | Acho q gostei da opção do bairro abadia | Enviou proposta de hoje 14:30 e chamou agendar_reuniao no mesmo turno sem aceite de horário; erro de credencial. 5 steps. |
| 2307 | Prefiro amanhã as 15h | Tentou 2026-09-15 15:00 -03:00; credencial recusada novamente. Resposta enviada prometeu “assim que voltar, eu confirmo”. 1 step; contingência enviou a resposta. |
| 2313 | Ok | Pediu alternativa de horário em caso de a confirmação não abrir, embora falha de OAuth não seja resolvida por trocar horário. 2 steps. |

Contagens são **intermediate steps de tools**, não uma medição direta das iterações
internas do modelo. O máximo observado foi 5 calls no turno 2297; não há indicação de
estouro de `maxIterations` nesses resultados. Não substituir o critério de medição
da T26 por essas contagens sem essa ressalva.

**Desfecho de inventário**: consulta autenticada positiva e negativa comprovadas.
O preço citado corresponde ao banco, mas a referência não chegou ao lead. Portanto,
PROVA-02 AC3 ainda não passou integralmente. Falta também captura real da conversa;
transcrição SQL e outputs de execução não são screenshot.

**Erro de agendamento**: `get_execution` confirmou 2305 (pai 2297) e 2308 (pai 2307).
Ambas encerraram `error` no nó `Google Calendar: availability`, credencial
`Google Calendar account` (id `2kXea9a4br8Gn3pp`), com mensagem:
`The credential "Google Calendar account" needs to be reconnected.` A descrição informa
que o acesso não pôde ser renovado e lista causas possíveis (revogação, expiração ou
mudança de senha/permissões); não prova qual delas ocorreu. A verificação de horário
comercial passou. Nenhum nó posterior de criar evento/atualizar CRM executou.
T27 não está aprovada e depende da reconexão humana da credencial.

**Diagnóstico do prompt**: a T30 passou a tratar reunião como consequência obrigatória
de mostrar opções; essa cláusula absoluta contradiz o pedido atual de usar dúvida e
indecisão como ponte consultiva. A proposta em `AJUSTE-PROMPT-PROPOSTO.md` substitui
essa regra, flexibiliza a apresentação para responder cortesia, exige referência na
citação, reafirma aceite em todas as fases e remove promessas de retomar automaticamente.
A proposta foi aprovada em 2026-09-14 e aplicada localmente na T31 (§31 abaixo).
A nova versão ainda não foi publicada.

**Observações separadas de estilo**: múltiplas tentativas começando por “Boa”, “Show”
ou “Perfeito” foram recusadas pelo responder_lead, consumindo calls. Essa dívida do
tom do tenant × voice.mjs já está no Handoff; não alterar a barreira sem escopo próprio.

**Gates herdados da retomada**: a sessão de terminal 31804 deixou de estar disponível
na ferramenta; não há processo vitest ativo nem resumo final recuperável. Nenhum PASS
ou contagem da rodada anterior foi inferido. Será necessário novo gate isolado após
a correção autorizada. Nenhum teste ou código foi modificado nesta investigação.

## 31. Revisão consultiva aprovada — T31 (2026-09-14)

O usuário aprovou a proposta e a substituição dos testes da regra anterior (“Eu
aprovo”). O prompt substitui as cláusulas conflitantes da T30, preserva a busca
proativa por critério novo, permite reunião sem escolha de imóvel e usa dúvida ou
indecisão como convite consultivo, respeitando recusa. A apresentação responde à
cortesia e não adiciona qualificação quando houve apenas saudação. Referência e
preço são exigidos por opção citada. A regra de aceite passa a ser compartilhada
entre qualificação e agendamento; gostar de imóvel não autoriza marcar horário.
Falha técnica deixa a reunião não confirmada e não autoriza prometer acompanhamento
automático nem solicitar novos horários para contornar a falha.

**Superfície**: `n8n/src/system-message.mjs`, seu teste co-localizado e
`n8n/generated/principal.ts`, regenerado por `node scripts/n8n-inline.mjs`.
`gate.mjs`, `phase.mjs`, modelo, tools, contratos, banco e workflow de booking
permanecem sem alterações. A emenda BUSCA-05 AC13–18 prova instruções do prompt,
nunca a obediência do modelo: PROVA-02 ainda exige nova conversa real.

**Red/green**: testes escritos antes do prompt. Com a implementação anterior:
27 falharam e 94 passaram (121 casos). Depois da implementação,
`npx vitest run n8n/src/__tests__/system-message.test.ts --reporter=dot` passou
com **121 testes**, 0 falhas. São 24 novos casos (12 por fase), preservando os
97 casos existentes e atualizando as asserções das regras aprovadas como substituídas.
Nenhum caso foi apagado ou pulado.

**Adequação A — cobertura**: referências abaixo em
`n8n/src/__tests__/system-message.test.ts`. As linhas 716–793 rodam em ambas as
fases. Cada `toContain` verifica a instrução especificada, não uma fala simulada.

| AC / critério | file:line + asserção | Resultado definido na spec |
| --- | --- | --- |
| AC13: sem escolha obrigatória / dúvida / indecisão | :95 `expect(message).toContain("escolher, aprovar ou decidir por um imóvel NÃO é requisito")`; :741–743 `toContain` de dúvida, comparações prolongadas e convite | Convite consultivo para ajudar a decidir |
| AC13: recusa / nenhum resultado | :748 `toContain("se ele recusar, respeite e continue ajudando")`; :749 `toContain("Você também pode oferecer essa conversa quando a busca não trouxer opções")` | Respeitar recusa; permitir convite sem opções |
| AC14: critério novo ou alterado / critério único | :94 `toContain("critério de busca novo ou alterar o que procura")`; :107 `toMatch(/busque mesmo assim com esse único critério em vez de esperar ter todos/i)` | Busca continua proativa |
| AC14: pedido de reunião / aceite | :754 `toContain("Não repita buscas com os mesmos critérios só para adiar a reunião")`; :755 `toContain("Se o lead já quiser conversar ou tiver aceitado um horário, priorize esse pedido")` | Não adiar reunião com buscas repetidas |
| AC15: saudação / pergunta social | :722 `toContain("responda ao cumprimento e às perguntas sociais")`; :723 `toContain("“tudo bem?” ou “como vai?”")` | Responder à cortesia |
| AC15: apresentação / só saudação / pedido junto | :728 `toContain("adapte a frase e sua ordem ao que a pessoa disse")`; :729 `toContain("não acrescente uma pergunta de qualificação nesse mesmo turno")`; :730 `toContain("Se ele já trouxe um pedido, responda à cortesia e então ao pedido")` | Identidade natural e reação antes de coleta |
| AC15: turno seguinte | :735 `toContain("responda ao cumprimento e às perguntas sociais")`; :736 `not.toContain("Primeira mensagem desta conversa:")` | Cortesia continua sem reabrir apresentação |
| AC16 / PROVA-02 AC3: referência e preço | :760 `toContain("incluindo a referência de cada imóvel citado e seu preço")`; :136–139 limites de campos da tool | Exigir ambos os dados devolvidos por opção |
| AC18: interesse / dúvida / agradecimento | :765 `toContain("interesse por um imóvel, dúvida ou agradecimento NÃO é aceite de horário")`; :766 `toContain("Dizer que gostou de uma opção não autoriza marcar reunião")` | Não antecipar agendamento |
| AC18: proposta / horário aceito | :771 `toContain("se perguntou, encerre o turno e espere a resposta")`; :772 `toContain("sempre para o horário que ele aceitou")`; :460–462 regra também em qualificação | Esperar aceite em ambas as fases |
| AC17: confirmação / ocupação | :777 `toContain("a reunião ainda NÃO está confirmada")`; :778 `toContain("Não diga que o horário foi ocupado, a menos que a tool tenha devolvido essa informação")` | Informar falha sem inventar ocupação |
| AC17: promessa automática | :783 `toContain("Não prometa que vai confirmar depois, avisar quando voltar, reservar ou deixar encaminhado")`; :784 `toContain("não existe acompanhamento automático para cumprir isso")` | Não prometer mecanismo inexistente |
| AC17: alternativas / retomar depois / sigilo | :789 `toContain("não peça novas alternativas de horário por esse motivo")`; :790 `toContain("Oriente o lead a retomar a confirmação mais tarde")`; :791 `toContain("Não divulgue credenciais, códigos internos ou detalhes de OAuth")` | Próximo passo compatível com falha técnica |
| AC6/7/9: limites preservados | :73 `toContain("NÃO manda fotos")`; :128–129 ausência / nenhum imóvel; :136–139 campos devolvidos / sem endereço ou captador | Sem regressão de capacidade |
| AC10/11: módulos / grafo | diff de gate.mjs/phase.mjs vazio; JSON SDK comparado com HEAD; `principal-modelo.test.ts:134` mede 62 nós / 76 conexões | Topologia preservada; só prompt muda |

**Adequação C — necessidade**:

| Asserções em system-message.test.ts | Mapeamento reverso / manter |
| --- | --- |
| :94–97, :103, :107, :116–118 | AC13/14; substituem regra absoluta da T30 conforme aprovação |
| :460–462, :765–766, :771–772 | AC18; aceite global e separação de turno |
| :611–612, :623–624 | AC17 e tradução técnica; retiram contradição entre proibir “sistema” e prescrever “sistema fora do ar” |
| :722–723, :728–730, :735–736 | AC15; cortesia, ordem flexível e primeiro turno/subsequente |
| :741–743, :748–749 | AC13; convite consultivo, recusa e nenhum resultado |
| :754–755 | AC14; pedido/aceite sem repetição obrigatória |
| :760 | AC16 / PROVA-02 AC3; referência e preço |
| :777–778, :783–784, :789–791 | AC17; confirmação e cada proibição/alternativa com asserção dedicada |

**Adequação B/D**: nenhuma asserção nova verifica apenas existência ou tamanho.
Conjunções têm asserção por cláusula (L-012). Função pura e padrão de instruções
existentes preservados, sem estado novo, contador ou abstração. Casos remanescentes
cobrem identidade, transparência, escalonamento, opt-out, Meet e reunião confirmada.
Verifier independente será executado no fechamento do lote, após as tasks abertas;
esta é revisão por task.

**Artefato**: inliner regenerou seis arquivos, mas somente `principal.ts` tem diff.
Comparação SDK com HEAD confirma 62 nós, 76 conexões e conexões idênticas, normalizando
CRLF e ids aleatórios do SDK. Só `parameters.jsCode` do nó
`Code: montar system message e marcar campo perguntado` mudou. Instância principal
reconsultada via MCP: ativa na versão anterior `e0a4f1b7-bee3-4a7d-bf50-0e01c2b6a07f`.
`validate_workflow`: **valid=true**, 62 nós, cinco avisos sobre Memory Managers
já existentes, fora da superfície alterada.

**Gates finais**: `npx vitest run --reporter=dot` exit 0: **1.304 testes em 91 arquivos**,
0 falhas, duração 665,22 s (sessão 89219, resumo final recuperado). Lint exit 0
(0 erros / 3 avisos pré-existentes); build exit 0 (avisos locais já existentes do
Better Auth). `validate_tasks.py` exit 0 (0 erros / 16 avisos: camadas none e superfície
coesa da T31); `validate_spec.py` exit 0 (0 erros / 0 avisos); `git diff --check` exit 0.
**T31 concluída localmente**; nenhum SPEC_DEVIATION novo. Os artefatos da retomada,
a revisão aprovada e a evidência entram juntos no commit da T31.
Nenhum publish, push, deploy, reset ou chamada de booking real nesta implementação.
Publicação do principal exige autorização específica; reconexão do Google Calendar
continua necessária para T27. T26/T27 permanecem abertas.
