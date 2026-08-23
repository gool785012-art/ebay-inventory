import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// トップページ: ログイン状態と権限を確認して適切な画面へ振り分ける
export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") {
    redirect("/admin");
  }
  redirect("/staff");
}
