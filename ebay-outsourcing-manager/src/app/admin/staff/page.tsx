import AppHeader from "@/components/AppHeader";
import StaffEditor from "@/components/StaffEditor";
import { requireProfile } from "@/lib/auth";
import type { Profile } from "@/types/db";

// スタッフ情報ページ（管理者用、Phase 5）
// 現在は1名運用のためシンプルな表示。スタッフが増えたらそのまま下に並ぶ。
export default async function AdminStaffPage() {
  const { supabase, profile } = await requireProfile("admin");

  const { data: staffList } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "staff")
    .order("created_at");

  return (
    <>
      <AppHeader fullName={profile.full_name || profile.email || ""} role="admin" />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 text-xl font-bold text-slate-800">スタッフ情報</h1>
        <p className="mb-6 text-sm text-slate-500">
          外注スタッフの情報を確認・編集できます。アカウントの追加はSupabaseの管理画面から行います。
        </p>

        {(staffList ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            スタッフが登録されていません。Supabaseの Authentication → Users からアカウントを作成してください。
          </div>
        ) : (
          <div className="space-y-6">
            {(staffList ?? []).map((s: Profile) => (
              <StaffEditor key={s.id} staff={s} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
