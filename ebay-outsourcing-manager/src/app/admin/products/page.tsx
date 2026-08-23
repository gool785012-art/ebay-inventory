import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import StatusBadge from "@/components/StatusBadge";
import DeadlineBadge from "@/components/DeadlineBadge";
import { requireProfile } from "@/lib/auth";
import { STATUSES } from "@/lib/constants";
import type { Category, Profile } from "@/types/db";

// 商品一覧（管理者用）: 検索・絞り込み・期限警告（要件16, 17, 19）
export default async function ProductListPage(props: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const sp = await props.searchParams;
  const { supabase, profile } = await requireProfile("admin");

  const q = sp.q?.trim() ?? "";
  const fStatus = sp.status ?? "";
  const fStaff = sp.staff ?? "";
  const fCategory = sp.category ?? "";
  const fShippedFrom = sp.shipped_from ?? "";
  const fShippedTo = sp.shipped_to ?? "";
  const fDeadlineTo = sp.deadline_to ?? "";

  let query = supabase
    .from("products")
    .select(
      "id, control_number, name, status, arrival_date, ship_deadline, shipped_date, tracking_number, has_problem, category_id, assigned_staff_id"
    )
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(
      `control_number.ilike.%${q}%,name.ilike.%${q}%,tracking_number.ilike.%${q}%`
    );
  }
  if (fStatus) query = query.eq("status", fStatus);
  if (fStaff) query = query.eq("assigned_staff_id", fStaff);
  if (fCategory) query = query.eq("category_id", Number(fCategory));
  if (fShippedFrom) query = query.gte("shipped_date", fShippedFrom);
  if (fShippedTo) query = query.lte("shipped_date", fShippedTo);
  if (fDeadlineTo) query = query.lte("ship_deadline", fDeadlineTo);

  const [{ data: products }, { data: categories }, { data: staffList }] =
    await Promise.all([
      query,
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("profiles").select("*").eq("role", "staff").order("full_name"),
    ]);

  const catMap = new Map((categories ?? []).map((c: Category) => [c.id, c.name]));
  const staffMap = new Map(
    (staffList ?? []).map((s: Profile) => [s.id, s.full_name || s.email || ""])
  );

  return (
    <>
      <AppHeader fullName={profile.full_name || profile.email || ""} role="admin" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">商品管理</h1>
          <div className="flex-1" />
          <Link
            href="/admin/products/new"
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            ＋ 商品を登録
          </Link>
        </div>

        {/* 検索・絞り込み（GETフォーム: URLに条件が残るのでブックマーク可能） */}
        <form
          method="get"
          className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                キーワード（管理番号 / 商品名 / 追跡番号）
              </label>
              <input
                name="q"
                defaultValue={q}
                placeholder="例: CAM-0001"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                ステータス
              </label>
              <select
                name="status"
                defaultValue={fStatus}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">すべて</option>
                {STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                担当スタッフ
              </label>
              <select
                name="staff"
                defaultValue={fStaff}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">すべて</option>
                {(staffList ?? []).map((s: Profile) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name || s.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                カテゴリー
              </label>
              <select
                name="category"
                defaultValue={fCategory}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">すべて</option>
                {(categories ?? []).map((c: Category) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                発送日（から / まで）
              </label>
              <div className="flex gap-1">
                <input type="date" name="shipped_from" defaultValue={fShippedFrom}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
                <input type="date" name="shipped_to" defaultValue={fShippedTo}
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">
                発送期限（まで）
              </label>
              <input type="date" name="deadline_to" defaultValue={fDeadlineTo}
                className="rounded-lg border border-slate-300 px-2 py-2 text-sm" />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
            >
              検索
            </button>
            <Link
              href="/admin/products"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              リセット
            </Link>
          </div>
        </form>

        <p className="mb-2 text-sm text-slate-500">{(products ?? []).length} 件</p>

        {/* 一覧（PCはテーブル / スマホはカード） */}
        {(products ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-400">
            商品がありません。「＋ 商品を登録」から追加してください。
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                    <th className="px-3 py-2.5">管理番号</th>
                    <th className="px-3 py-2.5">商品名</th>
                    <th className="px-3 py-2.5">カテゴリー</th>
                    <th className="px-3 py-2.5">担当</th>
                    <th className="px-3 py-2.5">ステータス</th>
                    <th className="px-3 py-2.5">発送期限</th>
                    <th className="px-3 py-2.5">追跡番号</th>
                  </tr>
                </thead>
                <tbody>
                  {(products ?? []).map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-blue-50/40">
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/admin/products/${p.id}`}
                          className="font-mono font-bold text-blue-600 hover:underline"
                        >
                          {p.control_number}
                        </Link>
                        {p.has_problem && (
                          <span className="ml-1 text-xs font-bold text-red-600">⚠</span>
                        )}
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-2.5 font-semibold text-slate-700">
                        <Link href={`/admin/products/${p.id}`} className="hover:underline">
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">
                        {catMap.get(p.category_id) ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">
                        {staffMap.get(p.assigned_staff_id) || "未割当"}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-slate-500">{p.ship_deadline ?? "—"}</span>{" "}
                        <DeadlineBadge shipDeadline={p.ship_deadline} status={p.status} />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500">
                        {p.tracking_number || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {(products ?? []).map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/products/${p.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-600">
                      {p.control_number}
                    </span>
                    {p.has_problem && (
                      <span className="text-xs font-bold text-red-600">⚠ 問題あり</span>
                    )}
                    <div className="flex-1" />
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mt-1 font-semibold text-slate-800">{p.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{catMap.get(p.category_id) ?? "—"}</span>
                    <span>担当: {staffMap.get(p.assigned_staff_id) || "未割当"}</span>
                    {p.ship_deadline && <span>期限: {p.ship_deadline}</span>}
                    <DeadlineBadge shipDeadline={p.ship_deadline} status={p.status} />
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
