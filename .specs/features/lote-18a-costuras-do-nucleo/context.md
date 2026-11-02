# Extração do núcleo — Context

**Gathered:** 2026-11-02
**Spec:** `.specs/features/lote-18a-costuras-do-nucleo/spec.md`
**Decisão de arquitetura:** AD-052 (`.specs/STATE.md`)
**Status:** Spec e design aprovados pelo usuário em 2026-11-02

Este arquivo vale para os lotes L18a, L18b, L18c e L19. Só o L18a tem spec por enquanto.

---

## Feature Boundary

O Krivo vira duas partes: um núcleo sem conhecimento de mercado e o vertical da imobiliária. O objetivo
é construir o app de lojas de materiais no L19 sem copiar o código. O L18a cria as costuras dentro do
pacote único, com o comportamento do Krivo idêntico e nada novo em produção.

---

## Implementation Decisions

### O que é o núcleo

- O núcleo é uma biblioteca de peças, não um fluxo fechado. Ele oferece `createLead`, `sendMessage`,
  `takeOverConversation` e semelhantes; quem compõe o fluxo é o app.
- O app é dono das rotas e pode trocar qualquer peça do núcleo pela própria.
- Tabela do núcleo não muda por causa de um app só. O app acrescenta tabela 1:1 própria.
- Duplicar código local é permitido. Só vira peça do núcleo o que dois apps usam de verdade.
- Cada app tem banco próprio, projeto próprio na Vercel e instância de agente própria.

### Empacotamento

- Monorepo interno com npm workspaces. Nada é publicado em registro. Sem pacote aberto por enquanto.
- Pacotes: `@core/db`, `@core/server`, `@core/agent`, `@core/client` e `@core/vertical-kit`.
- Apps: `apps/real-estate` e `apps/building-materials`.
- Não existe `core-ui`. Cada app monta as próprias telas: a imobiliária em Astryx e materiais em shadcn.
  `@core/client` só tem lógica sem visual (formatação, thread do chat, stores, hooks).
- A vitrine fica em `apps/real-estate` por enquanto.

### Divisão em lotes

| Lote | Entrega | Produção |
| --- | --- | --- |
| L18a | Costuras dentro do pacote único: fronteira verificável, contrato do vertical e símbolos em inglês | Deploy sem mudança de comportamento |
| L18b | Mudança para workspaces, com o build provado num preview (L-088) | Muda o Root Directory da Vercel, só com autorização |
| L18c | Ativação: DDL, troca dos valores gravados, `/api/v1` nos dois vocabulários, republicação do agente | Uma ação por task, com autorização e rollback |
| L19 | App de materiais | Projeto novo |

Cada lote fecha com Verifier próprio. O spec do L18b e o do L18c são escritos depois do fechamento do
lote anterior, porque dependem do que ele revelar.

### Agendamento

- Fica no núcleo, opcional por vertical, com termos genéricos. Serve para reunião, visita técnica ou
  retirada.

### Termos em inglês

Decisão do usuário, em duas partes: "Todos os termos dos recursos precisam ser em inglês" e, ao rejeitar
a exceção para os valores da imobiliária, "Quero somente os termos visíveis no layout em português. Em
código: sempre em inglês."

- Em inglês, no núcleo e nos verticais: símbolos, valores gravados, enums, campos e códigos do `/api/v1`,
  papéis, recursos de permissão, nomes de tools, pacotes, módulos, pastas e URLs.
- Em português: o que uma pessoa lê (telas, e-mails, mensagens de WhatsApp) e o texto do prompt do agente,
  que produz essas mensagens. Pela regra do projeto, também comentários, documentação e commits.

Vocabulário:

| Hoje | Núcleo |
| --- | --- |
| status `em_qualificacao`, `qualificado_agendado`, `escalado_humano` | `engaged`, `goal_reached`, `escalated` |
| papéis `administrador`, `gestor`, `corretor` | `admin`, `manager`, `attendant` |
| fases `qualificando`, `agendando`, `encerrada` | `qualifying`, `closing`, `ended` |
| `sender` `agente`, `lead`, `humano` | `agent`, `lead`, `human` |
| `status_actor` `humano`, `agente` | `human`, `agent` |
| `integration_health_state` `saudavel`, `problema` | `healthy`, `problem` |
| `meetingAt`, `meetingAttended`, `meetingDays`, `meetingHoursStart`, `meetingHoursEnd` | `appointmentAt`, `appointmentAttended`, `appointmentDays`, `appointmentHoursStart`, `appointmentHoursEnd` |
| atribuição de corretor (`broker-*`) | `assignee` (`assignee-*`) |
| ações `ler`, `escrever` | `read`, `write` |
| recursos `documentos`, `configuracoes`, `usuarios`, `imoveis` | `documents`, `settings`, `users`, `catalog` |
| `modality` dos documentos | `segment`, opcional e definido pelo vertical |
| `document_status` `processando`, `pronto`, `falha`, `fora_do_agente` | `processing`, `ready`, `failed`, `outside_agent` |
| `human_send_state` `enviando`, `enviada`, `falhou` | `sending`, `sent`, `failed` |
| códigos de problema (`conflito-de-agenda` e os demais) | inglês (`appointment-conflict`), lista no `design.md` |
| `modality` `novo`, `usado`, `ambos` | `new`, `used`, `both` |
| `property_type` e `property_kind` `casa`, `apartamento`, `sobrado`, `cobertura`, `terreno`, `sala_comercial`, `chacara` | `house`, `apartment`, `townhouse`, `penthouse`, `land`, `commercial_room`, `farmhouse` |
| `property_status` `disponivel`, `reservado`, `vendido` | `available`, `reserved`, `sold` |
| `motivation` `investidor`, `morador` | `investor`, `resident` |
| `credit_status` `pre_aprovado`, `recurso_proprio`, `fgts` | `pre_approved`, `own_funds`, `fgts` |
| `storefront_layout` `grade`, `editorial` | `grid`, `editorial` |
| tools `agendar_reuniao`, `buscar_imoveis`, `consultar_documentos`, `responder_lead` | `schedule_appointment`, `search_catalog`, `query_documents`, `reply_to_lead` |

`attendant` evita `agent`, que já é o agente de IA. `fgts` fica igual: é sigla de um programa brasileiro,
sem tradução.

### Como o inglês entra sem mudar produção (L18a)

- Os símbolos mudam no L18a; os valores gravados e os do fio, as pastas e as URLs, só no L18c.
- Cada valor gravado ou do fio passa a ter uma constante nomeada em inglês: `ROLE.attendant` vale
  `"corretor"` até o L18c. A chave já é o valor futuro, então a troca do L18c é uma edição nesses módulos
  mais o DDL. O núcleo tem um módulo de vocabulário, e o vertical tem outro para os valores de domínio.
- Coluna do Drizzle muda só de propriedade: `appointmentAt: timestamp("meeting_at")`.
- Testes que afirmam valor gravado ou do fio não mudam no L18a. Eles são a prova de que o comportamento
  ficou igual.
- `n8n/` não muda de vocabulário no L18a. O código de `n8n/src/*.mjs` entra inteiro no JSON publicado,
  então renomear ali quebraria a igualdade de bytes.

### Contrato do vertical menor que o primeiro esboço

O esboço da discussão tinha `labels`, `navigation`, `kpis` e `Painel`. Sem `core-ui`, essas coisas são
tela, e tela é do app. O contrato guarda só o que o código do núcleo precisa saber: identidade e marca,
recursos e matriz de permissões do vertical, chave de agendamento, qualificação e segmentos de documento.
As peças do agente ficam em manifesto separado, para o bundle do navegador não carregar prompts.

### Produção

- O L18c pode alterar produção: DDL, backfill, troca do `/api/v1`, republicação do agente e novo Root
  Directory. Cada ação pede autorização própria no chat.
- A ativação é atômica por fluxo (L-061). O `/api/v1` aceita os dois vocabulários até o agente
  republicado ser conferido.

### Agent's Discretion

- O formato do mapa de fronteira, os nomes dos módulos dentro de `src/verticals/real-estate/` e a forma
  como o app entrega o vertical ao núcleo ficam para o Design.

### Declined / Undiscussed Gray Areas → Assumptions

Registrados em Assumptions no spec: URLs e parâmetros de query em inglês com redirecionamento, texto do
prompt em português e o limite da checagem de identificadores.

---

## Specific References

- "Se o núcleo for apenas um tipo de lib que fornece os recursos e não um fluxo fechado, então eu aceito
  essa migração."
- Riscos levantados pelo usuário: ficar preso aos limites do núcleo e manter a separação à toa se só um
  app vingar. As regras de saída acima respondem ao primeiro. O segundo é custo aceito, sem prazo apertado.

---

## Deferred Ideas

- Publicar o núcleo como código aberto: fora por enquanto.
- Backend separado em Python: descartado pelo usuário.
- `core-ui`: descartado, cada app monta as próprias telas.
- Mover a vitrine para app próprio: depois do L19, se fizer sentido.
- Turborepo: só se o tempo de build pedir.
- Nomes de nós e de Data Tables do n8n (`conversa_estado`, `agenda_envios`), textos `title` e `detail` do
  `/api/v1`, pastas e URLs das telas, parâmetros de query, `vitrine/` e seus identificadores: entram no L18c,
  a detalhar no spec dele.
