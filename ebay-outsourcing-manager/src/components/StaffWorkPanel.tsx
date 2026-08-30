"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendNotification } from "@/lib/notify-client";
import { TURNTABLE_CHECKLIST, SHIP_CHECKLIST } from "@/lib/constants";
import PhotoUpload from "@/components/PhotoUpload";
import type { Carrier, Product } from "@/types/db";

type ChecklistRow = { item_key: string; checked: boolean };

// STEPの枠（開閉式）。親の外で定義することで、入力中に再マウントされてフォーカスが外れるのを防ぐ
function Step({
  index,
  title,
  done,
  isCurrent,
  isOpen,
  onToggle,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  isCurrent: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border bg-white shadow-sm ${
        isCurrent ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            done
              ? "bg-green-500 text-white"
              : isCurrent
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-400"
          }`}
        >
          {done ? "✓" : index + 1}
        </span>
        <span className="flex-1">
          <span className={`block text-base font-bold ${done ? "text-green-700" : "text-slate-800"}`}>
            {title}
          </span>
          {isCurrent && !done && (
            <span className="text-xs font-semibold text-blue-600">← 次はこの作業です</span>
          )}
        </span>
        <span className="text-slate-300">{isOpen ? "▲" : "▼"}</span>
      </button>
      {isOpen && <div className="border-t border-slate-100 px-4 py-4">{children}</div>}
    </div>
  );
}

// 外注スタッフの作業画面（要件8: STEP1〜7）
// 「次にやる作業」が自動で開き、上から順に進めるだけで完了する設計
export default function StaffWorkPanel({
  product,
  carriers,
  checklistRows,
  requiresChecklist,
  photoCounts,
}: {
  product: Product;
  carriers: Carrier[];
  checklistRows: ChecklistRow[];
  requiresChecklist: boolean;
  photoCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // 入力欄の状態
  const today = new Date().toISOString().slice(0, 10);
  const [arrivalDate, setArrivalDate] = useState(product.arrival_date ?? today);
  const [serial, setSerial] = useState(product.serial_number);
  const [exterior, setExterior] = useState(product.exterior_condition);
  const [worksOk, setWorksOk] = useState<string>(
    product.works_ok === null ? "" : product.works_ok ? "yes" : "no"
  );
  const [weight, setWeight] = useState(product.weight_kg?.toString() ?? "");
  const [lengthCm, setLengthCm] = useState(product.length_cm?.toString() ?? "");
  const [widthCm, setWidthCm] = useState(product.width_cm?.toString() ?? "");
  const [heightCm, setHeightCm] = useState(product.height_cm?.toString() ?? "");
  const [carrierId, setCarrierId] = useState(product.carrier_id?.toString() ?? "");
  const [tracking, setTracking] = useState(product.tracking_number);
  const [shippedDate, setShippedDate] = useState(product.shipped_date ?? today);
  const [problemOpen, setProblemOpen] = useState(false);
  const [problemNote, setProblemNote] = useState(product.problem_note);
  const [checks, setChecks] = useState<Record<string, boolean>>(
    Object.fromEntries(checklistRows.map((r) => [r.item_key, r.checked]))
  );

  async function updateProduct(
    payload: Record<string, unknown>,
    doneMsg?: string,
    notifyEvent?: { event: string; extra?: string }
  ) {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase
      .from("products")
      .update(payload)
      .eq("id", product.id);
    setSaving(false);
    if (err) {
      setError("保存に失敗しました: " + err.message);
      return false;
    }
    if (notifyEvent) {
      await sendNotification(notifyEvent.event, product.id, notifyEvent.extra);
    }
    if (doneMsg) alert(doneMsg);
    router.refresh();
    return true;
  }

  async function toggleCheck(itemKey: string, value: boolean) {
    setChecks((c) => ({ ...c, [itemKey]: value }));
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("product_checklists").upsert(
      {
        product_id: product.id,
        item_key: itemKey,
        checked: value,
        checked_by: user?.id ?? null,
        checked_at: value ? new Date().toISOString() : null,
      },
      { onConflict: "product_id,item_key" }
    );
    if (err) {
      setError("チェックの保存に失敗しました: " + err.message);
      setChecks((c) => ({ ...c, [itemKey]: !value }));
    }
  }

  // 各STEPの完了判定
  const statusOrder = [
    "pre_shipment", "sent_to_staff", "arrived", "inspecting", "inspected",
    "packing", "packed", "ready_to_ship", "shipped",
  ];
  const sIdx = statusOrder.indexOf(product.status);
  const stepDone = [
    sIdx >= 2,                                        // STEP1 到着
    sIdx >= 2 && !!product.serial_number,             // STEP2 商品確認
    sIdx >= 4,                                        // STEP3 検品
    (photoCounts["before_packing"] ?? 0) > 0,         // STEP4 梱包前確認
    sIdx >= 6,                                        // STEP5 梱包
    sIdx >= 7 && product.weight_kg != null,           // STEP6 サイズ測定
    product.status === "shipped",                     // STEP7 発送
  ];
  const currentStep = stepDone.findIndex((d) => !d);
  const [openStep, setOpenStep] = useState(currentStep === -1 ? 6 : currentStep);

  const allChecked =
    !requiresChecklist ||
    TURNTABLE_CHECKLIST.every((item) => checks[item.key] === true);

  // 発送前チェック（要件9: 全部チェックするまで発送完了できない）
  const allShipChecked = SHIP_CHECKLIST.every((item) => checks[item.key] === true);

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500";
  const btnCls =
    "w-full rounded-lg bg-blue-600 py-3.5 text-base font-bold text-white transition hover:bg-blue-700 disabled:opacity-40";

  const stepProps = (index: number) => ({
    index,
    done: stepDone[index],
    isCurrent: index === currentStep,
    isOpen: openStep === index,
    onToggle: () => setOpenStep(openStep === index ? -1 : index),
  });

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {error}
        </p>
      )}

      {/* STEP1 商品到着 */}
      <Step {...stepProps(0)} title="STEP1 商品到着">
        <label className="mb-1 block text-sm font-semibold text-slate-600">到着日</label>
        <input type="date" value={arrivalDate}
          onChange={(e) => setArrivalDate(e.target.value)} className={inputCls} />
        <div className="mt-3">
          <p className="mb-1 text-sm font-semibold text-slate-600">
            外箱の写真（{photoCounts["outer_box"] ?? 0}枚）
          </p>
          <PhotoUpload productId={product.id} category="outer_box" />
        </div>
        <button
          disabled={saving || !arrivalDate}
          onClick={() =>
            updateProduct(
              { arrival_date: arrivalDate, status: "arrived" },
              "到着を報告しました"
            )
          }
          className={`mt-4 ${btnCls}`}
        >
          到着を報告する
        </button>
      </Step>

      {/* STEP2 商品確認 */}
      <Step {...stepProps(1)} title="STEP2 商品確認">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-600">
              商品本体の写真（{photoCounts["item"] ?? 0}枚）
            </p>
            <PhotoUpload productId={product.id} category="item" />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-600">
              付属品の写真（{photoCounts["accessory"] ?? 0}枚）
            </p>
            <PhotoUpload productId={product.id} category="accessory" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              シリアル番号
            </label>
            <input value={serial} onChange={(e) => setSerial(e.target.value)}
              placeholder="本体に記載の番号" className={`${inputCls} font-mono`} />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-600">
              シリアル番号の写真（{photoCounts["serial"] ?? 0}枚）
            </p>
            <PhotoUpload productId={product.id} category="serial" />
          </div>
          <button
            disabled={saving}
            onClick={() => updateProduct({ serial_number: serial.trim() }, "商品確認を保存しました")}
            className={btnCls}
          >
            商品確認を保存する
          </button>
        </div>
      </Step>

      {/* STEP3 検品 */}
      <Step {...stepProps(2)} title="STEP3 検品">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              外観状態
            </label>
            <textarea value={exterior} onChange={(e) => setExterior(e.target.value)}
              rows={2} placeholder="例: 目立つ傷なし。底面に小さなスレあり。"
              className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              動作確認
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setWorksOk("yes")}
                className={`flex-1 rounded-lg border py-3 text-base font-bold ${
                  worksOk === "yes"
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-slate-300 bg-white text-slate-500"
                }`}>
                ○ 正常に動作する
              </button>
              <button type="button" onClick={() => setWorksOk("no")}
                className={`flex-1 rounded-lg border py-3 text-base font-bold ${
                  worksOk === "no"
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-slate-300 bg-white text-slate-500"
                }`}>
                × 問題がある
              </button>
            </div>
          </div>
          <button
            disabled={saving || worksOk === ""}
            onClick={() =>
              updateProduct(
                {
                  exterior_condition: exterior.trim(),
                  works_ok: worksOk === "yes",
                  status: "inspected",
                },
                "検品結果を保存しました"
              )
            }
            className={btnCls}
          >
            検品完了として保存する
          </button>
          <p className="text-xs text-slate-400">
            ※ 問題を見つけた場合は、下の「⚠ 問題を報告する」も押してください
          </p>
        </div>
      </Step>

      {/* STEP4 梱包前確認 */}
      <Step {...stepProps(3)} title="STEP4 梱包前確認">
        <p className="mb-1 text-sm font-semibold text-slate-600">
          梱包前の写真（{photoCounts["before_packing"] ?? 0}枚）
        </p>
        <PhotoUpload productId={product.id} category="before_packing" />
        <p className="mt-2 text-xs text-slate-400">
          写真をアップロードするとこのSTEPは完了になります
        </p>
      </Step>

      {/* STEP5 梱包 */}
      <Step {...stepProps(4)} title="STEP5 梱包">
        <div className="space-y-3">
          {requiresChecklist && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-sm font-bold text-amber-800">
                ⚠ ターンテーブル梱包チェックリスト（全項目必須）
              </p>
              <div className="space-y-1">
                {TURNTABLE_CHECKLIST.map((item) => (
                  <label
                    key={item.key}
                    className="flex cursor-pointer items-center gap-3 rounded-lg bg-white px-3 py-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={checks[item.key] === true}
                      onChange={(e) => toggleCheck(item.key, e.target.checked)}
                      className="h-5 w-5"
                    />
                    <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                  </label>
                ))}
              </div>
              {!allChecked && (
                <p className="mt-2 text-xs font-bold text-amber-700">
                  すべてチェックすると「梱包完了」を押せます
                </p>
              )}
            </div>
          )}
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-600">
              梱包途中の写真（{photoCounts["packing"] ?? 0}枚）
            </p>
            <PhotoUpload productId={product.id} category="packing" />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-600">
              梱包完了の写真（{photoCounts["packed"] ?? 0}枚）
            </p>
            <PhotoUpload productId={product.id} category="packed" />
          </div>
          <button
            disabled={saving || !allChecked}
            onClick={() => updateProduct({ status: "packed" }, "梱包完了を報告しました")}
            className={btnCls}
          >
            梱包完了を報告する
          </button>
        </div>
      </Step>

      {/* STEP6 サイズ測定 */}
      <Step {...stepProps(5)} title="STEP6 サイズ測定">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">重量（kg）</label>
            <input type="number" step="0.01" min="0" inputMode="decimal"
              value={weight} onChange={(e) => setWeight(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">縦（cm）</label>
            <input type="number" step="0.1" min="0" inputMode="decimal"
              value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">横（cm）</label>
            <input type="number" step="0.1" min="0" inputMode="decimal"
              value={widthCm} onChange={(e) => setWidthCm(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">高さ（cm）</label>
            <input type="number" step="0.1" min="0" inputMode="decimal"
              value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className={inputCls} />
          </div>
        </div>
        <button
          disabled={saving || !weight || !lengthCm || !widthCm || !heightCm}
          onClick={() =>
            updateProduct(
              {
                weight_kg: Number(weight),
                length_cm: Number(lengthCm),
                width_cm: Number(widthCm),
                height_cm: Number(heightCm),
                status: "ready_to_ship",
              },
              "サイズを保存しました"
            )
          }
          className={`mt-4 ${btnCls}`}
        >
          サイズを保存する
        </button>
      </Step>

      {/* STEP7 発送 */}
      <Step {...stepProps(6)} title="STEP7 発送">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">発送会社</label>
            <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)}
              className={inputCls}>
              <option value="">選択してください</option>
              {carriers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">追跡番号</label>
            <input value={tracking} onChange={(e) => setTracking(e.target.value)}
              placeholder="送り状の番号" className={`${inputCls} font-mono`} />
            {product.tracking_number && (
              <p className="mt-1 text-xs text-amber-600">
                ※ 追跡番号は登録済みです（{product.tracking_number}）。発送ラベルの番号と一致しているか確認してください。
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">発送日</label>
            <input type="date" value={shippedDate}
              onChange={(e) => setShippedDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-600">
              発送ラベル貼付後の写真（{photoCounts["label_attached"] ?? 0}枚）
            </p>
            <PhotoUpload productId={product.id} category="label_attached" />
          </div>

          {/* 発送前チェック（要件9: 全項目チェックで発送完了ボタンが有効に） */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="mb-2 text-sm font-bold text-blue-800">
              ✅ 発送前チェック（全項目必須）
            </p>
            <div className="space-y-1">
              {SHIP_CHECKLIST.map((item) => (
                <label
                  key={item.key}
                  className="flex cursor-pointer items-center gap-3 rounded-lg bg-white px-3 py-2.5"
                >
                  <input
                    type="checkbox"
                    checked={checks[item.key] === true}
                    onChange={(e) => toggleCheck(item.key, e.target.checked)}
                    className="h-5 w-5"
                  />
                  <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                </label>
              ))}
            </div>
            {!allShipChecked && (
              <p className="mt-2 text-xs font-bold text-blue-700">
                すべてチェックすると「発送完了」を押せます
              </p>
            )}
          </div>

          <button
            disabled={saving || !carrierId || !tracking.trim() || !shippedDate || !allShipChecked}
            onClick={() => {
              // 追跡番号の上書き事故防止（要件15）
              if (
                product.tracking_number &&
                tracking.trim() !== product.tracking_number &&
                !window.confirm(
                  `追跡番号がすでに「${product.tracking_number}」で登録されています。\n「${tracking.trim()}」に上書きしますか？`
                )
              ) {
                return;
              }
              if (!window.confirm("発送済みにします。よろしいですか？")) return;
              updateProduct(
                {
                  carrier_id: Number(carrierId),
                  tracking_number: tracking.trim(),
                  shipped_date: shippedDate,
                  status: "shipped",
                },
                "お疲れさまでした！発送完了を報告しました",
                { event: "shipped" }
              );
            }}
            className="w-full rounded-lg bg-green-600 py-4 text-base font-bold text-white transition hover:bg-green-700 disabled:opacity-40"
          >
            ✓ 発送完了（この商品の作業を終わる）
          </button>
        </div>
      </Step>

      {/* 問題報告（要件25） */}
      <div className="rounded-xl border border-red-200 bg-white p-4 shadow-sm">
        {!problemOpen ? (
          <button
            type="button"
            onClick={() => setProblemOpen(true)}
            className="w-full rounded-lg border-2 border-red-300 bg-red-50 py-3 text-base font-bold text-red-600 transition hover:bg-red-100"
          >
            ⚠ 問題を報告する
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-bold text-red-700">問題の内容を教えてください</p>
            <textarea
              value={problemNote}
              onChange={(e) => setProblemNote(e.target.value)}
              rows={3}
              placeholder="例: レンズ内にカビがあります / 外箱が破損して届きました"
              className={inputCls}
            />
            <div>
              <p className="mb-1 text-sm font-semibold text-slate-600">問題箇所の写真</p>
              <PhotoUpload productId={product.id} category="other" />
            </div>
            <div className="flex gap-2">
              <button
                disabled={saving || !problemNote.trim()}
                onClick={() =>
                  updateProduct(
                    {
                      has_problem: true,
                      problem_note: problemNote.trim(),
                      status: "problem",
                    },
                    "問題を報告しました。管理者に通知されます。",
                    { event: "problem_reported", extra: problemNote.trim() }
                  ).then((ok) => ok && setProblemOpen(false))
                }
                className="flex-1 rounded-lg bg-red-600 py-3 text-base font-bold text-white hover:bg-red-700 disabled:opacity-40"
              >
                報告する
              </button>
              <button
                type="button"
                onClick={() => setProblemOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-500"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
