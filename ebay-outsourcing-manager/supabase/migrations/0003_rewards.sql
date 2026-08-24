-- ============================================================
-- eBay外注管理ツール 報酬管理SQL（Phase 5）
-- SupabaseのSQL Editorにこのファイル全体を貼り付けて「Run」してください。
-- 報酬履歴テーブル・報酬の自動確定・変更履歴・アクセス制御が作成されます。
-- ============================================================

-- ─── 1. 報酬履歴テーブル ─────────────────────────────────────
-- 商品が「発送済み」になった瞬間の報酬額を記録する。
-- 後からカテゴリーの標準報酬を変えても、確定済みの金額は変わらない。
create table public.work_rewards (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.profiles (id),
  product_id uuid not null unique references public.products (id) on delete cascade,
  reward_amount integer not null default 0,
  completed_at date not null default current_date,
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'on_hold')),
  paid_at date,
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- product_id の unique 制約により、同じ商品で報酬が二重登録されることはない

create index work_rewards_staff_idx on public.work_rewards (staff_id);
create index work_rewards_completed_idx on public.work_rewards (completed_at);

-- updated_at 自動更新 + 支払日を自動管理
create or replace function public.work_rewards_before_update()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.payment_status = 'paid' and new.paid_at is null then
    new.paid_at := current_date;   -- 支払済みにした日を自動記録
  elsif new.payment_status = 'unpaid' then
    new.paid_at := null;           -- 未払いに戻したら支払日をクリア
  end if;
  return new;
end;
$$;

create trigger work_rewards_before_update_trg
  before update on public.work_rewards
  for each row execute function public.work_rewards_before_update();

-- ─── 2. 報酬の自動確定 ──────────────────────────────────────
-- 商品ステータスが「発送済み」に変わったタイミングで、
-- その時点の報酬額（商品別報酬 → なければカテゴリー標準報酬）で履歴を作成する。
-- 発送前に報酬が確定することはない。
create or replace function public.confirm_reward()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'shipped' and old.status is distinct from 'shipped' then
    insert into public.work_rewards (staff_id, product_id, reward_amount, completed_at)
    select
      new.assigned_staff_id,
      new.id,
      coalesce(f.amount, c.default_fee, 0),
      coalesce(new.shipped_date, current_date)
    from (select 1) dummy
    left join public.product_fees f on f.product_id = new.id
    left join public.categories c on c.id = new.category_id
    on conflict (product_id) do nothing;  -- すでに確定済みなら何もしない（二重確定防止）
  end if;
  return new;
end;
$$;

create trigger products_confirm_reward
  after update on public.products
  for each row execute function public.confirm_reward();

-- ─── 3. 報酬の変更履歴（誰が・いつ・何を変更したか） ─────────────
create or replace function public.log_reward_changes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.product_id, auth.uid(), 'reward_confirmed', 'reward_amount', '', new.reward_amount::text);
    return new;
  end if;
  if new.reward_amount is distinct from old.reward_amount then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.product_id, auth.uid(), 'reward_changed', 'reward_amount',
            old.reward_amount::text, new.reward_amount::text);
  end if;
  if new.payment_status is distinct from old.payment_status then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.product_id, auth.uid(), 'payment_status_changed', 'payment_status',
            old.payment_status, new.payment_status);
  end if;
  return new;
end;
$$;

create trigger work_rewards_log
  after insert or update on public.work_rewards
  for each row execute function public.log_reward_changes();

-- ─── 4. アクセス制御（RLS） ──────────────────────────────────
-- 管理者: すべて閲覧・編集可能
-- スタッフ: 自分の報酬のみ閲覧可能（金額・支払状況の変更は不可）
alter table public.work_rewards enable row level security;

create policy "rewards_admin_all" on public.work_rewards
  for all using (public.is_admin()) with check (public.is_admin());

create policy "rewards_staff_select" on public.work_rewards
  for select using (staff_id = auth.uid());

-- ─── 5. カテゴリー標準報酬をPhase 5の目安に更新 ─────────────────
-- Camera 800 / Lens 800 / Game Console 800 / Audio 1500 / Turntable 1500 / Watch 500 / Other 500
update public.categories set default_fee = 800  where name = 'Game Console';
update public.categories set default_fee = 1500 where name in ('Audio', 'Turntable');
