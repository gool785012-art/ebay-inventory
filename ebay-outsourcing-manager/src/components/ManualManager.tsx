"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Category, Carrier } from "@/types/db";

type Manual = {
  id: number;
  title: string;
  description: string;
  category_id: number | null;
  carrier_id: number | null;
  file_path: string;
  file_name: string;
  is_active: boolean;
  updated_at: string;
};

// マニュアル管理（管理者用、Phase 11）
export default function ManualManager({
  manuals,
  categories,
  carriers,
}: {
  manuals: Manual[];
  categories: Category[];
  carriers: Carrier[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadTarget, setUploadTarget] = useState<number | null>(null);

  function resetForm() {
    setOpen(false); setEditingId(null); setTitle(""); setDescription("");
    setCategoryId(""); setCarrierId(""); setError("");
  }

  async function save() {
    if (!title.trim()) { setError("マニュアル名を入力してください"); return; }
    setBusy(true); setError("");
    const supabase = createClient();
    const payload = {
      title: title.trim(),
      description: description.trim(),
      category: "manual",  // 既存カラム（必須）の互換用
      category_id: categoryId ? Number(categoryId) : null,
      carrier_id: carrierId ? Number(carrierId) : null,
    };
    const result = editingId
      ? await supabase.from("manuals").update(payload).eq("id", editingId)
      : await supabase.from("manuals").insert(payload);
    setBusy(false);
    if (result.error) { setError("保存に失敗しました: " + result.error.message); return; }
    resetForm();
    router.refresh();
  }

  async function toggleActive(m: Manual) {
    const supabase = createClient();
    const { error: err } = await supabase
      .from("manuals").update({ is_active: !m.is_active }).eq("id", m.id);
    if (err) { setError("変更に失敗しました: " + err.message); return; }
    router.refresh();
  }

  async function remove(m: Manual) {
    if (!window.confirm(`「${m.title}」を削除しますか？`)) return;
    const supabase = createClient();
    const { error: err } = await supabase.from("manuals").delete().eq("id", m.id);
    if (err) { setError("削除に失敗しました: " + err.message); return; }
    if (m.file_path) await supabase.storage.from("manuals").remove([m.file_path]);
    router.refresh();
  }

  async function uploadPdf(files: FileList | null) {
    const file = files?.[0];
    const manualId = uploadTarget;
    if (!file || !manualId) return;
    setBusy(true); setError("");
    const supabase = createClient();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${manualId}/${Date.now()}-${safeName}`;

    const { error: upErr } = await supabase.storage.from("manuals").upload(path, file);
    if (upErr) { setBusy(false); setError("アップロードに失敗しました: " + upErr.message); return; }

    const { error: dbErr } = await supabase
      .from("manuals").update({ file_path: path, file_name: file.name }).eq("id", manualId);
    setBusy(false);
    if (dbErr) { setError("記録に失敗しました: " + dbErr.message); return; }
    setUploadTarget(null);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function openPdf(m: Manual) {
    const supabase = createClient();
    const { data, error: err } = await supabase.storage
      .from("manuals").createSignedUrl(m.file_path, 600);
    if (err || !data?.signedUrl) { setError("開けませんでした"); return; }
    window.open(data.signedUrl, "_blank");
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500";
  const catName = (id: number | null) =>
    categories.find((c) => c.id === id)?.name ?? "";
  const carName = (id: number | null) =>
    carriers.find((c) => c.id === id)?.name ?? "";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-base font-bold text-slate-700">📘 マニュアル管理</h2>
        <div className="flex-1" />
        {!open && (
          <button onClick={() => setOpen(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
            ＋ マニュアルを追加
          </button>
        )}
      </div>
      <p className="mb-3 text-xs text-slate-400">
        カテゴリー・発送会社を指定すると、該当する商品の作業画面に自動で表示されます（両方「すべて」にすると全案件に表示）。
      </p>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>
      )}

      {open && (
        <div className="mb-4 space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">マニュアル名 *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="例: ゲーム機 動作確認マニュアル" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">説明</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              className={inputCls} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">対象カテゴリー</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
                <option value="">すべて</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">対象発送会社</label>
              <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)} className={inputCls}>
                <option value="">すべて</option>
                {carriers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? "保存中..." : editingId ? "更新する" : "登録する"}
            </button>
            <button onClick={resetForm}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-500">
              キャンセル
            </button>
          </div>
          <p className="text-xs text-slate-400">
            登録後、一覧の「📎 PDFを登録」からファイルをアップロードしてください。
          </p>
        </div>
      )}

      {manuals.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          マニュアルが登録されていません
        </p>
      ) : (
        <ul className="space-y-2">
          {manuals.map((m) => (
            <li key={m.id} className={`rounded-lg border p-3 ${
              m.is_active ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-slate-100 opacity-60"
            }`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-slate-800">{m.title}</span>
                {catName(m.category_id) && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                    {catName(m.category_id)}
                  </span>
                )}
                {carName(m.carrier_id) && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
                    {carName(m.carrier_id)}
                  </span>
                )}
                {!m.is_active && (
                  <span className="rounded-full bg-slate-300 px-2 py-0.5 text-xs font-bold text-slate-600">
                    無効
                  </span>
                )}
              </div>
              {m.description && <p className="mt-1 text-xs text-slate-500">{m.description}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {m.file_path ? (
                  <button onClick={() => openPdf(m)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                    📄 {m.file_name}
                  </button>
                ) : (
                  <span className="rounded-lg bg-amber-100 px-2 py-1.5 text-xs font-bold text-amber-700">
                    PDF未登録
                  </span>
                )}
                <button onClick={() => { setUploadTarget(m.id); fileRef.current?.click(); }}
                  className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100">
                  📎 {m.file_path ? "PDFを差し替え" : "PDFを登録"}
                </button>
                <button onClick={() => {
                  setEditingId(m.id); setTitle(m.title); setDescription(m.description);
                  setCategoryId(m.category_id?.toString() ?? "");
                  setCarrierId(m.carrier_id?.toString() ?? "");
                  setOpen(true);
                }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                  編集
                </button>
                <button onClick={() => toggleActive(m)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                  {m.is_active ? "無効にする" : "有効にする"}
                </button>
                <button onClick={() => remove(m)}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100">
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <input ref={fileRef} type="file" accept=".pdf,image/*"
        onChange={(e) => uploadPdf(e.target.files)} className="hidden" />
    </div>
  );
}
