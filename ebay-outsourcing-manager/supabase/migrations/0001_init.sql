-- ============================================================
-- eBay外注管理ツール データベース構築SQL（Phase 1）
-- SupabaseのSQL Editorにこのファイル全体を貼り付けて「Run」してください。
-- テーブル・権限（RLS）・初期データがすべて作成されます。
-- ============================================================

-- ─── 1. ユーザープロフィール（管理者 + 外注スタッフ） ─────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  full_name text not null default '',
  email text,
  phone text,
  status text not null default 'active' check (status in ('active', 'paused', 'terminated')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- ログインユーザー作成時に自動でプロフィール行を作る
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 「今のユーザーは管理者か？」判定（RLSから安全に使うための関数）
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ─── 2. カテゴリー・発送会社 ─────────────────────────────────
create table public.categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  prefix text not null default '',            -- 管理番号の接頭辞（例: CAM）
  default_fee integer not null default 0,     -- 標準報酬（円）
  requires_turntable_checklist boolean not null default false,
  sort_order integer not null default 0
);

create table public.carriers (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort_order integer not null default 0
);

-- ─── 3. 商品 ────────────────────────────────────────────────
create table public.products (
  id uuid primary key default gen_random_uuid(),
  control_number text not null unique,        -- 管理番号（重複不可）
  name text not null,
  category_id bigint references public.categories (id),
  assigned_staff_id uuid references public.profiles (id),
  status text not null default 'pre_shipment' check (status in (
    'pre_shipment',    -- 未発送（仕入先）
    'sent_to_staff',   -- 外注先へ発送済み
    'arrived',         -- 商品到着
    'inspecting',      -- 検品中
    'inspected',       -- 検品完了
    'packing',         -- 梱包中
    'packed',          -- 梱包完了
    'ready_to_ship',   -- 発送待ち
    'shipped',         -- 発送済み
    'problem',         -- 問題あり
    'on_hold'          -- 保留
  )),
  arrival_date date,
  ship_deadline date,
  shipped_date date,
  carrier_id bigint references public.carriers (id),
  tracking_number text not null default '',
  weight_kg numeric(6, 2),
  length_cm numeric(6, 1),
  width_cm numeric(6, 1),
  height_cm numeric(6, 1),
  serial_number text not null default '',
  exterior_condition text not null default '',  -- 外観状態
  works_ok boolean,                             -- 動作確認OKか
  has_problem boolean not null default false,
  problem_note text not null default '',
  notes text not null default '',               -- 備考（管理者用）
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_assigned_staff_idx on public.products (assigned_staff_id);
create index products_status_idx on public.products (status);

-- 「この商品は今のユーザーの担当か？」判定
create or replace function public.is_assigned(p_product_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.products
    where id = p_product_id and assigned_staff_id = auth.uid()
  );
$$;

-- updated_at 自動更新
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- スタッフが変更してよい列をデータベース側で強制（管理者は制限なし）
create or replace function public.enforce_staff_product_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.control_number    is distinct from old.control_number
  or new.name              is distinct from old.name
  or new.category_id       is distinct from old.category_id
  or new.assigned_staff_id is distinct from old.assigned_staff_id
  or new.ship_deadline     is distinct from old.ship_deadline
  or new.notes             is distinct from old.notes
  or new.created_by        is distinct from old.created_by
  or new.created_at        is distinct from old.created_at
  then
    raise exception 'この項目はスタッフのアカウントでは変更できません';
  end if;
  return new;
end;
$$;

create trigger products_enforce_staff_update
  before update on public.products
  for each row execute function public.enforce_staff_product_update();

-- ─── 4. 報酬（商品ごとの上書き。管理者のみアクセス可） ────────────
create table public.product_fees (
  product_id uuid primary key references public.products (id) on delete cascade,
  amount integer not null,
  updated_at timestamptz not null default now()
);

-- ─── 5. 写真 ────────────────────────────────────────────────
create table public.product_photos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  photo_category text not null check (photo_category in (
    'outer_box',      -- 外箱
    'item',           -- 商品本体
    'accessory',      -- 付属品
    'serial',         -- シリアル番号
    'before_packing', -- 梱包前
    'packing',        -- 梱包途中
    'packed',         -- 梱包完了
    'label',          -- 発送ラベル
    'other'           -- その他
  )),
  storage_path text not null,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index product_photos_product_idx on public.product_photos (product_id);

-- ─── 6. コメント ─────────────────────────────────────────────
create table public.product_comments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  author_id uuid references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index product_comments_product_idx on public.product_comments (product_id);

-- ─── 7. 作業履歴（自動記録） ──────────────────────────────────
create table public.work_logs (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  action text not null,          -- 例: status_changed / assigned / field_updated
  field text not null default '',
  old_value text not null default '',
  new_value text not null default '',
  created_at timestamptz not null default now()
);

create index work_logs_product_idx on public.work_logs (product_id);

-- 商品の重要な変更を自動で履歴に残す
create or replace function public.log_product_changes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.id, auth.uid(), 'created', '', '', new.control_number);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.id, auth.uid(), 'status_changed', 'status', old.status, new.status);
  end if;
  if new.assigned_staff_id is distinct from old.assigned_staff_id then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.id, auth.uid(), 'assigned', 'assigned_staff_id',
            coalesce(old.assigned_staff_id::text, ''), coalesce(new.assigned_staff_id::text, ''));
  end if;
  if new.tracking_number is distinct from old.tracking_number then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.id, auth.uid(), 'field_updated', 'tracking_number', old.tracking_number, new.tracking_number);
  end if;
  if new.shipped_date is distinct from old.shipped_date then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.id, auth.uid(), 'field_updated', 'shipped_date',
            coalesce(old.shipped_date::text, ''), coalesce(new.shipped_date::text, ''));
  end if;
  if new.serial_number is distinct from old.serial_number then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.id, auth.uid(), 'field_updated', 'serial_number', old.serial_number, new.serial_number);
  end if;
  return new;
end;
$$;

create trigger products_log_changes
  after insert or update on public.products
  for each row execute function public.log_product_changes();

-- ─── 8. 梱包チェックリスト（ターンテーブル等） ──────────────────
create table public.product_checklists (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  item_key text not null,
  checked boolean not null default false,
  checked_by uuid references public.profiles (id),
  checked_at timestamptz,
  unique (product_id, item_key)
);

-- ─── 9. マニュアル ───────────────────────────────────────────
create table public.manuals (
  id bigint generated always as identity primary key,
  category text not null,
  title text not null,
  body text not null default '',
  sort_order integer not null default 0,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

-- ─── 10. 月別報酬の自動集計ビュー ─────────────────────────────
create view public.monthly_payments
with (security_invoker = true) as
select
  p.assigned_staff_id as staff_id,
  to_char(p.shipped_date, 'YYYY-MM') as month,
  count(*) as shipped_count,
  sum(coalesce(f.amount, c.default_fee, 0)) as total_fee
from public.products p
left join public.product_fees f on f.product_id = p.id
left join public.categories c on c.id = p.category_id
where p.status = 'shipped' and p.shipped_date is not null
group by 1, 2;

-- ============================================================
-- Row Level Security（行単位のアクセス制御）
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.categories         enable row level security;
alter table public.carriers           enable row level security;
alter table public.products           enable row level security;
alter table public.product_fees       enable row level security;
alter table public.product_photos     enable row level security;
alter table public.product_comments   enable row level security;
alter table public.work_logs          enable row level security;
alter table public.product_checklists enable row level security;
alter table public.manuals            enable row level security;

-- profiles: 自分の行は閲覧可 / 管理者は全件閲覧・編集可
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_admin_write" on public.profiles
  for update using (public.is_admin());
create policy "profiles_admin_delete" on public.profiles
  for delete using (public.is_admin());

-- categories / carriers: ログインユーザーは閲覧可 / 管理者のみ編集可
create policy "categories_select" on public.categories
  for select using (auth.uid() is not null);
create policy "categories_admin_all" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

create policy "carriers_select" on public.carriers
  for select using (auth.uid() is not null);
create policy "carriers_admin_all" on public.carriers
  for all using (public.is_admin()) with check (public.is_admin());

-- products: 管理者は全件 / スタッフは自分の担当商品のみ
create policy "products_admin_all" on public.products
  for all using (public.is_admin()) with check (public.is_admin());
create policy "products_staff_select" on public.products
  for select using (assigned_staff_id = auth.uid());
create policy "products_staff_update" on public.products
  for update using (assigned_staff_id = auth.uid())
  with check (assigned_staff_id = auth.uid());

-- product_fees: 管理者のみ（スタッフには一切見えない）
create policy "product_fees_admin_only" on public.product_fees
  for all using (public.is_admin()) with check (public.is_admin());

-- product_photos: 管理者は全件 / スタッフは担当商品の分のみ
create policy "photos_admin_all" on public.product_photos
  for all using (public.is_admin()) with check (public.is_admin());
create policy "photos_staff_select" on public.product_photos
  for select using (public.is_assigned(product_id));
create policy "photos_staff_insert" on public.product_photos
  for insert with check (public.is_assigned(product_id) and uploaded_by = auth.uid());

-- product_comments: 管理者は全件 / スタッフは担当商品の分のみ
create policy "comments_admin_all" on public.product_comments
  for all using (public.is_admin()) with check (public.is_admin());
create policy "comments_staff_select" on public.product_comments
  for select using (public.is_assigned(product_id));
create policy "comments_staff_insert" on public.product_comments
  for insert with check (public.is_assigned(product_id) and author_id = auth.uid());

-- work_logs: 管理者は全件閲覧 / スタッフは担当商品の分のみ閲覧（書込はトリガーが実施）
create policy "work_logs_admin_select" on public.work_logs
  for select using (public.is_admin());
create policy "work_logs_staff_select" on public.work_logs
  for select using (public.is_assigned(product_id));

-- product_checklists: 管理者は全件 / スタッフは担当商品の分のみ
create policy "checklists_admin_all" on public.product_checklists
  for all using (public.is_admin()) with check (public.is_admin());
create policy "checklists_staff_select" on public.product_checklists
  for select using (public.is_assigned(product_id));
create policy "checklists_staff_write" on public.product_checklists
  for insert with check (public.is_assigned(product_id));
create policy "checklists_staff_update" on public.product_checklists
  for update using (public.is_assigned(product_id))
  with check (public.is_assigned(product_id));

-- manuals: ログインユーザーは閲覧可 / 管理者のみ編集可
create policy "manuals_select" on public.manuals
  for select using (auth.uid() is not null);
create policy "manuals_admin_all" on public.manuals
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 初期データ
-- ============================================================
insert into public.categories (name, prefix, default_fee, requires_turntable_checklist, sort_order) values
  ('Camera',       'CAM',   800,  false, 1),
  ('Lens',         'LENS',  800,  false, 2),
  ('Game Console', 'GAME',  1000, false, 3),
  ('Audio',        'AUDIO', 2000, false, 4),
  ('Turntable',    'TT',    2500, true,  5),
  ('Watch',        'WATCH', 500,  false, 6),
  ('Other',        'OTH',   500,  false, 7);

insert into public.carriers (name, sort_order) values
  ('FedEx', 1), ('DHL', 2), ('Japan Post', 3), ('UPS', 4), ('Other', 5);

insert into public.manuals (category, title, body, sort_order) values
  ('receiving',   '商品受け取り',       'ここに手順を記入してください。', 1),
  ('inspection',  '検品',               'ここに手順を記入してください。', 2),
  ('photography', '写真撮影',           'ここに手順を記入してください。', 3),
  ('packing',     'カメラ梱包',         'ここに手順を記入してください。', 4),
  ('packing',     'レンズ梱包',         'ここに手順を記入してください。', 5),
  ('packing',     'ゲーム機梱包',       'ここに手順を記入してください。', 6),
  ('packing',     'オーディオ梱包',     'ここに手順を記入してください。', 7),
  ('packing',     'ターンテーブル梱包', 'ここに手順を記入してください。', 8),
  ('shipping',    '発送',               'ここに手順を記入してください。', 9),
  ('trouble',     'トラブル時対応',     'ここに手順を記入してください。', 10);
