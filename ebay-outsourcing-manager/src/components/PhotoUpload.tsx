"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PHOTO_CATEGORIES } from "@/lib/constants";

// 写真アップロード部品（スマホのカメラ撮影・複数枚対応、要件9）
// category を渡すと固定カテゴリー、渡さなければカテゴリー選択式（管理者用）
export default function PhotoUpload({
  productId,
  category,
  compact,
}: {
  productId: string;
  category?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState(category ?? "other");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${productId}/${selectedCategory}/${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("product-photos")
        .upload(path, file);

      if (upErr) {
        setError("アップロードに失敗しました: " + upErr.message);
        setUploading(false);
        return;
      }

      const { error: dbErr } = await supabase.from("product_photos").insert({
        product_id: productId,
        photo_category: selectedCategory,
        storage_path: path,
        uploaded_by: user?.id ?? null,
      });

      if (dbErr) {
        setError("記録に失敗しました: " + dbErr.message);
        setUploading(false);
        return;
      }
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <div className={compact ? "" : "rounded-lg border border-slate-200 bg-slate-50 p-3"}>
      <div className="flex flex-wrap items-center gap-2">
        {!category && (
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            {PHOTO_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
          id={`photo-input-${productId}-${category ?? "any"}`}
        />
        <label
          htmlFor={`photo-input-${productId}-${category ?? "any"}`}
          className={`cursor-pointer rounded-lg px-4 py-2.5 text-sm font-bold transition ${
            uploading
              ? "bg-slate-200 text-slate-400"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {uploading ? "アップロード中..." : "📷 写真を撮影 / 選択"}
        </label>
        <span className="text-xs text-slate-400">複数枚選択できます</span>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
    </div>
  );
}
