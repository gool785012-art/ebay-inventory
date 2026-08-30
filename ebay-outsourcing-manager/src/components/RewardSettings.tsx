"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmtYen } from "@/lib/constants";
import {
  calcReward, HANDOVER_REWARDS, handoverRewardLabel,
  operationCheckLabel, operationCheckBadge,
} from "@/lib/reward";
import type { Product } from "@/types/db";

// 追加作業と報酬の設定（管理者用、Phase 9）
// チェックを変えた瞬間に報酬内訳と合計が再計算される
export default function RewardSettings({
  product,
  packingReward,
  packingLabel,
}: {
  product: Product;
  packingReward: number;
  packingLabel: string;
}) {
  const router = useRouter();
  const [photo, setPhoto] = useState(product.photo_required);
  const [operation, setOperation] = useState(product.operation_check_required);
  const [handover, setHandover] = useState(product.handover_reward);
  const [reimbursement, setReimbursement] = useState(String(product.reimbursement || ""));
  const [reimbursementNote, setReimbursementNote] = useState(product.reimbursement_note);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // 入力を変えるたびにその場で再計算（保存前でも確認できる）
  const r = calcReward({
    packingReward,
    photoRequired: photo,
    operationCheckRequired: operation,
    handoverReward: handover,
    reimbursement: Number(reimbursement) || 0,
  });

  const changed =
    photo !== product.photo_required ||
    operation !== product.operation_check_required ||
    handover !== product.handover_reward ||
    (Number(reimbursement) || 0) !== product.reimbursement ||
    reimbursementNote !== product.reimbursement_note;

  async function save() {
    setSaving(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase
      .from("products")
      .update({
        photo_required: photo,
        operation_check_required: operation,
        handover_reward: handover,
        reimbursement: Number(reimbursement) || 0,
        reimbursement_note: reimbursementNote,
      })
      .eq("id", product.id);
    setSaving(false);
    if (error) { setMessage("保存に失敗しました: " + error.message); return; }
    setMessage("保存しました");
    router.refresh();
  }

  const rows = [
    { label: packingLabel, value: r.packingReward, show: true },
    { label: "商品状態の写真撮影", value: r.photoReward, show: photo },
    { label: "簡単な動作確認", value: r.operationCheckReward, show: operation },
    { label: handoverRewardLabel(handover), value: r.handoverReward, show: r.handoverReward > 0 },
    { label: `立替金${reimbursementNote ? `（${reimbursementNote}）` : ""}`, value: r.reimbursement, show: r.reimbursement > 0 },
  ].filter((row) => row.show);

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-base font-bold text-slate-700">💰 追加作業と報酬</h2>
      <p className="mb-3 text-xs text-slate-400">
        必要な作業にチェックを入れると、スタッフの作業画面に表示され、報酬に自動で加算されます。
      </p>

      {/* 追加作業のチェック */}
      <div className="mb-4 space-y-2">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <input type="checkbox" checked={photo}
            onChange={(e) => setPhoto(e.target.checked)} className="h-5 w-5" />
          <span className="flex-1 text-sm font-semibold text-slate-700">
            商品状態の写真撮影
          </span>
          <span className={`text-sm font-bold ${photo ? "text-blue-600" : "text-slate-400"}`}>
            ＋100円
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <input type="checkbox" checked={operation}
            onChange={(e) => setOperation(e.target.checked)} className="h-5 w-5" />
          <span className="flex-1 text-sm font-semibold text-slate-700">
            簡単な動作確認
          </span>
          <span className={`text-sm font-bold ${operation ? "text-blue-600" : "text-slate-400"}`}>
            ＋200円
          </span>
        </label>
        {r.additionalReward > 0 && (
          <p className="text-right text-sm font-bold text-blue-600">
            追加報酬 ＋{r.additionalReward}円
          </p>
        )}
      </div>

      {/* 集荷・持ち込み / 立替金 */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            集荷・持ち込み報酬
          </label>
          <select value={handover} onChange={(e) => setHandover(Number(e.target.value))}
            className={inputCls}>
            {HANDOVER_REWARDS.map((h) => (
              <option key={h.key} value={h.key}>{h.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            立替金（実費精算・円）
          </label>
          <input type="number" min="0" value={reimbursement}
            onChange={(e) => setReimbursement(e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            立替金の内容（任意）
          </label>
          <input value={reimbursementNote} onChange={(e) => setReimbursementNote(e.target.value)}
            placeholder="例: 梱包材の購入代金" className={inputCls} />
        </div>
      </div>

      {/* 報酬内訳 */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 text-xs font-bold text-slate-500">【報酬内訳】</div>
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="py-1 text-slate-600">{row.label}</td>
                <td className="py-1 text-right font-semibold text-slate-800">
                  {fmtYen(row.value)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-300">
              <td className="pt-2 font-bold text-slate-700">合計</td>
              <td className="pt-2 text-right text-lg font-bold text-blue-600">
                {fmtYen(r.totalReward)}
              </td>
            </tr>
          </tfoot>
        </table>
        {product.status === "shipped" && (
          <p className="mt-2 text-xs text-amber-700">
            ※ この商品は発送済みのため、報酬は確定済みです。金額の修正は報酬管理ページで行ってください。
          </p>
        )}
      </div>

      {/* 動作確認の結果（スタッフが入力したもの） */}
      {product.operation_check_required && (
        <div className={`mb-4 rounded-lg border p-3 ${
          product.operation_check_result === "problem"
            ? "border-red-300 bg-red-50"
            : "border-slate-200 bg-white"
        }`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500">動作確認の結果</span>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${operationCheckBadge(product.operation_check_result)}`}>
              {operationCheckLabel(product.operation_check_result)}
            </span>
          </div>
          {product.operation_check_memo && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
              {product.operation_check_memo}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving || !changed}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-40">
          {saving ? "保存中..." : "保存する"}
        </button>
        {message && (
          <span className={`text-sm font-semibold ${message === "保存しました" ? "text-green-600" : "text-red-600"}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
