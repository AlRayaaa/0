-- إصلاح حذف المستخدمين من Supabase
-- هذا الملف يجعل العلاقات الاختيارية مع auth.users تستخدم ON DELETE SET NULL.
-- النتيجة: حذف الحساب لا يحذف المنتجات/المبيعات/المشتريات/الديون/النقوص/الخلطات؛ فقط تُفرغ هوية المنشئ (created_by/user_id).
-- profiles.id يبقى ON DELETE CASCADE حتى يُحذف ملف الحساب تلقائيًا مع المستخدم.

DO $$
DECLARE
  r record;
  col_nullable boolean;
  col_name text;
BEGIN
  FOR r IN
    SELECT
      c.oid AS constraint_oid,
      n.nspname AS table_schema,
      cls.relname AS table_name,
      c.conname AS constraint_name,
      a.attname AS column_name,
      c.confdeltype AS delete_action
    FROM pg_constraint c
    JOIN pg_class cls ON cls.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    JOIN pg_class refcls ON refcls.oid = c.confrelid
    JOIN pg_namespace refn ON refn.oid = refcls.relnamespace
    JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = cls.oid AND a.attnum = k.attnum
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND refn.nspname = 'auth'
      AND refcls.relname = 'users'
      AND array_length(c.conkey, 1) = 1
      AND a.attnotnull = false
  LOOP
    -- إذا كانت العلاقة أصلًا SET NULL فلا حاجة لتغييرها.
    IF r.delete_action <> 'n' THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', r.table_schema, r.table_name, r.constraint_name);
      EXECUTE format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL',
        r.table_schema, r.table_name, r.constraint_name, r.column_name
      );
    END IF;
  END LOOP;
END $$;

-- التأكد من أن profiles يحذف صف الحساب تلقائيًا عند حذف auth.users.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='profiles'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- تحقق سريع من العلاقات المتبقية.
SELECT
  n.nspname AS table_schema,
  cls.relname AS table_name,
  c.conname AS constraint_name,
  a.attname AS column_name,
  CASE c.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete
FROM pg_constraint c
JOIN pg_class cls ON cls.oid = c.conrelid
JOIN pg_namespace n ON n.oid = cls.relnamespace
JOIN pg_class refcls ON refcls.oid = c.confrelid
JOIN pg_namespace refn ON refn.oid = refcls.relnamespace
JOIN LATERAL unnest(c.conkey) AS k(attnum) ON true
JOIN pg_attribute a ON a.attrelid = cls.oid AND a.attnum = k.attnum
WHERE c.contype='f'
  AND n.nspname='public'
  AND refn.nspname='auth'
  AND refcls.relname='users'
ORDER BY table_name, column_name;
