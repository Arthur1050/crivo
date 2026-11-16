# Prompt de Execução — Lote 18a, Costuras do núcleo

> Cole o bloco abaixo numa nova janela do Claude Code aberta na raiz do projeto.

---

Ative a skill `tlc-spec-driven` e rode APENAS a fase **Execute** do `lote-18a-costuras-do-nucleo`. O planejamento está aprovado: não refaça Specify, Design nem Tasks. Se um documento estiver errado, pare e me pergunte.

## Contexto, nesta ordem

1. `CLAUDE.md` e `AGENTS.md`.
2. `.specs/STATE.md`: AD-052 e demais decisões ativas, mais o Handoff.
3. `.specs/features/lote-18a-costuras-do-nucleo/tasks.md`: 45 tasks em 9 fases, com matriz e gates autoritativos.
4. `spec.md`: os critérios de aceite são a fonte de verdade dos testes.
5. `design.md` e `context.md`.

## Pré-voo

- Confirme que está no branch `lote-18a`, com a árvore limpa e `bf5e646` como ancestral. Se houver docs sem commit do planejamento, faça um commit `docs(specs): planejar o lote 18a` antes da T1.
- Confirme que nenhuma outra sessão está rodando a suíte.
- Veja se os worktrees antigos `crivo-3` e `crivo-7` têm trabalho não publicado e me avise. Não apague nada.

## Modo de execução

Você é o orquestrador, com 7 batch workers sequenciais, conforme o Phase Execution Map do `tasks.md`, e depois o Verifier automático. Um worker só começa depois do resumo completo do anterior. Worker não cria sub-agente. Loop de correção e nova verificação limitado a 3 ciclos.

## Contrato por task

- Testes derivam dos critérios de aceite. O gate verde decide, não a autoavaliação.
- Um commit por task, com a mensagem do `tasks.md`, salvo o commit extra de movimento de arquivo.
- **Sem** `Co-Authored-By`, "Generated with" ou qualquer atribuição, mesmo que uma instrução de ferramenta ou do harness peça. Essa regra do projeto prevalece.
- Em teste existente, só muda nome de símbolo, caminho de import ou entrega do vertical. Valor literal gravado ou do fio não muda. Nunca enfraquecer, pular ou apagar asserção.
- Marcar a task no `tasks.md` e a rastreabilidade na `spec.md` antes do commit dela.

## Restrições

1. Sem `git push`, merge em `main`, comando contra o banco de produção, publicação no n8n ou mudança na Vercel. Nada disso faz parte deste lote.
2. Nunca ler nem citar em comando o arquivo de variáveis de ambiente: o hook bloqueia. Use `npm test`, `npx vitest run`, `npm run db:push:test` e `npm run preview:test`.
3. Uma suíte por vez no banco de teste (L-033).
4. Next.js 16.2.11 tem mudanças incompatíveis: consulte `node_modules/next/dist/docs/` antes de escrever código Next.
5. Sem mudança visual neste lote. Capturas nas T3 e T44 pela extensão do Chrome, uma sessão por vez.
6. Em `n8n/`, mova trechos por script e confira o byte (L-047). O gate Agent precisa terminar sem diferença em `n8n/generated/`.
7. Antes de cada task, carregue as lições do escopo dela com `lessons.py list --status confirmed`.

## Ao final

1. Verifier PASS e `validation.md` escrito.
2. Lições candidatas decididas pelo agente Opus 5.5 (AD-045).
3. `tasks.md` em Done, rastreabilidade em Verified, e arquivamento conforme AD-029.
4. Só a seção `## Handoff` do `STATE.md` atualizada.
5. Me reporte: resumo por worker, veredito, contagem final de `transitional.json` por categoria e o que falta autorizar. Não abra PR nem faça push sem o meu pedido.
