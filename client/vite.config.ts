import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { websocketUrl } from './src/networking/url.js';

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('..', import.meta.url));
  const env = { ...loadEnv(mode, envDir, ''), ...process.env };
  if (env.RENDER === 'true' && !env.VITE_SERVER_URL?.trim() && !env.VITE_WS_URL?.trim()) throw new Error('Set VITE_SERVER_URL to the public Render backend URL before building.');
  if (env.VITE_SERVER_URL?.trim() || env.VITE_WS_URL?.trim()) websocketUrl({ protocol: env.RENDER === 'true' ? 'https:' : 'http:', host: 'localhost' }, env.VITE_SERVER_URL, env.VITE_WS_URL);
  const localBackend = `http://127.0.0.1:${env.PORT || '3001'}`;
  return {
  envDir,
  root: fileURLToPath(new URL('.', import.meta.url)), plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true, proxy: { '/ws': { target: localBackend, ws: true }, '/health': localBackend } },
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { output: { manualChunks: { three: ['three'], react: ['react', 'react-dom'] } } } },
  };
});
