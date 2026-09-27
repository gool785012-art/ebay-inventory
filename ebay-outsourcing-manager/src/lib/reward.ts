// 外注報酬の計算ロジック（Phase 9）
// 画面表示・DB確定の両方でこの計算に揃える。

/** 追加作業の単価 */
export const PHOTO_REWARD = 100;           // 商品状態の写真撮影
export const OPERATION_CHECK_REWARD = 200; // 簡単な動作確認

/**
 * 集荷・持ち込みの報酬（回ごと）
 *
 * 「どの方法か」は key（文字列）で持ち、金額は amount で持つ。
 * 以前は選択肢の値に金額そのものを使っていたため、金額が同じ
 * 「西濃集荷（200円）」と「DHL集荷（200円）」を区別できず、
 * DHLだけ 201 という実在しない金額を保存していた（1円の端数の原因）。
 * 金額は必ずこの表から引き、選択肢の区別には使わない。
 */
export const HANDOVER_OPTIONS = [
  { key: "",           amount: 0,   label: "なし" },
  { key: "seino",      amount: 200, label: "西濃集荷（200円）" },
  { key: "dhl",        amount: 200, label: "DHL集荷（200円）" },
  { key: "post",       amount: 300, label: "郵便局持ち込み（300円）" },
  { key: "post_heavy", amount: 500, label: "郵便局持ち込み・多い/重い（500円）" },
] as const;

export type HandoverMethodKey = (typeof HANDOVER_OPTIONS)[number]["key"];

/** 集荷・持ち込み報酬として保存してよい金額 */
export const HANDOVER_ALLOWED_AMOUNTS: readonly number[] = [0, 200, 300, 500];

/** 集荷方法 → 金額（金額の唯一の決定元。差額計算はせず常にこの値で上書きする） */
export function handoverAmount(methodKey: string): number {
  return HANDOVER_OPTIONS.find((h) => h.key === methodKey)?.amount ?? 0;
}

/** 集荷方法 → 表示名 */
export function handoverMethodLabel(methodKey: string): string {
  return HANDOVER_OPTIONS.find((h) => h.key === methodKey)?.label ?? "なし";
}

/**
 * 集荷・持ち込み報酬の正規化（集計前の防御）
 *
 * 許可された金額（0/200/300/500）以外がDBに残っていても
 * 1円単位の端数が集計に混ざらないよう、直近下位の許可金額へ丸める。
 * 例: 201→200 / 301→300 / 501→500
 * ※この正規化は「集荷・持ち込み報酬」専用。他の報酬項目には適用しない。
 */
export function normalizeHandoverReward(value: number | null | undefined): number {
  const n = Number(value) || 0;
  if (n <= 0) return 0;
  if (HANDOVER_ALLOWED_AMOUNTS.includes(n)) return n;
  let result = 0;
  for (const allowed of HANDOVER_ALLOWED_AMOUNTS) {
    if (allowed <= n && allowed > result) result = allowed;
  }
  return result;
}

/**
 * 旧データ（金額だけが保存されている行）から集荷方法を推定する。
 * 201 は旧仕様のDHL集荷を表す値。
 */
export function handoverMethodFromReward(value: number | null | undefined): HandoverMethodKey {
  const n = Number(value) || 0;
  if (n === 201) return "dhl";
  if (n >= 500) return "post_heavy";
  if (n >= 300) return "post";
  if (n >= 200) return "seino";
  return "";
}

/** 保存済みの集荷方法（なければ旧データの金額から推定）を返す */
export function resolveHandoverMethod(
  methodKey: string | null | undefined,
  rewardValue: number | null | undefined
): HandoverMethodKey {
  if (methodKey && HANDOVER_OPTIONS.some((h) => h.key === methodKey)) {
    return methodKey as HandoverMethodKey;
  }
  return handoverMethodFromReward(rewardValue);
}

/** 金額から表示名を求める（集荷方法が未保存の旧データ用） */
export function handoverRewardLabel(value: number): string {
  const normalized = normalizeHandoverReward(value);
  if (normalized === 0) return "なし";
  return handoverMethodLabel(handoverMethodFromReward(value));
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

// ─── 月次集計の共通ロジック ────────────────────────────────────
// 「今月の報酬合計」「未払い」「作業報酬合計」「最終支払額」「CSV出力」が
// 別々の式で計算されて食い違わないよう、すべてここを経由させる。

/** work_rewards 1行分の報酬内訳（集計に必要な列だけ） */
export type WorkRewardRow = {
  packing_reward: number;
  photo_reward: number;
  operation_check_reward: number;
  handover_reward: number;
};

/** 作業報酬の合計（立替金は含めない）。集荷・持ち込みは正規化してから足す */
export function calcWorkRewardTotal(row: WorkRewardRow): number {
  return (
    (Number(row.packing_reward) || 0) +
    (Number(row.photo_reward) || 0) +
    (Number(row.operation_check_reward) || 0) +
    normalizeHandoverReward(row.handover_reward)
  );
}

/** 作業報酬の項目別合計（画面の内訳表示用） */
export function calcRewardBreakdown(rows: WorkRewardRow[]) {
  const packing = rows.reduce((s, r) => s + (Number(r.packing_reward) || 0), 0);
  const photo = rows.reduce((s, r) => s + (Number(r.photo_reward) || 0), 0);
  const operationCheck = rows.reduce((s, r) => s + (Number(r.operation_check_reward) || 0), 0);
  const handover = rows.reduce((s, r) => s + normalizeHandoverReward(r.handover_reward), 0);
  return {
    packing,
    photo,
    operationCheck,
    handover,
    total: packing + photo + operationCheck + handover,
  };
}
