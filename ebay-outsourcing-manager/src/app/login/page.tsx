"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  AUTH_ERROR_MESSAGES, checkAuthHealth, classifyAuthError, formatAuthErrorDetail,
} from "@/lib/auth-error";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setErrorDetail("");
    setLoading(true);

    const supabase = createClient();
    let authError: unknown = null;
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      authError = error;
    } catch (thrown) {
      authError = thrown; // 設定不備などで例外になった場合も原因を表示する
    }

    if (authError) {
      // 失敗したときだけ Supabase への接続を確認し、原因を切り分ける
      const healthStatus = await checkAuthHealth(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
      const detail = classifyAuthError(authError, healthStatus);
      setError(AUTH_ERROR_MESSAGES[detail.kind]);
      setErrorDetail(formatAuthErrorDetail(detail));
      // 調査用の記録（パスワード・トークン・メールアドレスは含めない）
      console.warn("[login] 認証エラー", detail);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-800">eBay外注管理ツール</h1>
          <p className="mt-2 text-sm text-slate-500">
            メールアドレスとパスワードでログインしてください
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <label className="mb-1 block text-sm font-semibold text-slate-600">
            メールアドレス
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />

          <label className="mb-1 block text-sm font-semibold text-slate-600">
            パスワード
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
              <p>{error}</p>
              {errorDetail && (
                <p className="mt-1 break-all font-mono text-[11px] text-red-400">{errorDetail}</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 text-base font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          アカウントは管理者から発行されます。
          <br />
          ログインできない場合は管理者に連絡してください。
        </p>
      </div>
    </main>
  );
}
