import AppHeader from "@/components/AppHeader";
import ManualManager from "@/components/ManualManager";
import { requireProfile } from "@/lib/auth";
import type { Category, Carrier } from "@/types/db";

// マニュアル管理ページ（管理者用、Phase 11）
export default async function AdminManualsPage() {
  const { supabase, profile } = await requireProfile("admin");

  const [{ data: manuals }, { data: categories }, { data: carriers }] = await Promise.all([
    supabase.from("manuals").select("*").order("sort_order").order("id"),
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("carriers").select("*").order("sort_order"),
  ]);

  return (
    <>
      <AppHeader fullName={profile.full_name || profile.email || ""} role="admin" />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-1 text-xl font-bold text-slate-800">マニュアル管理</h1>
        <p className="mb-6 text-sm text-slate-500">
          スタッフの作業画面に表示されるマニュアルを登録・管理します。
        </p>
        <ManualManager
          manuals={manuals ?? []}
          categories={(categories ?? []) as Category[]}
          carriers={(carriers ?? []) as Carrier[]}
        />
      </main>
    </>
  );
}
