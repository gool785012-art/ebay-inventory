import { getWorkTasks } from "@/lib/workflow";

// 発送方法に応じた「今回の作業」一覧（スタッフ用、Phase 11）
// 不要な作業（例: 西濃なのに郵便局持ち込み）は表示しない
export default function WorkTaskList({
  carrierName,
  photoRequired,
  operationRequired,
}: {
  carrierName: string;
  photoRequired: boolean;
  operationRequired: boolean;
}) {
  const tasks = getWorkTasks(carrierName, photoRequired, operationRequired);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-base font-bold text-slate-700">📋 今回の作業手順</h2>
        {carrierName && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
            {carrierName}
          </span>
        )}
      </div>
      {!carrierName && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          発送会社が未設定です。管理者が設定すると、その発送方法に合わせた手順が表示されます。
        </p>
      )}
      <ol className="space-y-1">
        {tasks.map((t, i) => (
          <li key={t.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
              {i + 1}
            </span>
            <span className="flex-1 font-semibold text-slate-700">{t.label}</span>
            {t.reward && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                {t.reward}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
