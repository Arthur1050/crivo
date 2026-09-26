# Execute — Lote 12: conteúdo de documentos chega ao agente

Trabalhe no repositório `C:\Users\user\Documents\projetos_saas\crivo` e execute integralmente o Lote 12 descrito em `.specs/features/lote-12-conteudo-de-documentos/`.

## Autorizações já concedidas

- A especificação, o design, as 37 tarefas e os perfis de ferramentas foram aprovados pelo usuário.
- A implementação local e os commits locais atômicos estão autorizados.
- O uso de subagentes foi explicitamente aprovado. Não volte a perguntar se deve usar subagentes.
- Não há autorização geral para `git push`, force-push, deploy, provisionamento, publicação do n8n, mudança de variáveis remotas, alteração de plano, migração de banco conectado ou qualquer outra mutação externa/destrutiva. Peça autorização específica imediatamente antes de cada ação desse tipo.

## Protocolo obrigatório de inicialização

1. Ative a skill `tlc-spec-driven` pelo nome e leia completamente o `SKILL.md` e as referências `implement.md`, `coding-principles.md`, `sub-agents.md` e `memory.md`. Leia `validate.md` antes de despachar o Verifier final.
2. Leia `AGENTS.md` por completo. Este projeto usa Next 16 com documentação local obrigatória e Astryx com fluxo de descoberta obrigatório para UI.
3. Leia somente os artefatos desta feature: `context.md`, `spec.md`, `design.md` e `tasks.md` em `.specs/features/lote-12-conteudo-de-documentos/`.
4. Leia as decisões e o Handoff em `.specs/STATE.md` e carregue apenas as lessons confirmadas conforme a skill.
5. Reconcilie o Handoff com evidência real antes de editar: branch, `git status --porcelain`, últimos commits e marcações em `tasks.md`. Preserve qualquer mudança inesperada e pare se ela não puder ser atribuída ao planejamento deste lote.
6. Execute o validador de tarefas da skill. Tente `python3`, `python` e `py -3`, nessa ordem. Se nenhum runtime Python existir, não o instale apenas para isso: replique manualmente todas as verificações do script, registre o resultado e prossiga somente se não houver erro.
7. Confirme que o diff inicial contém exclusivamente os artefatos aprovados do Lote 12, a alteração correspondente em `.specs/STATE.md` e este `EXECUTE-PROMPT.md`. Se for exatamente esse o caso, crie antes da T1 um commit local de baseline documental, por exemplo `docs(specs): approve lote 12 execution plan`. Se houver qualquer outro arquivo ou mudança, não inclua nem descarte: investigue e peça orientação quando necessário.
8. Obtenha o baseline de testes antes da T1 e registre quantidade de arquivos, testes, falhas e skips. Confirme que `TEST_DATABASE_URL` é descartável antes de qualquer teste de banco. Nunca use `DATABASE_URL` de produção como substituto.

## Estratégia de subagentes aprovada

Use seis workers, um batch por fase, estritamente em sequência:

1. Batch 1 — Phase 1 — T1–T6
2. Batch 2 — Phase 2 — T7–T12
3. Batch 3 — Phase 3 — T13–T19
4. Batch 4 — Phase 4 — T20–T27
5. Batch 5 — Phase 5 — T28–T34
6. Batch 6 — Phase 6 — T35–T37

Regras de orquestração:

- Despache somente o próximo batch. Nunca execute batches em paralelo.
- Um worker executa todas as tarefas do próprio batch em ordem e não cria subagentes.
- O batch seguinte só começa depois de todas as tarefas do batch atual terem gate verde, status atualizado e commits atômicos confirmados.
- Cada worker recebe as definições completas das tarefas do batch, Test Coverage Matrix, Gate Check Commands, `coding-principles.md` e o contexto relevante de `spec.md` e `design.md`.
- O worker marca cada tarefa concluída em `tasks.md` e atualiza a rastreabilidade aplicável em `spec.md` antes do commit correspondente. Código, testes e status entram no mesmo commit.
- Depois de cada batch, exija resumo compacto com tarefas e hashes, contagem de testes e desvios/bloqueios. Reconcilie o resumo com Git e `tasks.md` antes de avançar.
- Se um gate falhar ou surgir bloqueio, o worker para. Não despache o próximo batch até corrigir ou escalar.

## Contrato por tarefa

Para cada tarefa, sem exceção:

1. Confirme que todas as dependências estão concluídas.
2. Antes de editar, declare explicitamente pressupostos, arquivos exatos a tocar e critérios de sucesso.
3. Leia a documentação versionada pertinente antes de usar APIs do Next, Workflow, Blob ou Astryx. Descubra APIs; não presuma interfaces.
4. Escreva os testes a partir dos ACs e do `Done when`, antes da implementação quando a tarefa prevê testes.
5. Implemente o mínimo necessário e mantenha o escopo restrito à tarefa. Testes co-localizados, fixtures e atualizações de `tasks.md`/`spec.md` exigidas pelo contrato fazem parte do escopo da tarefa.
6. Nunca enfraqueça, apague, desabilite ou pule testes para obter verde. Se um teste existente estiver objetivamente errado perante a spec, pare e peça autorização antes de alterá-lo.
7. Execute o gate definido em `tasks.md`, confira que a contagem não regrediu e faça a revisão de adequação evidence-or-zero com `file:line` e expressão de assertion.
8. Valide manualmente o formato Conventional Commit se Python continuar indisponível.
9. Marque a tarefa concluída antes do commit e faça exatamente um commit atômico por tarefa.
10. Não faça refatorações ou correções “aproveitando a passagem”. Registre ideias fora de escopo em `context.md` como deferidas.

## Guardrails específicos do projeto

- Antes de alterar Next 16, leia o guia relevante em `node_modules/next/dist/docs/`.
- Depois da T1, leia a documentação instalada em `node_modules/workflow/docs/` antes da T2 e da T14.
- Para T23–T27, siga integralmente o fluxo Astryx de `AGENTS.md`: `npx astryx build`, templates e documentação de cada componente. Não use layout cru com `div`, CSS avulso, valores arbitrários ou APIs presumidas.
- Use somente Vercel Private Blob para o binário original. PostgreSQL mantém metadados e texto canônico; índice vetorial futuro é derivado, não fonte de verdade.
- Não coloque binário, corpus integral, token, URL privada, chave Blob ou PII em logs, payload durável, evidência ou relatório.
- `drizzle-kit push` durante implementação local só pode apontar para o banco descartável definido por `TEST_DATABASE_URL` e pelo config de teste.
- Preserve isolamento por tenant e as barreiras de permissão em todas as camadas.

## Pontos de autorização externa

T28 é local e pode ser implementada normalmente. Antes da primeira mutação de T29, pare e peça autorização para provisionar/conectar o Private Blob de Frankfurt. Continue pedindo autorização específica nas tarefas conectadas seguintes, conforme o efeito real:

- T29: criação/conexão do Blob e smoke remoto.
- T30: deploy/configuração de Workflow no preview.
- T31: push de schema e descarte de linhas no banco de teste/preview definido.
- T32: smoke conectado com objetos reais de teste.
- T33: publicação do workflow e política de retenção no n8n.
- T34: benchmark conectado e persistência dos tetos.
- T35: prova conversacional no agente publicado.
- T37: deploy, schema ou liberação no alvo final.

Uma autorização não vale automaticamente para a tarefa externa seguinte. `git push` permanece separado e nunca é implícito.

## Fechamento obrigatório

Depois do commit da última tarefa:

1. Despache um subagente Verifier novo, que não tenha escrito a implementação.
2. Dê a ele `spec.md`, o intervalo real de commits/diff da feature, os testes em escopo e `validate.md`.
3. Exija checagem spec-anchored evidence-or-zero e discrimination sensor em scratch isolado, nunca no worktree real e nunca com `git stash`.
4. O Verifier deve escrever `.specs/features/lote-12-conteudo-de-documentos/validation.md` com PASS/FAIL, evidências `file:line`, resultados dos gates, mutações e intervalo de commits.
5. Em caso de FAIL, transforme as lacunas em tarefas de correção e repita fix → reverify no máximo três vezes.
6. Rode `validate_state.py`; se Python não existir, replique integralmente o gate de conclusão e documente a equivalência. Não declare o lote concluído sem PASS verificável.
7. Atualize apenas a seção `## Handoff` de `.specs/STATE.md` com o estado final ou, se houver pausa, com o próximo passo exato.

Comece agora pela reconciliação do repositório e pelo baseline documental. Depois despache somente o Batch 1.
