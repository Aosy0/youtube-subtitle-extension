#!/usr/bin/env node
// ============================================
// AI用文字数カウントツール
// ============================================

import { readFileSync } from 'fs';

function getVisualWidth(text) {
    let width = 0;
    for (const char of text) {
        const cp = char.codePointAt(0);
        if (
            cp <= 0x7F ||
            (cp >= 0xFF61 && cp <= 0xFF9F) ||
            /[ｦ-ﾟ]/.test(char)
        ) {
            width += 1;
        } else {
            width += 2;
        }
    }
    return width;
}

function getInfo(text) {
    return {
        text: text,
        graphemeCount: [...text].length,
        byteLength: Buffer.byteLength(text, 'utf8'),
        visualWidth: getVisualWidth(text),
        lineCount: (text.match(/\r\n|\r|\n/g) || []).length + 1,
        spaceCount: (text.match(/\s/g) || []).length,
        halfWidthCount: [...text].filter(c => getVisualWidth(c) === 1).length,
        fullWidthCount: [...text].filter(c => getVisualWidth(c) === 2).length,
    };
}

function formatInfo(info, jsonMode) {
    if (jsonMode) {
        return JSON.stringify(info, null, 2);
    }

    const lines = [
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        `対象文字列: ${info.text.slice(0, 100)}${info.text.length > 100 ? '...' : ''}`,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        `  文字数        : ${info.graphemeCount.toString().padStart(6)} 文字`,
        `  バイト数       : ${info.byteLength.toString().padStart(6)} bytes`,
        `  表示幅         : ${info.visualWidth.toString().padStart(6)}`,
        `  行数           : ${info.lineCount.toString().padStart(6)} 行`,
        `  空白文字数      : ${info.spaceCount.toString().padStart(6)}`,
        `  半角文字数      : ${info.halfWidthCount.toString().padStart(6)}`,
        `  全角文字数      : ${info.fullWidthCount.toString().padStart(6)}`,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ];
    return lines.join('\n');
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const flags = {
        json: false,
        file: null,
        help: false,
    };
    const positional = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--json' || arg === '-j') {
            flags.json = true;
        } else if (arg === '--file' || arg === '-f') {
            flags.file = args[++i] || null;
        } else if (arg === '--help' || arg === '-h') {
            flags.help = true;
        } else if (!arg.startsWith('-')) {
            positional.push(arg);
        }
    }
    return { flags, positional };
}

function showHelp() {
    console.log(`
使い方: node tools/charcount.js [オプション] [文字列...]

オプション:
  -j, --json         JSON形式で出力
  -f, --file <path>  ファイルから読み込んでカウント
  -h, --help         このヘルプを表示

使用例:
  # コマンドライン引数として渡す
  node tools/charcount.js "こんにちは世界"

  # パイプで渡す
  echo "Hello世界" | node tools/charcount.js

  # ファイルを読み込む
  node tools/charcount.js -f README.md

  # JSON出力
  node tools/charcount.js -j "テスト文字列"
`);
}

// ============================================
// エントリーポイント
// ============================================
async function main() {
    const { flags, positional } = parseArgs(process.argv);

    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    let inputText = "";

    if (flags.file) {
        try {
            inputText = readFileSync(flags.file, 'utf8');
        } catch (e) {
            console.error(`ファイル読み込みエラー: ${flags.file}`);
            console.error(e.message);
            process.exit(1);
        }
    } else if (positional.length > 0) {
        inputText = positional.join(" ");
    } else if (!process.stdin.isTTY) {
        const chunks = [];
        for await (const chunk of process.stdin) {
            chunks.push(chunk);
        }
        inputText = Buffer.concat(chunks).toString('utf8');
    }

    inputText = inputText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    if (!inputText) {
        console.error("エラー: カウントする文字列が指定されていません。");
        console.error("ヘルプを表示: node tools/charcount.js --help");
        process.exit(1);
    }

    const info = getInfo(inputText);
    console.log(formatInfo(info, flags.json));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
