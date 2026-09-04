# Roadmap pós-piloto — lotes 10 a 16

Sequência proposta para o trabalho que vem depois do roadmap original de 10 fases
(`Roadmap - Fases Epicas.md`, 100% executado em 2026-08-30). Cada lote abaixo é um ciclo completo
da skill `tlc-spec-driven` (Specify → Design → Tasks → Execute), no mesmo padrão da AD-006.

Origem dos itens: as seções `## Deferred Ideas` dos `context.md` (backlog de 29 itens, mapeado em
`features/INDEX.md`), as dívidas de `STATE.md` § Handoff, e **duas frentes novas trazidas pelo
usuário em 2026-09-04 a partir de conversa com um cliente-âncora real** (catálogo de imóveis e
vitrine pública) — as únicas do backlog inteiro com demanda declarada por cliente, e não inferida.

**Premissa que ordena tudo**: as duas imobiliárias-piloto ainda são fictícias, só um número de
WhatsApp homologado, nenhuma conversa real roteirizada. O produto está pronto; o piloto não
começou. A prioridade é o que coloca uma imobiliária real conversando — não o que amplia
superfície. A exceção deliberada são L11/L14, que têm sinal de cliente real.

---

## L10 — Modelo alvo e prova conversacional

**Fecha**: AD-015 (smoke deferido), AGT-04, AGT-05, LGPD-03 ponta a ponta, #16, #17, #21.

| # | Item |
| --- | --- |
| 1 | Migração do modelo do agente para `gpt-5-nano` — credencial OpenAI, troca do nó `languageModel`, **reverificação completa de tool calling** (o risco real da troca, não o custo) |
| 2 | Resolver a divergência fonte × instância: `n8n/workflows/principal.ts` declara `models/gemini-3.5-flash`, a instância roda `gemini-3.5-flash-lite` (trocado à mão na UI). Hoje qualquer publish reverte a instância sem querer |
| 3 | Smoke conversacional roteirizado (AD-015): 3 conversas reais — qualificar→agendar, escalar, opt-out por palavra-chave — com screenshots do CRM e evidência do evento no Calendar |
| 4 | 2º número de teste homologado + `tenant_config` do Vale do Uberaba, para o smoke exercitar multi-tenancy real ponta a ponta |
| 5 | Reconciliar VOZ-03 AC4 / Edge Cases com o comportamento real (silêncio no estouro de `maxIterations`) — doc, não código. Ver `lote-6c/validation.md` Finding 1 |
| 6 | `n8n/README.md` §4 obsoleto (o guard `process.env.VITEST` já neutraliza o risco descrito) |

**Por que o modelo vem antes do smoke.** A AD-015 deferiu o smoke até "a qualidade das respostas
estar madura o suficiente para sustentar um roteiro". O smoke **é o artefato de evidência dessa
qualidade** — rodá-lo no Gemini e trocar o modelo depois invalidaria a prova.

**Isolamento deliberado**: este lote não introduz tool nova nem muda o gate, para que qualquer
diferença observada no smoke seja atribuível ao modelo. Mesma disciplina que o `design.md` do
lote-6c aplicou ao recusar trocar modelo e arquitetura no mesmo ciclo.

---

## L11 — Catálogo de imóveis

**Origem**: usuário, 2026-09-04, a partir de necessidade declarada por dono de imobiliária.
**Registro perdido**: o usuário lembra de ter levantado a ideia durante a execução de algum lote,
mas ela **não existe em lugar nenhum** de `.specs/` — nem em `Deferred Ideas`, nem em `STATE.md`,
nem no PRD, e não há tabela de imóveis no schema (15 tabelas, nenhuma de inventário). Causa
provável: a skill captura `Deferred Ideas` na fase de discuss; ideia que nasce no meio do Execute
não tem onde pousar. Convenção nova: ideia surgida em execução vai para o `context.md` do lote
corrente na hora.

| # | Item |
| --- | --- |
| 1 | Tabela de imóveis com `tenant_id` desde o schema (AD-002), reusando `modalityEnum` (`novo`/`usado`/`ambos`) que já existe |
| 2 | Campos: tipo, endereço/bairro/cidade, preço, área, quartos, banheiros, vagas, status (disponível/reservado/vendido), descrição, fotos, datas |
| 3 | **Corretor de captação** — FK para `users` (lote-8 fez corretor = usuário), distinto do responsável pelo atendimento |
| 4 | CRUD no CRM, com permissão por papel (gestor/administrador cadastram; corretor conforme decisão do Specify) |
| 5 | Tool `buscar_imoveis` para o agente — consulta estruturada, filtros por modalidade/faixa de preço/bairro/quartos |

**Por que isto é a resposta certa para "o agente não sabe nada".** Com inventário em linhas
estruturadas, "quais opções de 3 quartos até 500 mil no Santa Maria" vira **consulta SQL
determinística** — exata, barata, sem alucinação. É estritamente melhor que texto de documento, e
muito melhor que RAG, para a pergunta que mais aparece numa qualificação. O conteúdo de documento
(L12) continua necessário, mas para o que **não** é inventário.

**Questão de negócio para o Specify resolver, não o agente**: captador e corretor responsável são
papéis distintos com implicação de comissão. `leads.assigned_user_id` (AD-022) aponta o responsável
pelo atendimento; o captador é outro vínculo. Se os dois disputam comissão na vida real, isso é
regra de negócio antes de ser schema.

**Sequenciamento da tool**: o item 5 introduz tool nova. Se o L10 ainda não tiver fechado, ele
confunde a atribuição do smoke. Ou entra depois do L10, ou o Specify separa o CRUD (itens 1–4) da
tool (item 5).

---

## L12 — Conteúdo de documento chega ao agente

**Fecha**: #9, e a lacuna estrutural descoberta em 2026-09-04. **Escopo reduzido pelo L11**: com o
inventário estruturado no catálogo, este lote passa a servir o conhecimento **não-inventário** —
política de financiamento, documentação exigida, condições de pagamento, regulamento de condomínio.

| # | Item |
| --- | --- |
| 1 | Storage real do binário (`upload-dialog.tsx:67` descarta os bytes por construção; `documents` não tem coluna de conteúdo nem caminho) |
| 2 | Extração de texto e preenchimento de `content` no contrato — hoje `ContextDocument.content` é `null` hardcoded (`src/server/integration/context.ts:22`) |
| 3 | **Parâmetro `pergunta` em `getContext`**, como o PRD §7.6 já previu, para que a troca futura por busca vetorial seja substituição de implementação atrás da mesma interface |
| 4 | **Medir o teto de injeção direta** — a partir de que volume de corpus a injeção estoura janela/custo/latência. É o número que dispara o L-RAG condicional |
| 5 | Preview/download no CRM |
| 6 | TTL/LGPD aplicado também ao binário, não só à linha de metadado |

**A lacuna, em três evidências**: `documents` guarda só metadado (`schema.ts:274-291`); o
upload-dialog descarta o binário por construção (comentário no próprio código); `content` é `null`
hardcoded no contrato. Os únicos campos de texto livre em `tenants` são persona e operação
(`agentName`, `agentPresentationMessage`, `agentVoiceTone`, horários). Hoje a imobiliária cadastra
"Tabela de preços — Residencial Aurora" e o agente recebe **o título do arquivo**.

---

## L13 — Opt-out por linguagem natural (LGPD)

**Fecha**: #15.

| # | Item |
| --- | --- |
| 1 | Medição de falso positivo **antes** de implementar — corpus de frases reais ("pode parar de mandar foto" não é opt-out) |
| 2 | Tool `registrar_opt_out` com `leadId` sempre por expressão do fluxo, nunca do modelo (disciplina AD-018) |
| 3 | Dispara o mesmo `POST /leads/{id}/opt-out` + purga de memória do gate (AD-019) |
| 4 | Palavra-chave exata (`sair`/`parar`) permanece como caminho determinístico garantido |
| 5 | Cenário dedicado no roteiro de smoke criado no L10 |

**Peso**: é o único item do backlog com consequência jurídica. Na T21 do lote-7 o lead escreveu
"não me mande mais mensagens" e depois "eu só quero que você pare de me mandar mensagens" — o
agente entendeu e parou de puxar assunto, mas `opted_out_at` ficou nulo e ele continuou
respondendo. Pedido explícito de parar, entendido pelo modelo, que não virou registro.

---

## L14 — Vitrine pública do catálogo

**Origem**: usuário, 2026-09-04, mesma conversa do L11. **Depende de L11** — sem catálogo não há o
que exibir.

| # | Item |
| --- | --- |
| 1 | Página pública de catálogo + página de item, por tenant, sem autenticação |
| 2 | Personalização: paleta (conjunto fechado), logo, template de disposição (começar com **dois**, bem-feitos) |
| 3 | CRECI e rodapé legal — **obrigatório** em anúncio imobiliário no Brasil, campo requerido e não opcional |
| 4 | Domínio próprio (`imoveis.imobiliariax.com.br`) — o item que o cliente mais vai pedir e o de maior custo de infra (DNS, certificado). Decidir cedo |
| 5 | Metadados de compartilhamento (título, descrição, imagem OG) — a página nasce para circular em grupo de WhatsApp |
| 6 | Curadoria de destaques — quais imóveis aparecem primeiro. É o controle de uso diário do gestor, mais que paleta |
| 7 | Contato e redes (WhatsApp, Instagram, telefone, endereço) e textos institucionais |
| 8 | Captura de lead na página → link para o WhatsApp do agente **com contexto do imóvel**, fechando o laço vitrine → agente → CRM |

**Duas ADs ativas que este lote contradiz e precisa emendar explicitamente** (regra do `CLAUDE.md`):

- **AD-010** diz "fidelidade limitada aos tokens padrão da Astryx (**sem theming custom por ora**)".
  Paleta escolhida pelo cliente é exatamente theming custom. Recomendação: construir a vitrine
  **fora da Astryx** — uma lib de componentes de CRM não é a ferramenta para uma página que precisa
  parecer de outra empresa.
- **AD-007** desabilitou Cache Components do Next 16 (render dinâmico por request), correto para o
  CRM. A vitrine quer o oposto — estático/ISR, por SEO e custo. Carve-out necessário.

**Risco novo, o mais sensível do produto até aqui**: é a primeira superfície sem autenticação. Toda
a disciplina de isolamento (`verifySession()` memoizada, `LeadScope` como tipo obrigatório)
pressupõe usuário autenticado. O caminho de leitura público precisa do próprio escopo, incapaz de
vazar qualquer coisa além do catálogo daquele tenant.

**Decisão de AD pendente**: roteamento por tenant sem sessão — subdomínio, path (`/c/<slug>`) ou
domínio próprio. Determina custo de infra e o que dá para vender.

**Contenção deliberada**: nada de seletor livre de fonte nem cor arbitrária — caminho curto para
uma vitrine ilegível que o cliente vai culpar o produto por ter permitido. 4–6 paletas prontas,
2–3 pares tipográficos, 2 templates.

---

## L15 — Humano no laço

**Fecha**: #7, #11, `openapi.yaml` desatualizado, L5 Fix 1.

| # | Item |
| --- | --- |
| 1 | Composer no Chats: corretor responde o lead pelo CRM, mensagem gravada com autoria humana |
| 2 | Envio via WhatsApp Cloud API a partir do CRM |
| 3 | Link cruzado lead ↔ conversa (abrir a conversa a partir do drawer do Pipeline) |
| 4 | `openapi.yaml` sem `assignedBroker` nem os 2 códigos de erro do lote-8, mais o que este lote adicionar |
| 5 | L5 Fix 1: 413 e JSON inválido sem teste dedicado em `POST /api/v1/leads` |

**Buraco que fecha**: hoje o agente escala para humano (`status = escalado_humano`, trava dupla) e o
humano **não tem por onde responder**. A premissa da AD-017 — "o agente enxerga o que o corretor
humano escreveu no CRM" — descreve algo que nunca aconteceu, porque não há como escrever.

---

## L16 — Prontidão operacional do piloto real

**Fecha**: #3, #23, baselines reais, e a limpeza de dívidas de `STATE.md` § Handoff.

| # | Item |
| --- | --- |
| 1 | Publicação do app Meta / business verification — **bloqueia números e destinatários reais** |
| 2 | Alerta ativo (e-mail/WhatsApp) quando a integração cai |
| 3 | Substituir os baselines fictícios pelos números reais das imobiliárias |
| 4 | Confirmar `RESEND_FROM` na Vercel apontando para `usekrivo.online` |
| 5 | Helper de revogação de chave de serviço por label na DAL |
| 6 | Limpar as 2 linhas inertes em `conversa_estado` |
| 7 | L4 Fix 1: extrair `deltaMinutesLine`/`deltaPercentLine` para `src/lib/format.ts` e cobrir com teste |
| 8 | Fechar L4 Fix 2 como **aceito sem artefato** — produzir a evidência exigiria montar uma camada de teste de UI que o projeto não tem (zero `.test.tsx`) |

---

## L-RAG — condicional, com gatilho nomeado

**Não é lote agendado.** Posição revista em 2026-09-04, depois de o usuário levantar o cenário de
um cliente com acervo grande.

**O que estava errado na análise anterior**: o tamanho do corpus foi julgado pelos tenants do
piloto, que são fictícios — amostra de zero clientes reais. O cenário de acervo grande tem modo de
falha concreto: com ~200 PDFs, injeção direta estoura janela de contexto, custo e latência de uma
vez.

**O que continua valendo**: RAG não é a resposta para "o agente conhece os imóveis" — o catálogo
(L11) é, e melhor, porque devolve resposta exata em vez de aproximada. E construir embeddings antes
de existir corpus é otimizar o vazio.

**Gatilho**: corpus de algum tenant acima do teto de injeção direta medido no L12 item 4.

**Por que a espera é barata**: o PRD §7.6 já comprou essa opção — "acesso ao contexto atrás de uma
interface única (`getContext(tenant_id, modalidade, pergunta)`), permitindo trocar a implementação
por busca vetorial no futuro sem alterar quem consome". A interface já existe em
`src/server/integration/context.ts`; o L12 item 3 adiciona o parâmetro que falta. Quando o gatilho
disparar, é troca de implementação atrás da mesma interface, não redesenho.

**Nota comercial**: o cliente não compra "RAG", compra "ele sabe responder sobre a minha
imobiliária". Catálogo estruturado + documentos legíveis já entregam essa frase.

---

## Ordem sugerida e pontos em aberto

L10 → L11 → L12 → L13 → L14 → L15 → L16, com duas ressalvas:

1. **L11 vs. L10**: o catálogo tem o único sinal de cliente real do backlog inteiro. Se a janela
   comercial pedir, ele pode vir primeiro — o custo é adiar a AD-015, aberta desde 2026-08-09.
2. **L14 pode subir** se a vitrine for o argumento de venda da próxima reunião. Depende de L11,
   nunca do resto.

---

## Fora destes lotes

Descartados por custo alto e impacto baixo (análise de 2026-09-04): auditoria completa (#14), visão
cross-tenant (#4), queue mode/Redis (#19), baseline versionado (#24), ranking por corretor (#26),
reordenação manual no Kanban (#12), atribuição por região (#13), upload de comprovante (#10), 2FA
(#5), L4 Fix 2 como artefato.

Adiados com gatilho nomeado: RAG (#18 — ver L-RAG acima; **saiu dos descartados**), log de sucesso
com latência (#25 — quando a saúde inferida errar pela primeira vez), pacote Google + Agenda (#8 —
quando uma imobiliária real pedir), tela de sugestões do agente (#6), produtização SaaS (#1
créditos, #2 Embedded Signup).
