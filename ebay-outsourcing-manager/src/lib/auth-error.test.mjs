// ログインエラーの分類テスト
// 実行方法: node --test src/lib/auth-error.test.mjs
// （本物の src/lib/auth-error.ts を直接読み込んで検証する）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyAuthError, formatAuthErrorDetail, AUTH_ERROR_MESSAGES,
} from "./auth-error.ts";

// supabase-js が返すエラーと同じ形
const apiError = (status, code, message = "x") =>
  Object.assign(new Error(message), { name: "AuthApiError", status, code });
const retryable = (status, message = "Failed to fetch") =>
  Object.assign(new Error(message), { name: "AuthRetryableFetchError", status, code: undefined });
const unknownErr = () =>
  Object.assign(new Error("Unexpected token <"), { name: "AuthUnknownError", status: undefined, code: undefined });

test("メールアドレス・パスワードの間違い（400 invalid_credentials）", () => {
  const d = classifyAuthError(apiError(400, "invalid_credentials", "Invalid login credentials"), 200);
  assert.equal(d.kind, "invalid_credentials");
  assert.equal(d.status, 400);
  assert.equal(d.code, "invalid_credentials");
});

test("コードの付かない旧形式の400も資格情報の誤り", () => {
  assert.equal(classifyAuthError(apiError(400, undefined), 200).kind, "invalid_credentials");
});

test("接続エラー（fetch失敗 → status 0）", () => {
  const d = classifyAuthError(retryable(0), 0);
  assert.equal(d.kind, "network");
  assert.equal(d.status, 0);
});

test("ブラウザの fetch 失敗（TypeError）も接続エラー", () => {
  assert.equal(classifyAuthError(new TypeError("Failed to fetch"), 0).kind, "network");
});

test("利用制限（402）", () => {
  assert.equal(classifyAuthError(apiError(402, undefined), 402).kind, "restricted");
});

test("本文がJSONでなくステータスが失われても、接続確認の402で利用制限と分かる", () => {
  const d = classifyAuthError(unknownErr(), 402);
  assert.equal(d.kind, "restricted");
  assert.equal(d.status, null);
  assert.equal(d.healthStatus, 402);
});

test("試行回数の制限（429 / over_request_rate_limit）", () => {
  assert.equal(classifyAuthError(apiError(429, "over_request_rate_limit"), 200).kind, "rate_limited");
  assert.equal(classifyAuthError(apiError(429, undefined), 200).kind, "rate_limited");
});

test("Supabaseが応答しない（503 / 540）", () => {
  assert.equal(classifyAuthError(retryable(503, "Service Unavailable"), 503).kind, "unavailable");
  assert.equal(classifyAuthError(apiError(540, undefined), 540).kind, "unavailable");
  assert.equal(classifyAuthError(unknownErr(), 540).kind, "unavailable");
});

test("メール未確認", () => {
  assert.equal(classifyAuthError(apiError(400, "email_not_confirmed"), 200).kind, "email_not_confirmed");
});

test("その他の認証エラー（例: アカウント停止）", () => {
  const d = classifyAuthError(apiError(400, "user_banned"), 200);
  assert.equal(d.kind, "other");
  assert.equal(d.code, "user_banned");
});

test("正体不明のエラーで接続確認も正常ならその他", () => {
  assert.equal(classifyAuthError(unknownErr(), 200).kind, "other");
  assert.equal(classifyAuthError(null, null).kind, "other");
});

test("すべての種別に画面用メッセージがある", () => {
  for (const k of ["invalid_credentials", "network", "restricted", "rate_limited", "unavailable", "email_not_confirmed", "other"]) {
    assert.ok(AUTH_ERROR_MESSAGES[k]?.length > 0, k);
  }
});

// ─── 機密情報を表示・記録しないこと ───────────────────────────────
test("エラーメッセージ本文・トークン・パスワードは詳細に含まれない", () => {
  const secret = "eyJhbGciOiJIUzI1NiJ9.SECRET-TOKEN";
  const err = Object.assign(new Error(`password=hunter2 token=${secret}`), {
    name: "AuthApiError", status: 400, code: "invalid_credentials",
    access_token: secret, password: "hunter2",
  });
  const d = classifyAuthError(err, 200);
  const shown = formatAuthErrorDetail(d) + JSON.stringify(d);
  assert.ok(!shown.includes("hunter2"));
  assert.ok(!shown.includes(secret));
  assert.ok(!shown.includes("token"));
  assert.deepEqual(Object.keys(d).sort(), ["code", "healthStatus", "kind", "name", "status"]);
});

test("想定外の形式の name / code は表示しない", () => {
  const err = { name: "<script>alert(1)</script>", status: 400, code: "Bearer abc.def.ghi" };
  const d = classifyAuthError(err, 200);
  assert.equal(d.name, null);
  assert.equal(d.code, null);
});

test("表示用の詳細の形式", () => {
  const s = formatAuthErrorDetail(classifyAuthError(apiError(402, undefined), 402));
  assert.equal(s, "種別: restricted / HTTP: 402 / コード: なし / 接続確認: HTTP 402 / エラー: AuthApiError");
  assert.ok(formatAuthErrorDetail(classifyAuthError(retryable(0), 0)).includes("HTTP: 接続失敗"));
});
