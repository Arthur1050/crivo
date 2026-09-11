# Prova conversacional — roteiro dos cenários

Roteiro reexecutável dos **três desfechos** que a AD-015 deferiu em 2026-08-09 e que o lote-10
(SMK-01/SMK-06) executou por conversa real no WhatsApp: **qualificar→agendar**, **escalar para
humano** e **opt-out por palavra-chave**. O lote-11 acrescenta um quarto cenário (§9 — **consulta de
inventário**, BUSCA-05/PROVA-01/02), sob o mesmo protocolo (AD-027): a AD-027 nomeia "nova tool"
explicitamente como caso de uso obrigatório.

Este arquivo descreve **o que conduzir** e **como julgar**. Os resultados de cada cenário — id de
execução, captura do CRM, link do evento — ficam em `n8n/smoke/evidencia.md`, nunca aqui. É o mesmo
contrato de `n8n/smoke/bateria.md`: procedimento aqui, evidência lá.

**O que este roteiro prova**: que os três desfechos existem no CRM depois de uma conversa humana
real, no modelo publicado. **O que ele não prova**: qualidade de fala, cobertura das 5 tools (isso é
a bateria, `bateria.md`), nem multi-tenancy (MTN-01, condicional, fora destes três cenários).

---

## 1. Alvo comum aos três cenários

| Item | Valor |
| --- | --- |
| Tenant | `triangulo` (único com linha em `tenant_config`) |
| `phoneNumberId` | `1321478747709350` |
| `calendarId` do tenant | `tostamatias@gmail.com` |
| `waId` do lead | **`553499532444`** — número de teste homologado na lista permitida da Meta |
| Quem conduz | **O usuário, digitando no WhatsApp do próprio aparelho.** Nenhuma automação envia mensagem em nome do lead — `test_workflow`/`pinData` é mecanismo da bateria, não desta prova |
| Modelo | o que o veredito de T9 determinou: `gpt-5.4-nano-2026-03-17` (`lmChatOpenAi` v1.3) |

> **O aparelho já tem histórico.** A rodada final da bateria (T9) rodou sobre este mesmo
> `553499532444` por autorização explícita do usuário (`evidencia.md` §12.1) e **entregou 5 mensagens
> reais** ao aparelho. Isso não invalida nada aqui: a limpeza do checklist zera os três sistemas
> (CRM, `conversa_estado`, memória), e é isso que o fluxo enxerga. O que sobra é histórico visual na
> tela do WhatsApp — **a Fase 5 não é "primeira conversa" no aparelho, só no CRM e no n8n**. Ler as
> mensagens antigas na tela como parte do cenário é erro de leitura, não sujeira de estado.

---

## 2. Regras que valem para os três cenários

**2.1 Turnos são intenção, nunca fala literal.** As tabelas de cada cenário dizem *o que o lead
quer dizer naquele turno*, não a frase a copiar. O agente não é determinístico: a bateria rodou o
mesmo roteiro duas vezes e produziu respostas diferentes, com número de tools e de iterações
diferentes por turno (`evidencia.md` §9.2 vs §12.3). Um roteiro com fala literal daria a falsa
impressão de que a divergência entre rodadas é defeito.

A única exceção é o **cenário 3**, onde a palavra-chave do opt-out **é literal por contrato**
(`gate.mjs:31-38` compara a mensagem inteira normalizada). Está marcada como literal lá, e só lá.

**2.2 Um cenário por vez, com limpeza no meio.** `gate.mjs:67-72` é terminal em dois estados
(`optedOutAt` preenchido e `status = escalado_humano`) e o lead é idempotente por `externalId` — sem
a limpeza do checklist entre um cenário e o próximo, os cenários 2 e 3 **não alcançam o
agente**. A ordem 1 → 2 → 3 não é preferência: o cenário 2 precisa de um lead em `em_qualificacao`, e só a limpeza
devolve o lead a esse estado.

**2.3 A ordem interna dos cenários 1 e 2 importa, por causa da máquina de transições.**
`TRANSITIONS` (`src/server/integration/leads.ts:96-100`) permite `em_qualificacao →
qualificado_agendado` e `em_qualificacao → escalado_humano`, e **nada** sai de `qualificado_agendado`.
Consequência prática para o cenário 2: se o agente agendar antes de o lead pedir por uma pessoa, a
`escalar_para_humano` volta `409 transicao-invalida` e o desfecho fica inalcançável naquele lead — foi
exatamente o que aconteceu na bateria (`evidencia.md` §12.4). Por isso o cenário 2 pede humano
**cedo**, e nunca aceita nem propõe horário.

**2.4 Persona (AD-016) é expectativa, não critério.** O agente não se anuncia como IA por iniciativa
própria, confirma quando perguntado, fala pt-BR informal **sem emoji**, e entrega **1 a 3 mensagens**
por turno (teto no validador determinístico, não só no prompt). Nada disso reprova cenário: entra
na §8, observações de estilo.

**2.5 Nenhum `npx vitest run` durante a Fase 5.** `src/db/__tests__/seed.test.ts` roda `runSeed()` e
**rotaciona as chaves do seed** — uma rodada de teste no meio de um cenário derruba a autenticação do
agente com `401`, por motivo alheio ao modelo (`n8n/README.md` §4). O congelamento é declarado em T12
e só encerra em T16.

**2.6 Estouro de `maxIterations` termina o turno em silêncio.** Comportamento aceito (DOC-01). Um
turno mudo **não reprova o cenário** desde que o estado final exigido seja atingido — reenviar a
mensagem do turno é legítimo e fica registrado como observação.

---

## 3. Cenário 1 — qualificar → agendar (AGT-04, SMK-02)

**Objetivo**: o lead chega com interesse, responde às 3 obrigatórias e aceita um horário; o CRM
grava a reunião, escolhe o corretor responsável e o Google Calendar ganha um evento com Meet.

**Estado inicial exigido**: os três alvos do checklist confirmados limpos. Lead nasce
`status = em_qualificacao`, sem responsável, `fase = qualificando`, `perguntadosJson = []`.

**Pré-condição própria**: um horário-alvo **livre** na agenda de `tostamatias@gmail.com`, em dia útil
dentro do horário comercial do tenant (fallback seg-sex 09:00-18:00, `n8n/src/business-hours.mjs`).
Se a agenda ainda tiver o evento residual da bateria, `agendar_reuniao` devolve `horario-ocupado` e o
cenário morre por ambiente, não por modelo.

| Turno | Intenção do lead | O que precisa acontecer no sistema |
| --- | --- | --- |
| 1 | Diz que viu o anúncio e tem interesse; revela espontaneamente a **modalidade** (novo ou usado) | Lead criado (`POST /leads` idempotente); `registrar_qualificacao`; agente pergunta **um** campo obrigatório |
| 2 | Responde o campo perguntado e revela a **região** de interesse | `registrar_qualificacao`; agente pergunta o próximo obrigatório |
| 3 | Responde o **tipo de imóvel** (casa ou apartamento) | Os 3 obrigatórios agora estão **perguntados** → `resolveConversationPhase` vira `agendando` |
| 4 | Aceita conversar com o corretor e **aceita ou propõe um horário concreto**, em dia útil e dentro do horário comercial | `agendar_reuniao` com `ok: true`, `eventoCriado: true`, `meetLink` não nulo; CRM grava `meetingAt` e escolhe o corretor (AD-022) |
| 5 | Confirma / agradece | Agente confirma a reunião com data e hora; nenhuma tool nova é exigida |

> A fase pode virar `agendando` **um turno antes** do esperado: o nó `Data Table: marcar campo
> perguntado` marca o campo **antes** de o agente rodar, então o 3º turno já pode habilitar o
> agendamento (`evidencia.md` §9.5, §12.8). Isso **não** é desvio de roteiro — se o agente propuser
> horário no turno 3, o lead aceita ali e o cenário fecha mais cedo.

**Desfecho exigido — é isto que aprova ou reprova:**

1. Lead no CRM com **`status = qualificado_agendado`** e `meetingAt` preenchido no horário combinado.
2. **Responsável atribuído** (`assignedUserId` não nulo) — a escolha é server-side, no agendamento.
3. **Evento no Google Calendar** de `tostamatias@gmail.com`, no horário combinado, **com link do
   Google Meet**.

> **Nota de nomenclatura, deliberada.** O `spec.md` deste lote (P1-smoke AC2), o `design.md` e o
> `tasks.md` escrevem o desfecho como `status = reuniao_agendada`. **Esse valor não existe**: o enum
> `lead_status` (`src/db/schema.ts:16-20`) tem exatamente `em_qualificacao`,
> `qualificado_agendado` e `escalado_humano`. `reuniao_agendada` é um nome de rascunho que sobreviveu
> ao planejamento. O roteiro exige o valor **real** — `qualificado_agendado` — porque uma barra de
> aprovação que nomeia um estado impossível nunca poderia ser satisfeita. A divergência é de redação
> na spec, não de comportamento.

**Evidência a coletar**: id da execução n8n do turno do agendamento; captura da tela do CRM com
status, `meetingAt` e responsável; **link do evento** no Calendar (o `meetLink` devolvido pela tool).

---

## 4. Cenário 2 — escalar para humano (AGT-05, SMK-03)

**Objetivo**: o lead pede algo que só uma pessoa resolve, o lead vira `escalado_humano` **com
responsável**, e a mensagem seguinte fica **sem nenhuma resposta do agente**.

**Estado inicial exigido**: os três alvos do checklist confirmados limpos depois do cenário 1 —
lead de novo em `em_qualificacao` (§2.3).

**Pré-condição própria**: o tenant `triangulo` precisa ter **pelo menos um corretor ativo**. A rede
de segurança da AD-022 atribui o de menor carga entre quem está em janela naquele instante e, se
ninguém estiver, entre todos; mas uma imobiliária **sem** corretor ativo registra o escalonamento
assim mesmo, **sem responsável** — e aí o desfecho "com responsável atribuído" fica inalcançável por
configuração, não por defeito.

| Turno | Intenção do lead | O que precisa acontecer no sistema |
| --- | --- | --- |
| 1 | Interesse inicial curto, sem revelar nada de qualificação | Lead criado; agente responde e pergunta um obrigatório |
| 2 | Pede **explicitamente falar com uma pessoa**, por um motivo que só humano resolve (ex.: pendência no nome que trava o financiamento) — **e não aceita nem propõe horário nenhum** | `escalar_para_humano` com `motivo` preenchido; CRM grava `status = escalado_humano` **e** o responsável na mesma operação |
| 3 | Manda **mais uma mensagem qualquer** depois do escalonamento (uma pergunta comum serve) | `gate` roteia `somente-registrar`: a mensagem é **gravada** no CRM e **nenhuma resposta é enviada** |

> O turno 3 é o cenário, não um extra. `status = escalado_humano` sozinho prova que o CRM aceitou a
> transição; **a trava só fica provada pela mensagem seguinte que não é respondida** — é o que a
> AGT-05 AC3 exige e o que `gate.mjs:70` implementa.

**Desfecho exigido:**

1. Lead com **`status = escalado_humano`** e `escalationReason` gravado.
2. **Responsável atribuído** (`assignedUserId` não nulo), com o nome registrado na evidência.
3. A mensagem do turno 3 **existe no CRM** e **não** tem mensagem do agente depois dela; a execução
   correspondente mostra a rota `somente-registrar`.

**Evidência a coletar**: id da execução do escalonamento; **id da execução do turno 3**, mostrando
`somente-registrar`; captura do CRM com status, motivo e responsável; captura da thread mostrando a
última mensagem sem resposta.

---

## 5. Cenário 3 — opt-out por palavra-chave (LGPD-03, SMK-04)

**Objetivo**: o lead escreve a palavra-chave exata, recebe **uma única** confirmação de descadastro,
o CRM grava `optedOutAt`, a memória é purgada pelo próprio fluxo, e nada mais é enviado.

**Estado inicial exigido**: os três alvos do checklist confirmados limpos depois do cenário 2 — sem
isso o lead ainda está `escalado_humano` e o gate nunca chega a avaliar o texto.

| Turno | Intenção do lead | O que precisa acontecer no sistema |
| --- | --- | --- |
| 1 | Interesse inicial qualquer, para a conversa existir e a memória ter conteúdo a purgar | Lead criado; agente responde normalmente |
| 2 | **Literal**: a mensagem inteira é exatamente **`sair`** (ou **`parar`**) — nada além disso | `gate` roteia `opt-out`; `POST /leads/{id}/opt-out` grava `optedOutAt`; memória e `conversa_estado` purgadas no mesmo ramo (MEM-04); **uma** mensagem de confirmação é enviada |
| 3 | Manda mais uma mensagem qualquer depois | `gate` roteia `somente-registrar` (`optedOutAt` vence tudo): mensagem gravada, **nenhuma resposta** |

> **A palavra-chave é a mensagem inteira.** `detectOptOut` normaliza (minúsculas, sem acento, sem
> espaços nas bordas) e compara com `sair`/`parar` **por igualdade** — "quero sair do apartamento"
> **não** dispara opt-out, e isso é deliberado (`gate.mjs:24-38`). Opt-out por linguagem natural é
> L13, fora deste lote. Se o turno 2 for escrito como frase, o cenário não falhou: ele não foi
> executado — repita com a palavra isolada.

> **A confirmação única não é "resposta", é o contrato.** LGPD-03 AC1 exige exatamente uma mensagem
> de descadastro. O silêncio exigido pelo desfecho começa **a partir do turno 3**, não no turno 2.

**Desfecho exigido:**

1. Lead com **`optedOutAt` preenchido** no CRM.
2. Sessão `"triangulo:553499532444"` em `n8n_chat_histories` **purgada pelo próprio fluxo** — não
   pela limpeza manual do checklist. Confirmar **antes** de rodar a limpeza final, ou a prova se
   perde.
3. Exatamente **uma** mensagem enviada ao lead depois da palavra-chave (a confirmação), e **nenhuma**
   depois disso — a mensagem do turno 3 fica gravada e sem resposta.

**Evidência a coletar**: id da execução do opt-out; id da execução do turno 3
(`somente-registrar`); captura do CRM com `optedOutAt`; confirmação da sessão de memória vazia.

---

## 6. Cenário 4 — consulta de inventário (BUSCA-05, PROVA-01/02)

**Objetivo**: o lead pergunta por imóveis dentro de um critério que casa com o catálogo real da
imobiliária, e depois por um critério que não casa com nada — o agente usa `buscar_imoveis` nos dois
turnos e responde de acordo com o que a tool devolveu, nunca inventando.

**Estado inicial exigido**: os três alvos do checklist (§9) confirmados limpos depois do cenário 3 —
lead novo em `em_qualificacao`.

**Pré-condição própria**: o tenant `triangulo` precisa ter, no seed determinístico (SEEDIM-01), pelo
menos um imóvel `disponivel` **e** `publicado` — é o que a tool pode de fato devolver. O critério do
turno 3 precisa ser escolhido para **não** casar com nenhum imóvel do tenant (ex.: um bairro que não
existe no seed, ou uma faixa de preço fora de qualquer imóvel cadastrado) — confirmar isso direto no
banco/seed antes de conduzir o turno, não supor.

| Turno | Intenção do lead | O que precisa acontecer no sistema |
| --- | --- | --- |
| 1 | Interesse inicial curto (ex.: "tô procurando um imóvel por aí") | Lead criado; agente responde e reage ao que foi trazido, sem ainda buscar nada |
| 2 | Pergunta por imóveis com um critério que **casa** com pelo menos um imóvel `disponivel`+`publicado` do seed (ex.: bairro ou tipo de um imóvel real) | `buscar_imoveis` chamada com os critérios como parâmetros de query separados; a tool devolve ao menos 1 imóvel; o agente cita **referência e preço** batendo com a linha do banco, sem endereço exato nem nome de captador |
| 3 | Pergunta por um critério que **não casa** com nenhum imóvel do tenant | `buscar_imoveis` chamada de novo; a tool devolve lista vazia; o agente declara a ausência ao lead e **não cita nenhum imóvel** |

**Desfecho exigido — é isto que aprova ou reprova:**

1. No turno 2, o imóvel citado ao lead tem **referência e preço batendo exatamente** com a linha do
   banco (PROVA-02 AC3) — conferir contra o seed/banco, não de memória.
2. No turno 3, o lead recebe uma declaração de ausência e **nenhum imóvel é citado** nesse turno
   (PROVA-02 AC4).
3. Nenhum dos dois turnos cita endereço exato (logradouro/número/complemento) nem nome do corretor de
   captação.

**Evidência a coletar**: id de execução de cada turno (2 e 3), conferidos por `get_execution` antes de
citados (lição `L-011` — nunca de memória); número de iterações do turno observado e registrado — se
`maxIterations: 8` (`n8n/workflows/principal.ts:1326`) estourar em algum turno, abrir task de correção
dentro do próprio lote (risco nomeado no `design.md`); captura da conversa.

---

## 7. Barra de aprovação — desfecho, nunca estilo

**A regra**: cada cenário é aprovado **exclusivamente** pelo estado final no CRM (mais o evento no
Calendar, no cenário 1). Nada que dependa de achar a conversa boa entra no veredito (SMK-06,
`spec.md` P1-smoke AC7).

| Cenário | Aprova se, e somente se |
| --- | --- |
| 1 — qualificar→agendar | `status = qualificado_agendado` **e** `meetingAt` no horário combinado **e** responsável atribuído **e** evento no Calendar com link do Meet |
| 2 — escalar | `status = escalado_humano` **e** responsável atribuído **e** a mensagem seguinte gravada sem nenhuma resposta do agente |
| 3 — opt-out | `optedOutAt` preenchido **e** sessão de memória purgada pelo fluxo **e** exatamente uma confirmação enviada, com silêncio depois |
| 4 — consulta de inventário | Turno 2 cita imóvel real (referência + preço batendo com o banco) **e** turno 3 declara ausência sem citar nenhum imóvel **e** nenhum dos dois cita endereço exato nem nome de captador |

**Quantos turnos o cenário pode gastar**: o roteiro sugere a quantidade mínima, não um teto. Turnos a
mais — porque o agente perguntou de novo, porque um turno saiu mudo por `maxIterations`, porque a
resposta veio quebrada em três mensagens — **não reprovam**. O que reprova é o desfecho não chegar.

**Se um cenário reprovar**: registrar em `evidencia.md` como reprovado **com o motivo**, e abrir fix
task antes de o requisito correspondente (SMK-02/03/04, e AGT-04/AGT-05/LGPD-03) subir para
`Verified` (`spec.md` P1-smoke AC8). Reprovação por causa **alheia ao modelo** — credencial, quota,
rede, horário ocupado por resíduo, seed rotacionado por `vitest` — é **cenário não realizado**, não
cenário reprovado: registrar como tal e repetir depois de corrigir o ambiente.

---

## 8. Observações de estilo — registradas, sem valor de veredito

Esta seção existe para que a qualidade de fala tenha **onde** ser anotada sem contaminar a barra da
§7. Nenhuma linha daqui reprova cenário; no máximo vira candidata a ajuste de prompt (válvula
limitada da spec: fix task pós-smoke, nunca redesenho da persona da AD-016).

O que anotar, por cenário:

- **Emoji, markdown ou anúncio espontâneo de "assistente virtual"** — os três violam a AD-016 e são
  sinal forte, mas ainda assim observação.
- **Quantidade de mensagens por turno** (o teto é 3) e se a quebra ficou natural.
- **Perguntas por turno**: a persona pede **uma** pergunta de qualificação por turno.
- **Pedido de dado sensível não solicitado** (nome completo, CPF) — apareceu numa rodada da bateria
  (`evidencia.md` §9.7) e não na seguinte; se reaparecer numa conversa real, é decisão de produto.
- **Aberturas barradas** (`abertura-proibida` / `abertura-repetida`): a barreira do `voice.mjs`
  funciona, mas custa iterações — em 100% dos turnos da última rodada da bateria (§12.8). Anotar se o
  usuário percebeu latência por causa disso.
- **Campos não registrados** apesar de o lead ter revelado (`motivation`, `creditStatus`,
  `modality`): sinal de qualidade de qualificação, já observado na bateria. Anotar, não reprovar.
- **Coerência de data/hora** na confirmação da reunião.

---

## 9. Checklist de limpeza entre cenários

Três alvos, em dois sistemas. Nenhum deles avisa quando é esquecido — o cenário seguinte roda e
produz um resultado que parece válido, só que sobre estado velho. A bateria já provou os dois modos
de falha na prática: `evidencia.md` §8 (buffer reidratado, fase pulou direto para `agendando`) e
§9.8/§12.7 (lead antigo reaparecendo pelo `POST /leads` idempotente).

**Ordem obrigatória: n8n (alvos 1 e 2) antes do CRM (alvo 3).** Na ordem inversa, uma mensagem que
chegue no intervalo entre as duas limpezas recria o lead no CRM, e a linha nova de `conversa_estado`
(ou a sessão de memória) que o n8n cria em seguida aponta para um lead que está prestes a ser
apagado — o próximo cenário nasceria com metade do estado velho e metade do novo.

| # | Alvo | Onde | Chave / identificação | Se esquecido |
| --- | --- | --- | --- | --- |
| 1 | Sessão de memória | `n8n_chat_histories` (Postgres da instância n8n) | `"triangulo:553499532444"` (padrão geral: `"<tenantSlug>:<waId>"`, `principal.ts:679`) | O agente do cenário seguinte "lembra" de uma conversa que, para o CRM, nunca aconteceu — mistura contexto de dois desfechos diferentes na mesma resposta |
| 2 | Linha de `conversa_estado` | Data Table `ZsplBxJjXv3kwKZ8` | Casada por `tenantSlug = triangulo` + `waId = 553499532444` (o MCP não apaga linha de Data Table — remover pela UI da Data Table) | `perguntadosJson` chega cheio; a fase pode virar `agendando` no 1º turno, pulando a qualificação que o cenário exige (mesma falha observada em `evidencia.md` §8) |
| 3 | Lead e conversa no CRM | Postgres do CRM, ordem `messages` → `conversations` → `leads` (FKs sem `onDelete`, `src/db/schema.ts:211-229`) | `externalId = 553499532444`, tenant `triangulo` | `POST /leads` idempotente devolve o lead **velho**, com o `status` terminal do cenário anterior ainda gravado — o cenário seguinte nunca começa do zero |

**Confirmação obrigatória antes do próximo cenário**: não confie em metadado de tabela
(`updatedAt`/`search_data_tables` mostram a tabela, não a linha — armadilha já registrada em
`evidencia.md` §8.3). Confirme por execução real: dispare o primeiro turno do cenário seguinte e
confira que o `POST /leads` cria um lead **novo** e que a fase inicial não é `agendando`.

- [ ] Alvo 1 limpo (sessão de memória)
- [ ] Alvo 2 limpo (linha de `conversa_estado`)
- [ ] Alvo 3 limpo (lead + conversa no CRM, ordem `messages` → `conversations` → `leads`)
- [ ] Limpeza confirmada por execução real do turno 1 do cenário seguinte (lead novo, fase não é `agendando`)

Só depois das quatro linhas marcadas o cenário seguinte começa.

---
