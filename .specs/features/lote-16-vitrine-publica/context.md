# Lote 16 — Vitrine pública do catálogo — Context

**Gathered:** 2026-10-09
**Specs:** `.specs/features/lote-16a-vitrine-lado-crm/spec.md`, `.specs/features/lote-16b-vitrine-app/spec.md`, `.specs/features/lote-16c-vitrine-ativacao/spec.md`
**Design (comum aos três):** `.specs/features/lote-16-vitrine-publica/design.md`
**Status:** Ready for design

---

## Feature Boundary

Uma página pública por imobiliária (`/c/<slug>`) com o catálogo publicado e uma página por imóvel,
somente leitura, com tema e layout escolhidos pela imobiliária, CRECI e rodapé legal obrigatórios,
metadados de compartilhamento para circular no WhatsApp e um botão que abre o `wa.me` do agente
citando a referência do imóvel. O CRM ganha a configuração da vitrine, o destaque de imóveis e o
aviso de revalidação. Fonte das decisões já tomadas: `ROADMAP-POS-PILOTO.md` § L16 e AD-025.

O trabalho se divide em três lotes, cada um com spec, tasks, Verifier e fechamento próprios:

| Lote | Entrega | Toca produção? |
| --- | --- | --- |
| L16a | Lado CRM: tabela da vitrine, destaque, views e papel de banco **no ambiente de teste**, tela Vitrine em Configurações, aviso de revalidação | Não |
| L16b | Projeto `vitrine/`: catálogo, item, dois templates, tema, OG, rota de revalidação, testes de segurança | Não |
| L16c | Ativação: schema, views e papel em produção, projeto e variáveis na Vercel, push, prova real | Sim, uma ação por task com autorização |

---

## Implementation Decisions

### Onde mora o projeto (usuário, 2026-10-09)

- Pasta `vitrine/` **neste repositório**, com `package.json`, `next.config.ts`, `tsconfig.json` e
  lint próprios; na Vercel, um segundo projeto com Root Directory `vitrine`.
- A vitrine **nunca importa** de `src/` nem de fora de `vitrine/`. O que precisa ser igual dos dois
  lados (formato da tag, enums de layout e fonte, payload da revalidação, colunas das views) é
  espelhado e protegido por **teste de paridade** na suíte do CRM.
- Motivo registrado a pedido do usuário: (1) o teste de privilégio do banco reusa as branches Neon
  de teste, o `db:push:test` e as fixtures de dois tenants (AD-033) em vez de duplicar essa
  infraestrutura; (2) a divergência de schema entre os dois projetos vira falha de teste no mesmo
  commit, não incidente em produção; (3) `AGENTS.md`/`CLAUDE.md`, a skill de specs, o
  `check_commit.py` e o hook do ambiente local valem uma vez só. A separação exigida pela AD-025
  (config, deploy, ausência de `proxy.ts`, fronteira de banco) não depende de repositório.

### Revalidação (usuário, 2026-10-09)

- Endpoint `POST /api/revalidar` na vitrine, protegido por segredo compartilhado, corpo só com o slug,
  chamando `revalidateTag(tag, { expire: 0 })` (forma que a doc do Next 16.2.11 indica para chamada
  de sistema externo).
- O CRM dispara depois da escrita via `after()`, com timeout curto, sem retry, e **nunca** falha a
  ação do gestor por causa disso. Falha vira log.
- Rede de segurança: perfil de cache próprio da vitrine com expiração em 5 min (o perfil `minutes`
  padrão expira em 1 h, o que deixaria um imóvel vendido no ar até 1 h se o aviso falhar).

### Dados e edição (usuário, 2026-10-09)

- Tabela 1:1 `tenant_storefronts` para tudo o que é da vitrine; destaque como coluna booleana em
  `properties`. A view pública lê essa tabela e só nome, slug, logo, cidade, UF e WhatsApp do agente
  de `tenants`.
- Edição numa seção "Vitrine" de Configurações (administrador e gestor, `configuracoes:escrever`) e
  o destaque na tela de Imóveis (`imoveis:escrever`), ambos no L16a.

### Fotos e OG (usuário, 2026-10-09)

- Fotos continuam URL externa (L11, IMOV-06). A vitrine as exibe como estão, sem o otimizador de
  imagem do Next.
- OG do item = primeira foto. OG do catálogo e de item sem foto = cartão gerado com nome e cor da
  imobiliária, sem buscar nada externo.

### Referência e URL (usuário, 2026-10-09)

- URL do item `/c/<slug>/imovel/<referência em minúsculas>` (ex.: `ap-0142`). Mensagem do `wa.me`:
  "Olá! Vi o imóvel AP-0142 na vitrine da <imobiliária> e tenho interesse."

### SEO (usuário, 2026-10-09)

- `noindex` em todas as páginas, sem sitemap e sem `Disallow` no `robots.txt`.

### Divisão (usuário, 2026-10-09)

- L16a + L16b + L16c, nessa ordem, cada um com Verifier próprio.

### Agent's Discretion

Decididas no design, abertas a objeção na revisão:

- Isolamento por **duas views** num schema `vitrine` em vez de `GRANT` por coluna nas tabelas-base
  (AD-040, que emenda a AD-025): o corte de visibilidade passa a ser privilégio de banco também.
- Lista fechada de 4 fontes e 2 layouts; o layout muda só a página de catálogo, a página de item é
  uma só.
- Paginação do catálogo em 24 imóveis por página; ordem destaque → mais recente → referência.
- Vitrine só no modo claro.

### Declined / Undiscussed Gray Areas → Assumptions

Registradas nas Assumptions das specs de cada lote: formato do CRECI (texto livre, sem validação de
padrão), endereço da imobiliária como texto livre, ausência de teto de destaques, imóvel sem foto,
página de imóvel indisponível com a marca da imobiliária.

---

## Specific References

- Templates Astryx de referência: `product-gallery` e `centered-hero` (layout **grade**),
  `side-gallery` com linhas edge-to-edge (layout **editorial**), `product-detail` (página de item).
- A Astryx não tem primitivo de imagem (comentário `#2582` nos próprios templates): `<img>` dentro
  de `AspectRatio`, com utilitários Tailwind de token.

---

## Deferred Ideas

- **Agente buscar imóvel por referência**: o lead chega dizendo "AP-0142" e a tool `buscar_imoveis`
  não filtra por referência. Exige mudar a rota `/api/v1`, a tool e republicar o workflow.
- Domínio próprio por imobiliária, sitemap e indexação.
- Upload de foto para Blob e otimização de imagem (L12 item 1).
- Filtros de busca na vitrine (tipo, bairro, preço).
- `ignoreCommand` no projeto Vercel do CRM para não rebuildar quando só `vitrine/` muda.
