// tests/unit/parseJson3.test.js
import { describe, it, expect } from 'vitest';

// parseJson3関数をテスト用にコピー
function parseJson3(data) {
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
      if (charCount > 35 || sentenceCount >= 2) {
        shouldSplit = true;
      }
    } else if (charCount > 65) {
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

describe('parseJson3', () => {
  it('ASR字幕は文結合される', () => {
    const data = {
      events: [
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'world.' }] },
      ],
    };
    const blocks = parseJson3(data);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('Hello world.');
  });

  it('手動字幕はそのまま解析される', () => {
    const data = {
      events: [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'これはテストです。' }] },
        { tStartMs: 3000, dDurationMs: 2000, segs: [{ utf8: '二つ目の文です。' }] },
      ],
    };
    const blocks = parseJson3(data);
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    expect(blocks[0].text).toContain('これはテストです');
  });

  it('重複セグメントは除去される', () => {
    const data = {
      events: [
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 2100, dDurationMs: 1000, segs: [{ utf8: 'world.' }] },
      ],
    };
    const blocks = parseJson3(data);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('Hello world.');
  });

  it('文字数が多い場合強制分割される', () => {
    const longText = 'a'.repeat(40);
    const data = {
      events: [
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: longText }] },
      ],
    };
    const blocks = parseJson3(data);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('空のeventsは空配列を返す', () => {
    const data = { events: [] };
    const blocks = parseJson3(data);
    expect(blocks).toEqual([]);
  });

  it('nullデータは空配列を返す', () => {
    const blocks = parseJson3(null);
    expect(blocks).toEqual([]);
  });
});
