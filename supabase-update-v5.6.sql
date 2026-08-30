-- الراية للعطور V5.6 — ترقية آمنة لقاعدة بيانات موجودة
-- لا تحذف المنتجات أو المبيعات أو الحسابات.

-- إصلاح العمود المطلوب للصور في حال كانت القاعدة قديمة.
alter table public.products add column if not exists photo_path text default '';

-- جدول الحسابات. إذا كان غير موجود يتم إنشاؤه بدون التأثير على Auth.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'مستخدم',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists display_name text;
update public.profiles
set display_name = coalesce(nullif(display_name,''),'مستخدم')
where display_name is null or display_name='';
alter table public.profiles alter column display_name set default 'مستخدم';
alter table public.profiles alter column display_name set not null;

-- تأكيد صلاحية المستخدم لتعديل ملفه الشخصي فقط.
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

-- إعادة تحميل مخطط PostgREST حتى يختفي خطأ photo_path من Schema Cache.
notify pgrst, 'reload schema';
