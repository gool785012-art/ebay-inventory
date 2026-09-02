import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import SettlementStatus from "@/components/SettlementStatus";
import { requireProfile } from "@/lib/auth";
import { fmtYen } from "@/lib/constants";
import { parseMonth, monthRange, shiftMonth, monthLabel } from "@/lib/month";
import type { Profile } from "@/types/db";

// 月次精算ページ（管理者用、Phase 11）
export default async function SettlementsPage(props: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const sp = await props.searchParams;
  const { supabase, profile } = await requireProfile("admin");

  const month = parseMonth(sp.month);
  const { start, end } = monthRange(month);

  const [{ data: staffList }, { data: rewards }, { data: expenses }, { data: settlements }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("role", "staff").order("full_name"),
      supabase
        .from("work_rewards")
        .select("staff_id, packing_reward, photo_reward, operation_check_reward, handover_reward")
        .gte("completed_at", start)
        .lt("completed_at", end),
      supabase
        .from("product_expenses")
        .select("amount, status, products(assigned_staff_id)")
        .eq("status", "approved")
        .gte("created_at", start)
        .lt("created_at", end),
      supabase.from("staff_settlements").select("*").eq("month", month),
    ]);

  type ExpRow = { amount: number; products: { assigned_staff_id: string } | null };
  const expRows = (expenses ?? []) as unknown as ExpRow[];

  const rows = ((staffList ?? []) as Profile[]).map((s) => {
    const myRewards = (rewards ?? []).filter((r) => r.staff_id === s.id);
    const rewardTotal = myRewards.reduce(
      (sum, r) =>
        sum + r.packing_reward + r.photo_reward + r.operation_check_reward + r.handover_reward,
      0
    );
    const expenseTotal = expRows
      .filter((e) => e.products?.assigned_staff_id === s.id)
      .reduce((sum, e) => sum + e.amount, 0);
    const settlement = (settlements ?? []).find((x) => x.staff_id === s.id);
    return {
      staff: s,
      count: myRewards.length,
      rewardTotal,
      expenseTotal,
      paymentTotal: rewardTotal + expenseTotal,
      settlement,
    };
  });

  return (
    <>
      <AppHeader fullName={profile.full_name || profile.email || ""} role="admin" />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-1 text-xl font-bold text-slate-800">月次精算</h1>
        <p className="mb-4 text-sm text-slate-500">
          スタッフごとの作業報酬と立替金をまとめ、精算書を作成できます。
        </p>

        {/* 月切り替え */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link href={`/admin/settlements?month=${shiftMonth(month, -1)}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            ← 前月
          </Link>
          <span className="rounded-lg bg-blue-600 px-4 py-2 text-base font-bold text-white">
            {monthLabel(month)}
          </span>
          <Link href={`/admin/settlements?month=${shiftMonth(month, 1)}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            翌月 →
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            スタッフが登録されていません
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => (
              <div key={r.staff.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-slate-800">
                    {r.staff.full_name || r.staff.email}
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                    {r.count} 件
                  </span>
                </div>

                <div className="mb-3 grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">作業報酬</div>
                    <div className="text-lg font-bold text-slate-800">{fmtYen(r.rewardTotal)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">立替金</div>
                    <div className="text-lg font-bold text-slate-800">{fmtYen(r.expenseTotal)}</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3">
                    <div className="text-xs text-blue-600">支払合計</div>
                    <div className="text-lg font-bold text-blue-700">{fmtYen(r.paymentTotal)}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/admin/settlements/print?month=${month}&staff=${r.staff.id}`}
                    target="_blank"
                    className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
                  >
                    📄 精算書PDFを作成
                  </Link>
                  <SettlementStatus
                    staffId={r.staff.id}
                    month={month}
                    rewardTotal={r.rewardTotal}
                    expenseTotal={r.expenseTotal}
                    paymentTotal={r.paymentTotal}
                    settlement={r.settlement ?? null}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
