// 画面上部の共通ヘッダー（ユーザー名・権限・ログアウトボタン）
export default function AppHeader({
  fullName,
  role,
}: {
  fullName: string;
  role: "admin" | "staff";
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <span className="text-lg font-bold text-slate-800">eBay外注管理</span>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
            role === "admin"
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {role === "admin" ? "管理者" : "スタッフ"}
        </span>
        <div className="flex-1" />
        <span className="hidden text-sm text-slate-500 sm:inline">
          {fullName}
        </span>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            ログアウト
          </button>
        </form>
      </div>
    </header>
  );
}
