-- ============================================================
-- work_rewards の reward_amount と内訳（packing/photo/operation_check/handover
-- + reimbursement）の食い違いを調査・修正するためのSQL（本番Supabase SQL Editorで実行）。
--
-- 【重要】このファイルの過去バージョンにあった
--   update work_rewards set reward_amount = 内訳合計 ...
-- という一括UPDATEは実行しないでください。
-- 実際に確認したところ、内訳側にこそ誤りがあるケースがあり、
-- reward_amountを内訳に合わせて一括で書き換えるのは危険です。
-- 必ず1件ずつ内容を確認し、どちらが正しいかを判断してから、
-- 該当する列だけをピンポイントで修正してください。
-- ============================================================

-- ─── 1. 食い違っている行を一覧表示する（実行前に必ず確認） ─────────
select
  id,
  product_id,
  reward_amount as current_reward_amount,
  packing_reward,
  photo_reward,
  operation_check_reward,
  handover_reward,
  reimbursement,
  (packing_reward + photo_reward + operation_check_reward + handover_reward + reimbursement)
    as breakdown_total,
  reward_amount - (packing_reward + photo_reward + operation_check_reward + handover_reward + reimbursement)
    as diff
from public.work_rewards
where reward_amount <> packing_reward + photo_reward + operation_check_reward + handover_reward + reimbursement
order by completed_at;

-- 上記で2件検出された想定：
--   (A) reward_amount=500 / 内訳合計=0
--       → 原因未特定。今回は対象外。自動的に0円などへ変更しないこと。
--   (B) reward_amount=800 / packing=500, photo=100, operation_check=0,
--       handover=201, reimbursement=0 → 内訳合計=801
--       → reward_amount=800が正しく、handover_rewardの201円が
--         200円の誤り（201→200の1円修正が必要）。

-- ============================================================
-- (B) の行だけを対象に、handover_reward を201→200へ修正する
-- ============================================================

-- ─── 2. (B)に該当する行を、id込みで一意に特定できるか確認する ──────
-- 以下の条件に一致する行が「ちょうど1件」であることを必ず確認してから
-- 次のUPDATEへ進んでください。2件以上ヒットする場合は、
-- 表示されたidを見て対象を1件に絞り込んでからUPDATEしてください。
select
  id,
  product_id,
  reward_amount,
  packing_reward,
  photo_reward,
  operation_check_reward,
  handover_reward,
  reimbursement
from public.work_rewards
where reward_amount = 800
  and packing_reward = 500
  and photo_reward = 100
  and operation_check_reward = 0
  and handover_reward = 201
  and reimbursement = 0;

-- ─── 3. 上記で対象が1件だけであることを確認したら、そのidを使って修正 ──
-- 「<ここに手順2で確認したidを入れる>」の部分を実際のidに置き換えてから実行してください。
-- reward_amount(800)・packing_reward(500)・photo_reward(100)・
-- operation_check_reward(0)・reimbursement(0) は一切変更せず、
-- handover_reward だけを201→200に修正します。
update public.work_rewards
set handover_reward = 200
where id = '<ここに手順2で確認したidを入れる>'
  and handover_reward = 201;  -- 想定外の行を誤って書き換えないための安全確認

-- ─── 4. 修正後の確認 ───────────────────────────────────────────
-- (B)の行が解消され、内訳合計(801→800)がreward_amount(800)と一致することを確認する。
select
  id,
  reward_amount,
  packing_reward,
  photo_reward,
  operation_check_reward,
  handover_reward,
  reimbursement,
  (packing_reward + photo_reward + operation_check_reward + handover_reward + reimbursement)
    as breakdown_total
from public.work_rewards
where id = '<ここに手順2で確認したidを入れる>';

-- ─── 5. 残っている食い違いを再確認 ─────────────────────────────
-- (B)は解消され、(A)（reward_amount=500 / 内訳合計=0）だけが
-- 残っていれば想定通り（(A)は今回は対象外・別途調査）。
select
  id,
  product_id,
  reward_amount as current_reward_amount,
  packing_reward,
  photo_reward,
  operation_check_reward,
  handover_reward,
  reimbursement,
  (packing_reward + photo_reward + operation_check_reward + handover_reward + reimbursement)
    as breakdown_total
from public.work_rewards
where reward_amount <> packing_reward + photo_reward + operation_check_reward + handover_reward + reimbursement
order by completed_at;
