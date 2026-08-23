import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import StatusBadge from "@/components/StatusBadge";
import DeadlineBadge from "@/components/DeadlineBadge";
import StaffWorkPanel from "@/components/StaffWorkPanel";
import PhotoGallery from "@/components/PhotoGallery";
import CommentForm from "@/components/CommentForm";
import { requireProfile } from "@/lib/auth";
import type { Product, Profile } from "@/types/db";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

// 外注スタッフの商品作業ページ（要件8・22）
// RLSにより自分の担当商品以外はデータ自体が返らない（=404になる）
export default async function StaffProductPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const { supabase, profile } = await requireProfile("staff");

  const [
    { data: product },
    { data: photos },
    { data: comments },
    { data: checklistRows },
    { data: carriers },
  ] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).single<Product>(),
    supabase
      .from("product_photos")
      .select("id, photo_category, storage_path, created_at")
      .eq("product_id", id)
      .order("created_at"),
    supabase
      .from("product_comments")
      .select("*")
      .eq("product_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("product_checklists")
      .select("item_key, checked")
      .eq("product_id", id),
    supabase.from("carriers").select("*").order("sort_order"),
  ]);

  if (!product) notFound();

  const { data: category } = product.category_id
    ? await supabase
        .from("categories")
        .select("name, requires_turntable_checklist")
        .eq("id", product.category_id)
        .single()
    : { data: null };

  // コメント投稿者名（自分と管理者のみ表示できればよい）
  const { data: authors } = await supabase.from("profiles").select("*");
  const authorMap = new Map((authors ?? []).map((p: Profile) => [p.id, p]));

  const photoCounts: Record<string, number> = {};
  for (const p of photos ?? []) {
    photoCounts[p.photo_category] = (photoCounts[p.photo_category] ?? 0) + 1;
  }

  return (
    <>
      <AppHeader fullName={profile.full_name || profile.email || ""} role="staff" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-4 text-sm">
          <Link href="/staff" className="text-blue-600 hover:underline">
            ← 作業一覧に戻る
          </Link>
        </div>

        {/* 商品情報 */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-blue-600">
              {product.control_number}
            </span>
            <StatusBadge status={product.status} />
            <DeadlineBadge shipDeadline={product.ship_deadline} status={product.status} />
          </div>
          <h1 className="mt-1 text-lg font-bold text-slate-800">{product.name}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500">
            {category?.name && <span>カテゴリー: {category.name}</span>}
            {product.ship_deadline && <span>発送期限: {product.ship_deadline}</span>}
          </div>
          {product.notes && (
            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              📌 {product.notes}
            </div>
          )}
        </div>

        {/* 作業STEP */}
        <StaffWorkPanel
          product={product}
          carriers={carriers ?? []}
          checklistRows={checklistRows ?? []}
          requiresChecklist={category?.requires_turntable_checklist ?? false}
          photoCounts={photoCounts}
        />

        {/* 写真一覧 */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-700">
            アップロード済みの写真（{(photos ?? []).length}枚）
          </h2>
          <PhotoGallery photos={photos ?? []} />
        </div>

        {/* コメント */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-700">
            コメント（管理者への連絡・質問）
          </h2>
          {(comments ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">まだコメントはありません</p>
          ) : (
            <ul className="space-y-3">
              {(comments ?? []).map((c) => {
                const author = c.author_id ? authorMap.get(c.author_id) : null;
                const isAdmin = author?.role === "admin";
                return (
                  <li
                    key={c.id}
                    className={`rounded-lg px-4 py-3 ${isAdmin ? "bg-blue-50" : "bg-slate-50"}`}
                  >
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-bold text-slate-600">
                        {author?.full_name || author?.email || "管理者"}
                      </span>
                      {isAdmin && (
                        <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                          管理者
                        </span>
                      )}
                      <span>{fmtDateTime(c.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                      {c.body}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <CommentForm productId={product.id} />
        </div>
      </main>
    </>
  );
}
