"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PHOTO_CATEGORIES } from "@/lib/constants";
import { toStoragePath } from "@/lib/storage-path";

const BUCKET = "product-photos";

type Photo = {
  id: string;
  photo_category: string;
  storage_path: string;
  created_at: string;
};

function categoryLabel(key: string) {
  return PHOTO_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

// 写真の一覧表示 + タップで拡大表示 + 1枚ずつの削除（要件9）
// 非公開バケットのため、閲覧権限のある人にだけ有効な期限付きURLを発行して表示する
export default function PhotoGallery({
  photos,
  heading,
  canDelete = true,
}: {
  photos: Photo[];
  /** 見出し（枚数は削除に合わせてこの部品側で即時更新する） */
  heading?: string;
  canDelete?: boolean;
}) {
  const router = useRouter();
  // 削除を画面へ即時反映するため、表示中の一覧はこの部品の state で持つ
  const [items, setItems] = useState<Photo[]>(photos);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Photo | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // サーバー側の一覧が変わったとき（アップロード直後など）に取り込む
  const signature = photos.map((p) => p.id).join(",");
  useEffect(() => {
    setItems(photos);
    // signature は photos の内容そのものを表すキー
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const paths = useMemo(
    () => items.map((p) => toStoragePath(p.storage_path, BUCKET)),
    [items],
  );
  const pathKey = paths.join(",");

  useEffect(() => {
    if (paths.length === 0) return;
    const supabase = createClient();
    supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const item of data ?? []) {
          if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
        }
        setUrls((prev) => ({ ...prev, ...map }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  async function handleDelete(photo: Photo) {
    setDeletingId(photo.id);
    setError("");
    const supabase = createClient();
    const path = toStoragePath(photo.storage_path, BUCKET);

    try {
      // 1) Storage の実ファイルを削除（public URL ではなくバケット内のパスを渡す）
      if (path) {
        const { error: storageErr } = await supabase.storage.from(BUCKET).remove([path]);
        if (storageErr) throw new Error(storageErr.message);
      }

      // 2) DB の写真情報を削除（この1枚だけを id で指定）
      const { data: deleted, error: dbErr } = await supabase
        .from("product_photos")
        .delete()
        .eq("id", photo.id)
        .select("id");
      if (dbErr) throw new Error(dbErr.message);
      if (!deleted || deleted.length === 0) {
        throw new Error("削除権限がありません（管理者にご連絡ください）");
      }

      // 3) 画面（React state）からも削除
      setItems((prev) => prev.filter((p) => p.id !== photo.id));
      setConfirmTarget(null);
      router.refresh();
    } catch (e) {
      setError(
        "写真の削除に失敗しました。もう一度お試しください。（" +
          (e instanceof Error ? e.message : String(e)) +
          "）",
      );
    } finally {
      setDeletingId(null);
    }
  }

  // カテゴリーごとにまとめて表示
  const grouped = new Map<string, Photo[]>();
  for (const p of items) {
    const arr = grouped.get(p.photo_category) ?? [];
    arr.push(p);
    grouped.set(p.photo_category, arr);
  }

  return (
    <div className="space-y-4">
      {heading && (
        <h2 className="text-base font-bold text-slate-700">
          {heading}（{items.length}枚）
        </h2>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {items.length === 0 && <p className="text-sm text-slate-400">まだ写真はありません</p>}

      {Array.from(grouped.entries()).map(([cat, list]) => (
        <div key={cat}>
          <div className="mb-2 text-xs font-bold text-slate-500">
            {categoryLabel(cat)}（{list.length}枚）
          </div>
          {/* 画面幅に応じて自動で横並び（スマホ2枚前後 / PC は多数）。横スクロールは発生しない */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
            {list.map((p) => {
              const url = urls[toStoragePath(p.storage_path, BUCKET)];
              const busy = deletingId === p.id;
              return (
                <div key={p.id} className="relative">
                  <button
                    type="button"
                    onClick={() => url && setZoom(url)}
                    className="block aspect-square w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={categoryLabel(cat)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                        読込中
                      </span>
                    )}
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      aria-label="この写真を削除"
                      title="この写真を削除"
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setConfirmTarget(p);
                      }}
                      className={`absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full text-base font-bold text-white shadow-md transition ${
                        busy ? "bg-slate-400" : "bg-red-600 hover:bg-red-700"
                      }`}
                    >
                      {busy ? "…" : "✕"}
                    </button>
                  )}

                  {busy && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70 text-xs font-bold text-slate-600">
                      削除中...
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* 削除確認 */}
      {confirmTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xs rounded-xl bg-white p-5 shadow-xl">
            <p className="text-sm font-bold text-slate-700">この写真を削除しますか？</p>
            <p className="mt-1 text-xs text-slate-500">削除すると元に戻せません。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => setConfirmTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => handleDelete(confirmTarget)}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:bg-slate-400"
              >
                {deletingId !== null ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}

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
