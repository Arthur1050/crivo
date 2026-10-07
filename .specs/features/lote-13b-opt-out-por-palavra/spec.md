# Lote 13b — Opt-out só pela palavra "sair"

**Data:** 2026-10-07 · **Complexidade:** Medium · **Supersede:** AD-032 (lote-13)

## Problem Statement

O fluxo principal chama um classificador LLM em todo turno de conversa só para decidir se a
mensagem é um pedido de opt-out. Na execução 3366 de produção (2026-10-06) foram 887 tokens de
entrada, 24 de saída e 2,2 s a mais por turno, quase tudo prompt fixo. Desde a emenda D11 só a
categoria `explicita` tem efeito. O usuário decidiu remover essa dinâmica: o opt-out passa a
existir só pela mensagem exata "sair", e o agente orienta o lead a enviá-la.

## Goals

- [ ] Nenhuma chamada a modelo além das do próprio agente em um turno de conversa.
- [ ] Opt-out registrado só quando a mensagem do lead, normalizada, é exatamente "sair".
- [ ] Remoção publicada em produção como hotfix sobre o principal do L14, sem ativar o L14b.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Mudar o texto do system message sobre opt-out | Usuário decidiu manter (D11 continua): o texto já orienta responder "sair" a pedido explícito; sem mudança, não há republicação do benchmark nem remedição do teto (L-048) |
| Pergunta de confirmação antes de registrar | Usuário decidiu: "sair" registra na hora e a confirmação é a mensagem fixa existente |
| Pré-filtro ou indicador de opt-out na resposta do agente | Alternativas descartadas pelo usuário em 2026-10-07 |
| Publicar o principal do L14b | Pertence à ativação do L14c |
| Reversão de opt-out, opt-out pela tela do CRM | Sem mudança; o opt-out pela tela (AD-034) segue igual |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Confirmação depois do "sair" | Registrar na hora e enviar `OPT_OUT_CONFIRMATION` sem alteração de texto | Decisão do usuário (2026-10-07); é o comportamento atual da palavra-chave | Sim |
| Palavra "parar" | Deixa de disparar opt-out e segue para o agente | Decisão do usuário (2026-10-07): uma palavra só, a mesma que o agente orienta | Sim |
| Normalização da palavra | A atual de `gate.mjs`: sem acento, minúsculas, sem espaços nas bordas; pontuação não é removida ("sair." não dispara) | Não muda o critério já provado no LGPD-03; ampliar seria decisão nova | Sim, usuário em 2026-10-07 |
| Texto do system message | Byte a byte igual ao publicado | Decisão do usuário (2026-10-07) | Sim |
| Testes, corpus e medição do classificador | Removidos junto com o código; testes da palavra-chave mantidos e ampliados | Decisão do usuário (2026-10-07); o comportamento medido deixa de existir | Sim |
| Caminho até produção | Hotfix: principal gerado da fonte do L14 publicado (`0688deb`) com só esta mudança; o main recebe a mesma mudança | Decisão do usuário (2026-10-07); a economia começa sem ativar o L14b | Sim |
| Workflow `crivo-medicao-opt-out` em produção | Arquivado | Webhook ativo que chama o modelo se acionado; rodou uma vez (execução 2688) | Sim, usuário em 2026-10-07 |
| Constantes `OPT_OUT_CONFIRMATION` e `OPT_OUT_REGISTRATION_FAILED` | Mantidas onde ainda forem usadas (o CRM importa a confirmação); o resto do módulo do classificador sai | O opt-out pela tela usa a mesma confirmação (AD-034) | Sim, usuário em 2026-10-07 |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Turno de conversa sem classificador — SAIR-01 ⭐ MVP

**User Story**: Como operador do Crivo, quero que cada turno chame só o modelo do agente, para não gastar tokens nem latência num classificador.

**Acceptance Criteria**:

1. The system SHALL publicar um fluxo principal sem nó `textClassifier` e com um único nó de modelo de chat, o do agente.
2. WHEN um turno de conversa chega ao agente THEN the system SHALL executar apenas as chamadas a modelo feitas pelo próprio agente.
3. WHEN o lead escreve um pedido em linguagem natural para parar de receber mensagens (por exemplo "não quero mais receber mensagens") THEN the system SHALL encaminhar o turno ao agente sem chamar o CRM de opt-out.
4. The system SHALL manter a mensagem para o lead já descadastrado e a condução humana (`somente-registrar`) com o mesmo roteamento de hoje no gate.

**Independent Test**: grafo gerado do principal sem classificador e com um só modelo; Code nodes do gate roteando os casos acima.

---

### P1: Opt-out pela palavra exata "sair" — SAIR-02 ⭐ MVP

**User Story**: Como lead, quero encerrar o contato respondendo "sair" e receber a confirmação.

**Acceptance Criteria**:

1. WHEN a mensagem do lead, normalizada (sem acento, minúsculas, sem espaços nas bordas), é exatamente "sair" THEN the system SHALL registrar o opt-out pelo `POST /api/v1/leads/{id}/opt-out` e enviar `OPT_OUT_CONFIRMATION` uma única vez.
2. WHEN a mensagem do lead, normalizada, é exatamente "parar" THEN the system SHALL encaminhar o turno ao agente sem registrar opt-out.
3. IF a mensagem contém "sair" dentro de uma frase (por exemplo "quero sair do aluguel") THEN the system SHALL encaminhar o turno ao agente sem registrar opt-out.
4. The system SHALL manter o texto de `OPT_OUT_CONFIRMATION` igual ao publicado, também no opt-out pela tela do CRM.

**Independent Test**: `detectOptOut` com "sair", "SAIR ", "Saír", "parar", "quero sair do aluguel"; grafo do ramo de opt-out inalterado.

---

### P1: Orientação do agente preservada — SAIR-03 ⭐ MVP

**User Story**: Como lead que pede para parar, quero que o agente me diga como encerrar.

**Acceptance Criteria**:

1. The system SHALL publicar o system message do agente com o texto de orientação ao opt-out idêntico ao publicado em `e3e25681` (responder com a palavra "sair", sozinha, a pedido explícito).
2. WHEN o lead faz pedido explícito em linguagem natural para parar de receber mensagens THEN the system SHALL responder pelo agente orientando o envio da palavra "sair", sem afirmar que as mensagens pararam.

**Independent Test**: hash do system message gerado igual ao do publicado; prova real do caso de linguagem natural.

---

### P1: Medição e lock do classificador removidos — SAIR-04 ⭐ MVP

**User Story**: Como mantenedor, quero que nada do classificador continue exigindo manutenção ou expondo chamadas ao modelo.

**Acceptance Criteria**:

1. The system SHALL não conter no repositório o workflow, o script, o corpus, o placar e os testes da medição de opt-out, nem a exigência de medição aprovada para publicar o principal.
2. WHEN o hotfix é publicado THEN the system SHALL ter o workflow `crivo-medicao-opt-out` arquivado na instância n8n.
3. The system SHALL registrar no `STATE.md` uma AD que supersede a AD-032 e restaura a exclusividade do gate da AD-018 e o escopo de modelo único da AD-026.

**Independent Test**: busca no repositório sem referências ativas; `search_workflows` mostra a medição arquivada; STATE validado.

---

### P1: Hotfix em produção com prova real — SAIR-05 ⭐ MVP

**User Story**: Como operador, quero a economia em produção agora, sem antecipar o L14b.

**Acceptance Criteria**:

1. WHEN o hotfix é preparado THEN the system SHALL conferir antes que o principal publicado (`e3e25681`) equivale ao gerado de `0688deb`; IF divergir THEN the system SHALL parar sem publicar.
2. The system SHALL publicar um principal cuja única diferença para `e3e25681` é a remoção do classificador e da palavra "parar" do gate, conferindo `versionId` igual a `activeVersionId` (L-032).
3. WHEN o hotfix está publicado THEN the system SHALL provar por conversa real no alvo de teste os três casos: "parar" respondido pelo agente sem opt-out; pedido em linguagem natural respondido com a orientação "sair"; "sair" registrando opt-out com uma única confirmação.
4. The system SHALL manter no main a mesma mudança, para o principal do L14b nascer sem classificador.

**Independent Test**: diff entre o JSON publicado antes e depois; execuções da prova sem nó de classificador; lead de teste com `opted_out_at` só no caso "sair".

---

## Edge Cases

- IF o CRM recusar o `POST /opt-out` do "sair" THEN the system SHALL seguir o tratamento de falha atual do ramo da palavra-chave, sem mudança.
- WHEN um lead já descadastrado envia "sair" de novo THEN the system SHALL manter o comportamento atual do gate para lead descadastrado.
- WHEN o lead envia "Sair" com acento ou espaços nas bordas THEN the system SHALL registrar o opt-out (normalização atual).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| SAIR-01 | P1: Turno sem classificador | Tasks | Implemented (T3) |
| SAIR-02 | P1: Opt-out pela palavra "sair" | Tasks | Implemented (T2, T4) |
| SAIR-03 | P1: Orientação preservada | Tasks | Implemented (T3); AC2 na prova real T9 |
| SAIR-04 | P1: Medição e lock removidos | Tasks | Implemented (T5, T6, T8) |
| SAIR-05 | P1: Hotfix com prova real | Tasks | T7, T8 feitas; AC3 na prova real T9 |

**Coverage:** 5 total, 5 mapped to tasks.

---

## Success Criteria

- [ ] Turno de conversa em produção sem o nó "Classificador: opt-out" nas execuções.
- [ ] Prova real dos três casos aprovada.
- [ ] Suíte completa sem falha nova.
