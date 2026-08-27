// ステータス定義（DBには英語キーで保存し、画面では日本語で表示する）
export const STATUSES = [
  { key: "pre_shipment",  label: "未発送（仕入先）",   badge: "bg-gray-100 text-gray-600 border-gray-300" },
  { key: "sent_to_staff", label: "外注先へ発送済み",   badge: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { key: "arrived",       label: "商品到着",           badge: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "inspecting",    label: "検品中",             badge: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  { key: "inspected",     label: "検品完了",           badge: "bg-lime-50 text-lime-700 border-lime-200" },
  { key: "packing",       label: "梱包中",             badge: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "packed",        label: "梱包完了",           badge: "bg-teal-50 text-teal-700 border-teal-200" },
  { key: "ready_to_ship", label: "発送待ち",           badge: "bg-orange-50 text-orange-700 border-orange-200" },
  { key: "shipped",       label: "発送済み",           badge: "bg-green-50 text-green-700 border-green-200" },
  { key: "problem",       label: "問題あり",           badge: "bg-red-50 text-red-700 border-red-200" },
  { key: "on_hold",       label: "保留",               badge: "bg-gray-100 text-gray-500 border-gray-300" },
] as const;

export type StatusKey = (typeof STATUSES)[number]["key"];

export function statusLabel(key: string): string {
  return STATUSES.find((s) => s.key === key)?.label ?? key;
}

export function statusBadgeClass(key: string): string {
  return STATUSES.find((s) => s.key === key)?.badge ?? "bg-gray-100 text-gray-600 border-gray-300";
}

// 写真カテゴリー定義
export const PHOTO_CATEGORIES = [
  { key: "outer_box",      label: "外箱" },
  { key: "item",           label: "商品本体" },
  { key: "accessory",      label: "付属品" },
  { key: "serial",         label: "シリアル番号" },
  { key: "before_packing", label: "梱包前" },
  { key: "packing",        label: "梱包途中" },
  { key: "packed",         label: "梱包完了" },
  { key: "label",          label: "発送ラベル" },
  { key: "label_attached", label: "発送ラベル貼付後" },
  { key: "other",          label: "その他" },
] as const;

// ターンテーブル梱包チェックリスト（要件24）
export const TURNTABLE_CHECKLIST = [
  { key: "platter_removed",      label: "プラッターを取り外した" },
  { key: "platter_secured",      label: "プラッターを個別固定した" },
  { key: "counterweight_removed",label: "カウンターウェイトを取り外した" },
  { key: "headshell_removed",    label: "ヘッドシェルを取り外した" },
  { key: "tonearm_secured",      label: "トーンアームを固定した" },
  { key: "dustcover_protected",  label: "ダストカバーを保護した" },
  { key: "no_movement_in_box",   label: "本体が箱内で動かない" },
  { key: "bottom_reinforced",    label: "底面を十分補強した" },
  { key: "corners_protected",    label: "角を保護した" },
  { key: "photo_before",         label: "梱包前写真を撮影した" },
  { key: "photo_during",         label: "梱包途中写真を撮影した" },
  { key: "photo_after",          label: "梱包後写真を撮影した" },
] as const;

// スタッフの稼働ステータス
export const STAFF_STATUSES = [
  { key: "active",     label: "稼働中" },
  { key: "paused",     label: "休止" },
  { key: "terminated", label: "契約終了" },
] as const;

// 支払状況（Phase 5）
export const PAYMENT_STATUSES = [
  { key: "unpaid",  label: "未払い",   badge: "bg-red-50 text-red-700 border-red-200" },
  { key: "paid",    label: "支払済み", badge: "bg-green-50 text-green-700 border-green-200" },
  { key: "on_hold", label: "保留",     badge: "bg-gray-100 text-gray-500 border-gray-300" },
] as const;

export function paymentStatusLabel(key: string): string {
  return PAYMENT_STATUSES.find((s) => s.key === key)?.label ?? key;
}

export function paymentBadgeClass(key: string): string {
  return PAYMENT_STATUSES.find((s) => s.key === key)?.badge ?? "bg-gray-100 text-gray-500 border-gray-300";
}

// 金額表示（例: 9,800円）
export function fmtYen(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("ja-JP") + "円";
}

// ─── 発送ラベル共有（Phase 6） ─────────────────────────────────

// 発送書類の種類
export const DOCUMENT_TYPES = [
  { key: "label",              label: "発送ラベル" },
  { key: "commercial_invoice", label: "Commercial Invoice" },
  { key: "customs_form",       label: "税関申告書" },
  { key: "postal_form",        label: "国際郵便書類" },
  { key: "signature_doc",      label: "署名書類" },
  { key: "other",              label: "その他" },
] as const;

export function documentTypeLabel(key: string): string {
  return DOCUMENT_TYPES.find((d) => d.key === key)?.label ?? key;
}

// 発送会社ごとの発送方法（任意項目）
export const SHIPPING_METHODS: Record<string, string[]> = {
  "FedEx": ["International Priority", "International Economy", "その他"],
  "DHL": ["Express Worldwide", "その他"],
  "Japan Post": ["EMS", "国際小包", "国際eパケット", "Small Packet", "その他"],
};

// 発送前チェックリスト（要件9: すべて確認しないと発送完了できない）
export const SHIP_CHECKLIST = [
  { key: "ship_carrier_checked",  label: "発送会社を確認した" },
  { key: "ship_label_checked",    label: "発送ラベルを確認した" },
  { key: "ship_item_matches",     label: "ラベルの商品と実際の商品が一致している" },
  { key: "ship_tracking_checked", label: "ラベルの追跡番号を確認した" },
  { key: "ship_label_attached",   label: "ラベルを正しく貼った" },
  { key: "ship_photo_taken",      label: "発送ラベル貼付後の写真を撮影した" },
] as const;
