// 集荷・持ち込み報酬のテスト（1円端数の不具合）
// 実行方法: node --test src/lib/handover.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

// src/lib/reward.ts と同じロジック
const HANDOVER_OPTIONS = [
  { key: "",           amount: 0,   label: "なし" },
  { key: "seino",      amount: 200, label: "西濃集荷（200円）" },
  { key: "dhl",        amount: 200, label: "DHL集荷（200円）" },
  { key: "post",       amount: 300, label: "郵便局持ち込み（300円）" },
  { key: "post_heavy", amount: 500, label: "郵便局持ち込み・多い/重い（500円）" },
];
const HANDOVER_ALLOWED_AMOUNTS = [0, 200, 300, 500];

const handoverAmount = (k) => HANDOVER_OPTIONS.find((h) => h.key === k)?.amount ?? 0;

function normalizeHandoverReward(value) {
  const n = Number(value) || 0;
  if (n <= 0) return 0;
  if (HANDOVER_ALLOWED_AMOUNTS.includes(n)) return n;
  let result = 0;
  for (const a of HANDOVER_ALLOWED_AMOUNTS) if (a <= n && a > result) result = a;
  return result;
}

function handoverMethodFromReward(value) {
  const n = Number(value) || 0;
  if (n === 201) return "dhl";
  if (n >= 500) return "post_heavy";
  if (n >= 300) return "post";
  if (n >= 200) return "seino";
  return "";
}

function calcWorkRewardTotal(row) {
  return (Number(row.packing_reward) || 0) + (Number(row.photo_reward) || 0)
    + (Number(row.operation_check_reward) || 0) + normalizeHandoverReward(row.handover_reward);
}

function calcRewardBreakdown(rows) {
  const packing = rows.reduce((s, r) => s + (Number(r.packing_reward) || 0), 0);
  const photo = rows.reduce((s, r) => s + (Number(r.photo_reward) || 0), 0);
  const operationCheck = rows.reduce((s, r) => s + (Number(r.operation_check_reward) || 0), 0);
  const handover = rows.reduce((s, r) => s + normalizeHandoverReward(r.handover_reward), 0);
  return { packing, photo, operationCheck, handover, total: packing + photo + operationCheck + handover };
}

// 画面の選択 → 保存される金額（差額計算はせず常に上書き）
const save = (methodKey) => ({ handover_reward_method: methodKey, handover_reward: handoverAmount(methodKey) });

// ─── ユーザー指定のテスト ①〜⑤ ────────────────────────────────
test("① 郵便局持ち込みを選ぶと300円で保存される", () => {
  assert.equal(save("post").handover_reward, 300);
});

test("② 300円からDHL集荷へ変更すると200円になる（201円にならない）", () => {
  let row = save("post");
  assert.equal(row.handover_reward, 300);
  row = save("dhl");                       // 旧金額への加減算をしない
  assert.equal(row.handover_reward, 200);
  assert.notEqual(row.handover_reward, 201);
});

test("③ DHL集荷から「なし」へ変更すると0円になる", () => {
  let row = save("dhl");
  row = save("");
  assert.equal(row.handover_reward, 0);
});

test("④ なしから500円へ変更すると500円になる", () => {
  let row = save("");
  row = save("post_heavy");
  assert.equal(row.handover_reward, 500);
});

test("⑤ 何度変更しても1円単位の端数が出ない", () => {
  const order = ["post", "dhl", "seino", "", "post_heavy", "dhl", "post", ""];
  let row = save("");
  for (const key of order) {
    row = save(key);
    assert.ok(HANDOVER_ALLOWED_AMOUNTS.includes(row.handover_reward),
      `${key} → ${row.handover_reward}円 が許可された金額ではありません`);
    assert.equal(row.handover_reward % 100, 0);
  }
});

test("西濃集荷とDHL集荷は金額が同じでも区別できる", () => {
  assert.equal(save("seino").handover_reward, 200);
  assert.equal(save("dhl").handover_reward, 200);
  assert.notEqual(save("seino").handover_reward_method, save("dhl").handover_reward_method);
});

// ─── 旧データ（201円など）の正規化 ─────────────────────────────
test("旧データの201/301/501円は200/300/500円に正規化される", () => {
  assert.equal(normalizeHandoverReward(201), 200);
  assert.equal(normalizeHandoverReward(301), 300);
  assert.equal(normalizeHandoverReward(501), 500);
  assert.equal(normalizeHandoverReward(0), 0);
  assert.equal(normalizeHandoverReward(null), 0);
});

test("旧データの201円からDHL集荷を復元できる", () => {
  assert.equal(handoverMethodFromReward(201), "dhl");
  assert.equal(handoverMethodFromReward(200), "seino");
  assert.equal(handoverMethodFromReward(300), "post");
  assert.equal(handoverMethodFromReward(500), "post_heavy");
  assert.equal(handoverMethodFromReward(0), "");
});

// ─── 不具合が起きていた実データの再現（2026年9月） ──────────────
// 集荷・持ち込みの内訳が 300+500+300+200+201 = 1,501円 になっていた
test("報告された1,501円が1,500円になる", () => {
  const rows = [
    { packing_reward: 500,  photo_reward: 100, operation_check_reward: 0, handover_reward: 300 },
    { packing_reward: 500,  photo_reward: 100, operation_check_reward: 0, handover_reward: 500 },
    { packing_reward: 500,  photo_reward: 100, operation_check_reward: 0, handover_reward: 300 },
    { packing_reward: 500,  photo_reward: 100, operation_check_reward: 0, handover_reward: 200 },
    { packing_reward: 500,  photo_reward: 100, operation_check_reward: 0, handover_reward: 201 }, // 旧DHL
    { packing_reward: 500,  photo_reward: 0,   operation_check_reward: 0, handover_reward: 0   },
  ];
  const b = calcRewardBreakdown(rows);
  assert.equal(b.packing, 3000);
  assert.equal(b.photo, 500);
  assert.equal(b.handover, 1500);       // 1,501円ではない
  assert.equal(b.total, 5000);          // 作業報酬合計 5,001円ではない

  const expenseTotal = 9220 + 440;      // 郵便送料 + 梱包資材
  assert.equal(expenseTotal, 9660);
  assert.equal(b.total + expenseTotal, 14660);  // 最終支払額 14,661円ではない
});

test("⑥ カード・内訳・明細・CSVが同じ計算元になる", () => {
  const rows = [
    { packing_reward: 500, photo_reward: 100, operation_check_reward: 200, handover_reward: 201 },
    { packing_reward: 800, photo_reward: 0,   operation_check_reward: 0,   handover_reward: 300 },
  ];
  // 明細（行ごと）の合計と、内訳（項目ごと）の合計が一致すること
  const perRow = rows.reduce((s, r) => s + calcWorkRewardTotal(r), 0);
  assert.equal(perRow, calcRewardBreakdown(rows).total);
  assert.equal(perRow, 1000 + 1100);
});

test("他の報酬項目は100円単位に丸めない（1円単位を保つ）", () => {
  const rows = [{ packing_reward: 1234, photo_reward: 0, operation_check_reward: 0, handover_reward: 0 }];
  assert.equal(calcWorkRewardTotal(rows[0]), 1234);
  assert.equal(calcRewardBreakdown(rows).packing, 1234);
});
