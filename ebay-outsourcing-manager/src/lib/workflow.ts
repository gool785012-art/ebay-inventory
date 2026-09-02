// 発送方法別の作業指示と作業ステータス（Phase 11）

/** 作業ステータス（案件の進み具合） */
export const WORK_STATUSES = [
  { key: "not_started",   label: "未着手",   badge: "bg-gray-100 text-gray-600 border-gray-300" },
  { key: "in_progress",   label: "作業中",   badge: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "needs_review",  label: "要確認",   badge: "bg-red-50 text-red-700 border-red-200" },
  { key: "ready_to_ship", label: "発送待ち", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  { key: "shipped",       label: "発送完了", badge: "bg-green-50 text-green-700 border-green-200" },
] as const;

export function workStatusLabel(key: string): string {
  return WORK_STATUSES.find((s) => s.key === key)?.label ?? key;
}

export function workStatusBadge(key: string): string {
  return WORK_STATUSES.find((s) => s.key === key)?.badge
    ?? "bg-gray-100 text-gray-600 border-gray-300";
}

export type WorkTask = {
  key: string;
  label: string;
  /** 報酬が付く作業の場合の表示（例: "＋100円"） */
  reward?: string;
};

/** 発送方法によらず共通の作業 */
function baseTasks(photoRequired: boolean, operationRequired: boolean): WorkTask[] {
  return [
    { key: "check_item", label: "商品確認" },
    { key: "weigh", label: "重量確認" },
    ...(photoRequired
      ? [{ key: "photo", label: "商品状態の写真撮影", reward: "＋100円" }]
      : []),
    ...(operationRequired
      ? [{ key: "operation", label: "動作確認", reward: "＋200円" }]
      : []),
    { key: "packing", label: "梱包" },
  ];
}

/**
 * 発送会社に応じて必要な作業だけを返す。
 * 不要な作業（例: 西濃発送なのに郵便局持ち込み）は含めない。
 */
export function getWorkTasks(
  carrierName: string,
  photoRequired: boolean,
  operationRequired: boolean
): WorkTask[] {
  const base = baseTasks(photoRequired, operationRequired);

  // 西濃運輸: 集荷でドライバーに渡す
  if (carrierName.includes("西濃")) {
    return [
      ...base,
      { key: "check_label", label: "発送ラベル確認" },
      { key: "attach_label", label: "ラベル貼付" },
      { key: "handover_driver", label: "西濃ドライバーへ荷物を渡す" },
      { key: "complete", label: "発送完了" },
    ];
  }

  // DHL: インボイスなどの書類が必要
  if (carrierName === "DHL") {
    return [
      ...base,
      { key: "check_label", label: "DHLラベル確認" },
      { key: "check_invoice", label: "インボイス確認" },
      { key: "attach_docs", label: "必要な書類を荷物に取り付ける" },
      { key: "handover_driver", label: "DHLドライバーへ荷物を渡す" },
      { key: "complete", label: "発送完了" },
    ];
  }

  // 国際郵便（Japan Post）: 郵便局へ持ち込み、控えと領収書が必要
  if (carrierName === "Japan Post" || carrierName.includes("郵便")) {
    return [
      { key: "check_item", label: "商品確認" },
      { key: "weigh", label: "重さを測る" },
      { key: "input_weight", label: "ツールへ重量入力" },
      ...(photoRequired
        ? [{ key: "photo", label: "商品状態の写真撮影", reward: "＋100円" }]
        : []),
      ...(operationRequired
        ? [{ key: "operation", label: "動作確認", reward: "＋200円" }]
        : []),
      { key: "packing", label: "梱包" },
      { key: "check_label", label: "発送ラベル確認" },
      { key: "check_invoice", label: "インボイス確認" },
      { key: "print_docs", label: "ラベル・インボイス印刷" },
      { key: "photo_parcel", label: "荷物の写真" },
      { key: "bring_post", label: "郵便局へ持ち込み", reward: "＋300円" },
      { key: "post_reception", label: "郵便局で受付" },
      { key: "check_customs", label: "国際郵便申告書の確認" },
      { key: "get_receipt_copy", label: "受付控えを受け取る" },
      { key: "get_receipt", label: "領収書を受け取る" },
      { key: "upload_receipt_copy", label: "受付控えをアップ" },
      { key: "upload_receipt", label: "領収書をアップ" },
      { key: "input_postage", label: "実際に支払った郵便送料を入力" },
      { key: "complete", label: "発送完了" },
    ];
  }

  // FedEx・その他: 集荷が基本
  return [
    ...base,
    { key: "check_label", label: "発送ラベル確認" },
    { key: "check_invoice", label: "インボイス確認" },
    { key: "attach_label", label: "ラベル貼付" },
    { key: "handover_driver", label: "配送業者へ荷物を渡す" },
    { key: "complete", label: "発送完了" },
  ];
}

/** 国際郵便かどうか（郵便局関連の入力欄の出し分けに使う） */
export function isPostalShipping(carrierName: string): boolean {
  return carrierName === "Japan Post" || carrierName.includes("郵便");
}
