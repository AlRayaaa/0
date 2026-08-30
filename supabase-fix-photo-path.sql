-- إصلاح خطأ: Could not find the 'photo_path' column of 'products'
-- شغّل هذا الملف مرة واحدة داخل Supabase > SQL Editor.
alter table public.products add column if not exists photo_path text default '';
notify pgrst, 'reload schema';
