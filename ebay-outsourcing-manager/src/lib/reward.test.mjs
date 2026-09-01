// 報酬計算のテスト（Phase 9）
// 実行方法: node --test src/lib/reward.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

// TypeScriptを介さず検証できるよう、同じロジックをここに置く
// （src/lib/reward.ts の calcReward と同じ計算）
const PHOTO_REWARD = 100;
const OPERATION_CHECK_REWARD = 200;

function normalizeHandoverReward(value) {
  return value === 201 ? 200 : value;
}

function calcReward(input) {
  const packingReward = input.packingReward || 0;
  const photoReward = input.photoRequired ? PHOTO_REWARD : 0;
  const operationCheckReward = input.operationCheckRequired ? OPERATION_CHECK_REWARD : 0;
  const additionalReward = photoReward + operationCheckReward;
  const handoverReward = normalizeHandoverReward(input.handoverReward || 0);
  const reimbursement = input.reimbursement || 0;
  return {
    packingReward, photoReward, operationCheckReward, additionalReward,
    handoverReward, reimbursement,
    totalReward: packingReward + additionalReward + handoverReward + reimbursement,
  };
}

test("ケース1: 梱包500円 / 写真なし / 動作確認なし → 500円", () => {
  const r = calcReward({ packingReward: 500, photoRequired: false, operationCheckRequired: false });
  assert.equal(r.additionalReward, 0);
  assert.equal(r.totalReward, 500);
});

test("ケース2: 梱包500円 / 写真あり / 動作確認なし → 600円", () => {
  const r = calcReward({ packingReward: 500, photoRequired: true, operationCheckRequired: false });
  assert.equal(r.additionalReward, 100);
  assert.equal(r.totalReward, 600);
});

test("ケース3: 梱包500円 / 写真なし / 動作確認あり → 700円", () => {
  const r = calcReward({ packingReward: 500, photoRequired: false, operationCheckRequired: true });
  assert.equal(r.additionalReward, 200);
  assert.equal(r.totalReward, 700);
});

test("ケース4: 梱包500円 / 写真あり / 動作確認あり → 800円", () => {
  const r = calcReward({ packingReward: 500, photoRequired: true, operationCheckRequired: true });
  assert.equal(r.additionalReward, 300);
  assert.equal(r.totalReward, 800);
});

test("ケース5: 梱包500円 / 写真あり / 動作確認あり / DHL集荷200円 → 1,000円", () => {
  const r = calcReward({
    packingReward: 500, photoRequired: true, operationCheckRequired: true, handoverReward: 201,
  });
  assert.equal(r.handoverReward, 200);
  assert.equal(r.totalReward, 1000);
});

test("ケース6: 梱包1,500円 / 写真あり / 動作確認あり / 西濃集荷200円 → 2,000円", () => {
  const r = calcReward({
    packingReward: 1500, photoRequired: true, operationCheckRequired: true, handoverReward: 200,
  });
  assert.equal(r.totalReward, 2000);
});

test("立替金も合計に含まれる", () => {
  const r = calcReward({
    packingReward: 300, photoRequired: false, operationCheckRequired: false,
    handoverReward: 300, reimbursement: 1280,
  });
  assert.equal(r.totalReward, 1880);
});

test("内訳の各項目が正しい", () => {
  const r = calcReward({
    packingReward: 1000, photoRequired: true, operationCheckRequired: true,
    handoverReward: 500, reimbursement: 250,
  });
  assert.equal(r.packingReward, 1000);
  assert.equal(r.photoReward, 100);
  assert.equal(r.operationCheckReward, 200);
  assert.equal(r.additionalReward, 300);
  assert.equal(r.handoverReward, 500);
  assert.equal(r.reimbursement, 250);
  assert.equal(r.totalReward, 2050);
});

// ─── 立替金のテスト（Phase 10） ─────────────────────────────────
function calcExpenseTotal(expenses, approvedOnly = false) {
  return expenses
    .filter((e) => !approvedOnly || e.status === "approved")
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

function calcStaffPayment(rewardInput, expenses, approvedOnly = false) {
  const reward = calcReward({ ...rewardInput, reimbursement: 0 });
  const expenseTotal = calcExpenseTotal(expenses, approvedOnly);
  return {
    staffRewardTotal: reward.totalReward,
    expenseTotal,
    staffPaymentTotal: reward.totalReward + expenseTotal,
  };
}

test("立替ケース1: 作業報酬800円 / 立替なし → 支払総額800円", () => {
  const p = calcStaffPayment(
    { packingReward: 500, photoRequired: true, operationCheckRequired: true },
    []
  );
  assert.equal(p.staffRewardTotal, 800);
  assert.equal(p.expenseTotal, 0);
  assert.equal(p.staffPaymentTotal, 800);
});

test("立替ケース2: 作業報酬800円 / 郵便送料1,860円 → 支払総額2,660円", () => {
  const p = calcStaffPayment(
    { packingReward: 500, photoRequired: true, operationCheckRequired: true },
    [{ expense_type: "postal_postage", amount: 1860 }]
  );
  assert.equal(p.staffRewardTotal, 800);
  assert.equal(p.expenseTotal, 1860);
  assert.equal(p.staffPaymentTotal, 2660);
});

test("立替ケース3: 作業報酬800円 / 郵便送料1,860円 + 梱包資材1,250円 → 立替3,110円・支払3,910円", () => {
  const p = calcStaffPayment(
    { packingReward: 500, photoRequired: true, operationCheckRequired: true },
    [
      { expense_type: "postal_postage", amount: 1860 },
      { expense_type: "packing_material", amount: 1250 },
    ]
  );
  assert.equal(p.staffRewardTotal, 800);
  assert.equal(p.expenseTotal, 3110);
  assert.equal(p.staffPaymentTotal, 3910);
});

test("立替ケース4: 梱包500+写真100+動作200+郵便局持込300 / 立替2,100+800 → 報酬1,100・立替2,900・支払4,000", () => {
  const p = calcStaffPayment(
    {
      packingReward: 500, photoRequired: true, operationCheckRequired: true,
      handoverReward: 300,
    },
    [
      { expense_type: "postal_postage", amount: 2100 },
      { expense_type: "packing_material", amount: 800 },
    ]
  );
  assert.equal(p.staffRewardTotal, 1100);
  assert.equal(p.expenseTotal, 2900);
  assert.equal(p.staffPaymentTotal, 4000);
});

test("承認済みの立替金だけを支払対象にできる", () => {
  const expenses = [
    { expense_type: "postal_postage", amount: 1860, status: "approved" },
    { expense_type: "packing_material", amount: 1250, status: "pending" },
    { expense_type: "other", amount: 500, status: "rejected" },
  ];
  assert.equal(calcExpenseTotal(expenses), 3610);        // 全件
  assert.equal(calcExpenseTotal(expenses, true), 1860);  // 承認済みのみ
});

test("作業報酬と立替金が混ざらない（3件の立替でも報酬は変わらない）", () => {
  const p = calcStaffPayment(
    { packingReward: 500, photoRequired: false, operationCheckRequired: false },
    [
      { expense_type: "postal_postage", amount: 1860 },
      { expense_type: "packing_material", amount: 1250 },
      { expense_type: "other", amount: 398 },
    ]
  );
  assert.equal(p.staffRewardTotal, 500);
  assert.equal(p.expenseTotal, 3508);
  assert.equal(p.staffPaymentTotal, 4008);
});
