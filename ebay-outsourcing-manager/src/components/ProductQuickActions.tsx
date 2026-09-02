"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendNotification } from "@/lib/notify-client";
import { STATUSES } from "@/lib/constants";
import type { Profile } from "@/types/db";

// 商品詳細ページのクイック操作（管理者用）: ステータス変更 / 担当者割り当て / 削除
export default function ProductQuickActions({
  productId,
  currentStatus,
  currentStaffId,
  staffList,
  workStatus,
  needsReviewReason,
}: {
  productId: string;
  currentStatus: string;
  currentStaffId: string | null;
  staffList: Profile[];
  /** 作業状況（要確認なら管理者が強制完了できる） */
  workStatus?: string;
  needsReviewReason?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [staffId, setStaffId] = useState(currentStaffId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const changed = status !== currentStatus || staffId !== (currentStaffId ?? "");

  async function handleSave() {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase
      .from("products")
      .update({ status, assigned_staff_id: staffId || null })
      .eq("id", productId);
    setSaving(false);
    if (error) {
      setError("保存に失敗しました: " + error.message);
      return;
    }
    // 仕入れ先から外注先へ発送したタイミングでスタッフへ通知
    if (status === "sent_to_staff" && currentStatus !== "sent_to_staff") {
      await sendNotification("sent_to_staff", productId);
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm("この商品を削除しますか？写真・コメント・履歴もすべて削除され、元に戻せません。")) {
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("products").delete().eq("id", productId);
    if (error) {
      setError("削除に失敗しました: " + error.message);
      return;
    }
    router.push("/admin/products");
    router.refresh();
  }

  // 管理者権限で発送完了にする（スタッフ側で止まっている場合の対応）
  async function forceComplete() {
    if (
      !window.confirm(
        "管理者権限で発送完了にします。\nスタッフ側の必須作業（写真・動作確認など）が未完了でも完了扱いになります。よろしいですか？"
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase
      .from("products")
      .update({
        status: "shipped",
        has_problem: false,
        shipped_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", productId);
    setSaving(false);
    if (error) { setError("完了処理に失敗しました: " + error.message); return; }
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {workStatus === "needs_review" && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-bold text-red-700">
            ⚠ 要確認: {needsReviewReason || "確認が必要です"}
          </p>
          <p className="mt-1 text-xs text-red-600">
            この状態ではスタッフは発送完了できません。内容を確認し、問題なければ下のボタンで完了できます。
          </p>
          <button onClick={forceComplete} disabled={saving}
            className="mt-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50">
            管理者権限で発送完了にする
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">
            ステータス変更
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">
            担当スタッフ
          </label>
          <select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          >
            <option value="">未割当</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || s.email}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleSave}
          disabled={!changed || saving}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? "保存中..." : "変更を保存"}
        </button>
        <div className="flex-1" />
        <button
          onClick={handleDelete}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100"
        >
          削除
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>
      )}
    </div>
  );
}
