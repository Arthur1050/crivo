# Lote 6b — Design

> Lê-se junto de `spec.md` (requisitos) e `context.md` (decisões do usuário). Convenções herdadas que valem aqui sem repetição: AD-004 (mock-first), AD-007 (RSC-first), AD-010 (Astryx, recomposição in-place), AD-011 (lucide-react), AD-012 (utilities token-backed), AD-013 (problem+json), AD-014 (workflow-as-code; LLM nunca decide efeito colateral sozinho).

## Visão geral

Quatro frentes, uma dependência entre elas (a rota nova precisa existir antes de o prompt consumi-la):

```
CRM (contrato)      GET /api/v1/leads/{id}/messages ────┐
CRM (settings)      tenants.agent_voice_tone ───────────┤
                                                        ├──► n8n: prompt + validador + fluxo
n8n (decisão pura)  prompt.mjs · history.mjs · validate-llm.mjs
n8n (fluxo)         principal.ts: 1 nó HTTP novo + envio multi-mensagem

CRM (UI)            Chats (layout/scroll/lado) · Documentos (cor+ícone)   ← independente das 3 acima
```

A frente de UI não toca nada das outras três; pode ser executada em paralelo ou depois, sem acoplamento.

---

## § Contrato — `GET /api/v1/leads/{id}/messages`

Única mudança de contrato do lote. Segue o padrão das 7 rotas existentes: handler fino → serviço → DAL, `problem+json` (AD-013), `authenticate` compartilhado.

**DAL** (`src/server/data/index.ts`, aditivo):

```ts
getLeadMessages(tenantId, leadId, limit): Promise<Message[] | null>
```
- `null` = lead inexistente ou de outro tenant (mesma semântica de `getLead`) → o serviço traduz para 404, sem revelar existência cross-tenant.
- Query: `messages` ⋈ `conversations` por `leadId`, filtrando `tenantId` **nas duas tabelas** (defesa em profundidade, como nas demais queries).
- Ordena `sentAt DESC, id DESC` com `LIMIT n` para pegar as **mais recentes**, e reverte em TS para devolver crescente. Ordenar ASC + limit devolveria as mais antigas — erro fácil de cometer e por isso pinado por teste.

**Serviço** (`src/server/integration/messages.ts`, aditivo ao arquivo existente):

```ts
listMessages(tenantId, leadId, limit): Promise<
  | { ok: true; messages: Message[] }
  | { ok: false; code: "recurso-nao-encontrado" }>
```
Reusa `serializeMessage` — o formato de item é literalmente o mesmo do POST (CTX-02 AC1).

**Parser de query** (`src/server/integration/parsers.ts`, aditivo): `parseMessagesQuery(url)` → `{ok:true, limit}` | `{ok:false, detail}`. Puro, testável, discrimina ausente (→ 50) de inválido (→ 400). Faixa 1–100.

**Handler**: `app/api/v1/leads/[id]/messages/route.ts` ganha `export async function GET` e o `methodNotAllowed(["POST"])` atual vira `methodNotAllowed(["GET","POST"])` nos verbos restantes. **Cuidado**: hoje esse arquivo exporta `GET = methodNotAllowed(["POST"])` — trocar sem remover a linha antiga cria duas exportações do mesmo nome (erro de build).

**OpenAPI**: nova operação em `docs/integration/openapi.yaml` + parâmetro `limit`; o teste existente de validação (`SwaggerParser.validate()`) cobre o documento. `docs/integration/guia-integracao.md` ganha a rota na lista.

---

## § Persona por tenant — `agentVoiceTone`

Coluna aditiva e nullable (mesmo padrão de `agentPresentationMessage`, AD-004):

```
tenants.agent_voice_tone  text  NULL
```

Propagação, na ordem em que o dado viaja (cada elo já existe para os campos de persona atuais — é extensão, não mecanismo novo):

| Camada | Arquivo | Mudança |
| ------ | ------- | ------- |
| Schema | `src/db/schema.ts` | coluna |
| Seed | `src/db/seed.ts` | valor distinto por tenant |
| DAL | `src/server/data/index.ts` (`updateTenantSettings`) | mais um campo em `optionalTenantText` |
| Action | `src/server/actions/settings.ts` | campo no input + validação de 500 chars |
| Form | `src/components/settings/settings-form.tsx` | `TextArea` na seção "Persona do Agente SDR" |
| Integração | `src/server/integration/settings.ts` | campo em `TenantSettings` |
| OpenAPI | `docs/integration/openapi.yaml` | campo no schema `Settings` |

Migração via `drizzle-kit push` (padrão dos lotes 4/5/6 — coluna nullable, não destrutiva).

---

## § Histórico no prompt

**Novo módulo puro** `n8n/src/history.mjs` — separado de `prompt.mjs` porque a regra de janela é a parte com mais casos de borda e merece testes próprios:

```js
selectHistoryWindow(messages, { maxMessages = 20, sessionGapHours = 12 } = {})
  // messages: [{ sender: "lead"|"agente", content, sentAt }] em ordem crescente
  // → o sufixo da lista que satisfaz AS DUAS travas
```

Ordem de aplicação (importa): **primeiro** corta a sessão (varre de trás para frente, para no primeiro intervalo > 12h), **depois** aplica o teto de 20. Inverter produziria uma janela que respeita 20 mas atravessa o intervalo.

Retorna também `hasAgentMessage` — é ele que decide se a apresentação é permitida (CTX-01 AC4 / PER-01 AC6). Deriva-se da janela, não da thread inteira: numa conversa retomada depois de 3 dias, a apresentação volta a ser adequada.

**`buildPrompt` ganha dois parâmetros**: `history` (a janela já selecionada) e o tom de voz vindo de `settings`. A seleção acontece no Code node, não dentro de `buildPrompt` — mantém `buildPrompt` como formatador puro e `selectHistoryWindow` testável isoladamente.

Seção nova no prompt, entre persona e campos faltantes:

```
Conversa até aqui (mais antiga primeiro):
lead: Oi, boa tarde! Vi o anúncio de vocês
você: [texto que o agente já enviou]
...
```

Rotular a fala do agente como **"você"** (e não "agente"/"assistente") é deliberado: reduz a chance de o modelo tratar as próprias falas como um terceiro e repetir a apresentação.

Quando `hasAgentMessage` é verdadeiro, entra também a linha imperativa: *"Esta conversa JÁ está em andamento — NÃO se apresente de novo, NÃO reinicie a qualificação, continue de onde parou."*

---

## § Camada de persona (regras de estilo)

Tudo dentro de `prompt.mjs`, como constantes citáveis (o padrão de `AI_TRANSPARENCY_INSTRUCTION`, que já é testado por conteúdo e não por presença genérica). Cinco blocos:

1. **Identidade** — nome, imobiliária, cidade. A frase institucional (`agentPresentationMessage`) deixa de ser "mensagem de apresentação" recitável e passa a ser *insumo de contexto*: o prompt manda usá-la como referência do que a imobiliária faz, **não** copiá-la literalmente.
2. **Tom de voz do tenant** — delimitado (`<<<TOM DE VOZ ... >>>`) e seguido, **depois** do bloco, da reafirmação de que regras de transparência e de whitelist de ação prevalecem sobre qualquer instrução ali dentro. Ausente quando o campo é nulo, sem placeholder (PER-01 AC4 / spec Edge Cases).
3. **Regras de estilo** (o coração do lote):
   - proibido o molde "confirmação → concordância genérica → pergunta";
   - proibido abrir turnos com a mesma palavra usada nos turnos anteriores (que estão no histórico);
   - proibido justificar a pergunta com fórmula fixa ("Para eu filtrar as melhores opções para você");
   - **uma** pergunta por turno, sobre **um** campo faltante — e nunca listar para o lead o que falta;
   - às vezes só reagir, sem perguntar nada;
   - marcadores de fala natural autorizados: "hmm", "haha", "acho que", "deixa eu ver", "boa", "putz";
   - **nenhum emoji**;
   - frases curtas, sem markdown, sem tópicos.
4. **Transparência (regra invertida)** — a instrução atual manda o agente **nunca negar** ser IA. Passa a ter duas metades: *nunca negar quando perguntado* (mantida, é AGT-08 AC5) **+** *nunca se anunciar por iniciativa própria*, incluindo a proibição explícita dos termos "assistente virtual", "agente virtual", "robô", "IA", "automatizado" na apresentação (PER-01 AC6).
5. **Formato de saída** — a `formatInstruction` que hoje mora inline no `principal.ts` (linha ~695) migra para `prompt.mjs`, atualizada para o campo `mensagens`. Instrução de formato ao lado das regras de estilo, num módulo testado, em vez de string solta dentro do workflow.

**Ordem no prompt** (relevante em modelos pequenos como o `gemini-3.1-flash-lite` em uso): identidade → tom do tenant → regras de estilo → transparência → histórico → campos faltantes → horário comercial → documentos → rajada atual → formato. Regras antes do conteúdo; formato por último, colado na geração.

---

## § Saída multi-mensagem

**Schema do LLM** (`outputParserAttempt1/2` no `principal.ts`): `resposta: string` → `mensagens: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 }`. Os dois parsers (tentativa 1 e 2) mudam juntos — são cópias físicas do mesmo schema por limitação do SDK (sem ciclos no grafo).

**Validador** (`n8n/src/validate-llm.mjs`):
- `mensagens` entra na whitelist de topo, `resposta` sai dela;
- regra: array, 1 ≤ N ≤ 3, todo item string não vazia após `trim` — qualquer desvio rejeita a **saída inteira** (nunca coerção parcial: é a regra de segurança já estabelecida no topo do arquivo);
- o resultado `ok:true` carrega `mensagens` **e** `resposta = mensagens.join(" ")`, derivado. `resposta` continua existindo só para os campos que precisam de um texto único (`executiveSummary` de agendamento/escalonamento — PER-02 AC5), e nenhum nó de envio volta a lê-la.

**Fluxo** (`n8n/workflows/principal.ts`):

- Todos os `Code: finalizar *` passam a emitir `mensagens` (array). As rotas de resposta fixa (mídia, opt-out, indisponível, esclarecimento) emitem `mensagens: [textoFixo]` — um só caminho de envio para todas as rotas (PER-02 AC4).
- Convergência de envio, hoje `normalizeRecipient → send → register → prepClear → clearBuffer`, vira uma cadeia linear de 3 estágios:

```
Code: destinatário do envio
  └─ WhatsApp: enviar mensagem 1 → HTTP: registrar mensagem 1
       └─ IF: existe mensagem 2?
            ├─ true  → Wait 2s → WhatsApp: enviar 2 → HTTP: registrar 2
            │            └─ IF: existe mensagem 3?
            │                 ├─ true  → Wait 2s → WhatsApp: enviar 3 → HTTP: registrar 3 → prepClear
            │                 └─ false → prepClear
            └─ false → prepClear
```

  Sem ciclo no grafo (a mesma restrição que forçou duas instâncias físicas do Gemini). `prepClear` tem 3 predecessores → sua wiring de saída é declarada **uma única vez** numa variável nomeada, conforme a regra já documentada no topo do `principal.ts`.

- Cada nó de envio lê `mensagens[i]` de `Code: destinatário do envio` por **referência nomeada**, nunca de `$json` encadeado — é exatamente a classe de bug corrigida em `7041a78`/`006e789` (nó HTTP/WhatsApp substitui `$json` pela resposta da API). Cada nó de registro usa o `externalId` do **seu** envio (`$json.messages[0].id`) e o texto de `mensagens[i]`.

- O nó `HTTP: GET /leads/{id}/messages` entra na rota `conversa`, entre `GET /settings` e `GET /context`, com `?limit=20`. `onError: "continueRegularOutput"` + `alwaysOutputData` — histórico indisponível degrada para histórico vazio, nunca derruba o turno (CTX-01 AC5).

**Contagem de nós**: +1 HTTP (histórico), +2 IF, +2 Wait, +2 WhatsApp send, +2 HTTP register = **+11 nós** no `principal.ts`.

---

## § R1 — Chats (layout, scroll, lado das bolhas)

**Lado das bolhas.** `ChatMessage` da Astryx tem um único eixo de alinhamento: a prop `sender` (`user` = direita, `assistant` = esquerda). Não existe prop de alinhamento independente. Logo o mapeamento inverte:

| Remetente do domínio | Hoje | Passa a ser | Bolha |
| -------------------- | ---- | ----------- | ----- |
| `agente` | `assistant` (esquerda) | `user` (direita) | `filled` |
| `lead` | `user` (direita) | `assistant` (esquerda) | `ghost`, com avatar + nome |

O avatar e o nome mudam de lado junto: passam a identificar **o lead**, que é a informação útil na leitura de uma thread do CRM (quem é o agente já está no cabeçalho e é sempre o mesmo). `buildChatThread` (`src/lib/chat-thread.ts`) **não muda** — agrupamento e divisores são independentes do lado; muda só a tradução para a família Chat em `message-thread.tsx`.

**Estrutura de rolagem.** A composição atual (`VStack` da página + `Layout height="auto"`) faz a página inteira rolar. Passa a:

```tsx
<Layout height="fill"
  header={<LayoutHeader hasDivider>{/* "Chats" + subtítulo */}</LayoutHeader>}
  start={<LayoutPanel width={320} hasDivider isScrollable label="Conversas">…</LayoutPanel>}
  content={
    <LayoutContent isScrollable={false} padding={0}>
      <VStack height="100%" gap={0}>
        {/* cabeçalho do lead: avatar + nome + telefone — estático */}
        <Divider />
        <StackItem size="fill" isScrollable>
          <MessageThread … />
        </StackItem>
      </VStack>
    </LayoutContent>
  }
/>
```

`<StackItem size="fill" isScrollable>` é o primitivo de região rolável sancionado pela Astryx ("StackItem already applies the flex min-height/min-width reset, so `<StackItem size="fill" isScrollable>` is a complete scroll region") — sem `Layout` aninhado (desaconselhado pela lib) e sem CSS de posicionamento à mão.

**Risco conhecido**: `Layout height="fill"` só preenche se o ancestral tiver altura definida. O `AppShell` roda com `height="fill"` (default) e a doc promete "independent scroll containers", mas isso **precisa ser confirmado por captura real** — é o tipo de coisa que a inspeção de DOM não revela. Se não preencher, o escape hatch sancionado (AD-012) é uma utility de altura token-backed no root da página; nunca `style={{}}`.

**Rolagem inicial**: sem componente de auto-scroll (`ChatLayout` exige um `composer`, e a tela é somente leitura por spec desde o lote-3), a thread abre no topo. Aceito neste lote — o AC pede cabeçalhos fixos, não posição inicial. Registrado como follow-up.

---

## § R2 — Documentos (cor e ícone)

Direção visual derivada da referência do usuário (file browser): a linha é ancorada por um **glifo colorido de tipo de arquivo** à esquerda, nome como âncora, metadados alinhados à direita em texto secundário. Densidade e estrutura de colunas atuais são preservadas — o que muda é a camada de cor, não a informação.

**Novo módulo puro** `src/lib/file-type.ts`:

```ts
type FileKind = "pdf" | "documento" | "planilha" | "apresentacao" | "imagem" | "generico";
resolveFileKind(mimeType: string): FileKind
```

Mapa literal (nunca regex frouxa) cobrindo os MIME reais do seed e os equivalentes Office/OpenDocument; qualquer desconhecido → `generico`. Puro e testado — é a única lógica de verdade dessa frente.

Na camada de apresentação, um mapa literal por `FileKind` (obrigatório: o Tailwind v4 só gera a utility que encontra escaneando o código — string interpolada não funciona, AD-012):

| Kind | Ícone lucide | Matiz |
| ---- | ------------ | ----- |
| pdf | `FileTextIcon` | red |
| documento | `FileTypeIcon` | blue |
| planilha | `SheetIcon` | green |
| apresentacao | `PresentationIcon` | orange |
| imagem | `ImageIcon` | purple |
| generico | `FileIcon` | gray |

O componente do glifo reusa o padrão de chip já sancionado no dashboard (`kpi-tiles.tsx:190`): `<Card variant={hue} padding={1.5}>` com o ícone em `text-<hue>-vivid`. Fica em `src/components/documents/file-type-icon.tsx` e é usado nos dois lugares (card de Configurações e coluna Nome da tabela) — uma definição, duas telas, zero divergência.

**Card de Configurações** (`app/(crm)/configuracoes/page.tsx`):
- `List`/`ListItem` mantidos (linha densa, nunca um Card por documento — regra do AGENTS.md);
- `startContent` = o chip de tipo;
- `description` = categoria como `Token` colorido (`document_categories.color`, exatamente como a tabela já faz) + modalidade;
- `endContent` = data (inalterado);
- contagens por modalidade viram `Badge` com as mesmas cores da tabela (`novo`=blue, `usado`=purple, `ambos`=teal) em vez de texto puro.

**Dependência de dados**: `getDocumentSample` devolve `Document[]` sem categoria resolvida. A página passa a buscar `getDocumentCategories(tenantId)` (já existe, já é tenant-scoped) na mesma `Promise.all` e resolver o mapa em memória — o mesmo que `DocumentsTable` faz hoje. Nenhuma query nova na DAL.

**Tabela de Documentos**: a coluna Nome troca `<FileTextIcon size={16} />` fixo pelo chip. Nada mais muda — colunas, ações, filtros e testes existentes intactos.

---

## Estratégia de testes

| Área | Como se testa | Por quê assim |
| ---- | ------------- | ------------- |
| `selectHistoryWindow` | vitest, tabela de casos: vazio, só lead, 30 mensagens, gap no meio, gap na última, exatamente 20, `hasAgentMessage` verdadeiro/falso | É a regra com mais bordas do lote |
| `buildPrompt` | vitest por **conteúdo citável**: contém a proibição do molde, contém a proibição de emoji, contém o tom do tenant quando existe e **não** contém o bloco quando é nulo, contém a linha de "não se apresente" só com `hasAgentMessage` | Padrão já usado para `AI_TRANSPARENCY_INSTRUCTION`; presença genérica não discrimina |
| `validateLlmOutput` | vitest: 1/2/3 mensagens aceitas; 0, 4, item vazio, item não-string, campo ausente rejeitados; `resposta` derivada correta | Barreira anti-alucinação (AD-014) — é o tier P0 do sensor de mutação |
| Rota `GET /messages` | vitest de integração no padrão das rotas do lote-5: 200 ordenado, `limit` default/válido/inválido, 404 cross-tenant, 401 | Espelha `leads-messages-post.test.ts` |
| `resolveFileKind` | vitest, tabela MIME → kind, incluindo desconhecido | Puro |
| `agentVoiceTone` | vitest na DAL (`tenant-settings.test.ts`) + action (vazio → null, > 500 → erro) | Espelha os campos de persona existentes |
| Fluxo n8n | fixtures + geração de `n8n/generated/` versionado; **sem execução na instância** | Hospedagem fora do ar (context.md) |
| UI (R1, R2) | **screenshot real** via extensão Claude in Chrome contra `next start` em porta dedicada, build de produção | Regra do usuário para trabalho visual; o painel Browser embutido não captura quando não está visível |

Baseline de testes na entrada do lote: **535**.

---

## Riscos

| Risco | Mitigação |
| ----- | --------- |
| `Layout height="fill"` não preencher dentro do `AppShell` | Confirmar por captura antes de seguir; escape hatch = utility de altura token-backed (AD-012) |
| Trocar `resposta` por `mensagens` quebrar um nó esquecido do fluxo | O campo `resposta` **continua existindo** na saída validada (derivado); um nó não migrado continua enviando o texto concatenado em vez de falhar em silêncio |
| Prompt maior degradar a extração de campos no `flash-lite` | Regras antes do conteúdo, formato por último; se a extração piorar no smoke pós-hospedagem, a mitigação é subir de modelo (é 1 nó, por design do L6) — não cortar as regras |
| Tom de voz usado como injeção de prompt | Bloco delimitado + reafirmação posterior das regras; a barreira real é `validateLlmOutput` (AD-014), que não confia em texto nenhum |
| Fixtures do n8n divergirem da instância enquanto o n8n está fora | Nenhuma task afirma paridade com a instância; o diff é item 2 do Runbook pós-hospedagem |
| Seed reescrito quebrar `seed.test.ts` | O teste exige apenas que as mensagens de apresentação existam e sejam distintas entre tenants — ambas continuam verdadeiras; conferir na task |
