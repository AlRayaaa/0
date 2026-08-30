-- إصلاح حفظ النقوصات في Supabase - شغّل هذا الملف مرة واحدة فقط
create extension if not exists pgcrypto;
create table if not exists public.shortages (
  id uuid primary key default gen_random_uuid(), name text not null,
  qty numeric not null default 1, priority text not null default 'normal',
  note text default '', photo text default '', purchased boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.shortages add column if not exists photo text default '';
alter table public.shortages add column if not exists priority text not null default 'normal';
alter table public.shortages add column if not exists note text default '';
alter table public.shortages add column if not exists purchased boolean not null default false;
alter table public.shortages add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.shortages add column if not exists created_at timestamptz not null default now();
alter table public.shortages add column if not exists updated_at timestamptz not null default now();
alter table public.shortages enable row level security;
drop policy if exists shortages_all on public.shortages;
create policy shortages_all on public.shortages for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.shortages to authenticated;
grant select on public.shortages to anon;
do $$ begin alter publication supabase_realtime add table public.shortages; exception when duplicate_object then null; end $$;
notify pgrst, 'reload schema';
