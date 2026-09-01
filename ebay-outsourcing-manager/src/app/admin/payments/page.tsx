import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import RewardTable, { type RewardRow } from "@/components/RewardTable";
import BulkPayButton from "@/components/BulkPayButton";
import { requireProfile } from "@/lib/auth";
import { PAYMENT_STATUSES, fmtYen } from "@/lib/constants";
import { parseMonth, monthRange, shiftMonth, monthLabel } from "@/lib/month";
import type { Category } from "@/types/db";

// 報酬管理ページ（管理者用、Phase 5）
export default async function AdminPaymentsPage(props: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const sp = await props.searchParams;
  const { supabase, profile } = await requireProfile("admin");

  const month = parseMonth(sp.month);
  const { start, end } = monthRange(month);
  const fStatus = sp.status ?? "";
  const fCategory = sp.category ?? "";
  const q = sp.q?.trim() ?? "";

  const [{ data: rewards }, { data: categories }, { data: allExpenses }, { data: allReceipts }, { data: staffList }] =
    await Promise.all([
      supabase
        .from("work_rewards")
        .select("*, products(control_number, name, category_id)")
        .gte("completed_at", start)
        .lt("completed_at", end)
        .order("completed_at"),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("product_expenses").select("product_id, expense_type, amount, status"),
      supabase.from("expense_receipts").select("product_id"),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

  // 商品ごとの立替金（承認済みのみ支払対象）
  const expenseByProduct = new Map<string, { postal: number; material: number; other: number }>();
  for (const e of allExpenses ?? []) {
    if (e.status !== "approved") continue;
    const cur = expenseByProduct.get(e.product_id) ?? { postal: 0, material: 0, other: 0 };
    if (e.expense_type === "postal_postage") cur.postal += e.amount;
    else if (e.expense_type === "packing_material") cur.material += e.amount;
    else cur.other += e.amount;
    expenseByProduct.set(e.product_id, cur);
  }
  const receiptProductIds = new Set((allReceipts ?? []).map((r) => r.product_id));
  const staffNameMap = new Map(
    (staffList ?? []).map((s) => [s.id, s.full_name || s.email || ""])
  );

  const catMap = new Map((categories ?? []).map((c: Category) => [c.id, c.name]));

  // 表示用の行に変換
  type RawReward = {
    id: string; product_id: string; staff_id: string | null;
    completed_at: string; reward_amount: number;
    payment_status: string; paid_at: string | null; memo: string;
    packing_reward: number; photo_reward: number; operation_check_reward: number;
    handover_reward: number; reimbursement: number;
    products: { control_number: string; name: string; category_id: number | null } | null;
  };
  const allRows: RewardRow[] = ((rewards ?? []) as unknown as RawReward[]).map((r) => {
    const exp = expenseByProduct.get(r.product_id) ?? { postal: 0, material: 0, other: 0 };
    return {
      id: r.id,
      product_id: r.product_id,
      completed_at: r.completed_at,
      control_number: r.products?.control_number ?? "—",
      name: r.products?.name ?? "（削除された商品）",
      category: r.products?.category_id ? (catMap.get(r.products.category_id) ?? "—") : "—",
      reward_amount: r.reward_amount,
      payment_status: r.payment_status,
      paid_at: r.paid_at,
      memo: r.memo,
      staff_name: r.staff_id ? (staffNameMap.get(r.staff_id) ?? "") : "",
      packing_reward: r.packing_reward ?? 0,
      photo_reward: r.photo_reward ?? 0,
      operation_check_reward: r.operation_check_reward ?? 0,
      handover_reward: r.handover_reward ?? 0,
      postal_expense: exp.postal,
      packing_material_expense: exp.material,
      other_expense: exp.other,
      has_receipt: receiptProductIds.has(r.product_id),
    };
  });

  // 報酬の内訳（Phase 9: 項目別の月次集計）
  const raw = (rewards ?? []) as unknown as RawReward[];
  const sum = (key: keyof RawReward) =>
    raw.reduce((s, r) => s + (Number(r[key]) || 0), 0);
  // 作業報酬の内訳
  const rewardBreakdown = [
    { label: "梱包報酬", value: sum("packing_reward") },
    { label: "写真撮影報酬", value: sum("photo_reward") },
    { label: "動作確認報酬", value: sum("operation_check_reward") },
    { label: "集荷・持ち込み", value: sum("handover_reward") },
  ].filter((b) => b.value > 0);
  const rewardSubtotal = rewardBreakdown.reduce((s, b) => s + b.value, 0);

  // 立替金の内訳（作業報酬とは別項目）
  const expenseBreakdown = [
    { label: "郵便送料", value: allRows.reduce((s, r) => s + r.postal_expense, 0) },
    { label: "梱包資材", value: allRows.reduce((s, r) => s + r.packing_material_expense, 0) },
    { label: "その他", value: allRows.reduce((s, r) => s + r.other_expense, 0) },
  ].filter((b) => b.value > 0);
  const expenseSubtotal = expenseBreakdown.reduce((s, b) => s + b.value, 0);

  // カードはその月の全件で集計（絞り込みの影響を受けない）
  const totalCount = allRows.length;
  const totalAmount = allRows.reduce((s, r) => s + r.reward_amount, 0);
  const unpaidRows = allRows.filter((r) => r.payment_status === "unpaid");
  const unpaidAmount = unpaidRows.reduce((s, r) => s + r.reward_amount, 0);
  const paidAmount = allRows
    .filter((r) => r.payment_status === "paid")
    .reduce((s, r) => s + r.reward_amount, 0);

  // テーブルは絞り込みを反映
  let rows = allRows;
  if (fStatus) rows = rows.filter((r) => r.payment_status === fStatus);
  if (fCategory) rows = rows.filter((r) => r.category === fCategory);
  if (q) {
    const lower = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.control_number.toLowerCase().includes(lower) ||
        r.name.toLowerCase().includes(lower)
    );
  }

  const cards = [
    { label: "今月の作業完了件数", value: `${totalCount} 件`, color: "border-t-blue-500" },
    { label: "今月の報酬合計", value: fmtYen(totalAmount), color: "border-t-slate-500" },
    { label: "未払い", value: fmtYen(unpaidAmount), color: "border-t-red-500" },
    { label: "支払済み", value: fmtYen(paidAmount), color: "border-t-green-500" },
  ];

  const keepFilters = (m: string) => {
    const params = new URLSearchParams();
    params.set("month", m);
    if (fStatus) params.set("status", fStatus);
    if (fCategory) params.set("category", fCategory);
    if (q) params.set("q", q);
    return `/admin/payments?${params.toString()}`;
  };

  return (
    <>
      <AppHeader fullName={profile.full_name || profile.email || ""} role="admin" />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-4 text-xl font-bold text-slate-800">報酬管理</h1>

        {/* 年月切り替え */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link href={keepFilters(shiftMonth(month, -1))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            ← 前月
          </Link>
          <span className="rounded-lg bg-blue-600 px-4 py-2 text-base font-bold text-white">
            {monthLabel(month)}
          </span>
          <Link href={keepFilters(shiftMonth(month, 1))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            翌月 →
          </Link>
          <Link href={keepFilters(parseMonth(undefined))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            今月
          </Link>
          <form method="get" className="ml-1">
            <input type="month" name="month" defaultValue={month}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            {fStatus && <input type="hidden" name="status" value={fStatus} />}
            {fCategory && <input type="hidden" name="category" value={fCategory} />}
            {q && <input type="hidden" name="q" value={q} />}
            <button type="submit"
              className="ml-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              表示
            </button>
          </form>
        </div>

        {/* サマリーカード */}
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label}
              className={`rounded-xl border border-slate-200 border-t-4 bg-white p-4 shadow-sm ${c.color}`}>
              <div className="text-xs font-semibold text-slate-500">{c.label}</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{c.value}</div>
            </div>
          ))}
        </div>

        {/* 支払明細（Phase 9/10: 作業報酬と立替金を分けて表示） */}
        {(rewardBreakdown.length > 0 || expenseBreakdown.length > 0) && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-slate-600">
              {monthLabel(month)} 外注スタッフ支払明細
            </h2>
            <div className="grid gap-6 sm:grid-cols-2">
              {/* 作業報酬 */}
              <div>
                <div className="mb-1 text-xs font-bold text-slate-500">【作業報酬】</div>
                <table className="w-full text-sm">
                  <tbody>
                    {rewardBreakdown.map((b) => (
                      <tr key={b.label}>
                        <td className="py-1 text-slate-600">{b.label}</td>
                        <td className="py-1 text-right font-semibold text-slate-800">
                          {fmtYen(b.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-300">
                      <td className="pt-2 font-bold text-slate-700">作業報酬合計</td>
                      <td className="pt-2 text-right font-bold text-slate-800">
                        {fmtYen(rewardSubtotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* 立替金 */}
              <div>
                <div className="mb-1 text-xs font-bold text-slate-500">【立替金】</div>
                {expenseBreakdown.length === 0 ? (
                  <p className="py-1 text-sm text-slate-400">立替金はありません</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {expenseBreakdown.map((b) => (
                        <tr key={b.label}>
                          <td className="py-1 text-slate-600">{b.label}</td>
                          <td className="py-1 text-right font-semibold text-slate-800">
                            {fmtYen(b.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-300">
                        <td className="pt-2 font-bold text-slate-700">立替金合計</td>
                        <td className="pt-2 text-right font-bold text-slate-800">
                          {fmtYen(expenseSubtotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center border-t-2 border-slate-300 pt-3">
              <span className="font-bold text-slate-700">最終支払額</span>
              <span className="flex-1" />
              <span className="text-xl font-bold text-blue-600">
                {fmtYen(rewardSubtotal + expenseSubtotal)}
              </span>
            </div>
          </div>
        )}

        {/* まとめて支払済み */}
        <div className="mb-4">
          <BulkPayButton month={month} unpaidTotal={unpaidAmount} unpaidCount={unpaidRows.length} />
        </div>

        {/* 絞り込み */}
        <form method="get"
          className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <input type="hidden" name="month" value={month} />
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">支払状況</label>
            <select name="status" defaultValue={fStatus}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">すべて</option>
              {PAYMENT_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">カテゴリー</label>
            <select name="category" defaultValue={fCategory}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">すべて</option>
              {(categories ?? []).map((c: Category) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-500">管理番号・商品名</label>
            <input name="q" defaultValue={q} placeholder="例: CAM-0001"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit"
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
            絞り込む
          </button>
          <Link href={`/admin/payments?month=${month}`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
            リセット
          </Link>
        </form>

        {/* 内訳テーブル */}
        <RewardTable rows={rows} month={month} />

        <p className="mt-4 text-xs text-slate-400">
          ※ 報酬は商品が「発送済み」になった時点の金額で自動確定します。金額の修正・支払状況の変更はすべて商品の作業履歴に記録されます。
        </p>
      </main>
    </>
  );
}
