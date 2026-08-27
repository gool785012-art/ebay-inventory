import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { requireProfile } from "@/lib/auth";
import { STATUSES, statusLabel, fmtYen } from "@/lib/constants";
import { parseMonth, monthRange, monthLabel } from "@/lib/month";

// 管理者ダッシュボード（Phase 1: ステータス別件数カードの土台。Phase 2以降で拡充）
export default async function AdminDashboard() {
  const { supabase, profile } = await requireProfile("admin");

  const month = parseMonth(undefined);
  const { start, end } = monthRange(month);

  const [{ data: products }, { data: rewards }, { data: sharedLabels }] = await Promise.all([
    supabase.from("products").select("id, status, has_problem"),
    supabase
      .from("work_rewards")
      .select("reward_amount, payment_status")
      .gte("completed_at", start)
      .lt("completed_at", end),
    supabase
      .from("shipping_documents")
      .select("product_id")
      .eq("document_type", "label")
      .not("shared_at", "is", null),
  ]);

  // 発送ラベル待ち: 梱包完了・発送待ちなのにラベルが未共有の商品（Phase 6）
  const sharedLabelSet = new Set((sharedLabels ?? []).map((d) => d.product_id));
  const labelWaitingCount = (products ?? []).filter(
    (p) => ["packed", "ready_to_ship"].includes(p.status) && !sharedLabelSet.has(p.id)
  ).length;

  const counts: Record<string, number> = {};
  for (const s of STATUSES) counts[s.key] = 0;
  let problemCount = 0;
  for (const p of products ?? []) {
    counts[p.status] = (counts[p.status] ?? 0) + 1;
    if (p.has_problem) problemCount++;
  }

  // 今月の報酬集計（Phase 5）
  const rewardRows = rewards ?? [];
  const rewardCards = [
    { label: "今月の完了件数", value: `${rewardRows.length} 件`, color: "border-t-blue-500" },
    { label: "今月の外注費", value: fmtYen(rewardRows.reduce((s, r) => s + r.reward_amount, 0)), color: "border-t-slate-500" },
    { label: "未払い報酬", value: fmtYen(rewardRows.filter((r) => r.payment_status === "unpaid").reduce((s, r) => s + r.reward_amount, 0)), color: "border-t-red-500" },
    { label: "支払済み", value: fmtYen(rewardRows.filter((r) => r.payment_status === "paid").reduce((s, r) => s + r.reward_amount, 0)), color: "border-t-green-500" },
  ];

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

        {labelWaitingCount > 0 && (
          <Link href="/admin/products?status=packed"
            className="mb-6 block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100">
            📄 発送ラベル待ち: {labelWaitingCount} 件（梱包が終わったのにラベルが未共有の商品があります。クリックで確認）
          </Link>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {todayCards.map((c) => (
            <Link
              key={c.key}
              href={`/admin/products?status=${c.key}`}
              className={`rounded-xl border border-slate-200 border-t-4 bg-white p-4 shadow-sm transition hover:shadow-md ${c.color}`}
            >
              <div className="text-xs font-semibold text-slate-500">{c.label}</div>
              <div className="mt-1 text-2xl font-bold text-slate-800">
                {counts[c.key] ?? 0}
                <span className="ml-1 text-sm font-normal text-slate-400">件</span>
              </div>
            </Link>
          ))}
        </div>

        {/* 今月の外注報酬（Phase 5） */}
        <div className="mt-8">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-700">{monthLabel(month)}の外注報酬</h2>
            <Link href="/admin/payments" className="text-sm font-semibold text-blue-600 hover:underline">
              報酬管理を開く →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {rewardCards.map((c) => (
              <Link key={c.label} href="/admin/payments"
                className={`rounded-xl border border-slate-200 border-t-4 bg-white p-4 shadow-sm transition hover:shadow-md ${c.color}`}>
                <div className="text-xs font-semibold text-slate-500">{c.label}</div>
                <div className="mt-1 text-xl font-bold text-slate-800">{c.value}</div>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-700">全ステータス</h2>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Link
                key={s.key}
                href={`/admin/products?status=${s.key}`}
                className={`rounded-full border px-3 py-1 text-sm font-semibold transition hover:opacity-70 ${s.badge}`}
              >
                {statusLabel(s.key)}: {counts[s.key] ?? 0}件
              </Link>
            ))}
          </div>
        </div>

      </main>
    </>
  );
}
