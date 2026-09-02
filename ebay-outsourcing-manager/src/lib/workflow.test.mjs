// 発送方法別の作業指示テスト（Phase 11）
// 実行方法: node --test src/lib/workflow.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

// src/lib/workflow.ts と同じロジック
function baseTasks(photoRequired, operationRequired) {
  return [
    { key: "check_item", label: "商品確認" },
    { key: "weigh", label: "重量確認" },
    ...(photoRequired ? [{ key: "photo", label: "商品状態の写真撮影", reward: "＋100円" }] : []),
    ...(operationRequired ? [{ key: "operation", label: "動作確認", reward: "＋200円" }] : []),
    { key: "packing", label: "梱包" },
  ];
}

function getWorkTasks(carrierName, photoRequired, operationRequired) {
  const base = baseTasks(photoRequired, operationRequired);
  if (carrierName.includes("西濃")) {
    return [...base,
      { key: "check_label", label: "発送ラベル確認" },
      { key: "attach_label", label: "ラベル貼付" },
      { key: "handover_driver", label: "西濃ドライバーへ荷物を渡す" },
      { key: "complete", label: "発送完了" }];
  }
  if (carrierName === "DHL") {
    return [...base,
      { key: "check_label", label: "DHLラベル確認" },
      { key: "check_invoice", label: "インボイス確認" },
      { key: "attach_docs", label: "必要な書類を荷物に取り付ける" },
      { key: "handover_driver", label: "DHLドライバーへ荷物を渡す" },
      { key: "complete", label: "発送完了" }];
  }
  if (carrierName === "Japan Post" || carrierName.includes("郵便")) {
    return [
      { key: "check_item", label: "商品確認" },
      { key: "weigh", label: "重さを測る" },
      { key: "input_weight", label: "ツールへ重量入力" },
      ...(photoRequired ? [{ key: "photo", label: "商品状態の写真撮影", reward: "＋100円" }] : []),
      ...(operationRequired ? [{ key: "operation", label: "動作確認", reward: "＋200円" }] : []),
      { key: "packing", label: "梱包" },
      { key: "check_label", label: "発送ラベル確認" },
      { key: "check_invoice", label: "インボイス確認" },
      { key: "print_docs", label: "ラベル・インボイス印刷" },
      { key: "photo_parcel", label: "荷物の写真" },
      { key: "bring_post", label: "郵便局へ持ち込み", reward: "＋300円" },
      { key: "post_reception", label: "郵便局で受付" },
      { key: "check_customs", label: "国際郵便申告書の確認" },
      { key: "get_receipt_copy", label: "受付控えを受け取る" },
      { key: "get_receipt", label: "領収書を受け取る" },
      { key: "upload_receipt_copy", label: "受付控えをアップ" },
      { key: "upload_receipt", label: "領収書をアップ" },
      { key: "input_postage", label: "実際に支払った郵便送料を入力" },
      { key: "complete", label: "発送完了" }];
  }
  return [...base,
    { key: "check_label", label: "発送ラベル確認" },
    { key: "check_invoice", label: "インボイス確認" },
    { key: "attach_label", label: "ラベル貼付" },
    { key: "handover_driver", label: "配送業者へ荷物を渡す" },
    { key: "complete", label: "発送完了" }];
}

const keysOf = (tasks) => tasks.map((t) => t.key);

test("テスト1: 国際郵便 → 郵便局持ち込み関連の作業が自動表示される", () => {
  const keys = keysOf(getWorkTasks("Japan Post", false, false));
  assert.ok(keys.includes("bring_post"), "郵便局へ持ち込みが含まれる");
  assert.ok(keys.includes("post_reception"), "郵便局で受付が含まれる");
  assert.ok(keys.includes("get_receipt_copy"), "受付控えを受け取るが含まれる");
  assert.ok(keys.includes("upload_receipt"), "領収書をアップが含まれる");
  assert.ok(keys.includes("input_postage"), "実際の送料入力が含まれる");
});

test("テスト2: DHL → 郵便局持ち込み項目は表示されない", () => {
  const keys = keysOf(getWorkTasks("DHL", false, false));
  assert.ok(!keys.includes("bring_post"), "郵便局へ持ち込みは含まれない");
  assert.ok(!keys.includes("post_reception"), "郵便局で受付は含まれない");
  assert.ok(!keys.includes("get_receipt_copy"), "受付控えは含まれない");
  assert.ok(keys.includes("check_invoice"), "インボイス確認は含まれる");
  assert.ok(keys.includes("handover_driver"), "ドライバーへ渡すが含まれる");
});

test("西濃 → 郵便局・インボイス関連は表示されない", () => {
  const tasks = getWorkTasks("西濃運輸", false, false);
  const keys = keysOf(tasks);
  assert.ok(!keys.includes("bring_post"));
  assert.ok(!keys.includes("check_invoice"));
  assert.ok(tasks.some((t) => t.label.includes("西濃ドライバー")));
});

test("写真・動作確認が不要なら作業リストに出さない", () => {
  const keys = keysOf(getWorkTasks("DHL", false, false));
  assert.ok(!keys.includes("photo"));
  assert.ok(!keys.includes("operation"));
});

test("写真・動作確認が必要なら報酬付きで作業リストに出す", () => {
  const tasks = getWorkTasks("DHL", true, true);
  const photo = tasks.find((t) => t.key === "photo");
  const operation = tasks.find((t) => t.key === "operation");
  assert.equal(photo.reward, "＋100円");
  assert.equal(operation.reward, "＋200円");
});
