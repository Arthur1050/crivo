# Lote 13 — Opt-out por linguagem natural — Contexto

**Gathered:** 2026-09-27
**Spec:** `.specs/features/lote-13-opt-out-linguagem-natural/spec.md`
**Status:** Aguardando aprovação da spec

---

## Feature Boundary

Um pedido de opt-out escrito em linguagem natural passa a gravar `opted_out_at` pelo mesmo
`POST /api/v1/leads/{id}/opt-out` da palavra-chave, com a mesma purga de memória e a mesma
confirmação única. A palavra exata `sair`/`parar` continua detectada no gate, antes do modelo. A
classificador só é publicado depois de uma medição de falso positivo aprovada. Fecha o item #15 do backlog
(`lote-7/context.md`) e a linha L13 de `ROADMAP-POS-PILOTO.md`.

---

## Implementation Decisions

### Registro direto ou confirmação com o lead

- **Híbrido.** Pedido explícito registra no mesmo turno. Pedido ambíguo gera uma pergunta, e o
  registro só acontece com a resposta afirmativa.
- O motivo: cobre o caso real da T21 do lote-7 ("não me mande mais mensagens") sem transformar uma
  frase ambígua em silêncio permanente.

### O que conta como opt-out: três faixas

- **Registra**: o lead pede para parar de receber mensagens, para não ser mais contatado, para sair
  da lista ou para não mandarem mais nada.
- **Pergunta**: desinteresse geral sem pedido de parar ("não tenho interesse, obrigado") e número
  errado ou pessoa errada ("foi engano, não sou essa pessoa").
- **Segue**: desinteresse num imóvel específico, e "parar"/"sair" referindo-se a outra coisa
  ("pode parar de mandar foto", "quero sair do aluguel", "para de enrolar e me passa o preço").

### Texto da confirmação e reversibilidade

- **Corrigir o texto.** A confirmação atual (`n8n/workflows/principal.ts:585`) promete "Se mudar de
  ideia, é só nos chamar novamente". Isso é falso: o gate silencia o lead para sempre
  (`n8n/src/gate.mjs:66`) e nenhuma tela ou rota do CRM limpa `optedOutAt`. O texto novo diz só o
  que o sistema cumpre, e vale para os dois caminhos (palavra-chave e linguagem natural).
- A reversão (reativar um lead descadastrado) **não entra** neste lote e vai para Deferred Ideas.

### Barra da medição de falso positivo

- **Barra dura, e o lote para se ela reprovar.** Corpus versionado com cerca de 60 frases (as
  frases reais já registradas, paráfrases das três faixas e near-misses), rodado contra o modelo de
  produção com o system message real.
- Aprova com **zero** registro em frase ambígua ou fora de escopo e **≥ 90%** de registro nas
  explícitas.
- Se reprovar, o classificador não é publicado, a orientação atual ("responda `sair`") continua valendo e o
  lote volta para decisão do usuário.

### Abordagem (decidida no Design)

- **Classificador de intenção antes do agente, não tool no agente.** Um `textClassifier` nativo do
  n8n, na rota `conversa`, recebe a mensagem do lead e a última mensagem enviada a ele na sessão.
  A classe explícita reutiliza o ramo de opt-out que já existe e já foi provado, a ambígua segue
  para o agente com instrução de perguntar, e a fora segue normal.
- O motivo: com a tool, "exatamente uma mensagem" dependia de o modelo não chamar `responder_lead`
  no mesmo turno, e a limpeza da memória exigia um ramo novo no trecho do pós-agente que já teve
  três incidentes. Com o classificador, as duas garantias passam a vir da estrutura do fluxo, e a
  medição mede exatamente o nó que vai para produção.
- O custo aceito: uma chamada extra ao modelo por turno de conversa, e um contexto menor
  (mensagem atual + última mensagem enviada) do que o do agente.
- Isso substitui a redação "tool `registrar_opt_out`" do roadmap e do rascunho da spec. As quatro
  decisões de produto acima não mudam.

### Agent's Discretion

- Repetições por frase na medição (3), contexto de abertura fixo antes de cada frase, e o formato
  do arquivo de corpus.
- O texto exato da nova confirmação — aceito pelo usuário na aprovação da spec.
- A forma de derivar a última mensagem enviada na sessão e o formato da entrada do
  classificador. São decisões de Design, restritas pelos ACs.

### Declined / Undiscussed Gray Areas → Assumptions

Registrados na tabela de Assumptions da spec: mensagem mista (pedido explícito junto com outra
pergunta), falha do registro e do classificador, resposta à pergunta de confirmação depois do corte de 12h, lead em
`escalado_humano`, origem do opt-out no CRM e emenda da AD-018 e da AD-026.

---

## Specific References

- As frases reais da T21 do lote-7: **"não me mande mais mensagens"** e **"eu só quero que você
  pare de me mandar mensagens"**.
- A frase real da Fase 5 do lote-10 (`n8n/smoke/evidencia.md:1494`): **"quero que você pare de me
  mandar mensagens"**.
- O near-miss que o próprio backlog nomeou: **"pode parar de mandar foto"** não é opt-out.
- Lição L-025 (confirmada): gate de compliance com gatilho de palavra exata precisa de paráfrases
  testadas antes do smoke.

---

## Deferred Ideas

- **Reverter um opt-out.** Reativar um lead descadastrado exige definir o que conta como
  consentimento renovado. Hoje não existe caminho algum, nem pela tela.
- **Opt-out natural para lead em `escalado_humano`.** O gate manda esse lead para
  `somente-registrar` antes do agente, então só a palavra exata funciona. O humano que atende também
  não tem botão no CRM para registrar opt-out (`lead-detail-panel.tsx` só exibe o campo). Encaixa no
  L14 (humano no laço).
- **Origem do opt-out gravada no CRM** (palavra-chave ou linguagem natural). Hoje a origem se lê pela
  execução do n8n e pela mensagem do lead gravada na thread.
