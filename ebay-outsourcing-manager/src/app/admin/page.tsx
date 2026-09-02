import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { requireProfile } from "@/lib/auth";
import { fmtYen } from "@/lib/constants";
import { parseMonth, monthRange, monthLabel } from "@/lib/month";
import { WORK_STATUSES, workStatusLabel } from "@/lib/workflow";

// 管理者ダッシュボード（Phase 11で外注管理向けに刷新）
export default async function AdminDashboard() {
  const { supabase, profile } = await requireProfile("admin");

  const month = parseMonth(undefined);
  const { start, end } = monthRange(month);
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: products },
    { data: rewards },
    { data: expenses },
    { data: carriers },
    { data: photos },
    { data: receipts },
  ] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, control_number, name, status, work_status, needs_review_reason, has_problem, operation_check_result, photo_required, operation_check_required, carrier_id, ship_deadline, shipped_date"
      ),
    supabase
      .from("work_rewards")
      .select("packing_reward, photo_reward, operation_check_reward, handover_reward")
      .gte("completed_at", start)
      .lt("completed_at", end),
    supabase
      .from("product_expenses")
      .select("id, product_id, amount, status, created_at, products(control_number, name)")
      .gte("created_at", start)
      .lt("created_at", end),
    supabase.from("carriers").select("id, name").order("sort_order"),
    supabase.from("product_photos").select("product_id").eq("photo_category", "condition"),
    supabase.from("expense_receipts").select("expense_id"),
  ]);

  const items = products ?? [];
  const carrierMap = new Map((carriers ?? []).map((c) => [c.id, c.name]));
  const photoProductIds = new Set((photos ?? []).map((p) => p.product_id));
  const receiptExpenseIds = new Set((receipts ?? []).map((r) => r.expense_id));

  // 作業状況（作業ステータス別の件数）
  const workCounts: Record<string, number> = {};
  for (const s of WORK_STATUSES) workCounts[s.key] = 0;
  for (const p of items) workCounts[p.work_status] = (workCounts[p.work_status] ?? 0) + 1;

  // 立替金
  type ExpRow = {
    id: string; product_id: string; amount: number; status: string; created_at: string;
    products: { control_number: string; name: string } | null;
  };
  const expRows = (expenses ?? []) as unknown as ExpRow[];
  const pendingExpenses = expRows.filter((e) => e.status === "pending");
  const pendingExpenseTotal = pendingExpenses.reduce((s, e) => s + e.amount, 0);
  const approvedExpenseTotal = expRows
    .filter((e) => e.status === "approved")
    .reduce((s, e) => s + e.amount, 0);

  // 外注報酬（今月）
  const rewardTotal = (rewards ?? []).reduce(
    (s, r) => s + r.packing_reward + r.photo_reward + r.operation_check_reward + r.handover_reward,
    0
  );

  // 発送会社別の件数（今月発送分）
  const shippedThisMonth = items.filter(
    (p) => p.shipped_date && p.shipped_date >= start && p.shipped_date < end
  );
  const carrierCounts = (carriers ?? [])
    .map((c) => ({
      name: c.name,
      count: shippedThisMonth.filter((p) => p.carrier_id === c.id).length,
    }))
    .filter((c) => c.count > 0);

  // 要確認案件（理由つき）
  const reviewItems = [
    ...items
      .filter((p) => p.work_status === "needs_review")
      .map((p) => ({
        id: p.id,
        control: p.control_number,
        name: p.name,
        reason: p.needs_review_reason || "確認が必要です",
        href: `/admin/products/${p.id}`,
      })),
    ...items
      .filter(
        (p) =>
          p.photo_required &&
          !photoProductIds.has(p.id) &&
          p.status !== "shipped" &&
          p.work_status !== "needs_review"
      )
      .map((p) => ({
        id: p.id,
        control: p.control_number,
        name: p.name,
        reason: "商品状態の写真が未アップロード",
        href: `/admin/products/${p.id}`,
      })),
    ...pendingExpenses
      .filter((e) => !receiptExpenseIds.has(e.id))
      .map((e) => ({
        id: e.id,
        control: e.products?.control_number ?? "",
        name: e.products?.name ?? "",
        reason: `立替金 ${fmtYen(e.amount)} の領収書が未アップロード`,
        href: `/admin/products/${e.product_id}`,
      })),
  ];

  // 今日の状況
  const todayShipping = items.filter(
    (p) => p.ship_deadline === today && p.status !== "shipped"
  ).length;
  const inProgress = workCounts["in_progress"] ?? 0;
  const incomplete = items.filter(
    (p) => p.status !== "shipped" && p.work_status !== "not_started"
  ).length;

  const workCards = WORK_STATUSES.map((s) => ({
    key: s.key,
    label: s.label,
    value: workCounts[s.key] ?? 0,
    color:
      s.key === "needs_review"
        ? "border-t-red-500"
        : s.key === "shipped"
          ? "border-t-green-500"
          : s.key === "ready_to_ship"
            ? "border-t-orange-500"
            : s.key === "in_progress"
              ? "border-t-blue-500"
              : "border-t-slate-400",
  }));

  return (
    <>
      <AppHeader fullName={profile.full_name || profile.email || ""} role="admin" />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="mb-1 text-xl font-bold text-slate-800">外注管理ダッシュボード</h1>
        <p className="mb-6 text-sm text-slate-500">{monthLabel(month)}の状況</p>

        {/* 要確認案件 */}
        {reviewItems.length > 0 && (
          <div className="mb-6 rounded-xl border-2 border-red-300 bg-red-50 p-4">
            <h2 className="mb-2 text-sm font-bold text-red-800">
              ⚠ 要確認 {reviewItems.length} 件
            </h2>
            <ul className="space-y-2">
              {reviewItems.slice(0, 8).map((r, i) => (
                <li key={`${r.id}-${i}`}>
                  <Link href={r.href}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm shadow-sm transition hover:bg-slate-50">
                    <span className="font-mono text-xs font-bold text-blue-600">{r.control}</span>
                    <span className="font-semibold text-slate-700">{r.name}</span>
                    <span className="flex-1" />
                    <span className="font-semibold text-red-700">{r.reason}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {reviewItems.length > 8 && (
              <p className="mt-2 text-xs text-red-700">ほか {reviewItems.length - 8} 件</p>
            )}
          </div>
        )}

        {/* 作業状況 */}
        <h2 className="mb-2 text-base font-bold text-slate-700">作業状況</h2>
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {workCards.map((c) => (
            <Link key={c.key} href={`/admin/products?work=${c.key}`}
              className={`rounded-xl border border-slate-200 border-t-4 bg-white p-4 shadow-sm transition hover:shadow-md ${c.color}`}>
              <div className="text-xs font-semibold text-slate-500">{c.label}</div>
              <div className="mt-1 text-2xl font-bold text-slate-800">
                {c.value}
                <span className="ml-1 text-sm font-normal text-slate-400">件</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mb-6 grid gap-6 lg:grid-cols-3">
          {/* 立替金 */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-bold text-slate-700">立替金</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">未承認</span>
                <span className="font-bold text-amber-700">{pendingExpenses.length} 件</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">未承認金額</span>
                <span className="font-bold text-amber-700">{fmtYen(pendingExpenseTotal)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="text-slate-600">承認済み</span>
                <span className="font-bold text-slate-800">{fmtYen(approvedExpenseTotal)}</span>
              </div>
            </div>
          </div>

          {/* 外注報酬 */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-700">外注報酬</h2>
              <Link href="/admin/payments" className="text-xs font-semibold text-blue-600 hover:underline">
                詳細 →
              </Link>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">今月作業報酬</span>
                <span className="font-bold text-slate-800">{fmtYen(rewardTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">今月立替金</span>
                <span className="font-bold text-slate-800">{fmtYen(approvedExpenseTotal)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="font-bold text-slate-700">今月支払予定</span>
                <span className="text-lg font-bold text-blue-600">
                  {fmtYen(rewardTotal + approvedExpenseTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* 発送 */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-base font-bold text-slate-700">発送（今月）</h2>
            {carrierCounts.length === 0 ? (
              <p className="text-sm text-slate-400">今月の発送はまだありません</p>
            ) : (
              <div className="space-y-2 text-sm">
                {carrierCounts.map((c) => (
                  <div key={c.name} className="flex justify-between">
                    <span className="text-slate-600">{c.name}</span>
                    <span className="font-bold text-slate-800">{c.count} 件</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 今日の作業 */}
        <h2 className="mb-2 text-base font-bold text-slate-700">今日の作業</h2>
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-500">今日発送予定</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">
              {todayShipping}<span className="ml-1 text-sm font-normal text-slate-400">件</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-500">作業中</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">
              {inProgress}<span className="ml-1 text-sm font-normal text-slate-400">件</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-500">未完了</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">
              {incomplete}<span className="ml-1 text-sm font-normal text-slate-400">件</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          {WORK_STATUSES.map((s) => (
            <Link key={s.key} href={`/admin/products?work=${s.key}`}
              className={`rounded-full border px-3 py-1 font-semibold transition hover:opacity-70 ${s.badge}`}>
              {workStatusLabel(s.key)}: {workCounts[s.key] ?? 0}件
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
