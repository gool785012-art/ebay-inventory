// 外注報酬の計算ロジック（Phase 9）
// 画面表示・DB確定の両方でこの計算に揃える。

/** 追加作業の単価 */
export const PHOTO_REWARD = 100;           // 商品状態の写真撮影
export const OPERATION_CHECK_REWARD = 200; // 簡単な動作確認

/** 集荷・持ち込みの報酬（回ごと） */
export const HANDOVER_REWARDS = [
  { key: 0,   label: "なし" },
  { key: 200, label: "西濃集荷（200円）" },
  { key: 201, label: "DHL集荷（200円）" },
  { key: 300, label: "郵便局持ち込み（300円）" },
  { key: 500, label: "郵便局持ち込み・多い/重い（500円）" },
] as const;

// DHL集荷は金額が西濃と同じ200円のため、選択肢の区別用に201を使い、金額としては200円に丸める
export function normalizeHandoverReward(value: number): number {
  return value === 201 ? 200 : value;
}

export function handoverRewardLabel(value: number): string {
  const found = HANDOVER_REWARDS.find((h) => h.key === value);
  if (found) return found.label;
  return value > 0 ? `${value.toLocaleString("ja-JP")}円` : "なし";
}

export type RewardInput = {
  /** 梱包報酬（カテゴリー標準報酬、または商品ごとの上書き） */
  packingReward: number;
  photoRequired: boolean;
  operationCheckRequired: boolean;
  /** 集荷・持ち込み報酬 */
  handoverReward?: number;
  /** 立替金（実費精算） */
  reimbursement?: number;
};

export type RewardBreakdown = {
  packingReward: number;
  photoReward: number;
  operationCheckReward: number;
  additionalReward: number;
  handoverReward: number;
  reimbursement: number;
  totalReward: number;
};

/**
 * 報酬の内訳と合計を計算する。
 * 追加報酬 = 写真100円 + 動作確認200円（両方なら300円）
 * 合計 = 梱包報酬 + 追加報酬 + 集荷/持ち込み報酬 + 立替金
 */
export function calcReward(input: RewardInput): RewardBreakdown {
  const packingReward = input.packingReward || 0;
  const photoReward = input.photoRequired ? PHOTO_REWARD : 0;
  const operationCheckReward = input.operationCheckRequired ? OPERATION_CHECK_REWARD : 0;
  const additionalReward = photoReward + operationCheckReward;
  const handoverReward = normalizeHandoverReward(input.handoverReward || 0);
  const reimbursement = input.reimbursement || 0;

  return {
    packingReward,
    photoReward,
    operationCheckReward,
    additionalReward,
    handoverReward,
    reimbursement,
    totalReward: packingReward + additionalReward + handoverReward + reimbursement,
  };
}

/** 動作確認の結果 */
export const OPERATION_CHECK_RESULTS = [
  { key: "ok",      label: "問題なし",     badge: "bg-green-50 text-green-700 border-green-200" },
  { key: "problem", label: "問題あり",     badge: "bg-red-50 text-red-700 border-red-200" },
  { key: "unable",  label: "確認できない", badge: "bg-amber-50 text-amber-700 border-amber-200" },
] as const;

export function operationCheckLabel(key: string | null): string {
  if (!key) return "未入力";
  return OPERATION_CHECK_RESULTS.find((r) => r.key === key)?.label ?? key;
}

export function operationCheckBadge(key: string | null): string {
  if (!key) return "bg-gray-100 text-gray-500 border-gray-300";
  return (
    OPERATION_CHECK_RESULTS.find((r) => r.key === key)?.badge ??
    "bg-gray-100 text-gray-500 border-gray-300"
  );
}

// ─── 立替金（Phase 10） ────────────────────────────────────────
// 作業報酬とは完全に別で管理し、支払時に合算する。

export const EXPENSE_TYPES = [
  { key: "postal_postage",   label: "郵便送料" },
  { key: "packing_material", label: "梱包資材" },
  { key: "other",            label: "その他" },
] as const;

export function expenseTypeLabel(key: string): string {
  return EXPENSE_TYPES.find((t) => t.key === key)?.label ?? key;
}

export const EXPENSE_STATUSES = [
  { key: "pending",  label: "未確認",   badge: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "approved", label: "承認済み", badge: "bg-green-50 text-green-700 border-green-200" },
  { key: "rejected", label: "差し戻し", badge: "bg-red-50 text-red-700 border-red-200" },
] as const;

export function expenseStatusLabel(key: string): string {
  return EXPENSE_STATUSES.find((s) => s.key === key)?.label ?? key;
}

export function expenseStatusBadge(key: string): string {
  return EXPENSE_STATUSES.find((s) => s.key === key)?.badge
    ?? "bg-gray-100 text-gray-500 border-gray-300";
}

export type Expense = {
  expense_type: string;
  amount: number;
  status?: string;
};

/** 立替金の合計（承認済みのみ数えたい場合は approvedOnly を true にする） */
export function calcExpenseTotal(expenses: Expense[], approvedOnly = false): number {
  return expenses
    .filter((e) => !approvedOnly || e.status === "approved")
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

/** 種類ごとの立替金合計 */
export function calcExpenseByType(expenses: Expense[], approvedOnly = false) {
  const target = expenses.filter((e) => !approvedOnly || e.status === "approved");
  return {
    postalPostage: target.filter((e) => e.expense_type === "postal_postage")
      .reduce((s, e) => s + (Number(e.amount) || 0), 0),
    packingMaterial: target.filter((e) => e.expense_type === "packing_material")
      .reduce((s, e) => s + (Number(e.amount) || 0), 0),
    other: target.filter((e) => e.expense_type === "other")
      .reduce((s, e) => s + (Number(e.amount) || 0), 0),
  };
}

/**
 * スタッフへの支払総額を計算する。
 * 作業報酬（staffRewardTotal）と立替金（expenseTotal）は必ず分けて扱う。
 */
export function calcStaffPayment(
  rewardInput: RewardInput,
  expenses: Expense[],
  approvedOnly = false
) {
  const reward = calcReward({ ...rewardInput, reimbursement: 0 });
  const expenseTotal = calcExpenseTotal(expenses, approvedOnly);
  return {
    reward,
    staffRewardTotal: reward.totalReward,   // 作業報酬のみ
    expenseTotal,                          // 立替金のみ
    expenseByType: calcExpenseByType(expenses, approvedOnly),
    staffPaymentTotal: reward.totalReward + expenseTotal,  // 支払総額
  };
}

/** 金額入力の検証（マイナス禁止・数字以外禁止・極端に大きい金額は要確認） */
export function validateAmount(input: string): { ok: boolean; value: number; message?: string } {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, value: 0, message: "金額を入力してください" };
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, value: 0, message: "金額は数字（半角）のみで入力してください" };
  }
  const value = Number(trimmed);
  if (value < 0) return { ok: false, value: 0, message: "マイナスの金額は入力できません" };
  if (value === 0) return { ok: false, value: 0, message: "0円の場合は登録不要です" };
  if (value > 100000) {
    return { ok: true, value, message: "金額が10万円を超えています。入力内容をご確認ください" };
  }
  return { ok: true, value };
}
