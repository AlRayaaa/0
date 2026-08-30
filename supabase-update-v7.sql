-- الراية للعطور — ترقية v7: النقوصات والديون
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.
create table if not exists public.shortages (
 id uuid primary key default gen_random_uuid(), name text not null, qty numeric not null default 1, priority text not null default 'normal', note text default '', photo text default '', purchased boolean not null default false, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.debts (
 id uuid primary key default gen_random_uuid(), person text not null, phone text default '', amount numeric not null default 0, paid numeric not null default 0, note text default '', created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.shortages enable row level security; alter table public.debts enable row level security;
drop policy if exists shortages_all on public.shortages; create policy shortages_all on public.shortages for all to authenticated using (true) with check (true);
drop policy if exists debts_all on public.debts; create policy debts_all on public.debts for all to authenticated using (true) with check (true);
do $$ begin alter publication supabase_realtime add table public.shortages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.debts; exception when duplicate_object then null; end $$;
notify pgrst, 'reload schema';

-- دعم صورة اختيارية للنقوصات
alter table public.shortages add column if not exists photo text default '';
notify pgrst, 'reload schema';
