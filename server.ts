/**
 * Minimal static server for the built SwingSpeed app (dist/).
 *
 * Runs unchanged on both runtimes:
 *   bun server.ts
 *   node server.ts        (Node ≥ 22.18 / 23.6 strips TypeScript types natively)
 *
 * Env: PORT (default 8080), HOST (default 0.0.0.0).
 *
 * No video ever reaches this server — it only serves HTML/JS/CSS. All video
 * processing happens in the browser.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono, type MiddlewareHandler } from 'hono';

type ServeStatic = (options: { root?: string; path?: string }) => MiddlewareHandler;
interface BunLike {
  serve(options: { fetch: (req: Request) => Response | Promise<Response>; port: number; hostname: string }): unknown;
}

const bun = (globalThis as { Bun?: BunLike }).Bun;
const port = Number(process.env.PORT ?? 8080);
const hostname = process.env.HOST ?? '0.0.0.0';

// Resolve dist/ next to this file, so the server works from any working directory.
const root = fileURLToPath(new URL('./dist', import.meta.url));
if (!existsSync(join(root, 'index.html'))) {
  console.error(`No build found at ${root}. Run "npm run build" first.`);
  process.exit(1);
}

const { serveStatic } = (bun ? await import('hono/bun') : await import('@hono/node-server/serve-static')) as { serveStatic: ServeStatic };

const app = new Hono();

app.use('*', async (c, next) => {
  // Set before next() so handlers merge them into their responses on every runtime.
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Vite emits content-hashed filenames under /assets, so they can be cached forever.
  if (c.req.path.startsWith('/assets/')) c.header('Cache-Control', 'public, max-age=31536000, immutable');
  else c.header('Cache-Control', 'no-cache');
  await next();
});

app.get('/healthz', (c) => c.text('ok'));
app.use('/*', serveStatic({ root }));
// SPA fallback for app routes; missing files (anything with an extension) stay 404.
app.get(
  '*',
  async (c, next) => (/\.[a-z0-9]+$/i.test(c.req.path) ? c.notFound() : next()),
  serveStatic({ root, path: 'index.html' }),
);

if (bun) {
  bun.serve({ fetch: app.fetch, port, hostname });
} else {
  const { serve } = await import('@hono/node-server');
  serve({ fetch: app.fetch, port, hostname });
}

console.log(`SwingSpeed running on ${bun ? 'Bun' : `Node ${process.versions.node}`} → http://localhost:${port}`);
