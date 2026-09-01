# Lote 6b — Contexto e decisões do usuário

Sessão de planejamento: 2026-08-10. Insumos: 5 capturas anexadas pelo usuário (conversa real no WhatsApp, tela Chats do CRM, listagem de chats, card de Documentos em Configurações, referência visual de um file browser).

## Restrição operacional desta janela

**A hospedagem do n8n está fora do ar** (informado pelo usuário: "tive problemas com a hospedagem do n8n então você não vai conseguir se conectar a ele. Faça todas as alterações no código do fluxo e assim que eu conseguir recuperar a hospedagem a gente testa").

Consequência para o Execute:
- Nenhuma task deste lote publica workflow, cria Data Table, roda execução na instância ou faz smoke conversacional real.
- O gate de cada task de n8n é **teste unitário do módulo puro + geração do artefato versionado** (`n8n/generated/`), nunca "rodou na instância".
- A publicação e a conversa real ficam no **Runbook pós-hospedagem** do `spec.md` — trabalho conhecido, fora do gate.

## Decisões tomadas pelo usuário (2026-08-10)

### 1. Onde mora a personalidade do agente
**Escolha: base no código + campo de tom por tenant.**
As regras de estilo humanizado (proibição do molde de três partes, marcadores de fala natural, uma pergunta por vez, não se anunciar como IA) ficam no prompt, iguais para todos os tenants. Além disso, Configurações → Persona do Agente SDR ganha um campo de texto livre "Tom de voz e personalidade" que cada imobiliária preenche.
*Descartado*: só no código (as duas imobiliárias soariam idênticas) e só por tenant (se a imobiliária escrever mal, o agente volta a soar robótico).

### 2. Fonte do histórico da conversa
**Escolha: novo `GET /api/v1/leads/{id}/messages` no contrato do CRM — com controle de tamanho.**
Palavras do usuário: *"Novo GET no CRM porém com um certo controle garantindo que uma conversa já finalizada entre o lead e o bot não acabe lotando o contexto desnecessariamente"*.
Traduzido em duas travas cumulativas (spec CTX-01 AC2/AC3): teto de 20 mensagens **e** corte de sessão quando há intervalo > 12h entre mensagens consecutivas. Uma conversa encerrada há dias nunca volta inteira num reengajamento.
*Descartado*: manter transcrição na Data Table do n8n — duplicaria estado, não enxerga mensagens escritas por humanos no CRM e se perde se a tabela for limpa.

### 3. Nível de informalidade
**Escolha: informal sem emoji.** "hmm", "haha", "acho que", frases curtas e reações — nenhum emoji. Compra de imóvel é decisão de alto valor; o calor vem do texto, não de figurinha.

### 4. Escopo visual dos documentos
**Escolha: card de Configurações + tabela da página Documentos.** Mesma linguagem visual nos dois lugares; o ícone cinza único da tabela vira ícone colorido por tipo de arquivo.

## Diagnóstico técnico apresentado ao usuário

A perda de contexto observada na captura (23:50 "Não tenho" → 23:51 apresentação completa) **não é alucinação do modelo nem bug de Data Table**: `buildPrompt` (`n8n/src/prompt.mjs:78`) nunca recebeu histórico. O prompt de cada turno contém persona, campos faltantes, horário comercial, documentos e a rajada atual do lead — nada do que já foi dito. Com uma mensagem curta e sem conteúdo próprio, o modelo não tem de onde inferir o estado da conversa e recomeça do início.

Isso também explica dois sintomas de estilo relatados como separados:
- **Padrão óbvio de três partes**: sem histórico, o modelo não sabe que já usou "Perfeito, entendi que..." nos três turnos anteriores.
- **Falta de identidade**: a única instrução de persona hoje é nome + nome da imobiliária + a frase institucional de apresentação, que o modelo reaproveita como molde.

## Referência visual (5ª imagem)

File browser com: ícone de tipo de arquivo colorido por extensão (PDF vermelho, planilha verde, documento azul, apresentação laranja/amarelo), nome como âncora da linha, metadados alinhados à direita em cinza, linhas densas edge-to-edge. Adotado como direção para o card e a tabela — sem copiar a estrutura de colunas (nossa tabela já tem as suas).

## Não decidido pelo usuário (escolhas do agente, documentadas)

| Item | Escolha | Por quê |
| ---- | ------- | ------- |
| Teto de mensagens por turno | 1 a 3 | Cobre "reage + comenta + pergunta"; teto imposto no validador determinístico, não só no prompt (AD-014) |
| Pausa entre mensagens | 2 s | Ritmo humano sem atrasar a conversa; valor único, fácil de mudar |
| Limite do campo de tom de voz | 500 caracteres | É uma descrição de jeito de falar, não um prompt paralelo |
| Corte de sessão | 12 h | Maior que qualquer pausa natural dentro de uma conversa e menor que "voltou no dia seguinte" |
