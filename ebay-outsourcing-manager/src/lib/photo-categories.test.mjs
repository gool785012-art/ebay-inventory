// 写真カテゴリーの廃止（Storage容量削減）のテスト
// 実行方法: node --test src/lib/photo-categories.test.mjs
// （本物の src/lib/constants.ts を直接読み込んで検証する）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PHOTO_CATEGORIES, UPLOADABLE_PHOTO_CATEGORIES, isRetiredPhotoCategory,
  TURNTABLE_CHECKLIST, SHIP_CHECKLIST,
} from "./constants.ts";

const RETIRED = ["outer_box", "serial", "before_packing", "packing", "label_attached"];
const KEPT = ["item", "accessory", "packed", "label", "other"];

test("廃止した5項目は新規アップロードの選択肢に出ない", () => {
  const keys = UPLOADABLE_PHOTO_CATEGORIES.map((c) => c.key);
  for (const k of RETIRED) assert.ok(!keys.includes(k), k);
});

test("通常の商品写真のカテゴリーは従来どおり選べる", () => {
  const keys = UPLOADABLE_PHOTO_CATEGORIES.map((c) => c.key);
  assert.deepEqual(keys, KEPT);
});

test("isRetiredPhotoCategory の判定", () => {
  for (const k of RETIRED) assert.equal(isRetiredPhotoCategory(k), true, k);
  for (const k of [...KEPT, "condition", "unknown"]) assert.equal(isRetiredPhotoCategory(k), false, k);
});

test("保存済み写真を正しく表示できるよう、廃止カテゴリーの表示名は残っている", () => {
  const label = (k) => PHOTO_CATEGORIES.find((c) => c.key === k)?.label;
  assert.equal(label("outer_box"), "外箱");
  assert.equal(label("serial"), "シリアル番号");
  assert.equal(label("before_packing"), "梱包前");
  assert.equal(label("packing"), "梱包途中");
  assert.equal(label("label_attached"), "発送ラベル貼付後");
});

test("撮影できなくなった写真の確認項目はチェックリストから外れている", () => {
  const tt = TURNTABLE_CHECKLIST.map((c) => c.key);
  assert.ok(!tt.includes("photo_before"));
  assert.ok(!tt.includes("photo_during"));
  assert.ok(tt.includes("photo_after"), "梱包完了（梱包後）の写真は残す");
  assert.ok(tt.includes("platter_removed"), "梱包作業の項目は残す");
  const ship = SHIP_CHECKLIST.map((c) => c.key);
  assert.ok(!ship.includes("ship_photo_taken"));
  assert.deepEqual(ship, [
    "ship_carrier_checked", "ship_label_checked", "ship_item_matches",
    "ship_tracking_checked", "ship_label_attached",
  ]);
});
