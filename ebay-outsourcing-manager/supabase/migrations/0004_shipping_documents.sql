-- ============================================================
-- eBay外注管理ツール 発送ラベル共有SQL（Phase 6）
-- SupabaseのSQL Editorにこのファイル全体を貼り付けて「Run」してください。
-- 発送書類テーブル・専用の保存領域・アクセス制御・操作履歴が作成されます。
-- ============================================================

-- ─── 1. 商品に発送方法（任意項目）を追加 ─────────────────────────
alter table public.products
  add column if not exists shipping_method text not null default '';

-- ─── 2. 写真カテゴリーに「発送ラベル貼付後」を追加 ─────────────────
alter table public.product_photos
  drop constraint product_photos_photo_category_check;
alter table public.product_photos
  add constraint product_photos_photo_category_check check (photo_category in (
    'outer_box', 'item', 'accessory', 'serial',
    'before_packing', 'packing', 'packed', 'label', 'label_attached', 'other'
  ));

-- ─── 3. 発送書類テーブル ─────────────────────────────────────
-- ラベル・インボイス・税関書類などを商品ごとに複数登録できる。
-- shared_at が入るまでスタッフには一切見えない（=共有ボタンを押すまで非公開）。
create table public.shipping_documents (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  document_type text not null check (document_type in (
    'label',              -- 発送ラベル
    'commercial_invoice', -- Commercial Invoice
    'customs_form',       -- 税関申告書
    'postal_form',        -- 国際郵便書類
    'signature_doc',      -- 署名書類
    'other'               -- その他
  )),
  file_name text not null,
  file_path text not null,
  uploaded_by uuid references public.profiles (id),
  shared_at timestamptz,               -- スタッフへ共有した日時（null = 未共有）
  confirmed_at timestamptz,            -- スタッフが確認した日時
  confirmed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shipping_documents_product_idx on public.shipping_documents (product_id);

create trigger shipping_documents_touch_updated_at
  before update on public.shipping_documents
  for each row execute function public.touch_updated_at();

-- スタッフが変更できるのは「確認済みにする」操作だけ（他の列はデータベースが拒否）
create or replace function public.enforce_staff_shipdoc_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.product_id    is distinct from old.product_id
  or new.document_type is distinct from old.document_type
  or new.file_name     is distinct from old.file_name
  or new.file_path     is distinct from old.file_path
  or new.uploaded_by   is distinct from old.uploaded_by
  or new.shared_at     is distinct from old.shared_at
  then
    raise exception 'スタッフのアカウントでは確認操作のみ可能です';
  end if;
  if old.shared_at is null then
    raise exception '共有前の書類は操作できません';
  end if;
  return new;
end;
$$;

create trigger shipping_documents_enforce_staff_update
  before update on public.shipping_documents
  for each row execute function public.enforce_staff_shipdoc_update();

-- ─── 4. 操作履歴（work_logsへ自動記録） ───────────────────────
create or replace function public.log_shipping_doc_changes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.product_id, auth.uid(), 'shipdoc_uploaded', new.document_type, '', new.file_name);
    return new;
  end if;
  if tg_op = 'DELETE' then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (old.product_id, auth.uid(), 'shipdoc_deleted', old.document_type, old.file_name, '');
    return old;
  end if;
  if new.shared_at is not null and old.shared_at is null then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.product_id, auth.uid(), 'shipdoc_shared', new.document_type, '', new.file_name);
  end if;
  if new.confirmed_at is not null and old.confirmed_at is null then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.product_id, auth.uid(), 'shipdoc_confirmed', new.document_type, '', new.file_name);
  end if;
  if new.file_path is distinct from old.file_path then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.product_id, auth.uid(), 'shipdoc_replaced', new.document_type, old.file_name, new.file_name);
  end if;
  return new;
end;
$$;

create trigger shipping_documents_log
  after insert or update or delete on public.shipping_documents
  for each row execute function public.log_shipping_doc_changes();

-- ─── 5. アクセス制御（RLS） ──────────────────────────────────
-- 管理者: すべて閲覧・追加・変更・削除可能
-- スタッフ: 自分の担当商品の「共有済み」書類のみ閲覧、確認操作のみ可能
-- その他: アクセス不可
alter table public.shipping_documents enable row level security;

create policy "shipdocs_admin_all" on public.shipping_documents
  for all using (public.is_admin()) with check (public.is_admin());

create policy "shipdocs_staff_select" on public.shipping_documents
  for select using (shared_at is not null and public.is_assigned(product_id));

create policy "shipdocs_staff_confirm" on public.shipping_documents
  for update using (shared_at is not null and public.is_assigned(product_id))
  with check (public.is_assigned(product_id));

-- ─── 6. ファイル保存領域（非公開バケット） ──────────────────────
-- 発送ラベルにはバイヤーの個人情報が含まれるため、必ず非公開。
-- 閲覧は有効期限付きURL（Signed URL）のみ。
insert into storage.buckets (id, name, public)
values ('shipping-documents', 'shipping-documents', false)
on conflict (id) do nothing;

-- 「このファイルはこのスタッフが見てよいか」判定
-- （共有済み かつ 自分の担当商品 の場合のみ true）
create or replace function public.can_view_shipping_doc(p_path text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.shipping_documents d
    join public.products p on p.id = d.product_id
    where d.file_path = p_path
      and d.shared_at is not null
      and p.assigned_staff_id = auth.uid()
  );
$$;

-- 管理者: すべての発送書類ファイルを操作可能
create policy "storage_shipdocs_admin_all" on storage.objects
  for all
  using (bucket_id = 'shipping-documents' and public.is_admin())
  with check (bucket_id = 'shipping-documents' and public.is_admin());

-- スタッフ: 共有済み かつ 担当商品 のファイルのみ閲覧可能（アップロード・削除は不可）
create policy "storage_shipdocs_staff_read" on storage.objects
  for select
  using (
    bucket_id = 'shipping-documents'
    and public.can_view_shipping_doc(name)
  );
