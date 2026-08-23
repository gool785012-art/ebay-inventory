# セットアップ手順書（あなたにやっていただく作業）

プログラミングの知識は不要です。ブラウザ上の操作だけで完了します。
所要時間: 約15〜20分。

---

## 手順A: Supabaseプロジェクトを作る

1. https://supabase.com を開き、「Start your project」からGitHubアカウントでログイン（無料）
2. 「New Project」をクリック
3. 以下を入力して「Create new project」
   - Project name: `ebay-outsourcing-manager`（任意の名前でOK）
   - Database Password: 強いパスワードを設定（**メモしておく**）
   - Region: `Northeast Asia (Tokyo)` を選択
4. 1〜2分でプロジェクトが作成されます

## 手順B: データベースを構築する

1. Supabase画面の左メニューから「**SQL Editor**」をクリック
2. GitHubのこのリポジトリで `ebay-outsourcing-manager/supabase/migrations/0001_init.sql` を開き、内容を**全部コピー**
3. SQL Editorに貼り付けて「**Run**」ボタンをクリック
4. 「Success. No rows returned」と表示されれば成功です
   （テーブル・アクセス権限・初期カテゴリー・発送会社がすべて作成されます）
5. **写真保存の設定（Phase 3以降で必要）**: 同じ手順で `ebay-outsourcing-manager/supabase/migrations/0002_storage.sql` の内容も貼り付けて「Run」してください（写真の保存場所と閲覧権限が作成されます）

## 手順C: 管理者アカウント（あなた自身）を作る

1. 左メニュー「**Authentication**」→「**Users**」→「**Add user**」→「**Create new user**」
2. あなたのメールアドレスとパスワードを入力し、「**Auto Confirm User**」に**チェックを入れて**作成
3. 作成したユーザーを管理者に昇格させます。「SQL Editor」に戻り、以下を貼り付けて「Run」:

```sql
update public.profiles
set role = 'admin', full_name = '管理者'
where email = 'あなたのメールアドレス';
```

※ `あなたのメールアドレス` の部分を手順C-2で入力したものに書き換えてください（前後の `'` は残す）。

## 手順D: 接続情報（環境変数）をコピーする

1. 左メニュー「**Settings**」（歯車アイコン）→「**API**」
2. 以下の2つをメモ帳などにコピー:
   - **Project URL**（`https://〜.supabase.co`）
   - **anon public** キー（`eyJ...` で始まる長い文字列）

## 手順E: Vercelで公開する

1. https://vercel.com にGitHubアカウントでログイン
2. 「Add New...」→「Project」→ リポジトリ `ebay-inventory` を「Import」
3. **重要**: 「Root Directory」の「Edit」をクリックし、`ebay-outsourcing-manager` を選択
   （このリポジトリには既存のeBay在庫管理ツールも入っているため。既存ツールには影響しません）
4. 「Environment Variables」に手順Dでコピーした2つを追加:
   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon publicキー |
5. 「Deploy」をクリック → 1〜2分でURLが発行されます

## 手順F: 動作確認

1. 発行されたURL（`https://〜.vercel.app`）を開く
2. ログイン画面が表示される → 手順Cで作ったメールアドレス・パスワードでログイン
3. 「管理者ダッシュボード」が表示されれば **Phase 1 完了** です

## 手順G: 外注スタッフのアカウントを作る（スタッフが決まってから）

1. 手順C-1と同じ操作でスタッフのメール・パスワードでユーザー作成（Auto Confirmにチェック）
2. SQL Editorで氏名を設定（roleは変更しない = 自動的にスタッフ権限になります）:

```sql
update public.profiles
set full_name = 'スタッフの氏名'
where email = 'スタッフのメールアドレス';
```

3. スタッフがログインすると、スタッフ専用画面（担当商品のみ表示）になります

---

## うまくいかないとき

- **ログインできない** → Supabaseの Authentication → Users でユーザーが「Confirmed」になっているか確認。なっていなければユーザーを削除して「Auto Confirm User」にチェックを入れて作り直し。
- **画面が真っ白/エラー** → Vercelの環境変数2つが正しくコピーされているか確認（前後に空白が入りやすいので注意）→ 直したら「Deployments」から「Redeploy」。
- **SQLでエラー** → すでに一度実行済みの可能性があります（2回実行するとエラーになります）。その場合は問題ありません。
