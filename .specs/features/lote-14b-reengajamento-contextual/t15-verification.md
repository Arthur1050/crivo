# T15 — política pura de elegibilidade

PASS pelo root: Quick exit0, 3/3 arquivos e 88/88 testes, 677ms, início
2026-10-03 08:03:29 America/Sao_Paulo. São 44 novos cenários e 44 regressões
de conduction/business-hours. Comando:
`node node_modules/vitest/vitest.mjs run n8n/src/__tests__/reengagement.test.ts n8n/src/__tests__/conduction.test.ts n8n/src/__tests__/business-hours.test.ts`.
ESLint direcionado exit0. Tsc exit2 com as mesmas 50 linhas de erro do baseline,
Compare-Object vazio. Spec/tasks strict: zero erros e avisos; whitespace exit0.
Logs t15-tests.local.log e t15-types.local.log são somente locais.

evaluateReengagement é pura e retorna action/reason. O CRM fornece fatos já
lidos: âncora real corrente, fase, marcas, canal resolvido e destinatário MSISDN
normalizado pelo toWhatsAppMsisdn existente. A política não resolve tenant,
propriedade, credencial, revisão ou consumo de tentativa; os serviços seguintes
fazem essa verificação sob lock. Não há formato telefônico novo ou dependência
de Analytics/token para omissão e escalonamento internos.

O contrato de reason é eligible (prepare), too-early (null), window-closed
(omit), outside-contact-hours (null), ineligible (null), unknown-data (null)
e silence-expired (escalate). Nenhum resultado faz I/O.

Antes do gate, a revisão encontrou coerção String de fase/status e marcas falsy
ilegíveis que poderiam permitir contato. A correção exige strings literais para
os enums, e null ou Date/string com instante válido para as marcas. Preservou os
35 cenários iniciais e acrescentou nove casos anti-coerção. Nenhuma asserção
anterior foi enfraquecida, removida ou pulada. Não há SPEC_DEVIATION.

## Adequação forward e reverse

`test` significa n8n/src/__tests__/reengagement.test.ts. A parametrização declara
valores independentes e literais a partir da spec; cada linha abaixo inclui o
número de cenários. O mapa reverso cobre todos os 44 novos testes. action é a
decisão da política; reason é código interno para diagnóstico, não substitui
o efeito persistido nem afirma conclusão dos ACs completos do produto.

| AC / cenário (quantidade) | file:line + expressão | Esperado da spec/Design | Reverse |
| --- | --- | --- | --- |
| REEN-01 AC1/2, 21:59:59.999/22h/23:59:59.999/24h (4) | test:24 `expect(evaluateReengagement({ ...base, anchor })).toEqual({ action, reason })`, literais test:18–21 | null antes22h; prepare desde22h até24h exclusivo; omit em24h | Manter: fronteiras exatas de contato |
| REEN-01 AC5, agendando ainda aberta (1) | test:28 `expect(evaluateReengagement({ ...base, phase: "agendando" })).toEqual({ action: "prepare", reason: "eligible" })` | Fase não encerrada, status em_qualificacao, permite retomada | Manter: não confundir fase com status agendado |
| REEN-01 AC3/A2, abertura/fechamento (4) | test:40 `expect(evaluateReengagement({ ...base, now, anchor })).toEqual({ action, reason: action ? "eligible" : "outside-contact-hours" })`, instantes test:34–37 | 09h inclusivo, 18h exclusivo em São Paulo; null antes/no fim | Manter: início/fim comerciais |
| REEN-01 AC3/A2, sábado/domingo fallback (2) | test:45 `expect(evaluateReengagement({ ...base, now, anchor })).toEqual({ action: null, reason: "outside-contact-hours" })` | Seg–sex padrão exclui fim de semana | Manter: dias configurados |
| REEN-01 AC3/A2, configuração incompleta (1) | test:49 `expect(evaluateReengagement({ ...base, settings: { meetingDays: [6], meetingHoursStart: null, meetingHoursEnd: "12:00" } })).toEqual({ action: "prepare", reason: "eligible" })` | Fallback inteiro seg–sex09h–18h; não mistura sábado com horas padrão | Manter: fallback aprovado |
| REEN-01 AC3/A2, sábado configurado (1) | test:53 `expect(evaluateReengagement({ ...base, now: "2026-10-03T13:00:00.000Z", anchor: { ...base.anchor, sentAt: "2026-10-02T15:00:00.000Z" }, settings: { meetingDays: [6], meetingHoursStart: "10:00", meetingHoursEnd: "12:00" } })).toEqual({ action: "prepare", reason: "eligible" })` | Usa os dias/horas completos do tenant | Manter: horário configurado substitui fallback |
| REEN-01 AC2/3, oportunidade perdida entre ticks (1) | test:58 `expect(evaluateReengagement({ ...base, anchor, now: "2026-10-06T21:00:00.000Z" })).toEqual({ action: null, reason: "outside-contact-hours" })`; test:59 mesmo input dia seguinte `toEqual({ action: "omit", reason: "window-closed" })` | Adia fora do horário, sem contatar quando próximo dia excedeu24h | Manter: adiamento não amplia janela |
| REEN-01 AC5, agendado/escalado/encerrada/opt-out/takeover (5) | test:71 `expect(evaluateReengagement(input)).toEqual({ action: null, reason: "ineligible" })`, fixtures test:65–69 | Cada condição impede a retomada | Manter: cinco exclusões explícitas |
| REEN-01 AC6, lead/marcas ausentes, fase null/inventada, âncora ausente/semID/ilegível/futura, relógio inválido, canal ausente/inválido, destino vazio (12) | test:88 `expect(evaluateReengagement(input)).toEqual({ action: null, reason: "unknown-data" })`, fixtures test:75–86 | Dados críticos ausentes ou inconsistentes não permitem contato | Manter: falha fechada |
| REEN-01 AC6, fase encapsulada/numérica, status encapsulado e seis marcas inválidas/falsy (9) | test:102 `expect(evaluateReengagement(input)).toEqual({ action: null, reason: "unknown-data" })`, fixtures test:92–100 | Enum/marcas ilegíveis não viram elegibilidade por coerção | Manter: falha fechada por tipo |
| REEN-05 AC2, 47:59:59.999/48h/48h+1ms em domingo meia-noite (3) | test:114 `expect(evaluateReengagement({ ...base, now, anchor })).toEqual({ action, reason })`, literais test:108–110 | omit antes48h; escalate em48h/+1ms, independentemente do horário | Manter: relógio original governa ação interna |
| REEN-01 AC5; REEN-05 AC2, takeover em48h (1) | test:118 `expect(evaluateReengagement({ ...base, anchor: { ...base.anchor, sentAt: "2026-10-04T15:00:00.000Z" }, lead: { ...base.lead, humanTakeoverAt: NOW } })).toEqual({ action: null, reason: "ineligible" })` | 48h não remove condução humana | Manter: precedência da proteção humana |

Asserções verificam o objeto resultante, sem mocks de chamadas. Todos os ramos
de T15 têm evidência localizada e resultados derivados da spec; os 44 testes
são necessários. Diretrizes: AGENTS.md, vitest.config.ts e matriz Domínio puro.
T15 prova somente a política. Seleção, locks/CAS, omissão/transição persistidas,
template desativado, ligação de workflows e prova real continuam nas tarefas
atribuídas; nenhum desses efeitos é declarado realizado aqui.
