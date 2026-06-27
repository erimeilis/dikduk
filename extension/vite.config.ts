import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        offscreen: 'offscreen.html',
        // Pull controller into the build graph so Vite emits the engine-worker chunk.
        // Task 10 will import SpellController from content.ts; this entry ensures
        // the worker URL reference is resolved in the meantime.
        controller: 'src/spellcheck/controller.ts',
      },
    },
  },
});
