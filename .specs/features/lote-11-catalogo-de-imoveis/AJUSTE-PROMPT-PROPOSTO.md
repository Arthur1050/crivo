# Ajuste de prompt após a conversa de 2026-09-14

**Status**: aprovado pelo usuário em 2026-09-14 (“Eu aprovo”); implementação local concluída na T31 (1.304 testes, lint e build passaram).
Publicação no n8n ainda depende de autorização específica e não está incluída nesta aprovação.
**Escopo**: correção dentro do lote-11. Não reabre o planejamento aprovado.
**Evidência**: `evidencia.md` §26.1, sete turnos reais, execuções verificadas por MCP.

## Decisão aprovada

Revisar as instruções compartilhadas em `n8n/src/system-message.mjs`, atualizar os
testes das cláusulas alteradas e regenerar `n8n/generated/principal.ts`. É a opção
recomendada: corrige as contradições na fonte versionada e permite verificar o
artefato antes da publicação. Acrescentar apenas mais uma instrução ao final manteria
ordens contraditórias; editar o tom do tenant não corrigiria as regras globais.

Não criar contador de indecisão nem alterar `gate.mjs`, `phase.mjs`, banco ou contrato.
Reconectar OAuth do Google é uma ação humana separada: não é defeito corrigível por prompt.

## Texto proposto: busca e ponte para reunião

Substituir `INVENTORY_SEARCH_INSTRUCTION` por:

> Quando buscar imóveis: assim que o lead disser QUALQUER critério de busca novo ou alterar o que procura, chame buscar_imoveis com os critérios que ele realmente informou. Se ele deu só um critério, busque mesmo assim com esse único critério em vez de esperar ter todos. Isso vale em qualquer fase da conversa. Mostre o que voltou, incluindo a referência de cada imóvel citado e seu preço. A busca ajuda a entender o interesse; escolher, aprovar ou decidir por um imóvel NÃO é requisito para conversar com o corretor nem para agendar a reunião. Se o lead demonstrar dúvida ou incerteza, disser que não sabe o que escolher, ou a conversa se prolongar em comparações sem avançar, responda ao ponto dele e ofereça uma conversa com o corretor para ajudá-lo a decidir. Você também pode oferecer essa conversa quando a busca não trouxer opções. Não repita buscas com os mesmos critérios só para adiar a reunião. Se o lead já quiser conversar ou tiver aceitado um horário, priorize esse pedido em vez de exigir uma escolha ou uma nova busca. Faça um convite curto, sem pressionar; se ele recusar, respeite e continue ajudando. Nunca invente imóvel.

A instrução da fase `agendando` deve retirar a condição absoluta de buscar e mostrar
antes de falar de horário, e reafirmar: a reunião serve também para tirar dúvidas;
não esperar uma decisão de compra ou escolha de unidade. Preservar o horário comercial,
o aceite explícito e a regra de não agendar novamente uma reunião já confirmada.

## Texto proposto: educação e apresentação

Preservar identificação por primeiro nome e imobiliária no primeiro turno, mas
acrescentar à postura compartilhada:

> Educação na conversa: responda ao cumprimento e às perguntas sociais que o lead fizer, inclusive “tudo bem?” ou “como vai?”, em vez de ignorá-los e pular para imóvel ou cadastro. A apresentação é uma orientação de identidade, não um texto a recitar: adapte a frase e sua ordem ao que a pessoa disse. Se ele só cumprimentou e perguntou como você está, responda com cordialidade, apresente-se brevemente e devolva a cortesia; não acrescente uma pergunta de qualificação nesse mesmo turno. Se ele já trouxe um pedido, responda à cortesia e então ao pedido, com naturalidade.

## Texto proposto: aceite vale em todas as fases

Acrescentar uma instrução compartilhada, independente de `phase`:

> Regra de aceite para qualquer fase: interesse por um imóvel, dúvida ou agradecimento NÃO é aceite de horário. Se você propôs um horário neste turno, encerre depois de enviar a proposta e espere a resposta do lead; NÃO chame agendar_reuniao nesse mesmo turno. Chame a tool somente para um horário concreto que o próprio lead pediu ou que ele aceitou explicitamente. Dizer que gostou de uma opção não autoriza marcar reunião. Nunca exija escolha de imóvel para receber esse aceite.

Não depender apenas de `buildPhaseInstruction('agendando')`: o agente pode oferecer
reunião para ajudar numa dúvida durante a qualificação.

## Texto proposto: falha e próximo passo

Acrescentar à instrução de falha:

> Se o agendamento falhar por indisponibilidade técnica, diga claramente que a reunião ainda NÃO está confirmada. Não diga que o horário foi ocupado, a menos que a tool tenha devolvido essa informação. Não prometa que vai confirmar depois, avisar quando voltar, reservar ou deixar encaminhado: não existe acompanhamento automático para cumprir isso. Trocar o horário não resolve uma indisponibilidade técnica; não peça novas alternativas de horário por esse motivo. Oriente o lead a retomar a confirmação mais tarde. Não divulgue credenciais, códigos internos ou detalhes de OAuth.

Revisar a cláusula antiga que proíbe o termo “sistema” e na mesma linha manda usá-lo,
para permitir uma explicação curta e coerente (“não consegui confirmar agora”).
Preservar a tradução de horário efetivamente ocupado e a proibição de confirmar sucesso
quando uma tool falha.

## Critérios de verificação

- Teste por cláusula: apresentação responde cortesia; saudação sem pedido não vira coleta.
- Teste por cláusula: escolha de imóvel não condiciona reunião; dúvida e indecisão
  permitem convite; recusa é respeitada; critérios novos continuam disparando busca.
- Teste por cláusula: referências obrigatórias na citação de cada opção real.
- Teste por cláusula: aceite explícito em ambas as fases; interesse no imóvel não é
  aceite; proposta e agendamento ficam em turnos separados.
- Teste por cláusula: falha não vira horário ocupado nem promessa de confirmação futura;
  reunião permanece não confirmada e não exige mudar o horário para corrigir OAuth.
- Atualizar testes que atualmente exigem “ANTES de propor qualquer reunião” e
  “antes de falar de horário”, pois codificam a regra substituída. Preservar o conjunto
  de casos, acrescentando os novos critérios, sem skip nem exclusão para mascarar falha.
- Gate completo isolado: vitest, lint, build. Regeneração pelo inliner; nenhuma edição
  manual em generated. Comparar grafo e código normalizado com a versão da instância
  antes de ativar, quando a publicação for autorizada.
- Nova conversa real com estado limpo: cortesia, interesse/dúvida sem escolha, imóvel com
  referência/preço, busca sem resultado e aceite de horário. Agendamento real depende
  primeiro de reconectar a credencial Google Calendar no n8n.

**Ações externas pendentes de autorização**: atualizar/publicar o principal no n8n.
Nenhum push ou deploy Vercel é necessário para uma correção somente de prompt n8n.
