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

## 32. Publicação autorizada da revisão consultiva — T32 (2026-09-14)

**Autorização**: usuário respondeu “Pode publicar” ao pedido específico para
atualizar/publicar somente o principal. Fonte local já verificada: commit `2268671`,
1.304 testes em 91 arquivos, lint e build passaram (§31). Não houve mudança de
código ou novo teste nesta task; o gate completo não foi repetido.

**Alvo**: `crivo-agente-principal`, id `0B1nqjODu7xuYYKF`.
Versão anterior reconsultada antes da alteração:
`e0a4f1b7-bee3-4a7d-bf50-0e01c2b6a07f`, draft e ativo coincidentes.
Artefato `n8n/generated/principal.ts` importado pelo SDK e novamente validado pelo
MCP: `valid=true`, 62 nós, cinco avisos de Memory Managers existentes.

**Aplicação**: a primeira operação `setNodeParameter` com path `jsCode` foi
recusada como caminho inválido, sem qualquer alteração (batch atômico).
`updateNodeParameters`, `replace=false`, salvou uma única operação em
`Code: montar system message e marcar campo perguntado`, somente `parameters.jsCode`.
Nenhum nó foi removido/recriado. O MCP reportou também aviso sobre `builtInTools`
no modelo; comparação do modelo inteiro antes/depois confirmou igualdade exata,
portanto o parâmetro já existia e ficou preservado.

**Conferência ANTES de ativar**: `get_workflow_details` confirmou draft
`fd7faf28-c070-4585-a22d-c322f1e1765d`, enquanto ativo ainda era a versão anterior.
Comparação das 62 definições de nós mostrou somente a alteração de jsCode no nó
autorizado; todos os demais parâmetros e credenciais idênticos à leitura anterior.
76 conexões idênticas; modelo, grupos e settings preservados; maxIterations 8.
SHA-256 do jsCode gerado e salvo, normalizando CRLF para LF:

`c7a1ce26e192ba382ac56b14605f939334fecaf3c0e40a84d36f7d4e5b6a4e89`

Hash calculado com hashlib, comparado por igualdade com assert antes do publish;
JSON temporário contendo os dois códigos removido após a conferência.

**Ativação**: `publish_workflow` com workflowId e versionId explícitos retornou
`success=true`, activeVersionId `fd7faf28-c070-4585-a22d-c322f1e1765d`.
Nova leitura por `get_workflow_details` confirmou `active=true`, draft/ativo na
versão autorizada, jsCode ativo igual ao gerado, 62 nós / 76 conexões idênticas e
maxIterations 8. Publicação concluída; nenhuma mensagem de WhatsApp enviada pela
ferramenta, reset, booking real, alteração de credencial, outro workflow, push ou deploy.

**Adequação por task**: hash antes de ativar → assert h[local]==h[remote]; superfície
isolada → comparação das definições de nós e assert changedParameters==[jsCode];
versão ativa → assert activeVersionId==draft.versionId e active=true; topologia →
assert nodes==62/connections==76/connectionsMatch; teto → assert maxIterations==8.
Essas verificações mapeiam respectivamente ao Done when da T32 / BUSCA-04 AC12,
sem asserção de comportamento do modelo. Sem código novo, sem camada de teste nova.
Gate documental: validate_tasks.py e validate_spec.py exit 0; git diff --check exit 0.

**Próximo passo**: reconectar `Google Calendar account` para testar agendamento;
preparar conversa limpa conforme roteiro antes de repetir T26/T27. A conversa
existente não foi limpa nesta publicação. Referência/preço real, captura, iterações
e evento Meet continuam pendentes; T26–T29 e Verifier final não foram aprovados.

## 33. Reset autorizado para nova conversa (2026-09-14)

Usuário informou acreditar ter resolvido a credencial e autorizou executar o reset
para iniciar nova sessão. Alvo fixo do roteiro: tenant `triangulo`, waId `553499532444`.
Executada a ordem n8n → CRM, sem alterar workflow ou enviar mensagem no WhatsApp.

- `crivo-smoke-reset` (`rgf3t1cVsd2q0X0f`) executado em modo manual;
  execução **2320**, conferida individualmente por `get_execution`, status **success**,
  de `2026-09-14T17:04:33.626Z` a `17:04:33.719Z`.
- Memory Manager retornou `success=true` para sessão `triangulo:553499532444`.
  Data Table deleteRows executou com sucesso e devolveu a linha removida id 32,
  filtrada por tenantSlug AND waId. Sem afirmar leitura direta de ausência no Postgres
  do n8n; limpeza comprovada pela execução dos nós e a primeira conversa confirmará
  o estado inicial em campo.
- `npm run smoke:reset` exit 0: lead de teste apagado, **14 mensagens / 1 conversa**.
  Mensagem do script sobre faltar n8n é genérica; o lado n8n já havia concluído acima.
- Consulta SQL separada, transação READ ONLY, confirmou **remaining=0** para lead
  por tenant/externalId. Principal reconsultado: ativo em
  `fd7faf28-c070-4585-a22d-c322f1e1765d` (prompt da T31).

Ambiente preparado para o usuário iniciar a conversa. A reconexão da credencial
foi relatada pelo usuário; nenhum agendamento foi disparado para confirmá-la nesta
limpeza. Validação real de Calendar, referência/preço, captura e iterações ainda
pendentes. T26/T27 seguem abertas.

## 34. Segunda conversa após T31 — inspeção de 2026-09-14

Usuário gostou do atendimento e pediu busca alternativa automática, convite mais
cedo quando não houver opção e apresentação legível do imóvel. Investigação por
consulta SQL READ ONLY e MCP, sem mudança de código/publicação/reset/Calendar.
Proposta concreta: `AJUSTE-PROATIVIDADE-PROPOSTO.md`, aguardando revisão do usuário.

**Sessão**: reset anterior 2320 confirmado (§33). Lead novo
`b639766a-f273-4c30-aa39-695226141bed`; oito turnos, **16 mensagens** no CRM,
14/09/2026 de 17:08:28Z a 17:15:08Z. Principal reconsultado, ativo em
`fd7faf28-c070-4585-a22d-c322f1e1765d`, maxIterations 8. Todos os ids abaixo
confirmados individualmente por `get_execution`; leituras adicionais filtradas
para `OpenAI Chat Model` permitem medir chamadas do modelo, não só tools.

| Turno / execução | Lead / resultado enviado ao WhatsApp | Tool steps | Chamadas do modelo |
| --- | --- | --- | --- |
| 1 / 2321 | “Boa tarde! Como vai?” → respondeu cortesia, identificou Lucas/Triângulo e convidou a contar o que procura | 1 | 2 |
| 2 / 2327 | Bairro Abadia → IM-0001, apartamento novo, Uberlândia/MG, 2 quartos, 2 banheiros, 1 vaga, 72 m², R$ 380.000,00; perguntou casa/apartamento | 5 | 6 |
| 3 / 2335 | Preferência por casa → busca casa + Abadia vazia; declarou ausência e pediu orçamento/quartos | 5 | 6 |
| 4 / 2342 | 2 quartos / até 200k → busca vazia; perguntou se podia procurar próximos ou aumentar valor | 3 | 4 |
| 5 / 2349 | “Tem algo próximo?” → buscou bairro literal “próximo do Abadia”, vazio; sugeriu aumentar teto ou 1 quarto | 2 | 3 |
| 6 / 2354 | “Não tenho interesse” → primeiro convite de reunião, hoje 15:30 ou amanhã mesmo horário | 1 | 2 |
| 7 / 2359 | “Prefiro amanhã as 15h” → agendar_reuniao para 15/09 às 15h; confirmou André e mandou link Meet | 2 | 3 |
| 8 / 2365 | “Obrigado” → despedida curta, sem nova tool de booking | 1 | 2 |

**Positivo real**: 2327 buscar_imoveis com bairro=Abadia retornou IM-0001 e os
mesmos campos informados na mensagem CRM. Consulta READ ONLY das propriedades
disponíveis/publicadas de triangulo retornou somente essa unidade: price_cents
38000000, área 72, 2/2/1, tipo apartamento, modalidade novo, bairro Abadia,
Uberlândia/MG. Referência **e** preço desta vez enviados corretamente. PROVA-02 AC3
comprovada nesta sessão; nada de endereço exato ou captador na mensagem.

**Negativo real**: a primeira chamada 2335 enviou modalidade="" e outros
preenchimentos desconhecidos e recebeu 400 payload-invalido. O agente corrigiu para
tipo=casa/bairro=Abadia, recebeu imoveis=[]/total=0 e declarou ausência, sem citar
imóvel nesse turno. PROVA-02 AC4 comprovada pela chamada corrigida e mensagem enviada;
o 400 não é prova de ausência. Os únicos imóveis visíveis conferidos não incluem casa.

**Causa das voltas**: 2335 já tinha ausência válida de casa nesse bairro; acrescentar
preço/quartos não amplia esse conjunto. 2342 ainda incluiu cidade="Uberlândia/MG",
embora o lead não tivesse informado cidade. `properties.ts:82` compara cidade
normalizada por igualdade, não separa UF nem interpreta proximidade. 2349 usou
bairro="próximo do Abadia"; `properties.ts:80` compara nome normalizado por igualdade.
Lista vazia dessa query não prova ausência em bairros próximos. A tool não possui
distância/adjacência; a proposta amplia para outros bairros sem afirmar proximidade
não comprovada, preservando critérios, sem pedir permissão para mera consulta.

**Latência e teto**: durações totais 20,053 / 26,436 / 26,474 / 19,672 / 17,738 /
16,331 / 18,890 / 15,562 s, incluindo debounce de 10 s. O maior consumo foi **6
chamadas ao modelo**, medido pelos seis runs de OpenAI Chat Model em 2327 e 2335;
todos success. Não houve estouro do teto oito. 2327 recusou três vezes a mesma
abertura “Boa!” antes de enviar; 2335 recusou “Boa” e “Show”, além do retry do 400;
2342 recusou “Boa” uma vez. São custos reais da dívida tom × voice já registrada,
sem alteração da barreira nesta investigação.

**Agendamento confirmado**: execução filha **2360**, conferida por get_execution,
status success. Calendar availability available=true; PATCH CRM confirmado;
Google Calendar criar evento (Meet) success, evento `opblu5rf7n0sml8p3c7ue3gpe4`,
15/09/2026 15:00–15:30, America/Sao_Paulo,
Meet `https://meet.google.com/kgb-upvk-ndo`; agenda_envios registrou lembrete id 16.
Resposta da tool: ok=true, crmAtualizado=true, eventoCriado=true e responsável
André Luiz Martins. Consulta SQL independente: qualificado_agendado,
meeting_at=2026-09-15T18:00:00Z, assigned_user_id=3ea96a1f-3fb4-436b-a4ab-862dbf36f394,
assigned_name=André Luiz Martins. Horário concreto do próprio lead precedeu a chamada.
Reconexão da credencial comprovada por disponibilidade e criação reais, não só relato.

**Limites / dívidas**: modality, region, property_type e budget_cents permanecem
nulos no lead; nenhuma registrar_qualificacao ocorreu nessa conversa. É o achado
herdado do Handoff, mantido separado do desfecho de reunião. A captura real ainda
não foi coletada; transcrição/outputs não são screenshot. T26 não é Done e T27
mantém dependência da T26, embora desfecho/aceite/evento estejam comprovados.
Nenhum novo gate de código rodado: código inalterado desde T31, cujo gate completo
passou com 1.304 testes. Novo ajuste e seu gate só serão executados após aprovação.
Evento e lembrete reais continuam existentes; não foram cancelados nesta inspeção.


## 35. T33 — revisão aprovada de proatividade e apresentação (2026-09-14)

**PASS local; publicação e prova real pendentes**. Usuário aprovou AJUSTE-PROATIVIDADE-PROPOSTO.md
com “Aprovado”. Implementação mantém o contrato, a memória e o planejamento do lote.
A aprovação autoriza implementar/testar/commitar localmente; não inclui publicação,
reset, alteração de Calendar, push ou deploy.

**Antes de implementar**:
- Premissa: alternativa significa outros bairros reais, sem dados para inferir distância.
  Uma expansão de bairro flexível preserva os demais critérios conhecidos.
- Arquivos: system-message.mjs e seu teste; principal.ts e teste de buscar_imoveis;
  generated/principal.ts pelo inliner; spec/tasks/evidencia/proposta/STATE do lote.
- Sucesso: cláusulas AC19–24 verificadas nas duas fases, parâmetros orientados,
  testes anteriores preservados, grafo 62/76/maxIterations 8 e gate completo.
- Dependência: T32 entregue e publicada; revisão T31 é a base preservada.
- Implementação: duas instruções específicas de filtros/apresentação e expansão
  consultiva compartilhada; só descrições da tool e seus sete argumentos mudam.
  Não há geografia, parser, renderer, banco, booking ou contador novo.

**RED/GREEN focado**: npx vitest run n8n/src/__tests__/system-message.test.ts
n8n/workflows/__tests__/principal-buscar-imoveis.test.ts --reporter=dot.
RED exit 1: 43 falharam / 135 passaram / 178 total. GREEN exit 0: 178 passaram,
2 arquivos, 1,01 s. São 32 casos novos nas duas fases e 11 da tool. Os 135 anteriores
permanecem intactos; diff dos dois testes tem somente adições, nenhum skip/delete.

**Artefato e limites**: inliner exit 0, seis arquivos regenerados, apenas principal
com diff semântico. Comparação SDK contra HEAD f65bc1d: 62 nós, 76 conexões,
maxIterations 8; conexões idênticas. Mudaram exclusivamente jsCode do system message,
toolDescription e os sete valores de descrição de fromAi em buscar_imoveis.
inlineWorkflowSource(fonte) == arquivo gerado em bytes. A fonte SDK ainda contém
marcadores __INLINE; comparar seu jsCode bruto com o gerado seria uma falsa paridade.
SHA-256 do jsCode gerado: bc190cc00a86fd61aceab2aac07369823d606efd944ff529f7b29481411f6156.
validate_workflow: valid=true, nodeCount=62, cinco avisos prévios de Memory Manager.
gate.mjs / phase.mjs / voice.mjs: zero alterações; demais workflows sem diff semântico.

**Gate completo PASS**:
- npx vitest run --reporter=dot, sessão 27477, exit 0: **1.347 testes em 91 arquivos**,
  zero falhas, 656,97 s. Piso anterior 1.304 + 43 novos, sem remoção/skip.
- npm run lint exit 0: zero erros, três avisos prévios (ifElse no scheduler fonte/gerado
  e diretiva redundante de route-instrumentation.test.ts), nenhum novo aviso.
- npm run build, sessão 94948, exit 0: compilação, TypeScript e geração concluídas.
  Avisos locais prévios de Better Auth (baseURL/segredo default), sem mudança de auth.
- validate_tasks.py exit 0: zero erros, 19 avisos; a T33 é uma revisão coesa de prompt
  em duas bordas, com teste/gerado/documentação associados no mesmo commit.
- validate_spec.py exit 0: zero erros/avisos. git diff --check exit 0.


### Adequação A — cláusulas e resultados esperados

Cada literal abaixo é a instrução esperada pela AC da emenda aprovada, não uma
promessa de efeito determinístico do modelo. Cada expect verifica o texto emitido
por buildSystemMessage ou toJSON, e falha se a cláusula correspondente for retirada.
O teste de fase roda para qualificando e agendando. Os loops de argumento cobrem
cada uma das quatro strings e dos três números individualmente.

| AC / cláusula esperada | file:line + expressão de asserção | Cobertura local |
| --- | --- | --- |
| BUSCA-05 AC19 | `n8n/src/__tests__/system-message.test.ts:799` — `expect(message).toContain("Se o bairro for uma preferência flexível, faça por iniciativa própria UMA busca alternativa no mesmo turno, sem o filtro bairro")` | ✅ GREEN focado |
| BUSCA-05 AC19 | `n8n/src/__tests__/system-message.test.ts:800` — `expect(message).toContain("Não peça permissão só para consultar alternativas")` | ✅ GREEN focado |
| BUSCA-05 AC19 | `n8n/src/__tests__/system-message.test.ts:803` — `expect(message).toContain("mantendo tipo, modalidade, orçamento e quartos conhecidos, além da cidade quando ela estiver confirmada")` | ✅ GREEN focado |
| BUSCA-05 AC19 | `n8n/src/__tests__/system-message.test.ts:804` — `expect(message).toContain("Não altere teto de preço, quantidade mínima de quartos, tipo de imóvel ou cidade para fabricar uma opção")` | ✅ GREEN focado |
| BUSCA-05 AC19 | `n8n/src/__tests__/system-message.test.ts:807` — `expect(message).toContain("Se o lead disser que o bairro é obrigatório, não retire esse filtro")` | ✅ GREEN focado |
| BUSCA-05 AC19 | `n8n/src/__tests__/system-message.test.ts:808` — `expect(message).toContain("A ampliação é só para consulta de alternativas; não mude os critérios gravados do lead")` | ✅ GREEN focado |
| BUSCA-05 AC20 | `n8n/src/__tests__/system-message.test.ts:811` — `expect(message).toContain("Quando uma busca válida não trouxer opções, não peça mais preço ou quartos só para refinar um conjunto já vazio")` | ✅ GREEN focado |
| BUSCA-05 AC20 | `n8n/src/__tests__/system-message.test.ts:814` — `expect(message).toContain("Se a busca alternativa também voltar vazia, informe a ausência e ofereça já nessa resposta uma conversa com o corretor")` | ✅ GREEN focado |
| BUSCA-05 AC20 | `n8n/src/__tests__/system-message.test.ts:815` — `expect(message).toContain("sem esperar outra rodada de perguntas ou que o lead diga que não tem interesse")` | ✅ GREEN focado |
| BUSCA-05 AC20 | `n8n/src/__tests__/system-message.test.ts:818` — `expect(message).toContain("Se não couber ampliar o bairro, ofereça a conversa após a primeira ausência válida")` | ✅ GREEN focado |
| BUSCA-05 AC20 | `n8n/src/__tests__/system-message.test.ts:821` — `expect(message).toContain("Não repita uma combinação já consultada e não repita a mesma expansão a cada turno")` | ✅ GREEN focado |
| BUSCA-05 AC21 | `n8n/src/__tests__/system-message.test.ts:824` — `expect(message).toContain("Omitir filtros desconhecidos: não enviar strings vazias ou números zero como preenchimento")` | ✅ GREEN focado |
| BUSCA-05 AC21 | `n8n/src/__tests__/system-message.test.ts:827` — `expect(message).toContain("Cidade é apenas o nome da cidade, sem /UF, e só deve ser filtrada quando confirmada pelo lead")` | ✅ GREEN focado |
| BUSCA-05 AC21 | `n8n/src/__tests__/system-message.test.ts:830` — `expect(message).toContain("Bairro aceita um nome de bairro real, nunca expressões como “próximo do Abadia”, “arredores” ou “bairros próximos”")` | ✅ GREEN focado |
| BUSCA-05 AC21 | `n8n/src/__tests__/system-message.test.ts:831` — `expect(message).toContain("Para consultar alternativas sem um bairro específico, omita bairro")` | ✅ GREEN focado |
| BUSCA-05 AC21 | `n8n/src/__tests__/system-message.test.ts:832` — `expect(message).toContain("A tool não calcula distância ou adjacência")` | ✅ GREEN focado |
| BUSCA-05 AC22 | `n8n/src/__tests__/system-message.test.ts:835` — `expect(message).toContain("Cidade não informada não é assumida a partir de uma opção anterior")` | ✅ GREEN focado |
| BUSCA-05 AC22 | `n8n/src/__tests__/system-message.test.ts:836` — `expect(message).toContain("Sem cidade confirmada, omita cidade e use os demais critérios conhecidos")` | ✅ GREEN focado |
| BUSCA-05 AC22 | `n8n/src/__tests__/system-message.test.ts:839` — `expect(message).toContain("Explique que ampliou para outros bairros e mostre a localização real devolvida")` | ✅ GREEN focado |
| BUSCA-05 AC22 | `n8n/src/__tests__/system-message.test.ts:840` — `expect(message).toContain("não afirme que são próximos sem informação confiável de proximidade")` | ✅ GREEN focado |
| BUSCA-05 AC22 | `n8n/src/__tests__/system-message.test.ts:841` — `expect(message).toContain("cada alternativa mostra sua cidade de verdade")` | ✅ GREEN focado |
| BUSCA-05 AC23 | `n8n/src/__tests__/system-message.test.ts:844` — `expect(message).toContain("Uma falha técnica não é resultado vazio: siga a regra de falha e não invente ausência")` | ✅ GREEN focado |
| BUSCA-05 AC24 | `n8n/src/__tests__/system-message.test.ts:847` — `expect(message).toContain("Ao apresentar um imóvel, facilite a leitura com linhas curtas em uma única mensagem")` | ✅ GREEN focado |
| BUSCA-05 AC24 | `n8n/src/__tests__/system-message.test.ts:848` — `expect(message).toContain("linhas separadas nesta ordem: tipo/modalidade e referência; bairro e cidade/UF; quartos, banheiros e vagas; área; preço")` | ✅ GREEN focado |
| BUSCA-05 AC24 | `n8n/src/__tests__/system-message.test.ts:851` — `expect(message).toContain("Use só os campos e os valores devolvidos pela tool")` | ✅ GREEN focado |
| BUSCA-05 AC24 | `n8n/src/__tests__/system-message.test.ts:852` — `expect(message).toContain("Separe uma eventual pergunta ou convite em outra mensagem curta")` | ✅ GREEN focado |
| BUSCA-05 AC24 | `n8n/src/__tests__/system-message.test.ts:853` — `expect(message).toContain("Não emende características, preço e pergunta em um parágrafo comprido")` | ✅ GREEN focado |
| BUSCA-05 AC24 | `n8n/src/__tests__/system-message.test.ts:856` — `expect(message).toContain("respeitando o limite de três mensagens por turno, mesmo ao apresentar mais de uma opção")` | ✅ GREEN focado |
| BUSCA-05 AC24 | `n8n/src/__tests__/system-message.test.ts:857` — `expect(message).toContain("As demais respostas continuam naturais e curtas. Não use emoji, tabela ou markdown")` | ✅ GREEN focado |
| BUSCA-05 AC24 | `n8n/src/__tests__/system-message.test.ts:858` — `expect(message).toContain("Frases curtas, sem markdown, sem listas com tópicos")` | ✅ GREEN focado |
| BUSCA-05 AC21/23 | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:99` — `expect(description).toContain("Omitir filtros desconhecidos: não enviar strings vazias ou números zero como preenchimento")` | ✅ GREEN focado |
| BUSCA-05 AC21/23 | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:100` — `expect(description).toContain("Todos os parâmetros são opcionais")` | ✅ GREEN focado |
| BUSCA-05 AC21/23 | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:101` — `expect(description).toContain("Preço em reais (nunca centavos)")` | ✅ GREEN focado |
| BUSCA-05 AC21/23 | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:104` — `expect(description).toContain("Cidade é apenas o nome da cidade, sem /UF, e só deve ser filtrada quando confirmada pelo lead")` | ✅ GREEN focado |
| BUSCA-05 AC21/23 | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:105` — `expect(queryParam("cidade")).toContain("sem /UF")` | ✅ GREEN focado |
| BUSCA-05 AC21/23 | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:106` — `expect(queryParam("cidade")).toContain("Não inferir de imóvel apresentado")` | ✅ GREEN focado |
| BUSCA-05 AC21/23 | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:109` — `expect(description).toContain("Bairro aceita um nome de bairro real, nunca expressões de proximidade")` | ✅ GREEN focado |
| BUSCA-05 AC21/23 | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:110` — `expect(queryParam("bairro")).toContain("Nunca usar próximo, arredores ou bairros próximos como nome")` | ✅ GREEN focado |
| BUSCA-05 AC21/23 | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:111` — `expect(queryParam("bairro")).toContain("Na busca alternativa sem bairro específico, omita bairro")` | ✅ GREEN focado |
| BUSCA-05 AC21/23 | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:112` — `expect(description).toContain("A tool não calcula distância ou adjacência")` | ✅ GREEN focado |
| BUSCA-05 AC21/23 | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:115` — `expect(queryParam(name)).toContain("Se desconhecido, omita; não enviar string vazia")` | ✅ GREEN focado |
| BUSCA-05 AC21/23 | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:118` — `expect(queryParam(name)).toContain("Se desconhecido, omita; não enviar zero")` | ✅ GREEN focado |
| BUSCA-05 AC21/23 | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:119` — `expect(queryParam(name)).toContain("inteiro maior que zero")` | ✅ GREEN focado |
| BUSCA-05 AC21/23 | `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:122` — `expect(description).toContain("Uma falha técnica não é resultado vazio; não invente ausência de imóveis")` | ✅ GREEN focado |

### Adequação C — necessidade por asserção

| file:line + expressão | Requisito da emenda | Manter |
| --- | --- | --- |
| `n8n/src/__tests__/system-message.test.ts:799` — `expect(message).toContain("Se o bairro for uma preferência flexível, faça por iniciativa própria UMA busca alternativa no mesmo turno, sem o filtro bairro")` | BUSCA-05 AC19 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:800` — `expect(message).toContain("Não peça permissão só para consultar alternativas")` | BUSCA-05 AC19 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:803` — `expect(message).toContain("mantendo tipo, modalidade, orçamento e quartos conhecidos, além da cidade quando ela estiver confirmada")` | BUSCA-05 AC19 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:804` — `expect(message).toContain("Não altere teto de preço, quantidade mínima de quartos, tipo de imóvel ou cidade para fabricar uma opção")` | BUSCA-05 AC19 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:807` — `expect(message).toContain("Se o lead disser que o bairro é obrigatório, não retire esse filtro")` | BUSCA-05 AC19 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:808` — `expect(message).toContain("A ampliação é só para consulta de alternativas; não mude os critérios gravados do lead")` | BUSCA-05 AC19 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:811` — `expect(message).toContain("Quando uma busca válida não trouxer opções, não peça mais preço ou quartos só para refinar um conjunto já vazio")` | BUSCA-05 AC20 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:814` — `expect(message).toContain("Se a busca alternativa também voltar vazia, informe a ausência e ofereça já nessa resposta uma conversa com o corretor")` | BUSCA-05 AC20 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:815` — `expect(message).toContain("sem esperar outra rodada de perguntas ou que o lead diga que não tem interesse")` | BUSCA-05 AC20 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:818` — `expect(message).toContain("Se não couber ampliar o bairro, ofereça a conversa após a primeira ausência válida")` | BUSCA-05 AC20 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:821` — `expect(message).toContain("Não repita uma combinação já consultada e não repita a mesma expansão a cada turno")` | BUSCA-05 AC20 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:824` — `expect(message).toContain("Omitir filtros desconhecidos: não enviar strings vazias ou números zero como preenchimento")` | BUSCA-05 AC21 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:827` — `expect(message).toContain("Cidade é apenas o nome da cidade, sem /UF, e só deve ser filtrada quando confirmada pelo lead")` | BUSCA-05 AC21 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:830` — `expect(message).toContain("Bairro aceita um nome de bairro real, nunca expressões como “próximo do Abadia”, “arredores” ou “bairros próximos”")` | BUSCA-05 AC21 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:831` — `expect(message).toContain("Para consultar alternativas sem um bairro específico, omita bairro")` | BUSCA-05 AC21 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:832` — `expect(message).toContain("A tool não calcula distância ou adjacência")` | BUSCA-05 AC21 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:835` — `expect(message).toContain("Cidade não informada não é assumida a partir de uma opção anterior")` | BUSCA-05 AC22 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:836` — `expect(message).toContain("Sem cidade confirmada, omita cidade e use os demais critérios conhecidos")` | BUSCA-05 AC22 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:839` — `expect(message).toContain("Explique que ampliou para outros bairros e mostre a localização real devolvida")` | BUSCA-05 AC22 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:840` — `expect(message).toContain("não afirme que são próximos sem informação confiável de proximidade")` | BUSCA-05 AC22 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:841` — `expect(message).toContain("cada alternativa mostra sua cidade de verdade")` | BUSCA-05 AC22 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:844` — `expect(message).toContain("Uma falha técnica não é resultado vazio: siga a regra de falha e não invente ausência")` | BUSCA-05 AC23 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:847` — `expect(message).toContain("Ao apresentar um imóvel, facilite a leitura com linhas curtas em uma única mensagem")` | BUSCA-05 AC24 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:848` — `expect(message).toContain("linhas separadas nesta ordem: tipo/modalidade e referência; bairro e cidade/UF; quartos, banheiros e vagas; área; preço")` | BUSCA-05 AC24 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:851` — `expect(message).toContain("Use só os campos e os valores devolvidos pela tool")` | BUSCA-05 AC24 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:852` — `expect(message).toContain("Separe uma eventual pergunta ou convite em outra mensagem curta")` | BUSCA-05 AC24 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:853` — `expect(message).toContain("Não emende características, preço e pergunta em um parágrafo comprido")` | BUSCA-05 AC24 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:856` — `expect(message).toContain("respeitando o limite de três mensagens por turno, mesmo ao apresentar mais de uma opção")` | BUSCA-05 AC24 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:857` — `expect(message).toContain("As demais respostas continuam naturais e curtas. Não use emoji, tabela ou markdown")` | BUSCA-05 AC24 | ✅ |
| `n8n/src/__tests__/system-message.test.ts:858` — `expect(message).toContain("Frases curtas, sem markdown, sem listas com tópicos")` | BUSCA-05 AC24 | ✅ |
| `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:99` — `expect(description).toContain("Omitir filtros desconhecidos: não enviar strings vazias ou números zero como preenchimento")` | BUSCA-05 AC21/23 | ✅ |
| `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:100` — `expect(description).toContain("Todos os parâmetros são opcionais")` | BUSCA-05 AC21/23 | ✅ |
| `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:101` — `expect(description).toContain("Preço em reais (nunca centavos)")` | BUSCA-05 AC21/23 | ✅ |
| `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:104` — `expect(description).toContain("Cidade é apenas o nome da cidade, sem /UF, e só deve ser filtrada quando confirmada pelo lead")` | BUSCA-05 AC21/23 | ✅ |
| `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:105` — `expect(queryParam("cidade")).toContain("sem /UF")` | BUSCA-05 AC21/23 | ✅ |
| `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:106` — `expect(queryParam("cidade")).toContain("Não inferir de imóvel apresentado")` | BUSCA-05 AC21/23 | ✅ |
| `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:109` — `expect(description).toContain("Bairro aceita um nome de bairro real, nunca expressões de proximidade")` | BUSCA-05 AC21/23 | ✅ |
| `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:110` — `expect(queryParam("bairro")).toContain("Nunca usar próximo, arredores ou bairros próximos como nome")` | BUSCA-05 AC21/23 | ✅ |
| `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:111` — `expect(queryParam("bairro")).toContain("Na busca alternativa sem bairro específico, omita bairro")` | BUSCA-05 AC21/23 | ✅ |
| `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:112` — `expect(description).toContain("A tool não calcula distância ou adjacência")` | BUSCA-05 AC21/23 | ✅ |
| `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:115` — `expect(queryParam(name)).toContain("Se desconhecido, omita; não enviar string vazia")` | BUSCA-05 AC21/23 | ✅ |
| `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:118` — `expect(queryParam(name)).toContain("Se desconhecido, omita; não enviar zero")` | BUSCA-05 AC21/23 | ✅ |
| `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:119` — `expect(queryParam(name)).toContain("inteiro maior que zero")` | BUSCA-05 AC21/23 | ✅ |
| `n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:122` — `expect(description).toContain("Uma falha técnica não é resultado vazio; não invente ausência de imóveis")` | BUSCA-05 AC21/23 | ✅ |

### Preservação e critérios estruturais

| Critério | Evidência / asserção | Resultado esperado |
| --- | --- | --- |
| Cortesia AC15 | n8n/src/__tests__/system-message.test.ts:722 — expect(message).toContain("responda ao cumprimento e às perguntas sociais") | Resposta social natural |
| Convite e recusa AC13 | n8n/src/__tests__/system-message.test.ts:748 — expect(message).toContain("se ele recusar, respeite e continue ajudando") | Convite sem insistência |
| Prioridade e busca AC14 | n8n/src/__tests__/system-message.test.ts:755 — expect(message).toContain("Se o lead já quiser conversar ou tiver aceitado um horário, priorize esse pedido") | Pedido/aceite têm prioridade |
| Referência/preço AC16 | n8n/src/__tests__/system-message.test.ts:760 — expect(message).toContain("incluindo a referência de cada imóvel citado e seu preço") | Citação real preservada |
| Aceite AC18 | n8n/src/__tests__/system-message.test.ts:765 — expect(message).toContain("interesse por um imóvel, dúvida ou agradecimento NÃO é aceite de horário") | Interesse não agenda |
| Falha AC17 | n8n/src/__tests__/system-message.test.ts:777 — expect(message).toContain("a reunião ainda NÃO está confirmada") | Não confirmar falha técnica |
| Fronteira AC7/9 | n8n/src/__tests__/system-message.test.ts:137 — expect(message).toMatch(/NUNCA prometa endereço exato nem informe nome do corretor de captação/) e :71 — expect(message).toContain("NÃO manda fotos") | Campos proibidos preservados |
| Tenant AC2/3 | n8n/workflows/__tests__/principal-buscar-imoveis.test.ts:83 — expect(tenantHeader?.value).toBe("={{ $('Code: gate').first().json.tenantSlug }}") | Tenant do fluxo |
| Tools/grafo AC11 | n8n/workflows/__tests__/principal-modelo.test.ts:120 — expect(nomes).toContain(ferramenta); :135 — expect(workflow.nodes).toHaveLength(NOS_ESPERADOS); :136 — expect(contarConexoes()).toBe(CONEXOES_ESPERADAS) | 6 tools, 62 nós e 76 conexões |
| Código intocado AC10 | Comparação git show HEAD com bytes atuais normalizando CRLF: gate/phase/voice iguais; diff SDK dos demais nós vazio | Zero alterações |
| Gate/artefato | Comandos e resultados acima; gate completo PASS | Testes, lint, build, inliner e validação SDK |

**Adequação B/D**: sem tautologias, mocks ou teste só de contagem; resultados são
instruções da spec e parâmetros emitidos. Matriz de tasks.md seguida, testes
co-localizados e fileParallelism=false. Todas as asserções novas têm requisito.
Revisão local A/C PASS, outcomes derivados da emenda e cláusulas localizadas com
asserções próprias. B/D PASS, sem testes especulativos ou shallow. Simplicidade e
escopo conferidos: sem SPEC_DEVIATION novo, sem refatoração adjacente. Verifier independente final
aguarda T26–T29, incluindo as oito mutações do design; não foi dispensado.

**Publicação/prova real pendentes**: publicar só o principal após autorização
específica, atualizando apenas o nó de system message e descrições/argumentos da
busca. Conferir artefato salvo antes de ativar, 62/76/maxIterations 8 e demais nós.
Nova conversa comprovará expansão automática, convite no mesmo turno e legibilidade.
Esta T33 não marca T26/T27 completas. Evento real opblu5rf7n0sml8p3c7ue3gpe4 e
lembrete id 16 da segunda conversa continuam preservados; nenhum reset foi feito.

Critérios preservados adicionais: n8n/src/__tests__/system-message.test.ts:529,
expect(message).toMatch(/basta ele responder com a palavra sair — sozinha, sem mais nada/i)
prova orientação de opt-out; :317, expect(message).toMatch(/NÃO chame a tool agendar_reuniao/i)
prova não agendar novamente reunião confirmada. Mantidos sem alterações.

**Fechamento local**: T33 marcada Done e BUSCA-05 atualizado antes do mesmo commit
atômico de prompt/testes/workflow/gerado/registros. Decisions do STATE preservado
integralmente contra HEAD. Mensagem validada por check_commit.py:
fix(agente): busca alternativas e antecipa convite com imoveis legiveis.
Publicação pendente; T26–T29 e validation.md não fechados por este PASS local.


## 36. T34 — publicação autorizada da revisão de proatividade (2026-09-14)

**PASS publicação**. Autorização: “Permito. Rode também o reset para que eu inicie
uma nova sessão”. Base: commit 2245565, 1.347 testes / 91 arquivos, lint/build exit 0.
Sem alteração de código nesta entrega; gate completo anterior não repetido.

Principal 0B1nqjODu7xuYYKF, versão anterior draft/ativo coincidentes
fd7faf28-c070-4585-a22d-c322f1e1765d. validate_workflow novamente valid=true,
62 nós, cinco avisos prévios de Memory Manager.
Duas operações updateNodeParameters, replace=false: jsCode em Code: montar system
message e marcar campo perguntado; toolDescription e queryParameters de buscar_imoveis.
Sem remover/recriar nó, mudar credencial ou alterar outro workflow. O aviso extra de
builtInTools no update é herdado: definição inteira do modelo ficou idêntica à anterior.

**Antes de ativar**: get_workflow_details confirmou novo draft
833f525c-4d59-43a2-b466-8ef8268a0468, ativo ainda na versão anterior. Assert do código
normalizado remoto == gerado passou. SHA-256, CRLF→LF:
93a36f5e281297925272f9799c47800e60c2fbb20037b9e2102da6ca33541689.
Hash bruto local bc190cc00a86fd61aceab2aac07369823d606efd944ff529f7b29481411f6156,
igual ao registrado na T33. Assert toolDescription e queryParameters == gerados passou.
Diff dos 62 nós: exatamente nove caminhos, jsCode, toolDescription e sete fromAi.value.
Assert changedPaths == allowedPaths, length=9; demais nós inteiros, conexões, grupos e
settings iguais ao baseline. Assert nodes=62, edges=76, maxIterations=8.

**Ativação**: publish_workflow com versionId explícito retornou success=true.
Nova leitura confirmou active=true e activeVersionId=833f525c-4d59-43a2-b466-8ef8268a0468;
assert activeVersion.nodes == draft.nodes e connections == draft.connections passou.

**Adequação local da task**: cada Done when mapeia aos asserts acima (artefato,
superfície, ativo/grafo, recibo/validadores). Sem código, novo teste ou efeito de modelo
reivindicado. Gate validate_tasks/spec e diff --check exit 0. T34 marcada Done antes
do commit atômico docs(specs): registra publicacao da revisao de proatividade.
T26–T29 e Verifier final permanecem pendentes. Reset autorizado será registrado em §37.


## 37. Reset autorizado após publicação da T33 (2026-09-14)

**PASS preparação da sessão**. Usuário autorizou “Rode também o reset para que eu
inicie uma nova sessão”. Alvo homologado fixo: tenant triangulo / waId 553499532444.
Principal publicado na T34, versão 833f525c-4d59-43a2-b466-8ef8268a0468.
Nenhuma mensagem WhatsApp/e-mail, reseed, booking ou cancelamento Calendar enviado.

**Antes de limpar**: SQL READ ONLY confirmou lead
b639766a-f273-4c30-aa39-695226141bed, qualificado_agendado, 1 conversa / 16 mensagens,
meeting_at=2026-09-15T18:00:00Z. get_execution 2360 novamente conferiu que o lembrete
id 16 de agenda_envios pertence a esse lead/tenant/waId, Meet kgb-upvk-ndo.
Scheduler reconsulta/cria lead pelo waId (scheduler.ts:172/192/203): deixar essa linha
após apagar o CRM permitiria recriar a sessão e enviar link do teste anterior.
Foi removido somente esse resíduo associado, como parte do reset autorizado.

**n8n, rotina existente**: execute_workflow manual no crivo-smoke-reset
rgf3t1cVsd2q0X0f, execução **2370**, confirmada por get_execution, success,
2026-09-14T17:52:03.181Z–17:52:03.255Z. Memory Manager success=true para
triangulo:553499532444. deleteRows removeu conversa_estado id 33, filtrado por
triangulo AND 553499532444, incluindo campos perguntados/aberturas/fase antiga.
A rotina não foi alterada: comparação posterior dos nós e conexões com baseline igual.
Não afirmar leitura SQL direta do Postgres n8n; prova é a execução de purga bem-sucedida.

**Resíduo de lembrete**: como MCP não apaga linha de Data Table diretamente, foi usado
helper administrativo temporário d5gqmDVdZ9vLfhmg, código reproduzível em
RESET-LEMBRETE-2026-09-14.md. Tipos/get_node_types, SDK, data_persistence e
validate_workflow (valid=true, 3 nós, sem avisos) consultados antes da criação.
Tabela agenda_envios m83dxX8YZYg1NDYq e colunas reais obtidas por search_data_tables.
Nenhum workflow operacional foi editado para esta operação.

Preflight **2371** manual success, get_execution confirmado: dryRun=true devolveu
uma linha before, id=16, tenantSlug=triangulo, waId=553499532444,
leadId=b639766a-f273-4c30-aa39-695226141bed, meetLink=https://meet.google.com/kgb-upvk-ndo.
Cada valor conferido separadamente por assert; exactly one before row. A leitura
seguinte ainda devolveu a linha (executada duas vezes, pois dry run emite before/after).
Depois, somente options.dryRun=false alterado por updateNodeParameters sem replace.
Execução manual **2372**, confirmada por get_execution, success,
2026-09-14T17:53:22.743Z–17:53:22.792Z. Removida somente linha 16 pelas quatro
condições AND (id + tenant + waId + leadId). get posterior retornou main=[[]], assert
rows.length===0 passou. archive_workflow retornou archived=true para o helper.
Ele não foi publicado; consulta posterior não o expõe após arquivo. Código/evidência
preservados antes do descarte, sem criar nova rotina permanente ou parser.

**CRM, após n8n**: npm run smoke:reset exit 0, alvo fixo, apagou o lead homologado,
**16 mensagens / 1 conversa**. Texto genérico sobre faltar n8n não é pendência:
o lado n8n já tinha concluído. SQL independente em transação READ ONLY confirmou
remaining=0, com assert. Sem tocar outros leads ou inventário.

**Conferência final**: get_workflow_details do principal confirmou active=true,
activeVersionId=833f525c-4d59-43a2-b466-8ef8268a0468; nós/conexões iguais à versão
publicada antes do reset. Usuário pode iniciar nova conversa; seu primeiro turno
confirmará em campo a sessão inicial. T26–T29 continuam abertas e precisam da captura,
prova real e fechamento/Verifier; reset não aprova comportamento de prompt.

**Calendar preservado**: evento opblu5rf7n0sml8p3c7ue3gpe4, 15/09/2026 às 15h Brasília,
continua no Google Calendar; nenhum cancelamento solicitado/executado nesta rodada.
O lembrete n8n desse evento foi removido para não interferir na sessão nova. Não
reutilizar esse horário presumindo agenda livre. Cancelamento é uma ação separada.

**Gate documental**: validate_tasks.py, validate_spec.py, check_commit.py e
 git diff --check exit 0. Sem código de produto novo ou repetição da suíte completa,
que passou na T33. Commit separado do recibo da publicação:
docs(specs): registra reset autorizado apos revisao de proatividade.

## 38. Terceira conversa real — repetição de pergunta após envio confirmado (2026-09-14)

**Resultado**: catálogo com referência/preço corretos, características em linhas,
convite após a primeira ausência e reunião efetivamente criada. Duas mensagens
pedem o mesmo horário no mesmo turno; a segunda é redundante. Não é reenvio da
mesma mensagem por retry do transporte. Nenhum código ou workflow alterado nesta análise.

Consulta SQL em transação READ ONLY, tenant triangulo / external_id 553499532444:
lead e1cefc16-d030-4d27-b199-b3e600d2d526, **13 mensagens: 6 do lead e 7 do agente**,
entre 17:57:48Z e 18:26:34.245Z. Status qualificado_agendado, responsável
3ea96a1f-3fb4-436b-a4ab-862dbf36f394, meeting_at=2026-09-15T18:00:00Z.
Todos os seis turnos abaixo conferidos individualmente por get_execution;
chamadas ao modelo contadas pelos runs de OpenAI Chat Model, não pelo número de tools.

| Execução principal | Intenção do lead | Runs do modelo | Resultado observado |
| --- | --- | --- | --- |
| 2373 | Cumprimento / como vai | 2 | Responde à cortesia e apresenta Lucas; também acrescenta pergunta de qualificação |
| 2379 | Procura pelo Abadia | 7 | Primeiro filtro modalidade="" retorna 400; chamada corrigida devolve IM-0001 / R$ 380.000,00; três aberturas proibidas rejeitadas antes do envio |
| 2387 | Prefere casa | 3 | Busca casa/Abadia/Uberlândia retorna total=0; declara ausência e oferece corretor imediatamente |
| 2393 | Quer conversar com corretor | 5 | Duas aberturas proibidas rejeitadas; depois duas perguntas de horário enviadas com sucesso |
| 2406 | Amanhã às 15h | 6 | Agenda na filha 2407; três aberturas repetidas rejeitadas, depois confirmação enviada |
| 2416 | Agradece | 1 | Texto final enviado pelo fallback existente, uma única mensagem |

Máximo **7 chamadas ao modelo**, abaixo do teto 8. As rejeições de persona são
internas; não aparecem como balões no WhatsApp. Não afirmar que toda a instrução
nova foi obedecida: 2387 inferiu Uberlândia do imóvel anteriormente devolvido,
ofereceu abrir bairros, mas **não fez busca expandida**. Em 2379 a pergunta ficou
na mesma mensagem do imóvel; as características, referência e preço ficaram em linhas.

**Conferência do inventário**: SQL READ ONLY confirmou IM-0001 publicado/disponível,
apartamento novo, Abadia/Uberlândia/MG, price_cents=38000000, 72 m², 2 quartos,
2 banheiros e 1 vaga, iguais ao resultado da tool e ao texto enviado.
A casa IM-0002 está não publicada; não é opção exibível pelo agente.

**Causa da repetição, 2393**: após duas rejeições abertura-proibida, responder_lead
2396 enviou “Fechado. A conversa com o corretor é por chamada de vídeo no Google
Meet. Que horário fica melhor pra você hoje, a partir de 16:00? Se preferir, pode
ser por ligação comum também.” às **18:24:44.625Z**. Retorno observado pelo modelo:
ok=true. Mesmo assim, ele chamou responder_lead novamente, filha 2401, com
“Certo. Só me diz um horário certinho pra gente marcar com o corretor (pode ser
por volta de 16:00, ou outro depois disso hoje).” às **18:24:47.889Z**.
Intervalo **3,264 segundos**, sem nova mensagem do lead.

Get_execution das filhas 2396 e 2401: success, retryOf=null, um envio WhatsApp
em cada uma; ambos registrar mensagem e aceite terminaram com sucesso. IDs de
mensagem distintos, coincidentes com os external_id do CRM. O principal recebeu
ok=true nas duas chamadas; finalizar turno marcou precisaFallback=false.
Assim, o balão redundante veio de uma segunda decisão do modelo, não do fallback,
de um retry HTTP de gravação ou de duas execuções principais para aquela entrada.
O responder permite até três mensagens por turno e não verifica equivalência de intenção.

**Agendamento confirmado**: filha **2407**, success, 18:25:51.509Z–18:25:53.158Z.
Google Calendar availability available=true; PATCH CRM HTTP 200; André Luiz
Martins atribuído. Evento **gpupvvmct9lvbt4qsm3n7b83t8**, status confirmed,
15/09/2026 **15:00–15:30 America/Sao_Paulo**, calendário tostamatias@gmail.com,
convidado andre.martins@trianguloimoveis.com.br, conferência criada com success.
Link real **https://meet.google.com/rkw-xtya-fmv**, igual ao enviado ao lead.
Lembrete agenda_envios **id 17** criado para este lead, ainda não enviado.
Não cancelado evento, apagado lembrete ou resetada sessão nesta análise.
O estado atual do evento anterior preservado no reset não foi reconsultado;
não inferir sua exclusão a partir de available=true.

**Captura real fornecida pelo usuário**: cópia sem edição em
[t26-2026-09-14-conversa-repeticao.jpg](evidencia/t26-2026-09-14-conversa-repeticao.jpg),
SHA-256 7355f84d304a7c975d327697c18e4fa9d7d5f842bfe48863372d8658290cb0c2.
Mostra convite, aceite, perguntas redundantes e confirmação com Meet;
não mostra a conversa completa nem a apresentação anterior do imóvel.

**Recomendação para revisão pontual**: orientar o encerramento do turno depois
de uma pergunta enviada com ok=true, sem repetir a mesma solicitação com outras
palavras. Retentar somente mensagens rejeitadas com ok=false, corrigindo a causa
da rejeição. Manter até três mensagens complementares para imóvel e convite,
sem impor uma única mensagem a todos os turnos. Ajuste de prompt é a opção mínima;
uma barreira semântica no responder exige novo estado/critério de equivalência,
e limitar globalmente a uma mensagem prejudica o formato aprovado.
Incluir testes das instruções e repetir prova real; testes de prompt não garantem
obediência do modelo. Implementação ainda não aprovada para esta nova revisão.

Principal reconsultado: active=true, activeVersionId
833f525c-4d59-43a2-b466-8ef8268a0468, 62 nós. Sem publicação, push ou deploy.
T26–T29 e Verifier final continuam abertos; este registro não declara lote concluído.

**Gate documental**: validate_tasks.py exit 0 (avisos existentes), validate_spec.py
exit 0, check_commit.py OK e git diff --check exit 0. Decisions comparadas contra
HEAD com CRLF normalizado: conteúdo integral preservado. Captura comparada byte
a byte ao anexo: igual. Sem novo código de produto; suíte/lint/build da T33 não
repetidos para esta análise documental. Nenhuma task adicional declarada Done.

## 39. T35 — encerrar o turno após pergunta entregue (2026-09-14)

**PASS local; publicação pendente**. Usuário aprovou a recomendação do §38 com
“Eu aprovo”. Escopo mantido na opção mínima: instrução de prompt, sem novo estado,
barreira semântica, limite global de um balão ou alteração em responder_lead.

RED: após acrescentar os casos derivados de BUSCA-05 AC25 e antes da implementação,
system-message.test.ts teve 10 falhas / 153 passes. As cinco regras faltaram nas
duas fases parametrizadas, qualificando e agendando. Nenhum teste anterior falhou.

GREEN: TERMINAL_QUESTION_INSTRUCTION orienta que ok=true depois de pergunta ou
solicitação terminal encerra o turno; proíbe paráfrase/repetição/reforço; diferencia
ok=false e permite corrigir a rejeição; preserva mensagens anteriores com funções
complementares. Integrada em buildSystemMessage para ambas as fases.

Gate quick completo da camada: `npx vitest run n8n/src`, **296 testes / 9 arquivos**,
exit 0. Focado anterior: 163 testes no arquivo, exit 0. `node scripts/n8n-inline.mjs`
regenerou seis artefatos; comparação byte a byte de cada saída contra
inlineWorkflowSource passou, seis de seis. Diff semântico gerado somente no principal.
Artefato compilado: 62 nós, maxIterations 8, instrução presente. SHA-256 do jsCode
local: 3822f108129719e50ebddc0f50ad795bdcc487ad62b98f9bf2f528990c449ff1.

### Adequação A — cobertura suficiente

| Cláusula da AC25 | Evidência exata | Resultado definido | Coberta |
| --- | --- | --- | --- |
| ok=true encerra e espera | n8n/src/__tests__/system-message.test.ts:866 — `expect(message).toContain("Se responder_lead devolver ok=true ... encerre imediatamente o turno e espere o lead responder")` | Esperar o próximo turno do lead | Sim |
| Não repetir a solicitação entregue | n8n/src/__tests__/system-message.test.ts:870 — `expect(message).toContain("não chame responder_lead de novo para reformular, repetir, reforçar ou exemplificar essa pergunta ou solicitação")` | Zero paráfrase após sucesso | Sim |
| ok=false permite correção | n8n/src/__tests__/system-message.test.ts:874 — `expect(message).toContain("Se responder_lead devolver ok=false, corrija exatamente o motivo da rejeição e tente novamente")` | Retry só após corrigir rejeição | Sim |
| Distinguir rejeitado de entregue | n8n/src/__tests__/system-message.test.ts:878 — `expect(message).toContain("Uma tentativa rejeitada não foi enviada ao lead; uma tentativa com ok=true já foi entregue e nunca precisa de paráfrase")` | Estados não confundidos | Sim |
| Preservar complementares | n8n/src/__tests__/system-message.test.ts:882 — `expect(message).toContain("Você ainda pode usar mensagens complementares antes da pergunta terminal quando elas têm funções diferentes, como apresentar um imóvel e depois fazer o convite")` | Imóvel e convite ainda podem ser separados | Sim |
| Não impor um balão global | n8n/src/__tests__/system-message.test.ts:883 — `expect(message).toContain("Esta regra não reduz o limite global para uma mensagem")` | Teto anterior preservado | Sim |

O describe.each em :862 executa cada asserção para qualificando e agendando,
produzindo 10 casos. Asserções checam cada cláusula textual separadamente; remover
qualquer uma das frases correspondentes mata o caso. Não dependem de call count,
mock ou simples ausência de erro. Não há payload/conjunção persistida nesta task.

### Adequação C — necessidade

| Asserção | Mapeamento | Manter |
| --- | --- | --- |
| :866 fim do turno | BUSCA-05 AC25, primeira cláusula | Sim |
| :870 sem repetição | BUSCA-05 AC25, SHALL NOT | Sim |
| :874 retry corrigido | BUSCA-05 AC25, ok=false | Sim |
| :878 distinção de retorno | BUSCA-05 AC25, fronteira sucesso/rejeição | Sim |
| :882 complementares | BUSCA-05 AC25, preservação do formato | Sim |
| :883 sem limite de um | BUSCA-05 AC25, limite de três preservado | Sim |

Check B: nenhuma asserção rasa; cada mutação textual plausível falha. Check D:
co-localização segue a Test Coverage Matrix; AGENTS.md/CLAUDE.md não adicionam regra
de teste para módulo n8n. Sem SPEC_DEVIATION. Solução é uma constante e uma entrada
na composição existente; não introduz abstração. T35 marcada Done antes do commit.

Publicação, reset e nova conversa real não realizados. Testes comprovam a presença
da instrução, não a obediência do modelo. T26–T29 e Verifier final seguem abertos.

## 40. T36 — publicação autorizada da T35 (2026-09-14)

**PASS publicação**. Usuário autorizou “Pode publicar”. Artefato local do commit
1f90d74 validado pelo SDK: valid=true, 62 nós; cinco avisos conhecidos dos Memory
Managers. Modelo, memória e workflow auxiliar não alterados.

Baseline remoto ativo/draft 833f525c-4d59-43a2-b466-8ef8268a0468. Uma operação
updateNodeParameters, replace=false, somente em `Code: montar system message e
marcar campo perguntado.parameters.jsCode`. Novo draft
538b04fd-6682-4690-b0e7-9c2c1452866e. Comparação antes de ativar: exatamente um
caminho diferente; connections, settings e nodeGroups iguais; nomes e contagem dos
62 nós preservados. jsCode remoto normalizado igual ao artefato local, SHA-256
3822f108129719e50ebddc0f50ad795bdcc487ad62b98f9bf2f528990c449ff1.

publish_workflow com versionId explícito retornou success=true. Leitura posterior:
active=true, versionId=activeVersionId=538b04fd-6682-4690-b0e7-9c2c1452866e,
62 nós, maxIterations 8, draft nodes/connections iguais à activeVersion e código
igual ao draft conferido. Aviso adicional de builtInTools apareceu no update e é
herdado; definição inteira do modelo não mudou.

Sem reset, mensagem externa, evento Calendar, push ou deploy nesta publicação.
Usuário aceitou a última sessão como sucesso e autorizou fechar as tasks de conversa;
isso será registrado separadamente em T26/T27, sem atribuir obediência à T35 antes
de uma nova conversa.

## 41. T26 — prova conversacional do inventário concluída (2026-09-14)

**PASS por desfecho, aprovado pelo usuário**: “Pode considerar também essas tasks
de conversação como finalizadas. A ultima sessão foi um sucesso.” A observação de
qualidade das duas perguntas redundantes permanece no §38 e motivou T35/T36, mas
não apaga os desfechos funcionais já comprovados.

PROVA-02 AC3: execução 2327 e banco em §34 confirmam IM-0001 e R$ 380.000,00.
PROVA-02 AC4: execução 2335, chamada válida corrigida, devolveu total=0 e a resposta
declarou ausência sem citar imóvel. Os oito turnos daquela rodada e a filha 2360
foram conferidos individualmente por get_execution. Máximo seis runs do modelo.

Captura real registrada em §38:
evidencia/t26-2026-09-14-conversa-repeticao.jpg, cópia byte a byte do anexo, hash
7355f84d304a7c975d327697c18e4fa9d7d5f842bfe48863372d8658290cb0c2. Ela mostra
o desfecho de convite/agendamento; a conversa completa permanece provada pelo CRM
e pelas execuções registradas nos §34/38.

Gate build executado integralmente e sozinho após T36: `npx vitest run` **1.357
testes / 91 arquivos**, exit 0, 675,05 s; lint exit 0, zero erros e os três avisos
prévios; Next.js build exit 0. Avisos conhecidos de Better Auth no build local,
sem regressão ou mudança de autenticação. T26 marcada Done antes do commit atômico.

## 42. T27 — regressão qualificar→agendar concluída (2026-09-14)

**PASS por desfecho, aprovado pelo usuário**. Preparação anterior ao cenário:
§37 registra n8n reset 2370, remoção do lembrete antigo 2372 e CRM remaining=0,
sempre na ordem n8n→CRM. A terceira conversa nasceu com lead novo
e1cefc16-d030-4d27-b199-b3e600d2d526 e estado limpo.

Seis execuções principais conferidas individualmente por get_execution:
2373, 2379, 2387, 2393, 2406 e 2416. O turno 2406 chamou agendar_reuniao;
filha **2407**, workflow 2qCs6rPzmeOqan65, status success,
18:25:51.509Z–18:25:53.158Z, retryOf=null. Availability devolveu true; PATCH CRM
devolveu HTTP 200 e atribuiu André Luiz Martins. CRM READ ONLY confirmou status
qualificado_agendado, meeting_at=2026-09-15T18:00:00Z e assigned_user_id
3ea96a1f-3fb4-436b-a4ab-862dbf36f394.

Google Calendar criou evento **gpupvvmct9lvbt4qsm3n7b83t8**, status confirmed,
15/09/2026 15:00–15:30 America/Sao_Paulo, com André convidado e conferência
success. Meet https://meet.google.com/rkw-xtya-fmv, igual ao enviado ao lead.
Lembrete agenda_envios id 17 criado. A conversa terminou com agradecimento e o
usuário declarou a última sessão um sucesso. PROVA-02 AC7 atendida.

Gate build repetido integralmente e sozinho a partir do commit de T26:
1.357 testes / 91 arquivos, exit 0, **662,10 s**; lint exit 0, zero erros e os
três avisos prévios; Next.js build exit 0. Avisos locais conhecidos de Better Auth,
sem regressão. T27 marcada Done antes do commit atômico.

## 43. T28 — supersessão parcial de VOZ-02 AC5 (2026-09-14)

**PASS**. Nota acrescentada imediatamente após VOZ-02 AC5 no spec do lote 6c.
Parte superseded: o agente não precisa mais encaminhar ao corretor todo pedido de
imóveis, opções ou valores; pode buscar e apresentar resultado/preço reais via
buscar_imoveis. Parte preservada: fotos/arquivos continuam com o corretor, pedir
esses itens não causa escalonamento, e AC3 ainda barra promessa futura de
buscar/enviar. Executar a tool e responder seu resultado não é promessa futura.

Diff do spec histórico contém somente a nota nova. Requirement Traceability,
veredito do Verifier, Success Criteria e validation.md do lote 6c não foram
reescritos. Isso preserva a prova histórica e explicita a regra atual.

Gate build integral e isolado: 1.357 testes / 91 arquivos, exit 0, **660,02 s**;
lint exit 0, zero erros e três avisos prévios; Next.js build exit 0. Avisos conhecidos
de Better Auth, sem mudança no código de autenticação. T28 marcada Done antes do commit.
