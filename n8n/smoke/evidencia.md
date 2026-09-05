# Lote 10 — Evidência de execução (modelo alvo e prova conversacional)

Arquivo de evidência do lote-10. Registra medições reais, ids de execução e ids de versão publicada —
nunca "funcionou". Segue o estilo de registro de `n8n/README.md` §§10-12: o que foi medido, com que
comando, e o que ficou honestamente por confirmar.

---

## T1 — Linha de base do lote (2026-09-05)

### 1.1 Piso de testes medido

`npx vitest run` na raiz do projeto, rodado nesta sessão antes de qualquer alteração de código:

```
Test Files  81 passed (81)
     Tests  1015 passed (1015)
  Duration  591.37s
```

**Piso medido: 1015 testes em 81 arquivos, 0 falhas** (exit code 0). O número bate com o piso herdado
que o `.specs/STATE.md` cita, mas foi **medido agora**, não copiado da documentação — é essa medição
que vale como linha de base para a contagem exigida no T3 (piso + os testes novos da suíte de grafo,
sem nenhuma deleção silenciosa).

Nota sobre o output: a rodada emite avisos `SECURITY WARNING: The SSL modes 'prefer', 'require', and
'verify-ca' are treated as aliases for 'verify-full'` vindos de `pg-connection-string`. São avisos de
depreciação da dependência, não falhas — nenhum teste é afetado e o exit code é 0. Registrado aqui só
para que a próxima rodada não os confunda com regressão deste lote.

### 1.2 Sincronia entre a fonte dos workflows e `n8n/generated/`

`node scripts/n8n-inline.mjs` rodado na raiz. Saída: os 5 arquivos regenerados
(`erros`, `principal`, `scheduler`, `tool-agendar-reuniao`, `tool-responder-lead`).

`git status --porcelain` logo em seguida: **vazio**. `git diff --stat n8n/generated/`: **vazio**.

**Diff zero em `n8n/generated/` — fonte e artefato gerado estavam sincronizados antes deste lote.**
Nenhuma dessincronia a registrar, e portanto nenhuma investigação pendente antes do T2. Isso importa
porque é o que autoriza o T4 a tratar qualquer diff no gerado como consequência exclusiva da troca do
nó de modelo: partindo de zero, o diff do T4 é, por construção, só o que o T3 mudou.

### 1.3 Estado do nó de modelo antes da troca (fonte)

Para referência do ponto de partida, `n8n/workflows/principal.ts` linhas ~1248-1272 declaram
`agentModel` como `@n8n/n8n-nodes-langchain.lmChatGoogleGemini` v1.1, com
`modelName: "models/gemini-3.5-flash-lite"` e `options: { temperature: 0.4 }`, credencial
`googlePalmApi`. É esse bloco que o T3 substitui; a confirmação de que a **instância publicada** roda
o mesmo modelo é o objeto do T2.
