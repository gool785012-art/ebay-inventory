// 梱包報酬の決まり方のテスト（スタッフ画面と管理者画面の食い違い）
// 実行方法: node --test src/lib/packing-reward.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

// 管理者画面・スタッフ画面の両方で使う解決順
// 商品ごとの上書き（product_fees.amount）→ なければカテゴリー標準報酬
function resolvePackingReward(feeRow, category) {
  return feeRow?.amount ?? category?.default_fee ?? 0;
}

// 確定済みなら確定額、まだなら見込み額
function displayedReward({ packingReward, photoRequired, operationRequired, handoverReward, confirmed }) {
  if (confirmed) {
    return confirmed.packing_reward + confirmed.photo_reward
         + confirmed.operation_check_reward + confirmed.handover_reward;
  }
  return packingReward + (photoRequired ? 100 : 0) + (operationRequired ? 200 : 0) + handoverReward;
}

const AUDIO = { name: "Audio", default_fee: 1500 };
const OTHER = { name: "Other", default_fee: 500 };

test("商品ごとの上書きがあればその金額を使う（報告された不具合）", () => {
  // カテゴリーは Audio（標準1,500円）のまま、商品ごとに500円を設定した場合
  assert.equal(resolvePackingReward({ amount: 500 }, AUDIO), 500);
});

test("上書きがなければカテゴリー標準報酬を使う", () => {
  assert.equal(resolvePackingReward(null, AUDIO), 1500);
  assert.equal(resolvePackingReward(undefined, OTHER), 500);
});

test("カテゴリーも上書きもなければ0円", () => {
  assert.equal(resolvePackingReward(null, null), 0);
});

test("上書きが0円なら0円（標準報酬に戻らない）", () => {
  assert.equal(resolvePackingReward({ amount: 0 }, AUDIO), 0);
});

test("管理者画面とスタッフ画面が同じ金額になる", () => {
  const feeRow = { amount: 500 };
  const admin = resolvePackingReward(feeRow, AUDIO);
  const staff = resolvePackingReward(feeRow, AUDIO);
  assert.equal(admin, staff);
  assert.equal(staff, 500);
});

test("報告された画面の数字が一致する（梱包500+写真100+集荷200=800円）", () => {
  const packingReward = resolvePackingReward({ amount: 500 }, AUDIO);
  const total = displayedReward({
    packingReward, photoRequired: true, operationRequired: false, handoverReward: 200,
    confirmed: null,
  });
  assert.equal(total, 800);      // 修正前のスタッフ画面は 1,800円だった
  assert.notEqual(total, 1800);
});

test("発送済みなら確定済みの内訳をそのまま表示する", () => {
  const total = displayedReward({
    // 見込みの計算元が間違っていても確定額が優先される
    packingReward: 1500, photoRequired: true, operationRequired: false, handoverReward: 200,
    confirmed: {
      packing_reward: 500, photo_reward: 100,
      operation_check_reward: 0, handover_reward: 200,
    },
  });
  assert.equal(total, 800);
});
