-- Migração pontual da marca. Execute com o dono do banco antes de instalar a
-- versão Krivo. Preserva IDs, senha, vínculos, privilégios e dados operacionais.
-- As grafias antigas aparecem somente como origem da migração.
begin;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'crivo_vitrine') then
    if exists (select 1 from pg_roles where rolname = 'krivo_vitrine') then
      raise exception 'Os papéis de origem e destino coexistem. Confira as conexões antes da migração.';
    end if;
    alter role crivo_vitrine rename to krivo_vitrine;
  end if;

  if exists (select 1 from public.tenants where slug = 'crivo-demo')
    and exists (select 1 from public.tenants where slug = 'krivo-demo') then
    raise exception 'Os tenants de demonstração de origem e destino coexistem. Confira os dados antes da migração.';
  end if;
end
$$;

update public.users
set email = replace(email, '@crivo.com.br', '@krivo.com.br')
where email like '%@crivo.com.br'
  and id in (
    select m.user_id
    from public.tenant_members m
    join public.tenants t on t.id = m.organization_id
    where t.slug = 'crivo-demo'
  );

update public.tenants
set slug = 'krivo-demo',
    name = case when name = 'Crivo Demo' then 'Krivo Demo' else name end,
    website = case when website = 'https://crivo.com.br' then 'https://krivo.com.br' else website end,
    agent_presentation_message = replace(agent_presentation_message, 'Crivo Demo', 'Krivo Demo')
where slug = 'crivo-demo';

update public.tenants
set logo = replace(
  replace(
    replace(logo,
      'crivo_white_symbol_and_tipography_horizontal.png',
      'krivo_white_symbol_and_tipography_horizontal.svg'),
    'crivo_white_symbol_and_tipography_vertical.png',
    'krivo_white_symbol_and_tipography_vertical.svg'),
  'crivo_white_symbol.png', 'krivo_white_symbol.png')
where logo like '%crivo_white_symbol%';

commit;
