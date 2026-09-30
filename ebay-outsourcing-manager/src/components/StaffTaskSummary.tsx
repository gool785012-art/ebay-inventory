import { fmtYen } from "@/lib/constants";
import {
  calcStaffPayment, calcExpenseTotal, expenseTypeLabel, normalizeHandoverReward,
} from "@/lib/reward";
import type { Product, ProductExpense } from "@/types/db";

/** 発送完了時に確定した報酬（work_rewards の内訳） */
export type ConfirmedReward = {
  packing_reward: number;
  photo_reward: number;
  operation_check_reward: number;
  handover_reward: number;
};

// 「今回の作業」と報酬・立替金の表示（スタッフ用、Phase 9/10）
// 作業報酬と立替金は必ず別項目として表示する
export default function StaffTaskSummary({
  product,
  packingReward,
  expenses = [],
  confirmed = null,
}: {
  product: Product;
  /** 梱包報酬（商品ごとの上書きがあればその金額、なければカテゴリー標準報酬） */
  packingReward: number;
  expenses?: ProductExpense[];
  /** 発送完了後は確定済みの金額をそのまま表示する（管理者画面と必ず一致させる） */
  confirmed?: ConfirmedReward | null;
}) {
  const estimated = calcStaffPayment(
    {
      packingReward,
      photoRequired: product.photo_required,
      operationCheckRequired: product.operation_check_required,
      handoverReward: product.handover_reward,
    },
    expenses
  );

  // 確定済みならその内訳を、まだなら見込みの計算結果を表示する
  const r = confirmed
    ? {
        packingReward: confirmed.packing_reward,
        photoReward: confirmed.photo_reward,
        operationCheckReward: confirmed.operation_check_reward,
        handoverReward: normalizeHandoverReward(confirmed.handover_reward),
      }
    : estimated.reward;

  const expenseTotal = calcExpenseTotal(expenses);
  const staffRewardTotal =
    r.packingReward + r.photoReward + r.operationCheckReward + r.handoverReward;
  const p = {
    expenseTotal,
    staffRewardTotal,
    staffPaymentTotal: staffRewardTotal + expenseTotal,
  };

  const tasks = [
    { label: "商品状態の写真撮影", show: product.photo_required },
    { label: "簡単な動作確認", show: product.operation_check_required },
    { label: "梱包", show: true },
    { label: "発送対応", show: true },
  ].filter((t) => t.show);

  return (
    <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
      <h2 className="mb-2 text-sm font-bold text-blue-800">【今回の作業】</h2>
      <ul className="mb-3 space-y-1">
        {tasks.map((t) => (
          <li key={t.label} className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <span className="text-blue-600">☑</span>
            {t.label}
          </li>
        ))}
      </ul>

      {/* 作業報酬 */}
      <div className="mb-2 rounded-lg bg-white px-4 py-3">
        <div className="mb-1 text-xs font-bold text-slate-500">【作業報酬】</div>
        <div className="space-y-0.5 text-sm text-slate-600">
          <div className="flex justify-between">
            <span>梱包</span><span>{fmtYen(r.packingReward)}</span>
          </div>
          {r.photoReward > 0 && (
            <div className="flex justify-between">
              <span>商品状態の写真撮影</span><span>{fmtYen(r.photoReward)}</span>
            </div>
          )}
          {r.operationCheckReward > 0 && (
            <div className="flex justify-between">
              <span>簡単な動作確認</span><span>{fmtYen(r.operationCheckReward)}</span>
            </div>
          )}
          {r.handoverReward > 0 && (
            <div className="flex justify-between">
              <span>集荷・持ち込み</span><span>{fmtYen(r.handoverReward)}</span>
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center border-t border-slate-100 pt-2">
          <span className="text-sm font-bold text-slate-600">作業報酬</span>
          <span className="flex-1" />
          <span className="text-base font-bold text-slate-800">{fmtYen(p.staffRewardTotal)}</span>
        </div>
      </div>

      {/* 立替金（登録がある場合のみ） */}
      {expenses.length > 0 && (
        <div className="mb-2 rounded-lg bg-white px-4 py-3">
          <div className="mb-1 text-xs font-bold text-slate-500">【立替金】</div>
          <div className="space-y-0.5 text-sm text-slate-600">
            {expenses.map((e) => (
              <div key={e.id} className="flex justify-between">
                <span>
                  {expenseTypeLabel(e.expense_type)}
                  {e.description && <span className="text-slate-400">（{e.description}）</span>}
                </span>
                <span>{fmtYen(e.amount)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center border-t border-slate-100 pt-2">
            <span className="text-sm font-bold text-slate-600">立替金合計</span>
            <span className="flex-1" />
            <span className="text-base font-bold text-slate-800">{fmtYen(p.expenseTotal)}</span>
          </div>
        </div>
      )}

      {/* 支払予定額 */}
      <div className="rounded-lg bg-blue-600 px-4 py-3">
        <div className="flex items-center">
          <span className="text-sm font-bold text-white">
            {confirmed
              ? expenses.length > 0
                ? "確定額（報酬＋立替金）"
                : "確定報酬"
              : expenses.length > 0
                ? "支払予定額（報酬＋立替金）"
                : "報酬予定"}
          </span>
          <span className="flex-1" />
          <span className="text-2xl font-bold text-white">{fmtYen(p.staffPaymentTotal)}</span>
        </div>
      </div>

      {product.status === "shipped" && (
        <p className="mt-2 text-xs text-blue-700">
          ※ 発送完了済みです。報酬は「報酬」ページで確認できます。
        </p>
      )}
    </div>
  );
}
