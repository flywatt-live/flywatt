import { defineConfig, type Plugin } from 'vite';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Dev-only: the /?og=1 capture page POSTs its renders here and they land in public/.
function savePlugin(): Plugin {
  return {
    name: 'flywatt-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const { name, dataUrl } = JSON.parse(body) as { name: string; dataUrl: string };
            if (!/^[a-z0-9.-]+\.(png|jpg)$/.test(name)) throw new Error('bad name');
            const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
            writeFileSync(join('public', name), bytes);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, bytes: bytes.length }));
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

// FLYWATT is deployed at the root of flywatt.live (Hostinger static hosting).
export default defineConfig({
  base: '/',
  plugins: [savePlugin()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          motion: ['gsap', 'gsap/ScrollTrigger', 'lenis'],
        },
      },
    },
  },
  server: { port: 5173 },
});
