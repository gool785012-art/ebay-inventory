"use client";

// 画面側から通知を依頼する関数（Phase 8）
// 通知の失敗で操作が止まらないよう、エラーは記録するだけにしている。
export async function sendNotification(
  event: string,
  productId: string,
  extra?: string
): Promise<void> {
  try {
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, productId, extra }),
    });
  } catch (e) {
    console.error("通知の送信に失敗しました:", e);
  }
}
