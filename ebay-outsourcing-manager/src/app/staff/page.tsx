import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { requireProfile } from "@/lib/auth";
import { fmtTime } from "@/lib/constants";

// 外注スタッフ用トップページ（要件22: 「次にやる作業」がすぐ分かる画面）
export default async function StaffHome() {
  const { supabase, profile } = await requireProfile("staff");

  // RLSにより自分の担当商品しか返ってこない
  const [{ data: products }, { data: unconfirmedLabels }, { data: sharedLabels }, { data: carriers }] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "id, control_number, name, status, carrier_id, handover_method, pickup_status, pickup_available_date, pickup_confirmed_date, pickup_confirmed_from, pickup_confirmed_to"
        ),
      // 共有済みでまだ確認していない発送ラベル（RLSで自分の分だけ返る）
      supabase
        .from("shipping_documents")
        .select("product_id")
        .eq("document_type", "label")
        .is("confirmed_at", null),
      supabase.from("shipping_documents").select("product_id").eq("document_type", "label"),
      supabase.from("carriers").select("id, name"),
    ]);

  const labelWaitingIds = new Set((unconfirmedLabels ?? []).map((d) => d.product_id));
  const labelWaitingProducts = (products ?? []).filter((p) => labelWaitingIds.has(p.id));

  const carrierMap = new Map((carriers ?? []).map((c) => [c.id, c.name]));
  const today = new Date().toISOString().slice(0, 10);

  // 本日の集荷（Phase 7）
  const todayPickups = (products ?? []).filter(
    (p) => p.pickup_confirmed_date === today && p.status !== "shipped"
  );

  // 集荷日時の入力待ち: ラベルが共有済みなのに集荷可能日時が未入力
  const sharedLabelIds = new Set((sharedLabels ?? []).map((d) => d.product_id));
  const pickupInputWaiting = (products ?? []).filter(
    (p) =>
      sharedLabelIds.has(p.id) &&
      p.handover_method === "pickup" &&
      !p.pickup_available_date &&
      p.status !== "shipped"
  );

  const byStatus = (keys: string[]) =>
    (products ?? []).filter((p) => keys.includes(p.status));

  const workGroups = [
    { title: "到着確認待ち", items: byStatus(["sent_to_staff"]), color: "border-l-indigo-500", next: "商品が届いたら「到着報告」をしてください" },
    { title: "検品待ち", items: byStatus(["arrived", "inspecting"]), color: "border-l-yellow-500", next: "商品の確認・検品を進めてください" },
    { title: "梱包待ち", items: byStatus(["inspected", "packing"]), color: "border-l-amber-500", next: "梱包作業を進めてください" },
    { title: "発送待ち", items: byStatus(["packed", "ready_to_ship"]), color: "border-l-orange-500", next: "サイズ測定と発送をしてください" },
  ];

  const totalTodo = workGroups.reduce((s, g) => s + g.items.length, 0);

  return (
    <>
      <AppHeader fullName={profile.full_name || profile.email || ""} role="staff" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-1 text-xl font-bold text-slate-800">
          {profile.full_name || "スタッフ"}さんの作業
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          {totalTodo > 0
            ? `本日の作業が ${totalTodo} 件あります`
            : "現在、担当している作業はありません"}
        </p>

        {/* 本日の集荷（Phase 7・一番目立つ位置） */}
        {todayPickups.length > 0 && (
          <div className="mb-4 rounded-xl border-2 border-green-400 bg-green-50 p-4">
            <p className="mb-2 text-sm font-bold text-green-800">🚚 本日の集荷</p>
            <ul className="space-y-2">
              {todayPickups.map((p) => (
                <li key={p.id}>
                  <Link href={`/staff/products/${p.id}`}
                    className="block rounded-lg bg-white px-3 py-3 shadow-sm transition active:bg-slate-50">
                    <div className="text-lg font-bold text-green-900">
                      {carrierMap.get(p.carrier_id) ?? "配送業者"}{" "}
                      {fmtTime(p.pickup_confirmed_from)}〜{fmtTime(p.pickup_confirmed_to)}
                    </div>
                    <div className="text-sm font-semibold text-slate-700">{p.name}</div>
                    <div className="font-mono text-xs text-slate-400">{p.control_number}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 集荷可能日時の入力待ち */}
        {pickupInputWaiting.length > 0 && (
          <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
            <p className="mb-2 text-sm font-bold text-amber-800">
              🚚 集荷可能日時の入力待ち: {pickupInputWaiting.length} 件
            </p>
            <ul className="space-y-2">
              {pickupInputWaiting.map((p) => (
                <li key={p.id}>
                  <Link href={`/staff/products/${p.id}`}
                    className="flex items-center rounded-lg bg-white px-3 py-3 text-sm shadow-sm transition active:bg-slate-50">
                    <span className="font-mono text-xs text-slate-400">{p.control_number}</span>
                    <span className="ml-2 flex-1 font-semibold text-slate-700">{p.name}</span>
                    <span className="font-bold text-amber-700">日時を入力 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {labelWaitingProducts.length > 0 && (
          <div className="mb-4 rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
            <p className="mb-2 text-sm font-bold text-blue-800">
              📄 ラベル確認待ち: {labelWaitingProducts.length} 件
            </p>
            <ul className="space-y-2">
              {labelWaitingProducts.map((p) => (
                <li key={p.id}>
                  <Link href={`/staff/products/${p.id}`}
                    className="flex items-center rounded-lg bg-white px-3 py-3 text-sm shadow-sm transition active:bg-slate-50">
                    <span className="font-mono text-xs text-slate-400">{p.control_number}</span>
                    <span className="ml-2 flex-1 font-semibold text-slate-700">{p.name}</span>
                    <span className="font-bold text-blue-600">ラベルを確認 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-4">
          {workGroups.map((g) => (
            <div
              key={g.title}
              className={`rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm ${g.color}`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-700">{g.title}</h2>
                <span className="text-xl font-bold text-slate-800">
                  {g.items.length}
                  <span className="ml-1 text-sm font-normal text-slate-400">件</span>
                </span>
              </div>
              {g.items.length > 0 && (
                <>
                  <p className="mt-1 text-xs text-slate-500">{g.next}</p>
                  <ul className="mt-3 space-y-2">
                    {g.items.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/staff/products/${p.id}`}
                          className="flex items-center rounded-lg bg-slate-50 px-3 py-3 text-sm transition active:bg-slate-100"
                        >
                          <span className="font-mono text-xs text-slate-400">
                            {p.control_number}
                          </span>
                          <span className="ml-2 flex-1 font-semibold text-slate-700">
                            {p.name}
                          </span>
                          <span className="font-bold text-blue-600">作業する →</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          商品名をタップすると作業画面が開きます。作業で困ったときは商品ページのコメントで管理者に連絡してください。
        </p>
      </main>
    </>
  );
}
