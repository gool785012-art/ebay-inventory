import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ログアウト処理（ヘッダーの「ログアウト」ボタンから呼ばれる）
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 302 });
}
