-- SQL da vitrine pública (lote-16a — AD-040, VBANCO-01 a VBANCO-03).
--
-- Idempotente: pode rodar quantas vezes for preciso sobre o mesmo banco. A
-- ordem obrigatória em qualquer banco é derrubar o schema `vitrine` -> aplicar
-- o schema Drizzle (`drizzle-kit push`) -> aplicar este arquivo; ver
-- `scripts/vitrine/README.md`. Este arquivo NÃO derruba nada: quem derruba é
-- `dropVitrineSchema` (`scripts/vitrine/apply.ts`).
--
-- Nenhuma credencial, URL ou senha vive aqui.

-- ---------------------------------------------------------------------------
-- 1. Checks de `tenant_storefronts`
--
-- O `drizzle-kit push` já saiu com 0 deixando check sem aplicar (L-068).
-- Cada check só é adicionado se ainda não existe em `pg_constraint`; a
-- definição é a mesma de `src/db/schema.ts`.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tenant_storefronts'::regclass
      and conname = 'tenant_storefronts_accent_color_check'
  ) then
    alter table public.tenant_storefronts
      add constraint tenant_storefronts_accent_color_check
      check (accent_color is null or accent_color ~ '^#[0-9a-f]{6}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tenant_storefronts'::regclass
      and conname = 'tenant_storefronts_active_requires_identity_check'
  ) then
    alter table public.tenant_storefronts
      add constraint tenant_storefronts_active_requires_identity_check
      check (
        not active
        or (nullif(trim(creci), '') is not null and nullif(trim(legal_name), '') is not null)
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Schema e views
--
-- As views são a fronteira pública: aplicam o corte de visibilidade e expõem
-- só colunas públicas. `security_barrier` impede que um predicado do chamador
-- seja avaliado antes do filtro da view.
-- ---------------------------------------------------------------------------
create schema if not exists vitrine;

-- Lojas visíveis: vitrine ativa, CRECI e razão social preenchidos e WhatsApp do
-- agente preenchido (sem WhatsApp não existe o botão de interesse).
create or replace view vitrine.lojas with (security_barrier = true) as
select
  t.slug,
  t.name as nome,
  t.logo,
  t.agent_whatsapp as whatsapp,
  t.city as cidade,
  t.state as uf,
  s.layout,
  s.accent_color as cor,
  s.font as fonte,
  s.creci,
  s.legal_name as razao_social,
  s.headline as titulo,
  s.about as sobre,
  s.instagram,
  s.phone as telefone,
  s.address as endereco,
  s.updated_at as atualizado_em
from public.tenants t
join public.tenant_storefronts s on s.tenant_id = t.id
where s.active
  and nullif(trim(s.creci), '') is not null
  and nullif(trim(s.legal_name), '') is not null
  and nullif(trim(t.agent_whatsapp), '') is not null;

-- Imóveis visíveis de lojas visíveis: `disponivel` E publicado. Fora de
-- propósito: ids, tenant_id, logradouro, número, complemento, captador, status,
-- publicação, sequência e as colunas normalizadas.
create or replace view vitrine.imoveis with (security_barrier = true) as
select
  l.slug as loja_slug,
  p.reference as referencia,
  p.kind as tipo,
  p.modality as modalidade,
  p.neighborhood as bairro,
  p.city as cidade,
  p.state as uf,
  p.price_cents as preco_centavos,
  p.area_sqm as area_m2,
  p.bedrooms as quartos,
  p.bathrooms as banheiros,
  p.parking_spots as vagas,
  p.description as descricao,
  p.photo_urls as fotos,
  p.featured as destaque,
  p.updated_at as atualizado_em
from public.properties p
join public.tenants t on t.id = p.tenant_id
join vitrine.lojas l on l.slug = t.slug
where p.status = 'disponivel' and p.published;
