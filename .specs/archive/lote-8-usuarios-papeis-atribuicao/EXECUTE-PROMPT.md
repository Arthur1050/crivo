# Prompt de Execução — Lote 8: Usuários, papéis e atribuição por agenda

> Cole o bloco abaixo numa nova janela do Claude Code aberta na raiz do projeto (`crivo/`).
> **Antes de colar, confira na janela nova**: MCP do **n8n** conectado (Phase 7 depende da instância no ar) e a extensão **Claude in Chrome** disponível (há tela nova em T6, T10, T22, T23 e T32 — o painel Browser embutido **não serve**, ele não captura quando não está visível).
> **Antes de começar, tenha em mãos**: uma conta no **Resend** com chave de API (dependência externa nova, exigida a partir de T19) e acesso à instância n8n (T30 publica; T31 purga a memória de teste).

---

Ative a skill `tlc-spec-driven` e rode APENAS a fase **Execute** da feature `lote-8-usuarios-papeis-atribuicao`. Todo o planejamento já está aprovado — não refaça Specify/Design/Tasks e não me peça re-aprovação deles.

## Contexto aprovado (leia nesta ordem antes de executar)

1. `.specs/STATE.md` — decisões ativas AD-001..AD-022 e o Handoff do lote-7. **Atenção ao item 2 das Restrições Críticas antes de interpretar qualquer AD-014.**
2. `.specs/features/lote-8-usuarios-papeis-atribuicao/tasks.md` — 33 tasks em 8 phases, Test Coverage Matrix e Gate Check Commands (autoritativos).
3. `.specs/features/lote-8-usuarios-papeis-atribuicao/spec.md` — ACs = fonte de verdade dos testes (AUTH-01/02, TENANT-01, USER-01/02, PERM-01, SCOPE-01, AGENDA-01, ATRIB-02/03, SEED-01) + Edge Cases.
4. `.specs/features/lote-8-usuarios-papeis-atribuicao/design.md` — arquitetura de 3 camadas, mapeamento do plugin `organization` sobre `tenants`, Components, Data Models, **Risks & Concerns** (leia inteiro; duas linhas dele são condição de parada).
5. `.specs/features/lote-8-usuarios-papeis-atribuicao/context.md` — decisões do usuário, discrição do agente, e o que foi deliberadamente adiado.
6. `AGENTS.md` — **Next 16 tem breaking changes**; leia o guia relevante em `node_modules/next/dist/docs/` antes de escrever código. Já verificado neste planejamento: `middleware.ts` está **deprecado**, o convention é `proxy.ts`.
7. `n8n/README.md` — credenciais, Data Tables, nono dígito brasileiro, procedimento de publicação.
8. `docs/integration/guia-integracao.md` + `docs/integration/openapi.yaml` — contrato vigente, que a T28 estende.

## Modo de execução (já decidido — não pergunte de novo)

**5 batch workers sequenciais + 1 Verifier**:

| Batch | Fases | Tasks | Observação |
| ----- | ----- | ----- | ---------- |
| 1 | Phase 1 + Phase 2 | T1–T10 (10) | Contém as **duas condições de parada** (T1, T2) e tela nova em T6 e T10 |
| 2 | Phase 3 + Phase 4 | T11–T18 (8) | O miolo de risco: remoção de `brokers`, rename da coluna, `LeadScope` |
| 3 | Phase 5 | T19–T23 (5) | Primeira dependência do Resend |
| 4 | Phase 6 | T24–T28 (5) | Agenda e atribuição |
| 5 | Phase 7 + Phase 8 | T29–T33 (5) | n8n, reseed do ambiente, recuperação de senha, rastreabilidade |

Batch 1 fica em 10 tasks porque a Phase 2 é uma cadeia única de dependência (plugin → proxy → login → guarda) e o corte só pode cair em fronteira de fase.

Você é o ORQUESTRADOR: despacha cada worker com o payload da skill, recebe o summary compacto e **confirma o resultado por conta própria** (`git log`, contagem de testes rodada por você) antes de despachar o próximo. Workers não spawnam sub-agentes.

**Verifier** (automático após o último commit, nunca opcional e nunca perguntado): validação spec-anchored + discrimination sensor, escreve `validation.md`. Loop fix→re-verify limitado a 3 iterações. Ao final, `python3 <skill-dir>/scripts/validate_state.py lote-8-usuarios-papeis-atribuicao` precisa sair 0.

## ⚠️ Duas condições de PARADA — respeite-as literalmente

1. **T1 é bloqueante para o gate.** `npx tsc --noEmit` está vermelho **antes** deste lote, em `src/lib/__tests__/format.test.ts:17`. Enquanto estiver, a proteção central do lote (call site que esquece o `LeadScope` **não compila**) é decorativa. Não avance para T2 sem o `tsc` verde.

2. **T2 pode derrubar a arquitetura aprovada.** As PKs do projeto são `uuid` e o plugin `organization` foi mapeado **sobre a tabela `tenants`**. Se o better-auth não sustentar `uuid` como id contra o schema real, `tenants.id` do plugin divergiria do `tenants.id` do domínio — o pior desfecho possível para o isolamento da AD-002. **Nesse caso: PARE e me chame.** Não contorne, não adapte por conta própria. O plano B é barato (adotar o formato de id do plugin e resemear, já que nenhum dado é real), mas ele muda o tipo de chave do produto inteiro e a escolha é minha.

## Contrato por task (inegociável)

Testes derivados da spec (nunca da implementação); gate verde antes de done (comandos exatos do `tasks.md`); 1 commit atômico por task com a mensagem definida no `tasks.md`; `git add` apenas dos arquivos da task (nunca `-A`; não commitar `.specs/` nem `.claude/` — exceção: T33 commita `spec.md`/`tasks.md` da feature via `git add -f`, padrão dos lotes 3–7).

**Mensagem de commit sem NENHUMA trailer de autoria** — nada de `Co-Authored-By: Claude ...` nem "Generated with Claude Code". O passo de apendar a trailer, padrão do harness, deve ser omitido deliberadamente (AD-014).

**Piso de testes: 693** (55 arquivos), herdado do lote-7. Confirme rodando `npx vitest run` antes de T1 e use o número real como piso. Nenhum teste pode ser removido, pulado ou enfraquecido. As reescritas das Phases 3 e 4 trocam asserções sobre `brokers` por asserções equivalentes sobre `tenant_members` — substituição 1:1, nunca redução.

## Restrições críticas do ambiente

1. **Arquivo de env BLOQUEADO**: hook do projeto NEGA comando shell que mencione o arquivo de variáveis. Nunca imprimir URL/senha/API key em log, output ou commit. A chave do Resend (T19) entra por env, nunca no repositório.

2. **⚠️ O `.specs/STATE.md` tem DUAS entradas numeradas `AD-014`** e as duas valem aqui:
   - **`AD-014` (trailer de commit)** — proíbe `Co-Authored-By: Claude`. **ATIVA.**
   - **`AD-014` (workflow-as-code)** — superada só na metade "efeito colateral decidido por LLM" (AD-018). A metade *workflow-as-code* continua integral: fonte em `n8n/workflows/`, `n8n/generated/` reproduzível pelo inliner, **UI do n8n nunca editada à mão**. Única exceção de sempre: credencial é trabalho humano.

3. **Banco de teste.** `src/db/index.ts:10-21` exige `TEST_DATABASE_URL` sob `VITEST`. Se a suíte não abrir verde apontando para o banco de teste, PARE e me chame antes de qualquer alteração de schema.

4. **Astryx (self-check obrigatório em toda tela).** Antes de fechar qualquer task de UI: releia o arquivo e substitua todo `style={{…}}`, `<div>`/`<span>` de layout, `.css` importado, `@apply`, e valor cru (`bg-[#fff]`, `p-[13px]`) por componente ou utility token-backed. Rode `npx astryx build "<ideia>"` antes de compor tela nova e `npx astryx component <Nome>` para cada componente usado. Dado denso vai em linhas (Table/List), nunca card por item — vale especialmente para a tela de usuários (T22).

5. **Armadilha do autosave do n8n (T30).** No lote-7 o autosave da aba do editor reverteu publicação por MCP **duas vezes**. Depois de publicar, sempre conferir `get_workflow_history`: a versão `autosaved: false` mais nova tem que ser a sua **e** ser igual ao `activeVersionId`.

6. **Divergência conhecida fonte × instância (T30).** `n8n/workflows/principal.ts` declara `models/gemini-3.5-flash`, mas a instância roda `gemini-3.5-flash-lite`, trocado à mão. Publicar sem alinhar reverte para o modelo ~30x mais caro por conversa. Alinhe a fonte **antes** de publicar, ou aplique de propósito a migração para `gpt-5-nano` já decidida — nunca reverta sem querer.

7. **Purga da memória do agente (T31) está autorizada** pelo usuário, explicitamente. A memória é chaveada por `tenantSlug:waId`, não pelo id do lead — sem a purga, depois do reseed o agente responde como se conhecesse um lead que o CRM não tem mais, e a semeadura de cold start da AD-019 não corrige porque a memória não está vazia.

## Lições do lote-7 a aplicar (candidatas, não `confirmed` — aplique mesmo assim)

- **L-015** — antes de mexer numa coluna compartilhada, grep de **todos** os consumidores, registrado na própria task. É `Done when` obrigatório da T11. Foi o descuido que deixou o scheduler com `401` em produção por dias.
- **L-016** — registre a evidência de uma execução de verificação (id, status, payload) **antes** de arquivar o workflow scratch que a produziu; arquivar destrói a execução junto. Vale para T30.

## O que NÃO fazer

- Não implementar atendimento humano pelo Chats, página de Agenda, vínculo de conta Google ou login com Google — todos explicitamente fora de escopo, no lote do pacote Google.
- Não escrever script de migração de dado. Não há dado real; o reseed determinístico é o caminho de convergência, e código de migração aqui seria resíduo permanente.
- Não escrever `middleware.ts`. O convention do Next 16 é `proxy.ts`.
- Não tocar na autenticação do contrato de integração (`/api/v1/**`): segue na credencial de serviço com `X-Crivo-Tenant` (SEC-01 do lote-7), caminho independente do login de usuário.
- Não fazer `git push` sem me pedir na hora. O projeto é git-linked na Vercel — push dispara deploy. Aprovação de spec/tasks autoriza commit local, nunca push.
