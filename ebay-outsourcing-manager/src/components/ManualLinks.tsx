"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Manual = {
  id: number;
  title: string;
  description: string;
  file_path: string;
  file_name: string;
};

// 作業画面から関連マニュアルを直接開く（スタッフ用、Phase 11）
export default function ManualLinks({ manuals }: { manuals: Manual[] }) {
  const [error, setError] = useState("");

  async function openManual(m: Manual) {
    setError("");
    if (!m.file_path) { setError("このマニュアルにはPDFが登録されていません"); return; }
    const supabase = createClient();
    const { data, error: err } = await supabase.storage
      .from("manuals").createSignedUrl(m.file_path, 600);
    if (err || !data?.signedUrl) { setError("マニュアルを開けませんでした"); return; }
    window.open(data.signedUrl, "_blank");
  }

  if (manuals.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-base font-bold text-slate-700">📘 作業マニュアル</h2>
      {error && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-600">{error}</p>
      )}
      <ul className="space-y-2">
        {manuals.map((m) => (
          <li key={m.id}>
            <button
              onClick={() => openManual(m)}
              className="flex w-full items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left transition active:bg-blue-100"
            >
              <span className="text-xl">📘</span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-slate-800">{m.title}</span>
                {m.description && (
                  <span className="block text-xs text-slate-500">{m.description}</span>
                )}
              </span>
              <span className="text-sm font-bold text-blue-700">見る →</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
