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
6. **報酬管理の設定（Phase 5以降で必要）**: 同じ手順で `ebay-outsourcing-manager/supabase/migrations/0003_rewards.sql` の内容も貼り付けて「Run」してください（報酬の自動確定・支払管理・変更履歴が作成されます）
7. **発送ラベル共有の設定（Phase 6以降で必要）**: 同じ手順で `ebay-outsourcing-manager/supabase/migrations/0004_shipping_documents.sql` の内容も貼り付けて「Run」してください（発送書類の保存場所・共有管理・アクセス制御が作成されます）
8. **集荷管理の設定（Phase 7以降で必要）**: 同じ手順で `ebay-outsourcing-manager/supabase/migrations/0005_pickup.sql` の内容も貼り付けて「Run」してください（集荷可能日時・集荷手配ステータス・集荷確定日時が使えるようになります）
9. **追加作業・報酬の設定（Phase 9以降で必要）**: 同じ手順で `ebay-outsourcing-manager/supabase/migrations/0006_additional_work.sql` の内容も貼り付けて「Run」してください（商品状態の写真撮影・簡単な動作確認の要否と追加報酬が使えるようになります）

---

## 手順H: Chatwork通知の設定（任意・Phase 8）

設定しなくてもアプリは正常に動きます。通知が必要な場合のみ行ってください。

### H-1. ChatworkのAPIトークンを取得する

1. https://www.chatwork.com にログイン
2. 右上のアカウント名（アイコン）をクリック →「**サービス連携**」
3. 左メニューの「**API Token**」をクリック
4. Chatworkのパスワードを入力して「表示」
5. 表示された文字列（英数字の羅列）をコピーしてメモ帳に保存

### H-2. 通知したいチャットのルームIDを調べる

1. Chatworkで、スタッフとの共通チャット（通知を送りたいチャット）を開く
2. ブラウザのアドレスバーを見る（例: `https://www.chatwork.com/#!rid123456789`）
3. `rid` の後ろの数字（この例では `123456789`）をメモ帳に保存

### H-3. Vercelに設定する

1. https://vercel.com → プロジェクト `ebay-inventory-4tzs` を開く
2. 左メニューの「**Environment Variables**」をクリック
3. 右上の「**Add Environment Variable**」をクリックし、以下を1つずつ追加（**「Sensitive」のスイッチは必ずOFF**にしてください）

| Key | Value |
|-----|-------|
| `CHATWORK_API_TOKEN` | H-1でコピーしたトークン |
| `CHATWORK_ROOM_ID` | H-2で調べた数字 |
| `NEXT_PUBLIC_APP_URL` | `https://ebay-inventory-4tzs.vercel.app` |

4. 3つとも追加したら、左メニュー「**Deployments**」→ 一番上の「...」→「**Redeploy**」

### H-4. 動作確認

管理者でログインして、どれかの商品にコメントを書いてみてください。Chatworkの指定したチャットに通知が届けば成功です。

### 通知されるタイミング

- 仕入れ先から外注先へ発送した（ステータスを「外注先へ発送済み」に変更）
- 発送ラベルをスタッフへ共有した
- 集荷日時が確定した
- コメントが投稿された
- スタッフが問題を報告した
- スタッフが集荷可能日時を入力した
- スタッフが発送完了した

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
