// 発送期限の警告表示（要件19: 3日以内=黄 / 1日以内=オレンジ / 超過=赤）
export function deadlineInfo(shipDeadline: string | null, status: string) {
  if (!shipDeadline || status === "shipped") return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(shipDeadline + "T00:00:00");
  const diffDays = Math.round((deadline.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0)
    return { text: `期限超過 ${-diffDays}日`, cls: "bg-red-100 text-red-700 border-red-300" };
  if (diffDays <= 1)
    return { text: diffDays === 0 ? "本日期限" : "残り1日", cls: "bg-orange-100 text-orange-700 border-orange-300" };
  if (diffDays <= 3)
    return { text: `残り${diffDays}日`, cls: "bg-yellow-100 text-yellow-700 border-yellow-300" };
  return null;
}

export default function DeadlineBadge({
  shipDeadline,
  status,
}: {
  shipDeadline: string | null;
  status: string;
}) {
  const info = deadlineInfo(shipDeadline, status);
  if (!info) return null;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold ${info.cls}`}
    >
      ⚠ {info.text}
    </span>
  );
}
