# Prompt de Execução — Lote 6b: Persona conversacional + lapidação de UI

> Cole o bloco abaixo numa nova janela do Claude Code aberta na raiz do projeto (`crivo/`).
> **Antes de colar, confira na janela nova**: extensão **Claude in Chrome** ativa (screenshots obrigatórios em T4, T11, T12, T13). MCP do n8n **não é necessário** — a instância está fora do ar e nenhuma task depende dela.

---

Ative a skill `tlc-spec-driven` e rode APENAS a fase **Execute** da feature `lote-6b-persona-e-lapidacao`. Todo o planejamento já está aprovado — não refaça Specify/Design/Tasks e não me peça re-aprovação deles.

## Contexto aprovado (leia nesta ordem antes de executar)
1. `.specs/STATE.md` — decisões ativas AD-001..AD-017; as duas novas regem este lote: **AD-016** (transparência invertida, informal sem emoji, 1–3 mensagens por turno) e **AD-017** (histórico vem do CRM pelo contrato, janela 20 mensagens / corte de sessão em 12h). Handoff atualizado em 2026-08-10.
2. `.specs/features/lote-6b-persona-e-lapidacao/tasks.md` — 13 tasks em 4 phases, Test Coverage Matrix e Gate Check Commands (autoritativos).
3. `.specs/features/lote-6b-persona-e-lapidacao/spec.md` — ACs = fonte de verdade dos testes (CTX-01/02, PER-01/02/03, UI-01/02) + Edge Cases + Runbook pós-hospedagem.
4. `.specs/features/lote-6b-persona-e-lapidacao/design.md` — contrato da rota nova, camada de persona, janela de histórico, saída multi-mensagem, R1 (Chats) e R2 (Documentos), Riscos.
5. `.specs/features/lote-6b-persona-e-lapidacao/context.md` — as 4 decisões do usuário e o diagnóstico técnico da perda de contexto.
6. `docs/integration/openapi.yaml` + `docs/integration/guia-integracao.md` — o contrato que ganha uma rota e um campo.

## Modo de execução (já decidido — não pergunte de novo)
**2 batch workers sequenciais + 1 Verifier**, conforme o empacotamento do tasks.md:
- **Batch Worker 1** → Phases 1–2 (T1→T8): rota `GET /leads/{id}/messages` + coluna/campo de tom de voz + `n8n/src/history.mjs` + `prompt.mjs` + `validate-llm.mjs` + seed reescrito.
- **Batch Worker 2** → Phases 3–4 (T9→T13): fluxo `principal.ts` (nó de histórico, schema de saída, envio sequencial) + as 3 telas do CRM. Só inicia após o summary completo do Batch 1.
- **Verifier** (automático após o último commit): validação spec-anchored + discrimination sensor, escreve `validation.md`. Loop fix→re-verify limitado a 3 iterações.

Você é o ORQUESTRADOR: despacha cada worker com o payload da skill, recebe o summary compacto, atualiza o status no tasks.md e só então despacha o próximo. Workers não spawnam sub-agentes.

## Restrição desta janela (repasse aos workers)
**A instância n8n está FORA DO AR.** Nenhuma task publica workflow, cria/altera Data Table, roda execução ou faz conversa real. As tasks T9/T10 entregam **código-fonte do fluxo + `n8n/generated/` regenerado**, e o gate delas é a suíte de testes dos módulos puros + build. Não tente conectar no MCP do n8n; não marque nada como verificado na instância. O que depende da hospedagem está no **Runbook pós-hospedagem** do `spec.md` e é trabalho conhecido, fora do gate.

## Contrato por task (inegociável)
Testes derivados da spec (nunca da implementação); gate verde antes de done (comandos exatos do tasks.md); 1 commit atômico por task com a mensagem definida no tasks.md; `git add` apenas dos arquivos da task (nunca `-A`; não commitar `.specs/` nem `.claude/` — exceção: T13 commita o `spec.md`/`tasks.md` da feature via `git add -f`, padrão dos lotes 3–6).

**Mensagem de commit sem NENHUMA trailer de autoria** — nada de `Co-Authored-By: Claude ...` nem "Generated with Claude Code" (**AD-014**, 2026-08-05: o histórico remoto foi reescrito com `filter-branch` + `push --force` justamente para remover essas trailers). O passo de apendar a trailer, padrão do harness, deve ser omitido deliberadamente.

Nunca enfraquecer/deletar/skipar testes. Base atual: **535 testes** — nenhum pode sumir; asserções existentes só podem ser substituídas por equivalentes ou mais fortes.

## Restrições críticas do ambiente
1. **Arquivo de env BLOQUEADO**: hook do projeto NEGA comando shell que mencione o arquivo de variáveis. `DATABASE_URL` já está configurada; o código carrega via `import 'dotenv/config'`. Nunca imprimir URL/senha/API key em log, output ou commit.
2. **Next.js 16.2.11 breaking changes** (AGENTS.md): antes de mexer no route handler do T2, consultar `node_modules/next/dist/docs/` (handlers Web Request/Response; `params` é Promise). **Armadilha específica do T2**: o arquivo hoje exporta `export const GET = methodNotAllowed(["POST"])` — trocar por `export async function GET` sem remover a linha antiga é erro de build por exportação duplicada.
3. **Ordem da janela de histórico (T5)**: corte de sessão ANTES do teto de 20. A ordem inversa devolve uma janela que atravessa o intervalo de 12h — teste que discrimina isso é obrigatório.
4. **Ordenação do histórico (T1)**: `ORDER BY sentAt DESC LIMIT n` revertido em TS. `ASC LIMIT n` devolveria as mais ANTIGAS — o teste tem que falhar nessa variante.
5. **AD-014 continua valendo**: nenhuma saída de LLM vira efeito colateral sem `validateLlmOutput`. O campo `mensagens` é validado no código (1–3, strings não vazias), não confiado ao prompt. O Verifier vai atacar exatamente isso no sensor.
6. **`resposta` não some** da saída validada — vira derivado (`mensagens.join(" ")`) para os `executiveSummary`. Isso é rede de segurança para qualquer nó não migrado: ele envia o texto concatenado em vez de falhar em silêncio.
7. **Referência nomeada no n8n (T9/T10)**: todo nó que precisa de dado anterior a um HTTP/WhatsApp lê de `$('Nome do nó').first()`, nunca de `$json` encadeado — é a classe de bug corrigida em `7041a78`/`006e789`. E `.first()` num Switch sempre lê a saída 0: use os Code nodes de checkpoint.
8. **SDK do n8n**: sem `function`/arrow no nível do arquivo de workflow (o parser rejeita); nó com múltiplos predecessores tem wiring de saída declarada UMA vez numa variável nomeada; sem ciclos no grafo.
9. **Astryx (AD-005/010/011/012)**: T4, T11, T12 e T13 tocam UI — rodar `npx astryx component <Nome>` antes de compor (`TextArea`, `StackItem`, `LayoutHeader`, `Badge`, `Token`); self-check ao final (zero `<div>`, zero `style={{}}`, zero hex/px cru); ícones só `lucide-react`; classes de cor em **mapa literal** (Tailwind v4 não gera utility de string interpolada).
10. **Screenshots obrigatórios (T4, T11, T12, T13)**: extensão **Claude in Chrome** contra `next start` em **porta dedicada** e **build de produção** — o painel Browser embutido não capta quando não está visível, e em `next dev` o indicador do Next parece bug de layout no rodapé da sidebar. Sem captura real, não considere a task de UI feita.
11. **Risco conhecido do T11**: `Layout height="fill"` só preenche se o ancestral tiver altura definida. Confirme por captura antes de seguir; se não preencher, o escape hatch é utility de altura token-backed (AD-012), nunca `style={{}}`.
12. **Migração**: `drizzle-kit push`, coluna nullable/aditiva (T3). Atenção ao quirk do índice de `document_categories` (pode ser recriado — conferir que não sobra resíduo).
13. **Vitest**: `npx vitest run` sem flags. Teste novo cria os PRÓPRIOS dados; nunca depender do snapshot do seed. `npm run db:seed` antes de qualquer smoke visual. Lembre que **qualquer `npx vitest run` rotaciona as API keys dos tenants** (`n8n/README.md` §4) — inofensivo nesta janela (n8n fora do ar), mas é o item 3 do Runbook pós-hospedagem.
14. **Dependências novas**: NENHUMA. `n8n/src/` é código puro sem imports externos (roda no sandbox do Code node).
15. Windows 11; PowerShell 5.1 (sem `&&`); scripts npm cross-platform.

## Ao final
1. Verifier PASS + `.specs/features/lote-6b-persona-e-lapidacao/validation.md` escrito. O Verifier deve tratar "não publicado/não testado na instância n8n" como **gap conhecido e esperado** (hospedagem fora do ar), não como falha de cobertura.
2. Atualizar `tasks.md` (Status: Done) e a rastreabilidade do `spec.md` (CTX-01/02, PER-01/02/03, UI-01/02 → Verified), honestamente — nada de n8n na instância marcado como verificado.
3. Atualizar SOMENTE a seção `## Handoff` do `.specs/STATE.md` (nunca tocar `## Decisions` — AD-016 e AD-017 já foram registradas no planejamento).
4. Reportar: resumo por batch (commits + contagem de testes), veredito do Verifier, os screenshots das 3 telas, e o **Runbook pós-hospedagem** repetido no final da mensagem, para eu executar quando o n8n voltar.
