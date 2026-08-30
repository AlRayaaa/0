-- الراية للعطور — تحديث خلطات العطور: أسماء العطور تُكتب يدوياً
-- شغّل هذا الملف مرة واحدة بعد تحديث المشروع.

create table if not exists public.mixes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender text not null check (gender in ('رجالي','نسائي','كلا الجنسين')),
  photo text default '',
  photo_path text default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mix_items (
  id uuid primary key default gen_random_uuid(),
  mix_id uuid not null references public.mixes(id) on delete cascade,
  product_id uuid null references public.products(id) on delete set null,
  perfume_name text,
  position integer not null check (position between 1 and 10),
  unique (mix_id, position)
);

alter table public.mix_items add column if not exists perfume_name text;

-- تحويل الخلطات القديمة من ربط الأصناف إلى أسماء العطور.
update public.mix_items mi
set perfume_name = p.name
from public.products p
where mi.product_id = p.id and nullif(trim(mi.perfume_name),'') is null;

alter table public.mix_items alter column perfume_name set not null;

create or replace function public.save_mixture(
  p_id uuid, p_name text, p_gender text, p_photo text, p_perfume_names text[]
) returns uuid
language plpgsql security invoker set search_path=public as $$
declare v_id uuid; v_count integer; v_name text; i integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'INVALID_NAME'; end if;
  if p_gender not in ('رجالي','نسائي','كلا الجنسين') then raise exception 'INVALID_GENDER'; end if;
  if p_perfume_names is null then raise exception 'INVALID_PERFUMES'; end if;
  select count(*) into v_count from unnest(p_perfume_names) as x where nullif(trim(x),'') is not null;
  if v_count < 2 or v_count > 10 then raise exception 'MIX_MUST_HAVE_2_TO_10'; end if;
  for v_name in select trim(x) from unnest(p_perfume_names) as x where nullif(trim(x),'') is not null loop
    if exists (select 1 from public.mix_items where mix_id=coalesce(p_id, '00000000-0000-0000-0000-000000000000'::uuid) and lower(trim(perfume_name))=lower(v_name)) then
      raise exception 'DUPLICATE_PERFUME_NAME';
    end if;
  end loop;

  if p_id is null then
    insert into public.mixes(name,gender,photo,created_by) values(trim(p_name),p_gender,coalesce(p_photo,''),auth.uid()) returning id into v_id;
  else
    v_id:=p_id;
    update public.mixes set name=trim(p_name),gender=p_gender,photo=coalesce(p_photo,''),updated_at=now() where id=v_id;
    if not found then raise exception 'MIX_NOT_FOUND'; end if;
    delete from public.mix_items where mix_id=v_id;
  end if;

  i:=0;
  for v_name in select trim(x) from unnest(p_perfume_names) as x where nullif(trim(x),'') is not null loop
    i:=i+1;
    insert into public.mix_items(mix_id,perfume_name,position) values(v_id,v_name,i);
  end loop;
  return v_id;
end;
$$;

grant execute on function public.save_mixture(uuid,text,text,text,text[]) to authenticated;

alter table public.mixes enable row level security;
alter table public.mix_items enable row level security;
drop policy if exists mixes_all on public.mixes;
create policy mixes_all on public.mixes for all to authenticated using (true) with check (true);
drop policy if exists mix_items_all on public.mix_items;
create policy mix_items_all on public.mix_items for all to authenticated using (true) with check (true);

drop trigger if exists mixes_activity on public.mixes;
create trigger mixes_activity after insert or update or delete on public.mixes for each row execute procedure public.log_activity();

do $$ begin alter publication supabase_realtime add table public.mixes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.mix_items; exception when duplicate_object then null; end $$;
notify pgrst, 'reload schema';
