// tests/unit/syntax-check.test.js
// すべての.jsファイルが構文的に正しいことを保証する
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd());

const EXCLUDE_PATTERNS = [
  'node_modules',
  'dist',
  '.git',
  'vite.config.js',
  'vitest.config.js',
];

function getJsFiles(dir = ROOT) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_PATTERNS.some(p => entry.includes(p))) continue;
    const fullPath = resolve(dir, entry);
    try {
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        files.push(...getJsFiles(fullPath));
      } else if (entry.endsWith('.js')) {
        files.push(fullPath);
      }
    } catch (_inaccessible) {
    }
  }
  return files;
}

describe('Syntax check for all JS files', () => {
  const jsFiles = getJsFiles();

  it('should find at least one JS file', () => {
    expect(jsFiles.length).toBeGreaterThan(0);
  });

  for (const file of jsFiles) {
    const relative = file.replace(ROOT + '/', '').replace(ROOT + '\\', '');
    it(`${relative} should have valid syntax`, () => {
      try {
        execSync(`node --check "${file}"`, { stdio: 'pipe', timeout: 5000 });
      } catch (err) {
        const stderr = err.stderr?.toString() || '';
        // ブラウザ用グローバル変数（window, documentなど）によるReferenceErrorは
        // node --check では構文エラーとして検出されないが、
        // SyntaxErrorは確実に検出される
        throw new Error(`Syntax error in ${relative}:\n${stderr}`);
      }
    });
  }
});
