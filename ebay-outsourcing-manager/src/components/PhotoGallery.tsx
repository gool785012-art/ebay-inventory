"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PHOTO_CATEGORIES } from "@/lib/constants";

type Photo = {
  id: string;
  photo_category: string;
  storage_path: string;
  created_at: string;
};

function categoryLabel(key: string) {
  return PHOTO_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

// 写真の一覧表示 + タップで拡大表示（要件9）
// 非公開バケットのため、閲覧権限のある人にだけ有効な期限付きURLを発行して表示する
export default function PhotoGallery({ photos }: { photos: Photo[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    if (photos.length === 0) return;
    const supabase = createClient();
    supabase.storage
      .from("product-photos")
      .createSignedUrls(photos.map((p) => p.storage_path), 3600)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const item of data ?? []) {
          if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
        }
        setUrls(map);
      });
  }, [photos]);

  if (photos.length === 0) {
    return <p className="text-sm text-slate-400">まだ写真はありません</p>;
  }

  // カテゴリーごとにまとめて表示
  const grouped = new Map<string, Photo[]>();
  for (const p of photos) {
    const arr = grouped.get(p.photo_category) ?? [];
    arr.push(p);
    grouped.set(p.photo_category, arr);
  }

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([cat, list]) => (
        <div key={cat}>
          <div className="mb-2 text-xs font-bold text-slate-500">
            {categoryLabel(cat)}（{list.length}枚）
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => urls[p.storage_path] && setZoom(urls[p.storage_path])}
                className="aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
              >
                {urls[p.storage_path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urls[p.storage_path]}
                    alt={categoryLabel(cat)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                    読込中
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* 拡大表示 */}
      {zoom && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoom(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="拡大表示" className="max-h-full max-w-full rounded-lg" />
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/90 px-4 py-2 text-sm font-bold text-slate-700"
            onClick={() => setZoom(null)}
          >
            ✕ 閉じる
          </button>
        </div>
      )}
    </div>
  );
}
