# YouTube Subtitle Enhancer - Chrome Extension

YouTubeの字幕表示を改善するChrome拡張機能です。

TampermonkeyスクリプトからChrome拡張機能に移行しました。

## 主な機能

### 1. **文単位表示**
- 自動生成字幕の1文字ずつの表示を、文単位の表示に改善
- 自然な読みやすさを実現

### 2. **高度なカスタマイズ**
- フォントファミリー・サイズ・色の自由な設定
- 背景色・透明度の調整
- 字幕位置（上部/下部/カスタム）の変更
- 行数制限

### 3. **日本語字幕優先**
- 日本語字幕があれば自動で選択
- 日本語字幕がない場合は自動翻訳を使用（YouTube標準機能）
- フォールバック言語の設定可能

### 4. **使いやすい設定パネル**
- **Alt + S** キーで設定パネルを瞬時に表示
- ブラウザアイコンクリックでクイック設定
- リアルタイムプレビュー

## インストール方法

### 方法1: 開発者モードで読み込む（推奨）

1. Chromeを開き、アドレスバーに `chrome://extensions/` と入力
2. 右上の「**デベロッパー モード**」をオンにする
3. 「**パッケージ化されていない拡張機能を読み込む**」をクリック
4. `youtube-subtitle-extension` フォルダを選択
5. YouTubeを開いて動作を確認

### 方法2: ZIPファイルとして読み込む

1. `youtube-subtitle-extension` フォルダをZIP圧縮
2. Chromeの `chrome://extensions/` を開く
3. デベロッパーモードをオンにする
4. ZIPファイルをページにドラッグ＆ドロップ

## ファイル構成

```
youtube-subtitle-extension/
├── manifest.json          # 拡張機能の設定（Manifest V3）
├── content.js             # メインスクリプト
├── styles.css             # スタイルシート
├── player-controller.js   # YouTubeプレーヤー制御
├── subtitle-enhancer.js   # 字幕表示改善
├── youtube-settings.js    # YouTube設定メニュー統合
├── ui-controller.js       # 設定パネルUI
├── popup/
│   ├── popup.html         # ポップアップUI
│   ├── popup.css          # ポップアップスタイル
│   └── popup.js           # ポップアップロジック
├── icons/
│   ├── icon.svg           # アイコンSVG（ソース）
│   ├── icon16.png         # 16x16 アイコン
│   ├── icon48.png         # 48x48 アイコン
│   └── icon128.png        # 128x128 アイコン
└── README.md              # このファイル
```

## 使い方

### 基本動作
1. YouTube動画ページを開くと自動的に動作
2. 日本語字幕が優先的に選択される
3. ない場合は自動翻訳が有効化される

### 設定パネルの操作
- **Alt + S**: 設定パネルを開く/閉じる
- **Ctrl + Shift + L**: ログパネルを開く
- **ブラウザアイコン**: クイック設定を開く

### YouTube設定メニュー
- YouTubeプレーヤーの設定メニューに「字幕設定（拡張）」項目が追加される
- 通常の字幕設定と同じUIでアクセス可能

### 設定項目

#### 言語設定
| 設定項目 | 説明 | デフォルト |
|---------|------|----------|
| 優先言語 | 最優先で使用する言語コード | `ja` |
| フォールバック言語 | 優先言語がない場合の代替 | `en` |
| 自動翻訳 | 字幕がない場合に自動翻訳を使用 | 有効 |

#### 表示設定
| 設定項目 | 説明 | デフォルト |
|---------|------|----------|
| 文単位表示 | 自動生成字幕を文単位に改善 | 有効 |
| フォントサイズ | 字幕の文字サイズ(px) | 24 |
| フォントファミリー | 使用するフォント | Noto Sans JP等 |
| フォントカラー | 文字色 | #ffffff |
| 背景色 | 背景のRGBA色 | rgba(0,0,0,0.75) |
| 字幕位置 | 表示位置(bottom/top/custom) | bottom |
| 最大行数 | 表示する最大行数 | 2 |

## 技術的な詳細

### アーキテクチャ
- **Manifest Version 3**: 最新のChrome拡張機能API
- **モジュール分割**: 関心事ごとにファイルを分割
- **設定永続化**: `chrome.storage.local` APIを使用
- **YouTubeプレーヤー連携**: 内部APIを使用して字幕を制御

### Tampermonkeyからの変更点
| 機能 | Tampermonkey | Chrome Extension |
|-----|--------------|------------------|
| 設定保存 | `GM_setValue/GM_getValue` | `chrome.storage.local` |
| メニューコマンド | `GM_registerMenuCommand` | ポップアップ/キーボードショートカット |
| スタイル適用 | `GM_addStyle` | 外部CSSファイル |
| スクリプト実行 | `@run-at document-end` | `content_scripts` |

### パーミッション
- `storage`: 設定の保存/読み込み
- `activeTab`: 現在のタブへのメッセージ送信（ポップアップから）

## トラブルシューティング

### 拡張機能が読み込めない
1. manifest.jsonの構文が正しいか確認
2. すべてのファイルが正しい場所にあるか確認
3. Chromeのコンソールでエラーを確認

### 字幕が表示されない
1. YouTubeの設定で字幕が有効になっているか確認
2. ページをリフレッシュ
3. ブラウザのコンソールでエラーを確認（F12 → Console）

### 自動翻訳が機能しない
- 動画に字幕トラックが存在する必要があります
- 自動生成字幕でも翻訳可能です

### スタイルが反映されない
- 設定パネルで変更後、動画を少し再生し直すと反映されます
- YouTubeの元の字幕スタイルと競合する場合があります

## 開発

### ローカル開発
```bash
# リポジトリのクローン
git clone <repository-url>
cd youtube-subtitle-extension

# Chromeで読み込み
# chrome://extensions/ → デベロッパーモードON → パッケージ化されていない拡張機能を読み込む
```

### ビルド（必要に応じて）
```bash
# アイコンの生成（ImageMagickを使用）
convert icons/icon.svg -resize 16x16 icons/icon16.png
convert icons/icon.svg -resize 48x48 icons/icon48.png
convert icons/icon.svg -resize 128x128 icons/icon128.png
```

## ライセンス

MIT License

## 更新履歴

### v1.0.1 (2026-03-22)
- Chrome拡張機能としてパッケージング
- Manifest V3対応
- ポップアップUI追加
- 設定保存をchrome.storageに移行

### v1.0.0 (2026-02-15)
- 初版リリース（Tampermonkey版）
- 文単位表示機能
- カスタマイズ可能な字幕スタイル
- 日本語字幕優先・自動翻訳対応
- 設定パネル実装
