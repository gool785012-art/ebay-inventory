-- ============================================================
-- eBay外注管理ツール 写真の削除を可能にする設定SQL
-- SupabaseのSQL Editorにこのファイル全体を貼り付けて「Run」してください。
--
-- 管理者はもともと product_photos / Storage とも "for all" ポリシーがあるため
-- 追加設定なしで削除できます。
-- このSQLは「スタッフが自分の担当商品の写真を削除できる」ようにするものです。
-- 管理者だけが削除できれば良い場合、このSQLの実行は不要です。
-- ============================================================

-- DB: スタッフは自分の担当商品の写真行を削除できる
drop policy if exists "photos_staff_delete" on public.product_photos;
create policy "photos_staff_delete" on public.product_photos
  for delete using (public.is_assigned(product_id));

-- Storage: スタッフは自分の担当商品フォルダ配下の実ファイルを削除できる
-- 保存パスの決まり: {商品ID}/{写真カテゴリー}/{ファイル名}
drop policy if exists "storage_photos_staff_delete" on storage.objects;
create policy "storage_photos_staff_delete" on storage.objects
  for delete
  using (
    bucket_id = 'product-photos'
    and public.is_assigned(((storage.foldername(name))[1])::uuid)
  );
