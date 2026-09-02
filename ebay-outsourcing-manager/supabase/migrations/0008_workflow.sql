-- ============================================================
-- eBay外注管理ツール 作業標準化SQL（Phase 11）
-- SupabaseのSQL Editorにこのファイル全体を貼り付けて「Run」してください。
-- 発送方法別の作業指示・動作確認テンプレート・マニュアル管理・月次精算が使えるようになります。
-- ============================================================

-- ─── 1. 発送会社に西濃を追加 ────────────────────────────────
insert into public.carriers (name, sort_order) values ('西濃運輸', 6)
on conflict (name) do nothing;

-- ─── 2. 動作確認テンプレート ────────────────────────────────
-- カテゴリーごとの確認項目。管理画面から追加・削除・並べ替えできる構造。
create table public.inspection_templates (
  id bigint generated always as identity primary key,
  name text not null,
  category_id bigint references public.categories (id) on delete cascade,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inspection_items (
  id bigint generated always as identity primary key,
  template_id bigint not null references public.inspection_templates (id) on delete cascade,
  label text not null,
  required boolean not null default false,
  sort_order integer not null default 0
);

create index inspection_items_template_idx on public.inspection_items (template_id);

-- スタッフが入力する確認結果（項目ごとのチェック）
create table public.product_inspections (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  item_id bigint not null references public.inspection_items (id) on delete cascade,
  checked boolean not null default false,
  note text not null default '',
  checked_by uuid references public.profiles (id),
  checked_at timestamptz,
  unique (product_id, item_id)
);

create index product_inspections_product_idx on public.product_inspections (product_id);

-- ─── 3. マニュアル管理の拡張 ────────────────────────────────
-- 既存の manuals テーブルに、対象カテゴリー・対象発送会社・PDFを追加。
alter table public.manuals
  add column if not exists category_id bigint references public.categories (id) on delete set null,
  add column if not exists carrier_id bigint references public.carriers (id) on delete set null,
  add column if not exists description text not null default '',
  add column if not exists file_path text not null default '',
  add column if not exists file_name text not null default '',
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now();

-- マニュアルPDFの保存領域（ログインユーザーなら誰でも閲覧可）
insert into storage.buckets (id, name, public)
values ('manuals', 'manuals', false)
on conflict (id) do nothing;

create policy "storage_manuals_read" on storage.objects
  for select using (bucket_id = 'manuals' and auth.uid() is not null);

create policy "storage_manuals_admin_write" on storage.objects
  for all
  using (bucket_id = 'manuals' and public.is_admin())
  with check (bucket_id = 'manuals' and public.is_admin());

-- ─── 4. 作業ステータス（案件の進み具合） ────────────────────────
-- 既存の商品ステータス（未発送〜発送済み）とは別に、
-- 「今どの段階か」を分かりやすく表す作業ステータスを持たせる。
alter table public.products
  add column if not exists work_status text not null default 'not_started'
    check (work_status in (
      'not_started',   -- 未着手
      'in_progress',   -- 作業中
      'needs_review',  -- 要確認
      'ready_to_ship', -- 発送待ち
      'shipped'        -- 発送完了
    )),
  add column if not exists needs_review_reason text not null default '';

-- 既存データの作業ステータスを、今の商品ステータスから推定して埋める
update public.products set work_status = case
  when status = 'shipped' then 'shipped'
  when status = 'problem' then 'needs_review'
  when status in ('packed', 'ready_to_ship') then 'ready_to_ship'
  when status in ('pre_shipment', 'sent_to_staff') then 'not_started'
  else 'in_progress'
end;

-- 商品ステータスや動作確認の変化に合わせて作業ステータスを自動更新
create or replace function public.sync_work_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_photo_missing boolean := false;
begin
  -- 必須写真の不足を判定
  if new.photo_required then
    select not exists (
      select 1 from public.product_photos
      where product_id = new.id and photo_category = 'condition'
    ) into v_photo_missing;
  end if;

  if new.status = 'shipped' then
    new.work_status := 'shipped';
    new.needs_review_reason := '';
  elsif new.operation_check_result = 'problem' or new.has_problem then
    new.work_status := 'needs_review';
    if new.needs_review_reason = '' then
      new.needs_review_reason := case
        when new.operation_check_result = 'problem' then '動作確認で問題あり'
        else '問題が報告されています'
      end;
    end if;
  elsif v_photo_missing and new.status in ('packed', 'ready_to_ship') then
    new.work_status := 'needs_review';
    new.needs_review_reason := '商品状態の写真が未アップロード';
  elsif new.operation_check_required and new.operation_check_result is null
        and new.status in ('packed', 'ready_to_ship') then
    new.work_status := 'needs_review';
    new.needs_review_reason := '動作確認の結果が未入力';
  elsif new.status in ('packed', 'ready_to_ship') then
    new.work_status := 'ready_to_ship';
    new.needs_review_reason := '';
  elsif new.status in ('pre_shipment', 'sent_to_staff') then
    new.work_status := 'not_started';
    new.needs_review_reason := '';
  else
    new.work_status := 'in_progress';
    new.needs_review_reason := '';
  end if;
  return new;
end;
$$;

create trigger products_sync_work_status
  before insert or update on public.products
  for each row execute function public.sync_work_status();

-- ─── 5. 月次精算（スタッフ×対象月） ─────────────────────────
create table public.staff_settlements (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles (id) on delete cascade,
  month text not null,                       -- 'YYYY-MM'
  reward_total integer not null default 0,   -- 作業報酬合計
  expense_total integer not null default 0,  -- 立替金合計
  payment_total integer not null default 0,  -- 支払合計
  status text not null default 'unsettled'
    check (status in ('unsettled', 'scheduled', 'paid')),  -- 未精算/支払予定/支払済み
  paid_at date,
  paid_amount integer,
  payment_method text not null default '',
  note text not null default '',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, month)
);

create trigger staff_settlements_touch_updated_at
  before update on public.staff_settlements
  for each row execute function public.touch_updated_at();

-- ─── 6. アクセス制御（RLS） ──────────────────────────────────
alter table public.inspection_templates enable row level security;
alter table public.inspection_items enable row level security;
alter table public.product_inspections enable row level security;
alter table public.staff_settlements enable row level security;

-- テンプレートはログインユーザーなら閲覧可、編集は管理者のみ
create policy "templates_select" on public.inspection_templates
  for select using (auth.uid() is not null);
create policy "templates_admin_all" on public.inspection_templates
  for all using (public.is_admin()) with check (public.is_admin());

create policy "items_select" on public.inspection_items
  for select using (auth.uid() is not null);
create policy "items_admin_all" on public.inspection_items
  for all using (public.is_admin()) with check (public.is_admin());

-- 確認結果は管理者は全件、スタッフは自分の担当商品のみ
create policy "inspections_admin_all" on public.product_inspections
  for all using (public.is_admin()) with check (public.is_admin());
create policy "inspections_staff_select" on public.product_inspections
  for select using (public.is_assigned(product_id));
create policy "inspections_staff_insert" on public.product_inspections
  for insert with check (public.is_assigned(product_id));
create policy "inspections_staff_update" on public.product_inspections
  for update using (public.is_assigned(product_id))
  with check (public.is_assigned(product_id));

-- 精算書は管理者のみ作成・編集、スタッフは自分の分だけ閲覧可
create policy "settlements_admin_all" on public.staff_settlements
  for all using (public.is_admin()) with check (public.is_admin());
create policy "settlements_staff_select" on public.staff_settlements
  for select using (staff_id = auth.uid());

-- ─── 7. 動作確認テンプレートの初期データ ────────────────────────
do $$
declare
  v_template_id bigint;
  v_category_id bigint;
begin
  -- ゲーム機
  select id into v_category_id from public.categories where name = 'Game Console';
  insert into public.inspection_templates (name, category_id, sort_order)
  values ('ゲーム機 動作確認', v_category_id, 1) returning id into v_template_id;
  insert into public.inspection_items (template_id, label, required, sort_order) values
    (v_template_id, '外観', true, 1),
    (v_template_id, '電源ON', true, 2),
    (v_template_id, '映像出力（据置機）', false, 3),
    (v_template_id, 'コントローラー / ボタン操作', true, 4),
    (v_template_id, 'ゲーム・ディスク・ソフト認識', true, 5),
    (v_template_id, '音声', true, 6),
    (v_template_id, 'メニュー操作', false, 7),
    (v_template_id, 'フリーズの有無', false, 8),
    (v_template_id, '異音', false, 9),
    (v_template_id, '異常発熱', false, 10),
    (v_template_id, '画面の黄ばみ（携帯ゲーム機）', false, 11),
    (v_template_id, '上下画面表示（Nintendo DS系）', false, 12);

  -- カメラ
  select id into v_category_id from public.categories where name = 'Camera';
  insert into public.inspection_templates (name, category_id, sort_order)
  values ('カメラ 動作確認', v_category_id, 2) returning id into v_template_id;
  insert into public.inspection_items (template_id, label, required, sort_order) values
    (v_template_id, '電源', true, 1),
    (v_template_id, 'シャッター', true, 2),
    (v_template_id, '液晶', true, 3),
    (v_template_id, 'ボタン操作', true, 4),
    (v_template_id, 'AF', true, 5),
    (v_template_id, 'フラッシュ（搭載機）', false, 6),
    (v_template_id, 'SDカード認識', false, 7),
    (v_template_id, 'エラー表示', false, 8),
    (v_template_id, '外観', true, 9);

  -- レンズ
  select id into v_category_id from public.categories where name = 'Lens';
  insert into public.inspection_templates (name, category_id, sort_order)
  values ('レンズ 動作確認', v_category_id, 3) returning id into v_template_id;
  insert into public.inspection_items (template_id, label, required, sort_order) values
    (v_template_id, '外観', true, 1),
    (v_template_id, 'AF', true, 2),
    (v_template_id, 'MF', true, 3),
    (v_template_id, '絞り', true, 4),
    (v_template_id, 'ズーム', false, 5),
    (v_template_id, 'フォーカスリング', true, 6),
    (v_template_id, 'カビ', false, 7),
    (v_template_id, '曇り', false, 8),
    (v_template_id, '傷', false, 9),
    (v_template_id, 'バルサム切れ等', false, 10);

  -- ターンテーブル
  select id into v_category_id from public.categories where name = 'Turntable';
  insert into public.inspection_templates (name, category_id, sort_order)
  values ('ターンテーブル 動作確認', v_category_id, 4) returning id into v_template_id;
  insert into public.inspection_items (template_id, label, required, sort_order) values
    (v_template_id, '電源', true, 1),
    (v_template_id, 'START / STOP', true, 2),
    (v_template_id, '33回転', true, 3),
    (v_template_id, '45回転', true, 4),
    (v_template_id, '回転安定', true, 5),
    (v_template_id, 'ピッチ', false, 6),
    (v_template_id, 'ライト', false, 7),
    (v_template_id, 'トーンアーム', true, 8),
    (v_template_id, '各ボタン', false, 9),
    (v_template_id, '異音', false, 10),
    (v_template_id, '外観', true, 11);
end $$;
