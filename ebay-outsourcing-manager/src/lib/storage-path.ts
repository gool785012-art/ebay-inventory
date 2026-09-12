// Supabase Storage のファイルパスを求める共通関数
//
// DB（product_photos.storage_path）には本来「バケット内のパス」だけを保存しているが、
// 過去のデータや別経路で登録されたデータに public URL / signed URL が
// そのまま入っている可能性がある。
// storage.remove() には URL ではなくバケット内のパスを渡す必要があるため、
// どちらの形式でも正しいパスに変換できるようにここで吸収する。
//
// 例）
//   "abc-123/item/1700000000-1234.jpg"
//     -> "abc-123/item/1700000000-1234.jpg"
//   "https://xxx.supabase.co/storage/v1/object/public/product-photos/abc-123/item/1.jpg"
//     -> "abc-123/item/1.jpg"
//   "https://xxx.supabase.co/storage/v1/object/sign/product-photos/abc-123/item/1.jpg?token=..."
//     -> "abc-123/item/1.jpg"
export function toStoragePath(value: string, bucket: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  // URL でなければ、そのままバケット内のパスとして扱う（先頭の / だけ除去）
  if (!/^https?:\/\//i.test(raw)) {
    return decodeURIComponent(raw.replace(/^\/+/, ""));
  }

  let pathname = raw;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    // URL として解釈できない場合はクエリだけ落として続行
    pathname = raw.split("?")[0];
  }

  // .../storage/v1/object/{public|sign|authenticated}/{bucket}/{パス} を切り出す
  const marker = `/${bucket}/`;
  const idx = pathname.indexOf(marker);
  const path = idx >= 0 ? pathname.slice(idx + marker.length) : pathname.replace(/^\/+/, "");

  return decodeURIComponent(path);
}
