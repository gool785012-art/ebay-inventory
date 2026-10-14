// ログイン失敗の原因を分類する
//
// これまではどんなエラーでも「メールアドレスまたはパスワードが正しくありません」と
// 表示していたため、Supabase の利用制限や接続障害と区別できなかった。
// ここでは Supabase が返す HTTP ステータス・エラーコードから原因を判定する。
//
// 機密情報は扱わない: 判定と表示に使うのはエラーの種類名・HTTPステータス・
// エラーコードだけで、パスワード・アクセストークン・メールアドレス・
// エラーメッセージ本文は表示も記録もしない。

export type AuthErrorKind =
  | "invalid_credentials" // メールアドレス・パスワードの間違い
  | "network"             // Supabase に接続できない
  | "restricted"          // Supabase の利用制限（送信量超過など）
  | "rate_limited"        // ログイン試行回数の制限
  | "unavailable"         // Supabase が応答しない（一時停止・障害など）
  | "email_not_confirmed" // メール未確認
  | "other";              // その他の認証エラー

/** 画面・ログに出してよい情報だけを持つ */
export type AuthErrorDetail = {
  kind: AuthErrorKind;
  /** エラーの種類名（例: AuthApiError） */
  name: string | null;
  /** ログイン要求の HTTP ステータス（0 = 接続できなかった / null = 不明） */
  status: number | null;
  /** Supabase のエラーコード（例: invalid_credentials） */
  code: string | null;
  /** 接続確認（/auth/v1/health）の HTTP ステータス（0 = 接続できなかった） */
  healthStatus: number | null;
};

export const AUTH_ERROR_MESSAGES: Record<AuthErrorKind, string> = {
  invalid_credentials: "メールアドレスまたはパスワードが正しくありません。",
  network:
    "Supabaseに接続できませんでした。通信環境を確認するか、しばらくしてから再度お試しください。",
  restricted:
    "Supabaseの利用制限中のためログインできません。管理者はSupabaseの使用状況（Usage）を確認してください。",
  rate_limited: "ログインの試行回数が多すぎます。しばらく待ってから再度お試しください。",
  unavailable:
    "Supabaseが応答していません（プロジェクトの一時停止・利用制限・障害の可能性があります）。管理者はSupabaseのダッシュボードを確認してください。",
  email_not_confirmed: "メールアドレスの確認が完了していません。管理者に連絡してください。",
  other: "ログインできませんでした（認証エラー）。管理者に連絡してください。",
};

// Supabase（Cloudflare 経由）がサーバー側の不調で返すステータス
const UNAVAILABLE_STATUSES = new Set([
  500, 501, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530, 540,
]);

// 想定外の文字列をそのまま画面に出さないよう、形式が正しいものだけ通す
function safeName(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z]{1,60}$/.test(v) ? v : null;
}
function safeCode(v: unknown): string | null {
  return typeof v === "string" && /^[a-z0-9_]{1,60}$/.test(v) ? v : null;
}
function safeStatus(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1000 ? v : null;
}

function kindFromStatus(status: number | null): AuthErrorKind | null {
  if (status === null) return null;
  if (status === 0) return "network";
  if (status === 402) return "restricted";
  if (status === 429) return "rate_limited";
  if (UNAVAILABLE_STATUSES.has(status)) return "unavailable";
  return null;
}

/**
 * ログインで返ってきたエラーを分類する。
 * @param error signInWithPassword が返した（または投げた）エラー
 * @param healthStatus 失敗後に確認した /auth/v1/health の HTTP ステータス
 */
export function classifyAuthError(error: unknown, healthStatus: number | null = null): AuthErrorDetail {
  const e = (typeof error === "object" && error !== null ? error : {}) as Record<string, unknown>;
  const name = safeName(e.name);
  const status = safeStatus(e.status);
  const code = safeCode(e.code);
  const health = safeStatus(healthStatus);

  let kind: AuthErrorKind | null = null;

  // 1. エラーコードがあれば最優先（最も正確）
  if (code === "invalid_credentials") kind = "invalid_credentials";
  else if (code === "email_not_confirmed") kind = "email_not_confirmed";
  else if (code === "over_request_rate_limit") kind = "rate_limited";

  // 2. HTTP ステータスから判定
  if (!kind) kind = kindFromStatus(status);

  // 3. 接続できなかった場合（fetch 自体の失敗）
  if (!kind && name === "AuthRetryableFetchError") kind = "network";
  if (!kind && name === "TypeError") kind = "network"; // fetch の失敗はブラウザでは TypeError

  // 4. 旧形式: コードが付かない 400 は資格情報の誤り
  if (!kind && status === 400 && !code) kind = "invalid_credentials";

  // 5. まだ分からなければ、接続確認の結果で判定（本文がJSONでない応答はステータスが失われるため）
  if (!kind || kind === "other") {
    const fromHealth = kindFromStatus(health);
    if (fromHealth) kind = fromHealth;
  }

  return { kind: kind ?? "other", name, status, code, healthStatus: health };
}

/** 画面に表示する詳細（機密情報を含まない） */
export function formatAuthErrorDetail(d: AuthErrorDetail): string {
  const parts = [
    `種別: ${d.kind}`,
    `HTTP: ${d.status === null ? "不明" : d.status === 0 ? "接続失敗" : d.status}`,
    `コード: ${d.code ?? "なし"}`,
    `接続確認: ${d.healthStatus === null ? "未実施" : d.healthStatus === 0 ? "接続失敗" : `HTTP ${d.healthStatus}`}`,
  ];
  if (d.name) parts.push(`エラー: ${d.name}`);
  return parts.join(" / ");
}

/**
 * Supabase Auth に接続できるかを確認する（ログイン失敗時のみ呼ぶ）。
 * 公開されている anon キーだけを使い、応答本文は読まずに HTTP ステータスだけを返す。
 */
export async function checkAuthHealth(
  supabaseUrl: string | undefined,
  anonKey: string | undefined,
  timeoutMs = 8000
): Promise<number> {
  if (!supabaseUrl || !anonKey) return 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/health`, {
      headers: { apikey: anonKey },
      cache: "no-store",
      signal: controller.signal,
    });
    return res.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}
