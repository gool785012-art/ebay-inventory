// Storage パス変換のテスト
// 実行方法: node --test src/lib/storage-path.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

// src/lib/storage-path.ts と同じロジック
function toStoragePath(value, bucket) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) {
    return decodeURIComponent(raw.replace(/^\/+/, ""));
  }
  let pathname = raw;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    pathname = raw.split("?")[0];
  }
  const marker = `/${bucket}/`;
  const idx = pathname.indexOf(marker);
  const path = idx >= 0 ? pathname.slice(idx + marker.length) : pathname.replace(/^\/+/, "");
  return decodeURIComponent(path);
}

const B = "product-photos";

test("バケット内のパスはそのまま返す", () => {
  assert.equal(toStoragePath("abc/item/1.jpg", B), "abc/item/1.jpg");
  assert.equal(toStoragePath("/abc/item/1.jpg", B), "abc/item/1.jpg");
});

test("public URL からパスを取り出す", () => {
  assert.equal(
    toStoragePath("https://x.supabase.co/storage/v1/object/public/product-photos/abc/item/1.jpg", B),
    "abc/item/1.jpg",
  );
});

test("signed URL（クエリ付き）からパスを取り出す", () => {
  assert.equal(
    toStoragePath(
      "https://x.supabase.co/storage/v1/object/sign/product-photos/abc/item/1.jpg?token=xyz",
      B,
    ),
    "abc/item/1.jpg",
  );
});

test("URLエンコードされた日本語ファイル名を戻す", () => {
  assert.equal(
    toStoragePath(
      "https://x.supabase.co/storage/v1/object/public/product-photos/abc/item/%E5%86%99%E7%9C%9F.jpg",
      B,
    ),
    "abc/item/写真.jpg",
  );
});

test("空文字は空文字", () => {
  assert.equal(toStoragePath("", B), "");
});
