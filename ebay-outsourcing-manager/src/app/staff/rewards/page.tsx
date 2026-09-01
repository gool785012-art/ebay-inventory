import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { requireProfile } from "@/lib/auth";
import { paymentStatusLabel, paymentBadgeClass, fmtYen } from "@/lib/constants";
import { expenseTypeLabel, expenseStatusLabel, expenseStatusBadge } from "@/lib/reward";
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

  const [{ data: rewards }, { data: expenses }] = await Promise.all([
    supabase
      .from("work_rewards")
      .select(
        "id, product_id, completed_at, reward_amount, payment_status, packing_reward, photo_reward, operation_check_reward, handover_reward, reimbursement, products(name)"
      )
      .gte("completed_at", start)
      .lt("completed_at", end)
      .order("completed_at"),
    // 自分の担当商品の立替金（RLSで自分の分だけ返る）
    supabase
      .from("product_expenses")
      .select("id, product_id, expense_type, description, amount, status, created_at, products(name, control_number)")
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at"),
  ]);

  type Row = {
    id: string; product_id: string; completed_at: string; reward_amount: number;
    payment_status: string;
    packing_reward: number; photo_reward: number;
    operation_check_reward: number; handover_reward: number; reimbursement: number;
    products: { name: string } | null;
  };
  const rows = (rewards ?? []) as unknown as Row[];

  type ExpenseRow = {
    id: string; product_id: string; expense_type: string; description: string;
    amount: number; status: string; created_at: string;
    products: { name: string; control_number: string } | null;
  };
  const expenseRows = (expenses ?? []) as unknown as ExpenseRow[];

  const totalCount = rows.length;
  // 作業報酬（立替金を除いた金額）
  const rewardOnly = (r: Row) =>
    r.packing_reward + r.photo_reward + r.operation_check_reward + r.handover_reward;
  const totalAmount = rows.reduce((s, r) => s + rewardOnly(r), 0);
  const unpaidAmount = rows
    .filter((r) => r.payment_status === "unpaid")
    .reduce((s, r) => s + r.reward_amount, 0);
  const paidAmount = rows
    .filter((r) => r.payment_status === "paid")
    .reduce((s, r) => s + r.reward_amount, 0);

  // 立替金の集計（承認済みが支払対象、未確認は「確認中」として別に表示）
  const approvedExpense = expenseRows
    .filter((e) => e.status === "approved")
    .reduce((s, e) => s + e.amount, 0);
  const pendingExpense = expenseRows
    .filter((e) => e.status === "pending")
    .reduce((s, e) => s + e.amount, 0);
  const expenseByType = [
    { label: "郵便送料", key: "postal_postage" },
    { label: "梱包資材", key: "packing_material" },
    { label: "その他", key: "other" },
  ]
    .map((t) => ({
      label: t.label,
      value: expenseRows
        .filter((e) => e.expense_type === t.key && e.status === "approved")
        .reduce((s, e) => s + e.amount, 0),
    }))
    .filter((t) => t.value > 0);

  const cards = [
    { label: "今月の作業", value: `${totalCount} 件`, color: "border-t-blue-500" },
    { label: "作業報酬", value: fmtYen(totalAmount), color: "border-t-slate-500" },
    { label: "立替金", value: fmtYen(approvedExpense), color: "border-t-indigo-500" },
    { label: "支払予定額", value: fmtYen(totalAmount + approvedExpense), color: "border-t-blue-600" },
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

        {/* 支払予定額のまとめ（作業報酬と立替金を分けて表示） */}
        {(totalAmount > 0 || approvedExpense > 0) && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-bold text-slate-600">
              {monthLabel(month)}の支払予定
            </h2>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">作業報酬</span>
                <span className="font-semibold text-slate-800">{fmtYen(totalAmount)}</span>
              </div>
              {expenseByType.map((t) => (
                <div key={t.label} className="flex justify-between">
                  <span className="text-slate-600">立替金・{t.label}</span>
                  <span className="font-semibold text-slate-800">{fmtYen(t.value)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center border-t-2 border-slate-300 pt-2">
              <span className="font-bold text-slate-700">支払予定額</span>
              <span className="flex-1" />
              <span className="text-xl font-bold text-blue-600">
                {fmtYen(totalAmount + approvedExpense)}
              </span>
            </div>
            {pendingExpense > 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                ⏳ 確認中の立替金が {fmtYen(pendingExpense)} あります（管理者の確認後に支払予定額へ加算されます）
              </p>
            )}
          </div>
        )}

        {/* 立替金の明細 */}
        {expenseRows.length > 0 && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 px-4 py-3 text-base font-bold text-slate-700">
              立替金の明細（{expenseRows.length}件）
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2">日付</th>
                  <th className="px-3 py-2">内容</th>
                  <th className="px-3 py-2 text-right">金額</th>
                  <th className="px-3 py-2">状態</th>
                </tr>
              </thead>
              <tbody>
                {expenseRows.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                      {fmtDate(e.created_at.slice(0, 10))}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-700">
                        {expenseTypeLabel(e.expense_type)}
                      </div>
                      <div className="text-xs text-slate-400">
                        {e.products?.control_number} {e.description}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-slate-800">
                      {fmtYen(e.amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${expenseStatusBadge(e.status)}`}>
                        {expenseStatusLabel(e.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50">
                  <td colSpan={2} className="px-3 py-2.5 text-right text-sm font-bold text-slate-600">
                    立替金合計（承認済み）
                  </td>
                  <td className="px-3 py-2.5 text-right text-base font-bold text-slate-800">
                    {fmtYen(approvedExpense)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* 作業報酬の内訳 */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-4 py-3 text-base font-bold text-slate-700">
            作業報酬の内訳（{rows.length}件）
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
                      {fmtYen(rewardOnly(r))}
                      {r.reimbursement > 0 && (
                        <div className="text-xs font-normal text-slate-400">
                          + 立替 {fmtYen(r.reimbursement)}
                        </div>
                      )}
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
                  <td colSpan={2} className="px-3 py-2.5 text-right text-sm font-bold text-slate-600">作業報酬合計</td>
                  <td className="px-3 py-2.5 text-right text-base font-bold text-slate-800">{fmtYen(totalAmount)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          ※ 作業報酬は商品の発送が完了した時点で確定します。立替金は管理者が領収書を確認して「承認済み」にすると支払予定額に加算されます。支払いについての質問は管理者に連絡してください。
        </p>
      </main>
    </>
  );
}
