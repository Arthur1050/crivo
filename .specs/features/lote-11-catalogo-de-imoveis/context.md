# Catálogo de imóveis — Context

**Gathered:** 2026-09-10
**Spec:** `.specs/features/lote-11-catalogo-de-imoveis/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Inventário de imóveis como **linha estruturada**, por imobiliária, gerenciado no CRM e consultável
pelo agente conversacional através de uma tool nova (`buscar_imoveis`). O corretor de captação é
atributo do **imóvel**.

`leads` fica **intocado**: nenhuma relação imóvel↔lead existe no schema, e a qualificação continua
sendo sobre critérios (`region`, `purchaseHorizon`, faixa de preço), nunca sobre uma unidade
específica (decisão do usuário, 2026-09-04). Isso elimina a questão de comissão do escopo técnico.

Origem: `ROADMAP-POS-PILOTO.md` § L11, itens 1–5, todos dentro do lote (decisão do usuário,
2026-09-10 — o motivo original para separar a tool era não confundir a atribuição do smoke do
lote-10, que fechou em 2026-09-09 com AD-026/AD-027).

---

## Implementation Decisions

### Escopo do lote

- CRUD (itens 1–4) **e** tool `buscar_imoveis` (item 5) no mesmo lote.
- A tool nova é provada por **conversa real**, sob o protocolo da AD-027 (roteiro versionado +
  checklist de limpeza + barra de aprovação por desfecho). A AD-027 nomeia "nova tool"
  explicitamente como caso de uso do protocolo.
- Sem a tool, o CRUD ficaria sem consumidor de produção — o padrão que a lição `L-021` marca como
  "não é feature entregue".

### Permissão sobre o catálogo

- O recurso `imoveis` entra na matriz existente (`src/lib/permissions.ts`), sem escopo novo.
- **Administrador e gestor**: `ler` + `escrever`. **Corretor**: `ler` apenas — espelha exatamente o
  que a matriz já faz com `documentos` (PERM-01 AC3).
- Nenhum `PropertyScope` análogo ao `LeadScope` (SCOPE-01): o corretor enxerga o inventário inteiro
  da imobiliária, não só o que ele captou. Ver o imóvel do colega é necessário para atender.
- Rejeitado: corretor escrevendo só os imóveis que captou (exigiria escopo novo com teste próprio, e
  permitiria auto-atribuição de captação em imóvel novo); corretor escrevendo qualquer imóvel (o
  gestor perderia o controle sobre o inventário que o agente cita ao lead).

### Fotos

- **URL externa colada pelo gestor.** Nenhum binário entra neste lote.
- Storage real de binário continua sendo o item 1 do **L12**, onde é resolvido de uma vez, junto com
  extração de texto e TTL/LGPD do binário. A migração de URL para storage depois é **aditiva**
  (AD-004).
- Rejeitado: upload real agora (antecipa uma frente inteira que já tem lote próprio); sem fotos
  (deixaria o L16 sem nada para exibir).

### Tipos de imóvel

- Nasce uma **enum própria do catálogo**, superset da de qualificação.
  `propertyTypeEnum` (`src/db/schema.ts:24`, hoje `casa`/`apartamento`) **fica intocada**.
- Motivo: `propertyType` não é enum livre — é um dos 3 campos obrigatórios de qualificação
  (`n8n/src/phase.mjs:12`) e seu rótulo está cravado como `"tipo de imóvel (casa ou apartamento)"`
  em `phase.mjs:33` e **dentro do workflow publicado** (`n8n/generated/principal.ts`). Ampliá-la
  arrastaria `parsers.ts:202`, o rótulo, regeneração e republicação com conferência de SHA — e
  mudaria o que o agente pergunta ao lead, exigindo prova conversacional sobre a **qualificação**, e
  não só sobre a tool nova. É o padrão da lição `L-015`.
- O filtro por tipo vindo do lead mapeia 1:1 nos dois valores compartilhados; os tipos extras
  simplesmente nunca casam com filtro originado de lead.

### Corretor de captação

- **Obrigatório** no cadastro. FK para `users.id`, restrita a usuário que seja **membro ativo da
  mesma imobiliária** (`tenant_members`) — nunca usuário de outro tenant.
- Motivo: é o ponto do item 3 do roadmap, e captador nulo é o tipo de campo que ninguém volta para
  preencher.

### Publicação e referência

- **Flag de publicação nasce neste lote**, distinta de `status` (disponível/reservado/vendido). A
  AD-025 já descreve o CRM disparando `revalidateTag` quando o gestor "publica, despublica ou marca
  como vendido" — ela já pressupõe publicação como estado do imóvel.
- **`publicado` governa os dois públicos**: a tool só devolve imóvel `disponivel` **e** `publicado`,
  e a vitrine do L16 lerá o mesmo par. Um critério, um lugar para errar; despublicar tira o imóvel
  da boca do agente na mesma ação em que tira da vitrine.
- **Referência legível única por imobiliária** (ex.: `AP-0142`) nasce neste lote, porque o L16 item 2
  exige que a mensagem do `wa.me` cite a referência. Criá-la depois seria migração de dado existente.

### O que o agente pode citar ao lead

- Referência, tipo, bairro/cidade, quartos, banheiros, vagas, área e **preço exato**.
- **Sem endereço exato** (logradouro, número, complemento) e **sem dados do captador** (nome,
  telefone, e-mail).
- A restrição é da **fronteira, não do prompt**: a rota não devolve os campos. É a lição direta do
  lote-10 (`evidencia.md` §15.4) — quando o campo errado é o mais visível do payload, instrução de
  prompt não vence; só remover o campo vence. É a AD-018 na prática.
- Motivo de produto para o endereço: com número e complemento na mão, o lead procura o proprietário
  direto e a imobiliária perde a intermediação.

### Agent's Discretion

- Nome da tabela, nome do módulo de dados, forma da URL da rota, componentes Astryx da tela e
  organização dos arquivos — decisões de Design, dentro das convenções já estabelecidas nos lotes
  2–9.
- Formato exato da referência legível, desde que seja legível, curto e único por imobiliária.

### Declined / Undiscussed Gray Areas → Assumptions

Nenhuma área cinzenta foi declinada. As decisões que eu tomei sozinho por serem deriváveis do
repositório ou das ADs ativas estão registradas como **Assumptions** no `spec.md`, com o default
escolhido e a razão — e são confirmadas pela aprovação da spec.

---

## Specific References

- `ROADMAP-POS-PILOTO.md` § L11 — os 5 itens e a decisão de modelagem de 2026-09-04 (captador
  pertence ao imóvel; nenhum imóvel vinculado a lead).
- AD-025 (`STATE.md`) — a vitrine do L16 lê `imóveis` e as colunas de identidade visual de `tenants`
  com usuário de banco SELECT-only; pressupõe publicar/despublicar/marcar vendido.
- AD-027 (`STATE.md`) — protocolo de prova conversacional, aplicável a "nova tool".
- AD-018 — quem detém a regra decide; identidade nunca vem do modelo.
- `src/lib/permissions.ts` — matriz de permissões e a diferença escopo × ação.
- `app/api/v1/context/route.ts` — o padrão de rota fina sob `withIntegrationRoute`.
- `n8n/workflows/principal.ts:1149-1180` — o padrão de tool `httpRequestTool` com
  `X-Crivo-Tenant` por expressão do fluxo e `neverError`.

---

## Deferred Ideas

- **Vitrine pública do catálogo** — é o L16 inteiro (AD-025). Este lote só produz o dado e o par
  `disponivel` + `publicado` que a vitrine vai ler; nenhuma superfície pública nasce aqui.
- **`revalidateTag` disparado pelo CRM ao publicar/despublicar/vender** — pertence ao L16, porque
  não existe app pública para revalidar antes dele.
- **Upload real de fotos e storage de binário** — L12 item 1.
- **Vincular imóvel a lead / registrar interesse por unidade** — explicitamente fora do modelo por
  decisão do usuário (2026-09-04); traria a questão de comissão para dentro do escopo técnico.
- **Histórico de preço do imóvel** — não pedido; um imóvel guarda o preço atual.
- **Busca vetorial / RAG sobre descrição de imóvel** — a consulta estruturada é estritamente melhor
  para a pergunta que aparece na qualificação. Fica no L-RAG condicional do L12 item 4.
