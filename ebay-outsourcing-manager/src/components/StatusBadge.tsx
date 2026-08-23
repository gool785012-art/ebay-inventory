import { statusBadgeClass, statusLabel } from "@/lib/constants";

// ステータスの色付きバッジ（要件7）
export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusBadgeClass(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}
