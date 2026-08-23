"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STATUSES } from "@/lib/constants";
import type { Category, Carrier, Product, Profile } from "@/types/db";

// 商品登録・編集フォーム（管理者用）。
// 管理番号はカテゴリー選択時に自動採番（例: CAM-0001）。手入力での上書きも可能。
export default function ProductForm({
  categories,
  carriers,
  staffList,
  initial,
}: {
  categories: Category[];
  carriers: Carrier[];
  staffList: Profile[];
  initial?: Product;
}) {
  const router = useRouter();
  const isEdit = !!initial;

  const [form, setForm] = useState({
    control_number: initial?.control_number ?? "",
    name: initial?.name ?? "",
    category_id: initial?.category_id?.toString() ?? "",
    assigned_staff_id: initial?.assigned_staff_id ?? "",
    status: initial?.status ?? "pre_shipment",
    arrival_date: initial?.arrival_date ?? "",
    ship_deadline: initial?.ship_deadline ?? "",
    shipped_date: initial?.shipped_date ?? "",
    carrier_id: initial?.carrier_id?.toString() ?? "",
    tracking_number: initial?.tracking_number ?? "",
    weight_kg: initial?.weight_kg?.toString() ?? "",
    length_cm: initial?.length_cm?.toString() ?? "",
    width_cm: initial?.width_cm?.toString() ?? "",
    height_cm: initial?.height_cm?.toString() ?? "",
    serial_number: initial?.serial_number ?? "",
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function set(name: string, value: string) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  // カテゴリー選択時: 管理番号が空なら「接頭辞-連番」を自動提案
  async function handleCategoryChange(categoryId: string) {
    set("category_id", categoryId);
    if (isEdit || form.control_number.trim() !== "") return;
    const cat = categories.find((c) => c.id === Number(categoryId));
    if (!cat?.prefix) return;

    const supabase = createClient();
    const { data } = await supabase
      .from("products")
      .select("control_number")
      .ilike("control_number", `${cat.prefix}-%`);

    let max = 0;
    for (const row of data ?? []) {
      const n = parseInt(row.control_number.split("-").pop() ?? "", 10);
      if (!isNaN(n) && n > max) max = n;
    }
    setForm((f) =>
      f.control_number.trim() === ""
        ? { ...f, control_number: `${cat.prefix}-${String(max + 1).padStart(4, "0")}` }
        : f
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.control_number.trim()) {
      setError("管理番号を入力してください（カテゴリーを選ぶと自動で入ります）");
      return;
    }
    if (!form.name.trim()) {
      setError("商品名を入力してください");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload = {
      control_number: form.control_number.trim(),
      name: form.name.trim(),
      category_id: form.category_id ? Number(form.category_id) : null,
      assigned_staff_id: form.assigned_staff_id || null,
      status: form.status,
      arrival_date: form.arrival_date || null,
      ship_deadline: form.ship_deadline || null,
      shipped_date: form.shipped_date || null,
      carrier_id: form.carrier_id ? Number(form.carrier_id) : null,
      tracking_number: form.tracking_number.trim(),
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      length_cm: form.length_cm ? Number(form.length_cm) : null,
      width_cm: form.width_cm ? Number(form.width_cm) : null,
      height_cm: form.height_cm ? Number(form.height_cm) : null,
      serial_number: form.serial_number.trim(),
      notes: form.notes,
    };

    let result;
    if (isEdit) {
      result = await supabase.from("products").update(payload).eq("id", initial!.id);
    } else {
      result = await supabase
        .from("products")
        .insert({ ...payload, created_by: user?.id ?? null });
    }

    if (result.error) {
      setSaving(false);
      if (result.error.code === "23505") {
        setError(`管理番号「${payload.control_number}」はすでに使われています。別の番号にしてください。`);
      } else {
        setError("保存に失敗しました: " + result.error.message);
      }
      return;
    }

    router.push("/admin/products");
    router.refresh();
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const labelCls = "mb-1 block text-xs font-semibold text-slate-600";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 基本情報 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-blue-600">
          基本情報
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>カテゴリー</label>
            <select
              value={form.category_id}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className={inputCls}
            >
              <option value="">選択してください</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>
              管理番号 *（カテゴリー選択で自動採番）
            </label>
            <input
              value={form.control_number}
              onChange={(e) => set("control_number", e.target.value)}
              placeholder="例: CAM-0001"
              className={`${inputCls} font-mono`}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>商品名 *</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="例: Canon EOS 5D Mark IV ボディ"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>担当スタッフ</label>
            <select
              value={form.assigned_staff_id}
              onChange={(e) => set("assigned_staff_id", e.target.value)}
              className={inputCls}
            >
              <option value="">未割当</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || s.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>ステータス</label>
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              className={inputCls}
            >
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>シリアル番号</label>
            <input
              value={form.serial_number}
              onChange={(e) => set("serial_number", e.target.value)}
              className={`${inputCls} font-mono`}
            />
          </div>
        </div>
      </section>

      {/* 日程 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-blue-600">
          日程
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>商品到着日</label>
            <input type="date" value={form.arrival_date}
              onChange={(e) => set("arrival_date", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>発送期限</label>
            <input type="date" value={form.ship_deadline}
              onChange={(e) => set("ship_deadline", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>発送日</label>
            <input type="date" value={form.shipped_date}
              onChange={(e) => set("shipped_date", e.target.value)} className={inputCls} />
          </div>
        </div>
      </section>

      {/* 発送情報 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-blue-600">
          発送情報
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>発送会社</label>
            <select value={form.carrier_id}
              onChange={(e) => set("carrier_id", e.target.value)} className={inputCls}>
              <option value="">未定</option>
              {carriers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>追跡番号</label>
            <input value={form.tracking_number}
              onChange={(e) => set("tracking_number", e.target.value)}
              className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className={labelCls}>重量（kg）</label>
            <input type="number" step="0.01" min="0" value={form.weight_kg}
              onChange={(e) => set("weight_kg", e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={labelCls}>縦（cm）</label>
              <input type="number" step="0.1" min="0" value={form.length_cm}
                onChange={(e) => set("length_cm", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>横（cm）</label>
              <input type="number" step="0.1" min="0" value={form.width_cm}
                onChange={(e) => set("width_cm", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>高さ（cm）</label>
              <input type="number" step="0.1" min="0" value={form.height_cm}
                onChange={(e) => set("height_cm", e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>
      </section>

      {/* 備考 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-blue-600">
          備考（管理者メモ）
        </h2>
        <textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          className={inputCls}
          placeholder="スタッフへの指示はコメント欄を使ってください（この欄はスタッフも閲覧できます）"
        />
      </section>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-6 py-3 text-base font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : isEdit ? "更新する" : "登録する"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-600 hover:bg-slate-50"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
