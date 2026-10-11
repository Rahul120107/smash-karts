import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)), plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true, proxy: { '/ws': { target: 'ws://127.0.0.1:3001', ws: true }, '/health': 'http://127.0.0.1:3001' } },
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { output: { manualChunks: { three: ['three'], react: ['react', 'react-dom'] } } } },
});
