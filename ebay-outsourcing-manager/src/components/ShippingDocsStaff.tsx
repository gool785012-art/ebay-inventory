"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { documentTypeLabel } from "@/lib/constants";
import type { ShippingDocument } from "@/types/db";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

// 発送ラベル・発送書類エリア（スタッフ用、Phase 6）
// 貼り間違い防止のため、必ず商品情報（管理番号・商品名・発送会社・追跡番号）とセットで表示する
export default function ShippingDocsStaff({
  docs,
  controlNumber,
  productName,
  carrierName,
  trackingNumber,
}: {
  docs: ShippingDocument[];
  controlNumber: string;
  productName: string;
  carrierName: string;
  trackingNumber: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function openDoc(doc: ShippingDocument, download: boolean) {
    setError("");
    const supabase = createClient();
    const { data, error: err } = await supabase.storage
      .from("shipping-documents")
      .createSignedUrl(doc.file_path, 300, download ? { download: doc.file_name } : undefined);
    if (err || !data?.signedUrl) { setError("ファイルを開けませんでした。管理者に連絡してください。"); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function confirmDoc(doc: ShippingDocument) {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("shipping_documents")
      .update({ confirmed_at: new Date().toISOString(), confirmed_by: user?.id ?? null })
      .eq("id", doc.id);
    setBusy(false);
    if (err) { setError("確認の記録に失敗しました: " + err.message); return; }
    router.refresh();
  }

  if (docs.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-blue-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-base font-bold text-blue-700">📄 発送ラベル・発送書類</h2>

      {/* 取り違え防止: 必ず商品情報とセットで表示（要件16・17） */}
      <div className="mb-3 rounded-lg bg-blue-50 p-3 text-sm">
        <p className="mb-1 text-xs font-bold text-blue-700">
          ⚠ 貼る前に、このラベルがこの商品のものか必ず確認してください
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-slate-700">
          <span className="text-slate-400">管理番号</span>
          <span className="font-mono font-bold">{controlNumber}</span>
          <span className="text-slate-400">商品名</span>
          <span className="font-bold">{productName}</span>
          <span className="text-slate-400">発送会社</span>
          <span className="font-bold">{carrierName || "未定"}</span>
          <span className="text-slate-400">追跡番号</span>
          <span className="font-mono font-bold">{trackingNumber || "（発送時に入力）"}</span>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>
      )}

      <ul className="space-y-3">
        {docs.map((doc) => (
          <li key={doc.id} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                {documentTypeLabel(doc.document_type)}
              </span>
              <span className="max-w-[200px] truncate text-sm font-semibold text-slate-700">
                {doc.file_name}
              </span>
              {doc.confirmed_at && (
                <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">
                  ✓ 確認済み {fmtDateTime(doc.confirmed_at)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => openDoc(doc, false)}
                className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-bold text-white transition hover:bg-blue-700">
                📄 見る・印刷する
              </button>
              <button onClick={() => openDoc(doc, true)}
                className="flex-1 rounded-lg border border-blue-300 bg-white py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-50">
                ⬇ ダウンロード
              </button>
              {!doc.confirmed_at && (
                <button onClick={() => confirmDoc(doc)} disabled={busy}
                  className="flex-1 rounded-lg bg-green-600 py-3 text-sm font-bold text-white transition hover:bg-green-700 disabled:opacity-50">
                  ✓ 確認しました
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-slate-400">
        印刷方法: 「見る・印刷する」で開いた画面から印刷できます（スマホは共有ボタン→プリント）。
      </p>
    </div>
  );
}
