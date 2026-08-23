import AppHeader from "@/components/AppHeader";
import ProductForm from "@/components/ProductForm";
import { requireProfile } from "@/lib/auth";

// 商品登録画面（管理者用）
export default async function NewProductPage() {
  const { supabase, profile } = await requireProfile("admin");

  const [{ data: categories }, { data: carriers }, { data: staffList }] =
    await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("carriers").select("*").order("sort_order"),
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "staff")
        .eq("status", "active")
        .order("full_name"),
    ]);

  return (
    <>
      <AppHeader fullName={profile.full_name || profile.email || ""} role="admin" />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-6 text-xl font-bold text-slate-800">商品を登録</h1>
        <ProductForm
          categories={categories ?? []}
          carriers={carriers ?? []}
          staffList={staffList ?? []}
        />
      </main>
    </>
  );
}
