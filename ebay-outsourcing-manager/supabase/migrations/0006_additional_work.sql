-- ============================================================
-- eBay外注管理ツール 追加作業・報酬管理SQL（Phase 9）
-- SupabaseのSQL Editorにこのファイル全体を貼り付けて「Run」してください。
-- 商品状態の写真撮影・簡単な動作確認の要否と、それに応じた追加報酬が管理できるようになります。
-- ============================================================

-- ─── 1. 商品に追加作業の項目を追加 ──────────────────────────────
alter table public.products
  -- 管理者が指定する「今回必要な追加作業」
  add column if not exists photo_required boolean not null default false,
  add column if not exists operation_check_required boolean not null default false,

  -- 集荷・持ち込みの報酬（回ごと）と立替金
  add column if not exists handover_reward integer not null default 0,
  add column if not exists reimbursement integer not null default 0,
  add column if not exists reimbursement_note text not null default '',

  -- スタッフが入力する動作確認の結果
  add column if not exists operation_check_result text
    check (operation_check_result in ('ok', 'problem', 'unable')),
  add column if not exists operation_check_memo text not null default '';

-- ─── 2. 写真カテゴリーに「商品状態」を追加 ────────────────────────
alter table public.product_photos
  drop constraint product_photos_photo_category_check;
alter table public.product_photos
  add constraint product_photos_photo_category_check check (photo_category in (
    'outer_box', 'item', 'accessory', 'serial', 'condition',
    'before_packing', 'packing', 'packed', 'label', 'label_attached', 'other'
  ));

-- ─── 3. 報酬内訳を計算する関数 ─────────────────────────────────
-- 追加報酬: 写真+100円 / 動作確認+200円（両方なら+300円）
create or replace function public.calc_additional_reward(
  p_photo boolean, p_operation boolean
) returns integer
language sql immutable
as $$
  select (case when p_photo then 100 else 0 end)
       + (case when p_operation then 200 else 0 end);
$$;

-- 商品1件の報酬合計（梱包報酬 + 追加報酬 + 集荷/持ち込み報酬 + 立替金）
create or replace function public.calc_total_reward(p_product_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(f.amount, c.default_fee, 0)                          -- 梱包報酬
       + public.calc_additional_reward(p.photo_required, p.operation_check_required)
       + p.handover_reward                                             -- 集荷/持ち込み
       + p.reimbursement                                               -- 立替金
  from public.products p
  left join public.product_fees f on f.product_id = p.id
  left join public.categories c on c.id = p.category_id
  where p.id = p_product_id;
$$;

-- ─── 4. 報酬確定ロジックを更新（追加報酬を含める） ────────────────
-- 発送済みになった時点で、追加報酬・集荷報酬・立替金も含めた金額を確定する。
-- 内訳も work_rewards に保存し、月次集計で項目別に集計できるようにする。
alter table public.work_rewards
  add column if not exists packing_reward integer not null default 0,
  add column if not exists photo_reward integer not null default 0,
  add column if not exists operation_check_reward integer not null default 0,
  add column if not exists handover_reward integer not null default 0,
  add column if not exists reimbursement integer not null default 0;

create or replace function public.confirm_reward()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_packing integer;
  v_photo integer;
  v_operation integer;
begin
  if new.status = 'shipped' and old.status is distinct from 'shipped' then
    select coalesce(f.amount, c.default_fee, 0) into v_packing
    from (select 1) dummy
    left join public.product_fees f on f.product_id = new.id
    left join public.categories c on c.id = new.category_id;

    v_photo := case when new.photo_required then 100 else 0 end;
    v_operation := case when new.operation_check_required then 200 else 0 end;

    insert into public.work_rewards (
      staff_id, product_id, reward_amount, completed_at,
      packing_reward, photo_reward, operation_check_reward, handover_reward, reimbursement
    )
    values (
      new.assigned_staff_id,
      new.id,
      coalesce(v_packing, 0) + v_photo + v_operation
        + new.handover_reward + new.reimbursement,
      coalesce(new.shipped_date, current_date),
      coalesce(v_packing, 0), v_photo, v_operation,
      new.handover_reward, new.reimbursement
    )
    on conflict (product_id) do nothing;  -- 二重確定を防ぐ
  end if;
  return new;
end;
$$;

-- ─── 5. 「問題あり」なら自動で要確認にする ─────────────────────
-- 動作確認で問題が見つかった場合、管理者が気づけるよう問題ありフラグを立てる。
create or replace function public.handle_operation_check()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.operation_check_result = 'problem'
     and old.operation_check_result is distinct from 'problem' then
    new.has_problem := true;
    if new.problem_note = '' then
      new.problem_note := '動作確認で問題が報告されました' ||
        case when new.operation_check_memo <> ''
             then '：' || new.operation_check_memo else '' end;
    end if;
  end if;
  return new;
end;
$$;

create trigger products_handle_operation_check
  before update on public.products
  for each row execute function public.handle_operation_check();

-- ─── 6. スタッフが変更してよい列に動作確認結果を追加 ─────────────
-- （追加作業の要否・報酬額・立替金は管理者のみ変更可能）
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
  or new.pickup_confirmed_date is distinct from old.pickup_confirmed_date
  or new.pickup_confirmed_from is distinct from old.pickup_confirmed_from
  or new.pickup_confirmed_to   is distinct from old.pickup_confirmed_to
  or new.pickup_admin_note     is distinct from old.pickup_admin_note
  -- 追加作業の要否・報酬・立替金はスタッフ側から変更不可
  or new.photo_required           is distinct from old.photo_required
  or new.operation_check_required is distinct from old.operation_check_required
  or new.handover_reward          is distinct from old.handover_reward
  or new.reimbursement            is distinct from old.reimbursement
  then
    raise exception 'この項目はスタッフのアカウントでは変更できません';
  end if;

  if new.pickup_status is distinct from old.pickup_status
     and new.pickup_status not in ('entered', 'dropoff')
  then
    raise exception '集荷手配ステータスは管理者のみ変更できます';
  end if;

  return new;
end;
$$;

-- ─── 7. 動作確認の操作履歴を自動記録 ───────────────────────────
create or replace function public.log_operation_check()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.operation_check_result is distinct from old.operation_check_result then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.id, auth.uid(), 'operation_check_recorded', 'operation_check_result',
            coalesce(old.operation_check_result, ''),
            coalesce(new.operation_check_result, ''));
  end if;
  if new.photo_required is distinct from old.photo_required
  or new.operation_check_required is distinct from old.operation_check_required then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.id, auth.uid(), 'additional_work_changed', 'additional_work',
            (case when old.photo_required then '写真' else '' end) ||
            (case when old.operation_check_required then '動作確認' else '' end),
            (case when new.photo_required then '写真' else '' end) ||
            (case when new.operation_check_required then '動作確認' else '' end));
  end if;
  return new;
end;
$$;

create trigger products_log_operation_check
  after update on public.products
  for each row execute function public.log_operation_check();

-- ─── 8. 月次報酬集計ビューを内訳付きに更新 ────────────────────────
drop view if exists public.monthly_payments;

create view public.monthly_payments
with (security_invoker = true) as
select
  r.staff_id,
  to_char(r.completed_at, 'YYYY-MM') as month,
  count(*) as shipped_count,
  sum(r.reward_amount) as total_fee,
  sum(r.packing_reward) as packing_total,
  sum(r.photo_reward) as photo_total,
  sum(r.operation_check_reward) as operation_check_total,
  sum(r.handover_reward) as handover_total,
  sum(r.reimbursement) as reimbursement_total
from public.work_rewards r
group by 1, 2;
