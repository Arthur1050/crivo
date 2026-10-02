# Execute — L14b: reengajamento contextual e visibilidade de consumo

Ative a skill **$tlc-spec-driven pelo nome** e inicie a fase Execute do L14b no repositório
`C:\Users\user\Documents\projetos_saas\crivo`. O escopo aprovado está em
`.specs/features/lote-14b-reengajamento-contextual/`. Execute as 68 tarefas em ordem,
com testes e commits atômicos, até o fechamento verificável do lote.

## Aprovações que já existem

Em 2026-10-02 o usuário aprovou spec, Design, as 68 tarefas, matriz/gates, perfis de
ferramentas S/R/N/U e a execução por lotes sequenciais de agentes. A proposta final foi:
“Aprova as tarefas, as ferramentas propostas e a execução por lotes sequenciais de agentes?”.
A resposta foi: **“Aprovo. Gere o prompt de execução para que a fase de execução seja
iniciado em outra janela de contexto”**.

- Implementação local, commits locais e os workers sequenciais estão aprovados. Não repetir
  perguntas sobre spec, Design, Tasks, ferramentas ou uso dos agentes.
- Ferramentas: shell/arquivos/rg/Vitest, leitura Meta Graph com credencial servidor,
  MCP n8n para descoberta e leitura, SDK/inliner local, Astryx e navegador para UI.
  Os perfis de cada tarefa em tasks.md governam a escolha.
- Os testes e suas fixtures isoladas previstos na matriz estão aprovados. Antes de
  aplicar mudança estrutural em banco externo, inclusive `npm run db:push:test`,
  identificar branches-alvo e apresentar schema/diff preparado para a autorização específica.
  Isso não é autorização de migração de produção.
- Push, deploy, mutações/publicação/execução remota de workflows, alterações de conta/env,
  aplicação de bootstrap remoto e envio WhatsApp real dependem de autorização específica.
  Preparar o resultado concreto e o plano antes de pedir; aprovação de Tasks não amplia
  automaticamente esse escopo. Respeitar também as aprovações técnicas do sandbox.
- Consumir credenciais somente pelo processo servidor/autenticação existente. Nenhum valor
  de token/chave/senha em prompt, código, log, navegador, commit ou evidência.

## Inicialização e reconciliação

1. Ler integralmente SKILL.md e as referências implement.md, coding-principles.md,
   sub-agents.md e memory.md da skill ativada. Antes do Verifier, ler validate.md.
   Resolver scripts/referências no diretório real da skill; não confundir com scripts do projeto.
2. Ler AGENTS.md e demais instruções locais aplicáveis, as decisões ativas e o Handoff
   de .specs/STATE.md. Prioridade para AD-014 (commits/workflow-as-code), AD-018/019,
   AD-022/023, AD-026/027, AD-028/029, AD-031/032/033/034/035/036/037.
   Carregar somente lições confirmadas via lessons.py.
3. Ler spec.md, context.md e design.md desta feature; em tasks.md carregar protocolo,
   matriz/gates, ferramentas, execução, rastreabilidade e definições do lote atual.
   Carregar tarefas de outros lotes somente se forem dependências concretas. Manter
   o contexto relevante perto do orçamento da skill, sem reler as 68 definições a cada worker.
4. Reconciliar branch, HEAD, git status --porcelain, commits recentes e status de tarefas
   antes de editar. Referência da entrega do prompt: **main / acde7b5**, nenhuma tarefa
   implementada, nenhum worker despachado e nenhum commit de planejamento criado.
5. Mudanças esperadas são documentos: STATE.md, ROADMAP-POS-PILOTO.md e context.md,
   spec.md, design.md, tasks.md, EXECUTE-PROMPT.md desta feature. O diretório da feature
   estava untracked; essas mudanças são o planejamento aprovado. Preservar tudo.
   Mudanças adicionais precisam ser atribuídas ao trabalho atual antes de incluir em commit.
6. Executar validate_spec.py e validate_tasks.py com --strict, e conferir whitespace.
   O último gate documental passou com zero erros/avisos e 13 requisitos/95 ACs mapeados.
   Isso não é prova de funcionamento do produto.
7. Se o planejamento continuar não commitado, auditar o diff e criar um commit documental
   somente com os sete arquivos aprovados acima, antes de T1, validando a mensagem.
   Registrar seu hash como baseline da execução. Se já existir, não duplicar.
8. Obter baseline fresco de testes, lint/build e diagnóstico de tipos conforme a matriz.
   Referência histórica L14: 2400/2402 testes, dois timeouts DOCLIM-01 AC8, tsc com
   50 erros anteriores. Não tratar como PASS atual nem exceção já concedida ao L14b.
   Não pular/enfraquecer testes; resolver falhas ou registrar necessidade de orientação.
9. Comunicar o próximo passo reconciliado e começar T1. Aprovações existentes dispensam
   nova confirmação geral de execução; gates factuais e ações externas continuam específicos.

## Lotes de execução

Uma tarefa por vez, uma fase concluída antes da próxima, um worker por lote.
O worker seguinte só começa depois dos gates e do resumo verificado do anterior.
Aplicando o orçamento por fases inteiras ao plano atual:

| Lote | Fases | Tarefas | Quantidade |
| --- | --- | --- | --- |
| A | 1 | T1–T7 | 7 |
| B | 2 | T8–T14 | 7 |
| C | 3 | T15–T23 | 9 |
| D | 4 | T24–T32 | 9 |
| E | 5 | T33–T40 | 8 |
| F | 6 | T41–T47 | 7 |
| G | 7 | T48–T56 | 9 |
| H | 8–9 | T57–T68 | 12 |

O último lote reúne duas fases de seis tarefas. Se o contexto efetivo ultrapassar o
orçamento da skill, fechar o lote na fronteira entre fases8/9, sem dividir fase nem
alterar dependências. Não executar lotes em paralelo. Workers não criam subagentes.

Usar o modelo configurado na sessão, salvo orientação aplicável. Cada worker recebe:
definições completas de seu lote, matriz/gates, coding-principles.md, ACs/Design relevantes,
decisões e lições aplicáveis, autorizações e limites externos. O orquestrador conserva os
gates externos, coordena permissões e valida o resumo contra Git/tasks.md.

O resumo deve incluir tarefas/hashes, comandos/contagens de testes, adequação, desvios e
pendências. Se uma tarefa falhar, parar o lote; corrigir ou resolver a pendência antes de
avançar. Não marcar tarefa concluída sem cumprir seu Done when.

## Contrato de cada tarefa

- Declarar pressupostos, arquivos exatos e resultado verificável antes de editar.
- Escrever/atualizar testes na própria tarefa, derivados dos ACs e casos listados.
  Provar valores/estados, inclusive payloads; chamada de mock ou substring isolada
  não substitui resultado. Cumprir mínimos previstos sem inventar requisitos.
- Rodar Quick/Full e regressões afetadas; ao fechar fase, Build. Testes de disputa usam
  Postgres real e conexões independentes. Capturar contagens e adequação evidence-or-zero
  com file:line + asserção + resultado da spec, inclusive o mapa inverso de necessidade.
- Preservar a cobertura existente. Caso uma asserção existente pareça contrária à spec,
  seguir o gate da skill para corrigir; não modificá-la silenciosamente.
- Atualizar tasks.md e rastreabilidade antes de cada commit; incluir implementação,
  testes, generated necessário e status no mesmo commit. Um commit por tarefa.
  Validar Conventional Commits com check_commit.py; descrição imperativa.
- Cumprir a regra local de autoria: sem Co-Authored-By ou outras marcas de atribuição
  vedadas pelo projeto. Nenhum ajuste oportunista; ideias adicionais em Deferred Ideas.

## Ambiente e guias obrigatórios

- Next instalado: ler o guia relevante em node_modules/next/dist/docs/ antes de código.
- Astryx: npx astryx build → template → component/props; frame primeiro, tokens e
  componentes de layout, sem novo div/span de layout, style inline, CSS manual ou valores
  arbitrários. Revalidar o self-check; após múltiplos TSX, usar a skill de revisão React aplicável.
- n8n: consultar schemas/nós/SDK efetivos pelo MCP; fonte em workflows/src, inliner e
  generated reproduzíveis. Não editar generated à mão nem assumir paridade remota.
- Banco: somente TEST_DATABASE_URL/branches de worker isoladas; nunca fallback para
  DATABASE_URL em teste. Fixtures próprias; sem limpeza global, seed ou rotação de chaves.
  npm test usa branches de worker; testes pontuais usam a base. Não rodar duas suítes
  completas simultâneas, inclusive enquanto o Verifier estiver trabalhando.
- Se npx.ps1 continuar quebrado, usar Node/npx-cli existentes:
  `& 'C:/Program Files/nodejs/node.exe' 'C:/Program Files/nodejs/node_modules/npm/bin/npx-cli.js' --no-install <comando>`.
  Python disponível na entrega:
  `C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`.
  Conferir os caminhos nesta janela; não instalar dependências por reflexo.

## Fatos externos e invariantes do produto

WABA obtida pela extensão Chrome: **1000796702954808**. Graph v25.0 confirmou HTTP200,
nome **Test WhatsApp Business Account** e timezone_id=1. Business ID 402905505501945 é
distinto. A seleção da aba falhou por timeout; não existe captura de pixels dessa leitura.

Isso comprova identidade de uma conta de teste. Continuam pendentes vínculo WABA/número/tenant,
tradução primária do fuso para IANA, permissão/contrato mensal/zero de Analytics e HMAC/configuração
da versão instalada do trigger. Não cadastrar essa WABA como produção por inferência, não
assumir fuso SP para consumo e não publicar zero/saldo inicial fabricado. Reutilizar o ID e
as leituras existentes; evitar repetir ligações da extensão que travaram.

- CRM/Postgres controla episódios, autorização única, ponte, recibos e snapshots. n8n
  orquestra tick15min/geração; status seguem ramo autenticado separado sem agente.
- Retomada >=22h e <24h, dentro do horário configurado; somente qualificação pelo agente.
  Relógio/âncora reais do CRM governam. Revalidar no lock final, ordem lead→episódio.
- Uma chamada externa por episódio. Pré-chamada pode recuperar preparação; após autorização,
  recusa/timeout/crash consomem tentativa. Aceite sem gravação repete só ack. Sem template
  de contingência, retry Meta ou biz_opaque_callback_data presumido.
- Agente proativo somente leitura: sem tools de escrita, memória compartilhada ou inbound
  sintético. Texto contextual/pendência/fatos da equipe; limite4096 UTF-16 e orçamento total120s.
- Ponte aceita liga sessão de origem à retomada e primeiro inbound <48h. Warm/cold equivalentes,
  máximo50, equipe como system, regra normal12h depois da resposta, reset/opt-out invalidam.
- Escalar >=48h independentemente de envio/horário, respeitando trava humana e atribuição.
- Cobrança vem de status de entrega autêntico; pricing pago/franquia/FEP, pendente,
  indisponível e não entregue distintos. Humano, agente normal e retomada usam mesma regra.
- Barra exclusivamente do snapshot Analytics mensal por número/fuso confirmado, sem somar
  webhook. Primeira consulta cobre mês inteiro; sincronização15min, >60min stale,
  CAS/lease contra resposta antiga. Falha conserva snapshot ou indisponível.
- Configurações admin/gestor; Chats somente conversa/carteira autorizada, resumo próximo do
  composer também na condução pelo agente. Classificação por bolha, aviso persistente
  sem modal/bloqueio financeiro e sem remount do composer.
- Retenção>=30dias não remove classificação vinculada nem rearma despacho. Sem payload bruto
  permanente/cópia paralela de histórico. Falha de Analytics não bloqueia envio humano.

Se evidência primária inviabilizar o contrato aprovado, registrar e revisar a parte afetada
com o usuário antes de substituir Analytics por contador local ou presumir outra API.
Prosseguir no trabalho independente autorizado sem habilitar a capacidade não comprovada.

## Ativação, prova e fechamento

Preparar schema/handlers compatíveis antes dos callers, relatório de versões/filas e
plano de ativação. Com autorização específica, drenar execuções antigas, manter templateB
desativado, aplicar bootstrap observado e habilitar apenas capacidades comprovadas.
Rollback conserva tombstones e não restaura o template antigo.

T68 exige prova de ligação que falhe ao remover scheduler→geração→send, concorrência real,
999/1000/1001/FEP/replay/mês por fixtures documentadas e conversa warm/cold/opt-out/humano.
A prova real autorizada deve salvar entrada, resultado, versões e captura em arquivo versionado
antes de limpeza. Não fabricar custo com 1001 envios. Conta de teste não comprova tarifa de
produção. Se mudar system message compartilhado, provar identidade/paridade e remedir teto
documental conforme AD-031; sem expansão presumida.

Depois da última tarefa, despachar **Verifier novo e independente** automaticamente.
Fornecer spec, testes, range real de commits e validate.md. Exigir 95 ACs ancorados em
evidência, gates e sensor em scratch isolado; nenhuma alteração na árvore real. Priorizar
mutações de limite22h/24h/48h, despacho único/CAS, takeover/inbound/reset, ponte warm/cold,
status fora de ordem, mês/lease e autorização de carteira. Conferir porcelain antes/depois.
Surviving mutants são correções; no máximo três ciclos fix→reverify antes de escalar.

Persistir validation.md e rodar validate_state.py. Sem PASS verificável, não declarar lote
concluído. Revisar lições conforme AD-028; promoção/remoção exige decisão do usuário.
Fazer higiene documental AD-029 e reconciliar links/INDEX/roadmap. Em qualquer handoff,
atualizar somente a seção Handoff de STATE.md com tarefa/hash/gates/pendências/próximo passo.

**Comece pela reconciliação e pelos validadores; em seguida, baseline e lote A/T1.**
