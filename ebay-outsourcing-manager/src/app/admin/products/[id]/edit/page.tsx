import { notFound } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import ProductForm from "@/components/ProductForm";
import { requireProfile } from "@/lib/auth";
import type { Product } from "@/types/db";

// 商品編集画面（管理者用）
export default async function EditProductPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const { supabase, profile } = await requireProfile("admin");

  const [{ data: product }, { data: categories }, { data: carriers }, { data: staffList }] =
    await Promise.all([
      supabase.from("products").select("*").eq("id", id).single<Product>(),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("carriers").select("*").order("sort_order"),
      supabase.from("profiles").select("*").eq("role", "staff").order("full_name"),
    ]);

  if (!product) notFound();

  return (
    <>
      <AppHeader fullName={profile.full_name || profile.email || ""} role="admin" />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-6 text-xl font-bold text-slate-800">
          商品を編集 <span className="ml-2 font-mono text-base text-slate-400">{product.control_number}</span>
        </h1>
        <ProductForm
          categories={categories ?? []}
          carriers={carriers ?? []}
          staffList={staffList ?? []}
          initial={product}
        />
      </main>
    </>
  );
}
