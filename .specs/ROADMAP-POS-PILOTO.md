# Roadmap pós-piloto — lotes 10 a 14

Sequência proposta para o trabalho que vem depois do roadmap original de 10 fases
(`Roadmap - Fases Epicas.md`, 100% executado em 2026-08-30). Cada lote abaixo é um ciclo completo
da skill `tlc-spec-driven` (Specify → Design → Tasks → Execute), no mesmo padrão da AD-006.

Origem dos itens: as seções `## Deferred Ideas` dos `context.md` (backlog de 29 itens, mapeado em
`features/INDEX.md`) e as dívidas de `STATE.md` § Handoff. Os `#N` referenciam a numeração
consolidada da sessão de 2026-09-04.

**Premissa que ordena tudo**: as duas imobiliárias-piloto ainda são fictícias, só um número de
WhatsApp homologado, nenhuma conversa real roteirizada. O produto está pronto; o piloto não
começou. A prioridade é o que coloca uma imobiliária real conversando — não o que amplia
superfície.

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

**Por que o modelo vem antes do smoke, e não depois.** A AD-015 deferiu o smoke até "a qualidade
das respostas estar madura o suficiente para sustentar um roteiro". O smoke **é o artefato de
evidência dessa qualidade**. Rodá-lo no Gemini e trocar o modelo depois invalidaria a evidência e
exigiria rodar tudo de novo. A ordem pedida pelo usuário (modelo primeiro) é a correta por
razão independente da preferência dele.

**Isolamento deliberado**: este lote não introduz nenhuma tool nova nem muda o gate. Assim,
qualquer diferença de comportamento observada no smoke é atribuível ao modelo — mesma disciplina
que o `design.md` do lote-6c aplicou ao decidir não trocar modelo junto com arquitetura.

---

## L11 — Conteúdo de documento chega ao agente

**Fecha**: #9, e a lacuna estrutural descoberta em 2026-09-04.

| # | Item |
| --- | --- |
| 1 | Storage real do binário (o `upload-dialog.tsx` hoje descarta os bytes; `documents` não tem coluna de conteúdo nem caminho) |
| 2 | Extração de texto do documento e preenchimento de `content` no contrato — hoje `ContextDocument.content` é `null` hardcoded (`src/server/integration/context.ts:22`) |
| 3 | Preview/download no CRM |
| 4 | TTL/LGPD aplicado também ao binário, não só à linha de metadado |

**Por que isto é P0 e não conveniência de CRM.** Hoje a imobiliária cadastra "Tabela de preços —
Residencial Aurora" e o agente recebe **o título do arquivo, não o conteúdo**. Os únicos campos de
texto livre em `tenants` são persona e operação (`agentName`, `agentPresentationMessage`,
`agentVoiceTone`, horários) — não há nenhum outro canal de conhecimento. A promessa central do
PRD §7.3 (contexto isolado por tenant e modalidade) está oca: o agente conversa bem e não sabe
nada sobre os empreendimentos.

**Ordem vs. L10**: discutível e é decisão do usuário. Argumento para vir antes: o smoke do L10
demonstra um agente que não sabe responder sobre imóveis, o que limita o que o roteiro consegue
provar. Argumento para vir depois: o L10 é menor, destrava a AD-015 que está aberta desde
2026-08-09, e o smoke pode ser reexecutado barato depois que o roteiro existir.

**Cuidado de escopo**: isto **não** é o RAG (#18, descartado). É armazenar o arquivo e entregar o
texto — filtragem direta por modalidade, como o PRD §7.3 já especifica para o v1. Embeddings só
quando existir corpus que não caiba no prompt.

---

## L12 — Opt-out por linguagem natural (LGPD)

**Fecha**: #15.

| # | Item |
| --- | --- |
| 1 | Medição de falso positivo **antes** de implementar — corpus de frases reais ("pode parar de mandar foto" não é opt-out) |
| 2 | Tool `registrar_opt_out` com `leadId` sempre por expressão do fluxo, nunca do modelo (disciplina AD-018) |
| 3 | Dispara o mesmo `POST /leads/{id}/opt-out` + purga de memória do gate (AD-019) |
| 4 | Palavra-chave exata (`sair`/`parar`) permanece como caminho determinístico garantido |
| 5 | Cenário dedicado no roteiro de smoke criado no L10 |

**Peso**: é o único item do backlog com consequência jurídica. Na conversa real da T21 do lote-7 o
lead escreveu "não me mande mais mensagens" e depois "eu só quero que você pare de me mandar
mensagens" — o agente entendeu e parou de puxar assunto, mas `opted_out_at` ficou nulo e ele
continuou respondendo. Pedido explícito de parar, entendido pelo modelo, que não virou registro.

**Lote próprio, não fundido no L10**, para que uma regressão conversacional no smoke seja
atribuível ao modelo (L10) ou à tool nova (L12), nunca ambígua.

---

## L13 — Humano no laço

**Fecha**: #7, #11, `openapi.yaml` desatualizado, L5 Fix 1.

| # | Item |
| --- | --- |
| 1 | Composer no Chats: corretor responde o lead pelo CRM, mensagem gravada com autoria humana |
| 2 | Envio via WhatsApp Cloud API a partir do CRM |
| 3 | Link cruzado lead ↔ conversa (abrir a conversa a partir do drawer do Pipeline) — o corretor precisa chegar lá |
| 4 | `openapi.yaml` sem `assignedBroker` nem os 2 códigos de erro do lote-8, mais o que este lote adicionar |
| 5 | L5 Fix 1: 413 e JSON inválido sem teste dedicado em `POST /api/v1/leads` (mesma família de rotas, aproveita o contexto) |

**Buraco que fecha**: hoje o agente escala para humano (`status = escalado_humano`, trava dupla) e
o humano **não tem por onde responder**. A premissa da AD-017 — "o agente enxerga o que o corretor
humano escreveu no CRM" — descreve algo que nunca aconteceu, porque não há como escrever. A
dependência que faltava (usuário real a quem atribuir autoria) foi resolvida no lote-8.

---

## L14 — Prontidão operacional do piloto real

**Fecha**: #3, #23, baselines reais, e a limpeza de dívidas de `STATE.md` § Handoff.

| # | Item |
| --- | --- |
| 1 | Publicação do app Meta / business verification — **bloqueia números e destinatários reais** |
| 2 | Alerta ativo (e-mail/WhatsApp) quando a integração cai — hoje o sinal só existe na tela |
| 3 | Substituir os baselines fictícios pelos números reais das imobiliárias |
| 4 | Confirmar `RESEND_FROM` na Vercel apontando para `usekrivo.online` (hoje cai em `onboarding@resend.dev`) |
| 5 | Helper de revogação de chave de serviço por label na DAL (hoje exige update direto no banco) |
| 6 | Limpar as 2 linhas inertes em `conversa_estado` |
| 7 | L4 Fix 1: extrair `deltaMinutesLine`/`deltaPercentLine` para `src/lib/format.ts` e cobrir com teste |
| 8 | Fechar L4 Fix 2 como **aceito sem artefato** — o Verifier já julgou o comportamento estruturalmente garantido, e produzir a evidência exigiria montar uma camada de teste de UI que o projeto não tem (zero `.test.tsx`) |

**Natureza**: lote heterogêneo de propósito — é a lista de fechamento, não uma feature. Vale
manter junto porque cada item isolado é pequeno demais para um ciclo próprio, e todos compartilham
o mesmo gatilho: a primeira imobiliária real entrando.

---

## Fora destes lotes

Descartados na análise de 2026-09-04 por custo alto e impacto baixo: auditoria completa (#14),
visão cross-tenant (#4), queue mode/Redis (#19), RAG (#18), baseline versionado (#24), ranking por
corretor (#26), reordenação manual no Kanban (#12), atribuição por região (#13), upload de
comprovante (#10), 2FA (#5), L4 Fix 2 como artefato.

Adiados sem descarte, com gatilho nomeado: log de sucesso com latência (#25 — reabrir quando a
saúde inferida errar pela primeira vez), pacote Google + Agenda (#8 — quando uma imobiliária real
pedir), tela de sugestões do agente (#6), produtização SaaS (#1 créditos, #2 Embedded Signup).
