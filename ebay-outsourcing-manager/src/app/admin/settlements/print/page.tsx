import { requireProfile } from "@/lib/auth";
import { fmtYen } from "@/lib/constants";
import { parseMonth, monthRange, monthLabel } from "@/lib/month";
import { expenseTypeLabel } from "@/lib/reward";
import PrintButton from "@/components/PrintButton";

// 月次精算書（管理者用、Phase 11）
// ブラウザの「印刷 → PDFとして保存」でA4のPDFになる。日本語も文字化けしない。
export default async function SettlementPrintPage(props: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const sp = await props.searchParams;
  const { supabase } = await requireProfile("admin");

  const month = parseMonth(sp.month);
  const { start, end } = monthRange(month);
  const staffId = sp.staff ?? "";

  const [{ data: staff }, { data: rewards }, { data: expenses }] = await Promise.all([
    staffId
      ? supabase.from("profiles").select("full_name, email").eq("id", staffId).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("work_rewards")
      .select("*, products(name, control_number)")
      .eq("staff_id", staffId)
      .gte("completed_at", start)
      .lt("completed_at", end)
      .order("completed_at"),
    supabase
      .from("product_expenses")
      .select("*, products(name, control_number, assigned_staff_id)")
      .eq("status", "approved")
      .gte("created_at", start)
      .lt("created_at", end),
  ]);

  type RewardRow = {
    product_id: string; completed_at: string; reward_amount: number;
    packing_reward: number; photo_reward: number; operation_check_reward: number;
    handover_reward: number;
    products: { name: string; control_number: string } | null;
  };
  type ExpenseRow = {
    product_id: string; expense_type: string; description: string; amount: number;
    products: { name: string; control_number: string; assigned_staff_id: string } | null;
  };

  const rewardRows = (rewards ?? []) as unknown as RewardRow[];
  // このスタッフの担当商品の立替金だけに絞る
  const expenseRows = ((expenses ?? []) as unknown as ExpenseRow[])
    .filter((e) => e.products?.assigned_staff_id === staffId);

  const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0);
  const packing = sum(rewardRows.map((r) => r.packing_reward));
  const photo = sum(rewardRows.map((r) => r.photo_reward));
  const operation = sum(rewardRows.map((r) => r.operation_check_reward));
  const handover = sum(rewardRows.map((r) => r.handover_reward));
  const rewardTotal = packing + photo + operation + handover;

  const postal = sum(expenseRows.filter((e) => e.expense_type === "postal_postage").map((e) => e.amount));
  const material = sum(expenseRows.filter((e) => e.expense_type === "packing_material").map((e) => e.amount));
  const otherExp = sum(expenseRows.filter((e) => e.expense_type === "other").map((e) => e.amount));
  const expenseTotal = postal + material + otherExp;

  const staffName = staff?.full_name || staff?.email || "（スタッフ未選択）";
  const today = new Date().toLocaleDateString("ja-JP");

  // 商品ごとの明細
  const detailMap = new Map<string, {
    date: string; name: string; control: string;
    reward: number; rewardDetail: string[];
    expense: number; expenseDetail: string[];
  }>();
  for (const r of rewardRows) {
    const detail: string[] = [];
    if (r.packing_reward) detail.push(`梱包 ${fmtYen(r.packing_reward)}`);
    if (r.photo_reward) detail.push(`写真撮影 ${fmtYen(r.photo_reward)}`);
    if (r.operation_check_reward) detail.push(`動作確認 ${fmtYen(r.operation_check_reward)}`);
    if (r.handover_reward) detail.push(`集荷・持込 ${fmtYen(r.handover_reward)}`);
    detailMap.set(r.product_id, {
      date: r.completed_at,
      name: r.products?.name ?? "",
      control: r.products?.control_number ?? "",
      reward: r.packing_reward + r.photo_reward + r.operation_check_reward + r.handover_reward,
      rewardDetail: detail,
      expense: 0,
      expenseDetail: [],
    });
  }
  for (const e of expenseRows) {
    const cur = detailMap.get(e.product_id) ?? {
      date: "", name: e.products?.name ?? "", control: e.products?.control_number ?? "",
      reward: 0, rewardDetail: [], expense: 0, expenseDetail: [],
    };
    cur.expense += e.amount;
    cur.expenseDetail.push(`${expenseTypeLabel(e.expense_type)} ${fmtYen(e.amount)}`);
    detailMap.set(e.product_id, cur);
  }
  const details = Array.from(detailMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const fileName = `staff_payment_${month}_${staffName}`;

  return (
    <main className="mx-auto max-w-[210mm] bg-white p-8 print:p-0">
      <PrintButton fileName={fileName} />

      <div className="print-area">
        <h1 className="mb-1 text-center text-2xl font-bold">外注作業 月次精算書</h1>
        <p className="mb-6 text-center text-sm text-slate-500">作成日: {today}</p>

        <table className="mb-6 w-full text-sm">
          <tbody>
            <tr>
              <td className="w-24 py-1 text-slate-500">対象</td>
              <td className="py-1 font-bold">{monthLabel(month)}</td>
            </tr>
            <tr>
              <td className="py-1 text-slate-500">スタッフ</td>
              <td className="py-1 font-bold">{staffName}</td>
            </tr>
          </tbody>
        </table>

        <div className="mb-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 border-b-2 border-slate-800 pb-1 text-sm font-bold">【作業報酬】</h2>
            <table className="w-full text-sm">
              <tbody>
                <tr><td className="py-1">梱包報酬</td><td className="py-1 text-right">{fmtYen(packing)}</td></tr>
                <tr><td className="py-1">写真撮影</td><td className="py-1 text-right">{fmtYen(photo)}</td></tr>
                <tr><td className="py-1">動作確認</td><td className="py-1 text-right">{fmtYen(operation)}</td></tr>
                <tr><td className="py-1">集荷・持ち込み</td><td className="py-1 text-right">{fmtYen(handover)}</td></tr>
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-400">
                  <td className="pt-2 font-bold">作業報酬合計</td>
                  <td className="pt-2 text-right font-bold">{fmtYen(rewardTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div>
            <h2 className="mb-2 border-b-2 border-slate-800 pb-1 text-sm font-bold">【立替金】</h2>
            <table className="w-full text-sm">
              <tbody>
                <tr><td className="py-1">郵便送料</td><td className="py-1 text-right">{fmtYen(postal)}</td></tr>
                <tr><td className="py-1">梱包資材</td><td className="py-1 text-right">{fmtYen(material)}</td></tr>
                <tr><td className="py-1">その他</td><td className="py-1 text-right">{fmtYen(otherExp)}</td></tr>
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-400">
                  <td className="pt-2 font-bold">立替金合計</td>
                  <td className="pt-2 text-right font-bold">{fmtYen(expenseTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="mb-8 flex items-center border-y-2 border-slate-800 py-3">
          <span className="text-base font-bold">支払合計</span>
          <span className="flex-1" />
          <span className="text-2xl font-bold">{fmtYen(rewardTotal + expenseTotal)}</span>
        </div>

        {/* 明細 */}
        {details.length > 0 && (
          <div className="break-before-page">
            <h2 className="mb-2 text-sm font-bold">【明細】</h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-slate-800 text-left">
                  <th className="py-1.5">日付</th>
                  <th className="py-1.5">商品名 / 管理番号</th>
                  <th className="py-1.5">作業内容</th>
                  <th className="py-1.5 text-right">報酬</th>
                  <th className="py-1.5">立替内容</th>
                  <th className="py-1.5 text-right">立替金</th>
                  <th className="py-1.5 text-right">計</th>
                </tr>
              </thead>
              <tbody>
                {details.map((d, i) => (
                  <tr key={i} className="border-b border-slate-200 align-top">
                    <td className="py-1.5 whitespace-nowrap">
                      {d.date ? d.date.slice(5).replace("-", "/") : "—"}
                    </td>
                    <td className="py-1.5">
                      <div>{d.name}</div>
                      <div className="text-slate-400">{d.control}</div>
                    </td>
                    <td className="py-1.5">{d.rewardDetail.join(" / ") || "—"}</td>
                    <td className="py-1.5 text-right">{fmtYen(d.reward)}</td>
                    <td className="py-1.5">{d.expenseDetail.join(" / ") || "—"}</td>
                    <td className="py-1.5 text-right">{d.expense > 0 ? fmtYen(d.expense) : "—"}</td>
                    <td className="py-1.5 text-right font-bold">{fmtYen(d.reward + d.expense)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-800">
                  <td colSpan={6} className="py-2 text-right font-bold">支払合計</td>
                  <td className="py-2 text-right font-bold">{fmtYen(rewardTotal + expenseTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
