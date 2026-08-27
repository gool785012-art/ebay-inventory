-- ============================================================
-- eBay外注管理ツール 集荷管理SQL（Phase 7）
-- SupabaseのSQL Editorにこのファイル全体を貼り付けて「Run」してください。
-- 集荷可能日時・集荷手配ステータス・集荷確定日時が管理できるようになります。
-- ============================================================

-- ─── 1. 商品に集荷関連の項目を追加 ──────────────────────────────
alter table public.products
  -- 荷物の受け渡し方法: pickup（集荷）/ dropoff（持ち込み）
  add column if not exists handover_method text not null default 'pickup'
    check (handover_method in ('pickup', 'dropoff')),

  -- スタッフが入力する集荷可能日時
  add column if not exists pickup_available_date date,
  add column if not exists pickup_available_from time,
  add column if not exists pickup_available_to time,
  add column if not exists pickup_staff_note text not null default '',

  -- 集荷手配ステータス
  add column if not exists pickup_status text not null default 'not_entered'
    check (pickup_status in (
      'not_entered',   -- 集荷日時未入力
      'entered',       -- 集荷可能日時入力済み
      'not_arranged',  -- 集荷未手配
      'arranged',      -- 集荷手配済み
      'completed',     -- 集荷完了
      'dropoff'        -- 持ち込み発送
    )),

  -- 管理者が入力する集荷確定日時
  add column if not exists pickup_confirmed_date date,
  add column if not exists pickup_confirmed_from time,
  add column if not exists pickup_confirmed_to time,
  add column if not exists pickup_admin_note text not null default '';

-- ─── 2. スタッフが変更してよい列に集荷可能日時を追加 ─────────────────
-- （既存のトリガー関数を置き換え。集荷可能日時・受け渡し方法はスタッフも入力できる。
--   ただし集荷確定日時・集荷手配ステータスは管理者のみ変更可能）
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
  -- 集荷確定日時と管理者メモはスタッフ側から変更不可
  or new.pickup_confirmed_date is distinct from old.pickup_confirmed_date
  or new.pickup_confirmed_from is distinct from old.pickup_confirmed_from
  or new.pickup_confirmed_to   is distinct from old.pickup_confirmed_to
  or new.pickup_admin_note     is distinct from old.pickup_admin_note
  then
    raise exception 'この項目はスタッフのアカウントでは変更できません';
  end if;

  -- 集荷手配ステータスは、スタッフからは「入力済み」への更新のみ許可
  if new.pickup_status is distinct from old.pickup_status
     and new.pickup_status not in ('entered', 'dropoff')
  then
    raise exception '集荷手配ステータスは管理者のみ変更できます';
  end if;

  return new;
end;
$$;

-- ─── 3. 集荷関連の操作履歴を自動記録 ────────────────────────────
create or replace function public.log_pickup_changes()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_old text;
  v_new text;
begin
  -- 集荷可能日時（スタッフ入力）
  if new.pickup_available_date is distinct from old.pickup_available_date
  or new.pickup_available_from is distinct from old.pickup_available_from
  or new.pickup_available_to   is distinct from old.pickup_available_to
  then
    v_old := coalesce(old.pickup_available_date::text, '') ||
             case when old.pickup_available_from is null then ''
                  else ' ' || to_char(old.pickup_available_from, 'HH24:MI') || '〜' ||
                       coalesce(to_char(old.pickup_available_to, 'HH24:MI'), '') end;
    v_new := coalesce(new.pickup_available_date::text, '') ||
             case when new.pickup_available_from is null then ''
                  else ' ' || to_char(new.pickup_available_from, 'HH24:MI') || '〜' ||
                       coalesce(to_char(new.pickup_available_to, 'HH24:MI'), '') end;
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.id, auth.uid(),
            case when old.pickup_available_date is null then 'pickup_available_set' else 'pickup_available_changed' end,
            'pickup_available', v_old, v_new);
  end if;

  -- 集荷確定日時（管理者入力）
  if new.pickup_confirmed_date is distinct from old.pickup_confirmed_date
  or new.pickup_confirmed_from is distinct from old.pickup_confirmed_from
  or new.pickup_confirmed_to   is distinct from old.pickup_confirmed_to
  then
    v_new := coalesce(new.pickup_confirmed_date::text, '') ||
             case when new.pickup_confirmed_from is null then ''
                  else ' ' || to_char(new.pickup_confirmed_from, 'HH24:MI') || '〜' ||
                       coalesce(to_char(new.pickup_confirmed_to, 'HH24:MI'), '') end;
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.id, auth.uid(), 'pickup_confirmed_set', 'pickup_confirmed', '', v_new);
  end if;

  -- 集荷手配ステータス
  if new.pickup_status is distinct from old.pickup_status then
    insert into public.work_logs (product_id, actor_id, action, field, old_value, new_value)
    values (new.id, auth.uid(), 'pickup_status_changed', 'pickup_status',
            old.pickup_status, new.pickup_status);
  end if;

  return new;
end;
$$;

create trigger products_log_pickup
  after update on public.products
  for each row execute function public.log_pickup_changes();
