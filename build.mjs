// Builds the four Nomo bundles into dist/ and copies static assets.
// Content scripts and the popup must be classic scripts (no ESM in MV3 content
// scripts), so everything except the service worker is emitted as IIFE.
import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

const shared = {
  bundle: true,
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  target: ['chrome116'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
};

const bundles = [
  { in: 'src/background/index.ts', out: 'dist/background.js', format: 'esm' },
  { in: 'src/content/probe.ts', out: 'dist/probe.js', format: 'iife' },
  { in: 'src/content/collector.ts', out: 'dist/collector.js', format: 'iife' },
  { in: 'src/popup/main.tsx', out: 'dist/popup/popup.js', format: 'iife' },
  { in: 'src/options/main.tsx', out: 'dist/options/options.js', format: 'iife' },
];

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });

const contexts = await Promise.all(
  bundles.map((b) =>
    esbuild.context({ ...shared, entryPoints: [b.in], outfile: b.out, format: b.format })
  )
);

if (watch) {
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('veyl: watching…');
} else {
  await Promise.all(contexts.map(async (c) => { await c.rebuild(); await c.dispose(); }));
  console.log('veyl: built dist/');
}
