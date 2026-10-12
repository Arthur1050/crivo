# Krivo — aplicação da mudança de nome

O nome oficial do produto é **Krivo**, por decisão do usuário em 2026-10-11.
Código, pacotes, interface, mensagens de e-mail, fixtures, assets, specs e fontes
dos workflows usam essa grafia. Identificadores externos existentes continuam
apontando para seus destinos reais até a migração desses serviços.

## Contrato atualizado

| Área | Nome atual |
| --- | --- |
| Pacotes | `krivo`, `krivo-vitrine` |
| Tenant de demonstração | `krivo-demo` / Krivo Demo |
| Autenticação de serviço | `X-Krivo-Tenant` |
| Metadados do histórico | `X-Krivo-Anchor-Message-Id`, `X-Krivo-Agent-State-Revision` |
| Problemas da API | `urn:krivo:problem:<código>` |
| Destinatário do alerta operacional | `KRIVO_OPERATOR_ALERT_EMAIL` |
| Papel de leitura da vitrine | `krivo_vitrine` |
| Credencial n8n | `Krivo - chave de servico` |
| Workflows | Prefixo `krivo-`, mantendo os IDs dos workflows existentes |

## Ambientes que já existem

1. Planeje uma janela conjunta para instalar o CRM e atualizar os consumidores
   do contrato. Os headers e a variável do alerta mudaram de nome.
2. Com o dono do banco, aplique `scripts/brand/rename-to-krivo.sql`. O script
   renomeia o papel existente preservando senha e grants e atualiza apenas o
   tenant de demonstração e referências exatas aos assets da plataforma. Os
   nomes anteriores no script são necessários para encontrar os dados antigos.
   Execute a migração antes do SQL de provisionamento da vitrine, para evitar
   criar dois papéis. Nenhum seed deve ser usado para migrar dados reais.
3. Atualize o usuário na `VITRINE_DATABASE_URL` para `krivo_vitrine`, preservando
   senha, host, banco e parâmetros. Renomeie a variável de destinatário do alerta
   na Vercel e ajuste o nome de exibição em `RESEND_FROM`.
4. No n8n, renomeie a credencial e os workflows existentes pelos seus IDs.
   Aplique somente a diferença de marca às versões que já estão publicadas,
   na mesma janela do CRM. As fontes da branch principal incluem o L14b ainda
   não ativado em produção: publicar os gerados indiscriminadamente ativaria
   comportamento fora desta mudança. Preserve os IDs e os nós funcionais das
   versões publicadas; não crie ou ative novos workflows, subscriptions ou
   credenciais para a troca de nome.
5. Renomeie os projetos externos e o repositório remoto, quando solicitado, e
   valide os novos aliases/URLs antes de atualizar os endpoints do n8n e o
   `BETTER_AUTH_URL`. Um nome de projeto novo não garante que um URL equivalente
   já exista.

O checkout local, o remoto Git configurado e os URLs atuais da Vercel são
referências de infraestrutura existentes. Não foram renomeados nem houve
deploy, publicação de workflow ou alteração do banco de produção nesta mudança.
Os PNGs e o texto da proposta de logo rejeitada foram retirados do workspace.
O símbolo anterior foi preservado byte a byte em `public/krivo_white_symbol.png`.
As assinaturas horizontal e vertical agora são SVGs com esse mesmo símbolo
embutido e o texto KRIVO; preservam a transparência sem depender da edição
automática de PNG. A proposta rejeitada não foi reaproveitada.

## Conferência da alteração local

- Builds do CRM e da vitrine: passaram.
- Lint do CRM e da vitrine: zero erros; os nove avisos da raiz já existiam.
- Varredura dos arquivos do projeto: nenhuma referência inesperada ao nome
  antigo e nenhum asset com nome antigo. Endereços configurados, caminho real
  do checkout e origens da migração são as exceções documentadas acima.
- Símbolo: SHA-256 idêntico ao arquivo original. Os SVGs foram renderizados e
  conferidos visualmente; o HTML compilado de login contém Krivo.
- n8n: nove arquivos gerados; uma segunda geração produziu os mesmos bytes.
- Suíte completa: 232 arquivos passaram, com 3.753 testes passando; cinco
  arquivos apontaram problemas (dois testes falharam e 55 foram pulados após
  falhas de preparação). Quatro arquivos dependiam de fixtures persistidas
  ainda com o slug anterior; o outro esperava um host renomeado que não existe
  na configuração. As cinco bases descartáveis de teste foram atualizadas
  com o seed Krivo, e a expectativa do host foi corrigida para os endpoints
  configurados, preservando a restrição às duas rotas de leitura.
- Reverificação final dos cinco arquivos e da migração: **seis arquivos e
  76 testes passaram, sem falhas nem casos pulados**. Inclui os cinco testes
  da migração: IDs e grants preservados, reexecução, atualização de URLs de
  assets e rollback em conflitos. A suíte completa não foi repetida depois
  dessa revisão; os demais arquivos haviam passado sem mudança posterior.
- `git diff --check`: passou. Produção não foi alterada.
