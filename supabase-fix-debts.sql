-- الراية للعطور — إنشاء/إصلاح جدول الديون في Supabase
-- شغّل هذا الملف مرة واحدة من Supabase > SQL Editor > Run

create extension if not exists pgcrypto;

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  person text not null,
  phone text default '',
  amount numeric not null default 0,
  paid numeric not null default 0,
  note text default '',
  photo text default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.debts add column if not exists phone text default '';
alter table public.debts add column if not exists amount numeric not null default 0;
alter table public.debts add column if not exists paid numeric not null default 0;
alter table public.debts add column if not exists note text default '';
alter table public.debts add column if not exists photo text default '';
alter table public.debts add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.debts add column if not exists created_at timestamptz not null default now();
alter table public.debts add column if not exists updated_at timestamptz not null default now();

alter table public.debts enable row level security;

drop policy if exists debts_all on public.debts;
create policy debts_all
on public.debts
for all
to authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.debts to authenticated;

grant usage, select on sequence public.debts_id_seq to authenticated;

notify pgrst, 'reload schema';
