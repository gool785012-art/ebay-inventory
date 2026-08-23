import AppHeader from "@/components/AppHeader";
import { requireProfile } from "@/lib/auth";
import { STATUSES, statusLabel } from "@/lib/constants";

// 管理者ダッシュボード（Phase 1: ステータス別件数カードの土台。Phase 2以降で拡充）
export default async function AdminDashboard() {
  const { supabase, profile } = await requireProfile("admin");

  const { data: products } = await supabase
    .from("products")
    .select("id, status, has_problem");

  const counts: Record<string, number> = {};
  for (const s of STATUSES) counts[s.key] = 0;
  let problemCount = 0;
  for (const p of products ?? []) {
    counts[p.status] = (counts[p.status] ?? 0) + 1;
    if (p.has_problem) problemCount++;
  }

  // 「本日の状況」カード（要件4）
  const todayCards = [
    { key: "sent_to_staff", label: "未着", color: "border-t-indigo-500" },
    { key: "arrived", label: "商品到着", color: "border-t-blue-500" },
    { key: "inspecting", label: "検品待ち", color: "border-t-yellow-500" },
    { key: "packing", label: "梱包待ち", color: "border-t-amber-500" },
    { key: "ready_to_ship", label: "発送待ち", color: "border-t-orange-500" },
    { key: "shipped", label: "発送済み", color: "border-t-green-500" },
  ];

  return (
    <>
      <AppHeader fullName={profile.full_name || profile.email || ""} role="admin" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="mb-1 text-xl font-bold text-slate-800">ダッシュボード</h1>
        <p className="mb-6 text-sm text-slate-500">本日の状況</p>

        {problemCount > 0 && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            ⚠️ 問題が報告されている商品が {problemCount} 件あります
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {todayCards.map((c) => (
            <div
              key={c.key}
              className={`rounded-xl border border-slate-200 border-t-4 bg-white p-4 shadow-sm ${c.color}`}
            >
              <div className="text-xs font-semibold text-slate-500">{c.label}</div>
              <div className="mt-1 text-2xl font-bold text-slate-800">
                {counts[c.key] ?? 0}
                <span className="ml-1 text-sm font-normal text-slate-400">件</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-700">全ステータス</h2>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <span
                key={s.key}
                className={`rounded-full border px-3 py-1 text-sm font-semibold ${s.badge}`}
              >
                {statusLabel(s.key)}: {counts[s.key] ?? 0}件
              </span>
            ))}
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          商品管理・スタッフ管理・報酬集計は Phase 2 以降で追加されます。
        </div>
      </main>
    </>
  );
}
