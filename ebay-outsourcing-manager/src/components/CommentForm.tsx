"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// コメント投稿フォーム（管理者・スタッフ共通、要件11）
export default function CommentForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: err } = await supabase.from("product_comments").insert({
      product_id: productId,
      author_id: user?.id ?? null,
      body: body.trim(),
    });

    setSending(false);
    if (err) {
      setError("送信に失敗しました: " + err.message);
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="コメントを入力（例: レンズキャップがありません）"
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
      />
      {error && <p className="mt-1 text-sm font-semibold text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={sending || !body.trim()}
        className="mt-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-40"
      >
        {sending ? "送信中..." : "コメントを送信"}
      </button>
    </form>
  );
}
