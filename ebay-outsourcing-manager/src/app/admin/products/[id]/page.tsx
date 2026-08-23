import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import StatusBadge from "@/components/StatusBadge";
import DeadlineBadge from "@/components/DeadlineBadge";
import Timeline from "@/components/Timeline";
import ProductQuickActions from "@/components/ProductQuickActions";
import CommentForm from "@/components/CommentForm";
import PhotoGallery from "@/components/PhotoGallery";
import PhotoUpload from "@/components/PhotoUpload";
import { requireProfile } from "@/lib/auth";
import { statusLabel } from "@/lib/constants";
import type { Product, Profile } from "@/types/db";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// 作業履歴の1行を日本語にする
function logText(log: {
  action: string; field: string; old_value: string; new_value: string;
}, nameOf: (id: string) => string) {
  if (log.action === "created") return `商品を登録しました（${log.new_value}）`;
  if (log.action === "status_changed")
    return `ステータス「${statusLabel(log.old_value)}」→「${statusLabel(log.new_value)}」`;
  if (log.action === "assigned") {
    const from = log.old_value ? nameOf(log.old_value) : "未割当";
    const to = log.new_value ? nameOf(log.new_value) : "未割当";
    return `担当者「${from}」→「${to}」`;
  }
  const fieldNames: Record<string, string> = {
    tracking_number: "追跡番号",
    shipped_date: "発送日",
    serial_number: "シリアル番号",
  };
  const f = fieldNames[log.field] ?? log.field;
  return `${f}を「${log.old_value || "（空欄）"}」→「${log.new_value || "（空欄）"}」に変更`;
}

// 商品詳細ページ（管理者用、要件10・11・12）
export default async function ProductDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const { supabase, profile } = await requireProfile("admin");

  const [
    { data: product },
    { data: comments },
    { data: logs },
    { data: allProfiles },
    { data: categories },
    { data: carriers },
    { data: photos },
  ] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).single<Product>(),
    supabase
      .from("product_comments")
      .select("*")
      .eq("product_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("work_logs")
      .select("*")
      .eq("product_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("*"),
    supabase.from("categories").select("*"),
    supabase.from("carriers").select("*"),
    supabase
      .from("product_photos")
      .select("id, photo_category, storage_path, created_at")
      .eq("product_id", id)
      .order("created_at"),
  ]);

  if (!product) notFound();

  const profileMap = new Map((allProfiles ?? []).map((p: Profile) => [p.id, p]));
  const nameOf = (uid: string) =>
    profileMap.get(uid)?.full_name || profileMap.get(uid)?.email || "不明";
  const staffList = (allProfiles ?? []).filter((p: Profile) => p.role === "staff");
  const category = (categories ?? []).find((c) => c.id === product.category_id);
  const carrier = (carriers ?? []).find((c) => c.id === product.carrier_id);

  return (
    <>
      <AppHeader fullName={profile.full_name || profile.email || ""} role="admin" />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 text-sm">
          <Link href="/admin/products" className="text-blue-600 hover:underline">
            ← 商品一覧に戻る
          </Link>
        </div>

        {/* 上部: 商品情報 */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-blue-600">
              {product.control_number}
            </span>
            <StatusBadge status={product.status} />
            <DeadlineBadge shipDeadline={product.ship_deadline} status={product.status} />
            {product.has_problem && (
              <span className="rounded-full border border-red-300 bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                ⚠ 問題報告あり
              </span>
            )}
            <div className="flex-1" />
            <Link
              href={`/admin/products/${product.id}/edit`}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
            >
              ✏ 編集
            </Link>
          </div>
          <h1 className="mt-2 text-xl font-bold text-slate-800">{product.name}</h1>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <span className="text-slate-400">カテゴリー: </span>
              <span className="font-semibold text-slate-700">{category?.name ?? "—"}</span>
            </div>
            <div>
              <span className="text-slate-400">担当: </span>
              <span className="font-semibold text-slate-700">
                {product.assigned_staff_id ? nameOf(product.assigned_staff_id) : "未割当"}
              </span>
            </div>
            <div>
              <span className="text-slate-400">シリアル: </span>
              <span className="font-mono text-slate-700">{product.serial_number || "—"}</span>
            </div>
          </div>
          {product.has_problem && product.problem_note && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <b>問題内容:</b> {product.problem_note}
            </div>
          )}
          {product.notes && (
            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <b>備考:</b> {product.notes}
            </div>
          )}
        </div>

        {/* クイック操作 */}
        <div className="mt-4">
          <ProductQuickActions
            productId={product.id}
            currentStatus={product.status}
            currentStaffId={product.assigned_staff_id}
            staffList={staffList}
          />
        </div>

        {/* 中央: 作業進捗タイムライン */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-slate-700">作業進捗</h2>
          <Timeline product={product} />
        </div>

        {/* 発送情報 */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-700">発送情報</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div><span className="text-slate-400">到着日: </span>{product.arrival_date ?? "—"}</div>
            <div><span className="text-slate-400">発送期限: </span>{product.ship_deadline ?? "—"}</div>
            <div><span className="text-slate-400">発送日: </span>{product.shipped_date ?? "—"}</div>
            <div><span className="text-slate-400">発送会社: </span>{carrier?.name ?? "—"}</div>
            <div>
              <span className="text-slate-400">追跡番号: </span>
              <span className="font-mono">{product.tracking_number || "—"}</span>
            </div>
            <div>
              <span className="text-slate-400">重量: </span>
              {product.weight_kg != null ? `${product.weight_kg} kg` : "—"}
            </div>
            <div className="col-span-2 sm:col-span-3">
              <span className="text-slate-400">サイズ（縦×横×高さ）: </span>
              {product.length_cm != null || product.width_cm != null || product.height_cm != null
                ? `${product.length_cm ?? "?"} × ${product.width_cm ?? "?"} × ${product.height_cm ?? "?"} cm`
                : "—"}
            </div>
          </div>
        </div>

        {/* 写真 */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-700">
            写真（{(photos ?? []).length}枚）
          </h2>
          <PhotoGallery photos={photos ?? []} />
          <div className="mt-4">
            <PhotoUpload productId={product.id} />
          </div>
        </div>

        {/* コメント */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-700">
            コメント（{(comments ?? []).length}）
          </h2>
          {(comments ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">まだコメントはありません</p>
          ) : (
            <ul className="space-y-3">
              {(comments ?? []).map((c) => (
                <li key={c.id} className="rounded-lg bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-bold text-slate-600">
                      {c.author_id ? nameOf(c.author_id) : "不明"}
                    </span>
                    {c.author_id && profileMap.get(c.author_id)?.role === "admin" && (
                      <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                        管理者
                      </span>
                    )}
                    <span>{fmtDateTime(c.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
          <CommentForm productId={product.id} />
        </div>

        {/* 作業履歴 */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-700">
            作業履歴（{(logs ?? []).length}）
          </h2>
          {(logs ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">履歴はまだありません</p>
          ) : (
            <ul className="space-y-2">
              {(logs ?? []).map((log) => (
                <li key={log.id} className="flex flex-wrap gap-x-3 border-b border-slate-100 pb-2 text-sm">
                  <span className="whitespace-nowrap text-xs text-slate-400">
                    {fmtDateTime(log.created_at)}
                  </span>
                  <span className="whitespace-nowrap text-xs font-bold text-slate-600">
                    {log.actor_id ? nameOf(log.actor_id) : "システム"}
                  </span>
                  <span className="text-slate-700">{logText(log, nameOf)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}
