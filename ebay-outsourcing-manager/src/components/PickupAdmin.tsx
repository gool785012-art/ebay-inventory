"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendNotification } from "@/lib/notify-client";
import {
  PICKUP_STATUSES, pickupStatusLabel, pickupBadgeClass,
  fmtPickupRange, fmtTime, handoverLabel,
} from "@/lib/constants";
import type { Product } from "@/types/db";

// 集荷手配エリア（管理者用、Phase 7）
export default function PickupAdmin({
  product,
  carrierName,
}: {
  product: Product;
  carrierName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [status, setStatus] = useState(product.pickup_status);
  const [date, setDate] = useState(
    product.pickup_confirmed_date ?? product.pickup_available_date ?? ""
  );
  const [from, setFrom] = useState(
    fmtTime(product.pickup_confirmed_from) || fmtTime(product.pickup_available_from) || ""
  );
  const [to, setTo] = useState(
    fmtTime(product.pickup_confirmed_to) || fmtTime(product.pickup_available_to) || ""
  );
  const [note, setNote] = useState(product.pickup_admin_note);

  async function saveConfirmed() {
    if (!date || !from || !to) { setError("集荷日と時間帯を入力してください"); return; }
    if (from >= to) { setError("終了時間は開始時間より後にしてください"); return; }

    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase
      .from("products")
      .update({
        pickup_confirmed_date: date,
        pickup_confirmed_from: from,
        pickup_confirmed_to: to,
        pickup_admin_note: note,
        pickup_status: "arranged",
      })
      .eq("id", product.id);
    setSaving(false);
    if (err) { setError("保存に失敗しました: " + err.message); return; }
    // 集荷日時が確定したことをスタッフへ通知
    await sendNotification("pickup_confirmed", product.id);
    setStatus("arranged");
    setOpen(false);
    router.refresh();
  }

  async function changeStatus(next: string) {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase
      .from("products")
      .update({ pickup_status: next })
      .eq("id", product.id);
    setSaving(false);
    if (err) { setError("変更に失敗しました: " + err.message); return; }
    setStatus(next);
    router.refresh();
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500";
  const labelCls = "mb-1 block text-xs font-semibold text-slate-600";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-slate-700">🚚 集荷手配</h2>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${pickupBadgeClass(status)}`}>
          {pickupStatusLabel(status)}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
          {handoverLabel(product.handover_method)}
        </span>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>
      )}

      {/* スタッフが入力した集荷可能日時 */}
      <div className="mb-3 rounded-lg bg-slate-50 px-4 py-3 text-sm">
        <div className="text-xs font-semibold text-slate-400">スタッフの集荷可能日時</div>
        {product.pickup_available_date ? (
          <>
            <div className="text-base font-bold text-slate-800">
              {fmtPickupRange(
                product.pickup_available_date,
                product.pickup_available_from,
                product.pickup_available_to
              )}
            </div>
            {product.pickup_staff_note && (
              <div className="mt-0.5 text-slate-600">
                <span className="text-slate-400">スタッフメモ: </span>
                {product.pickup_staff_note}
              </div>
            )}
          </>
        ) : (
          <div className="text-slate-400">
            {product.handover_method === "dropoff" ? "持ち込み発送（集荷なし）" : "未入力"}
          </div>
        )}
      </div>

      {/* 集荷確定日時 */}
      {product.pickup_confirmed_date && !open && (
        <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm">
          <div className="text-xs font-semibold text-green-700">集荷確定日時（スタッフに表示中）</div>
          <div className="text-base font-bold text-green-900">
            {carrierName && `${carrierName} `}
            {fmtPickupRange(
              product.pickup_confirmed_date,
              product.pickup_confirmed_from,
              product.pickup_confirmed_to
            )}
          </div>
          {product.pickup_admin_note && (
            <div className="mt-0.5 text-green-800">{product.pickup_admin_note}</div>
          )}
        </div>
      )}

      {/* 集荷確定日時の入力 */}
      {open ? (
        <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-700">
            集荷確定日時を登録（{carrierName || "配送会社未設定"}）
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>集荷日</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>集荷予定（開始）</label>
              <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>集荷予定（終了）</label>
              <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>備考（スタッフに表示されます）</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              placeholder="例: 玄関前で受け渡しをお願いします" className={inputCls} />
          </div>
          <div className="flex gap-2">
            <button onClick={saveConfirmed} disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
              {saving ? "保存中..." : "集荷手配済みにする"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(""); }}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-500">
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <button onClick={() => setOpen(true)}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700">
            {product.pickup_confirmed_date ? "集荷確定日時を変更" : "集荷確定日時を登録"}
          </button>
          <div>
            <label className={labelCls}>集荷手配ステータス</label>
            <select value={status} onChange={(e) => changeStatus(e.target.value)} disabled={saving}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
              {PICKUP_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
