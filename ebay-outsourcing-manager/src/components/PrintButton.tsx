"use client";

// 精算書の印刷ボタン（Phase 11）
// ブラウザの印刷機能を使うため、日本語フォントがそのまま使え文字化けしない。
// 「送信先: PDFに保存」を選べばPDFファイルになる。
export default function PrintButton({ fileName }: { fileName: string }) {
  function handlePrint() {
    // 印刷時のファイル名候補としてページタイトルを使う
    const original = document.title;
    document.title = fileName;
    window.print();
    setTimeout(() => { document.title = original; }, 1000);
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 15mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .break-before-page { break-before: page; }
        }
      `}</style>
      <div className="no-print mb-6 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-800">
            この画面を印刷すると精算書になります
          </p>
          <p className="text-xs text-blue-700">
            印刷ダイアログで「送信先」を「PDFに保存」にすると、PDFファイルとして保存できます。
          </p>
        </div>
        <button onClick={handlePrint}
          className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700">
          🖨 印刷 / PDF保存
        </button>
      </div>
    </>
  );
}
