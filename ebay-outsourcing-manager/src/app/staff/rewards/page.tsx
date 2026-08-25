import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { requireProfile } from "@/lib/auth";
import { paymentStatusLabel, paymentBadgeClass, fmtYen } from "@/lib/constants";
import { parseMonth, monthRange, shiftMonth, monthLabel } from "@/lib/month";

function fmtDate(d: string) {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

// スタッフ本人の報酬ページ（Phase 5）
// RLSにより自分の報酬データしか取得できない
export default async function StaffRewardsPage(props: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const sp = await props.searchParams;
  const { supabase, profile } = await requireProfile("staff");

  const month = parseMonth(sp.month);
  const { start, end } = monthRange(month);

  const { data: rewards } = await supabase
    .from("work_rewards")
    .select("id, completed_at, reward_amount, payment_status, products(name)")
    .gte("completed_at", start)
    .lt("completed_at", end)
    .order("completed_at");

  type Row = {
    id: string; completed_at: string; reward_amount: number; payment_status: string;
    products: { name: string } | null;
  };
  const rows = (rewards ?? []) as unknown as Row[];

  const totalCount = rows.length;
  const totalAmount = rows.reduce((s, r) => s + r.reward_amount, 0);
  const unpaidAmount = rows
    .filter((r) => r.payment_status === "unpaid")
    .reduce((s, r) => s + r.reward_amount, 0);
  const paidAmount = rows
    .filter((r) => r.payment_status === "paid")
    .reduce((s, r) => s + r.reward_amount, 0);

  const cards = [
    { label: "今月の作業", value: `${totalCount} 件`, color: "border-t-blue-500" },
    { label: "今月の報酬", value: fmtYen(totalAmount), color: "border-t-slate-500" },
    { label: "未払い", value: fmtYen(unpaidAmount), color: "border-t-red-500" },
    { label: "支払済み", value: fmtYen(paidAmount), color: "border-t-green-500" },
  ];

  return (
    <>
      <AppHeader fullName={profile.full_name || profile.email || ""} role="staff" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-4 text-xl font-bold text-slate-800">報酬</h1>

        {/* 月切り替え */}
        <div className="mb-4 flex items-center gap-2">
          <Link href={`/staff/rewards?month=${shiftMonth(month, -1)}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 active:bg-slate-100">
            ← 前月
          </Link>
          <span className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-center text-base font-bold text-white">
            {monthLabel(month)}
          </span>
          <Link href={`/staff/rewards?month=${shiftMonth(month, 1)}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 active:bg-slate-100">
            翌月 →
          </Link>
        </div>

        {/* サマリーカード（スマホ最上部） */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <div key={c.label}
              className={`rounded-xl border border-slate-200 border-t-4 bg-white p-4 shadow-sm ${c.color}`}>
              <div className="text-xs font-semibold text-slate-500">{c.label}</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{c.value}</div>
            </div>
          ))}
        </div>

        {/* 内訳 */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-4 py-3 text-base font-bold text-slate-700">
            内訳（{rows.length}件）
          </h2>
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              この月に完了した作業はありません
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2">完了日</th>
                  <th className="px-3 py-2">商品名</th>
                  <th className="px-3 py-2 text-right">報酬</th>
                  <th className="px-3 py-2">支払状況</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{fmtDate(r.completed_at)}</td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 font-semibold text-slate-700">
                      {r.products?.name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-slate-800">
                      {fmtYen(r.reward_amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${paymentBadgeClass(r.payment_status)}`}>
                        {paymentStatusLabel(r.payment_status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50">
                  <td colSpan={2} className="px-3 py-2.5 text-right text-sm font-bold text-slate-600">合計</td>
                  <td className="px-3 py-2.5 text-right text-base font-bold text-slate-800">{fmtYen(totalAmount)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          ※ 報酬は商品の発送が完了した時点で確定します。支払いについての質問は管理者に連絡してください。
        </p>
      </main>
    </>
  );
}
