// tests/unit/parseJson3.test.js
import { describe, it, expect } from 'vitest';
import { SubtitleEnhancer } from '../../src/modules/subtitle-enhancer.js';

describe('parseJson3', () => {
  it('ASR字幕は文結合されて1.5秒シフトされる', () => {
    const data = {
      events: [
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'world.' }] },
      ],
    };
    const blocks = SubtitleEnhancer.parseJson3(data, -1500, false);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('Hello world.');
    expect(blocks[0].start).toBe(-500); // 1000 - 1500
  });

  it('手動字幕はシフト0msでそのまま表示', () => {
    const data = {
      events: [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'これはテストです。' }] },
        { tStartMs: 3000, dDurationMs: 2000, segs: [{ utf8: '二つ目の文です。' }] },
      ],
    };
    const blocks = SubtitleEnhancer.parseJson3(data, 0, false);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].start).toBe(1000);
    expect(blocks[0].text).toBe('これはテストです。');
  });

  it('特殊字幕は文結合をスキップする', () => {
    const data = {
      wpWinPositions: [{ id: 1 }],
      events: [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Styled 1' }], wWinId: 0 },
        { tStartMs: 3000, dDurationMs: 2000, segs: [{ utf8: 'Styled 2' }], wWinId: 0 },
      ],
    };
    const blocks = SubtitleEnhancer.parseJson3(data, 0, true);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toBe('Styled 1');
    expect(blocks[1].text).toBe('Styled 2');
  });

  it('重複セグメントは除去される', () => {
    const data = {
      events: [
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'Hello' }] },
        { tStartMs: 2100, dDurationMs: 1000, segs: [{ utf8: 'world.' }] },
      ],
    };
    const blocks = SubtitleEnhancer.parseJson3(data, 0, false);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('Hello world.');
  });

  it('文字数35文字超で強制分割される', () => {
    const longText = 'a'.repeat(40);
    const data = {
      events: [
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: longText }] },
      ],
    };
    const blocks = SubtitleEnhancer.parseJson3(data, 0, false);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].text.length).toBeLessThanOrEqual(40);
  });
});
