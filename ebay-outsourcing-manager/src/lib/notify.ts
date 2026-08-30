import "server-only";

// Chatworkへの通知送信（Phase 8）
// 環境変数が未設定なら何もしない（通知なしでもアプリは正常に動く）
//
// 将来LINE・メール・Discordを追加する場合は、この notify() の中に
// 送信先を1つ増やすだけでよい構造にしてある。

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export type NotifyInput = {
  title: string;
  lines: string[];
  productId?: string;
  /** スタッフ向けリンクにするか（既定: スタッフ向け） */
  linkFor?: "staff" | "admin";
};

async function sendToChatwork(body: string): Promise<void> {
  const token = process.env.CHATWORK_API_TOKEN;
  const roomId = process.env.CHATWORK_ROOM_ID;
  if (!token || !roomId) return; // 未設定なら送らない

  try {
    const res = await fetch(`https://api.chatwork.com/v2/rooms/${roomId}/messages`, {
      method: "POST",
      headers: {
        "X-ChatWorkToken": token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ body }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("Chatwork通知に失敗:", res.status, await res.text());
    }
  } catch (e) {
    // 通知の失敗で業務が止まらないよう、記録だけして続行する
    console.error("Chatwork通知でエラー:", e);
  }
}

export async function notify(input: NotifyInput): Promise<void> {
  const parts = [...input.lines];

  if (input.productId && APP_URL) {
    const path = input.linkFor === "admin"
      ? `/admin/products/${input.productId}`
      : `/staff/products/${input.productId}`;
    parts.push(`${APP_URL}${path}`);
  }

  const body = `[info][title]${input.title}[/title]${parts.join("\n")}[/info]`;
  await sendToChatwork(body);
}
