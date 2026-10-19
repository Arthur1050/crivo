# Vitrine pública do Krivo

Projeto Next separado do CRM (AD-025, AD-041): uma página pública por imobiliária, somente leitura, com o catálogo publicado e uma página por imóvel. O visitante vê o catálogo na identidade da loja (cor, fonte e layout que o gestor escolheu) e chega ao WhatsApp do agente com a referência do imóvel na mensagem.

Nada aqui escreve no banco, abre sessão, define cookie ou mostra endereço, captador ou dado de lead.

## Rotas

| Rota | O que é |
| --- | --- |
| `/c/<slug>` | Catálogo da loja (`grade` ou `editorial`), 24 imóveis por página em `?pagina=` |
| `/c/<slug>/imovel/<referência>` | Página do imóvel; a referência vale em minúsculas ou maiúsculas |
| `/c/<slug>/opengraph-image` | Cartão PNG 1200×630 com o nome da loja sobre a cor dela (`og:image` do catálogo e do imóvel sem foto) |
| `POST /api/revalidar` | Aviso do CRM: derruba o cache da loja (`revalidateTag` com `{ expire: 0 }`) |

Toda página e toda resposta saem com `noindex, nofollow` (meta e `X-Robots-Tag`); não há sitemap nem `Disallow` (AD-043). Loja inexistente, inativa ou com slug inválido mostra uma página de não encontrado neutra, sem marca. Imóvel que deixou de estar visível (vendido, reservado, despublicado) mostra "Este imóvel não está mais disponível." dentro da marca da loja. As páginas de loja saem em streaming com HTTP 200 (`loading.md` da doc do Next); a garantia é a interface de não encontrado, o `noindex` e a ausência de dado do imóvel.

## Como rodar

Instalação, uma vez:

```bash
npm install --prefix vitrine
```

Na raiz do repositório:

| Comando | O que faz |
| --- | --- |
| `npm run vitrine:dev` | Sobe a vitrine em `next dev` na porta 3100, lendo a branch de teste do Neon como o papel `krivo_vitrine`. Gera um segredo local e não imprime credencial. Precisa de `VITRINE_TEST_DB_PASSWORD` no ambiente local. |
| `npm run vitrine:e2e` | Prova por HTTP contra a app construída: cria a fixture de sentinelas, faz `next build` e `next start` na porta 3110, roda as asserções e remove a fixture, mesmo em falha. Usa a branch de teste: **não rode junto com outros testes** (L-033). |

Dentro de `vitrine/`: `npm run lint`, `npm run typecheck` e `npm run build`.

Armadilha observada, de causa não estabelecida: depois de construir (o `vitrine:e2e` constrói), um `vitrine:dev` que já estava de pé respondeu 404 em rota nova. Apague `vitrine/.next` e reinicie o `vitrine:dev`.

## Variáveis

Só nomes; os valores ficam no ambiente de cada projeto e nunca entram no repositório.

| Variável | Para quê |
| --- | --- |
| `VITRINE_DATABASE_URL` | Conexão do papel `krivo_vitrine` (usuário e senha dele, nunca o dono). A única forma de a vitrine conectar ao banco. Ausente: a leitura falha com mensagem sem URL. |
| `VITRINE_REVALIDATE_SECRET` | Segredo que o CRM envia em `Authorization: Bearer`. Vazio ou ausente: a rota responde 401 e não revalida nada. |
| `VITRINE_PUBLIC_URL` | Endereço público da vitrine, base das URLs absolutas de `og:url` e `og:image`. Ausente: as URLs saem relativas. Aqui use a URL completa, com `https://` (sem esquema, `new URL` recusa e as URLs também saem relativas). No CRM a mesma variável aceita só o host e prefixa `https://`; esquema que não seja `http(s)` ou valor inválido faz o aviso registrar `erro=UrlInvalida` (AD-049). |

## Regras do projeto

- **Nada importa de fora de `vitrine/`** e nenhum pacote entra sem estar declarado no `package.json` daqui; nos `__tests__/`, `vitest` é a única exceção. O teste `src/lib/__tests__/vitrine-isolamento.test.ts` da suíte raiz varre os imports (AD-041, AD-044).
- **Sem `proxy.ts` nem `middleware.ts`.** A vitrine existe separada do CRM justamente para o tráfego anônimo não atravessar a autenticação dele (AD-025).
- **O que precisa ser igual ao CRM é declarado duas vezes** (`src/contrato.ts` aqui, `src/lib/storefront-contract.ts` lá): formato da tag, layouts, fontes, payload da revalidação e colunas das views. Testes de paridade na suíte raiz quebram se divergirem ou se as colunas declaradas divergirem das views reais.
- **Fora de `vitrine/`, só arquivos de teste da suíte raiz importam daqui** (paridade, isolamento e o teste de banco das consultas, `src/db/__tests__/vitrine-consultas.test.ts`).
- **A fronteira de segurança é o banco** (AD-040): o papel `krivo_vitrine` só tem `SELECT` nas views `vitrine.lojas` e `vitrine.imoveis`, que já aplicam o corte de visibilidade. Todo imóvel é lido filtrado pelo slug da loja pedida.
- **Telas com os componentes da Astryx e tokens**, sem `style` nem CSS escrito à mão. Exceções sancionadas: o `<img>` dentro de `AspectRatio` (a lib não tem primitivo de imagem), os dois `<style>` do tema com a saída de `generateThemeCSS` (AD-046) e o cartão de compartilhamento, que o Satori só renderiza com `div` e `style` inline.
- **Função como prop de componente da Astryx num Server Component quebra o RSC.** Glifos e estados interativos moram em componente de cliente (`espaco-sem-foto.tsx`, `galeria-do-imovel.tsx`, `tema-da-loja-provider.tsx`).

## Cache e revalidação (AD-042)

Toda leitura de uma loja (loja, lista, imóvel) usa `'use cache: remote'` com o perfil `vitrine` (`stale` 60 s, `revalidate` 60 s, `expire` 300 s) e a tag `tenant:<slug>:catalogo`; revalidar a loja derruba as três. O CRM avisa depois de cada escrita relevante. Sem aviso, a mudança aparece em até 5 minutos. A conexão da app é criada no primeiro uso, com `max: 3`.

Por que `remote` (AD-048): as leituras acontecem no pedido, e o `use cache` comum guarda em memória da instância, que no serverless da Vercel não sobrevive entre invocações (cada visita consultava o banco). Com `remote`, a Vercel guarda no Runtime Cache dela, compartilhado entre instâncias e expirado pelo `revalidateTag`; não há `cacheHandlers` a configurar. No `next start` local o `remote` usa o mesmo cache em memória do processo. O `vitrine:e2e` prova o mecanismo numa instância com os handlers de uma plataforma serverless simulados (`scripts/vitrine-e2e-plataforma.cjs`); a retenção no Runtime Cache real só se confere em produção, contando as sessões do papel `krivo_vitrine` em `pg_stat_activity`.

## Tema (AD-046)

`TemaDaLoja` monta o `<Theme mode="light">` da loja e emite no HTML do servidor os dois `<style>` de `generateThemeCSS`, para a cor e a fonte da loja já estarem na primeira resposta. O `--color-accent` é o derivado pela Astryx, não o hex digitado: cores sem croma mudam de matiz (cinza vira verde, preto vira rosa). O cartão de compartilhamento usa o hex literal. As quatro fontes vêm de `next/font/google` em `src/tema/fontes.ts`, fora do módulo puro do tema porque `next/font` não carrega fora do compilador do Next.

## Testes

| Camada | Onde | Como |
| --- | --- | --- |
| Lógica pura (paginação, contato, apresentação, tema, cor, revalidação) | `src/**/__tests__` | `npx vitest run vitrine/src/<arquivo>` |
| Cache, conexão e rota de revalidação | `src/dados/__tests__`, `src/db/__tests__`, `app/api/revalidar/__tests__` | `npx vitest run <arquivo>` |
| Rotas, isolamento, cache, PII e `og:*` por HTTP | `scripts/vitrine-e2e.ts` | `npm run vitrine:e2e` |

Trabalho visual exige captura real pela extensão do Chrome com a aba visível: o React 19.2 revela o Suspense por `requestAnimationFrame`, e em aba oculta o conteúdo fica no fallback. As de 375 px usam a página real num quadro de 375 px.

## Deploy

Segundo projeto da Vercel (`vitrine`), com Root Directory `vitrine`, ativado no lote 16c (2026-10-18); domínio público `vitrine-kappa-tawny.vercel.app`. O schema `vitrine`, as views e o papel `krivo_vitrine` existem em produção (ordem em `scripts/vitrine/README.md`) e as três variáveis acima ficam **no projeto `vitrine`** (o CRM só precisa de `VITRINE_PUBLIC_URL` e `VITRINE_REVALIDATE_SECRET`; `VITRINE_DATABASE_URL` não vai para o CRM).

**Configuração do projeto na Vercel que o build exige:** deixar **desligada** a opção "Include source files outside of the Root Directory in the Build Step" (Settings → Build and Deployment → Root Directory). Ligada, o builder define `outputFileTracingRoot` como a raiz do repositório, o Next passa a usar essa raiz também no Turbopack e compila o `proxy.ts` do CRM (`Can't resolve 'better-auth/cookies'`). Não fixe `outputFileTracingRoot` em `next.config.ts`: o deploy resolve os arquivos das funções a partir de `/vercel/path0` e falha com `ENOENT` em `.next/package.json` (registro no `validation.md` do L16c, T7).

O alias `*-arthur1050s-projects.vercel.app` do projeto fica atrás da Vercel Authentication; o visitante e o crawler do WhatsApp usam o domínio público. Mudar uma variável exige novo deployment (Redeploy) para valer.

**Ignored Build Step (`vercel.json` desta pasta):** o build da vitrine só roda se algo dentro de `vitrine/` mudou desde o último deployment pronto (`git diff --quiet $VERCEL_GIT_PREVIOUS_SHA HEAD ./`; sem esse SHA, ou se o `git diff` falhar, o build roda). Commits só de documentação ou do CRM não reimplantam a vitrine, porque ela não importa nada de fora de `vitrine/` (AD-041). Para forçar um build sem mudança na pasta, use Redeploy no painel.

## Decisões

AD-025 (projeto separado, leitura pura), AD-040 (fronteira por views e papel), AD-041 (pasta `vitrine/` e contrato espelhado), AD-042 (ponte de revalidação e perfil de cache), AD-043 (URLs, `noindex` e fotos externas), AD-044 (testes que cruzam a fronteira), AD-046 (tema no HTML do servidor). Texto completo em `.specs/STATE.md`.
