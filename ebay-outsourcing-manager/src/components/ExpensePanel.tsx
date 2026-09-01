"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fmtYen } from "@/lib/constants";
import {
  EXPENSE_TYPES, EXPENSE_STATUSES, expenseTypeLabel,
  expenseStatusLabel, expenseStatusBadge, calcExpenseTotal, validateAmount,
} from "@/lib/reward";
import type { ProductExpense, ExpenseReceipt } from "@/types/db";

// 立替金の入力・管理（スタッフ＆管理者共通、Phase 10）
// スタッフ: 登録・編集・領収書アップロード
// 管理者: 上記に加えて承認・差し戻し・「領収書なしで承認」
export default function ExpensePanel({
  productId,
  expenses,
  receipts,
  isAdmin,
}: {
  productId: string;
  expenses: ProductExpense[];
  receipts: ExpenseReceipt[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState("postal_postage");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const receiptRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);

  const total = calcExpenseTotal(expenses);
  const approvedTotal = calcExpenseTotal(expenses, true);

  function receiptsOf(expenseId: string) {
    return receipts.filter((r) => r.expense_id === expenseId);
  }

  function resetForm() {
    setOpen(false);
    setEditingId(null);
    setType("postal_postage");
    setAmount("");
    setDescription("");
    setError("");
    setWarning("");
  }

  async function save() {
    const check = validateAmount(amount);
    if (!check.ok) { setError(check.message ?? "金額が正しくありません"); return; }
    if (check.message && !window.confirm(`${check.message}\nこの金額で登録しますか？`)) return;

    setSaving(true);
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      product_id: productId,
      expense_type: type,
      amount: check.value,
      description: description.trim(),
    };

    const result = editingId
      ? await supabase.from("product_expenses").update(payload).eq("id", editingId)
      : await supabase.from("product_expenses").insert({ ...payload, created_by: user?.id ?? null });

    setSaving(false);
    if (result.error) { setError("保存に失敗しました: " + result.error.message); return; }
    resetForm();
    router.refresh();
  }

  async function remove(expense: ProductExpense) {
    if (!window.confirm(`「${expenseTypeLabel(expense.expense_type)} ${fmtYen(expense.amount)}」を削除しますか？`)) return;
    const supabase = createClient();
    const { error: err } = await supabase.from("product_expenses").delete().eq("id", expense.id);
    if (err) { setError("削除に失敗しました: " + err.message); return; }
    router.refresh();
  }

  async function changeStatus(expenseId: string, status: string) {
    const supabase = createClient();
    const { error: err } = await supabase
      .from("product_expenses").update({ status }).eq("id", expenseId);
    if (err) { setError("変更に失敗しました: " + err.message); return; }
    router.refresh();
  }

  async function approveWithoutReceipt(expenseId: string) {
    if (!window.confirm("領収書なしで承認します。よろしいですか？")) return;
    const supabase = createClient();
    const { error: err } = await supabase
      .from("product_expenses")
      .update({ status: "approved", no_receipt_approved: true })
      .eq("id", expenseId);
    if (err) { setError("承認に失敗しました: " + err.message); return; }
    router.refresh();
  }

  async function uploadReceipt(files: FileList | null) {
    const expenseId = uploadTarget;
    if (!files || files.length === 0 || !expenseId) return;
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    for (const file of Array.from(files)) {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${productId}/${expenseId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("expense-receipts").upload(path, file);
      if (upErr) { setSaving(false); setError("アップロードに失敗しました: " + upErr.message); return; }

      const { error: dbErr } = await supabase.from("expense_receipts").insert({
        expense_id: expenseId,
        product_id: productId,
        file_name: file.name,
        storage_path: path,
        uploaded_by: user?.id ?? null,
      });
      if (dbErr) { setSaving(false); setError("記録に失敗しました: " + dbErr.message); return; }
    }

    setSaving(false);
    setUploadTarget(null);
    if (receiptRef.current) receiptRef.current.value = "";
    router.refresh();
  }

  async function openReceipt(receipt: ExpenseReceipt) {
    const supabase = createClient();
    const { data, error: err } = await supabase.storage
      .from("expense-receipts").createSignedUrl(receipt.storage_path, 300);
    if (err || !data?.signedUrl) { setError("領収書を開けませんでした"); return; }
    window.open(data.signedUrl, "_blank");
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-slate-700">💴 立替金</h2>
        {total > 0 && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
            合計 {fmtYen(total)}
          </span>
        )}
        {isAdmin && total !== approvedTotal && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
            承認済み {fmtYen(approvedTotal)}
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-slate-400">
        郵便局で支払った送料や、購入した梱包資材などを登録してください。作業報酬とは別に返金されます。
      </p>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-600">{error}</p>
      )}

      {/* 立替金の一覧 */}
      {expenses.length === 0 ? (
        <p className="mb-3 rounded-lg bg-slate-50 px-4 py-4 text-center text-sm text-slate-400">
          立替金の登録はありません
        </p>
      ) : (
        <ul className="mb-3 space-y-2">
          {expenses.map((e) => {
            const rs = receiptsOf(e.id);
            const needsReceipt = e.amount > 0 && rs.length === 0 && !e.no_receipt_approved;
            return (
              <li key={e.id} className={`rounded-lg border p-3 ${
                needsReceipt ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"
              }`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">
                    {expenseTypeLabel(e.expense_type)}
                  </span>
                  <span className="text-base font-bold text-slate-800">{fmtYen(e.amount)}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${expenseStatusBadge(e.status)}`}>
                    {expenseStatusLabel(e.status)}
                  </span>
                  {e.no_receipt_approved && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      領収書なしで承認
                    </span>
                  )}
                </div>
                {e.description && (
                  <p className="mt-1 text-sm text-slate-600">{e.description}</p>
                )}

                {/* 領収書 */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {rs.map((r) => (
                    <button key={r.id} onClick={() => openReceipt(r)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                      🧾 {r.file_name.length > 16 ? r.file_name.slice(0, 16) + "…" : r.file_name}
                    </button>
                  ))}
                  {e.status !== "approved" && (
                    <button
                      onClick={() => { setUploadTarget(e.id); receiptRef.current?.click(); }}
                      className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100">
                      📷 領収書を追加
                    </button>
                  )}
                </div>
                {needsReceipt && (
                  <p className="mt-2 text-xs font-bold text-amber-700">
                    ⚠ 領収書がまだアップロードされていません
                  </p>
                )}

                {/* 操作 */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {isAdmin ? (
                    <>
                      <select value={e.status} onChange={(ev) => changeStatus(e.id, ev.target.value)}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-bold">
                        {EXPENSE_STATUSES.map((s) => (
                          <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                      </select>
                      {needsReceipt && e.status !== "approved" && (
                        <button onClick={() => approveWithoutReceipt(e.id)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                          領収書なしで承認
                        </button>
                      )}
                    </>
                  ) : null}
                  {e.status !== "approved" && (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(e.id);
                          setType(e.expense_type);
                          setAmount(String(e.amount));
                          setDescription(e.description);
                          setOpen(true);
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                        編集
                      </button>
                      {(isAdmin || e.status === "pending") && (
                        <button onClick={() => remove(e)}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100">
                          削除
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 合計 */}
      {expenses.length > 0 && (
        <div className="mb-3 flex items-center rounded-lg bg-slate-100 px-4 py-2.5">
          <span className="text-sm font-bold text-slate-600">立替金合計</span>
          <span className="flex-1" />
          <span className="text-lg font-bold text-slate-800">{fmtYen(total)}</span>
        </div>
      )}

      {/* 追加・編集フォーム */}
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="w-full rounded-lg bg-blue-600 py-3.5 text-base font-bold text-white transition hover:bg-blue-700">
          ＋ 立替金を追加
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">種類</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              {EXPENSE_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">金額（円）</label>
            <input
              type="number" min="0" inputMode="numeric" value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                const c = validateAmount(e.target.value);
                setWarning(c.ok && c.message ? c.message : "");
              }}
              placeholder="例: 1860" className={inputCls}
            />
            {warning && <p className="mt-1 text-xs font-bold text-amber-600">⚠ {warning}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">内容</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="例: 国際郵便送料 / 120サイズ ダンボール5枚" className={inputCls} />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 rounded-lg bg-blue-600 py-3.5 text-base font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
              {saving ? "保存中..." : editingId ? "更新する" : "登録する"}
            </button>
            <button type="button" onClick={resetForm}
              className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-500">
              キャンセル
            </button>
          </div>
          <p className="text-xs text-slate-400">
            登録後、その明細の「📷 領収書を追加」から領収書・レシートの写真をアップロードできます。
          </p>
        </div>
      )}

      {/* 領収書アップロード用の非表示入力（カメラ撮影・ライブラリ選択の両対応） */}
      <input ref={receiptRef} type="file" accept="image/*,.pdf" multiple
        onChange={(e) => uploadReceipt(e.target.files)} className="hidden" />
    </div>
  );
}
