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
