# Reset de ambiente — reseed do CRM, bootstrap de administrador e purga da memória do agente

Procedimento para deixar um ambiente (banco do CRM + instância n8n) num estado limpo e utilizável: dados de demonstração recriados, uma conta administradora com senha, e o agente sem memória de conversas antigas.

Escrito no lote-8 (T31). Complementa `n8n/README.md` §4 (ordem seed ↔ Data Table) e §12.3 (rotação da chave de serviço) — este documento é o roteiro que amarra os três passos numa ordem só.

> **Quando usar**: ao trocar o schema de forma incompatível, ao querer um ambiente de demonstração previsível, ou depois de um lote que mudou o modelo de dados. Não é rotina.

---

## 1. O que cada passo faz — e o que ele quebra

| Passo | Efeito | Quebra alguma coisa? |
| ----- | ------ | -------------------- |
| `npm run db:seed` | Apaga e recria todas as tabelas de domínio (tenants, leads, documentos, usuários, vínculos, janelas de trabalho) | **Sim.** Rotaciona as chaves de API por tenant **e a chave de serviço**. A credencial do n8n para de autenticar até ser atualizada à mão (passo 3) |
| `npm run db:create-admin` | Cria ou promove um usuário a administrador de uma imobiliária, com senha | Não |
| Purga de `n8n_chat_histories` | Apaga a memória conversacional do agente nas chaves de teste | Não |

**A ordem importa.** O seed rotaciona a chave de serviço e revoga a antiga na mesma transação — não existe janela em que as duas valham. Por isso a atualização da credencial do n8n vem logo depois do seed, e nada de agente deve rodar no meio.

---

## 2. Pré-requisito: o schema do banco precisa estar em dia

O seed popula dados, não aplica schema. Antes do reseed, confirme que o banco tem o schema atual:

```bash
npx drizzle-kit push                                    # banco real (DATABASE_URL)
npx drizzle-kit push --config drizzle-test.config.ts    # banco de teste (TEST_DATABASE_URL)
```

`drizzle-kit push` pergunta, em terminal interativo, se uma coluna nova é rename ou criação. Se não houver TTY, aplique as sentenças à mão — não há dado a preservar (AD-021: o reseed é o caminho de convergência).

Checagem rápida de que o schema está no formato do lote-8:

```sql
select count(*) from information_schema.tables where table_name = 'brokers';        -- 0
select column_name from information_schema.columns
  where table_name = 'leads' and column_name in ('assigned_user_id', 'broker_id');  -- assigned_user_id
select indexname from pg_indexes where tablename = 'leads';                          -- inclui leads_assigned_user_id_meeting_at_idx
```

---

## 3. Passo a passo

### 3.1 Reseed do CRM

```bash
npm run db:seed
```

O comando imprime, **uma única vez e só no stdout**, as chaves em claro: uma por tenant e a chave de serviço. O banco guarda apenas o hash. Copie a chave de serviço nesse momento — não há como recuperá-la depois.

**Nunca** escreva nenhuma dessas chaves em arquivo, log, commit, issue ou relatório. Elas existem em claro apenas nessa saída de terminal e no cofre do n8n.

O que o seed produz (lote-8): 3 imobiliárias, e em cada uma 1 administrador, 1 gestor e 3 corretores com janelas de trabalho distintas. Todos os usuários nascem **em convite pendente** — sem senha, sem linha em `accounts`. Ninguém consegue entrar até o passo 3.2. Os leads nascem sem responsável, exceto os que já têm reunião agendada.

### 3.2 Bootstrap de administrador

O seed não cria senha para ninguém, de propósito. A conta com que você vai entrar é criada por este comando, uma vez por imobiliária:

```bash
npm run db:create-admin -- <slug-da-imobiliaria> <email> <senha> ["Nome"]
```

Slugs do seed: `crivo-demo`, `triangulo`, `vale-uberaba`.

Rodar sobre um e-mail que já existe **promove** em vez de duplicar, e papéis acumulam (`corretor,administrador`) — um corretor promovido não perde a carteira. O comando é idempotente: repetir sobre quem já é administrador não altera nada.

Escolha a senha você mesmo, num gerenciador de senhas. Ela vai para o histórico do shell — troque-a pela tela depois, ou limpe o histórico.

### 3.3 Atualizar a credencial do n8n

Único trabalho manual permitido na instância (AD-014: a UI do n8n nunca é editada à mão, **exceto credenciais**).

1. Abrir a credencial `httpHeaderAuth` **"Crivo - chave de servico"** na UI do n8n.
2. Trocar o valor do header `Authorization` para `Bearer <chave de serviço nova>` (a do stdout do passo 3.1).
3. Confirmar antes de seguir: o procedimento de conferência está em `n8n/README.md` §12.2 (workflow-escrutínio temporário, `X-Crivo-Tenant: triangulo`, espera `status: "success"`).

Sem este passo, toda chamada do agente ao CRM responde `401 nao-autenticado` e o agente para de funcionar em silêncio — a falha só aparece quando `crivo-agente-erros` dispara o e-mail.

> `tenant_config` **não guarda mais nenhuma chave** desde o lote-7 (T17). Não há nada a re-sincronizar nessa Data Table depois do seed — só a credencial acima.

### 3.4 Purgar a memória do agente

A memória conversacional (`n8n_chat_histories`, nó `memoryPostgresChat`) é **cache derivado** — o CRM é a fonte de verdade da thread (AD-019). Depois de um reseed, uma memória sobrevivente falaria de um lead que o CRM não tem mais, e a semeadura de cold start não corrige isso (a memória não está vazia).

A memória é chaveada por `tenantSlug:waId`, **não** pelo id do lead. Purgue as chaves de teste:

```sql
delete from n8n_chat_histories where session_id = 'triangulo:553499532444';
-- ou, para limpar tudo num ambiente de teste:
delete from n8n_chat_histories;
```

O banco é o **Postgres da própria instância n8n**, credencial `postgres` "Postgres n8n local" (`n8n/README.md` §2.4). O acesso é por um workflow temporário `Manual Trigger → Postgres (executeQuery)`, criado e arquivado via MCP — nunca pela UI.

**Registre o id da execução antes de arquivar o workflow temporário**: arquivar destrói as execuções junto, e a evidência some (lição L-016 do lote-7).

### 3.5 Limpar `conversa_estado` na mesma passada

Purgar a memória sem limpar a Data Table `conversa_estado` deixa o ambiente meio-resetado, dos dois lados:

- `leadId` é cache do id do lead no CRM. Sobrevivendo ao reseed, o agente tentaria dar `PATCH` num lead que não existe mais.
- `perguntadosJson` e `aberturasJson` fazem uma sessão nova herdar "já perguntei tudo" e pular direto para `agendando` com um lead frio.

Apague a linha da chave de teste (`tenantSlug` + `waId`), ou zere `leadId`, `perguntadosJson`, `aberturasJson` e `bufferJson`. Via nó Data Table num workflow temporário, mesma regra de sempre.

---

## 4. Conferência final

1. `select count(*) from n8n_chat_histories` → 0 nas chaves de teste.
2. `conversa_estado` sem linha para a chave de teste, ou com `leadId` nulo.
3. Login na aplicação com a conta do passo 3.2 → entra no Pipeline.
4. Tela de usuários mostra administrador, gestor e corretores com janelas de trabalho diferentes.
5. Primeira mensagem no número de teste abre conversa nova e cria um lead novo no CRM.

O item 5 é a prova de ponta a ponta e só pode ser feito por uma pessoa, mandando uma mensagem real no WhatsApp.

---

## 5. Estado observado em 2026-08-27 (lote-8, T31)

Registrado para quem for repetir o procedimento e quiser saber de onde se partiu:

- **Schema do banco real: em dia.** `brokers` não existe mais, `leads.assigned_user_id` presente, as 6 tabelas de autenticação (`users`, `sessions`, `accounts`, `verifications`, `tenant_members`, `tenant_invitations`) criadas, e o índice de conflito de agenda `leads_assigned_user_id_meeting_at_idx` aplicado. 3 imobiliárias, 25 leads. Só os **dados** precisavam de reseed.
- **`n8n_chat_histories`: já vazia** (0 sessões — execução `1724`). O passo 3.4 era um no-op neste ambiente.
- **`conversa_estado`: 3 linhas** (execução `1725`). A da chave de teste real (`triangulo` / `553499532444`) já estava com `leadId` **nulo**, `fase: "encerrada"` e `perguntadosJson`/`aberturasJson` vazios — ou seja, já no formato que o passo 3.5 produz. As outras duas (`test-tenant-lote6c`, `test-tenant-lote6c-turnlimit`) são resíduo inerte de fixture do lote-6c, com slugs que não resolvem em `tenant_config`; pendência conhecida herdada, não tratada aqui.
- **`lastInboundAt` da chave de teste: 2026-08-22.** Mais de 12h de intervalo, então o corte de sessão (`isSessionExpired`, `n8n/src/session.mjs`) já trata a próxima mensagem como sessão nova, independentemente da purga.
