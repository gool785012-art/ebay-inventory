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
