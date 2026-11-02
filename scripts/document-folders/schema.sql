-- L17 — Pastas de documentos (AD-051). Idempotente: pode rodar mais de uma vez.
begin;

create table if not exists "document_folders" (
  "id" uuid primary key default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "name" text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table "documents" add column if not exists "folder_id" uuid;
alter table "document_upload_intents" add column if not exists "folder_id" uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'document_folders_tenant_id_tenants_id_fk') then
    alter table "document_folders" add constraint "document_folders_tenant_id_tenants_id_fk"
      foreign key ("tenant_id") references "public"."tenants"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_folder_id_document_folders_id_fk') then
    alter table "documents" add constraint "documents_folder_id_document_folders_id_fk"
      foreign key ("folder_id") references "public"."document_folders"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'document_upload_intents_folder_id_document_folders_id_fk') then
    alter table "document_upload_intents" add constraint "document_upload_intents_folder_id_document_folders_id_fk"
      foreign key ("folder_id") references "public"."document_folders"("id") on delete set null on update no action;
  end if;
end $$;

create unique index if not exists "document_folders_tenant_id_lower_name_idx"
  on "document_folders" using btree ("tenant_id", lower("name"));
create index if not exists "documents_tenant_folder_idx"
  on "documents" using btree ("tenant_id", "folder_id");

commit;
