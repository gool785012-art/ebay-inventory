"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmtYen } from "@/lib/constants";

type Settlement = {
  id: string;
  status: string;
  paid_at: string | null;
  paid_amount: number | null;
  payment_method: string;
};

const SETTLEMENT_STATUSES = [
  { key: "unsettled", label: "未精算", badge: "bg-gray-100 text-gray-600 border-gray-300" },
  { key: "scheduled", label: "支払予定", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "paid",      label: "支払済み", badge: "bg-green-50 text-green-700 border-green-200" },
];

// 精算の支払状況を管理（管理者用、Phase 11）
export default function SettlementStatus({
  staffId,
  month,
  rewardTotal,
  expenseTotal,
  paymentTotal,
  settlement,
}: {
  staffId: string;
  month: string;
  rewardTotal: number;
  expenseTotal: number;
  paymentTotal: number;
  settlement: Settlement | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(settlement?.status ?? "unsettled");
  const [paidAt, setPaidAt] = useState(
    settlement?.paid_at ?? new Date().toISOString().slice(0, 10)
  );
  const [paidAmount, setPaidAmount] = useState(
    String(settlement?.paid_amount ?? paymentTotal)
  );
  const [method, setMethod] = useState(settlement?.payment_method ?? "銀行振込");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const current = SETTLEMENT_STATUSES.find((s) => s.key === (settlement?.status ?? "unsettled"))!;

  async function save() {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("staff_settlements").upsert(
      {
        staff_id: staffId,
        month,
        reward_total: rewardTotal,
        expense_total: expenseTotal,
        payment_total: paymentTotal,
        status,
        paid_at: status === "paid" ? paidAt : null,
        paid_amount: status === "paid" ? Number(paidAmount) || 0 : null,
        payment_method: status === "paid" ? method : "",
        created_by: user?.id ?? null,
      },
      { onConflict: "staff_id,month" }
    );
    setSaving(false);
    if (err) { setError("保存に失敗しました: " + err.message); return; }
    setOpen(false);
    router.refresh();
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${current.badge}`}>
        {current.label}
      </span>
      {settlement?.status === "paid" && settlement.paid_at && (
        <span className="text-xs text-slate-500">
          {settlement.paid_at} / {fmtYen(settlement.paid_amount ?? 0)} / {settlement.payment_method}
        </span>
      )}
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          支払状況を変更
        </button>
      ) : (
        <div className="w-full space-y-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-600">{error}</p>
          )}
          <div className="grid gap-2 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">状況</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                {SETTLEMENT_STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            {status === "paid" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">支払日</label>
                  <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">支払金額</label>
                  <input type="number" min="0" value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">支払方法</label>
                  <input value={method} onChange={(e) => setMethod(e.target.value)}
                    placeholder="例: 銀行振込" className={inputCls} />
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? "保存中..." : "保存する"}
            </button>
            <button onClick={() => { setOpen(false); setError(""); }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-500">
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
