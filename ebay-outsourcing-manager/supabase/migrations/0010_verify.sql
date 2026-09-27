-- ============================================================
-- 0010_handover_reward_fix.sql を実行したあとの確認用SQL
--
-- SupabaseのSQL Editorに貼り付けて「Run」してください。
-- データは一切変更しません（すべて select のみ）。
--
-- 集計対象の月を変えたいときは、下の :month を書き換えてください。
-- ============================================================

-- ─── 1. 201円のデータが残っていないか（期待: どちらも 0件） ─────────
select
  '① 201円の残り' as 確認項目,
  (select count(*) from public.products      where handover_reward = 201) as 商品,
  (select count(*) from public.work_rewards  where handover_reward = 201) as 確定報酬,
  case when (select count(*) from public.products     where handover_reward = 201) = 0
        and (select count(*) from public.work_rewards where handover_reward = 201) = 0
       then 'OK（0件）' else 'NG（まだ残っています）' end as 判定;

-- ─── 2. 許可された金額以外が残っていないか（期待: どちらも 0件） ─────
select
  '② 0/200/300/500 以外' as 確認項目,
  (select count(*) from public.products
     where handover_reward not in (0, 200, 300, 500)) as 商品,
  (select count(*) from public.work_rewards
     where handover_reward not in (0, 200, 300, 500)) as 確定報酬,
  case when (select count(*) from public.products
               where handover_reward not in (0, 200, 300, 500)) = 0
        and (select count(*) from public.work_rewards
               where handover_reward not in (0, 200, 300, 500)) = 0
       then 'OK（0件）' else 'NG（不正な金額があります）' end as 判定;

-- 不正な金額が見つかった場合は、この行で中身を確認できる
select id, handover_reward_method, handover_reward
from public.products
where handover_reward not in (0, 200, 300, 500);

-- ─── 3. 集荷・持ち込み報酬の種別の内訳 ──────────────────────────
-- 期待: 金額が「なし=0 / 西濃=200 / DHL=200 / 郵便局=300 / 多い重い=500」に揃っていること
select
  '③ 種別の内訳' as 確認項目,
  case handover_reward_method
    when ''           then 'なし'
    when 'seino'      then '西濃集荷'
    when 'dhl'        then 'DHL集荷'
    when 'post'       then '郵便局持ち込み'
    when 'post_heavy' then '郵便局持ち込み・多い/重い'
    else handover_reward_method
  end as 種別,
  handover_reward as 金額,
  count(*) as 件数
from public.products
group by handover_reward_method, handover_reward
order by handover_reward, handover_reward_method;

-- ─── 4〜6. 対象月の集計（2026年9月） ────────────────────────────
-- 別の月を見たいときは '2026-09-01' / '2026-10-01' を書き換えてください。
with target as (
  select date '2026-09-01' as month_start, date '2026-10-01' as month_end
),
r as (
  select w.*
  from public.work_rewards w, target t
  where w.completed_at >= t.month_start and w.completed_at < t.month_end
),
e as (
  select x.*
  from public.product_expenses x, target t
  where x.status = 'approved'
    and x.created_at >= t.month_start and x.created_at < t.month_end
)
select
  '④ 集荷・持ち込み合計' as 項目,
  (select coalesce(sum(handover_reward), 0) from r) as 金額,
  1500 as 期待値,
  case when (select coalesce(sum(handover_reward), 0) from r) = 1500
       then 'OK' else 'NG' end as 判定
union all
select
  '⑤ 作業報酬合計',
  (select coalesce(sum(packing_reward + photo_reward
                     + operation_check_reward + handover_reward), 0) from r),
  5000,
  case when (select coalesce(sum(packing_reward + photo_reward
                              + operation_check_reward + handover_reward), 0) from r) = 5000
       then 'OK' else 'NG' end
union all
select
  '⑥ 立替金合計',
  (select coalesce(sum(amount), 0) from e),
  9660,
  case when (select coalesce(sum(amount), 0) from e) = 9660 then 'OK' else 'NG' end
union all
select
  '⑦ 最終支払額',
  (select coalesce(sum(packing_reward + photo_reward
                     + operation_check_reward + handover_reward), 0) from r)
  + (select coalesce(sum(amount), 0) from e),
  14660,
  case when (select coalesce(sum(packing_reward + photo_reward
                              + operation_check_reward + handover_reward), 0) from r)
          + (select coalesce(sum(amount), 0) from e) = 14660
       then 'OK' else 'NG' end
union all
-- 画面上部のカード（reward_amount の合計）と明細が一致しているか
select
  '⑧ カード合計と明細の一致',
  (select coalesce(sum(reward_amount), 0) from r),
  (select coalesce(sum(packing_reward + photo_reward + operation_check_reward
                     + handover_reward + reimbursement), 0) from r),
  case when (select coalesce(sum(reward_amount), 0) from r)
          = (select coalesce(sum(packing_reward + photo_reward + operation_check_reward
                               + handover_reward + reimbursement), 0) from r)
       then 'OK（一致）' else 'NG（ズレあり）' end;

-- ─── 7. 対象月の明細（内訳の確認用） ────────────────────────────
select
  w.completed_at as 完了日,
  p.control_number as 管理番号,
  p.name as 商品名,
  w.packing_reward as 梱包,
  w.photo_reward as 写真,
  w.operation_check_reward as 動作確認,
  w.handover_reward as 集荷持込,
  p.handover_reward_method as 集荷種別,
  w.reimbursement as 立替金,
  w.reward_amount as 支払額
from public.work_rewards w
join public.products p on p.id = w.product_id
where w.completed_at >= date '2026-09-01'
  and w.completed_at <  date '2026-10-01'
order by w.completed_at;
