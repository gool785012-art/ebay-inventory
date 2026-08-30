import { fmtYen } from "@/lib/constants";
import { calcReward } from "@/lib/reward";
import type { Product } from "@/types/db";

// 「今回の作業」一覧（スタッフ用、Phase 9）
// 何をすればいいのか・いくらになるのかが一目で分かるようにする
export default function StaffTaskSummary({
  product,
  packingReward,
}: {
  product: Product;
  packingReward: number;
}) {
  const r = calcReward({
    packingReward,
    photoRequired: product.photo_required,
    operationCheckRequired: product.operation_check_required,
    handoverReward: product.handover_reward,
    reimbursement: product.reimbursement,
  });

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
      <div className="rounded-lg bg-white px-4 py-3">
        <div className="flex items-center">
          <span className="text-sm font-semibold text-slate-600">報酬予定</span>
          <span className="flex-1" />
          <span className="text-xl font-bold text-blue-600">{fmtYen(r.totalReward)}</span>
        </div>
        <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-xs text-slate-500">
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
          {r.reimbursement > 0 && (
            <div className="flex justify-between">
              <span>立替金{product.reimbursement_note ? `（${product.reimbursement_note}）` : ""}</span>
              <span>{fmtYen(r.reimbursement)}</span>
            </div>
          )}
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
