# eBay外注管理ツール

eBay輸出事業の外注スタッフ（受け取り・検品・撮影・梱包・発送）を管理するWebアプリです。
PC・スマートフォン両対応。

## ドキュメント

| ファイル | 内容 |
|----------|------|
| [docs/requirements.md](docs/requirements.md) | 要件定義書（開発依頼の全内容） |
| [docs/design.md](docs/design.md) | 設計書（システム構成・画面一覧・DB設計・権限設計など） |
| [docs/setup-guide.md](docs/setup-guide.md) | **セットアップ手順書（最初にこれを読んでください）** |

## 技術構成

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (PostgreSQL / Auth / Storage) — 無料枠で運用可能
- Vercel でデプロイ

## 開発状況

- [x] **Phase 1**: プロジェクト構築 / Supabase接続 / ログイン / 管理者・スタッフ権限 / DB設計
- [ ] Phase 2: 商品管理 / ステータス / 担当者割り当て / 商品詳細
- [ ] Phase 3: 外注作業画面 / チェックリスト / 写真アップロード
- [ ] Phase 4: 発送管理 / 追跡番号 / サイズ / 重量
- [ ] Phase 5: 報酬管理 / 月別集計
- [ ] Phase 6: QRコード / マニュアル / 作業履歴
- [ ] Phase 7: UI改善 / スマホ最適化

## ローカル開発（開発者向け）

```bash
cd ebay-outsourcing-manager
npm install
cp .env.local.example .env.local   # 値をSupabaseの実際の値に書き換える
npm run dev                        # http://localhost:3000
```
