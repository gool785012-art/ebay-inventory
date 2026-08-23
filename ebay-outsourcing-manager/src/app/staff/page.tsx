import AppHeader from "@/components/AppHeader";
import { requireProfile } from "@/lib/auth";

// 外注スタッフ用トップページ（要件22: 「次にやる作業」がすぐ分かる画面）
export default async function StaffHome() {
  const { supabase, profile } = await requireProfile("staff");

  // RLSにより自分の担当商品しか返ってこない
  const { data: products } = await supabase
    .from("products")
    .select("id, control_number, name, status");

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
                      <li
                        key={p.id}
                        className="rounded-lg bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-xs text-slate-400">
                          {p.control_number}
                        </span>
                        <span className="ml-2 font-semibold text-slate-700">
                          {p.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          作業入力画面（到着報告・検品・梱包・発送）は Phase 3 で追加されます。
        </div>
      </main>
    </>
  );
}
