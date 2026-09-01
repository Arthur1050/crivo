# Lote 7 — Dado real ponta a ponta: Context

**Gathered:** 2026-08-15
**Spec:** `.specs/features/lote-7-dado-real-ponta-a-ponta/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Trocar o dado mockado do CRM pelo dado real entregue pelo agente (Fase 9 do roadmap), fechando os caminhos de escrita que só o seed preenchia, separando a demonstração comercial da operação-piloto, endurecendo a guarda da chave de API do agente e provando os três desfechos da conversa por execução real.

**Não é** um lote de novas telas nem de novas capacidades do agente. Toda tela envolvida já existe; o trabalho é de fonte de dado, caminho de escrita e prova.

---

## Implementation Decisions

### Separação entre dado de demonstração e dado real

- O seed passa a criar **três** tenants. O dataset rico (leads, conversas, mensagens, baselines) vai inteiro para um novo tenant **`Crivo Demo`**; Triângulo Imóveis e Vale do Uberaba nascem sem nenhum lead.
- A **configuração** dos tenants-piloto continua semeada: corretores, categorias, documentos, horário comercial, tom de voz e chave de API. O que a Fase 9 substitui é dado de lead, não configuração — e o agente precisa dos documentos e do horário comercial para funcionar no smoke.
- Baselines (`baseline_*`) ficam **nulos** nos tenants-piloto e preenchidos no `Crivo Demo`. Baseline real é Fase 10; comparar dado real contra baseline inventado produziria um número falso justo na fase de provar valor.
- Os 50 leads de seed já existentes nos dois tenants são **apagados pelo reseed**, não migrados. Nenhum script de migração one-shot.
- `Crivo Demo` aparece normalmente no seletor de tenants, sem flag e sem caminho especial de código.

### Atribuição de corretor

- Regra do L7: **menor carga ativa** — o lead vai para o corretor com menos leads em `em_qualificacao` + `escalado_humano`. Empate resolvido por `created_at` ascendente e depois por `id`, para ser determinístico e asseverável em teste.
- A decisão mora numa **função pura**, sem I/O, separada da escrita. É a costura para o lote futuro: quando a atribuição passar a considerar disponibilidade de agenda e preferência do lead, muda o corpo dessa função, não o caminho de atribuição.
- O gestor pode **trocar o corretor pelo CRM**, no painel de detalhe do lead. A troca é sempre para outro corretor do tenant — não existe opção de deixar o lead sem dono.
- Tenant sem corretor nenhum: o lead é criado com `broker_id` nulo. Atribuição nunca faz a entrega de lead falhar.

### Comparecimento à reunião

- Quem marca é o **corretor, pelo CRM**, no painel de detalhe do lead — é o único ator que sabe o fato, e o painel já exibe o campo em modo leitura.
- Três estados: pendente (`null`), compareceu (`true`), não compareceu (`false`). O estado pendente precisa existir porque o KPI distingue "sem confirmação" (fora do denominador) de confirmado.
- O controle só aparece quando o lead tem reunião marcada **e ela já passou**. Antes disso o campo continua somente leitura.
- Sem coluna de autoria (quem marcou): não há tabela de usuários. Isso chega com o lote de usuários/papéis.

### Prova por conversa real (dívida da AD-015)

- Os três roteiros — qualificar→agendar, escalar, opt-out — são conduzidos no tenant **Triângulo Imóveis**, com o número de teste já homologado. É o único tenant com `tenant_config` real na instância.
- Evidência de **três origens independentes** por desfecho: screenshot real da tela do CRM, id de execução do n8n **confirmado por consulta à instância** antes de ser citado, e o artefato externo quando existir (evento no Google Calendar).
- Screenshot é gate, não ilustração: captura real pela extensão Claude in Chrome contra build de produção, nunca inspeção de DOM (lição registrada em sessões anteriores).
- Instância fora do ar durante o smoke ⇒ o desfecho é registrado como **não provado**. Nunca inferir sucesso a partir do estado do CRM.

### Status do agente na sidebar

- O subtítulo fixo dá lugar ao instante relativo da **última mensagem do agente no tenant**, em português; sem nenhuma mensagem, um estado ocioso explícito.
- Derivado só de dado do CRM. O CRM não consulta a instância n8n — isso violaria o desacoplamento de INT-08.

### Agent's Discretion

- **Definição e escrita de `first_response_at`**: instante da primeira mensagem `sender = "agente"`, gravado uma vez, dentro da transação de ingestão. Decidido por mim — é a definição que o cálculo do dashboard já pressupõe.
- **Mecanismo concreto de SEC-01** (tirar a chave do texto claro): delegado ao Design com pesquisa. A spec fixa o resultado, não o mecanismo.
- **Forma dos controles novos na UI**: componentes da Astryx, escolhidos no Design conforme AD-010/AD-012.

### Declined / Undiscussed Gray Areas → Assumptions

- **Atendimento humano pelo Chats** foi oferecido e **não selecionado**. Consequência registrada na spec: a premissa da AD-017 ("mensagens escritas por humanos pela tela") segue sem implementação, e o corretor que recebe um lead escalado continua atendendo pelo WhatsApp próprio.
- **Smoke no segundo tenant** (Vale do Uberaba) não foi discutido: fica fora por falta de número de teste homologado, registrado em Out of Scope.

---

## Specific References

- O usuário descreveu o modelo-alvo de usuários assim: "um tenant (a imobiliária) com usuários vinculados a ele e cada usuário com seus respectivos papéis"; administrador gerencia usuários e cargos; um usuário pode acumular papéis (administrador e gestor, por exemplo); o acesso a funções do sistema depende do cargo. E a atribuição de lead passaria a considerar "a disponibilidade de horários nas agendas dos corretores e a preferência do lead", com o gestor podendo alterar pelo CRM.
- Instrução explícita do usuário sobre esse bloco: "Se isso for deixar o lote muito grande, jogue para um lote mais adiante." — acatada.

---

## Deferred Ideas

- **Usuários, perfis e papéis por tenant** (administrador / gestor / corretor, papéis acumuláveis, permissões por cargo, administrador gerenciando os demais) + **atribuição de lead por disponibilidade de agenda e preferência do lead**. Vira lote próprio, posicionado **antes da Fase 10** por decisão do usuário: a Fase 10 instrumenta métricas do piloto, e quem opera o piloto são os usuários reais da imobiliária. Consequência de roadmap a registrar como AD: o novo L8 é o lote de usuários/papéis e a Fase 10 passa a L9 — este lote 7 deixa de ser o penúltimo.
- **Atendimento humano pelo Chats** (corretor responde o lead pelo CRM, mensagem gravada com autoria humana). Fecha o buraco do escalonamento e cumpre a premissa da AD-017. Candidato natural ao lote de usuários/papéis, que é onde "autoria humana" ganha um usuário de verdade para apontar.
- **Baselines reais por tenant** — Fase 10.
- **Segundo número de teste do WhatsApp** para exercitar multi-tenancy real ponta a ponta.
- **Opt-out por linguagem natural, não só pela palavra-chave exata** (pedido do usuário na Phase 4 do lote-7, 2026-08-17). Hoje `gate.mjs` só grava `opted_out_at` quando a mensagem inteira é exatamente `sair` ou `parar` — a exigência de palavra isolada é deliberada, para "quero sair do apartamento" não descadastrar ninguém. Mas na conversa real de T21 o lead escreveu **"não me mande mais mensagens"** e depois **"eu só quero que você pare de me mandar mensagens"**: o agente reconheceu a intenção e parou de puxar assunto, porém `opted_out_at` ficou nulo e ele continuou respondendo. Ou seja, o pedido explícito de parar foi entendido pelo modelo mas não virou registro jurídico. Caminho provável: o agente ganha uma tool `registrar_opt_out` (mesma disciplina das outras — `leadId` sempre por expressão do fluxo, nunca do modelo), que dispara o mesmo `POST /leads/{id}/opt-out` + purga de memória do gate determinístico. A palavra-chave exata continua como caminho determinístico garantido, sem depender do modelo; a tool cobre a intenção em linguagem natural. Vale medir o risco de falso positivo antes (um lead dizendo "pode parar de mandar foto" não é opt-out).
