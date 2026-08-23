import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/db";

// ログイン + 権限チェック。条件を満たさない場合は適切なページへ転送する。
export async function requireProfile(requiredRole?: "admin" | "staff") {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) {
    redirect("/login");
  }

  if (requiredRole && profile.role !== requiredRole) {
    redirect(profile.role === "admin" ? "/admin" : "/staff");
  }

  return { supabase, user, profile };
}
