import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    // Run with `ANALYZE=true npm run build` to generate `dist/stats.html`
    visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  build: {
    lib: {
      entry: './src/index.ts',
      name: 'ScriptureCite',
      fileName: 'scripture-cite',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
      },
    },
    minify: 'esbuild',
    sourcemap: true,
    target: 'es2020',
  },
});
