"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PAYMENT_STATUSES, paymentStatusLabel, fmtYen } from "@/lib/constants";

export type RewardRow = {
  id: string;
  product_id: string;
  completed_at: string;
  control_number: string;
  name: string;
  category: string;
  reward_amount: number;
  payment_status: string;
  paid_at: string | null;
  memo: string;
};

function fmtDate(d: string) {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

// 報酬内訳テーブル（管理者用）: 支払状況の個別変更・報酬額の修正・CSV出力
export default function RewardTable({
  rows,
  month,
}: {
  rows: RewardRow[];
  month: string;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [error, setError] = useState("");

  async function changeStatus(id: string, status: string) {
    setError("");
    const supabase = createClient();
    const payload: { payment_status: string; paid_at?: string } = { payment_status: status };
    if (status === "paid") payload.paid_at = new Date().toISOString().slice(0, 10);
    const { error: err } = await supabase.from("work_rewards").update(payload).eq("id", id);
    if (err) { setError("変更に失敗しました: " + err.message); return; }
    router.refresh();
  }

  async function saveAmount(id: string) {
    const amount = Number(editAmount);
    if (isNaN(amount) || amount < 0) { setError("金額が正しくありません"); return; }
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase
      .from("work_rewards")
      .update({ reward_amount: amount })
      .eq("id", id);
    if (err) { setError("変更に失敗しました: " + err.message); return; }
    setEditingId(null);
    router.refresh();
  }

  // CSV出力（UTF-8 BOM付き: 日本語版Excelで文字化けしない）
  function exportCSV() {
    const headers = ["完了日", "管理番号", "商品名", "カテゴリー", "報酬", "支払状況", "支払日", "備考"];
    const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      headers.join(","),
      ...rows.map((r) =>
        [
          r.completed_at,
          r.control_number,
          r.name,
          r.category,
          String(r.reward_amount),
          paymentStatusLabel(r.payment_status),
          r.paid_at ?? "",
          r.memo,
        ].map(escape).join(",")
      ),
    ];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `報酬_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const total = rows.reduce((s, r) => s + r.reward_amount, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-bold text-slate-700">報酬内訳（{rows.length}件）</h2>
        <div className="flex-1" />
        <button
          onClick={exportCSV}
          disabled={rows.length === 0}
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-40"
        >
          📥 CSV出力
        </button>
      </div>

      {error && (
        <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>
      )}

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-400">この条件の報酬はありません</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-3 py-2">完了日</th>
                <th className="px-3 py-2">管理番号</th>
                <th className="px-3 py-2">商品名</th>
                <th className="px-3 py-2">カテゴリー</th>
                <th className="px-3 py-2 text-right">報酬</th>
                <th className="px-3 py-2">支払状況</th>
                <th className="px-3 py-2">支払日</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{fmtDate(r.completed_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-bold text-blue-600">{r.control_number}</td>
                  <td className="max-w-[200px] truncate px-3 py-2.5 font-semibold text-slate-700">{r.name}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{r.category}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-slate-800">
                    {editingId === r.id ? (
                      <span className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-24 rounded-lg border border-blue-300 px-2 py-1 text-right text-sm"
                          autoFocus
                        />
                        <button onClick={() => saveAmount(r.id)}
                          className="rounded bg-blue-600 px-2 py-1 text-xs font-bold text-white">保存</button>
                        <button onClick={() => setEditingId(null)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-500">×</button>
                      </span>
                    ) : (
                      <button
                        onClick={() => { setEditingId(r.id); setEditAmount(String(r.reward_amount)); }}
                        title="クリックで金額を修正（変更は履歴に残ります）"
                        className="rounded px-1 hover:bg-blue-50 hover:text-blue-700"
                      >
                        {fmtYen(r.reward_amount)} ✏
                      </button>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <select
                      value={r.payment_status}
                      onChange={(e) => changeStatus(r.id, e.target.value)}
                      className={`rounded-lg border px-2 py-1 text-xs font-bold ${
                        r.payment_status === "paid"
                          ? "border-green-200 bg-green-50 text-green-700"
                          : r.payment_status === "unpaid"
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-slate-300 bg-slate-100 text-slate-500"
                      }`}
                    >
                      {PAYMENT_STATUSES.map((s) => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{r.paid_at ?? "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50">
                <td colSpan={4} className="px-3 py-2.5 text-right text-sm font-bold text-slate-600">合計</td>
                <td className="px-3 py-2.5 text-right text-base font-bold text-slate-800">{fmtYen(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
