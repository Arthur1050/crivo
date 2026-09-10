# Bateria de tool calling — procedimento

Procedimento da bateria que serve de **portão de rollback** da troca de modelo do lote-10
(MOD-02; MOD-01 AC3/AC4/AC5). Este arquivo descreve **como rodar** e **como julgar**; os resultados
de cada rodada — com id de execução — ficam em `n8n/smoke/evidencia.md`, nunca aqui.

O que a bateria mede: se o modelo publicado no nó `OpenAI Chat Model` **chama as 5 tools** e
**sobrevive a uma recusa do CRM**. O que ela **não** mede: qualidade de fala, desfecho de conversa,
entrega no WhatsApp. Isso é a prova conversacional (Fase 5), sobre número real, e não é assunto
deste arquivo.

---

## 1. Alvo — lead de descarte, nunca o número do smoke

| Item | Valor |
| --- | --- |
| Tenant | `triangulo` (único com linha em `tenant_config`) |
| `phoneNumberId` | `1321478747709350` (linha `id: 2` de `tenant_config`, `xRHckWWd6fxGeNta`) |
| `calendarId` do tenant | `tostamatias@gmail.com` |
| `waId` da bateria | **`553490000010`** — fictício, 12 dígitos no formato legado da Meta, prefixo local `9000-0010` |
| Lead no CRM | criado pelo próprio fluxo (`POST /leads` idempotente por `externalId`) — é o **lead de descarte** |

> **PROIBIDO nesta bateria: o `waId` `553499532444`.** É o número de teste homologado, o mesmo que a
> prova conversacional (Fase 5) usa. Encostar nele aqui contamina o roteiro do smoke — o lead do
> roteiro ficaria com histórico, `conversa_estado` e memória de uma bateria que não é o cenário.
> A bateria e o smoke compartilham o tenant de propósito (elimina uma variável entre as duas), mas
> **nunca** o `waId`.

`553490000010` não é um destinatário válido na lista permitida da Meta. Isso é deliberado e tem
consequência declarada na §3: as duas tools que enviam para fora (`responder_lead`, `agendar_reuniao`)
alcançam serviços externos reais que vão recusar um destinatário fictício. **Essa recusa externa não
conta contra o modelo** — o que a bateria julga é a chamada de tool, não a entrega.

---

## 2. Mecanismo de disparo

`crivo-agente-principal` (`0B1nqjODu7xuYYKF`) dispara por `whatsAppTrigger`. `execute_workflow` do
MCP **não** aceita esse tipo de trigger (só Schedule/Webhook/Form/Chat/Manual — registrado em
`n8n/README.md` §12.2). O disparo da bateria é portanto:

**`test_workflow` com `pinData` SÓ no nó `WhatsApp Trigger`.** Nenhum outro nó é pinado — os nós
HTTP, as 5 tools, o `OpenAI Chat Model`, a memória Postgres e os dois sub-workflows rodam de
verdade. Pinar qualquer outro nó invalidaria a bateria: um `registrar_qualificacao` pinado provaria
que o pin funciona, não que o modelo chama a tool.

Formato do `pinData` (o `value` **achatado** do webhook da Meta — é como o nó entrega o item em
produção; confirmado no `prepare_test_pin_data` deste workflow e na execução `1627`):

```json
{
  "WhatsApp Trigger": [
    {
      "json": {
        "messaging_product": "whatsapp",
        "metadata": { "display_phone_number": "15550001111", "phone_number_id": "1321478747709350" },
        "contacts": [{ "profile": { "name": "Lead Descarte Bateria" }, "wa_id": "553490000010" }],
        "messages": [
          {
            "from": "553490000010",
            "id": "wamid.BATERIA-L10-<n>",
            "timestamp": "<epoch em segundos>",
            "type": "text",
            "text": { "body": "<texto do turno>" }
          }
        ],
        "field": "messages"
      }
    }
  ]
}
```

Duas regras de operação, ambas com motivo:

1. **`id` da mensagem único por turno** (`wamid.BATERIA-L10-1`, `-2`, …). O debounce de 10s decide
   quem segue pelo `messageId` mais recente do buffer (`Code: ainda sou a mensagem mais recente?`) —
   repetir o mesmo id faz um turno matar o outro.
2. **Um turno de cada vez**, esperando a execução anterior terminar. `timeout` do `test_workflow` em
   pelo menos **180s**: o turno tem 10s de debounce + o turno do agente com `timeout: 120000` no nó
   de modelo.

---

## 3. As 5 tools — o que conta como chamada bem-sucedida

**Definição única, aplicada igual às cinco** (é o que torna o critério da §5 verificável e não
opinativo):

> Uma tool tem **chamada bem-sucedida** quando, nos dados da execução, o nó `AI Agent` registra um
> passo com `action.tool === "<nome da tool>"` **e** a `observation` correspondente daquele passo —
> isto é, o modelo emitiu a chamada com argumentos e recebeu a resposta da tool de volta no mesmo
> turno.

O que **não** faz parte da definição, e por quê:

- **O efeito externo não conta.** Meta recusando `5534990000010` (erro 131030, destinatário fora da
  lista permitida) ou o Google Calendar recusando o evento são falhas do ambiente de descarte, não
  do modelo. O modelo terminou o trabalho dele quando emitiu argumentos bem formados.
- **Uma recusa de negócio do CRM (`400`/`409` com corpo `problem+json`) conta como chamada
  bem-sucedida.** As 3 tools nativas têm `neverError: true`; a recusa chega ao agente como corpo com
  `code`, que é exatamente o canal de correção que a §4 exercita.

| # | Tool | Turno que a induz | Chamada bem-sucedida quando |
| --- | --- | --- | --- |
| 1 | `registrar_qualificacao` | Lead revela um campo espontaneamente ("procuro apartamento usado no bairro Abadia") | Passo com `action.tool = "registrar_qualificacao"` e `observation` — inclusive quando o corpo é `{"code":"payload-invalido"}` |
| 2 | `consultar_documentos` | Lead pergunta o que precisa levar / quais documentos a imobiliária pede | Passo com `action.tool = "consultar_documentos"` e `observation` com a lista (ou a recusa) do `GET /context` |
| 3 | `responder_lead` | Todo turno — é a única via de resposta | Passo com `action.tool = "responder_lead"` e `observation`. Vale mesmo se a `observation` for a falha de envio ao número fictício |
| 4 | `agendar_reuniao` | Só na fase `agendando` (os 3 obrigatórios já perguntados): lead aceita/propõe um horário dentro do horário comercial | Passo com `action.tool = "agendar_reuniao"` e `observation` — inclusive `horario-ocupado` ou `fora-do-horario-comercial` |
| 5 | `escalar_para_humano` | Lead pede algo que só humano resolve ("preciso falar com uma pessoa sobre uma pendência no meu nome") | Passo com `action.tool = "escalar_para_humano"` e `observation` |

**Fase `agendando` custa turnos**: `resolveConversationPhase` (`n8n/src/phase.mjs`) só vira
`agendando` depois que os 3 campos obrigatórios (`modality`, `region`, `propertyType`) foram
**perguntados** pelo agente — um por turno (`Code: montar system message e marcar campo perguntado`).
Antes disso o system message manda explicitamente NÃO agendar. Logo `agendar_reuniao` não é
alcançável antes do 4º turno, e uma tentativa mais cedo não é reprovação da tool — é roteiro errado.

---

## 4. Ordem obrigatória dos turnos

`escalar_para_humano` é **sempre o último**. Motivo, não convenção: `gate.mjs:70` devolve
`somente-registrar` para todo `status === "escalado_humano"`, e a rota `somente-registrar` **nunca
alcança o agente**. Chamar essa tool trava o lead de descarte para sempre — nenhuma tool posterior
seria exercitável sem apagar o lead e recomeçar a bateria do zero.

| Turno | Intenção do lead | Tool alvo |
| --- | --- | --- |
| 1 | Interesse inicial + revela modalidade ("vi o anúncio, procuro um usado") | `registrar_qualificacao`, `responder_lead` |
| 2 | Revela região e pergunta quais documentos precisa levar | `registrar_qualificacao`, `consultar_documentos`, `responder_lead` |
| 3 | Revela tipo de imóvel + o **caso do enum inválido** (§5) | `registrar_qualificacao` (recusada), `responder_lead` |
| 4 | Aceita conversar com o corretor e propõe um horário comercial concreto | `agendar_reuniao`, `responder_lead` |
| 5 | Pede explicitamente falar com uma pessoa sobre algo que só humano resolve | `escalar_para_humano`, `responder_lead` |

**Orçamento de tentativas: no máximo 2 rodadas completas** (turnos 1-5). Uma tool que não apareceu na
1ª rodada ganha uma 2ª chance com um turno reescrito para induzi-la mais diretamente. Depois da 2ª
rodada, "não chamada" é resultado, não falta de tentativa — e é o que a §6 R1 lê. Recomeçar exige
limpar os alvos da §7 antes, porque o lead da 1ª rodada já pode estar travado.

---

## 5. O caso do enum inválido

**O que provocar**: o lead diz uma motivação que não existe no enum do CRM — o mesmo gesto da
execução `462` no Gemini, onde o agente mandou `motivation: "morar sozinho"` e levou `400`. O enum
real é `investidor | morador` (`src/db/schema.ts:30-31`); `creditStatus` é
`pre_aprovado | recurso_proprio | fgts` (`schema.ts:35-36`), e a fixture
`n8n/fixtures/llm-invalid-enum.json` já registra o valor inválido `creditStatus:
"recurso_proprio_fgts"`.

Turno sugerido (intenção, não fala literal): *o lead diz que está comprando para morar sozinho e que
vai usar recurso próprio junto com FGTS* — as duas coisas empurram o modelo para um valor fora do
enum, e basta uma delas cair fora para produzir a recusa.

**Recusa esperada**: `400` com corpo `problem+json` e `code: "payload-invalido"`, entregue ao agente
como `observation` da tool (as 3 tools nativas têm `neverError: true` justamente para o `code`
chegar íntegro).

**Comportamento esperado do agente** (referência: execução `462`, Gemini): o agente **segue o
turno** — não trava, não aborta a execução, e chega a `responder_lead`. Corrigir o valor e repetir a
chamada com um valor válido é bom, mas **não é exigido**; ignorar aquele campo e seguir também
aprova. O que reprova está na §6 R2.

---

## 6. Critério — condição binária, avaliada sobre fatos observáveis

O veredito é lido dos dados de execução, item a item. Nada aqui depende de achar a conversa boa.

**R1 — cobertura das 5 tools.**
`R1 = verdadeiro` se, ao fim do orçamento de 2 rodadas da §4, **alguma** das 5 tools tiver **zero**
passos `action.tool` registrados no nó `AI Agent` em todas as execuções da bateria.

**R2 — sobrevivência à recusa.**
`R2 = verdadeiro` se **qualquer uma** destas for observada no turno do enum inválido (§5):

- a execução do turno termina com `status: "error"` originado no nó `AI Agent`; **ou**
- o turno termina **sem nenhum** passo `action.tool = "responder_lead"` (o lead fica no vácuo); **ou**
- o agente repete a **mesma** chamada com o **mesmo** valor inválido **3 vezes ou mais** no mesmo
  turno (laço, em vez de correção ou desistência).

**Veredito:**

| Condição | Veredito | Ação |
| --- | --- | --- |
| `R1 = falso` **e** `R2 = falso` | **APROVADO** | Modelo fica. Nenhuma mudança de código. A Fase 4 (roteiro) e a Fase 5 (smoke) correm em `gpt-5.4-nano-2026-03-17` |
| `R1 = verdadeiro` **ou** `R2 = verdadeiro` | **REPROVADO** | Rollback (§6.1) |

**6.1 Rollback, se reprovado**: o nó `agentModel` de `n8n/workflows/principal.ts` volta a
`@n8n/n8n-nodes-langchain.lmChatGoogleGemini` v1.1 / `models/gemini-3.5-flash-lite` /
`temperature: 0.4` (recuperável em `git show ae859e9:n8n/workflows/principal.ts`), o inliner roda, a
instância é republicada via MCP, e `n8n/workflows/__tests__/principal-modelo.test.ts` é atualizado
para o modelo revertido. O **motivo** — qual R disparou e com que evidência — é registrado em
`evidencia.md`; "reprovou" sozinho não é registro. O smoke roda mesmo assim, no Gemini: bateria
reprovada reverte o modelo, não cancela o lote.

**6.2 Quando o veredito é AMBÍGUO — e o que fazer.** A tabela acima é binária **sobre fatos
observáveis**. Se um fato exigido não puder ser observado, o veredito **não** é nem aprovado nem
reprovado, e quem decide é o orquestrador/usuário — nunca o executor da bateria, e nunca
"interpretando a favor". São ambíguos, por exemplo:

- os dados da execução não trazem os passos do `AI Agent` (execução sem `runData` do nó, ou truncada);
- a tool rodou de verdade mas os passos do agente não mostram a `observation` — não dá para dizer se
  o modelo recebeu a resposta;
- o agente reagiu ao enum inválido de um jeito que nenhuma cláusula de R2 descreve (ex.: trocou o
  campo, chamou outra tool no lugar, ou respondeu ao lead algo sobre o erro do sistema);
- a execução falhou por causa **alheia ao modelo** (credencial, quota, rede) — isso não é R1 nem R2:
  é bateria não realizada, e a rodada não conta contra o orçamento da §4.

Nesse caso: registrar em `evidencia.md` o máximo de detalhe (id de execução, o que foi observado, o
que faltou), **não disparar rollback**, e parar.

---

## 7. Limpeza depois da bateria

O lead de descarte não é o lead do smoke, mas mora nos mesmos três sistemas — e a bateria pode ter
deixado um evento no calendário real do tenant. Antes da Fase 5:

1. Sessão `"triangulo:553490000010"` em `n8n_chat_histories` (Postgres da instância n8n).
2. Linha de `conversa_estado` (`ZsplBxJjXv3kwKZ8`) casada por `tenantSlug = triangulo` +
   `waId = 553490000010`.
3. Lead de descarte no CRM (`externalId = 553490000010`), na ordem `messages` → `conversations` →
   `leads`.
4. **Evento no Google Calendar** de `tostamatias@gmail.com`, se o turno 4 tiver criado um — a
   `agendar_reuniao` cria evento real com Meet. Sem apagar, um horário fantasma fica ocupado e pode
   derrubar o cenário 1 do smoke com `horario-ocupado`.

A ordem e o motivo detalhado dos alvos 1-3 são os mesmos do checklist de `n8n/smoke/roteiro.md` —
este arquivo não os duplica, só acrescenta o alvo 4, que é exclusivo da bateria.
