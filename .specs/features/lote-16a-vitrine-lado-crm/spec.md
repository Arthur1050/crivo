# Lote 16a — Vitrine, lado CRM — Specification

**Context**: `.specs/features/lote-16-vitrine-publica/context.md`
**Design**: `.specs/features/lote-16-vitrine-publica/design.md`

## Problem Statement

A vitrine pública (L16b) precisa de dados que o CRM ainda não guarda: CRECI, razão social, textos
institucionais, redes, layout, cor, fonte e quais imóveis são destaque. Também precisa de uma
fronteira de banco que impeça a app pública de ler qualquer coisa além do que é público, e de um
aviso do CRM quando o catálogo muda, para que um imóvel vendido saia do ar na hora. Tudo isso nasce
aqui, local e testado, antes de existir a vitrine.

## Goals

- [ ] Um gestor configura e ativa a vitrine da imobiliária em Configurações, e o CRM recusa ativar
      sem CRECI, razão social e WhatsApp do agente.
- [ ] O papel `krivo_vitrine` lê as duas views e é **recusado pelo Postgres** em qualquer tabela de
      `public`, provado por teste contra o banco real.
- [ ] Toda mudança de imóvel ou da vitrine dispara o aviso de revalidação com o slug certo, sem
      nunca falhar a ação do gestor.

## Out of Scope

| Feature | Reason |
| --- | --- |
| O projeto `vitrine/` e qualquer página pública | L16b |
| Criar papel, views ou colunas em produção; variáveis na Vercel | L16c (ativação, uma ação por task) |
| Upload de foto, otimização de imagem | L12 item 1, adiado |
| Agente buscar imóvel por referência | Exige mudar `/api/v1`, a tool e republicar o workflow (ideia adiada) |
| Domínio próprio, sitemap, indexação | Decisão do usuário (2026-10-09): `noindex` no início |
| Teto de destaques por imobiliária | Sem pedido; a ordem resolve (destaques primeiro) |
| Alterar a matriz de permissões | Recursos `configuracoes` e `imoveis` já cobrem quem edita |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Onde guardar os dados da vitrine | Tabela 1:1 `tenant_storefronts`; destaque em `properties.featured` | Decisão do usuário (2026-10-09) | y |
| Quem edita | Seção "Vitrine" em Configurações (`configuracoes:escrever`) e destaque em Imóveis (`imoveis:escrever`) | Decisão do usuário (2026-10-09); nenhuma mudança na matriz | y |
| Formato do CRECI | Texto livre não vazio, até 40 caracteres, sem validação de padrão | Os conselhos regionais usam formatos diferentes (com UF, com sufixo J); validar padrão recusaria registro válido | n |
| Pré-condições de ativação | CRECI, razão social e WhatsApp do agente preenchidos | CRECI é obrigatório em anúncio imobiliário; sem WhatsApp o botão de interesse não existe | y |
| Ausência de linha em `tenant_storefronts` | Equivale a vitrine inativa com os valores padrão | Imobiliárias existentes não precisam de migração de dado (AD-004) | n |
| Cor | Hex `#rrggbb`, gravado em minúsculas; vazio = cor padrão da vitrine | É o insumo de `defineTheme` (`color.accent`) | n |
| Fontes | Lista fechada: `inter`, `montserrat`, `lora`, `playfair` | Fonte livre exigiria URL arbitrária na página pública | n |
| Layouts | `grade` e `editorial` | Roadmap: começar com dois templates bem-feitos | y |
| Instagram | Handle sem `@`, `[a-z0-9._]{1,30}`, gravado em minúsculas | Formato do Instagram; o link é montado pela vitrine | n |
| Telefone da imobiliária | Só dígitos, de 10 a 13 | DDD + número, com ou sem 55 | n |
| Revalidação sem configuração | Sem `VITRINE_PUBLIC_URL` ou sem segredo, o CRM não envia nada e registra `info` | Dev e testes funcionam sem a vitrine; produção sem as variáveis cai na rede de segurança de 5 min (AD-042) | y |
| Falha do aviso | Um log `warn`, sem retry, sem falhar a ação | Decisão do usuário (2026-10-09); o cache expira em 5 min | y |
| Quais mudanças disparam o aviso | Toda escrita de imóvel (criar, editar, excluir, publicar, status, destaque), salvar a vitrine e salvar as configurações do tenant | Qualquer uma pode mudar o que a vitrine mostra; o aviso é barato | n |
| Apagar o WhatsApp do agente com a vitrine ativa | A ação de configurações recusa | Sem isso a vitrine some sem aviso (a view exige WhatsApp) | n |
| Senha do papel nos bancos de teste | Variável do ambiente local, aplicada pelo script em cada alvo | Teste de login real; nenhuma senha no repositório | n |

**Open questions:** none — todas resolvidas com o usuário ou registradas acima.

---

## User Stories

### P1: Dados da vitrine ⭐ MVP

**User Story**: Como gestor, quero guardar no CRM tudo o que a vitrine da imobiliária mostra, para
que a página pública tenha identidade, CRECI e contato sem depender de ninguém editar o banco.

**Why P1**: Sem o dado, a vitrine não tem o que exibir nem como cumprir o CRECI obrigatório.

**Acceptance Criteria**:

1. The system SHALL persistir a configuração da vitrine em `tenant_storefronts`, com `tenant_id` como chave primária referenciando `tenants` e exclusão em cascata.
2. The system SHALL guardar por imobiliária: ativa, layout, cor, fonte, CRECI, razão social, título, sobre, Instagram, telefone, endereço e `updated_at`.
3. The system SHALL usar `false` como padrão de ativa, `grade` como padrão de layout e `inter` como padrão de fonte.
4. WHEN uma imobiliária sem linha em `tenant_storefronts` for lida THEN o sistema SHALL devolver vitrine inativa com os valores padrão, sem criar linha.
5. IF a cor não for vazia nem casar com `#` seguido de 6 dígitos hexadecimais THEN o sistema SHALL recusar a escrita indicando o campo `cor`.
6. WHEN a cor for válida THEN o sistema SHALL gravá-la em minúsculas.
7. IF CRECI tiver mais de 40, razão social ou título mais de 120, sobre mais de 1500 ou endereço mais de 200 caracteres THEN o sistema SHALL recusar a escrita indicando o campo.
8. IF o Instagram, sem `@` inicial, não casar com `[a-z0-9._]{1,30}` depois de passar a minúsculas THEN o sistema SHALL recusar a escrita indicando o campo `instagram`.
9. IF o telefone, sem os caracteres não numéricos, não tiver de 10 a 13 dígitos THEN o sistema SHALL recusar a escrita indicando o campo `telefone`.
10. WHEN um campo de texto opcional chegar vazio ou só com espaços THEN o sistema SHALL gravá-lo como nulo.
11. IF qualquer validação falhar THEN o sistema SHALL NOT gravar nenhuma parte da configuração.
12. The system SHALL ter no banco a restrição que impede `active = true` com CRECI ou razão social vazios ou nulos, e a restrição de formato da cor.

**Independent Test**: salvar uma configuração completa, ler de volta; submeter cada campo inválido
isoladamente e ver o banco inalterado; tentar ativar sem CRECI direto no banco e ver o check recusar.

---

### P1: Ativação da vitrine ⭐ MVP

**User Story**: Como gestor, quero ativar a vitrine só quando ela cumpre a lei e tem contato, para
que a imobiliária nunca publique anúncio sem CRECI.

**Why P1**: CRECI é obrigatório em anúncio imobiliário no Brasil.

**Acceptance Criteria**:

1. IF a ativação for pedida com CRECI vazio THEN o sistema SHALL recusar indicando o campo `creci`.
2. IF a ativação for pedida com razão social vazia THEN o sistema SHALL recusar indicando o campo `razaoSocial`.
3. IF a ativação for pedida com o WhatsApp do agente da imobiliária vazio THEN o sistema SHALL recusar indicando o campo `whatsappAgente`.
4. WHEN mais de uma pré-condição faltar THEN o sistema SHALL listar todas, na ordem CRECI, razão social, WhatsApp do agente.
5. WHILE a vitrine estiver ativa, IF a gravação apagar o CRECI ou a razão social THEN o sistema SHALL recusar a escrita.
6. WHILE a vitrine estiver ativa, IF as configurações da imobiliária forem salvas com o WhatsApp do agente vazio THEN o sistema SHALL recusar indicando o campo e SHALL NOT gravar nenhuma parte das configurações.
7. WHEN o gestor desativar a vitrine THEN o sistema SHALL gravar a desativação sem exigir nenhum outro campo.

**Independent Test**: com vitrine inativa e campos vazios, pedir ativação e ver as três recusas na
ordem; preencher e ativar; tentar apagar o WhatsApp do agente e ver a recusa.

---

### P1: Fronteira de banco da vitrine ⭐ MVP

**User Story**: Como responsável pelo produto, quero que a app pública só consiga ler o que é
público, por privilégio do Postgres, para que nenhum bug dela exponha lead, endereço ou imóvel
vendido.

**Why P1**: É a decisão central da AD-025 e da AD-040.

**Acceptance Criteria**:

1. The system SHALL criar o schema `vitrine` com as views `vitrine.lojas` e `vitrine.imoveis`, ambas com `security_barrier`.
2. The system SHALL expor em `vitrine.lojas` exatamente as colunas `slug, nome, logo, whatsapp, cidade, uf, layout, cor, fonte, creci, razao_social, titulo, sobre, instagram, telefone, endereco, atualizado_em`, nessa ordem.
3. The system SHALL expor em `vitrine.imoveis` exatamente as colunas `loja_slug, referencia, tipo, modalidade, bairro, cidade, uf, preco_centavos, area_m2, quartos, banheiros, vagas, descricao, fotos, destaque, atualizado_em`, nessa ordem.
4. The system SHALL incluir em `vitrine.lojas` só imobiliárias com vitrine ativa, CRECI e razão social não vazios e WhatsApp do agente não vazio.
5. The system SHALL incluir em `vitrine.imoveis` só imóveis com `status = disponivel` E publicados, de imobiliárias presentes em `vitrine.lojas`.
6. The system SHALL criar o papel `krivo_vitrine` com login, `default_transaction_read_only = on`, `statement_timeout = 5s`, `USAGE` no schema `vitrine` e `SELECT` só nas duas views.
7. WHEN o papel `krivo_vitrine` consultar as duas views THEN o Postgres SHALL devolver as linhas.
8. IF o papel `krivo_vitrine` tentar `SELECT` em `leads`, `messages`, `conversations`, `users`, `sessions`, `accounts`, `tenants`, `tenant_storefronts`, `properties` ou `tenant_api_keys` THEN o Postgres SHALL recusar com o código `42501`.
9. IF o papel `krivo_vitrine` tentar `INSERT`, `UPDATE` ou `DELETE` em qualquer view THEN o Postgres SHALL recusar.
10. The system SHALL NOT tornar `krivo_vitrine` membro de `neon_superuser` nem de nenhum outro papel.
11. The system SHALL registrar em `information_schema.role_table_grants` exatamente duas linhas para `krivo_vitrine`: `SELECT` em `vitrine.lojas` e em `vitrine.imoveis`.
12. WHEN `npm run db:push:test` rodar THEN o sistema SHALL derrubar o schema `vitrine`, aplicar o schema Drizzle e recriar views, papel e grants em cada alvo de teste, nessa ordem.
13. WHEN `npm run db:push:test` rodar duas vezes seguidas THEN a segunda execução SHALL terminar com o mesmo estado de views, papel e grants, sem erro.
14. WHEN uma imobiliária ativa tiver até 3 imóveis visíveis THEN a busca do contrato sem filtros e `vitrine.imoveis` SHALL devolver o mesmo conjunto de referências, e o total da busca SHALL ser igual ao número de linhas da view para essa imobiliária.

**Independent Test**: conectar como `krivo_vitrine` na branch do worker, ler as views, tentar ler
`leads` e receber `42501`; listar os grants e ver só dois.

---

### P1: Aviso de revalidação ⭐ MVP

**User Story**: Como gestor, quero que a vitrine reflita na hora o que mudei no CRM, para que um
imóvel vendido não continue anunciado.

**Why P1**: É o caso que dói (roadmap, § Frescor).

**Acceptance Criteria**:

1. WHEN o CRM pedir a revalidação de uma loja com `VITRINE_PUBLIC_URL` e `VITRINE_REVALIDATE_SECRET` definidos THEN o sistema SHALL enviar `POST` para `<VITRINE_PUBLIC_URL>/api/revalidar` com `Authorization: Bearer <segredo>` e corpo JSON contendo só o campo `slug`.
2. IF `VITRINE_PUBLIC_URL` ou `VITRINE_REVALIDATE_SECRET` estiver ausente ou vazio THEN o sistema SHALL NOT enviar nada, SHALL registrar um log `info` com o prefixo `[vitrine]` e o slug, e SHALL devolver `ignorado`.
3. IF a vitrine responder status fora de 2xx THEN o sistema SHALL registrar um log `warn` com o prefixo `[vitrine]`, o slug e o status, e SHALL devolver `falhou`.
4. IF o envio lançar erro ou passar de 3 segundos THEN o sistema SHALL registrar um log `warn` com o prefixo `[vitrine]`, o slug e o nome do erro, e SHALL devolver `falhou`.
5. The system SHALL NOT repetir um envio que falhou.
6. The system SHALL NOT lançar exceção a partir do pedido de revalidação em nenhum caso.
7. The system SHALL NOT escrever o segredo em nenhum log.
8. WHEN um imóvel for criado, editado, excluído, publicado, despublicado, tiver o status alterado ou o destaque alterado com sucesso THEN o sistema SHALL agendar, depois da resposta, o pedido de revalidação com o slug da imobiliária dona do imóvel.
9. WHEN a configuração da vitrine ou as configurações da imobiliária forem salvas com sucesso THEN o sistema SHALL agendar o pedido de revalidação com o slug da imobiliária.
10. IF a escrita for recusada por validação ou permissão THEN o sistema SHALL NOT agendar o pedido de revalidação.
11. The system SHALL definir `VITRINE_PUBLIC_URL` e `VITRINE_REVALIDATE_SECRET` vazios no bloco env da config do Vitest, para que nenhum teste chame a vitrine real.

**Independent Test**: com `fetch` simulado, conferir URL, cabeçalho, corpo, timeout, os três
desfechos e os logs; em cada action, conferir que o pedido sai com o slug certo e não sai na recusa.

---

### P1: Destaques ⭐ MVP

**User Story**: Como gestor, quero marcar quais imóveis aparecem primeiro na vitrine.

**Why P1**: Item 6 do escopo funcional do roadmap.

**Acceptance Criteria**:

1. The system SHALL guardar o destaque como booleano em `properties.featured`, com padrão `false`.
2. WHEN um usuário com `imoveis:escrever` alterar o destaque de um imóvel da imobiliária ativa THEN o sistema SHALL gravar o valor e atualizar `updated_at`.
3. IF um usuário sem `imoveis:escrever` tentar alterar o destaque THEN o servidor SHALL recusar sem gravar.
4. IF o imóvel pertencer a outra imobiliária THEN o sistema SHALL tratá-lo como inexistente e SHALL NOT alterá-lo.
5. The system SHALL NOT limitar o número de destaques por imobiliária.
6. The system SHALL manter a resposta da rota de busca do contrato `/api/v1` sem o campo de destaque.

**Independent Test**: como gestor, marcar e desmarcar; como corretor, chamar a action e ser recusado;
tentar o id de um imóvel de outro tenant e ver o imóvel intocado.

---

### P1: Telas ⭐ MVP

**User Story**: Como gestor, quero editar a vitrine e os destaques nas telas que já uso.

**Why P1**: Sem tela, a vitrine só se configura por SQL em produção.

**Acceptance Criteria**:

1. WHEN um usuário com `configuracoes:ler` abrir Configurações THEN o sistema SHALL mostrar a seção "Vitrine" com todos os campos da configuração.
2. WHILE o usuário não tiver `configuracoes:escrever`, a seção SHALL ser somente leitura.
3. WHILE alguma pré-condição de ativação faltar, a seção SHALL listar cada pré-condição ausente junto ao controle de ativação.
4. WHERE a vitrine estiver ativa e `VITRINE_PUBLIC_URL` estiver definida, a seção SHALL mostrar o link para `<VITRINE_PUBLIC_URL>/c/<slug>`.
5. WHEN a gravação for recusada THEN a seção SHALL mostrar a mensagem junto a cada campo recusado e SHALL manter os valores digitados.
6. WHEN um usuário com `imoveis:escrever` editar um imóvel THEN o formulário SHALL oferecer o controle de destaque.
7. The system SHALL indicar na lista de Imóveis quais imóveis são destaque.
8. The system SHALL compor as telas novas só com componentes e tokens da Astryx, sem `<div>` de layout nem `style` inline.

**Independent Test**: capturas reais (extensão do Chrome) da seção vazia, com bloqueios, ativa com
link, e da lista de Imóveis com destaque; como corretor, a seção não aparece (sem acesso a
Configurações).

---

### P3: Seed

**User Story**: Como quem desenvolve, quero dados de vitrine no seed para exercitar telas e views.

**Why P3**: Conveniência de desenvolvimento.

**Acceptance Criteria**:

1. WHEN o seed rodar THEN o sistema SHALL criar vitrine ativa e completa para a primeira imobiliária do seed e vitrine inativa para a segunda.
2. WHEN o seed rodar THEN o sistema SHALL marcar como destaque ao menos um imóvel visível e um imóvel não visível da imobiliária ativa.
3. WHEN o seed rodar duas vezes sobre banco limpo THEN o sistema SHALL produzir as mesmas linhas de `tenant_storefronts` e os mesmos destaques.

**Independent Test**: rodar o seed duas vezes e comparar.

---

## Edge Cases

- IF o slug da imobiliária não puder ser lido no momento do aviso THEN o sistema SHALL registrar `warn` e SHALL NOT enviar o pedido.
- WHEN a cor chegar em maiúsculas (`#AABBCC`) THEN o sistema SHALL aceitá-la e gravar `#aabbcc`.
- WHEN o Instagram chegar como `@Imobiliaria.X` THEN o sistema SHALL gravar `imobiliaria.x`.
- WHEN a vitrine ativa tiver todos os imóveis vendidos THEN `vitrine.lojas` SHALL conter a loja e `vitrine.imoveis` SHALL NOT conter nenhum imóvel dela.
- IF uma imobiliária for excluída THEN a linha de `tenant_storefronts` SHALL ser removida em cascata.
- WHEN a vitrine for desativada THEN `vitrine.imoveis` SHALL NOT conter nenhum imóvel daquela imobiliária, mesmo publicados e disponíveis.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| VCFG-01 | P1: Dados da vitrine — AC1–AC4, AC12 | Tasks | In Tasks |
| VCFG-02 | P1: Dados da vitrine — AC5–AC11 e Edge Cases de cor e Instagram | Tasks | In Tasks |
| VATIV-01 | P1: Ativação da vitrine — AC1–AC7 | Tasks | In Tasks |
| VBANCO-01 | P1: Fronteira de banco — AC1–AC5, AC14 e Edge Cases de visibilidade | Tasks | In Tasks |
| VBANCO-02 | P1: Fronteira de banco — AC6–AC11 | Tasks | In Tasks |
| VBANCO-03 | P1: Fronteira de banco — AC12, AC13 | Tasks | In Tasks |
| VREV-01 | P1: Aviso de revalidação — AC1–AC7, AC11 | Tasks | In Tasks |
| VREV-02 | P1: Aviso de revalidação — AC8–AC10 e Edge Case de slug | Tasks | In Tasks |
| VDEST-01 | P1: Destaques — AC1–AC6 | Tasks | In Tasks |
| VUI-01 | P1: Telas — AC1–AC5, AC8 | Tasks | In Tasks |
| VUI-02 | P1: Telas — AC6–AC8 | Tasks | In Tasks |
| VSEED-01 | P3: Seed — AC1–AC3 | Tasks | In Tasks |

**Coverage:** 12 total, 12 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] O teste de privilégio passa contra o banco real: `krivo_vitrine` lê as views e recebe `42501`
      em `leads`.
- [ ] Um gestor ativa a vitrine pelo CRM e a loja aparece em `vitrine.lojas`; um imóvel marcado como
      vendido some de `vitrine.imoveis` no mesmo instante.
- [ ] Nenhuma ação de imóvel ou de configuração falha por causa da vitrine, com ou sem as variáveis.
- [ ] A suíte inteira e o build gate passam em cada task.
