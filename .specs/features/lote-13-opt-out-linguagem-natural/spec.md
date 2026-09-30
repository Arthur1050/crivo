# Lote 13 — Opt-out por linguagem natural (LGPD) — Especificação

**Status:** Aprovada (ajustada no Design para o classificador, 2026-09-27) — Design em andamento
**Data:** 2026-09-27

## Problem Statement

O opt-out só é registrado quando a mensagem inteira do lead é exatamente `sair` ou `parar`
(`detectOptOut`, `n8n/src/gate.mjs:35`). Na T21 do lote-7 e de novo na Fase 5 do lote-10, o lead
pediu em português comum para não receber mais mensagens. O modelo entendeu, mas `opted_out_at`
ficou nulo e ele continuou respondendo. Desde o lote-10 o agente orienta o lead a digitar `sair`,
então o registro jurídico ainda depende de o titular acertar uma palavra exata. Além disso, a
confirmação enviada hoje promete uma retomada ("é só nos chamar novamente") que o sistema não
cumpre. É o único item do backlog com consequência jurídica.

## Goals

- [ ] Um pedido explícito de parar, escrito em linguagem natural, grava `opted_out_at` no mesmo turno, pelo mesmo efeito da palavra-chave.
- [ ] Nenhuma frase ambígua ou fora de escopo descadastra um lead, com medição que prova isso antes da publicação.
- [ ] A palavra exata `sair`/`parar` continua funcionando antes do modelo e independente dele.
- [ ] O lead recebe uma confirmação que diz só o que o sistema cumpre.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Reverter um opt-out ou reativar lead descadastrado | Exige definir consentimento renovado; deferido em `context.md`. |
| Opt-out natural para lead em `escalado_humano` | O gate encaminha esse lead para `somente-registrar` antes do agente; pertence ao L14 (humano no laço). A palavra exata continua funcionando nesse estado. |
| Botão no CRM para um humano registrar opt-out | Mesmo motivo; L14. |
| Coluna de origem do opt-out no CRM | A mensagem do pedido já fica gravada na thread do CRM, e a origem se lê pela execução do n8n. |
| Opt-out por áudio ou outra mídia sem texto | A rota `midia` responde sem modelo; fora deste lote. |
| Mudar as palavras-chave ou o contrato de `POST /leads/{id}/opt-out` | O caminho determinístico e o contrato permanecem como estão. |
| Rodar a medição em CI | Mesma decisão da bateria da AD-026: portão manual, com resultado versionado. |
| Trocar o modelo do agente | A AD-026 continua valendo; a medição roda sobre o snapshot atual. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here; nothing remains silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Ritmo da discussão | Guiado | Default da skill; o usuário respondeu duas decisões por vez. | y |
| Registro direto ou confirmação | Híbrido: explícito registra, ambíguo pergunta, e o registro só acontece com resposta afirmativa | Cobre o caso real da T21 sem silenciar para sempre um lead por uma frase ambígua. | y |
| Faixas de intenção | Três faixas: **explícita** (pedido de parar de receber mensagens, de não ser mais contatado, de sair da lista, de não mandarem mais nada), **ambígua** (desinteresse geral sem pedido de parar; número ou pessoa errada), **fora** (desinteresse num imóvel específico; "parar"/"sair" referindo-se a outra coisa) | Decisão do usuário. | y |
| Texto da confirmação | Corrigido: remove a promessa de retomada e vale para os dois caminhos | Não existe caminho de reversão; o texto atual promete algo que o gate impede. | y |
| Texto exato da nova confirmação | "Pronto, registramos seu pedido. Você não vai mais receber mensagens nossas por este número. Até mais!" | Diz só o que o sistema cumpre, sem se anunciar como automação (AD-016). Aceito pelo usuário na aprovação da spec (2026-09-27). | y |
| Barra da medição | Zero registro em frases ambíguas ou fora, somando todas as execuções, e ≥ 90% de registro nas execuções de frases explícitas; se reprovar, o classificador não é publicado e o lote para para decisão | Decisão do usuário: o falso positivo é permanente, e o falso negativo ainda tem a palavra `sair` como rede. | y |
| Repetições e contexto da medição | 3 execuções por frase; cada item carrega a última mensagem do agente que o classificador vê (uma abertura fixa por padrão, e a pergunta de confirmação nos itens que testam a resposta "sim"/"não") | O modelo não é determinístico, o classificador só vê a última mensagem enviada, e o caminho de confirmação da faixa ambígua também precisa ser medido. | agent |
| Classificação ambígua nas frases ambíguas | Reportada na medição, sem barra própria | A barra decidida mede registro, não fala; o caminho de dois turnos é provado no roteiro (OPTPROVA-01). | agent |
| Mensagem mista (pedido explícito junto com outra pergunta) | O pedido de parar vence: registra, envia só a confirmação e não responde o resto | Responder o resto seria mandar mensagem depois de um pedido explícito de parar. | agent |
| Falha do registro | `optedOutAt` continua nulo e o lead recebe uma única mensagem orientando a responder `sair`, sem afirmar que o envio parou | Mantém o comportamento seguro de hoje como degradação e evita promessa falsa (L-013: a degradação precisa de caminho de envio real). | agent |
| Resposta à pergunta depois do corte de sessão de 12h | Tratada como mensagem nova, sem contexto: não registra | A memória é purgada no corte (AD-019), e o modelo não tem a pergunta para interpretar o "sim". | agent |
| Lead em `escalado_humano` | Fora do escopo; a palavra exata continua funcionando | O gate encaminha antes do agente; pertence ao L14. | agent |
| Abordagem | Classificador de intenção (`textClassifier` nativo do n8n) antes do agente, na rota `conversa`. A faixa explícita reutiliza o ramo de opt-out existente; a ambígua segue para o agente com instrução de perguntar; a fora segue normal. Nenhuma tool de opt-out é exposta ao agente | Escolha do usuário no Design (2026-09-27) entre tool no agente e classificador: a mensagem única e a memória vazia passam a ser garantidas pela estrutura do fluxo, e a medição mede exatamente o nó publicado. Custo: uma chamada extra ao modelo por turno de conversa. | y |
| Emenda de ADs | Nova AD registra que um classificador LLM decide a **rota** antes do agente, o fluxo decide **qual** lead e o CRM decide o **efeito**; a palavra exata continua invariante duro no gate. A AD-018 (cláusula de opt-out) e a AD-026 ("não há outro" modelo no produto) recebem `amended by` | O `CLAUDE.md` proíbe contradizer uma AD ativa sem emendá-la. Emenda aprovada pelo usuário (2026-09-27) e ajustada ao classificador no Design. | y |
| Instrução atual de orientação (`OPT_OUT_GUIDANCE_INSTRUCTION`) | Permanece no system message como rede: só atua quando um pedido explícito chega ao agente porque o classificador falhou ou errou | Com o classificador, o agente nunca registra; orientar a digitar `sair` continua sendo a resposta correta nesses casos. | agent |
| Falha do classificador | Erro, tempo esgotado ou categoria não reconhecida seguem para o agente como faixa fora | Na dúvida, não descadastrar: o falso negativo tem a palavra `sair` como rede, o falso positivo é permanente. | agent |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Medir o falso positivo antes de publicar ⭐ MVP

**User Story**: Como responsável pelo produto, quero saber quantas frases fora de escopo o agente descadastraria antes de dar a ele esse poder, porque um opt-out indevido silencia o lead para sempre.

**Why P1**: É a condição de publicação decidida no roadmap e pelo usuário. Sem ela o classificador não vai para produção.

**Acceptance Criteria**:

1. The system SHALL manter no repositório um corpus versionado com no mínimo 20 frases explícitas, 15 ambíguas e 20 fora de escopo, cada uma rotulada com a faixa esperada.
2. The corpus SHALL conter, na faixa explícita, as três frases reais registradas: "não me mande mais mensagens", "eu só quero que você pare de me mandar mensagens" e "quero que você pare de me mandar mensagens".
3. The corpus SHALL conter, na faixa fora, a frase "pode parar de mandar foto".
4. WHEN a medição roda THEN the system SHALL executar somente o classificador, com o mesmo snapshot de modelo da AD-026 e as mesmas categorias, descrições, prompt e formato de entrada que serão publicados, sem chamar o CRM.
5. WHEN a medição roda THEN the system SHALL executar cada frase 3 vezes, com a última mensagem do agente definida no item do corpus (a mesma abertura fixa quando o item não define outra), e reportar por frase e por faixa quantas execuções foram classificadas como explícita, ambígua e fora.
6. The measurement SHALL aprovar somente se zero execuções de frases ambíguas ou fora forem classificadas como explícita E pelo menos 90% das execuções de frases explícitas forem classificadas como explícita.
7. IF a medição reprova THEN the system SHALL manter o classificador fora do `crivo-agente-principal` publicado e manter a orientação "responda `sair`" em vigor.
8. IF a configuração do classificador em `principal.ts` (modelo, categorias, descrições, prompt ou formato de entrada) difere da usada na última medição aprovada THEN the system SHALL falhar a suíte de testes até uma nova medição aprovada ser registrada.

**Independent Test**: Rodar a medição sobre o corpus e obter um relatório versionado com contagens por frase e por faixa, veredito APROVADO/REPROVADO calculado pela barra do AC6 e a identidade (hash) da configuração do classificador medida.

---

### P1: Registrar o pedido explícito em linguagem natural ⭐ MVP

**User Story**: Como lead, quero que meu pedido para parar de receber mensagens seja respeitado quando eu o escrevo com as minhas palavras, sem precisar descobrir uma palavra mágica.

**Why P1**: É o defeito de compliance que o lote existe para fechar.

**Acceptance Criteria**:

1. WHEN um lead sem `optedOutAt` e fora de `escalado_humano` envia uma frase da faixa explícita THEN the system SHALL gravar `optedOutAt` desse lead no mesmo turno por `POST /api/v1/leads/{id}/opt-out`.
2. The classifier SHALL receber somente a mensagem do lead no turno e a última mensagem enviada a ele na sessão corrente; o lead e o tenant do registro SHALL vir exclusivamente das expressões do fluxo resolvidas antes do classificador.
3. WHEN o registro por linguagem natural termina com sucesso THEN the system SHALL enviar ao lead exatamente uma mensagem depois do pedido, com o texto de confirmação de OPTMSG-01.
4. WHEN o turno do registro termina THEN the system SHALL deixar vazia a sessão do lead em `n8n_chat_histories`.
5. WHEN o turno do registro termina THEN the system SHALL deixar purgadas as colunas de qualificação e persona do lead em `conversa_estado`, igual ao ramo da palavra-chave (MEM-04).
6. WHEN o lead envia qualquer mensagem depois do registro THEN the system SHALL gravar a mensagem no CRM e não enviar resposta.
7. IF o registro falha (resposta não-2xx depois das novas tentativas, ou timeout) THEN the system SHALL manter `optedOutAt` nulo e enviar ao lead uma única mensagem orientando a responder com a palavra `sair`.
8. IF a classificação falha, excede o tempo ou não devolve uma categoria reconhecida THEN the system SHALL seguir para o agente como faixa fora, com `optedOutAt` nulo.
9. WHEN a mensagem do lead combina um pedido explícito de parar com outra pergunta THEN the system SHALL registrar o opt-out e enviar somente a confirmação, sem responder à outra pergunta.
10. The system SHALL NOT enviar ao lead texto afirmando que as mensagens pararam em nenhum turno em que `optedOutAt` não foi gravado.

**Independent Test**: Numa conversa real com lead de descarte, enviar "quero que você pare de me mandar mensagens" e comprovar `optedOutAt` preenchido, uma confirmação, memória vazia e silêncio na mensagem seguinte.

---

### P1: Perguntar antes quando o pedido é ambíguo ⭐ MVP — ~~superseded pela emenda D11~~

> **Emenda D11 (2026-09-30, decisão do usuário depois da prova por conversa real).** A pergunta de
> confirmação funcionou como especificada (execuções 2738 e 2744), mas o usuário não a quis: para o
> lead desinteressado, "você quer parar de receber mensagens?" soa como convite para deixar de ser
> lead. **Só o pedido explícito descadastra.** A faixa ambígua passa a seguir a conversa normal,
> sem pergunta e sem registro. Os ACs abaixo ficam como histórico e são substituídos por:
>
> 1. WHEN um lead sem `optedOutAt` e fora de `escalado_humano` envia uma frase da faixa ambígua THEN the system SHALL responder pelo fluxo normal da conversa, sem perguntar se ele quer parar de receber mensagens e sem orientar a palavra `sair`.
> 2. WHEN um lead envia uma frase da faixa ambígua THEN the system SHALL manter `optedOutAt` nulo nesse turno.
>
> O classificador continua com as três categorias, porque a identidade aprovada na medição v4 trava
> a configuração dele; só a rota `ambigua` deixou de ter efeito próprio.

**User Story**: Como lead que disse "não tenho interesse" ou "foi engano", quero que me perguntem se devo parar de receber mensagens em vez de ser descadastrado sem saber.

**Why P1**: É a metade "pergunta" do modelo híbrido decidido. Sem ela a faixa ambígua vira ou falso positivo ou falso negativo.

**Acceptance Criteria**:

1. WHEN um lead sem `optedOutAt` e fora de `escalado_humano` envia uma frase da faixa ambígua THEN the system SHALL responder com uma mensagem que pergunta se ele quer parar de receber mensagens.
2. WHEN um lead envia uma frase da faixa ambígua THEN the system SHALL manter `optedOutAt` nulo nesse turno.
3. WHEN o lead responde afirmativamente à pergunta de confirmação, dentro da mesma sessão THEN the system SHALL registrar o opt-out com os mesmos efeitos de OPTREG-01 AC1 a AC6.
4. WHEN o lead responde negativamente à pergunta de confirmação, ou muda de assunto THEN the system SHALL manter `optedOutAt` nulo e seguir a conversa.

**Independent Test**: Enviar "não tenho interesse, obrigado", receber a pergunta, responder "sim" e comprovar `optedOutAt` preenchido. Repetir com outro lead respondendo "não" e comprovar `optedOutAt` nulo.

---

### P1: Não descadastrar o que não é opt-out ⭐ MVP

**User Story**: Como imobiliária, quero que um lead que diz "pode parar de mandar foto" continue sendo atendido, porque um descadastro indevido perde o lead para sempre.

**Why P1**: O falso positivo é permanente enquanto não existe reversão.

**Acceptance Criteria**:

1. WHEN um lead envia uma frase da faixa fora THEN the system SHALL manter `optedOutAt` nulo.
2. WHEN um lead envia uma frase da faixa fora THEN the system SHALL responder pelo fluxo normal da conversa, ou com a pergunta de confirmação de OPTAMB-01 AC1 quando a trava determinística rebaixar para ambígua uma classificação explícita de "parar de mandar <conteúdo>"; em nenhum dos dois casos registra o opt-out. *(Emenda D9, 2026-09-30: a trava da T12d, decisão D3, faz o erro residual do classificador virar pergunta, nunca registro.)* *(Emenda D11, 2026-09-30: sem pergunta de confirmação, o rebaixamento pela trava também segue o fluxo normal da conversa; nunca registra.)*

**Independent Test**: Enviar "pode parar de mandar foto" e "quero sair do aluguel" e comprovar `optedOutAt` nulo e resposta normal nos dois.

---

### P1: Manter a palavra exata como caminho determinístico ⭐ MVP

**User Story**: Como lead, quero que `sair` funcione sempre, mesmo que o modelo erre ou esteja fora do ar.

**Why P1**: É o invariante duro que a AD-018 preserva e que o roadmap exige manter.

**Acceptance Criteria**:

1. WHEN a mensagem inteira, normalizada, é `sair` ou `parar` THEN the system SHALL rotear para `opt-out` no gate, sem invocar o modelo.
2. The system SHALL manter inalterados o comportamento e a suíte de testes de `detectOptOut` e `gate` em `n8n/src/gate.mjs`.
3. WHILE o lead está em `escalado_humano`, WHEN a mensagem inteira normalizada é `sair` ou `parar` THEN the system SHALL registrar o opt-out.
4. WHEN o opt-out é registrado pela palavra exata THEN the system SHALL enviar o mesmo texto de confirmação de OPTMSG-01.

**Independent Test**: Rodar a suíte de `gate.mjs` sem alteração e executar o cenário 3 do roteiro com o texto novo.

---

### P1: Confirmar só o que o sistema cumpre ⭐ MVP

**User Story**: Como lead descadastrado, quero uma confirmação verdadeira, sem a promessa de uma retomada que não vai acontecer.

**Why P1**: A mensagem atual é uma afirmação falsa, enviada no momento de maior peso jurídico da conversa.

**Acceptance Criteria**:

1. The system SHALL usar um único texto de confirmação de opt-out, idêntico no caminho da palavra exata e no caminho da linguagem natural.
2. The confirmation text SHALL be exactly "Pronto, registramos seu pedido. Você não vai mais receber mensagens nossas por este número. Até mais!".

**Independent Test**: Um teste compara a string enviada pelos dois caminhos com o texto do AC2.

---

### P1: Provar por conversa real ⭐ MVP

**User Story**: Como responsável pelo produto, quero o opt-out natural provado por conversa real no protocolo da AD-027, e não só por teste.

**Why P1**: O comportamento depende do modelo, e a AD-027 exige prova por desfecho no CRM.

**Acceptance Criteria**:

1. The `n8n/smoke/roteiro.md` SHALL conter um cenário de opt-out natural com três casos em leads distintos: explícito (registra), ambíguo seguido de resposta afirmativa (registra) e fora de escopo (não registra).
2. WHEN o cenário de opt-out natural é executado THEN the system SHALL ser aprovado somente pelo estado final no CRM: `optedOutAt` preenchido nos casos explícito e ambíguo-confirmado, e nulo no caso fora de escopo.
3. WHEN o cenário de opt-out natural é executado THEN the system SHALL comprovar, nos casos que registram, a sessão de memória vazia antes da limpeza manual do checklist.
4. WHEN a confirmação nova é publicada THEN the system SHALL reexecutar o cenário 3 do roteiro (palavra exata) como regressão, com o texto de OPTMSG-01.
5. The evidence SHALL citar somente ids de execução confirmados por `get_execution` antes da citação (L-011).

**Independent Test**: A execução do roteiro produz evidência com ids de execução, `optedOutAt` por lead e o estado da sessão de memória.

---

### P1: Registrar a decisão e a documentação ⭐ MVP

**User Story**: Como próxima sessão de planejamento, quero que a mudança da fronteira de opt-out esteja registrada como decisão, para que ninguém a desfaça lendo só a AD-018.

**Why P1**: O `CLAUDE.md` proíbe uma decisão nova que contradiga uma ativa sem emendá-la.

**Acceptance Criteria**:

1. The `.specs/STATE.md` SHALL conter uma AD nova que emenda a cláusula de opt-out da AD-018 e a frase de escopo da AD-026, e as duas SHALL apontar para ela.
2. WHEN o classificador é publicado THEN `n8n/src/system-message.mjs` SHALL conter a instrução de pergunta da faixa ambígua, incluída no system message somente nos turnos classificados como ambíguos, e manter `OPT_OUT_GUIDANCE_INSTRUCTION` como rede.
3. WHEN o classificador é publicado THEN `n8n/README.md` e `n8n/smoke/roteiro.md` SHALL descrever os dois caminhos de opt-out e remover a afirmação de que opt-out natural está fora do escopo.

**Independent Test**: Grep por `Opt-out por linguagem natural é L13` sem ocorrência; AD-018 e AD-026 com `amended by`; teste de `system-message.mjs` cobrindo a instrução nova presente só no turno ambíguo.

---

## Edge Cases

- IF o buffer do turno agrega várias mensagens e uma delas é um pedido explícito THEN the system SHALL registrar o opt-out uma vez e enviar somente a confirmação.
- WHEN o pedido explícito é a primeira mensagem de um lead novo THEN the system SHALL registrar o opt-out do lead criado nesse mesmo turno.
- IF o lead responde à pergunta de confirmação depois do corte de sessão de 12h THEN the system SHALL tratar a resposta como mensagem nova e manter `optedOutAt` nulo.
- IF o lead manda `sair` logo depois de um opt-out natural já registrado THEN the system SHALL gravar a mensagem e não enviar uma segunda confirmação.
- IF o modelo do agente está indisponível THEN the system SHALL continuar registrando o opt-out pela palavra exata.

## Implicit-Requirement Dimensions Sweep

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | O classificador só recebe a mensagem do turno e a última mensagem enviada; nenhum identificador sai do modelo (OPTREG-01 AC2). O corpus tem tamanhos mínimos por faixa (OPTMED-01 AC1). |
| Failure / partial-failure states | Falha do registro degrada para a orientação `sair`, sem promessa (OPTREG-01 AC7, AC10). Memória e `conversa_estado` são exigidas vazias ao fim do turno (AC4, AC5). |
| Idempotency / retry / duplicate handling | `POST /leads/{id}/opt-out` já é idempotente. O ramo de opt-out roda no máximo uma vez por turno, e o turno seguinte cai em `somente-registrar`. `sair` depois do registro não confirma de novo (Edge Cases). |
| Auth boundaries & rate limits | Lead e tenant vêm do fluxo, nunca do modelo (OPTREG-01 AC2); a credencial de serviço segue SEC-01. Rate limit é N/A porque o classificador roda uma vez por turno de conversa, depois do debounce; o consumo de tokens por minuto dele entra na conta da AD-031 no Design. |
| Concurrency / ordering | O gate relê `optedOutAt` a cada turno, então o turno seguinte ao registro cai em `somente-registrar` (OPTREG-01 AC6). O buffer agregado está coberto em Edge Cases. |
| Data lifecycle / expiry | O opt-out é permanente, e a reversão está fora de escopo. A purga de memória e de `conversa_estado` repete MEM-04. A resposta após o corte de 12h está nos Edge Cases. |
| Observability | A execução do n8n identifica a origem (classificador ou gate) e a categoria atribuída, e a mensagem do pedido fica gravada na thread do CRM. Recusas ≥ 400 já caem em `integration_refusals` (AD-023). Nenhuma coluna nova. |
| External-dependency failure | Com o CRM fora, o registro falha e degrada (OPTREG-01 AC7). Com o modelo fora, o classificador cai para a faixa fora (OPTREG-01 AC8) e a palavra exata continua funcionando (OPTKEY-01 AC1). |
| State-transition integrity | `optedOutAt` passa de nulo a preenchido uma vez e nunca volta. Lead em `escalado_humano` só sai pela palavra exata (OPTKEY-01 AC3). |

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| OPTMED-01 | P1: Medir o falso positivo antes de publicar | T2, T4, T7, T8, T9, T10, T12, T13 | Verified (T12e APROVADO; T13 trava) |
| OPTREG-01 | P1: Registrar o pedido explícito em linguagem natural | T1, T2, T3, T10, T11, T16, T18 | Implemented; prova real pendente (T18) |
| OPTAMB-01 | P1: Perguntar antes quando o pedido é ambíguo | T1, T3, T5, T10, T16, T18 | Superseded pela emenda D11 (ambíguo segue a conversa, sem pergunta); comportamento antigo provado em 2738/2744 |
| OPTSEG-01 | P1: Não descadastrar o que não é opt-out | T10, T16, T18 | Implemented (emenda D9); prova real pendente (T18) |
| OPTKEY-01 | P1: Manter a palavra exata como caminho determinístico | T11, T16, T18 | Verified (gate intacto; AC3 coberto no ciclo de correção) |
| OPTMSG-01 | P1: Confirmar só o que o sistema cumpre | T3, T11, T16, T18 | Verified |
| OPTPROVA-01 | P1: Provar por conversa real | T14, T18 | Pendente de execução humana (T18, decisão D8) |
| OPTDOC-01 | P1: Registrar a decisão e a documentação | T5, T6, T14, T15, T17 (AC1 cumprido no Design: AD-032) | Verified |

**Coverage:** 8 requisitos, 8 mapeados para tasks (T1–T18), 0 sem cobertura.

## Success Criteria

- [ ] A medição fica APROVADA pela barra do OPTMED-01 AC6, com relatório versionado, antes de o classificador ser publicado.
- [ ] Um pedido explícito real em linguagem natural grava `optedOutAt` no mesmo turno, com uma confirmação e memória vazia.
- [ ] "pode parar de mandar foto" não descadastra ninguém, na medição e na conversa real.
- [ ] `sair` continua registrando sem o modelo, com a suíte de `gate.mjs` intacta.
- [ ] Nenhuma mensagem enviada promete retomada de contato.
- [ ] O gate automatizado, a prova conversacional e o Verifier independente encerram o lote com PASS.
