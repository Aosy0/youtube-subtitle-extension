# YouTube Subtitle Enhancer — エージェント向けガイド

## プロジェクト概要
YouTubeの字幕表示を改善するChrome拡張（Manifest V3）。
**ビルド不要**で、root直下のJS/CSSを `chrome://extensions/` から直接読み込む。
機能・設定の詳細は `README.md` を参照。`package.json` の依存は開発・検証用（拡張本体には不要）。

## アーキテクチャ（変更前に必読）
- **2つの実行ワールド**（`manifest.json`）
  - `bridge.js` → MAIN world / `document_start`: プレーヤー内部データの取得、YouTube自身のtimedtext通信の傍受、fetchプロキシ
  - その他のモジュール → ISOLATED world / `document_end`
- **ロード順が重要**: `yse-common.js` が最初（`Settings` / `Logger` / `CONFIG` / `LogPanel` / `getYouTubeVideoId` / `isManualSubtitleTrack` などを提供）
- 各モジュールは `window.*` でグローバル公開する形式
- **字幕データの取得は3経路**（上から順にフォールバック）
  1. YouTube自身のtimedtext通信の傍受（`YSE_INTERCEPTED_SUBTITLE`）— 主経路
  2. ブリッジ経由のfetch（`YSE_FETCH_REQUEST/RESPONSE`）— PoT環境では0バイトになる場合あり
  3. caption window のDOM監視（テキスト加工は限定的）
- **字幕状態は動画IDで管理**: 傍受/取得したブロックは `captionBlocksVideoId` でタグ付けし、動画遷移時の混入・消失を防ぐ
- **ネイティブ表示の判定**: `isManualSubtitleTrack()`（yse-common.js）。自動ダブ（多言語音声）付き動画の `caps=asr` トラックのみ自動翻訳字幕として整形対象にし、それ以外（公式多言語字幕・手動字幕）はYouTubeのネイティブ表示を維持

## 開発コマンド
```bash
npm test                          # vitest（tests/unit/**/*.test.js）+ 全JSの構文チェック
npm run test:watch                # 監視モード
node tools/verify-extension.mjs   # 実機検証（詳細は yse-live-verification スキル参照）
```

## 変更時の基本フロー
1. `README.md` と対象モジュールを読んでから変更する
2. `npm test` でグリーンを確認（`syntax-check` が全JSを走査する）
3. 実装 → ユニットテスト追加 → `npm test`
4. 実機検証: 対象動画＋両ブランチの回帰（整形対象/ネイティブ対象）— `yse-live-verification` スキル参照
5. コミット（下記ルール）

## ファイル配置ルール
- **拡張本体は root 直下**: `content.js` / `bridge.js` / `yse-common.js` / `player-controller.js` / `subtitle-enhancer.js` / `youtube-settings.js` / `ui-controller.js` / `styles.css` / `manifest.json`（UIは `popup/`、アイコンは `icons/`）
- **デバッグ・検証スクリプトは `tools/`**（gitignore対象。出力先は `tools/_live/`）
- **`tests/` はユニットテスト専用**（vitest + jsdom）。E2E・デバッグスクリプトを置かない。`tests/` 全体は .gitignore 対象（ローカル運用）
- **プロジェクトスキルは `.claude/skills/`**（ローカル運用。本ファイルから参照する）
- 一時プロファイル（`tmp-*`、`test-profile*` 等）は .gitignore 対象

## テスト
- `npm test` は現在424件（`parseJson3` / `stability-fixes` / `syntax-check`）
  - `syntax-check` は全JSファイルを `node --check` するため、構文エラーは必ず検出される
- バグ修正時は再現条件をテストに落としてから直す。仕様変更時はテストも更新する

## コミット
- バグ修正は「治ったことを確認してから」コミットする（ユニット＋実機検証）
- メッセージは日本語で簡潔に。`Co-authored-by: OpenCode <noreply@opencode.ai>` を付与
- **プッシュはしない**

## プロジェクトスキル（`.claude/skills/`）
| スキル | 用途 |
|---|---|
| `yse-live-verification` | 実動画での検証手順（拡張ロード / PoT / 広告 / SPA遷移 / トラック分類 / 検証スクリプト）。ブラウザ自動化ツール・CLI・システムツールの一覧もこちら |
| `playwright-cli` | 汎用ブラウザ操作CLI |

新しい知見が溜まったら該当スキルへ追記し、AGENTS.md を膨らませない。

## 既知の制約（概要）
- **PoT（Proof of Token）**: 拡張自身のfetchは `200 / 0バイト` になり得る。字幕は傍受が主経路（詳細はスキル）
- **Chrome 137+**: `--load-extension` は無効。`Extensions.loadUnpacked`（ブラウザレベルCDP）を使う（詳細はスキル）
- **ライブ配信・プレミア**: 検証対象外
