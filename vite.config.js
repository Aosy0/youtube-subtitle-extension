import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json' assert { type: 'json' };

export default defineConfig({
  root: 'src',
  plugins: [crx({ manifest })],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          const info = name.split('.');
          const ext = info[info.length - 1];
          if (ext === 'css') {
            return 'styles/[name][extname]';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
  publicDir: '../public',
});
