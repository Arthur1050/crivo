# SQL da vitrine pública

Fronteira de banco da vitrine (AD-040): o papel `crivo_vitrine` lê só duas views do schema `vitrine`, e o CRM avisa a vitrine quando o catálogo muda (AD-042). Este diretório guarda o SQL e o executor.

| Arquivo | O que faz |
| --- | --- |
| `vitrine.sql` | Idempotente. Reaplica os dois checks de `tenant_storefronts`, cria o schema `vitrine`, as views `vitrine.lojas` e `vitrine.imoveis` (`security_barrier`), o papel `crivo_vitrine` e os dois grants. Não define senha. |
| `apply.ts` | `applyVitrineSql(url, { password? })`, `dropVitrineSchema(url)` e `verifyVitrineState(url)`. |

## Ordem obrigatória, em qualquer banco

1. **Derrubar o schema `vitrine`** (`drop schema if exists vitrine cascade`). Alterar uma coluna usada por view faz o `drizzle-kit push` falhar (`0A000 cannot alter type of a column used by a view or rule`).
2. **Aplicar o schema do Drizzle** (`drizzle-kit push`).
3. **Aplicar `vitrine.sql`.** Pode rodar quantas vezes for preciso: só adiciona o que falta.
4. **Conferir o estado final** (`verifyVitrineState`): os dois checks em `pg_constraint`, as duas views com `security_barrier`, o papel com login, `default_transaction_read_only = on` e `statement_timeout = 5s`, e exatamente dois grants (`SELECT` em `vitrine.lojas` e em `vitrine.imoveis`).

Não confie no código de saída do `drizzle-kit push`: ele já saiu com 0 sem aplicar um check (L-068) e sai com 0 depois de falhar num índice único que já existe.

Nos bancos de teste, `npm run db:push:test` faz os quatro passos em cada alvo (base e branches de worker), na ordem, e para no primeiro erro. Ele também recria o índice `document_categories_tenant_id_lower_name_idx`, que o `drizzle-kit push` derruba a cada execução.

## O papel nasce só por SQL

**Nunca crie `crivo_vitrine` pelo console do Neon.** O console coloca o papel em `neon_superuser`, o que anula o isolamento sem ninguém notar. Por SQL, o papel não é membro de papel algum e não tem privilégio nenhum em `public`; o `vitrine.sql` cria o papel só se ele não existir.

Papéis são por branch do Neon: o papel criado numa branch não existe nas branches filhas já criadas. Aplique o SQL em cada alvo.

## A senha é definida à parte

O `vitrine.sql` não contém senha.

- **Bancos de teste**: `npm run db:push:test` aplica a senha a partir de `VITRINE_TEST_DB_PASSWORD`, uma variável do ambiente local. Sem ela o comando falha antes de tocar qualquer alvo.
- **Produção**: quem define a senha é o usuário, no editor SQL do Neon, com `alter role crivo_vitrine password '<senha definida pelo usuário>'`. A senha vai direto para a variável do projeto da vitrine na Vercel e nunca para o repositório, para um commit ou para o chat.

## Variáveis dos dois projetos

| Projeto | Variável | Para quê |
| --- | --- | --- |
| CRM (raiz) | `VITRINE_PUBLIC_URL` | Endereço público da vitrine. O CRM envia `POST <VITRINE_PUBLIC_URL>/api/revalidar` e monta o link "Abrir vitrine". Vazia ou ausente: nada é enviado e o CRM registra um `info`. |
| CRM (raiz) | `VITRINE_REVALIDATE_SECRET` | Segredo compartilhado, enviado como `Authorization: Bearer`. Vazio ou ausente: nada é enviado. |
| Vitrine (`vitrine/`) | `VITRINE_REVALIDATE_SECRET` | O mesmo segredo; a rota `/api/revalidar` o compara em tempo constante. |
| Vitrine (`vitrine/`) | `VITRINE_DATABASE_URL` | Conexão do papel `crivo_vitrine` (usuário e senha dele, nunca o dono). |
| Testes | `VITRINE_TEST_DB_PASSWORD` | Senha do papel nos bancos de teste, só no ambiente local. |

No bloco de ambiente da configuração do Vitest, `VITRINE_PUBLIC_URL` e `VITRINE_REVALIDATE_SECRET` ficam vazias de propósito: nenhum teste do CRM chama a vitrine real.

O aviso é melhor-esforço (AD-042): timeout de 3 s, sem repetição, e nunca falha a ação do gestor. Se ele falhar, o cache da vitrine expira sozinho em até 5 minutos.

## Rollback

```sql
drop schema vitrine cascade;
drop role crivo_vitrine;
```

O `drop schema ... cascade` remove as views e os grants do schema. Se `drop role` reclamar de dependências, derrube antes o que ainda pertence ao papel (`drop owned by crivo_vitrine`). A tabela `tenant_storefronts` e a coluna `properties.featured` ficam: são dado do CRM e não afetam nada sem as views.

## Produção

Nada deste diretório roda em produção sem uma ação explícita e autorizada (lote 16c, uma ação por task). Em produção valem a mesma ordem, o mesmo papel só por SQL e a conferência do estado final antes de qualquer variável ser definida na Vercel.
