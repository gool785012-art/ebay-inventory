"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DOCUMENT_TYPES, documentTypeLabel } from "@/lib/constants";
import type { ShippingDocument } from "@/types/db";

const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png"];

function fmtDateTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

// 発送書類エリア（管理者用、Phase 6）
// アップロード → 共有 → スタッフ確認、の状態がひと目で分かる
export default function ShippingDocsAdmin({
  productId,
  docs,
}: {
  productId: string;
  docs: ShippingDocument[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("label");
  const [replaceTarget, setReplaceTarget] = useState<ShippingDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function validate(file: File): string | null {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXT.includes(ext)) {
      return "PDF・JPG・JPEG・PNG のファイルのみアップロードできます";
    }
    return null;
  }

  function storagePath(file: File) {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    return `${productId}/${Date.now()}-${safeName}`;
  }

  async function handleUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const invalid = validate(file);
    if (invalid) { setError(invalid); return; }

    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const path = storagePath(file);

    const { error: upErr } = await supabase.storage
      .from("shipping-documents").upload(path, file);
    if (upErr) { setBusy(false); setError("アップロードに失敗しました: " + upErr.message); return; }

    const { error: dbErr } = await supabase.from("shipping_documents").insert({
      product_id: productId,
      document_type: docType,
      file_name: file.name,
      file_path: path,
      uploaded_by: user?.id ?? null,
    });
    setBusy(false);
    if (dbErr) { setError("登録に失敗しました: " + dbErr.message); return; }
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function handleReplace(files: FileList | null) {
    const file = files?.[0];
    const target = replaceTarget;
    if (!file || !target) return;
    const invalid = validate(file);
    if (invalid) { setError(invalid); return; }

    setBusy(true);
    setError("");
    const supabase = createClient();
    const path = storagePath(file);

    const { error: upErr } = await supabase.storage
      .from("shipping-documents").upload(path, file);
    if (upErr) { setBusy(false); setError("アップロードに失敗しました: " + upErr.message); return; }

    const { error: dbErr } = await supabase
      .from("shipping_documents")
      .update({ file_name: file.name, file_path: path, confirmed_at: null, confirmed_by: null })
      .eq("id", target.id);
    if (dbErr) { setBusy(false); setError("差し替えに失敗しました: " + dbErr.message); return; }

    await supabase.storage.from("shipping-documents").remove([target.file_path]);
    setBusy(false);
    setReplaceTarget(null);
    if (replaceRef.current) replaceRef.current.value = "";
    router.refresh();
  }

  async function openDoc(doc: ShippingDocument, download: boolean) {
    setError("");
    const supabase = createClient();
    const { data, error: err } = await supabase.storage
      .from("shipping-documents")
      .createSignedUrl(doc.file_path, 300, download ? { download: doc.file_name } : undefined);
    if (err || !data?.signedUrl) { setError("ファイルを開けませんでした"); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function share(doc: ShippingDocument) {
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase
      .from("shipping_documents")
      .update({ shared_at: new Date().toISOString() })
      .eq("id", doc.id);
    if (err) { setError("共有に失敗しました: " + err.message); return; }
    router.refresh();
  }

  async function remove(doc: ShippingDocument) {
    if (!window.confirm(`「${doc.file_name}」を削除しますか？スタッフからも見えなくなります。`)) return;
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.from("shipping_documents").delete().eq("id", doc.id);
    if (err) { setError("削除に失敗しました: " + err.message); return; }
    await supabase.storage.from("shipping-documents").remove([doc.file_path]);
    router.refresh();
  }

  function docStatus(doc: ShippingDocument) {
    if (doc.confirmed_at)
      return { label: "スタッフ確認済み", cls: "border-green-200 bg-green-50 text-green-700" };
    if (doc.shared_at)
      return { label: "共有済み", cls: "border-blue-200 bg-blue-50 text-blue-700" };
    return { label: "未共有", cls: "border-slate-300 bg-slate-100 text-slate-500" };
  }

  const btnSmall =
    "rounded-lg border px-2.5 py-1.5 text-xs font-bold transition";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-base font-bold text-slate-700">発送書類</h2>
      <p className="mb-3 text-xs text-slate-400">
        FedEx・DHL・国際郵便のラベルやインボイスをアップロードし、「共有する」を押すとスタッフに表示されます。共有するまでスタッフには見えません。
      </p>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>
      )}

      {/* 書類一覧 */}
      {docs.length === 0 ? (
        <p className="mb-4 rounded-lg bg-slate-50 px-4 py-4 text-center text-sm text-slate-400">
          まだ発送書類はありません
        </p>
      ) : (
        <ul className="mb-4 space-y-2">
          {docs.map((doc) => {
            const st = docStatus(doc);
            return (
              <li key={doc.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">
                  {documentTypeLabel(doc.document_type)}
                </span>
                <span className="max-w-[220px] truncate text-sm font-semibold text-slate-700">
                  {doc.file_name}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${st.cls}`}>
                  {st.label}
                  {doc.confirmed_at && (
                    <span className="ml-1 font-normal">({fmtDateTime(doc.confirmed_at)})</span>
                  )}
                </span>
                <div className="flex-1" />
                <button onClick={() => openDoc(doc, false)}
                  className={`${btnSmall} border-slate-300 bg-white text-slate-600 hover:bg-slate-100`}>
                  プレビュー
                </button>
                <button onClick={() => openDoc(doc, true)}
                  className={`${btnSmall} border-slate-300 bg-white text-slate-600 hover:bg-slate-100`}>
                  ダウンロード
                </button>
                {!doc.shared_at && (
                  <button onClick={() => share(doc)}
                    className={`${btnSmall} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}>
                    スタッフへ共有する
                  </button>
                )}
                <button
                  onClick={() => { setReplaceTarget(doc); replaceRef.current?.click(); }}
                  className={`${btnSmall} border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100`}>
                  差し替え
                </button>
                <button onClick={() => remove(doc)}
                  className={`${btnSmall} border-red-200 bg-red-50 text-red-600 hover:bg-red-100`}>
                  削除
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* アップロード */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
        <select value={docType} onChange={(e) => setDocType(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
          {DOCUMENT_TYPES.map((d) => (
            <option key={d.key} value={d.key}>{d.label}</option>
          ))}
        </select>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => handleUpload(e.target.files)} className="hidden" id={`shipdoc-upload-${productId}`} />
        <label htmlFor={`shipdoc-upload-${productId}`}
          className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-bold transition ${
            busy ? "bg-slate-200 text-slate-400" : "bg-blue-600 text-white hover:bg-blue-700"
          }`}>
          {busy ? "処理中..." : "📎 ファイルをアップロード"}
        </label>
        <span className="text-xs text-slate-400">PDF / JPG / PNG</span>
      </div>

      {/* 差し替え用の非表示ファイル入力 */}
      <input ref={replaceRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => handleReplace(e.target.files)} className="hidden" />
    </div>
  );
}
