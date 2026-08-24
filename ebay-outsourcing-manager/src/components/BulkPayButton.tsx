"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmtYen } from "@/lib/constants";
import { monthRange, monthLabel } from "@/lib/month";

// 「未払い分をまとめて支払済みにする」ボタン（管理者用、Phase 5）
export default function BulkPayButton({
  month,
  unpaidTotal,
  unpaidCount,
}: {
  month: string;
  unpaidTotal: number;
  unpaidCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleBulkPay() {
    if (
      !window.confirm(
        `${monthLabel(month)}分の未払い報酬 ${fmtYen(unpaidTotal)}（${unpaidCount}件）を支払済みに変更しますか？`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    const { start, end } = monthRange(month);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("work_rewards")
      .update({ payment_status: "paid", paid_at: new Date().toISOString().slice(0, 10) })
      .eq("payment_status", "unpaid")
      .gte("completed_at", start)
      .lt("completed_at", end);
    setBusy(false);
    if (err) {
      setError("変更に失敗しました: " + err.message);
      return;
    }
    router.refresh();
  }

  if (unpaidCount === 0) return null;

  return (
    <div>
      <button
        onClick={handleBulkPay}
        disabled={busy}
        className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-green-700 disabled:opacity-50"
      >
        {busy ? "処理中..." : `✓ 未払い分をまとめて支払済みにする（${fmtYen(unpaidTotal)}）`}
      </button>
      {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
    </div>
  );
}
