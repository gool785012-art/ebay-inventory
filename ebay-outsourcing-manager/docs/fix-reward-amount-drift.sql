-- ============================================================
-- work_rewards.reward_amount と内訳（packing/photo/operation_check/handover + reimbursement）の
-- 食い違いを修正するための一時SQL（本番Supabase SQL Editorで実行）。
--
-- 原因: RewardTable.tsx の報酬額(reward_amount)手動編集が、内訳列
-- （packing_reward等）を更新していなかったため、過去に手動修正された行で
-- reward_amount と内訳合計がズレていた（今回のケースでは reward_amount側が
-- +1円多い状態になっていた）。
--
-- 方針: 内訳（packing/photo/operation_check/handover/reimbursement）を正として、
-- reward_amount のみをその合計に合わせる。内訳列自体は一切変更しない。
-- ============================================================

-- ─── 1. まず対象行を確認する（実行前に必ず確認） ───────────────────
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
    as correct_reward_amount,
  reward_amount - (packing_reward + photo_reward + operation_check_reward + handover_reward + reimbursement)
    as diff
from public.work_rewards
where reward_amount <> packing_reward + photo_reward + operation_check_reward + handover_reward + reimbursement
order by completed_at;

-- ─── 2. 上記の結果を確認し、意図した行だけであることを確認してから実行 ──
-- reward_amount のみを内訳合計に合わせて修正する（packing_reward等は変更しない）。
update public.work_rewards
set reward_amount = packing_reward + photo_reward + operation_check_reward + handover_reward + reimbursement
where reward_amount <> packing_reward + photo_reward + operation_check_reward + handover_reward + reimbursement;

-- ─── 3. 修正後の確認（0件になっていればズレは解消） ───────────────
select count(*) as remaining_mismatches
from public.work_rewards
where reward_amount <> packing_reward + photo_reward + operation_check_reward + handover_reward + reimbursement;
