"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Item = { id: number; label: string; required: boolean; sort_order: number };
type Result = { item_id: number; checked: boolean; note: string };

// カテゴリー別の動作確認チェックリスト（スタッフ用、Phase 11）
export default function InspectionChecklist({
  productId,
  templateName,
  items,
  results,
}: {
  productId: string;
  templateName: string;
  items: Item[];
  results: Result[];
}) {
  const router = useRouter();
  const [checks, setChecks] = useState<Record<number, boolean>>(
    Object.fromEntries(results.map((r) => [r.item_id, r.checked]))
  );
  const [error, setError] = useState("");

  async function toggle(itemId: number, value: boolean) {
    setChecks((c) => ({ ...c, [itemId]: value }));
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("product_inspections").upsert(
      {
        product_id: productId,
        item_id: itemId,
        checked: value,
        checked_by: user?.id ?? null,
        checked_at: value ? new Date().toISOString() : null,
      },
      { onConflict: "product_id,item_id" }
    );
    if (err) {
      setError("保存に失敗しました: " + err.message);
      setChecks((c) => ({ ...c, [itemId]: !value }));
      return;
    }
    router.refresh();
  }

  if (items.length === 0) return null;

  const requiredItems = items.filter((i) => i.required);
  const requiredDone = requiredItems.filter((i) => checks[i.id]).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-slate-700">🔍 {templateName}</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
          requiredDone === requiredItems.length
            ? "bg-green-100 text-green-700"
            : "bg-amber-100 text-amber-700"
        }`}>
          必須 {requiredDone}/{requiredItems.length}
        </span>
      </div>
      <p className="mb-2 text-xs text-slate-400">
        確認できた項目にチェックを入れてください（★は必須項目）。
      </p>

      {error && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-600">{error}</p>
      )}

      <div className="space-y-1">
        {items.map((item) => (
          <label key={item.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
            <input
              type="checkbox"
              checked={checks[item.id] === true}
              onChange={(e) => toggle(item.id, e.target.checked)}
              className="h-5 w-5"
            />
            <span className="text-sm font-semibold text-slate-700">
              {item.required && <span className="mr-1 text-red-500">★</span>}
              {item.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
