# إصلاح حذف المستخدمين

أضفنا `supabase-fix-user-delete.sql` لإصلاح خطأ:
`Failed to delete user: Database error deleting user`

## مهم
بعد رفع المشروع، افتح Supabase > SQL Editor > New query، والصق محتوى:
`supabase-fix-user-delete.sql`
ثم اضغط Run مرة واحدة.

هذا الإصلاح:
- يحذف حساب المستخدم من Authentication بشكل طبيعي.
- يحذف ملفه من `profiles` تلقائيًا.
- لا يحذف المنتجات أو المبيعات أو المشتريات أو الديون أو النقوص أو الخلطات التي أضافها.
- يحافظ على السجل، ويحوّل `created_by` / `user_id` إلى NULL عند حذف الحساب.

## التحقق
في نهاية الملف توجد استعلامات تعرض العلاقات مع `auth.users`. العلاقات الاختيارية يجب أن تظهر `SET NULL`، و`profiles.id` يجب أن يظهر `CASCADE`.
