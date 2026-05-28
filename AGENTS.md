# AGENTS.md

## プロジェクト概要
作業前に`README.md`を読み込んでください。

## アーキテクチャ
- **2つの実行ワールド**（manifest.json参照）
  - `bridge.js` → MAIN world, `document_start`（PoTトークン付与・fetchプロキシ）
  - 他すべて → ISOLATED world, `document_end`
- **ISOLATED worldロード順が重要**: `yse-common.js` が最初にロードされる必要がある（Settings, Logger, LogPanel, CONFIG, safeSetInnerHTML を提供）
- 各モジュールは `window.*` でグローバル公開する形式

## 開発コマンド
```bash
npm test            # vitest (tests/unit/**/*.test.js)
npm run test:watch  # 監視モード
```

## 重要な注意点
- **ビルド不要**: `chrome://extensions/` で直接読み込む（rootのJS/CSSを直接参照）
- 拡張機能ソースは**root直下の.jsファイル**
- `package.json` の依存（stagehand, dotenv, zod）はテスト/自動化用。拡張機能本体には不要
- アイコンは `icons/` に配置

## テスト
- ユニット: `tests/unit/**/*.test.js`（jsdom環境）— 現在58件すべてパス
- E2E: `tests/e2e/full/`（Playwright）— 未作成

### 拡張機能の実機確認方法

Playwrightで`--load-extension`フラグを使うのが最も確実:
```js
const context = await chromium.launchPersistentContext('./tmp-profile', {
  headless: false,
  args: [
    '--disable-extensions-except=' + extPath,
    '--load-extension=' + extPath,
  ],
});
```

### 既知の制限・課題
- **Chrome DevTools MCP** ではcontent_scriptsが注入されない（CDP接続の制限）。拡張機能の実機確認には使えない。
- **YouTube timedtext API** がPoT（Proof of Token）トークンを要求するようになった。拡張機能からのfetchはHTTP 200・0bytesで空レスポンスが返る。現在は `startDomWatch()`（YouTubeのcaption window DOM監視フォールバック）で字幕表示する設計だが、このパスの検証は未完了。
- ビルド（vite）と直接読み込み（chrome://extensions/）は別フロー。ビルド経由でないとmanifestの競合に注意。

## コミット
- バグ修正時は、バグが治ったことを確認してからコミットすること
- コミットメッセージは日本語で簡潔に作成すること

## ブラウザ操作ツール

### MCPサーバー（opencode.jsonc定義）

- **Chrome DevTools MCP（使用可能）**: `chrome-devtools_*` ツール。事前に `chrome.exe --remote-debugging-port=9224 [--load-extension=...]` でChromeを起動しておく。Service Workerの起動は確認できるがcontent scriptsが注入されない場合あり。
- **Browser MCP（未接続）**: `browsermcp_browser_*` ツール。opencode.jsoncに設定済みだが現在接続できていない。

### CLIツール

- **`npx playwright`** (1.59.1): E2Eテスト実行、ブラウザ自動化
- **`npx playwright-cli`** (0.1.13): 簡易ブラウザ操作CLI
- **`npx stagehand`** (3.2.1): AI駆動ブラウザ自動化（`@browserbasehq/stagehand`）
- **`browser-use`**: Python製AIブラウザエージェント（https://github.com/browser-use/browser-use）。未インストール、必要に応じて `pip install browser-use`
