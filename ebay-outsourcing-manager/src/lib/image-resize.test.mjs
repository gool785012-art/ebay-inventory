// 写真縮小のサイズ計算テスト
// 実行方法: node --test src/lib/image-resize.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

// src/lib/image-resize.ts と同じロジック
const MAX_EDGE = 1600;
function computeTargetSize(width, height, maxEdge = MAX_EDGE) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

test("横長 4000x3000 → 1600x1200（縦横比を保つ）", () => {
  assert.deepEqual(computeTargetSize(4000, 3000), { width: 1600, height: 1200 });
});

test("縦長 3024x4032（iPhone縦撮り）→ 長辺が1600になる", () => {
  const r = computeTargetSize(3024, 4032);
  assert.equal(r.height, 1600);
  assert.equal(r.width, 1200);
});

test("上限以下の画像は拡大しない", () => {
  assert.deepEqual(computeTargetSize(1200, 800), { width: 1200, height: 800 });
  assert.deepEqual(computeTargetSize(1600, 1600), { width: 1600, height: 1600 });
});

test("極端な縦横比でも0pxにならない", () => {
  const r = computeTargetSize(20000, 10);
  assert.equal(r.width, 1600);
  assert.ok(r.height >= 1);
});
