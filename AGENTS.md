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
npm run typecheck   # tsc --noEmit（※src/対象のみ）
npm run build       # vite build → dist/
```

## 重要な注意点
- **ビルドと直接読み込みの使い分け**: `chrome://extensions/` で直接読み込む場合は**ビルド不要**（rootのJS/CSSを直接参照）。`npm run build` は `@crxjs/vite-plugin` 経由で `dist/` に出力する別フロー
- `vite.config.js` は `src/manifest.json` を参照しているが、実際のmanifestは**root直下**。ビルド時は `src/` 配下の構成が必要
- `tsconfig.json` は `src/` を対象としているが、実際のソースは**root直下の.jsファイル**。typecheckは現状 `src/` のみカバー
- `package.json` の依存（stagehand, dotenv, zod）はテスト/自動化用。拡張機能本体には不要
- アイコンは `icons/` に配置（`public/icons/` はビルド用ソース）

## テスト
- ユニット: `tests/unit/**/*.test.js`（jsdom環境）
- E2E: `tests/e2e/full/`（Playwright）

## コミット
- 適宜コミットしながら作業を進めること
- コミットメッセージは日本語で簡潔に作成すること
