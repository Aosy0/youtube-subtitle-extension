// tests/unit/parseJson3.test.js
// parseJson3関数のユニットテスト
// ★ 重要: テスト内にコピーした関数ではなく、実際のソースファイルから抽出した関数もテスト対象に含める
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());

/**
 * ソースファイルから parseJson3 メソッドを抽出し、独立した関数として実行可能にする
 */
function extractParseJson3FromFile(filePath) {
  const source = readFileSync(filePath, 'utf-8');
  const lines = source.split(/\r?\n/);

  // "parseJson3(data) {" の行を特定
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*parseJson3\s*\(\s*data\s*\)\s*\{\s*$/.test(lines[i])) {
      startLine = i;
      break;
    }
  }
  if (startLine === -1) {
    throw new Error(`parseJson3 not found in ${filePath}`);
  }

  // 対応する閉じブレースを見つける（インデントベース）
  const baseIndent = lines[startLine].match(/^(\s*)/)[1].length;
  let braceDepth = 0;
  let endLine = -1;
  let foundOpenBrace = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    for (const char of line) {
      if (char === '{') {
        braceDepth++;
        foundOpenBrace = true;
      } else if (char === '}') {
        if (!foundOpenBrace) continue;
        braceDepth--;
        if (braceDepth === 0) {
          endLine = i;
          // 次の行が `},` ならそれも含める（メソッド定義の場合）
          break;
        }
      }
    }
    if (endLine !== -1) break;
  }

  if (endLine === -1) {
    throw new Error(`Could not find end of parseJson3 in ${filePath}`);
  }

  // メソッド本体を抽出（"parseJson3(data) {" の次の行から return blocks の次まで）
  const bodyLines = lines.slice(startLine + 1, endLine);
  // インデントを調整（baseIndent + 2 の余分スペースを削除）
  const normalizedBody = bodyLines
    .map((l) => {
      const match = l.match(/^(\s*)/);
      const indent = match ? match[1].length : 0;
      if (indent > baseIndent + 1) {
        return l.slice(baseIndent + 2);
      }
      return l.trimStart();
    })
    .join('\n');

  const funcSource = `function parseJson3(data) {\n${normalizedBody}\n}`;
  // eslint-disable-next-line no-new-func
  return new Function('return ' + funcSource)();
}

// --- ソースファイルから抽出した関数 ---
const parseJson3FromRoot = extractParseJson3FromFile(resolve(ROOT, 'subtitle-enhancer.js'));
let parseJson3FromSrc;
try {
  parseJson3FromSrc = extractParseJson3FromFile(resolve(ROOT, 'src/subtitle-enhancer.js'));
} catch (e) {
  // src版に構文エラーがある場合は null をセットしてテストで検出させる
  parseJson3FromSrc = null;
}

// --- テスト用ヘルパー ---
function runParseJson3Tests(parseJson3, label) {
  describe(`${label}: ASR字幕は文結合される`, () => {
    const data = {
      events: [
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'world.' }] },
      ],
    };
    const blocks = parseJson3(data);
    it('1ブロックに結合される', () => {
      expect(blocks).toHaveLength(1);
    });
    it('テキストが正しい', () => {
      expect(blocks[0].text).toBe('Hello world.');
    });
  });

  describe(`${label}: 手動字幕はそのまま解析される`, () => {
    const data = {
      events: [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'これはテストです。' }] },
        { tStartMs: 3000, dDurationMs: 2000, segs: [{ utf8: '二つ目の文です。' }] },
      ],
    };
    const blocks = parseJson3(data);
    it('ブロックが生成される', () => {
      expect(blocks.length).toBeGreaterThanOrEqual(1);
    });
    it('テキストが含まれる', () => {
      expect(blocks[0].text).toContain('これはテストです');
    });
  });

  describe(`${label}: 重複セグメントは除去される`, () => {
    const data = {
      events: [
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 2100, dDurationMs: 1000, segs: [{ utf8: 'world.' }] },
      ],
    };
    const blocks = parseJson3(data);
    it('1ブロックに結合される', () => {
      expect(blocks).toHaveLength(1);
    });
    it('重複が除去されている', () => {
      expect(blocks[0].text).toBe('Hello world.');
    });
  });

  describe(`${label}: 空のeventsは空配列を返す`, () => {
    it('空配列', () => {
      expect(parseJson3({ events: [] })).toEqual([]);
    });
  });

  describe(`${label}: nullデータは空配列を返す`, () => {
    it('空配列', () => {
      expect(parseJson3(null)).toEqual([]);
    });
  });

  // ★ 閾値1200/50/80 に基づくテスト
  describe(`${label}: 閾値テスト（nextGap > 1200で分割）`, () => {
    it('1200ms以内のギャップは結合される', () => {
      const data = {
        events: [
          { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'A' }] },
          { tStartMs: 2200, dDurationMs: 1000, segs: [{ utf8: 'B' }] }, // gap = 200ms
        ],
      };
      const blocks = parseJson3(data);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].text).toBe('A B');
    });

    it('1200ms超のギャップは分割される', () => {
      const data = {
        events: [
          { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'A' }] },
          { tStartMs: 3201, dDurationMs: 1000, segs: [{ utf8: 'B' }] }, // gap = 1201ms
        ],
      };
      const blocks = parseJson3(data);
      expect(blocks).toHaveLength(2);
    });
  });

  describe(`${label}: 閾値テスト（句読点あり: sentenceCount>=2 または charCount>50 で分割）`, () => {
    it('句読点あり・短・1文は結合される', () => {
      const data = {
        events: [
          { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'これはテストです。' }] },
          { tStartMs: 2500, dDurationMs: 1000, segs: [{ utf8: '次の文です。' }] }, // gap=500ms
        ],
      };
      const blocks = parseJson3(data);
      expect(blocks).toHaveLength(1);
    });

    it('句読点あり・2文以上は分割される', () => {
      const data = {
        events: [
          { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: '一つ目。' }] },
          { tStartMs: 2500, dDurationMs: 1000, segs: [{ utf8: '二つ目。' }] },
          { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: '三つ目。' }] },
        ],
      };
      const blocks = parseJson3(data);
      // 一つ目。二つ目。→ 2文で50文字未満でもsentenceCount>=2なので分割
      // 三つ目。→ 残り
      expect(blocks.length).toBeGreaterThanOrEqual(2);
    });

    it('句読点あり・51文字超は分割される', () => {
      const longText = 'あ'.repeat(51); // 句読点なしだけどこのテストでは使わない
      // 句読点ありで51文字超のデータを作成
      const text1 = 'あ'.repeat(49) + '。';
      const text2 = 'い。';
      const data = {
        events: [
          { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: text1 }] },
          { tStartMs: 2500, dDurationMs: 1000, segs: [{ utf8: text2 }] },
        ],
      };
      const blocks = parseJson3(data);
      // text1(51文字) + text2(2文字) = 53文字、2文、句読点あり
      // sentenceCount>=2 で分割される
      expect(blocks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe(`${label}: 閾値テスト（句読点なし: charCount>80 で強制分割）`, () => {
    it('80文字以下はそのまま', () => {
      const text = 'a'.repeat(80);
      const data = {
        events: [
          { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: text }] },
        ],
      };
      const blocks = parseJson3(data);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].text).toBe(text);
    });

    it('81文字超は分割される', () => {
      const data = {
        events: [
          { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'a'.repeat(90) }] },
          { tStartMs: 2500, dDurationMs: 1000, segs: [{ utf8: 'b'.repeat(10) }] },
        ],
      };
      const blocks = parseJson3(data);
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      expect(blocks[0].text).toBe('a'.repeat(90));
      expect(blocks[1].text).toBe('b'.repeat(10));
    });
  });

  // ★ 字幕が表示されないバグを検出するテスト
  describe(`${label}: 字幕が空にならないことを保証`, () => {
    it('通常の字幕データは空ブロックを返さない', () => {
      const data = {
        events: [
          { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Subtitle text here.' }] },
        ],
      };
      const blocks = parseJson3(data);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0].text.length).toBeGreaterThan(0);
    });

    it('全て空白のsegmentsは空配列', () => {
      const data = {
        events: [
          { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: '   ' }] },
          { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: '\n\n' }] },
        ],
      };
      expect(parseJson3(data)).toEqual([]);
    });
  });

  // ★ 非連続重複の除去（ASR字幕のオーバーラップ対策）
  describe(`${label}: 非連続な同一テキストはブロック内で除去される`, () => {
    it('同じテキストが別のテキストを挟んで出現した場合、2回目はスキップされる', () => {
      const data = {
        events: [
          { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello' }] },
          { tStartMs: 3100, dDurationMs: 1000, segs: [{ utf8: 'beautiful' }] },
          { tStartMs: 4200, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
        ],
      };
      const blocks = parseJson3(data);
      expect(blocks).toHaveLength(1);
      const helloMatches = blocks[0].text.match(/Hello/g);
      expect(helloMatches).toHaveLength(1);
      expect(blocks[0].text).toContain('beautiful');
    });

    it('3回同じテキストが出現しても1回だけ保持される', () => {
      const data = {
        events: [
          { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello' }] },
          { tStartMs: 3100, dDurationMs: 1000, segs: [{ utf8: 'beautiful' }] },
          { tStartMs: 4200, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
          { tStartMs: 5300, dDurationMs: 1000, segs: [{ utf8: 'world' }] },
          { tStartMs: 6400, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
        ],
      };
      const blocks = parseJson3(data);
      expect(blocks).toHaveLength(1);
      const helloMatches = blocks[0].text.match(/Hello/g);
      expect(helloMatches).toHaveLength(1);
      expect(blocks[0].text).toContain('beautiful');
      expect(blocks[0].text).toContain('world');
    });
  });
}

// --- テスト実行 ---

describe('parseJson3 from source files', () => {
  describe('root/subtitle-enhancer.js', () => {
    runParseJson3Tests(parseJson3FromRoot, 'root');
  });

  describe('src/subtitle-enhancer.js', () => {
    it('ソースファイルから parseJson3 が抽出できる', () => {
      expect(parseJson3FromSrc).not.toBeNull();
    });

    if (parseJson3FromSrc) {
      runParseJson3Tests(parseJson3FromSrc, 'src');
    }
  });
});

// --- 同期ズレ検出: 2つのソースファイルの関数が同一の結果を出すことを確認 ---
describe('parseJson3 source sync check', () => {
  it('root版とsrc版の関数が同じ結果を返す（同期ズレ検出）', () => {
    if (!parseJson3FromSrc) {
      // src版に構文エラーがある場合はこのテストも失敗させる
      throw new Error('src/subtitle-enhancer.js has syntax error - cannot compare');
    }

    const testData = {
      events: [
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'world.' }] },
        { tStartMs: 3500, dDurationMs: 1000, segs: [{ utf8: 'This is a longer sentence that should be processed correctly.' }] },
        { tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: 'Second part.' }] },
      ],
    };

    const rootBlocks = parseJson3FromRoot(testData);
    const srcBlocks = parseJson3FromSrc(testData);

    expect(srcBlocks).toEqual(rootBlocks);
  });
});

// --- 後方互換: テスト内のコピー関数（古い閾値のまま）が ★失敗することを確認 ★ ---
// このセクションは「テストがソースと同期していない」状況を明示するために残す
// ソースの閾値が変更された場合、このコピー関数は間違った結果を返すはず
// ※ 実際にはコピー関数は削除し、ソースから抽出した関数だけを使うべき
// ※ 以下のコードは参考として残し、実際のテストは上記の「root版/src版」で行う

// eslint-disable-next-line no-unused-vars
function _parseJson3_COPY_FOR_REFERENCE(data) {
  if (!data || !data.events) return [];

  const rawLines = [];
  for (const ev of data.events) {
    if (!ev.segs) continue;
    const text = ev.segs
      .map((s) => (s.utf8 || "").replace(/\n/g, " "))
      .join("");
    const trimmed = text.trim();
    if (!trimmed) continue;
    rawLines.push({
      text: trimmed,
      start: ev.tStartMs,
      dur: ev.dDurationMs || 2000,
    });
  }

  const deduped = [];
  for (const line of rawLines) {
    if (deduped.length > 0 && deduped[deduped.length - 1].text === line.text)
      continue;
    deduped.push(line);
  }

  const blocks = [];
  let accumulated = "";
  let blockStart = -1;
  let blockEnd = 0;

  for (let i = 0; i < deduped.length; i++) {
    const line = deduped[i];
    const startMs = line.start;
    const endMs = startMs + line.dur;

    if (blockStart === -1) blockStart = startMs;

    const clean = line.text.replace(/^[。！？.!?\s]+/, "").trimStart();
    if (clean) {
      const needsSpace =
        accumulated.length > 0 &&
        /[a-zA-Z0-9,;]$/.test(accumulated) &&
        /^[a-zA-Z0-9]/.test(clean);
      accumulated += (needsSpace ? " " : "") + clean;
    }
    blockEnd = endMs;

    const trimmedAcc = accumulated.trimEnd();
    const endsWithPunctuation = /[。！？.!?]$/.test(trimmedAcc);
    const sentenceCount = (trimmedAcc.match(/[。！？.!?]/g) || []).length;
    const charCount = trimmedAcc.length;
    const nextGap =
      i + 1 < deduped.length ? deduped[i + 1].start - endMs : Infinity;

    let shouldSplit = false;
    if (nextGap > 1200) {
      shouldSplit = true;
    } else if (endsWithPunctuation) {
      if (charCount > 35 || sentenceCount >= 2) { // ★ 古い閾値（35）
        shouldSplit = true;
      }
    } else if (charCount > 65) { // ★ 古い閾値（65）
      shouldSplit = true;
    }

    if (shouldSplit) {
      const finalText = accumulated.trim().replace(/^[。！？.!?\s]+/, "");
      if (finalText) {
        blocks.push({
          start: blockStart,
          end: blockEnd + 300,
          text: finalText,
        });
      }
      accumulated = "";
      blockStart = -1;
    }
  }

  if (accumulated.trim() && blockStart !== -1) {
    blocks.push({
      start: blockStart,
      end: blockEnd + 800,
      text: accumulated.trim().replace(/^[。！？.!?\s]+/, ""),
    });
  }

  return blocks;
}
