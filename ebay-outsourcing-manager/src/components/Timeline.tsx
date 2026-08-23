import type { Product } from "@/types/db";

// 作業進捗タイムライン（要件10: 商品到着→検品→梱包→サイズ測定→発送）
export default function Timeline({ product }: { product: Product }) {
  const statusOrder = [
    "pre_shipment", "sent_to_staff", "arrived", "inspecting", "inspected",
    "packing", "packed", "ready_to_ship", "shipped",
  ];
  const idx = statusOrder.indexOf(product.status);

  const steps = [
    { label: "商品到着", done: idx >= 2, detail: product.arrival_date ?? "" },
    { label: "検品", done: idx >= 4, detail: "" },
    { label: "梱包", done: idx >= 6, detail: "" },
    { label: "サイズ測定", done: product.weight_kg != null, detail: product.weight_kg != null ? `${product.weight_kg}kg` : "" },
    { label: "発送", done: product.status === "shipped", detail: product.shipped_date ?? "" },
  ];

  // 進行中のステップ = 最初の未完了ステップ
  const currentIdx = steps.findIndex((s) => !s.done);

  return (
    <ol className="flex flex-wrap items-center gap-1 sm:gap-0">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center">
          <div className="flex flex-col items-center px-2 text-center">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                s.done
                  ? "bg-green-500 text-white"
                  : i === currentIdx
                    ? "border-2 border-blue-500 bg-blue-50 text-blue-600"
                    : "border-2 border-slate-200 bg-white text-slate-300"
              }`}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <span
              className={`mt-1 text-xs font-semibold ${
                s.done ? "text-green-600" : i === currentIdx ? "text-blue-600" : "text-slate-400"
              }`}
            >
              {s.label}
            </span>
            {s.detail && <span className="text-[10px] text-slate-400">{s.detail}</span>}
          </div>
          {i < steps.length - 1 && (
            <span className={`hidden h-0.5 w-6 sm:block ${s.done ? "bg-green-400" : "bg-slate-200"}`} />
          )}
        </li>
      ))}
    </ol>
  );
}
