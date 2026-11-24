// BudouX の日本語モデルだけを content script 用の IIFE にバンドルする。
// 拡張本体はこの生成物（vendor/budoux.js）を同梱して読み込むため、利用時にビルドは不要。
import { build } from 'esbuild';
import { resolve } from 'node:path';

await build({
  stdin: {
    contents: `
      import { Parser, jaModel } from 'budoux';
      const parser = new Parser(jaModel);
      window.BudouX = {
        parse: (text) => parser.parse(String(text || '')),
        parseBoundaries: (text) => parser.parseBoundaries(String(text || '')),
      };
    `,
    resolveDir: process.cwd(),
    sourcefile: 'budoux-entry.js',
    loader: 'js',
  },
  bundle: true,
  format: 'iife',
  minify: true,
  legalComments: 'inline',
  outfile: resolve('vendor/budoux.js'),
  banner: {
    js: [
      '/*!',
      ' * BudouX (https://github.com/google/budoux)',
      ' * Copyright 2021 Google LLC',
      ' * Licensed under the Apache License, Version 2.0.',
      ' * Bundled for YouTube Subtitle Enhancer. See vendor/LICENSE-budoux.txt.',
      ' */',
    ].join('\n'),
  },
});
