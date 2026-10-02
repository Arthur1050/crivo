# Lote 14 — Humano no laço — Context

**Gathered:** 2026-10-01
**Spec:** `.specs/features/lote-14-humano-no-laco/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Um humano da imobiliária assume uma conversa do agente (ou recebe uma escalada), responde ao lead
pelo Chats com envio real pelo WhatsApp, devolve a conversa ao agente com a memória reconstruída a
partir do CRM e registra o opt-out do lead pela tela. O lote também atualiza o `openapi.yaml` com
travas contra divergência e fecha o L5 Fix 1. O reengajamento gratuito antes de 24h é do L14b.

---

## Implementation Decisions

### Condução da conversa

- Assumir grava uma **marca de condução humana** no lead, separada do `status`. A coluna do Kanban
  e as taxas de qualificação e de escalonamento não mudam ao assumir (escolha do usuário entre
  "marca", "mover para `escalado_humano`" e "sem trava").
- O lead é conduzido por humano quando tem a marca ou está em `escalado_humano`.

### Janela de 24h

- O usuário propôs que o agente tente um contato **antes** de a janela fechar, aproveitando que a
  mensagem livre dentro da janela não é cobrada, em vez do template pago depois de 24h.
- Escopo dessa ideia, decidido em seguida: vale **só nas conversas conduzidas pelo agente**. Nas
  conduzidas por humano, o agente continua calado; o CRM mostra ao corretor quanto falta para a
  janela fechar e, depois de fechada, o composer bloqueia e explica.
- A mensagem do agente é **escrita por ele a partir do contexto** (não texto fixo) e **substitui** o
  template `reengajamento`: continua um único reengajamento por silêncio, agora gratuito.
- O reengajamento vira **lote próprio, L14b**, porque exige emendar o corte de sessão de 12h da
  AD-019 (às 22h de silêncio a conversa anterior já está fora da sessão, e a resposta do lead ao
  reengajamento chegaria a uma memória sem o assunto) e um caminho novo para rodar o agente sem
  mensagem do lead, com prova própria.

### Devolução ao agente

- Existe "Devolver ao agente". Na primeira mensagem do lead depois da devolução, o agente reconstrói
  a memória a partir do CRM, inclusive com as mensagens do humano.

### Opt-out pelo humano

- O CRM ganha botão de opt-out com caixa de confirmação. Grava o mesmo `optedOutAt` do caminho do
  agente e envia ao lead a confirmação do lote-13 quando a janela está aberta.

### Agent's Discretion

Nenhuma área foi delegada com "você decide". As decisões abaixo são defaults do agente, registradas
como assunções na spec:

- Lead em `escalado_humano` dispensa "Assumir".
- Assumir não altera `status`, `statusChangedBy` nem responsável.
- Devolver tira `escalado_humano` para `em_qualificacao` e grava `statusChangedBy` nulo.
- O agente consulta a condução antes de cada envio e não envia em caso de falha da consulta.
- Lembrete de reunião continua durante a condução humana.
- Atualização da tela em até 10 s, só com a aba visível.
- Texto sem prefixo nem assinatura; 1 a 4.096 caracteres; gravação só depois do aceite da Meta;
  chave de idempotência; 15 s de espera.
- Botão de opt-out disponível em qualquer lead sem opt-out do escopo.
- `sender: humano` recusado no contrato.
- Caminho técnico do envio decidido no Design.

### Declined / Undiscussed Gray Areas → Assumptions

Todas as áreas não discutidas estão na tabela de assunções da spec com default e justificativa.

---

## Specific References

- "O agente tentaria um contato novamente antes da janela de 24h chegar aproveitando o não
  pagamento" — usuário, 2026-10-01. Origem do L14b.
- Premissa da AD-017 ("o agente enxerga o que o corretor humano escreveu no CRM"): o lote existe
  para torná-la verdadeira.
- Item do lote-13 em `context.md` § Deferred Ideas: "O humano que atende também não tem botão no CRM
  para registrar opt-out (...). Encaixa no L14."

---

## Deferred Ideas

- **L14b — reengajamento gratuito escrito pelo agente** antes de a janela de 24h fechar, só nas
  conversas conduzidas pelo agente, substituindo o template `reengajamento`. Decisões já tomadas
  acima; vai para o `ROADMAP-POS-PILOTO.md` como lote próprio.
- Template aprovado para o humano escrever fora da janela de 24h.
- Indicador de quem conduz no drawer do Pipeline e no card do Kanban.
- Anexos e mídia no composer.
- Tiques de entrega e leitura das mensagens humanas (eventos `statuses` da Meta).
- Notificação ao corretor de mensagem nova e contador de não lidas.
- Classificador de opt-out em linguagem natural nas conversas conduzidas por humano.
- Histórico de quem assumiu e devolveu cada conversa.
- Atribuir o lead a quem assume a conversa.
- Erro de hidratação no divisor de data da thread do Chats (`<Timestamp format="date_weekday">` em `src/components/chats/message-thread.tsx`): o servidor renderiza o dia em inglês ("Sat, Sep 26, 2026") e o cliente em português. Anterior ao lote-14 (mesma família do problema do `Timestamp` do lote-12); visto na captura da T29.
- Chats em largura de celular: o `LayoutPanel width={320}` fixo deixa a thread, o cabeçalho e o composer espremidos numa coluna estreita (visto na captura da T34, iframe de 390 px). Anterior ao lote-14; a tela precisa de um layout de uma coluna (lista ou conversa) abaixo de um ponto de quebra.
- Possível 500 em `GET`/`PATCH /api/v1/leads/{id}` com id que não é UUID (apontado pelo Worker B na Phase 3, não confirmado): conferir se o Postgres rejeita a conversão antes da validação e responder 404/400.
- Lembretes antigos de `agenda_envios` do número de teste (reuniões de setembro com `sentAt` nulo) ficaram pendentes: o scheduler estava inativo desde 2026-08-23 e foi reativado na T39. Limpar ou marcar antes de deixar o scheduler rodando sem supervisão, para não disparar lembrete de reunião passada.
- Buffer de mensagens do principal reincluiu uma mensagem anterior do lead junto com `sair` (execução 2859, T40). Sem efeito no desfecho; investigar a janela do buffer.
- Estilo (AD-027): no 6d o agente fez três perguntas seguidas no primeiro turno.
- Capturas da prova por WhatsApp salvas como arquivo em `evidencia/` (o lote-11 fez assim; na T40 elas só foram conferidas na sessão).
