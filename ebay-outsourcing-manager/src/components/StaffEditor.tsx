"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STAFF_STATUSES } from "@/lib/constants";
import type { Profile } from "@/types/db";

// スタッフ情報の表示・編集（管理者用、Phase 5）
export default function StaffEditor({ staff }: { staff: Profile }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(staff.full_name);
  const [phone, setPhone] = useState(staff.phone ?? "");
  const [status, setStatus] = useState(staff.status);
  const [notes, setNotes] = useState(staff.notes);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave() {
    setSaving(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), phone: phone.trim(), status, notes })
      .eq("id", staff.id);
    setSaving(false);
    if (error) {
      setMessage("保存に失敗しました: " + error.message);
      return;
    }
    setMessage("保存しました");
    router.refresh();
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500";
  const labelCls = "mb-1 block text-xs font-semibold text-slate-600";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>氏名</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>メールアドレス（ログイン用・変更不可）</label>
          <input value={staff.email ?? ""} readOnly className={`${inputCls} bg-slate-50 text-slate-500`} />
        </div>
        <div>
          <label className={labelCls}>電話番号</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>登録日</label>
          <input
            value={new Date(staff.created_at).toLocaleDateString("ja-JP")}
            readOnly
            className={`${inputCls} bg-slate-50 text-slate-500`}
          />
        </div>
        <div>
          <label className={labelCls}>ステータス</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Profile["status"])}
            className={inputCls}
          >
            {STAFF_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>備考</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存する"}
        </button>
        {message && (
          <span className={`text-sm font-semibold ${message.startsWith("保存しました") ? "text-green-600" : "text-red-600"}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
