# T9 — Prova real dos três casos

Executada em 2026-10-07 com autorização do usuário no chat. Mensagens digitadas no WhatsApp Web da conta do número de teste (conta confirmada pelo usuário), conversa "Test Number (Crivo)", tenant `triangulo`. Principal publicado: versão `ddb63ae8`. Reset duplo (n8n `crivo-smoke-reset`, depois `npm run smoke:reset`) antes de cada caso e ao final; n8n: execuções 3473, 3484, 3497, 3511.

| Caso | Mensagem do lead | Execução | Rota do gate | `optedOutAt` | Resposta | Veredito |
| --- | --- | --- | --- | --- | --- | --- |
| 5a | `parar` | 3479 | `conversa` | nulo | Agente orientou responder `sair`, sozinha; nenhum POST de opt-out | Aprovado |
| 5b | pedido em linguagem natural para parar de receber mensagens | 3491 | `conversa` | nulo | Agente orientou responder `sair`, sozinha, sem dizer que as mensagens pararam | Aprovado |
| 5c | `sair` | 3504 | `opt-out` | gravado (POST do CRM com sucesso) | Uma única confirmação enviada (um envio fixo na execução); purga de memória e de `conversa_estado` executadas | Aprovado |
| 5c, turno 3 | mensagem qualquer depois | 3509 | `somente-registrar` | já gravado | Nenhuma resposta (aguardados 30 s; sem nó de envio na execução) | Aprovado |

Turno 1 de interesse de cada caso: execução 3474 inspecionada (lead novo, rota `conversa`, agente respondeu); os turnos 1 de 5b e 5c seguiram o mesmo caminho e foram vistos na conversa, sem inspeção individual.

## Execuções sem classificador

O principal publicado não tem o nó "Classificador: opt-out" (65 nós, um único `lmChatOpenAi`). Nas execuções 3474, 3479, 3491, 3504 e 3509 consultadas, nenhum dado desse nó nem de "HTTP: POST /leads/{id}/opt-out (linguagem natural)" aparece.

## Ressalvas

- A sessão de memória do caso 5c foi purgada pelo ramo (nó "Chat Memory Manager: purgar memória (opt-out)" com sucesso na execução 3504); a leitura direta da tabela `n8n_chat_histories` não foi feita, porque não há tool de leitura de Postgres do n8n (AD-027).
- O reset final deixou o lead de teste apagado; o `sair` do caso 5c não permanece no CRM.
