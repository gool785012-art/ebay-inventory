"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendNotification } from "@/lib/notify-client";
import { fmtPickupRange, fmtTime, handoverOptions } from "@/lib/constants";
import type { Product } from "@/types/db";

// 集荷可能日時（スタッフ用、Phase 7）
// 「発送ラベル確認 → 集荷可能日時を入力 → 集荷手配待ち → 集荷予定」の流れが分かる表示
export default function PickupStaff({
  product,
  carrierName,
  labelConfirmed,
}: {
  product: Product;
  carrierName: string;
  labelConfirmed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const [method, setMethod] = useState(product.handover_method);
  const [date, setDate] = useState(product.pickup_available_date ?? today);
  const [from, setFrom] = useState(fmtTime(product.pickup_available_from) || "14:00");
  const [to, setTo] = useState(fmtTime(product.pickup_available_to) || "18:00");
  const [note, setNote] = useState(product.pickup_staff_note);

  const options = handoverOptions(carrierName);
  const hasAvailable = !!product.pickup_available_date;
  const confirmed = !!product.pickup_confirmed_date;

  async function save() {
    if (method === "pickup") {
      if (!date) { setError("集荷可能日を選んでください"); return; }
      if (!from || !to) { setError("時間帯を入力してください"); return; }
      if (from >= to) { setError("終了時間は開始時間より後にしてください"); return; }
    }

    setSaving(true);
    setError("");
    const supabase = createClient();

    const payload =
      method === "dropoff"
        ? {
            handover_method: "dropoff",
            pickup_available_date: null,
            pickup_available_from: null,
            pickup_available_to: null,
            pickup_staff_note: note,
            pickup_status: "dropoff",
          }
        : {
            handover_method: "pickup",
            pickup_available_date: date,
            pickup_available_from: from,
            pickup_available_to: to,
            pickup_staff_note: note,
            // すでに手配済み・完了の場合はステータスを戻さない
            ...(["arranged", "completed"].includes(product.pickup_status)
              ? {}
              : { pickup_status: "entered" }),
          };

    const { error: err } = await supabase.from("products").update(payload).eq("id", product.id);
    setSaving(false);
    if (err) { setError("保存に失敗しました: " + err.message); return; }
    // 集荷可能日時が入力されたことを管理者へ通知（集荷手配の依頼）
    if (method === "pickup") {
      await sendNotification("pickup_entered", product.id, note);
    }
    setOpen(false);
    router.refresh();
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500";

  // 集荷確定済み: 一番目立つ表示（要件7）
  if (confirmed && product.pickup_status !== "completed") {
    return (
      <div className="rounded-xl border-2 border-green-400 bg-green-50 p-4 shadow-sm">
        <p className="text-sm font-bold text-green-800">🚚 {carrierName || "配送業者"} 集荷予定</p>
        <p className="my-1 text-2xl font-bold text-green-900">
          {fmtPickupRange(
            product.pickup_confirmed_date,
            product.pickup_confirmed_from,
            product.pickup_confirmed_to
          )}
        </p>
        <p className="text-sm font-semibold text-green-800">
          この時間帯に集荷対応をお願いします。
        </p>
        {product.pickup_admin_note && (
          <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
            📌 {product.pickup_admin_note}
          </p>
        )}
        <p className="mt-3 text-xs text-green-700">
          次にやること: 梱包 → ラベル貼付 → 貼付後の写真 → 集荷時に引き渡し → 発送完了
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-base font-bold text-slate-700">🚚 集荷可能日時</h2>

      {/* 次にやることの案内 */}
      {!hasAvailable && product.handover_method === "pickup" && (
        <p className="mb-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800">
          {labelConfirmed
            ? "発送ラベル確認済みです。次は集荷可能日時を入力してください。"
            : "集荷に来てもらえる日時を入力してください。"}
        </p>
      )}

      {hasAvailable && !confirmed && (
        <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-lg font-bold text-slate-800">
            {fmtPickupRange(
              product.pickup_available_date,
              product.pickup_available_from,
              product.pickup_available_to
            )}
          </p>
          {product.pickup_staff_note && (
            <p className="mt-0.5 text-sm text-slate-500">{product.pickup_staff_note}</p>
          )}
          <p className="mt-1 text-xs font-semibold text-amber-700">
            ⏳ 集荷手配待ち（管理者が集荷を依頼しています。確定するとここに集荷予定が表示されます）
          </p>
        </div>
      )}

      {product.handover_method === "dropoff" && (
        <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
          持ち込み発送（集荷なし）
          {product.pickup_staff_note && (
            <span className="ml-2 font-normal text-slate-500">{product.pickup_staff_note}</span>
          )}
        </p>
      )}

      {error && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-600">{error}</p>
      )}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-lg bg-blue-600 py-3.5 text-base font-bold text-white transition hover:bg-blue-700"
        >
          {hasAvailable || product.handover_method === "dropoff"
            ? "集荷可能日時を変更する"
            : "集荷可能日時を入力する"}
        </button>
      ) : (
        <div className="space-y-3">
          {options.length > 1 && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">
                荷物の受け渡し方法
              </label>
              <div className="flex gap-2">
                {options.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setMethod(o.key)}
                    className={`flex-1 rounded-lg border py-3 text-base font-bold ${
                      method === o.key
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-300 bg-white text-slate-500"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {method === "pickup" && (
            <>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-600">集荷可能日</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-600">開始時間</label>
                  <input type="time" value={from} onChange={(e) => setFrom(e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-600">終了時間</label>
                  <input type="time" value={to} onChange={(e) => setTo(e.target.value)}
                    className={inputCls} />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">備考（任意）</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              placeholder="例: 15時以降であれば確実に対応できます"
              className={inputCls} />
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 rounded-lg bg-blue-600 py-3.5 text-base font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
              {saving ? "保存中..." : "保存する"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(""); }}
              className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-500">
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
