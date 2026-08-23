# eBay外注管理ツール 設計書

要件定義（`requirements.md`）に基づく全体設計です。コード作成前の合意用ドキュメントとして、以下の10項目をまとめています。

---

## 1. システム全体構成

```
[スマホ / PC のブラウザ]
        │ HTTPS
        ▼
[Vercel]  ← Next.js アプリ（画面 + サーバー処理）
        │
        ▼
[Supabase]（無料枠で開始）
 ├─ PostgreSQL … 商品・スタッフ・履歴などのデータ
 ├─ Auth       … ログイン（メール + パスワード）
 └─ Storage    … 写真ファイル（非公開バケット + 署名付きURL）
```

- **Next.js（App Router）**: 画面表示とサーバー側の処理を1つにまとめられるフレームワーク。Vercelにそのまま公開できる。
- **Supabase**: データベース・ログイン・ファイル保存をまとめて提供するサービス。無料枠（DB 500MB / Storage 1GB / 月間アクティブユーザー5万人）で十分開始できる。
- 通知（LINE / メール / Discord）は将来、Supabaseの「Database Webhooks」やVercelのAPIルートから呼び出す形で追加できる構造にする（MVPでは未実装）。

## 2. 画面一覧

| # | パス | 画面名 | 権限 |
|---|------|--------|------|
| 1 | `/login` | ログイン | 全員 |
| 2 | `/admin` | 管理者ダッシュボード（本日の状況カード・警告・最近の更新） | 管理者 |
| 3 | `/admin/products` | 商品一覧（検索・フィルター・CSV一括登録） | 管理者 |
| 4 | `/admin/products/new` | 商品登録（QRコード自動生成） | 管理者 |
| 5 | `/admin/products/[id]` | 商品詳細（タイムライン・写真・コメント・履歴・発送情報） | 管理者 |
| 6 | `/admin/staff` | スタッフ管理 | 管理者 |
| 7 | `/admin/payments` | 報酬設定・月別集計（CSV出力） | 管理者 |
| 8 | `/admin/manuals` | マニュアル編集 | 管理者 |
| 9 | `/staff` | スタッフ用トップ（今日の作業・次にやること） | スタッフ |
| 10 | `/staff/products/[id]` | 担当商品の作業画面（STEP1〜7ウィザード + チェックリスト） | 担当スタッフのみ |
| 11 | `/manuals` | マニュアル閲覧 | 全員 |
| 12 | `/p/[controlNumber]` | QRコード読み取り先（権限に応じて詳細/作業画面へ転送） | ログイン必須 |

## 3. データベース設計

要件29の「users / staff」は、Supabase Authと連携する **`profiles`（1テーブル + role列）** に統合します（Supabaseの標準的な設計。認証ユーザーと1対1で紐付き、管理者/スタッフを`role`で区別。スタッフの氏名・電話・稼働状態も同テーブルで管理）。「shipping」は商品と1対1のため`products`の列として持ちます（正規化しすぎて画面が複雑になるのを防ぐ）。

| テーブル | 用途 | 主な列 |
|----------|------|--------|
| `profiles` | ユーザー（管理者+スタッフ） | id(auth連携), role(admin/staff), full_name, email, phone, status(稼働中/休止/契約終了), notes |
| `categories` | 商品カテゴリー | name, prefix(管理番号の接頭辞), default_fee(標準報酬円), requires_turntable_checklist |
| `carriers` | 発送会社 | name（FedEx/DHL/Japan Post/UPS/Other） |
| `products` | 商品 | control_number(重複不可), name, category_id, assigned_staff_id, status, arrival_date, ship_deadline, shipped_date, carrier_id, tracking_number, weight_kg, length_cm, width_cm, height_cm, serial_number, 検品結果, notes |
| `product_fees` | 商品ごとの報酬上書き（**管理者のみ閲覧可**） | product_id, amount |
| `product_photos` | 写真 | product_id, photo_category(外箱/本体/付属品/シリアル/梱包前/梱包途中/梱包完了/発送ラベル/その他), storage_path, uploaded_by |
| `product_comments` | コメント | product_id, author_id, body, created_at |
| `work_logs` | 作業履歴（自動記録） | product_id, actor_id, action, field, old_value, new_value, created_at |
| `product_checklists` | 梱包チェックリスト（ターンテーブル用） | product_id, item_key, checked, checked_by, checked_at |
| `manuals` | マニュアル | category, title, body, updated_by |

- **月別報酬**はビュー（`monthly_payments`）で自動集計: 発送済み商品 × (商品別報酬 or カテゴリー標準報酬) をスタッフ×月で合計。
- **仕入価格・販売価格・利益はこのデータベースに一切保存しない**（既存のeBay在庫管理ツール側で管理）。存在しないデータは漏れようがない、というのが最も安全な設計です。
- ステータスは英語キーで保存し（例 `arrived`）、画面では日本語ラベル（「商品到着」）で表示。

## 4. 権限設計

**Supabase Row Level Security（RLS）= データベース自体が行ごとにアクセス可否を判定する仕組み。** アプリのバグやURL直打ちでも他人のデータは返らない。

| テーブル | 管理者 | スタッフ |
|----------|--------|----------|
| profiles | 全件 閲覧/編集 | 自分の行のみ閲覧 |
| products | 全件 閲覧/編集/削除 | **自分に割り当てられた商品のみ** 閲覧/更新（更新できる列も作業項目のみに制限。担当者や報酬・期限は変更不可） |
| product_fees | 閲覧/編集 | **一切アクセス不可** |
| photos/comments/checklists | 全件 | 担当商品の分のみ |
| work_logs | 全件閲覧 | 担当商品の分のみ閲覧（書き込みは自動トリガー） |
| manuals/categories/carriers | 編集可 | 閲覧のみ |

- スタッフの更新可能列の制限は、DBトリガー（許可列以外の変更を拒否）で強制。
- 写真は非公開バケットに保存し、閲覧権限のある人にだけ有効期限付きURL（署名付きURL）を発行。

## 5. ディレクトリ構成

```
ebay-outsourcing-manager/
├── docs/                    ← 要件・設計・手順書（このフォルダ）
├── supabase/
│   └── migrations/          ← データベース構築SQL（Supabaseに貼り付けて実行）
├── src/
│   ├── app/                 ← 画面（上記「画面一覧」に対応）
│   │   ├── login/
│   │   ├── admin/           ← 管理者専用画面
│   │   ├── staff/           ← スタッフ専用画面
│   │   └── p/[cn]/          ← QRコード着地ページ
│   ├── components/          ← 共通部品（ステータスバッジ等）
│   ├── lib/
│   │   ├── supabase/        ← Supabase接続（ブラウザ用/サーバー用）
│   │   └── constants.ts     ← ステータス・写真カテゴリー等の定義
│   └── types/               ← TypeScriptの型定義
├── middleware.ts            ← 未ログイン者を/loginへ誘導
├── .env.local.example       ← 環境変数の見本（実際の値は入れない）
└── package.json
```

## 6. 開発順序

要件31のPhase構成の通り。各Phase完了時にコミットし、動作確認手順を提示します。

1. **Phase 1（今回）**: プロジェクト構築 / Supabase接続 / ログイン / 管理者・スタッフ権限 / DB設計（全テーブル + RLS を最初に作成）
2. **Phase 2**: 商品管理（登録・一覧・検索・フィルター）/ ステータス / 担当者割り当て / 商品詳細
3. **Phase 3**: スタッフ作業画面（STEP1〜7）/ ターンテーブルチェックリスト / 写真アップロード
4. **Phase 4**: 発送管理 / 追跡番号 / サイズ・重量 / 発送期限警告
5. **Phase 5**: 報酬管理 / 月別集計 / CSV出力
6. **Phase 6**: QRコード / マニュアル / 作業履歴表示 / CSV一括登録 / 問題報告
7. **Phase 7**: UI改善 / スマホ最適化

## 7. 必要な環境変数

「環境変数」= パスワードや接続先URLなど、コードに直接書かずに設定する値。

| 変数名 | 内容 | 取得場所 |
|--------|------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトのURL | Supabase管理画面 → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公開用APIキー（RLSで保護される前提の鍵） | 同上 |

※ `service_role`キー（全権限の鍵）はMVPでは使いません。使う場合もVercelのサーバー側にのみ設定し、絶対にブラウザへ渡しません。

## 8. Supabase設定手順（概要）

詳細は `docs/setup-guide.md` に画面操作レベルで記載。

1. https://supabase.com で無料アカウント作成 → 新規プロジェクト作成（リージョンは Tokyo 推奨）
2. SQL Editor で `supabase/migrations/0001_init.sql` を実行（テーブル・権限・初期データが全部入る）
3. Authentication → 管理者ユーザーを作成し、SQLで `role = 'admin'` に変更
4. Storage → `product-photos` バケット作成（非公開）※Phase 3で使用
5. Settings → API から URL と anon key をコピーして環境変数に設定

## 9. Vercel公開方法（概要）

1. このGitHubリポジトリをVercelにImport
2. **Root Directory に `ebay-outsourcing-manager` を指定**（このリポジトリには既存のeBay在庫管理ツールも入っているため。既存ツールのVercel設定には影響しません）
3. 環境変数2つを設定 → Deploy
4. 発行されたURL（`https://〜.vercel.app`）にスマホ・PCからアクセス

## 10. セキュリティ上の注意点

1. **価格・利益データを持たない**: このアプリのDBには仕入価格・販売価格・利益を保存しない設計。表示制御ではなくデータ自体を分離。
2. **RLSを全テーブルで有効化**: アプリを経由せずAPIを直接叩かれても、スタッフは担当商品以外のデータを取得できない。
3. **報酬は専用テーブルで隔離**: `product_fees`は管理者のみ読み書き可能。
4. **スタッフの更新列をDB側で制限**: 担当者・期限・報酬などはスタッフのアカウントからは変更不可（トリガーで拒否）。
5. **写真は非公開バケット + 署名付きURL**: URLを知っていても期限切れ・権限外なら閲覧不可。
6. **eBayのログイン情報はこのシステムに一切入力・保存しない**。
7. **anon key以外の鍵をコード・GitHubに置かない**: `.env.local`は`.gitignore`で除外済み。
8. スタッフ招待は管理者がSupabase上でアカウント発行（自由登録は無効化）。
