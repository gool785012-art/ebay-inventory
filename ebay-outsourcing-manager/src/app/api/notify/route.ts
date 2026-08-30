import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { statusLabel, documentTypeLabel, fmtPickupRange } from "@/lib/constants";

// 通知APIルート（Phase 8）
// ブラウザから直接Chatworkへは送らず、必ずこのサーバー処理を通す。
// APIトークンはサーバー側にしか存在しないため、外部に漏れない。

type NotifyEvent =
  | "sent_to_staff"      // 仕入れ先から外注先へ発送された
  | "label_shared"       // 発送ラベルを共有した
  | "pickup_confirmed"   // 集荷日時が確定した
  | "comment"            // コメントが投稿された
  | "problem_reported"   // 問題が報告された
  | "pickup_entered"     // スタッフが集荷可能日時を入力した
  | "shipped";           // 発送完了

export async function POST(request: Request) {
  const supabase = await createClient();

  // ログインしている本人以外は通知を送れない
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { event, productId, extra } = (await request.json()) as {
    event: NotifyEvent;
    productId: string;
    extra?: string;
  };

  // 商品情報を取得（RLSが効くので、権限のない商品は取得できない）
  const { data: product } = await supabase
    .from("products")
    .select(
      "control_number, name, status, tracking_number, carrier_id, pickup_confirmed_date, pickup_confirmed_from, pickup_confirmed_to, pickup_available_date, pickup_available_from, pickup_available_to"
    )
    .eq("id", productId)
    .single();

  if (!product) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", user.id)
    .single();

  const actor = profile?.full_name || profile?.email || "担当者";
  const item = `${product.control_number} ${product.name}`;

  let carrierName = "";
  if (product.carrier_id) {
    const { data: carrier } = await supabase
      .from("carriers").select("name").eq("id", product.carrier_id).single();
    carrierName = carrier?.name ?? "";
  }

  // イベントごとのメッセージを組み立てる
  const messages: Record<NotifyEvent, { title: string; lines: string[]; linkFor: "staff" | "admin" }> = {
    sent_to_staff: {
      title: "商品が発送されました（到着確認をお願いします）",
      lines: [item, "仕入れ先から外注先へ発送されました。", "到着したらツールで到着報告をしてください。"],
      linkFor: "staff",
    },
    label_shared: {
      title: "発送ラベルを共有しました（確認をお願いします）",
      lines: [
        item,
        extra ? `書類: ${documentTypeLabel(extra)}` : "",
        carrierName ? `発送会社: ${carrierName}` : "",
        "ツールで内容を確認し、「確認しました」を押してください。",
      ].filter(Boolean),
      linkFor: "staff",
    },
    pickup_confirmed: {
      title: "集荷日時が確定しました",
      lines: [
        item,
        `${carrierName || "配送業者"} 集荷予定: ${fmtPickupRange(
          product.pickup_confirmed_date,
          product.pickup_confirmed_from,
          product.pickup_confirmed_to
        )}`,
        "この時間帯に集荷対応をお願いします。",
      ],
      linkFor: "staff",
    },
    comment: {
      title: "コメントが投稿されました",
      lines: [item, `${actor}さん:`, extra ?? ""],
      linkFor: profile?.role === "admin" ? "staff" : "admin",
    },
    problem_reported: {
      title: "問題が報告されました",
      lines: [item, `報告者: ${actor}`, extra ? `内容: ${extra}` : "", "ツールで内容を確認してください。"].filter(Boolean),
      linkFor: "admin",
    },
    pickup_entered: {
      title: "集荷可能日時が入力されました（集荷手配をお願いします）",
      lines: [
        item,
        `希望日時: ${fmtPickupRange(
          product.pickup_available_date,
          product.pickup_available_from,
          product.pickup_available_to
        )}`,
        extra ? `メモ: ${extra}` : "",
      ].filter(Boolean),
      linkFor: "admin",
    },
    shipped: {
      title: "発送が完了しました",
      lines: [
        item,
        carrierName ? `発送会社: ${carrierName}` : "",
        product.tracking_number ? `追跡番号: ${product.tracking_number}` : "",
        `現在の状態: ${statusLabel(product.status)}`,
      ].filter(Boolean),
      linkFor: "admin",
    },
  };

  const msg = messages[event];
  if (!msg) {
    return NextResponse.json({ error: "unknown event" }, { status: 400 });
  }

  await notify({
    title: msg.title,
    lines: msg.lines,
    productId,
    linkFor: msg.linkFor,
  });

  return NextResponse.json({ ok: true });
}
