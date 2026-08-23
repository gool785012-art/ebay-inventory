"use client";

import { createBrowserClient } from "@supabase/ssr";

// ブラウザ側で使うSupabase接続
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
