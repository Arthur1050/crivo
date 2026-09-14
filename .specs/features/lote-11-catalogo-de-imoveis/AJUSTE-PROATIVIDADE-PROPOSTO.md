# Proatividade e apresentação após a segunda conversa — 2026-09-14

**Status**: aprovada pelo usuário (“Aprovado”); implementada e verificada localmente na T33. Publicada na T34 após autorização específica (“Permito”).
**Escopo**: refinamento do lote-11, mantendo o planejamento e a revisão T31.
**Evidência**: evidencia.md §34; oito turnos conferidos no CRM e por get_execution.

## Resultado observado

O usuário aprovou a qualidade da conversa e pediu três refinamentos: buscar
alternativas por iniciativa própria, oferecer reunião assim que esgotar opções
viáveis e organizar as características do imóvel para leitura no WhatsApp.
O positivo já funcionou: IM-0001 / R$ 380.000,00; agendamento aceito para
15/09/2026 às 15h, CRM e evento Meet confirmados. Preservar esses resultados.

Na execução 2335, casa + Abadia retornou vazio. O agente ainda pediu orçamento e
quartos, embora adicionar restrições não possa produzir uma casa ausente desse
conjunto. Na 2342 pediu permissão para buscar bairros próximos. Na 2349 passou
literalmente bairro="próximo do Abadia", que não representa uma busca de proximidade.
Cidade="Uberlândia/MG" na 2342 também não é o nome de cidade esperado pela consulta;
o lead não informou cidade em nenhum turno. A reunião só apareceu na sexta resposta,
após três respostas vazias de inventário, incluindo a consulta mal formada.

## Abordagens

1. **Recomendada: busca alternativa limitada com o contrato atual.** Revisar prompt
   e descrição da tool, sem criar geografia. Retirar apenas bairro flexível em uma
   busca alternativa, manter demais critérios conhecidos e mostrar a localização
   real. Oferecer reunião no mesmo turno se também não houver opções. Efeito pequeno,
   local e testável; não permite afirmar distância ou proximidade entre bairros.
2. **Proximidade geográfica real.** Acrescentar dados confiáveis de localização ou
   adjacência por cidade e pesquisa por distância. Resolve "perto" literalmente, mas
   exige contrato/dados/serviço novos e planejamento próprio. Não cabe como simples
   refinamento de prompt do lote atual.

Mostrar como próximo um imóvel obtido apenas ao retirar bairro seria informação
inventada. A opção 1 atende a proatividade sobre alternativas reais; a opção 2
fica disponível caso proximidade real seja requisito agora.

## Texto proposto: busca e convite

Substituir a instrução de busca compartilhada, preservando a obrigação de buscar
critério novo e o pedido de reunião/aceite como prioridade:

> Busque assim que o lead informar critérios novos ou alterar o que procura, com
> os critérios realmente conhecidos, mesmo que seja só um. Mostre apenas opções
> reais da tool, sempre com referência e preço. Quando uma busca válida não trouxer
> opções, não peça mais preço ou quartos só para refinar um conjunto já vazio:
> adicionar restrições não vai criar opções. Se o bairro for uma preferência flexível,
> faça por iniciativa própria UMA busca alternativa no mesmo turno, sem o filtro
> bairro e mantendo tipo, modalidade, orçamento e quartos conhecidos, além da cidade
> quando ela estiver confirmada. Não peça permissão só para consultar alternativas.
> Se o lead disser que o bairro é obrigatório, não retire esse filtro. Não altere
> teto de preço, quantidade mínima de quartos, tipo de imóvel ou cidade para fabricar
> uma opção. Explique que ampliou para outros bairros e mostre a localização real
> devolvida; não afirme que são próximos sem informação confiável de proximidade.
> Se a busca alternativa também voltar vazia, informe a ausência e ofereça já nessa
> resposta uma conversa com o corretor, sem esperar outra rodada de perguntas ou que
> o lead diga que não tem interesse. Se não couber ampliar o bairro, ofereça a conversa
> após a primeira ausência válida. Dúvida, incerteza ou comparações sem avanço também
> são oportunidade para convite consultivo. Não repita uma combinação já consultada
> e não repita a mesma expansão a cada turno. Uma falha técnica não é resultado vazio:
> siga a regra de falha e não invente ausência. Reunião não exige escolha de imóvel;
> pedido de reunião e aceite têm prioridade. Se o lead recusar, respeite e continue
> ajudando, sem insistência.

O bairro só é ampliado para consulta e os resultados são apresentados como
alternativas: o agente não muda os critérios gravados do lead. Cidade não informada
não é assumida a partir de uma opção anterior. Sem cidade confirmada, a consulta
usa os demais critérios conhecidos e cada alternativa mostra sua cidade de verdade.

## Texto proposto: argumentos da tool

Acrescentar orientação no prompt e na descrição de buscar_imoveis:

> Omitir filtros desconhecidos: não enviar strings vazias ou números zero como
> preenchimento. Cidade é apenas o nome da cidade, sem /UF, e só deve ser filtrada
> quando confirmada pelo lead. Bairro aceita um nome de bairro real, nunca expressões
> como “próximo do Abadia”, “arredores” ou “bairros próximos”. Para consultar alternativas
> sem um bairro específico, omita bairro. A tool não calcula distância ou adjacência.

Preservar preço em reais, isolamento por tenant do fluxo, visibilidade publicado +
disponível, limites atuais e nunca inventar propriedade. Não tornar um 400 equivalente
a ausência, nem alterar parser/contrato para aceitar argumentos incorretos.

## Texto proposto: apresentação de imóveis

Criar exceção específica de apresentação às instruções de fala corrida da persona,
sem liberar markdown, emojis ou listas para todo atendimento:

> Ao apresentar um imóvel, facilite a leitura com linhas curtas em uma única mensagem:
> tipo/modalidade e referência; bairro e cidade/UF; quartos, banheiros e vagas;
> área; preço. Use só os campos e os valores devolvidos pela tool. Separe uma eventual
> pergunta ou convite em outra mensagem curta, respeitando o limite de três mensagens
> por turno. Não emende características, preço e pergunta em um parágrafo comprido.
> As demais respostas continuam naturais e curtas. Não use emoji, tabela ou markdown.

Exemplo com a opção real desta conversa (não é template para inventar dados):

```text
Apartamento novo — IM-0001
Abadia, Uberlândia/MG
2 quartos · 2 banheiros · 1 vaga
72 m²
R$ 380.000,00
```

Não é um renderer determinístico. Quebras de linha são texto aceito pelo atual
responder_lead e textBody do WhatsApp. Formatação final precisa ser observada na
conversa real. Mais de uma opção não autoriza exceder três mensagens por turno.

## Arquivos e verificação

Implementação proposta: system-message.mjs e testes co-localizados;
n8n/workflows/principal.ts (descrição de buscar_imoveis e argumentos, sem novo nó)
e seus testes; generated/principal.ts pelo inliner; spec/tasks/evidencia/STATE do lote.
Sem mudar gate.mjs, phase.mjs, voice.mjs, banco, contratos ou booking.

Critérios de aceite propostos, com asserção própria por cláusula nas duas fases:

- Busca vazia válida com bairro flexível dispara no máximo uma expansão automática,
  sem bairro, preservando tipo, modalidade, preço máximo e quartos conhecidos.
- Bairro obrigatório não é retirado; localização alternativa é explícita; não afirmar
  proximidade geográfica sem dados nem inferir cidade do lead de um imóvel apresentado.
- Primeira ausência seguida de expansão vazia já orienta convite no mesmo turno;
  não refinar conjunto vazio, não repetir expansão e respeitar recusa.
- Erro de tool não é ausência; desconhecidos não recebem ""/0; cidade não contém /UF;
  termos de proximidade não viram nome literal de bairro.
- Instrução de apresentação organiza referência, localização, quartos/banheiros/vagas,
  área e preço em linhas separadas; eventual pergunta vai em outra mensagem e mantém
  teto três, sem emojis/markdown, endereço exato, captador ou dados inventados.
- Preservar cortesia, aceite em todas as fases, reunião independente de imóvel,
  busca proativa, transparência, opt-out e reunião confirmada. Não remover/skip testes.
- Gate local completo, inliner e comparação de 62 nós / 76 conexões / maxIterations 8.
  Testes comprovam instruções e parâmetros, não obediência do modelo. Nova conversa
  real comprova proatividade, momento do convite e legibilidade.

**Limite da aprovação solicitada**: implementar/verificar/commitar esta revisão local.
Nova publicação, reset e eventuais alterações de Calendar continuam exigindo
autorização específica. Nenhuma dessas ações foi feita na investigação.

## Entrega local aprovada — T33

Prompt e descrição de buscar_imoveis revisados; generated/principal.ts regenerado.
1.347 testes / 91 arquivos, lint e build exit 0. Os 43 casos novos comprovam as
instruções aprovadas; nenhum teste anterior foi alterado/removido/pulado. Grafo
62/76/maxIterations 8 preservado; sem mudanças em banco, booking, gate/phase/voice.
Detalhes, mapeamento e recibos locais em evidencia.md §35. Publicação e nova prova
real ainda pendentes. Commit atômico: fix(agente): busca alternativas e antecipa convite com imoveis legiveis.

## Publicação — T34

Principal 0B1nqjODu7xuYYKF ativo na versão 833f525c-4d59-43a2-b466-8ef8268a0468.
Hash do jsCode gerado/salvo conferido antes de ativar, com CRLF normalizado para LF:
93a36f5e281297925272f9799c47800e60c2fbb20037b9e2102da6ca33541689.
Somente jsCode e descrições/argumentos da busca alterados; grafo 62/76, teto oito,
modelo, memória, credenciais, grupos e settings preservados. Recibo em evidencia.md §36.
Usuário também autorizou reset da sessão, executado como preparação separada.
