-- ============================================================
-- eBay外注管理ツール 写真保存（Storage）設定SQL（Phase 3）
-- SupabaseのSQL Editorにこのファイル全体を貼り付けて「Run」してください。
-- 非公開の写真保存領域と、そのアクセス権限が作成されます。
-- ============================================================

-- 写真保存用バケット（非公開: URLを知っていても権限がなければ見られない）
insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', false)
on conflict (id) do nothing;

-- 保存パスの決まり: {商品ID}/{写真カテゴリー}/{ファイル名}
-- 先頭フォルダ名 = 商品ID なので、担当商品かどうかをパスから判定できる

-- 管理者: すべての写真を閲覧・追加・削除可能
create policy "storage_photos_admin_all" on storage.objects
  for all
  using (bucket_id = 'product-photos' and public.is_admin())
  with check (bucket_id = 'product-photos' and public.is_admin());

-- スタッフ: 自分の担当商品の写真のみ閲覧可能
create policy "storage_photos_staff_read" on storage.objects
  for select
  using (
    bucket_id = 'product-photos'
    and public.is_assigned(((storage.foldername(name))[1])::uuid)
  );

-- スタッフ: 自分の担当商品にのみ写真を追加可能
create policy "storage_photos_staff_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'product-photos'
    and public.is_assigned(((storage.foldername(name))[1])::uuid)
  );
